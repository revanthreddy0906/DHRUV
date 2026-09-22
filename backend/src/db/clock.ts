import type Database from "better-sqlite3";

export interface ClockState {
  now: string;
  set_at: string;
}

/**
 * Director-authoritative absolute jump (C5). No relative offsets — a caller
 * always provides the full new "now", never a delta.
 */
export function setClock(db: Database.Database, now: string): ClockState {
  const set_at = new Date().toISOString();
  db.prepare(`
    INSERT INTO demo_clock (id, now, set_at) VALUES (1, @now, @set_at)
    ON CONFLICT(id) DO UPDATE SET now = excluded.now, set_at = excluded.set_at
  `).run({ now, set_at });

  return { now, set_at };
}

export function getClock(db: Database.Database): ClockState | null {
  const row = db.prepare(`SELECT now, set_at FROM demo_clock WHERE id = 1`).get() as ClockState | undefined;
  return row ?? null;
}
