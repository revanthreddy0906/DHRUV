import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { EVENT_RULES, type OpEvent, type PullResponse, type PushResponse } from "@dhruv/shared";
import { findBeat } from "@dhruv/seed";
import { DhruvDb, jumpClock, setLinkStatus, syncOnce, syncStatus, writeEvent, type DeviceIdentity, type SyncApi } from "@dhruv/store";
import { listConflicts } from "../db/projections.js";
import { API, auth, login, makeApp, type Device } from "../test/helpers.js";

interface Node {
  device: Device;
  identity: DeviceIdentity;
  db: DhruvDb;
  api: SyncApi;
  pushes: PushResponse[];
  pushedTypes: string[][];
}

function node(app: FastifyInstance, device: Device): Node {
  const pushes: PushResponse[] = [];
  const pushedTypes: string[][] = [];
  const api: SyncApi = {
    push: async (req) => {
      pushedTypes.push(req.events.map((e) => e.type));
      const res = (await app.inject({ method: "POST", url: `${API}/sync/push`, headers: auth(device), payload: req })).json() as PushResponse;
      pushes.push(res);
      return res;
    },
    pull: async (since) => (await app.inject({ method: "GET", url: `${API}/sync/pull?since=${since}`, headers: auth(device) })).json() as PullResponse,
  };
  return { device, identity: device, db: new DhruvDb(`e2e-${device.device_id}-${Math.random()}`), api, pushes, pushedTypes };
}

async function runClientBeat(n: Node, beatId: string) {
  const beat = findBeat(beatId)!;
  for (const e of beat.events.filter((ev) => ev.device_id === n.identity.device_id)) {
    await writeEvent(n.db, n.identity, { type: e.type, entity_type: e.entity_type, entity_id: e.entity_id, node_id: e.node_id, payload: e.payload, observed_at: e.observed_at, actor_role: e.actor_role });
  }
}

const director = (app: FastifyInstance, hq: Device, beat: string) => app.inject({ method: "POST", url: `${API}/admin/director/${beat}`, headers: auth(hq) });
const syncedIds = async (n: Node) => new Set((await n.db.events.toArray()).filter((e: OpEvent) => !EVENT_RULES[e.type].localOnly).map((e) => e.event_id));

describe("offline-to-online round trip: Director beats 1-11 against the real server", () => {
  it("station keeps working offline, syncs safety-critical data first, and flags SK-2 for a human", async () => {
    const { app, db } = makeApp();
    const hq = node(app, await login(app, "HQ-WEB-01", "HQ_OPS", "HQ"));
    const maitri = node(app, await login(app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI"));
    const ft3 = node(app, await login(app, "FT3-TAB-01", "FIELD_LEAD", "MAITRI"));

    // Beats 1-2: slip and decision, at HQ.
    expect((await director(app, hq.device, "1")).statusCode).toBe(200);
    expect((await director(app, hq.device, "2")).statusCode).toBe(200);
    await syncOnce(maitri.db, maitri.identity, maitri.api);
    expect(await maitri.db.events.where("type").equals("DECISION_PROPOSED").count()).toBe(1);

    // Beat 3: link lost. Beat 4: offline entries at Maitri.
    await setLinkStatus(maitri.db, maitri.identity, "OFFLINE", "2027-01-24T09:00:00.000Z");
    await runClientBeat(maitri, "4");
    expect(await syncOnce(maitri.db, maitri.identity, maitri.api)).toEqual({ ok: false, skipped: "offline" });
    expect((await syncStatus(maitri.db)).pending).toBe(4);

    // Beat 5: HQ edits SK-2 from its stale plan; HQ cannot see Maitri's entries yet.
    await director(app, hq.device, "5");
    await syncOnce(hq.db, hq.identity, hq.api);
    expect(await hq.db.events.where("entity_id").equals("SK-2").count()).toBe(1);
    expect(await hq.db.events.where("type").equals("STOCK_COUNTED").count()).toBe(0);

    // Beat 6: every tab jumps to 25 Jan 16:00. Beats 7-8: check-in, then incident while offline.
    for (const n of [hq, maitri, ft3]) await jumpClock(n.db, n.identity, "2027-01-25T16:00:00.000Z");
    await runClientBeat(ft3, "7");
    await syncOnce(ft3.db, ft3.identity, ft3.api);
    await runClientBeat(maitri, "8");
    expect((await syncStatus(maitri.db)).pending).toBe(5);

    // Beat 9: link returns degraded (one 1-second cycle), then online.
    await setLinkStatus(maitri.db, maitri.identity, "DEGRADED");
    await syncOnce(maitri.db, maitri.identity, maitri.api, { cycleSeconds: 1 });
    expect(maitri.pushedTypes.at(-1)![0]).toBe("INCIDENT_OPENED");
    expect(maitri.pushedTypes.at(-1)![1]).toBe("ASSET_STATUS_SET");

    await setLinkStatus(maitri.db, maitri.identity, "ONLINE");
    await syncOnce(maitri.db, maitri.identity, maitri.api);
    expect((await syncStatus(maitri.db)).pending).toBe(0);
    const firstDrainOrder = maitri.pushedTypes.slice(-2).flat();
    expect(firstDrainOrder.indexOf("INCIDENT_OPENED")).toBeLessThan(firstDrainOrder.indexOf("MISSION_UPDATED"));

    // Beat 10: the conflict is flagged on sync, conservative DOWN kept, and reaches HQ.
    const [conflict] = listConflicts(db, "OPEN");
    expect(conflict).toMatchObject({ entity_id: "SK-2", conservative_value: "DOWN" });
    await syncOnce(hq.db, hq.identity, hq.api);
    expect(await hq.db.events.where("type").equals("CONFLICT_FLAGGED").count()).toBe(1);

    // HQ resolves it as a human action; beat 11: HQ approves option 1.
    await writeEvent(hq.db, hq.identity, {
      type: "CONFLICT_RESOLVED",
      entity_type: "conflict",
      entity_id: conflict.id,
      node_id: "MAITRI",
      payload: { conflict_id: conflict.id, chosen_value: "DOWN", resolver: "HQ-WEB-01" },
    });
    await syncOnce(hq.db, hq.identity, hq.api);
    expect(listConflicts(db, "OPEN")).toHaveLength(0);

    const approve = await app.inject({
      method: "POST",
      url: `${API}/decisions/DEC-01/approve`,
      headers: auth(hq.device),
      payload: { chosen_option_id: "OPT-1", verify_ack: true, observed_at: "2027-01-25T16:20:00.000Z" },
    });
    expect(approve.statusCode).toBe(200);

    // Convergence: after a final sync every replica holds the same synced event set.
    for (const n of [maitri, hq, ft3]) await syncOnce(n.db, n.identity, n.api);
    const [m, h, f] = await Promise.all([syncedIds(maitri), syncedIds(hq), syncedIds(ft3)]);
    expect([...m].sort()).toEqual([...h].sort());
    expect([...f].sort()).toEqual([...h].sort());
    expect(await maitri.db.events.where("type").equals("VESSEL_UPDATED").count()).toBe(1);
  });
});
