import type { Seed, StateResponse } from "@dhruv/shared";
import { getMeta, setMeta, type DhruvDb } from "./db.js";
import type { ApiCall } from "./sync.js";
import type { DeviceIdentity } from "./write.js";

const SEED_KEY = "seed";

/**
 * First load after login (section 9 step 1): GET /state into the local store. Stores the seed in
 * the cache table so a reload works offline, merges all server events, and sets the pull cursor.
 *
 * The device's seq continues after the highest seq the server holds for it. Without that, a device
 * that logs in from a fresh browser (or after its local store was cleared) would restart at seq 1
 * and every push would be refused as a seq conflict.
 */
export async function bootstrap(db: DhruvDb, identity: DeviceIdentity, call: ApiCall): Promise<StateResponse> {
  const state = await call<StateResponse>("/state");
  const serverSeq = state.events.filter((e) => e.device_id === identity.device_id).reduce((max, e) => Math.max(max, e.seq), 0);

  await db.transaction("rw", db.events, db.meta, db.cache, async () => {
    await db.events.bulkPut(state.events);
    await db.cache.put({ key: SEED_KEY, value: state.seed, computed_at: new Date().toISOString() });
    // Never move the cursor back: events pulled since are already stored.
    await setMeta(db, "cursor", Math.max(state.cursor, await getMeta<number>(db, "cursor", 0)));
    await setMeta(db, "seq", Math.max(serverSeq, await getMeta<number>(db, "seq", 0)));
  });
  return state;
}

/** The seed from the last bootstrap, or null before the first one (or after a Director reset). */
export async function cachedSeed(db: DhruvDb): Promise<Seed | null> {
  const entry = await db.cache.get(SEED_KEY);
  return entry ? (entry.value as Seed) : null;
}
