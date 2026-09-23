import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { compareEvents, type OpEvent } from "@dhruv/shared";
import { listAllEvents } from "../db/events.js";
import { API, auth, login, makeApp, makeEvent, pull, push, t } from "../test/helpers.js";

const stockCount = (qty: number) => ({ item_id: "INV-DSL", qty });
const DIESEL = { entity_type: "inventory_item", entity_id: "INV-DSL" };

describe("auth (sections 4 and 15)", () => {
  it("issues a token for a valid device, PIN, role and node", async () => {
    const { app } = makeApp();
    const res = await app.inject({
      method: "POST",
      url: `${API}/auth/login`,
      payload: { device_id: "MAITRI-TAB-01", pin: "MAITRI-2027", role: "STATION_LEADER", node_id: "MAITRI" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ role: "STATION_LEADER", node_id: "MAITRI" });
  });

  it("rejects a wrong PIN and a role that does not belong at the node", async () => {
    const { app } = makeApp();
    const wrongPin = await app.inject({
      method: "POST",
      url: `${API}/auth/login`,
      payload: { device_id: "X", pin: "nope", role: "STATION_LEADER", node_id: "MAITRI" },
    });
    expect(wrongPin.statusCode).toBe(401);
    expect(wrongPin.json().error.code).toBe("UNAUTHORIZED");

    const wrongNode = await app.inject({
      method: "POST",
      url: `${API}/auth/login`,
      payload: { device_id: "X", pin: "MAITRI-2027", role: "HQ_OPS", node_id: "MAITRI" },
    });
    expect(wrongNode.statusCode).toBe(403);
  });

  it("requires a bearer token", async () => {
    const { app } = makeApp();
    const res = await app.inject({ method: "GET", url: `${API}/sync/pull` });
    expect(res.statusCode).toBe(401);
  });
});

describe("POST /sync/push", () => {
  it("accepts new events, reports repeats as duplicates", async () => {
    const { app } = makeApp();
    const maitri = await login(app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI");
    const events = [makeEvent(maitri, "STOCK_COUNTED", DIESEL, stockCount(92), t(24, "04:00"))];

    const first = await push(app, maitri, events);
    const again = await push(app, maitri, events);

    expect(first.accepted).toEqual([events[0]!.event_id]);
    expect(again).toMatchObject({ accepted: [], duplicates: [events[0]!.event_id], rejected: [] });
  });

  it("rejects the same device and seq with different content", async () => {
    const { app } = makeApp();
    const maitri = await login(app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI");
    const original = makeEvent(maitri, "STOCK_COUNTED", DIESEL, stockCount(92), t(24, "04:00"));
    await push(app, maitri, [original]);

    const clash = { ...original, event_id: randomUUID() };
    const res = await push(app, maitri, [clash]);
    expect(res.rejected).toEqual([expect.objectContaining({ event_id: clash.event_id, code: "DUPLICATE_SEQ_CONFLICT" })]);
  });

  it("rejects invalid events individually and processes the rest of the batch", async () => {
    const { app } = makeApp();
    const maitri = await login(app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI");

    const ok = makeEvent(maitri, "STOCK_COUNTED", DIESEL, stockCount(92), t(24, "04:00"));
    const localOnly = makeEvent(maitri, "CLOCK_ADVANCED", { entity_type: "clock", entity_id: "demo" }, { now: t(25, "16:00") }, t(25, "16:00"));
    const wrongRole = makeEvent(maitri, "LEG_DELAYED", { entity_type: "leg", entity_id: "L2-C104" }, { leg_id: "L2-C104", new_eta: t(30, "00:00"), reason: "x" }, t(24, "08:10"));
    const otherNode = makeEvent(maitri, "STOCK_COUNTED", DIESEL, stockCount(1), t(24, "05:00"), { node_id: "BHARATI" });
    const badPayload = makeEvent(maitri, "STOCK_COUNTED", DIESEL, { item_id: "INV-DSL" }, t(24, "06:00"));
    const badPriority = makeEvent(maitri, "INCIDENT_OPENED", { entity_type: "incident", entity_id: "INC-01" }, {
      incident_id: "INC-01",
      type: "OVERDUE",
      person_ids: [],
      last_confirmed_at: t(25, "07:00"),
    }, t(25, "16:00"), { priority: 3 });

    const res = await push(app, maitri, [ok, localOnly, wrongRole, otherNode, badPayload, badPriority]);

    expect(res.accepted).toEqual([ok.event_id]);
    const codes = Object.fromEntries(res.rejected.map((r) => [r.event_id, r.code]));
    expect(codes).toEqual({
      [localOnly.event_id]: "INVALID_EVENT",
      [wrongRole.event_id]: "ROLE_FORBIDDEN",
      [otherNode.event_id]: "NODE_FORBIDDEN",
      [badPayload.event_id]: "INVALID_EVENT",
      [badPriority.event_id]: "INVALID_EVENT",
    });
  });

  it("refuses a push for a device other than the logged-in one", async () => {
    const { app } = makeApp();
    const maitri = await login(app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI");
    const res = await app.inject({ method: "POST", url: `${API}/sync/push`, headers: auth(maitri), payload: { device_id: "HQ-WEB-01", events: [] } });
    expect(res.statusCode).toBe(403);
  });
});

describe("GET /sync/pull", () => {
  it("returns other devices' events after the cursor and skips the caller's own", async () => {
    const { app } = makeApp();
    const maitri = await login(app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI");
    const hq = await login(app, "HQ-WEB-01", "HQ_OPS", "HQ");

    const fromMaitri = makeEvent(maitri, "STOCK_COUNTED", DIESEL, stockCount(92), t(24, "04:00"));
    await push(app, maitri, [fromMaitri]);
    await push(app, hq, [makeEvent(hq, "LEG_DELAYED", { entity_type: "leg", entity_id: "L2-C104" }, { leg_id: "L2-C104", new_eta: t(30, "00:00"), reason: "x" }, t(24, "08:10"))]);

    const hqView = await pull(app, hq);
    expect(hqView.events.map((e) => e.event_id)).toEqual([fromMaitri.event_id]);
    expect(hqView.events[0]!.recorded_at_server).toBeDefined();

    const caughtUp = await pull(app, hq, hqView.cursor);
    expect(caughtUp.events).toEqual([]);
    expect(caughtUp.cursor).toBe(2);
  });

  it("starts over when the client's cursor is ahead of the log (it predates a Reset to Start)", async () => {
    const { app } = makeApp();
    const maitri = await login(app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI");
    const hq = await login(app, "HQ-WEB-01", "HQ_OPS", "HQ");
    const fromMaitri = makeEvent(maitri, "STOCK_COUNTED", DIESEL, stockCount(92), t(24, "04:00"));
    await push(app, maitri, [fromMaitri]);

    // HQ still holds cursor 13 from the run before the reset; the log now ends at 1.
    const view = await pull(app, hq, 13);
    expect(view.events.map((e) => e.event_id)).toEqual([fromMaitri.event_id]);
    expect(view.cursor).toBe(1);
  });
});

describe("T-SYNC-01 (server log level): arrival order does not change the stored event set", () => {
  it("two servers receiving the same events in different orders hold identical logs", async () => {
    const a = makeApp();
    const b = makeApp();
    const devices = await Promise.all([
      login(a.app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI"),
      login(a.app, "BHARATI-TAB-01", "STATION_LEADER", "BHARATI"),
      login(a.app, "HQ-WEB-01", "HQ_OPS", "HQ"),
    ]);

    const events: OpEvent[] = [];
    for (let i = 0; i < 30; i++) {
      const d = devices[i % 3]!;
      events.push(makeEvent(d, "MISSION_UPDATED", { entity_type: "mission", entity_id: `M-${i % 4}` }, { mission_id: `M-${i % 4}`, fields: { i } }, t(24, `0${i % 10}:${String(i).padStart(2, "0")}`)));
    }

    const loginB = await Promise.all(devices.map((d) => login(b.app, d.device_id, d.role, d.node_id)));
    const shuffle = (xs: OpEvent[], seed: number) => [...xs].sort((x, y) => ((x.seq * 31 + seed) % 7) - ((y.seq * 31 + seed) % 7) || x.event_id.localeCompare(y.event_id));

    for (const e of shuffle(events, 1)) await push(a.app, devices.find((d) => d.device_id === e.device_id)!, [e]);
    for (const e of shuffle(events, 5)) await push(b.app, loginB.find((d) => d.device_id === e.device_id)!, [e]);

    const strip = (xs: OpEvent[]) => xs.map(({ recorded_at_server: _r, ...rest }) => rest).sort(compareEvents as never);
    expect(strip(listAllEvents(a.db))).toEqual(strip(listAllEvents(b.db)));
    expect(listAllEvents(a.db)).toHaveLength(30);
  });
});
