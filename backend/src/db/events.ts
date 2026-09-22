import type Database from "better-sqlite3";
import type { EventEnvelope } from "@dhruv/shared";

export interface WriteEventResult {
  applied: boolean;
}

/**
 * Idempotent write: INSERT OR IGNORE on the (device_id, seq) primary key
 * means re-posting the same event is a no-op, not an error.
 */
export function writeEvent(db: Database.Database, event: EventEnvelope): WriteEventResult {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO events (device_id, seq, observed_at, priority, type, payload, received_at)
    VALUES (@device_id, @seq, @observed_at, @priority, @type, @payload, @received_at)
  `);

  const result = stmt.run({
    device_id: event.device_id,
    seq: event.seq,
    observed_at: event.observed_at,
    priority: event.priority,
    type: event.type,
    payload: JSON.stringify(event.payload),
    received_at: new Date().toISOString(),
  });

  return { applied: result.changes > 0 };
}

interface EventRow {
  device_id: string;
  seq: number;
  observed_at: string;
  priority: number;
  type: string;
  payload: string;
}

/**
 * Ordered projection of the whole event log (section 2.5 ordering rule).
 * This is the raw event list, not the reduced State — the reducer belongs
 * to A's packages/engine; the backend just serves what it has.
 */
export function listEvents(db: Database.Database): EventEnvelope[] {
  const rows = db
    .prepare(`SELECT device_id, seq, observed_at, priority, type, payload FROM events ORDER BY observed_at, device_id, seq`)
    .all() as EventRow[];

  return rows.map((row) => ({
    device_id: row.device_id,
    seq: row.seq,
    observed_at: row.observed_at,
    priority: row.priority,
    type: row.type,
    payload: JSON.parse(row.payload),
  }));
}
