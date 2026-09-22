import { openDb } from "./db/index.js";
import { writeEvent } from "./db/events.js";

/**
 * Placeholder dev seed so `pnpm seed && pnpm dev` is runnable during Phase 1.
 * The real golden-dataset seed (seed/season48, section 8.2 Day 2) is owned by A;
 * this only proves the event store and idempotent writes work end-to-end.
 */
const db = openDb(process.env.DHRUV_DB_FILE ?? "dhruv.db");

const now = new Date().toISOString();

const seedEvents = [
  {
    device_id: "maitri-leader",
    seq: 1,
    observed_at: now,
    priority: 3,
    type: "STOCK_COUNTED",
    payload: { item: "diesel", quantity_kl: 92.0, station: "maitri" },
  },
  {
    device_id: "hq-ops",
    seq: 1,
    observed_at: now,
    priority: 2,
    type: "LEG_SCHEDULED",
    payload: { leg_id: "C-104", eta: now },
  },
];

for (const event of seedEvents) {
  const result = writeEvent(db, event);
  console.log(`${event.type} (${event.device_id}#${event.seq}): ${result.applied ? "applied" : "already present"}`);
}

console.log("Seed complete.");
