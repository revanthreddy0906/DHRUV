import { describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { API, auth, login, makeApp, makeEvent, push, t, type Device } from "../test/helpers.js";

async function director(app: FastifyInstance, device: Device, beat: string) {
  return app.inject({ method: "POST", url: `${API}/admin/director/${beat}`, headers: auth(device) });
}

async function approve(app: FastifyInstance, device: Device, body: Record<string, unknown>, id = "DEC-01") {
  return app.inject({ method: "POST", url: `${API}/decisions/${id}/approve`, headers: auth(device), payload: body });
}

async function setup() {
  const { app, db } = makeApp();
  const hq = await login(app, "HQ-WEB-01", "HQ_OPS", "HQ");
  const maitri = await login(app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI");
  expect((await director(app, hq, "1")).statusCode).toBe(200);
  expect((await director(app, hq, "2")).statusCode).toBe(200);
  return { app, db, hq, maitri };
}

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
    const { app } = makeApp();
    const hq = await login(app, "HQ-WEB-01", "HQ_OPS", "HQ");
    const maitri = await login(app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI");
    const trigger = makeEvent(maitri, "STOCK_COUNTED", { entity_type: "inventory_item", entity_id: "INV-DSL" }, { item_id: "INV-DSL", qty: 92 }, t(24, "04:00"));
    await push(app, maitri, [trigger]);
    await push(app, maitri, [
      makeEvent(maitri, "DECISION_PROPOSED", { entity_type: "decision", entity_id: "DEC-02" }, {
        decision_id: "DEC-02",
        trigger_event_id: trigger.event_id,
        options: [{ id: "OPT-1", levers: ["CONSERVE"], deadline: "2027-02-27T00:00:00.000Z", requiresVerify: ["Fuel count 36 h old"] }],
        trace: [],
      }, t(25, "16:00"), { actor_role: "SYSTEM" }),
    ]);

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
  it("reports NOT_IMPLEMENTED until A's evaluate() lands", async () => {
    const { app } = makeApp();
    const hq = await login(app, "HQ-WEB-01", "HQ_OPS", "HQ");
    const res = await app.inject({ method: "POST", url: `${API}/scenarios/run`, headers: auth(hq), payload: { overlay: [] } });
    expect(res.statusCode).toBe(501);
    expect(res.json().error.code).toBe("NOT_IMPLEMENTED");
  });
});
