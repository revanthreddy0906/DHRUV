import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { emptySeed, type OpEvent } from "@dhruv/shared";
import { buildApp } from "../app.js";
import { openDb } from "../db/index.js";
import { listConflicts, rebuildProjections } from "../db/projections.js";
import { resetToStart } from "../db/seedData.js";
import { emitServerEvent } from "./ingest.js";
import { API, auth, login, makeApp, makeEvent, push, t, type Device } from "../test/helpers.js";

/** Regression tests for the 23 Sep security review. One block per finding. */

describe("Vuln 2: admin endpoints", () => {
  it("do not exist outside demo mode, however the path is encoded", async () => {
    const app = buildApp(openDb(":memory:"), { demoMode: false });
    const hq = await login(app, "HQ-WEB-01", "HQ_OPS", "HQ");

    for (const url of ["/api/v1/admin/seed", "/api/v1/%61dmin/seed", "/api/v1/admi%6E/seed", "/%61pi/v1/admin/seed", "/api/v1/%61dmin/director/11"]) {
      const res = await app.inject({ method: "POST", url, headers: auth(hq) });
      expect(res.statusCode, url).toBe(404);
    }
  });

  it("require HQ_OPS in demo mode", async () => {
    const { app } = makeApp();
    const field = await login(app, "FT3-TAB-01", "FIELD_LEAD", "MAITRI");
    const station = await login(app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI");

    for (const who of [field, station]) {
      expect((await app.inject({ method: "POST", url: `${API}/admin/seed`, headers: auth(who) })).statusCode).toBe(403);
      expect((await app.inject({ method: "POST", url: `${API}/admin/director/11`, headers: auth(who) })).statusCode).toBe(403);
    }
  });

  it("still work for HQ_OPS in demo mode", async () => {
    const { app } = makeApp();
    const hq = await login(app, "HQ-WEB-01", "HQ_OPS", "HQ");
    expect((await app.inject({ method: "POST", url: `${API}/admin/seed`, headers: auth(hq) })).json()).toEqual({ ok: true });
    expect((await app.inject({ method: "POST", url: `${API}/admin/director/1`, headers: auth(hq) })).json()).toEqual({ events_created: 1 });
  });
});

describe("Vuln 1: SYSTEM role spoofing", () => {
  it("rejects SYSTEM-claimed events from any logged-in role", async () => {
    const { app } = makeApp();
    const field = await login(app, "FT3-TAB-01", "FIELD_LEAD", "MAITRI");
    const station = await login(app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI");
    const sys = { actor_role: "SYSTEM" as const };

    const vessel = makeEvent(field, "VESSEL_UPDATED", { entity_type: "vessel", entity_id: "V-ICE-STAR" }, { vessel_id: "V-ICE-STAR", load_cutoff: "2027-03-30T00:00:00.000Z" }, t(25, "10:00"), sys);
    const leg = makeEvent(field, "LEG_UPDATED", { entity_type: "leg", entity_id: "L3-C104" }, { leg_id: "L3-C104", eta: "2027-04-01T00:00:00.000Z", status: "DELAYED" }, t(25, "10:00"), sys);
    const flag = makeEvent(station, "CONFLICT_FLAGGED", { entity_type: "vessel", entity_id: "V-ICE-STAR" }, {
      conflict_id: randomUUID(),
      entity_type: "vessel",
      entity_id: "V-ICE-STAR",
      field: "status",
      contenders: [],
      conservative_value: "DOWN",
    }, t(25, "10:00"), sys);
    const proposal = makeEvent(station, "DECISION_PROPOSED", { entity_type: "decision", entity_id: "DEC-01" }, {
      decision_id: "DEC-01",
      trigger_event_id: "x",
      options: [{ id: "OPT-1", levers: ["CONSERVE"] }],
      trace: [],
    }, "2027-01-01T00:00:00.000Z", sys);

    const fieldRes = await push(app, field, [vessel, leg]);
    const stationRes = await push(app, station, [flag, proposal]);
    expect(fieldRes.accepted).toEqual([]);
    expect(stationRes.accepted).toEqual([]);
    expect([...fieldRes.rejected, ...stationRes.rejected].map((r) => r.code)).toEqual(["ROLE_FORBIDDEN", "ROLE_FORBIDDEN", "ROLE_FORBIDDEN", "ROLE_FORBIDDEN"]);
  });

  it("rejects a role claim that differs from the token, but accepts the caller's own role", async () => {
    const { app } = makeApp();
    const field = await login(app, "FT3-TAB-01", "FIELD_LEAD", "MAITRI");
    const asHq = makeEvent(field, "CHECKIN_RECORDED", { entity_type: "team", entity_id: "FT-3" }, { person_or_team_id: "FT-3", lat: -70.6, lon: 12 }, t(25, "07:00"), { actor_role: "HQ_OPS" });
    const own = makeEvent(field, "CHECKIN_RECORDED", { entity_type: "team", entity_id: "FT-3" }, { person_or_team_id: "FT-3", lat: -70.6, lon: 12 }, t(25, "07:05"));

    const res = await push(app, field, [asHq, own]);
    expect(res.rejected).toEqual([expect.objectContaining({ event_id: asHq.event_id, code: "ROLE_FORBIDDEN" })]);
    expect(res.accepted).toEqual([own.event_id]);
  });

  it("does not let a client log in as the server's own devices", async () => {
    const { app } = makeApp();
    for (const device_id of ["SERVER", "DIRECTOR"]) {
      const res = await app.inject({ method: "POST", url: `${API}/auth/login`, payload: { device_id, pin: "MAITRI-2027", role: "FIELD_LEAD", node_id: "MAITRI" } });
      expect(res.statusCode, device_id).toBe(403);
    }
  });
});

describe("Vuln 4: a station may only change records its own station owns", () => {
  async function stations() {
    const ctx = makeApp();
    const maitri = await login(ctx.app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI");
    const bharati = await login(ctx.app, "BHARATI-TAB-01", "STATION_LEADER", "BHARATI");
    const hq = await login(ctx.app, "HQ-WEB-01", "HQ_OPS", "HQ");
    return { ...ctx, maitri, bharati, hq };
  }
  const INC = { entity_type: "incident", entity_id: "INC-01" };
  const SK2 = { entity_type: "asset", entity_id: "SK-2" };

  it("another station cannot update Maitri's incident; Maitri can", async () => {
    const { app, maitri, bharati } = await stations();
    await push(app, maitri, [
      makeEvent(maitri, "INCIDENT_OPENED", INC, { incident_id: "INC-01", type: "OVERDUE_CHECKIN", person_ids: [], last_confirmed_at: t(25, "07:00") }, t(25, "16:00")),
    ]);

    const hostile = await push(app, bharati, [makeEvent(bharati, "INCIDENT_UPDATED", INC, { incident_id: "INC-01", status: "CLOSED" }, t(25, "16:05"))]);
    expect(hostile.rejected.map((r) => r.code)).toEqual(["NODE_FORBIDDEN"]);

    const own = await push(app, maitri, [makeEvent(maitri, "INCIDENT_UPDATED", INC, { incident_id: "INC-01", status: "ESCALATED" }, t(25, "16:10"))]);
    expect(own.accepted).toHaveLength(1);
  });

  it("an update to an incident nobody opened is NOT_FOUND", async () => {
    const { app, maitri } = await stations();
    const res = await push(app, maitri, [makeEvent(maitri, "INCIDENT_UPDATED", { entity_type: "incident", entity_id: "INC-99" }, { incident_id: "INC-99", status: "CLOSED" }, t(25, "16:05"))]);
    expect(res.rejected.map((r) => r.code)).toEqual(["NOT_FOUND"]);
  });

  it("another station cannot resolve Maitri's SK-2 conflict, even though HQ's contending edit was filed under node HQ", async () => {
    const { app, db, maitri, bharati, hq } = await stations();
    await push(app, maitri, [makeEvent(maitri, "ASSET_STATUS_SET", SK2, { asset_id: "SK-2", status: "DOWN" }, t(24, "09:20"))]);
    await push(app, hq, [makeEvent(hq, "ASSET_STATUS_SET", SK2, { asset_id: "SK-2", status: "OK" }, t(24, "11:00"), { node_id: "HQ" })]);
    const conflict = listConflicts(db, "OPEN")[0]!;
    expect(conflict).toBeDefined();

    const resolve = (who: typeof maitri, resolver = who.device_id, at = t(25, "16:15")) =>
      makeEvent(who, "CONFLICT_RESOLVED", { entity_type: "conflict", entity_id: conflict.id }, { conflict_id: conflict.id, chosen_value: "OK", resolver }, at);

    expect((await push(app, bharati, [resolve(bharati)])).rejected.map((r) => r.code)).toEqual(["NODE_FORBIDDEN"]);
    expect((await push(app, maitri, [resolve(maitri, "HQ-WEB-01")])).rejected.map((r) => r.code)).toEqual(["INVALID_EVENT"]);

    // The owning station resolves it; a second resolution is refused.
    expect((await push(app, maitri, [resolve(maitri)])).accepted).toHaveLength(1);
    expect(listConflicts(db, "OPEN")).toHaveLength(0);
    expect((await push(app, hq, [resolve(hq, hq.device_id, t(25, "16:30"))])).rejected.map((r) => r.code)).toEqual(["INVALID_EVENT"]);
  });

  it("resolving a conflict that does not exist is NOT_FOUND", async () => {
    const { app, maitri } = await stations();
    const res = await push(app, maitri, [
      makeEvent(maitri, "CONFLICT_RESOLVED", { entity_type: "conflict", entity_id: "nope" }, { conflict_id: randomUUID(), chosen_value: "OK", resolver: maitri.device_id }, t(25, "16:15")),
    ]);
    expect(res.rejected.map((r) => r.code)).toEqual(["NOT_FOUND"]);
  });

  it("once the seed says SK-2 belongs to Maitri, Bharati cannot set its status", async () => {
    const { app, db, maitri, bharati } = await stations();
    const seed = emptySeed();
    seed.nodes = [
      { id: "HQ", name: "Goa HQ", type: "HQ", lat: 15.4, lon: 73.79 },
      { id: "MAITRI", name: "Maitri", type: "STATION", lat: -70.77, lon: 11.73 },
      { id: "BHARATI", name: "Bharati", type: "STATION", lat: -69.41, lon: 76.19 },
    ];
    seed.assets = [{ id: "SK-2", node_id: "MAITRI", type: "Skidoo", status: "OK", lat: -70.77, lon: 11.73, last_seen: t(24, "08:00"), speed_kmh: 30 }];
    resetToStart(db, seed);

    const hostile = await push(app, bharati, [makeEvent(bharati, "ASSET_STATUS_SET", SK2, { asset_id: "SK-2", status: "DOWN" }, t(24, "09:20"))]);
    expect(hostile.rejected.map((r) => r.code)).toEqual(["NODE_FORBIDDEN"]);
    expect((await push(app, maitri, [makeEvent(maitri, "ASSET_STATUS_SET", SK2, { asset_id: "SK-2", status: "DOWN" }, t(24, "09:25"))])).accepted).toHaveLength(1);
  });
});

describe("Vuln 3: synced DECISION_APPROVED goes through the same rules as the approve endpoint", () => {
  async function withDecisions() {
    const ctx = makeApp();
    const hq = await login(ctx.app, "HQ-WEB-01", "HQ_OPS", "HQ");
    const maitri = await login(ctx.app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI");
    const bharati = await login(ctx.app, "BHARATI-TAB-01", "STATION_LEADER", "BHARATI");
    // DEC-01: HOLD_VESSEL (HQ-only), proposed at 24 Jan 08:11 by the Director (beats 1-2).
    await ctx.app.inject({ method: "POST", url: `${API}/admin/director/1`, headers: auth(hq) });
    await ctx.app.inject({ method: "POST", url: `${API}/admin/director/2`, headers: auth(hq) });
    // DEC-02: CONSERVE (station-level) at Maitri, needs a verify tick.
    emitServerEvent(ctx.db, {
      type: "DECISION_PROPOSED",
      entity_type: "decision",
      entity_id: "DEC-02",
      node_id: "MAITRI",
      observed_at: t(25, "16:00"),
      payload: { decision_id: "DEC-02", trigger_event_id: "x", options: [{ id: "OPT-1", levers: ["CONSERVE"], deadline: "2027-02-27T00:00:00.000Z", requiresVerify: ["Fuel count 36 h old"] }], trace: [] },
    }, new Date().toISOString());
    rebuildProjections(ctx.db);
    return { ...ctx, hq, maitri, bharati };
  }

  const approval = (who: Device, decision_id: string, extra: { verify_ack?: boolean; approver?: string; node_id?: string; at?: string } = {}) =>
    makeEvent(who, "DECISION_APPROVED", { entity_type: "decision", entity_id: decision_id }, {
      decision_id,
      chosen_option_id: "OPT-1",
      approver: extra.approver ?? who.device_id,
      verify_ack: extra.verify_ack ?? true,
    }, extra.at ?? t(25, "16:20"), extra.node_id ? { node_id: extra.node_id } : {});

  const codes = async (app: FastifyInstance, who: Device, e: OpEvent) => (await push(app, who, [e])).rejected.map((r) => r.code);

  it("another station cannot approve Maitri's HQ-only decision", async () => {
    const { app, db, bharati } = await withDecisions();
    expect(await codes(app, bharati, approval(bharati, "DEC-01"))).toEqual(["ROLE_FORBIDDEN"]);
    expect(listDecisionStatus(db, "DEC-01")).toBe("PROPOSED");
  });

  it("Maitri's own leader cannot approve an HQ-only lever by pushing", async () => {
    const { app, maitri } = await withDecisions();
    expect(await codes(app, maitri, approval(maitri, "DEC-01"))).toEqual(["ROLE_FORBIDDEN"]);
  });

  it("HQ's pushed approval must name its own device, the decision's node, and not predate the proposal", async () => {
    const { app, hq } = await withDecisions();
    expect(await codes(app, hq, approval(hq, "DEC-01", { approver: "MAITRI-TAB-01", node_id: "MAITRI" }))).toEqual(["INVALID_EVENT"]);
    expect(await codes(app, hq, approval(hq, "DEC-01", { node_id: "HQ" }))).toEqual(["NODE_FORBIDDEN"]);
    expect(await codes(app, hq, approval(hq, "DEC-01", { node_id: "MAITRI", at: "2027-01-24T08:00:00.000Z" }))).toEqual(["INVALID_EVENT"]);
  });

  it("verify-first applies to synced approvals too", async () => {
    const { app, maitri } = await withDecisions();
    expect(await codes(app, maitri, approval(maitri, "DEC-02", { verify_ack: false }))).toEqual(["VERIFY_REQUIRED"]);
  });

  it("a legitimate offline station-level approval still syncs, and nothing can decide it again", async () => {
    const { app, db, hq, maitri } = await withDecisions();
    const res = await push(app, maitri, [approval(maitri, "DEC-02")]);
    expect(res.accepted).toHaveLength(1);
    expect(listDecisionStatus(db, "DEC-02")).toBe("APPROVED");

    expect(await codes(app, hq, approval(hq, "DEC-02", { node_id: "MAITRI" }))).toEqual(["DECISION_NOT_PROPOSED"]);
    const viaEndpoint = await app.inject({ method: "POST", url: `${API}/decisions/DEC-02/reject`, headers: auth(hq), payload: { reason: "late" } });
    expect(viaEndpoint.json().error.code).toBe("DECISION_NOT_PROPOSED");
  });

  it("a backdated approval cannot override HQ's decision", async () => {
    const { app, db, hq } = await withDecisions();
    await app.inject({ method: "POST", url: `${API}/decisions/DEC-01/reject`, headers: auth(hq), payload: { reason: "too costly", observed_at: t(25, "16:20") } });
    expect(await codes(app, hq, approval(hq, "DEC-01", { node_id: "MAITRI", at: "2027-01-24T09:00:00.000Z" }))).toEqual(["DECISION_NOT_PROPOSED"]);
    expect(listDecisionStatus(db, "DEC-01")).toBe("REJECTED");
  });
});

function listDecisionStatus(db: ReturnType<typeof makeApp>["db"], id: string): string | undefined {
  return (db.prepare(`SELECT status FROM decisions WHERE id = ?`).get(id) as { status: string } | undefined)?.status;
}
