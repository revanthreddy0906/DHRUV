import { beforeEach, describe, expect, it } from "vitest";
import { emptySeed, type OpEvent, type StateResponse } from "@dhruv/shared";
import { DhruvDb, getMeta } from "./db.js";
import { bootstrap, cachedSeed } from "./session.js";
import { createApiCall, type ApiCall } from "./sync.js";
import { writeEvent, type DeviceIdentity } from "./write.js";

const maitri: DeviceIdentity = { device_id: "MAITRI-TAB-01", role: "STATION_LEADER", node_id: "MAITRI" };
const count = { type: "STOCK_COUNTED" as const, entity_type: "inventory_item", entity_id: "INV-DSL", payload: { item_id: "INV-DSL", qty: 92 } };

let db: DhruvDb;
beforeEach(async () => {
  db = new DhruvDb(`session-${Math.random()}`);
  await db.open();
});

function serverWith(events: OpEvent[], cursor: number): ApiCall {
  const seed = emptySeed();
  seed.nodes = [{ id: "MAITRI", name: "Maitri", type: "STATION", lat: -70.77, lon: 11.73 }];
  const state: StateResponse = { seed, events, cursor };
  return (async (path: string) => {
    if (path !== "/state") throw new Error(`unexpected ${path}`);
    return state;
  }) as ApiCall;
}

describe("bootstrap after login (section 9 step 1)", () => {
  it("stores the seed, all server events and the cursor", async () => {
    const remote = await writeEvent(new DhruvDb(`r-${Math.random()}`), { device_id: "HQ-WEB-01", role: "HQ_OPS", node_id: "HQ" }, { ...count, node_id: "MAITRI" });
    await bootstrap(db, maitri, serverWith([remote], 7));

    expect(await db.events.get(remote.event_id)).toEqual(remote);
    expect(await getMeta(db, "cursor", 0)).toBe(7);
    expect((await cachedSeed(db))?.nodes).toHaveLength(1);
  });

  it("continues this device's seq after the server's, so a fresh browser does not collide", async () => {
    const elsewhere = new DhruvDb(`old-${Math.random()}`);
    const earlier = [await writeEvent(elsewhere, maitri, count), await writeEvent(elsewhere, maitri, count)];

    await bootstrap(db, maitri, serverWith(earlier, 2));
    expect((await writeEvent(db, maitri, count)).seq).toBe(3);
  });

  it("never moves the local seq or cursor backwards", async () => {
    for (let i = 0; i < 4; i++) await writeEvent(db, maitri, count);
    await db.meta.put({ key: "cursor", value: 9 });

    await bootstrap(db, maitri, serverWith([], 3));
    expect(await getMeta(db, "seq", 0)).toBe(4);
    expect(await getMeta(db, "cursor", 0)).toBe(9);
    expect(await db.outbox.count()).toBe(4);
  });

  it("has no cached seed before the first bootstrap", async () => {
    expect(await cachedSeed(db)).toBeNull();
  });
});

describe("createApiCall", () => {
  it("declares JSON only when there is a body, so bodyless POSTs (Reset, Director beats) are accepted", async () => {
    const seen: Record<string, string>[] = [];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      seen.push(init.headers as Record<string, string>);
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const call = createApiCall("", () => "t", fakeFetch);

    await call("/admin/seed", { method: "POST" });
    await call("/sync/push", { method: "POST", body: "{}" });
    expect(seen[0]).toEqual({ Authorization: "Bearer t" });
    expect(seen[1]).toEqual({ "Content-Type": "application/json", Authorization: "Bearer t" });
  });
});
