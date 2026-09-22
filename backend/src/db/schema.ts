import type Database from "better-sqlite3";

/**
 * Append-only event log (section 2.5 envelope; Phase 1 of the C-owner plan).
 * PK on (device_id, seq) gives idempotency for free: re-inserting the same
 * (device_id, seq) is a no-op via INSERT OR IGNORE.
 */
export function applySchema(db: Database.Database): void {
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      device_id   TEXT    NOT NULL,
      seq         INTEGER NOT NULL,
      observed_at TEXT    NOT NULL,
      priority    INTEGER NOT NULL,
      type        TEXT    NOT NULL,
      payload     TEXT    NOT NULL,
      received_at TEXT    NOT NULL,
      PRIMARY KEY (device_id, seq)
    );

    CREATE INDEX IF NOT EXISTS idx_events_order
      ON events (observed_at, device_id, seq);
  `);
}
