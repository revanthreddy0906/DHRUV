import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { currentCursor, logEpoch } from "../db/events.js";
import { DERIVED_TABLES, SEED_TABLES } from "../db/schema.js";

/**
 * GET /storage: how the server holds its data, for the "Where data lives" screen. Read-only row
 * counts, never rows: the append-only `events` log is the source of truth, the projections are
 * rebuilt from it, and the seed tables are the season's reference data.
 */
export function registerStorageRoutes(app: FastifyInstance, db: Database.Database): void {
  app.get("/storage", { preHandler: app.requireAuth }, async () => {
    const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
    const byType = db.prepare(`SELECT type, COUNT(*) AS n FROM events GROUP BY type ORDER BY n DESC, type`).all() as { type: string; n: number }[];
    const devices = db.prepare(`SELECT device_id, COUNT(*) AS n, MAX(seq) AS last_seq FROM events GROUP BY device_id ORDER BY device_id`).all() as { device_id: string; n: number; last_seq: number }[];
    return {
      engine: "SQLite",
      journal_mode: String(db.pragma("journal_mode", { simple: true })),
      file: db.name,
      epoch: logEpoch(db),
      cursor: currentCursor(db),
      log: { table: "events", rows: count("events"), by_type: byType, by_device: devices },
      derived: DERIVED_TABLES.filter((t) => t !== "events").map((t) => ({ table: t, rows: count(t) })),
      reference: SEED_TABLES.map((t) => ({ table: t, rows: count(t) })),
    };
  });
}
