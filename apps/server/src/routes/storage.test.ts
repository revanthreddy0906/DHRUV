import { describe, expect, it } from "vitest";
import type { StorageResponse } from "@dhruv/shared";
import { season48 } from "@dhruv/seed";
import { API, auth, login, makeApp, makeEvent, push, t } from "../test/helpers.js";

describe("GET /storage", () => {
  it("needs a token", async () => {
    const { app } = makeApp();
    expect((await app.inject({ method: "GET", url: `${API}/storage` })).statusCode).toBe(401);
  });

  it("reports the log, projections and seed tables as row counts, and follows new events", async () => {
    const { app } = makeApp({ seed: season48 });
    const maitri = await login(app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI");
    const get = async () => (await app.inject({ method: "GET", url: `${API}/storage`, headers: auth(maitri) })).json() as StorageResponse;

    const before = await get();
    expect(before.engine).toBe("SQLite");
    expect(before.log.rows).toBe(0);
    expect(before.reference.find((r) => r.table === "inventory_items")!.rows).toBe(season48.inventory_items.length);
    expect(before.derived.map((d) => d.table)).toEqual(["decisions", "conflicts", "incidents"]);

    await push(app, maitri, [
      makeEvent(maitri, "STOCK_ISSUED", { entity_type: "inventory_item", entity_id: "INV-DSL" }, { item_id: "INV-DSL", qty: 2, reason: "generator" }, t(24, "09:00")),
      makeEvent(maitri, "STOCK_COUNTED", { entity_type: "inventory_item", entity_id: "INV-DSL" }, { item_id: "INV-DSL", qty: 89 }, t(24, "09:05")),
    ]);
    const after = await get();
    expect(after.log.rows).toBe(2);
    expect(after.cursor).toBe(2);
    expect(after.log.by_type).toEqual([{ type: "STOCK_COUNTED", n: 1 }, { type: "STOCK_ISSUED", n: 1 }]);
    expect(after.log.by_device).toEqual([{ device_id: "MAITRI-TAB-01", n: 2, last_seq: 2 }]);
    expect(after.epoch).toBe(before.epoch);
  });
});
