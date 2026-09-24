import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { compareEvents, type OpEvent } from "@dhruv/shared";

interface EventRow {
  event_id: string;
  device_id: string;
  seq: number;
  type: string;
  entity_type: string;
  entity_id: string;
  node_id: string;
  payload: string;
  observed_at: string;
  created_at_client: string;
  recorded_at_server: string | null;
  priority: number;
  actor_role: string;
  schema_version: number;
  server_cursor: number;
}

const COLUMNS = `event_id, device_id, seq, type, entity_type, entity_id, node_id, payload, observed_at,
  created_at_client, recorded_at_server, priority, actor_role, schema_version, server_cursor`;

function rowToEvent(row: EventRow): OpEvent {
  const event: OpEvent = {
    event_id: row.event_id,
    device_id: row.device_id,
    seq: row.seq,
    type: row.type as OpEvent["type"],
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    node_id: row.node_id,
    payload: JSON.parse(row.payload),
    observed_at: row.observed_at,
    created_at_client: row.created_at_client,
    priority: row.priority,
    actor_role: row.actor_role as OpEvent["actor_role"],
    schema_version: 1,
  };
  if (row.recorded_at_server) event.recorded_at_server = row.recorded_at_server;
  return event;
}

export type InsertOutcome = "accepted" | "duplicate" | "seq_conflict";

/**
 * Idempotency (section 6): (device_id, seq) is unique. Re-sending the identical event is a duplicate;
 * the same (device_id, seq) with a different event_id, or the same event_id at a different
 * (device_id, seq), is DUPLICATE_SEQ_CONFLICT. server_cursor is assigned monotonically on insert.
 */
export function insertEvent(db: Database.Database, event: OpEvent, recordedAtServer: string): InsertOutcome {
  const existing = db
    .prepare(`SELECT event_id, device_id, seq FROM events WHERE (device_id = ? AND seq = ?) OR event_id = ?`)
    .all(event.device_id, event.seq, event.event_id) as { event_id: string; device_id: string; seq: number }[];

  if (existing.length > 0) {
    const [only] = existing;
    const same = existing.length === 1 && only !== undefined && only.event_id === event.event_id && only.device_id === event.device_id && only.seq === event.seq;
    return same ? "duplicate" : "seq_conflict";
  }

  db.prepare(`
    INSERT INTO events (${COLUMNS})
    VALUES (@event_id, @device_id, @seq, @type, @entity_type, @entity_id, @node_id, @payload, @observed_at,
      @created_at_client, @recorded_at_server, @priority, @actor_role, @schema_version,
      (SELECT COALESCE(MAX(server_cursor), 0) + 1 FROM events))
  `).run({
    ...event,
    payload: JSON.stringify(event.payload),
    recorded_at_server: recordedAtServer,
  });
  return "accepted";
}

export function getEvent(db: Database.Database, eventId: string): OpEvent | null {
  const row = db.prepare(`SELECT ${COLUMNS} FROM events WHERE event_id = ?`).get(eventId) as EventRow | undefined;
  return row ? rowToEvent(row) : null;
}

/** All events in reduce order (observed_at, device_id, seq). */
export function listAllEvents(db: Database.Database): OpEvent[] {
  const rows = db.prepare(`SELECT ${COLUMNS} FROM events`).all() as EventRow[];
  return rows.map(rowToEvent).sort(compareEvents);
}

export function currentCursor(db: Database.Database): number {
  const row = db.prepare(`SELECT COALESCE(MAX(server_cursor), 0) AS cursor FROM events`).get() as { cursor: number };
  return row.cursor;
}

/**
 * GET /sync/pull (section 9): events from other devices after `since`, in server_cursor order.
 * When nothing from other devices is left, the cursor still advances past this device's own events.
 * A cursor ahead of the log can only come from before a Reset to Start (the log restarts at 1), so
 * the pull starts over; otherwise a client that kept its old cursor would miss every new event.
 */
export function pullSince(db: Database.Database, requestedSince: number, excludeDeviceId: string, limit: number): { events: OpEvent[]; cursor: number } {
  const since = requestedSince > currentCursor(db) ? 0 : requestedSince;
  const rows = db
    .prepare(`SELECT ${COLUMNS} FROM events WHERE server_cursor > ? AND device_id != ? ORDER BY server_cursor LIMIT ?`)
    .all(since, excludeDeviceId, limit) as EventRow[];

  const last = rows.at(-1);
  const cursor = rows.length === limit && last ? last.server_cursor : Math.max(since, currentCursor(db));
  return { events: rows.map(rowToEvent), cursor };
}

export interface AuditFilter {
  entity_id?: string;
  type?: string;
  from?: string;
  to?: string;
  limit: number;
}

/** GET /events audit list, newest first. */
export function listAudit(db: Database.Database, filter: AuditFilter): OpEvent[] {
  const where: string[] = [];
  const params: Record<string, unknown> = { limit: filter.limit };
  if (filter.entity_id) {
    where.push("entity_id = @entity_id");
    params.entity_id = filter.entity_id;
  }
  if (filter.type) {
    where.push("type = @type");
    params.type = filter.type;
  }
  if (filter.from) {
    where.push("observed_at >= @from");
    params.from = filter.from;
  }
  if (filter.to) {
    where.push("observed_at <= @to");
    params.to = filter.to;
  }
  const rows = db
    .prepare(`
      SELECT ${COLUMNS} FROM events
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY observed_at DESC, device_id DESC, seq DESC
      LIMIT @limit
    `)
    .all(params) as EventRow[];
  return rows.map(rowToEvent);
}

export function nextSeq(db: Database.Database, deviceId: string): number {
  const row = db.prepare(`SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM events WHERE device_id = ?`).get(deviceId) as { next: number };
  return row.next;
}

export function latestEventOf(db: Database.Database, type: string, entityId: string): OpEvent | null {
  const rows = db.prepare(`SELECT ${COLUMNS} FROM events WHERE type = ? AND entity_id = ?`).all(type, entityId) as EventRow[];
  const events = rows.map(rowToEvent).sort(compareEvents);
  return events.at(-1) ?? null;
}

/** Latest demo time the server has seen: the server has no demo clock (section 8). */
export function latestObservedAt(db: Database.Database): string | null {
  const row = db.prepare(`SELECT MAX(observed_at) AS latest FROM events`).get() as { latest: string | null };
  return row.latest;
}

/**
 * The log epoch: an id for this run of the event log, renewed on every Reset to Start. Devices
 * keep the epoch they loaded; a different one means their local store belongs to an earlier run.
 */
export function logEpoch(db: Database.Database): string {
  const row = db.prepare(`SELECT value FROM server_meta WHERE key = 'epoch'`).get() as { value: string } | undefined;
  if (row) return row.value;
  return renewEpoch(db);
}

export function renewEpoch(db: Database.Database): string {
  const epoch = randomUUID();
  db.prepare(`INSERT INTO server_meta (key, value) VALUES ('epoch', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`).run(epoch);
  return epoch;
}
