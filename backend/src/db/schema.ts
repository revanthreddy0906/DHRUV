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

    -- Demo clock (section 7, C5: absolute jumps only). Single-row table:
    -- control-plane state, deliberately separate from the events log so it
    -- is never gated by the Online/Degraded/Offline link simulation.
    CREATE TABLE IF NOT EXISTS demo_clock (
      id     INTEGER PRIMARY KEY CHECK (id = 1),
      now    TEXT NOT NULL,
      set_at TEXT NOT NULL
    );

    -- Review queue (section 2.6, class C-S and class B negative-stock
    -- violations). No auto-merge for C-S ever — a human resolves these.
    CREATE TABLE IF NOT EXISTS conflicts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id       TEXT    NOT NULL,
      seq             INTEGER NOT NULL,
      reason          TEXT    NOT NULL,
      kept_value      TEXT    NOT NULL,
      rejected_value  TEXT    NOT NULL,
      flagged_at      TEXT    NOT NULL,
      resolved_at     TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_conflicts_open
      ON conflicts (resolved_at);
  `);
}
