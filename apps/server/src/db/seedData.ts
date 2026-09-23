import type Database from "better-sqlite3";
import { emptySeed, type Seed } from "@dhruv/shared";
import { DERIVED_TABLES, SEED_TABLES } from "./schema.js";

export function loadSeed(db: Database.Database): Seed {
  const seed = emptySeed();
  for (const table of SEED_TABLES) {
    (seed[table] as unknown[]) = db.prepare(`SELECT * FROM ${table}`).all();
  }
  return seed;
}

/**
 * POST /admin/seed "Reset to Start". Clears the event log and derived views, then reloads the
 * reference tables from `seed`. The frozen season48 data is A's; until it lands the seed is empty.
 */
export function resetToStart(db: Database.Database, seed: Seed = emptySeed()): void {
  const run = db.transaction(() => {
    for (const table of DERIVED_TABLES) db.prepare(`DELETE FROM ${table}`).run();
    for (const table of [...SEED_TABLES].reverse()) db.prepare(`DELETE FROM ${table}`).run();

    for (const table of SEED_TABLES) {
      for (const row of seed[table] as Record<string, unknown>[]) {
        const columns = Object.keys(row);
        db.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((c) => `@${c}`).join(", ")})`).run(row);
      }
    }
  });
  run();
}

/** Seed stock per inventory item: the base for the negative-stock check before any STOCK_COUNTED. */
export function seedStock(db: Database.Database): Map<string, number> {
  const rows = db.prepare(`SELECT id, stock FROM inventory_items`).all() as { id: string; stock: number }[];
  return new Map(rows.map((r) => [r.id, r.stock]));
}
