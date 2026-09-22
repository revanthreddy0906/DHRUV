import type Database from "better-sqlite3";

export interface ConflictRecord {
  id: number;
  device_id: string;
  seq: number;
  reason: string;
  kept_value: unknown;
  rejected_value: unknown;
  flagged_at: string;
  resolved_at: string | null;
}

export interface FlagConflictInput {
  device_id: string;
  seq: number;
  reason: string;
  kept_value: unknown;
  rejected_value: unknown;
}

interface ConflictRow {
  id: number;
  device_id: string;
  seq: number;
  reason: string;
  kept_value: string;
  rejected_value: string;
  flagged_at: string;
  resolved_at: string | null;
}

function rowToRecord(row: ConflictRow): ConflictRecord {
  return {
    ...row,
    kept_value: JSON.parse(row.kept_value),
    rejected_value: JSON.parse(row.rejected_value),
  };
}

/**
 * Review queue (section 2.6, class C-S / class B negative-stock). This is
 * the queue mechanism itself — *detecting* which writes are conflicts
 * needs A's per-event-type payload schemas (which field is safety-critical,
 * which represents a stock delta), so callers supply the reason and both
 * values; this module doesn't decide what counts as a conflict.
 */
export function flagConflict(db: Database.Database, input: FlagConflictInput): ConflictRecord {
  const flagged_at = new Date().toISOString();
  const result = db
    .prepare(`
      INSERT INTO conflicts (device_id, seq, reason, kept_value, rejected_value, flagged_at)
      VALUES (@device_id, @seq, @reason, @kept_value, @rejected_value, @flagged_at)
    `)
    .run({
      device_id: input.device_id,
      seq: input.seq,
      reason: input.reason,
      kept_value: JSON.stringify(input.kept_value),
      rejected_value: JSON.stringify(input.rejected_value),
      flagged_at,
    });

  return rowToRecord({
    id: result.lastInsertRowid as number,
    device_id: input.device_id,
    seq: input.seq,
    reason: input.reason,
    kept_value: JSON.stringify(input.kept_value),
    rejected_value: JSON.stringify(input.rejected_value),
    flagged_at,
    resolved_at: null,
  });
}

export function listOpenConflicts(db: Database.Database): ConflictRecord[] {
  const rows = db
    .prepare(`SELECT * FROM conflicts WHERE resolved_at IS NULL ORDER BY flagged_at`)
    .all() as ConflictRow[];
  return rows.map(rowToRecord);
}

export function resolveConflict(db: Database.Database, id: number): ConflictRecord | null {
  const resolved_at = new Date().toISOString();
  const result = db.prepare(`UPDATE conflicts SET resolved_at = @resolved_at WHERE id = @id AND resolved_at IS NULL`).run({
    id,
    resolved_at,
  });

  if (result.changes === 0) return null;

  const row = db.prepare(`SELECT * FROM conflicts WHERE id = ?`).get(id) as ConflictRow;
  return rowToRecord(row);
}
