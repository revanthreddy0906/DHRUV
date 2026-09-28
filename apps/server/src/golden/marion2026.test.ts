import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { evaluate } from "@dhruv/engine";
import { EVENT_RULES, type OpEvent } from "@dhruv/shared";
import { DEVICES, MARION, MARION_BEATS, marion2026Seed, type DirectorBeat } from "@dhruv/seed";
import { listAllEvents } from "../db/events.js";
import { loadSeed } from "../db/seedData.js";
import { API, auth, login, makeApp, push, type Device } from "../test/helpers.js";

/**
 * The 2026 Marion Island polar-diesel crisis, replayed on Maitri (docs/run-through-marion-2026.md).
 * Server beats go through the admin API; device beats are pushed by the device that owns them. While
 * Maitri's link is OFFLINE (beats M8 to M13b) its events wait, as its outbox would, and reach the
 * server when the link returns. Evaluated as HQ sees it: the server's log at the beat's time.
 */
async function replay() {
  const ctx = makeApp({ seed: marion2026Seed });
  const hq = await login(ctx.app, "HQ-WEB-01", "HQ_OPS", "HQ");
  const maitri = await login(ctx.app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI");
  const devices: Record<string, Device> = { [DEVICES.HQ_WEB]: hq, [DEVICES.MAITRI_TAB]: maitri };
  const reset = await ctx.app.inject({ method: "POST", url: `${API}/admin/seed`, headers: auth(hq), payload: { scenario: "marion2026" } });
  expect(reset.json()).toEqual({ ok: true, scenario: "marion2026" });

  let maitriOffline = false;
  const held: OpEvent[] = [];
  const after: Record<string, ReturnType<typeof snapshot>> = {};

  function snapshot(at: string) {
    const ev = evaluate({ seed: loadSeed(ctx.db), events: listAllEvents(ctx.db) }, at);
    const m = ev.stations.find((s) => s.nodeId === "MAITRI")!;
    const fuel = m.dimensions.find((d) => d.key === "FUEL")!;
    const food = m.dimensions.find((d) => d.key === "FOOD");
    const evac = m.levers?.find((l) => l.id === MARION.evacuate);
    return {
      station: m.state, fuel: fuel.state, fuelRatio: +fuel.ratio!.toFixed(4), stock: fuel.items![0]!.stock, inbound: fuel.items![0]!.inbound,
      breach: fuel.slipTolerance?.reserveBreachDate?.slice(0, 10) ?? null, evacDeadline: evac?.deadline.slice(0, 10) ?? null,
      pnr: m.pnr?.pnrDate?.slice(0, 10) ?? null, food: food?.state, foodRatio: food ? +food.ratio!.toFixed(4) : null,
      options: (m.options ?? []).map((o) => `${o.levers.map((l) => l.id).join("+")}:${o.state}${o.requiresVerify ? ":verify" : ""}`).join(" | "),
    };
  }

  const toEvent = (d: Device, e: DirectorBeat["events"][number]): OpEvent => {
    d.seq += 1;
    return { event_id: randomUUID(), device_id: d.device_id, seq: d.seq, type: e.type, entity_type: e.entity_type, entity_id: e.entity_id, node_id: e.node_id, payload: e.payload, observed_at: e.observed_at, created_at_client: e.observed_at, priority: e.priority ?? EVENT_RULES[e.type].defaultPriority, actor_role: e.actor_role, schema_version: 1 };
  };

  const run = async (beat: DirectorBeat) => {
    if (beat.where === "server" || (beat.where === "operator" && beat.approve)) {
      const res = await ctx.app.inject({ method: "POST", url: `${API}/admin/director/${beat.beat}`, headers: auth(hq) });
      expect(res.statusCode, `${beat.beat}: ${res.body}`).toBe(200);
    } else {
      for (const e of beat.events) {
        if (e.type === "LINK_STATE_SET") {
          maitriOffline = (e.payload as { status: string }).status === "OFFLINE";
          if (!maitriOffline && held.length) {
            const res = await push(ctx.app, maitri, held.splice(0));
            expect(res.rejected, `${beat.beat} drain`).toEqual([]);
          }
          continue;
        }
        const d = devices[e.device_id]!;
        const event = toEvent(d, e);
        if (d === maitri && maitriOffline) { held.push(event); continue; }
        const res = await push(ctx.app, d, [event]);
        expect(res.rejected, `${beat.beat}`).toEqual([]);
      }
    }
    const at = [...beat.events.map((e) => e.observed_at), beat.approve?.observed_at, beat.clockJump].filter((x): x is string => !!x).sort().at(-1)!;
    after[beat.beat] = snapshot(at);
  };
  for (const beat of MARION_BEATS) await run(beat);
  return { ...ctx, after };
}

describe("run-through: Marion Island polar diesel crisis, 2026, on Maitri", () => {
  it("turns 'fuel lasts to about 20 May' into an evacuation deadline, and moves it when Maitri conserves", async () => {
    const { after } = await replay();
    // 1 Apr: the relief fuel is inbound; everything GREEN, no decision.
    expect(after.M0).toMatchObject({ station: "GREEN", fuel: "GREEN", stock: 32.4, inbound: 60, pnr: null });
    // The blend slips past the load cut-off: P-200 drops out, but the stock still covers the (short) wait.
    expect(after.M1).toMatchObject({ fuel: "GREEN", inbound: 0 });
    // Daily counts fall with the stock, not with time.
    expect(after.M6).toMatchObject({ fuel: "GREEN", stock: 9.6 });
    // 9 May: departure postponed until the lab test. Reserve breached 20 May (the REAL "about 20 May");
    // the ship must leave by 13 May: 20 May - 3 days on base - 4 days' run.
    expect(after.M6b).toMatchObject({ station: "RED", fuel: "RED", fuelRatio: 0.5333, inbound: 0, breach: "2027-05-20", evacDeadline: "2027-05-13", pnr: "2027-05-13" });
    expect(after.M6b!.options).toBe("EVACUATE:GREEN | CONSERVE+EVACUATE:GREEN | CONSERVE:RED");
    // The Station Leader approves Conserve (OPT-3): the breach moves to 25 May and the deadline to 18 May.
    expect(after.M7).toMatchObject({ fuel: "RED", fuelRatio: 0.7111, breach: "2027-05-25", evacDeadline: "2027-05-18", pnr: "2027-05-18" });
    // Offline from 10 May: HQ's newest count ages, so the evacuate option needs a verify tick.
    expect(after.M9b!.options).toBe("EVACUATE:GREEN:verify");
    // 14 May: HQ approves the evacuation; with the base shut down, the fuel covers what is left.
    expect(after.M11).toMatchObject({ station: "GREEN", fuel: "GREEN", breach: null, pnr: null });
    // 18 May: the link returns and Maitri's offline counts arrive (7.8 kL on 13 May).
    expect(after.M13b).toMatchObject({ stock: 7.8, fuel: "GREEN" });
    // Everyone has left: no one on station, no food requirement.
    expect(after.M14!.foodRatio).toBe(Infinity);
    // The secured diesel for August is inbound.
    expect(after.M16).toMatchObject({ inbound: 60, fuel: "GREEN" });
  });

  it("records the two decisions, the approvals and the moves in the log", async () => {
    const { db } = await replay();
    const events = listAllEvents(db);
    const approvals = events.filter((e) => e.type === "DECISION_APPROVED").map((e) => e.payload as { decision_id: string; chosen_option_id: string; approver: string; verify_ack: boolean });
    expect(approvals).toEqual([
      expect.objectContaining({ decision_id: MARION.decision, chosen_option_id: "OPT-3", approver: DEVICES.MAITRI_TAB }),
      expect.objectContaining({ decision_id: MARION.decisionEvac, chosen_option_id: "OPT-1", verify_ack: true }),
    ]);
    expect(events.filter((e) => e.type === "PERSON_MOVED")).toHaveLength(40);
    expect(events.find((e) => e.type === "SHIPMENT_CREATED")?.entity_id).toBe(MARION.nextSupply);
    expect(loadSeed(db).season?.resupply.vesselId).toBe("V-ICE-STAR");
  });
});
