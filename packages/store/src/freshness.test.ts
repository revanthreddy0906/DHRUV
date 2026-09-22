import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type DhruvDb } from "./db.js";
import { commitLocalEvent } from "./outbox.js";
import { getLocalNow, setLocalNow } from "./clock.js";
import { ageHours } from "./freshness.js";

/**
 * T-FRESH-04 (golden test, section 5): Maitri records a count at 09:15
 * while offline; viewed at 16:00 that's 6h45m old (FRESH). HQ hasn't
 * synced that count yet and is still looking at an older one from
 * 24 Jan 04:00 — 36h old (AGING) at the same demo-clock instant.
 *
 * This proves the *mechanism*: both nodes compute age from a locally
 * cached clock value and their own locally known observation, with zero
 * network calls in this test. It does not classify FRESH vs AGING (A's
 * threshold config) — just the raw age math the classification sits on.
 */
describe("T-FRESH-04 mechanism: local, zero-network freshness", () => {
  let maitriDb: DhruvDb;
  let hqDb: DhruvDb;

  beforeEach(async () => {
    maitriDb = createDb(`maitri-${Math.random()}`);
    hqDb = createDb(`hq-${Math.random()}`);
    await maitriDb.open();
    await hqDb.open();
  });

  it("Maitri sees its own 09:15 count as ~6h45m old; HQ's unsynced 04:00 count reads ~36h old", async () => {
    const demoNow = "2027-01-25T16:00:00.000Z";

    // Maitri recorded the count itself and learned the clock jump directly
    // (control-plane, not gated by the simulated data link being Offline).
    await commitLocalEvent(maitriDb, {
      device_id: "maitri-leader",
      seq: 2,
      observed_at: "2027-01-25T09:15:00.000Z",
      priority: 3,
      type: "STOCK_COUNTED",
      payload: { item: "diesel", quantity_kl: 92.0 },
    });
    await setLocalNow(maitriDb, demoNow);

    // HQ has not synced Maitri's new count — it only knows the older one —
    // but it has learned the same demo clock instant.
    await commitLocalEvent(hqDb, {
      device_id: "maitri-leader",
      seq: 1,
      observed_at: "2027-01-24T04:00:00.000Z",
      priority: 3,
      type: "STOCK_COUNTED",
      payload: { item: "diesel", quantity_kl: 92.0 },
    });
    await setLocalNow(hqDb, demoNow);

    const maitriNow = await getLocalNow(maitriDb);
    const hqNow = await getLocalNow(hqDb);

    const maitriCount = await maitriDb.events.get(["maitri-leader", 2]);
    const hqCount = await hqDb.events.get(["maitri-leader", 1]);

    const maitriAge = ageHours(maitriNow, maitriCount!.observed_at);
    const hqAge = ageHours(hqNow, hqCount!.observed_at);

    expect(maitriAge).toBeCloseTo(6.75, 2); // 6h45m
    expect(hqAge).toBeCloseTo(36, 2);
  });
});
