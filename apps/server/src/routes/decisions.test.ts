import { describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { rebuildProjections } from "../db/projections.js";
import { emitServerEvent } from "../sync/ingest.js";
import { season48 } from "@dhruv/seed";
import { evaluate } from "@dhruv/engine";
import { engineProposal } from "../sync/proposals.js";
import { API, auth, login, makeApp, makeEvent, push, t, type Device } from "../test/helpers.js";

async function director(app: FastifyInstance, device: Device, beat: string) {
  return app.inject({ method: "POST", url: `${API}/admin/director/${beat}`, headers: auth(device) });
}

async function approve(app: FastifyInstance, device: Device, body: Record<string, unknown>, id = "DEC-01") {
  return app.inject({ method: "POST", url: `${API}/decisions/${id}/approve`, headers: auth(device), payload: body });
}

/** Beats 1-2 on season48: DEC-01 proposed from the engine's ranked options. */
async function setup() {
  const { app, db } = makeApp({ seed: season48 });
  const hq = await login(app, "HQ-WEB-01", "HQ_OPS", "HQ");
  const maitri = await login(app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI");
  expect((await director(app, hq, "1")).statusCode).toBe(200);
  expect((await director(app, hq, "2")).statusCode).toBe(200);
  return { app, db, hq, maitri };
}

describe("DEC-01 is proposed from the engine (R08-R11)", () => {
  it("beat 2 records the three ranked options of T-ENG-03 with stable ids, deadlines and ratios", async () => {
    const { app, hq } = await setup();
    const audit = await app.inject({ method: "GET", url: `${API}/events?type=DECISION_PROPOSED`, headers: auth(hq) });
    const [proposal] = audit.json().events as { payload: { options: Record<string, unknown>[]; trace: { rule: string }[] } }[];
    const options = proposal!.payload.options;

    expect(options.map((o) => o.id)).toEqual(["OPT-1", "OPT-2", "OPT-3"]);
    expect(options.map((o) => o.label)).toEqual(["(a)", "(b)", "(c)"]);
    expect(options[0]).toMatchObject({ levers: ["HOLD_VESSEL"], deadline: "2027-02-03T00:00:00.000Z", state: "GREEN", reaches_target: true, slack_days: 0 });
    expect((options[1]!.levers as string[]).sort()).toEqual(["CONSERVE", "DEFER_F27", "HOLD_VESSEL"]);
    expect(options[1]!.deadline).toBe("2027-02-02T00:00:00.000Z");
    expect(options[2]).toMatchObject({ state: "RED", reaches_target: false, deadline: "2027-01-31T00:00:00.000Z", slack_days: null });
    expect(options[0]!.ratio as number).toBeCloseTo(1.0606, 4);
    expect(options[1]!.ratio as number).toBeCloseTo(1.1785, 4);
    expect(options[2]!.ratio as number).toBeCloseTo(0.8754, 4);
    expect(proposal!.payload.trace.map((s) => s.rule)).toContain("R11");
  });

  it("HQ approves option (b): the hold's follow-ups, F-27 deferred, and the engine applies all three levers", async () => {
    const { app, hq } = await setup();
    const res = await approve(app, hq, { chosen_option_id: "OPT-2", verify_ack: true, observed_at: t(24, "09:00") });
    expect(res.statusCode).toBe(200);
    expect(res.json().follow_up_event_ids).toHaveLength(3);

    const state = (await app.inject({ method: "GET", url: `${API}/state`, headers: auth(hq) })).json();
    const maitri = evaluate({ seed: state.seed, events: state.events }, t(24, "09:00")).stations.find((s) => s.nodeId === "MAITRI")!;
    expect(maitri.appliedLevers).toEqual(["CONSERVE", "DEFER_F27", "HOLD_VESSEL"]);
    // (140 kL) / ((120 - 8 - 4) x 1.1): what option (b) promised.
    expect(maitri.dimensions.find((d) => d.key === "FUEL")?.ratio).toBeCloseTo(1.1785, 4);
    expect(maitri.missions?.find((m) => m.missionId === "F-27")?.status).toBe("DEFERRED");
    expect(maitri.options).toBeUndefined();
  });

  it("proposes nothing for a station that needs no decision", () => {
    const { db } = makeApp({ seed: season48 });
    expect(engineProposal(db, "MAITRI", t(24, "08:00"))).toBeNull();
  });
});

describe("decision approval flow (section 15)", () => {
  it("HQ approves HOLD_VESSEL: DECISION_APPROVED plus VESSEL_UPDATED and LEG_UPDATED follow-ups as SYSTEM", async () => {
    const { app, hq } = await setup();

    const res = await approve(app, hq, { chosen_option_id: "OPT-1", verify_ack: true, observed_at: t(25, "16:20") });
    expect(res.statusCode).toBe(200);
    expect(res.json().follow_up_event_ids).toHaveLength(2);

    const audit = await app.inject({ method: "GET", url: `${API}/events?limit=10`, headers: auth(hq) });
    const byType = Object.fromEntries(audit.json().events.map((e: { type: string }) => [e.type, e]));
    expect(byType.DECISION_APPROVED).toMatchObject({ actor_role: "HQ_OPS", observed_at: t(25, "16:20"), payload: { verify_ack: true, approver: "HQ-WEB-01" } });
    expect(byType.VESSEL_UPDATED).toMatchObject({ actor_role: "SYSTEM", payload: { departure: "2027-02-09T00:00:00.000Z", load_cutoff: "2027-02-07T00:00:00.000Z", decision_id: "DEC-01" } });
    expect(byType.LEG_UPDATED).toMatchObject({ actor_role: "SYSTEM", payload: { leg_id: "L3-C104", eta: "2027-02-27T00:00:00.000Z" } });

    const again = await approve(app, hq, { chosen_option_id: "OPT-1", verify_ack: true, observed_at: t(25, "16:21") });
    expect(again.json().error.code).toBe("DECISION_NOT_PROPOSED");
  });

  it("an approval made offline and synced later emits the same follow-ups as the online route", async () => {
    const { app, hq } = await setup();
    const approval = makeEvent(hq, "DECISION_APPROVED", { entity_type: "decision", entity_id: "DEC-01" },
      { decision_id: "DEC-01", chosen_option_id: "OPT-1", approver: "HQ-WEB-01", verify_ack: true }, t(25, "16:20"), { node_id: "MAITRI" });

    const result = await push(app, hq, [approval]);
    expect(result.accepted).toEqual([approval.event_id]);

    const audit = await app.inject({ method: "GET", url: `${API}/events?limit=20`, headers: auth(hq) });
    const byType = Object.fromEntries(audit.json().events.map((e: { type: string }) => [e.type, e]));
    expect(byType.VESSEL_UPDATED).toMatchObject({ device_id: "SERVER", observed_at: t(25, "16:20"), payload: { departure: "2027-02-09T00:00:00.000Z", decision_id: "DEC-01" } });
    expect(byType.LEG_UPDATED).toMatchObject({ device_id: "SERVER", payload: { leg_id: "L3-C104", eta: "2027-02-27T00:00:00.000Z" } });

    // A repeat push is a duplicate and emits nothing more.
    await push(app, hq, [approval]);
    const after = await app.inject({ method: "GET", url: `${API}/events?limit=20`, headers: auth(hq) });
    expect(after.json().events.filter((e: { type: string }) => e.type === "VESSEL_UPDATED")).toHaveLength(1);
  });

  it("a Station Leader cannot approve an option that holds the vessel", async () => {
    const { app, maitri } = await setup();
    const res = await approve(app, maitri, { chosen_option_id: "OPT-1", verify_ack: true, observed_at: t(25, "16:20") });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("ROLE_FORBIDDEN");
  });

  it("refuses after the option's deadline (3 Feb)", async () => {
    const { app, hq } = await setup();
    const res = await approve(app, hq, { chosen_option_id: "OPT-1", verify_ack: true, observed_at: "2027-02-04T00:00:00.000Z" });
    expect(res.json().error.code).toBe("DEADLINE_PASSED");
  });

  it("requires verify_ack when the option depends on stale inputs (R14)", async () => {
    const { app, db } = makeApp();
    const hq = await login(app, "HQ-WEB-01", "HQ_OPS", "HQ");
    const maitri = await login(app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI");
    const trigger = makeEvent(maitri, "STOCK_COUNTED", { entity_type: "inventory_item", entity_id: "INV-DSL" }, { item_id: "INV-DSL", qty: 92 }, t(24, "04:00"));
    await push(app, maitri, [trigger]);
    // Proposals are engine output: only the server writes them (clients may not claim SYSTEM).
    emitServerEvent(db, {
      type: "DECISION_PROPOSED",
      entity_type: "decision",
      entity_id: "DEC-02",
      node_id: "MAITRI",
      observed_at: t(25, "16:00"),
      payload: {
        decision_id: "DEC-02",
        trigger_event_id: trigger.event_id,
        options: [{ id: "OPT-1", levers: ["CONSERVE"], deadline: "2027-02-27T00:00:00.000Z", requiresVerify: ["Fuel count 36 h old"] }],
        trace: [],
      },
    }, new Date().toISOString());
    rebuildProjections(db);

    const noAck = await approve(app, hq, { chosen_option_id: "OPT-1", verify_ack: false, observed_at: t(25, "16:20") }, "DEC-02");
    expect(noAck.json().error.code).toBe("VERIFY_REQUIRED");

    // CONSERVE is station-level, so Maitri's leader may approve it for their own node.
    const ok = await approve(app, maitri, { chosen_option_id: "OPT-1", verify_ack: true, observed_at: t(25, "16:20") }, "DEC-02");
    expect(ok.statusCode).toBe(200);
  });

  it("HQ can reject; a Station Leader cannot", async () => {
    const { app, hq, maitri } = await setup();
    const denied = await app.inject({ method: "POST", url: `${API}/decisions/DEC-01/reject`, headers: auth(maitri), payload: { reason: "no" } });
    expect(denied.statusCode).toBe(403);

    const res = await app.inject({ method: "POST", url: `${API}/decisions/DEC-01/reject`, headers: auth(hq), payload: { reason: "too costly" } });
    expect(res.statusCode).toBe(200);
  });

  it("unknown decision is NOT_FOUND", async () => {
    const { app, hq } = await setup();
    const res = await approve(app, hq, { chosen_option_id: "OPT-1", verify_ack: true }, "DEC-99");
    expect(res.statusCode).toBe(404);
  });
});

describe("Director endpoints (section 15)", () => {
  it("runs server beats, refuses client beats, and beat 11 approves DEC-01", async () => {
    const { app, hq } = await setup();

    expect((await director(app, hq, "4")).statusCode).toBe(400);
    expect((await director(app, hq, "99")).statusCode).toBe(404);
    expect((await director(app, hq, "5")).json()).toEqual({ events_created: 1 });
    expect((await director(app, hq, "11")).json()).toEqual({ events_created: 3 });
  });

  it("beat 2 needs beat 1's LEG_DELAYED first", async () => {
    const { app } = makeApp();
    const hq = await login(app, "HQ-WEB-01", "HQ_OPS", "HQ");
    expect((await director(app, hq, "2")).statusCode).toBe(409);
  });

  it("POST /admin/seed resets to Start", async () => {
    const { app, hq } = await setup();
    const reset = await app.inject({ method: "POST", url: `${API}/admin/seed`, headers: auth(hq) });
    expect(reset.json()).toEqual({ ok: true });

    const state = await app.inject({ method: "GET", url: `${API}/state`, headers: auth(hq) });
    expect(state.json()).toMatchObject({ events: [], cursor: 0 });
    expect(Object.keys(state.json().seed)).toContain("inventory_items");
  });
});

describe("POST /scenarios/run", () => {
  it("runs evaluate() with overlay events and returns 200 with evaluation", async () => {
    const { app } = makeApp({ seed: season48 });
    const hq = await login(app, "HQ-WEB-01", "HQ_OPS", "HQ");
    const res = await app.inject({ method: "POST", url: `${API}/scenarios/run`, headers: auth(hq), payload: { overlay: [] } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("stations");
    expect(Array.isArray(body.stations)).toBe(true);
    expect(body.stations.length).toBeGreaterThan(0);
  });
});
