import type { DhruvDb } from "./db.js";

const NOW_KEY = "demo_clock_now";

/**
 * The demo clock (section 7 of the architecture doc, C5: absolute jumps
 * only, never relative offsets). This is Director-authoritative control-plane
 * state, not station data — it does not go through the outbox/link-simulation
 * pipeline that Online/Degraded/Offline gates (see priorityDrain.ts). A node
 * learns the current demo "now" via /clock (see backend/src/routes/clock.ts),
 * independent of whether its *data* sync is simulated offline.
 *
 * Once cached here, reading it is a synchronous local Dexie lookup — the
 * property that matters for T-FRESH-04: freshness must be computable with
 * zero network round-trip once a node has learned the current clock value.
 */
export async function setLocalNow(db: DhruvDb, iso: string): Promise<void> {
  await db.meta.put({ key: NOW_KEY, value: iso });
}

/**
 * Falls back to the real system clock only if the demo clock has never been
 * set on this node yet (e.g. fresh install, before the first Director jump
 * or the first /clock poll) — never during normal demo operation.
 */
export async function getLocalNow(db: DhruvDb): Promise<Date> {
  const entry = await db.meta.get(NOW_KEY);
  return entry ? new Date(entry.value as string) : new Date();
}
