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
import { DEVICES, type FollowUp } from "@dhruv/seed";
import { getEvent, insertEvent, listAllEvents, nextSeq } from "../db/events.js";
import { listConflicts, rebuildProjections } from "../db/projections.js";
import { seedStock } from "../db/seedData.js";
import { checkApproval, checkRejection, conflictFlag, entityOwner, ownerOf } from "./authorize.js";

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
  /** SYSTEM events the server emitted as a consequence (CONFLICT_FLAGGED, approval follow-ups). */
  emitted: OpEvent[];
}

export interface IngestOptions {
  /** Absent for trusted server-internal writes (Director, approval follow-ups). */
  identity?: Identity;
  demoMode: boolean;
}

interface Checked {
  event: OpEvent;
  /** Lever follow-ups to emit once a synced DECISION_APPROVED is stored. */
  followUps: FollowUp[];
}

function check(db: Database.Database, raw: unknown, identity: Identity | undefined, recordedAt: string, demoMode: boolean): Checked | Rejection {
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
  let followUps: FollowUp[] = [];
  if (!valid.ok) return { event_id: eventId, code: "INVALID_EVENT", message: valid.message };

  if (identity) {
    if (event.device_id !== identity.device_id) {
      return { event_id: eventId, code: "INVALID_EVENT", message: "event device_id does not match the authenticated device" };
    }
    // A caller writes as exactly the role in its token. SYSTEM events come only from the server
    // itself (emitServerEvent, Director beats), which call ingest without an identity.
    if (event.actor_role !== identity.role) {
      return { event_id: eventId, code: "ROLE_FORBIDDEN", message: `actor_role ${event.actor_role} does not match the logged-in role ${identity.role}` };
    }
    if (!EVENT_RULES[event.type].allowedRoles.includes(identity.role)) {
      return { event_id: eventId, code: "ROLE_FORBIDDEN", message: `${identity.role} may not write ${event.type}` };
    }
    if (identity.role !== "HQ_OPS" && event.node_id !== identity.node_id) {
      return { event_id: eventId, code: "NODE_FORBIDDEN", message: `${identity.role} may only write events for node ${identity.node_id}` };
    }

    // The node rule applies to the record being changed, not just the event's own node_id.
    const ownership = ownerOf(db, event);
    if ("unknown" in ownership) return { event_id: eventId, code: "NOT_FOUND", message: ownership.unknown };
    if (identity.role !== "HQ_OPS" && ownership.owner && ownership.owner !== identity.node_id) {
      return { event_id: eventId, code: "NODE_FORBIDDEN", message: `${event.type} targets a record owned by ${ownership.owner}` };
    }

    // Offline station-level decisions sync as events (section 9); they get the same rules as
    // POST /decisions/:id/approve and /reject, via the same validator.
    if (event.type === "DECISION_APPROVED" || event.type === "DECISION_REJECTED") {
      const p = event.payload as { decision_id: string; chosen_option_id: string; verify_ack: boolean; approver?: string };
      const checked =
        event.type === "DECISION_APPROVED"
          ? checkApproval(db, identity, { decision_id: p.decision_id, chosen_option_id: p.chosen_option_id, verify_ack: p.verify_ack, now: event.observed_at })
          : checkRejection(db, identity, p.decision_id, event.observed_at);
      if (!checked.ok) return { event_id: eventId, code: checked.code, message: checked.message };

      const decisionNode = "decision" in checked.value ? checked.value.decision.node_id : checked.value.node_id;
      if (event.node_id !== decisionNode) {
        return { event_id: eventId, code: "NODE_FORBIDDEN", message: `decision ${p.decision_id} belongs to ${decisionNode}` };
      }
      if (event.type === "DECISION_APPROVED" && p.approver !== identity.device_id) {
        return { event_id: eventId, code: "INVALID_EVENT", message: "approver must be the approving device's own id" };
      }
      if ("followUps" in checked.value) followUps = checked.value.followUps;
    }

    if (event.type === "CONFLICT_RESOLVED") {
      const p = event.payload as { conflict_id: string; resolver: string };
      if (conflictFlag(db, p.conflict_id)?.resolved) {
        return { event_id: eventId, code: "INVALID_EVENT", message: `conflict ${p.conflict_id} is already resolved` };
      }
      // The audit trail names the device that resolved it, so it must be the caller's own.
      if (p.resolver !== identity.device_id) {
        return { event_id: eventId, code: "INVALID_EVENT", message: "resolver must be the resolving device's own id" };
      }
    }
  }

  // Section 15 skew rule. Off in demo mode: demo time (Jan 2027) is far ahead of the server's real clock.
  if (!demoMode) {
    const limit = new Date(recordedAt).getTime() + config.sync.maxFutureSkewMinutes * 60_000;
    if (new Date(event.observed_at).getTime() > limit) {
      return { event_id: eventId, code: "INVALID_EVENT", message: "observed_at is too far in the future" };
    }
  }

  return { event, followUps };
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
  // The flag belongs to the entity's station, so that station can resolve it. An HQ contender's
  // node_id says nothing about who owns the asset, so prefer the seed, then a station's own write.
  const stationWrite = contenderEvents.filter((e) => e.actor_role !== "HQ_OPS").at(-1);
  const node = entityOwner(db, finding.entity_type, finding.entity_id) ?? stationWrite?.node_id ?? latest.node_id;
  return emitServerEvent(
    db,
    {
      type: "CONFLICT_FLAGGED",
      entity_type: finding.entity_type,
      entity_id: finding.entity_id,
      node_id: node,
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
      const checked = check(db, raw, options.identity, recordedAt, options.demoMode);
      if (!("event" in checked)) {
        result.rejected.push(checked);
        continue;
      }
      const outcome = insertEvent(db, checked.event, recordedAt);
      if (outcome === "accepted") {
        result.accepted.push({ ...checked.event, recorded_at_server: recordedAt });
        // An approval made offline and synced later has the same effect as POST /decisions/:id/approve.
        for (const f of checked.followUps) {
          const decisionId = (checked.event.payload as { decision_id: string }).decision_id;
          result.emitted.push(emitServerEvent(db, { ...f, observed_at: checked.event.observed_at, payload: { ...f.payload, decision_id: decisionId } }, recordedAt));
        }
      }
      else if (outcome === "duplicate") result.duplicates.push(checked.event.event_id);
      else result.rejected.push({ event_id: checked.event.event_id, code: "DUPLICATE_SEQ_CONFLICT", message: "same device and seq with different content" });
    }

    if (result.accepted.length > 0) {
      result.emitted.push(...flagConflicts(db, result.accepted, recordedAt));
      rebuildProjections(db);
    }
    return result;
  });
  return run();
}
