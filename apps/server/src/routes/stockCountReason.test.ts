import { describe, expect, it } from "vitest";
import { validateEvent } from "@dhruv/shared";
import { season48 } from "@dhruv/seed";
import { login, makeApp, makeEvent, pull, push, t } from "../test/helpers.js";

/** Contract extension: STOCK_COUNTED takes an optional reason (at most 200 characters, trimmed). */
describe("STOCK_COUNTED reason", () => {
  const count = (device: Parameters<typeof makeEvent>[0], payload: Record<string, unknown>) =>
    makeEvent(device, "STOCK_COUNTED", { entity_type: "inventory_item", entity_id: "INV-DSL" }, { item_id: "INV-DSL", ...payload }, t(24, "09:15"));

  it("accepts a count without a reason, as every existing count is", async () => {
    const { app } = makeApp({ seed: season48 });
    const maitri = await login(app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI");
    const event = count(maitri, { qty: 92 });
    expect(validateEvent(event)).toEqual({ ok: true });
    expect((await push(app, maitri, [event])).accepted).toEqual([event.event_id]);
  });

  it("accepts a count with a reason, and other devices receive the reason", async () => {
    const { app } = makeApp({ seed: season48 });
    const maitri = await login(app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI");
    const hq = await login(app, "HQ-WEB-01", "HQ_OPS", "HQ");
    const event = count(maitri, { qty: 88, reason: "  Evaporation loss in tank 2  " });
    expect((await push(app, maitri, [event])).accepted).toEqual([event.event_id]);
    const received = (await pull(app, hq)).events.find((e) => e.event_id === event.event_id);
    expect((received?.payload as { reason?: string }).reason?.trim()).toBe("Evaporation loss in tank 2");
  });

  it("accepts exactly 200 characters after trimming and rejects more", async () => {
    const { app } = makeApp({ seed: season48 });
    const maitri = await login(app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI");
    const atLimit = count(maitri, { qty: 90, reason: ` ${"a".repeat(200)} ` });
    const overLimit = count(maitri, { qty: 90, reason: "b".repeat(201) });
    const res = await push(app, maitri, [atLimit, overLimit]);
    expect(res.accepted).toEqual([atLimit.event_id]);
    expect(res.rejected).toEqual([expect.objectContaining({ event_id: overLimit.event_id, code: "INVALID_EVENT" })]);
  });
});
