import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { evaluate } from "@dhruv/engine";
import { EVENT_RULES, type OpEvent } from "@dhruv/shared";
import { AURORA, AURORA_BEATS, aurora2016Seed, DEVICES, type DirectorBeat } from "@dhruv/seed";
import { listAllEvents } from "../db/events.js";
import { loadSeed } from "../db/seedData.js";
import { API, auth, login, makeApp, push, type Device } from "../test/helpers.js";

/**
 * The 2016 Aurora Australis grounding, replayed on Maitri (docs/run-through-aurora-2016.md): every
 * beat in order, server beats through the admin API and device beats pushed by the device that
 * owns them, with the expected state after each.
 */
async function replay() {
  const ctx = makeApp({ seed: aurora2016Seed });
  const hq = await login(ctx.app, "HQ-WEB-01", "HQ_OPS", "HQ");
  const maitri = await login(ctx.app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI");
  const devices: Record<string, Device> = { [DEVICES.HQ_WEB]: hq, [DEVICES.MAITRI_TAB]: maitri };
  const reset = await ctx.app.inject({ method: "POST", url: `${API}/admin/seed`, headers: auth(hq), payload: { scenario: "aurora2016" } });
  expect(reset.json()).toEqual({ ok: true, scenario: "aurora2016" });

  const after: Record<string, ReturnType<typeof snapshot>> = {};
  function snapshot(at: string) {
    const ev = evaluate({ seed: loadSeed(ctx.db), events: listAllEvents(ctx.db) }, at);
    const m = ev.stations.find((s) => s.nodeId === "MAITRI")!;
    const dim = (k: string) => m.dimensions.find((d) => d.key === k)!;
    return { station: m.state, fuel: dim("FUEL").state, fuelRatio: +dim("FUEL").ratio!.toFixed(4), food: dim("FOOD").state, foodRatio: +dim("FOOD").ratio!.toFixed(4), options: (m.options ?? []).map((o) => o.levers.map((l) => l.id).join("+")) };
  }
  const run = async (beat: DirectorBeat) => {
    if (beat.where === "server" || (beat.where === "operator" && beat.approve)) {
      const res = await ctx.app.inject({ method: "POST", url: `${API}/admin/director/${beat.beat}`, headers: auth(hq) });
      expect(res.statusCode, `${beat.beat}: ${res.body}`).toBe(200);
    } else {
      const byDevice = beat.events.filter((e) => !EVENT_RULES[e.type].localOnly);
      for (const e of byDevice) {
        const d = devices[e.device_id]!;
        d.seq += 1;
        const event: OpEvent = { event_id: randomUUID(), device_id: d.device_id, seq: d.seq, type: e.type, entity_type: e.entity_type, entity_id: e.entity_id, node_id: e.node_id, payload: e.payload, observed_at: e.observed_at, created_at_client: e.observed_at, priority: EVENT_RULES[e.type].defaultPriority, actor_role: e.actor_role, schema_version: 1 };
        const res = await push(ctx.app, d, [event]);
        expect(res.rejected, `${beat.beat}`).toEqual([]);
      }
    }
    const at = [...beat.events.map((e) => e.observed_at), beat.approve?.observed_at, beat.clockJump].filter((x): x is string => !!x).sort().at(-1)!;
    after[beat.beat] = snapshot(at);
  };
  for (const beat of AURORA_BEATS) await run(beat);
  return { ...ctx, after };
}

describe("run-through: Aurora Australis aground at Mawson, 2016, on Maitri", () => {
  it("tells the story in numbers, beat by beat", async () => {
    const { after } = await replay();
    // Arrival: GREEN. Receiving 20 kL against C-104 moves it from inbound to stock, not counted twice.
    expect(after.A0).toMatchObject({ station: "GREEN", fuel: "GREEN", fuelRatio: 1.0606, food: "GREEN" });
    expect(after.A2).toMatchObject({ fuel: "GREEN", fuelRatio: 1.0606 });
    // Aground: the rest of C-104 cannot land before the station closes (R02), fuel 112 / 132.
    expect(after.A3).toMatchObject({ station: "RED", fuel: "RED", fuelRatio: 0.8485 });
    expect(after.A3!.options).toEqual(["AIRLIFT_PARTIAL+CONSERVE", "AIRLIFT_PARTIAL", "CONSERVE"]);
    // 37 people ashore: food requirement for 61 people (R19).
    expect(after.A6).toMatchObject({ food: "RED", foodRatio: 0.4229 });
    // Fuel watch count, then HQ approves the top option: air diesel + conserving.
    expect(after.A7).toMatchObject({ fuel: "RED", fuelRatio: 0.8447 });
    expect(after.A8).toMatchObject({ fuel: "AMBER", fuelRatio: 1.0024, options: [] });
    // The replacement diesel on the partner icebreaker makes the cut-off.
    expect(after.A10).toMatchObject({ fuel: "GREEN", fuelRatio: 1.2297, food: "RED" });
    // The 37 leave: food and the station recover.
    expect(after.A11).toMatchObject({ station: "GREEN", food: "GREEN", foodRatio: 1.0749 });
  });

  it("keeps the incident, the decision and the created shipment in the log", async () => {
    const { db } = await replay();
    const events = listAllEvents(db);
    expect(events.find((e) => e.type === "INCIDENT_OPENED")?.entity_id).toBe(AURORA.incident);
    expect(events.find((e) => e.type === "DECISION_APPROVED")?.payload).toMatchObject({ decision_id: AURORA.decision, chosen_option_id: "OPT-1" });
    expect(events.filter((e) => e.type === "PERSON_MOVED")).toHaveLength(74);
    expect(events.find((e) => e.type === "SHIPMENT_CREATED")?.entity_id).toBe(AURORA.shipmentPartner);
  });

  it("the active scenario decides which beats the server runs", async () => {
    const { app, db } = makeApp({ seed: aurora2016Seed });
    const hq = await login(app, "HQ-WEB-01", "HQ_OPS", "HQ");
    await app.inject({ method: "POST", url: `${API}/admin/seed`, headers: auth(hq), payload: { scenario: "aurora2016" } });
    expect((await app.inject({ method: "GET", url: `${API}/admin/scenario`, headers: auth(hq) })).json()).toMatchObject({ scenario: "aurora2016" });
    expect((await app.inject({ method: "POST", url: `${API}/admin/director/1`, headers: auth(hq) })).statusCode).toBe(404);
    expect(loadSeed(db).personnel.length).toBe(aurora2016Seed.personnel.length);
    expect((await app.inject({ method: "POST", url: `${API}/admin/seed`, headers: auth(hq), payload: { scenario: "nope" } })).statusCode).toBe(404);
  });
});
