import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  config,
  detectConflicts,
  EVENT_RULES,
  opEventSchema,
  validateEvent,
  type ConflictFinding,
  type ErrorCode,
  type LoginRole,
  type OpEvent,
} from "@dhruv/shared";
import { DEVICES } from "@dhruv/seed";
import { getEvent, insertEvent, listAllEvents, nextSeq } from "../db/events.js";
import { listConflicts, rebuildProjections } from "../db/projections.js";
import { seedStock } from "../db/seedData.js";

export interface Identity {
  device_id: string;
  role: LoginRole;
  node_id: string;
}

export interface Rejection {
  event_id: string;
  code: ErrorCode;
  message: string;
}

export interface IngestResult {
  accepted: OpEvent[];
  duplicates: string[];
  rejected: Rejection[];
  recorded_at_server: string;
  /** SYSTEM events the server emitted as a consequence (CONFLICT_FLAGGED). */
  emitted: OpEvent[];
}

export interface IngestOptions {
  /** Absent for trusted server-internal writes (Director, approval follow-ups). */
  identity?: Identity;
  demoMode: boolean;
}

function check(raw: unknown, identity: Identity | undefined, recordedAt: string, demoMode: boolean): { event: OpEvent } | Rejection {
  const parsed = opEventSchema.safeParse(raw);
  const eventId = typeof (raw as { event_id?: unknown })?.event_id === "string" ? (raw as { event_id: string }).event_id : "unknown";
  if (!parsed.success) {
    return { event_id: eventId, code: "INVALID_EVENT", message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  const event = parsed.data;

  if (EVENT_RULES[event.type].localOnly) {
    return { event_id: eventId, code: "INVALID_EVENT", message: `${event.type} is local-only and never synced` };
  }
  const valid = validateEvent(event);
  if (!valid.ok) return { event_id: eventId, code: "INVALID_EVENT", message: valid.message };

  if (identity) {
    if (event.device_id !== identity.device_id) {
      return { event_id: eventId, code: "INVALID_EVENT", message: "event device_id does not match the authenticated device" };
    }
    if (event.actor_role !== identity.role && event.actor_role !== "SYSTEM") {
      return { event_id: eventId, code: "ROLE_FORBIDDEN", message: `actor_role ${event.actor_role} does not match the logged-in role` };
    }
    if (!EVENT_RULES[event.type].allowedRoles.includes(event.actor_role)) {
      return { event_id: eventId, code: "ROLE_FORBIDDEN", message: `${event.actor_role} may not write ${event.type}` };
    }
    if (identity.role !== "HQ_OPS" && event.node_id !== identity.node_id) {
      return { event_id: eventId, code: "NODE_FORBIDDEN", message: `${identity.role} may only write events for node ${identity.node_id}` };
    }
  }

  // Section 15 skew rule. Off in demo mode: demo time (Jan 2027) is far ahead of the server's real clock.
  if (!demoMode) {
    const limit = new Date(recordedAt).getTime() + config.sync.maxFutureSkewMinutes * 60_000;
    if (new Date(event.observed_at).getTime() > limit) {
      return { event_id: eventId, code: "INVALID_EVENT", message: "observed_at is too far in the future" };
    }
  }

  return { event };
}

function sameContenders(a: { event_id: string }[], b: { event_id: string }[]): boolean {
  const ids = new Set(a.map((c) => c.event_id));
  return a.length === b.length && b.every((c) => ids.has(c.event_id));
}

/** Writes a SYSTEM event from the server's own device, in its own seq space. */
export function emitServerEvent(
  db: Database.Database,
  draft: Pick<OpEvent, "type" | "entity_type" | "entity_id" | "node_id" | "payload" | "observed_at"> & Partial<Pick<OpEvent, "actor_role" | "priority" | "device_id">>,
  recordedAt: string,
): OpEvent {
  const deviceId = draft.device_id ?? DEVICES.SERVER;
  const event: OpEvent = {
    event_id: randomUUID(),
    device_id: deviceId,
    seq: nextSeq(db, deviceId),
    type: draft.type,
    entity_type: draft.entity_type,
    entity_id: draft.entity_id,
    node_id: draft.node_id,
    payload: draft.payload,
    observed_at: draft.observed_at,
    created_at_client: recordedAt,
    priority: draft.priority ?? EVENT_RULES[draft.type].defaultPriority,
    actor_role: draft.actor_role ?? "SYSTEM",
    schema_version: 1,
  };
  insertEvent(db, event, recordedAt);
  return { ...event, recorded_at_server: recordedAt };
}

function flagConflicts(db: Database.Database, accepted: OpEvent[], recordedAt: string): OpEvent[] {
  const findings = detectConflicts(listAllEvents(db), accepted, seedStock(db));
  if (findings.length === 0) return [];

  rebuildProjections(db);
  const open = listConflicts(db, "OPEN");
  const emitted: OpEvent[] = [];

  for (const finding of findings) {
    const existing = open.find((c) => c.entity_type === finding.entity_type && c.entity_id === finding.entity_id && c.field === finding.field);
    if (existing && sameContenders(existing.contenders, finding.contenders)) continue;
    emitted.push(emitConflictFlag(db, finding, existing?.id ?? randomUUID(), recordedAt));
  }
  return emitted;
}

function emitConflictFlag(db: Database.Database, finding: ConflictFinding, conflictId: string, recordedAt: string): OpEvent {
  const contenderEvents = finding.contenders.map((c) => getEvent(db, c.event_id)).filter((e): e is OpEvent => e !== null);
  const latest = contenderEvents.reduce((a, b) => (a.observed_at >= b.observed_at ? a : b));
  return emitServerEvent(
    db,
    {
      type: "CONFLICT_FLAGGED",
      entity_type: finding.entity_type,
      entity_id: finding.entity_id,
      node_id: latest.node_id,
      observed_at: latest.observed_at,
      payload: {
        conflict_id: conflictId,
        entity_type: finding.entity_type,
        entity_id: finding.entity_id,
        field: finding.field,
        contenders: finding.contenders,
        conservative_value: finding.conservative_value,
      },
    },
    recordedAt,
  );
}

/**
 * The single write path on the server: POST /sync/push, POST /events, Director beats and
 * decision follow-ups all go through here. Invalid events are rejected individually and
 * the rest of the batch is processed (section 15). The whole batch is one transaction.
 */
export function ingest(db: Database.Database, rawEvents: unknown[], options: IngestOptions): IngestResult {
  const recordedAt = new Date().toISOString();
  const run = db.transaction((): IngestResult => {
    const result: IngestResult = { accepted: [], duplicates: [], rejected: [], recorded_at_server: recordedAt, emitted: [] };

    for (const raw of rawEvents) {
      const checked = check(raw, options.identity, recordedAt, options.demoMode);
      if (!("event" in checked)) {
        result.rejected.push(checked);
        continue;
      }
      const outcome = insertEvent(db, checked.event, recordedAt);
      if (outcome === "accepted") result.accepted.push({ ...checked.event, recorded_at_server: recordedAt });
      else if (outcome === "duplicate") result.duplicates.push(checked.event.event_id);
      else result.rejected.push({ event_id: checked.event.event_id, code: "DUPLICATE_SEQ_CONFLICT", message: "same device and seq with different content" });
    }

    if (result.accepted.length > 0) {
      result.emitted = flagConflicts(db, result.accepted, recordedAt);
      rebuildProjections(db);
    }
    return result;
  });
  return run();
}
