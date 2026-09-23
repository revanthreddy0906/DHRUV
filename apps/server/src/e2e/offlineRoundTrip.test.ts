import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { EVENT_RULES, type OpEvent, type PullResponse, type PushResponse } from "@dhruv/shared";
import {
  attachDirectorListener,
  createDirector,
  DhruvDb,
  syncOnce,
  lastCheckIn,
  syncStatus,
  writeEvent,
  type DeviceIdentity,
  type DirectorAdminApi,
  type DirectorChannel,
  type SyncApi,
} from "@dhruv/store";
import { season48 } from "@dhruv/seed";
import { listConflicts } from "../db/projections.js";
import { API, auth, login, makeApp, type Device } from "../test/helpers.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function openChannel(name: string): DirectorChannel {
  const c = new BroadcastChannel(name) as unknown as DirectorChannel;
  cleanups.push(() => c.close());
  return c;
}

interface Tab {
  device: Device;
  identity: DeviceIdentity;
  db: DhruvDb;
  api: SyncApi;
  pushedTypes: string[][];
}

/** One simulated device tab: its own store, a sync client against the real server, a Director listener. */
function openTab(app: FastifyInstance, device: Device, channelName: string): Tab {
  const pushedTypes: string[][] = [];
  const api: SyncApi = {
    push: async (req) => {
      pushedTypes.push(req.events.map((e) => e.type));
      return (await app.inject({ method: "POST", url: `${API}/sync/push`, headers: auth(device), payload: req })).json() as PushResponse;
    },
    pull: async (since) => (await app.inject({ method: "GET", url: `${API}/sync/pull?since=${since}`, headers: auth(device) })).json() as PullResponse,
  };
  const db = new DhruvDb(`e2e-${device.device_id}-${Math.random()}`);
  cleanups.push(attachDirectorListener(db, device, openChannel(channelName)));
  return { device, identity: device, db, api, pushedTypes };
}

function adminApi(app: FastifyInstance, hq: Device): DirectorAdminApi {
  return {
    runServerBeat: async (beat) => {
      const res = await app.inject({ method: "POST", url: `${API}/admin/director/${beat}`, headers: auth(hq) });
      if (res.statusCode !== 200) throw new Error(res.body);
      return res.json();
    },
    resetServer: async () => {
      await app.inject({ method: "POST", url: `${API}/admin/seed`, headers: auth(hq) });
    },
  };
}

const syncedIds = async (t: Tab) => new Set((await t.db.events.toArray()).filter((e: OpEvent) => !EVENT_RULES[e.type].localOnly).map((e) => e.event_id));
const sync = (t: Tab, cycleSeconds = 1) => syncOnce(t.db, t.identity, t.api, { cycleSeconds });

describe("offline-to-online round trip: the Director drives beats 1-11 against the real server", () => {
  it("station keeps working offline, syncs safety-critical data first, and flags SK-2 for a human", async () => {
    // The frozen season48 seed, so the node rule and negative-stock checks see real owners and stock.
    const { app, db } = makeApp({ seed: season48 });
    const channelName = `e2e-director-${Math.random()}`;
    const hqDevice = await login(app, "HQ-WEB-01", "HQ_OPS", "HQ");
    const hq = openTab(app, hqDevice, channelName);
    const maitri = openTab(app, await login(app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI"), channelName);
    const ft3 = openTab(app, await login(app, "FT3-TAB-01", "FIELD_LEAD", "MAITRI"), channelName);
    const director = createDirector({ channel: openChannel(channelName), admin: adminApi(app, hqDevice), timeoutMs: 150, stepDelayMs: 0 });

    // Beats 1-2: slip and decision, at HQ; Maitri is still online and sees them.
    await director.runBeat("1");
    await director.runBeat("2");
    await sync(maitri);
    expect(await maitri.db.events.where("type").equals("DECISION_PROPOSED").count()).toBe(1);

    // Beat 3: link lost. Beat 4: offline entries, written only in Maitri's tab.
    expect((await director.runBeat("3")).appliedOn).toEqual(["MAITRI-TAB-01"]);
    await director.runBeat("4");
    expect(await sync(maitri)).toEqual({ ok: false, skipped: "offline" });
    expect((await syncStatus(maitri.db)).pending).toBe(4);

    // Beat 5: HQ edits SK-2 from its stale plan; HQ cannot see Maitri's entries yet.
    await director.runBeat("5");
    await sync(hq);
    expect(await hq.db.events.where("entity_id").equals("SK-2").count()).toBe(1);
    expect(await hq.db.events.where("type").equals("STOCK_COUNTED").count()).toBe(0);

    // Beat 6: every tab jumps to 25 Jan 16:00. Beats 7-8: check-in, then the incident while offline.
    expect((await director.runBeat("6")).appliedOn.sort()).toEqual(["FT3-TAB-01", "HQ-WEB-01", "MAITRI-TAB-01"]);
    // Beat 7 records FT-3's check-in on the team tablet and, relayed by radio, on offline Maitri.
    expect((await director.runBeat("7")).appliedOn.sort()).toEqual(["FT3-TAB-01", "MAITRI-TAB-01"]);
    await sync(ft3);
    await director.runBeat("8");
    expect((await syncStatus(maitri.db)).pending).toBe(6);
    expect(lastCheckIn(await maitri.db.events.toArray(), "FT-3")).toMatchObject({ lat: -70.62, lon: 12.1 });

    // Beat 9: one degraded cycle drains the incident first, then the link returns fully.
    await director.setLink("MAITRI", "DEGRADED");
    await sync(maitri);
    expect(maitri.pushedTypes.at(-1)!.slice(0, 2)).toEqual(["INCIDENT_OPENED", "ASSET_STATUS_SET"]);
    await director.runBeat("9");
    await sync(maitri);
    expect((await syncStatus(maitri.db)).pending).toBe(0);

    // Beat 10 (emergent): the conflict is flagged on sync with DOWN kept, and reaches HQ.
    const conflict = listConflicts(db, "OPEN")[0]!;
    expect(conflict).toMatchObject({ entity_id: "SK-2", conservative_value: "DOWN" });
    await sync(hq);
    const flags = await hq.db.events.where("type").equals("CONFLICT_FLAGGED").toArray();
    expect(flags).toHaveLength(1);
    // The flag belongs to Maitri (SK-2's station), so Maitri's leader can resolve it too.
    expect(flags[0]!.node_id).toBe("MAITRI");

    // HQ resolves it as a human action; beat 11: the approval.
    await writeEvent(hq.db, hq.identity, {
      type: "CONFLICT_RESOLVED",
      entity_type: "conflict",
      entity_id: conflict.id,
      node_id: "MAITRI",
      payload: { conflict_id: conflict.id, chosen_value: "DOWN", resolver: "HQ-WEB-01" },
    });
    await sync(hq);
    expect(listConflicts(db, "OPEN")).toHaveLength(0);
    expect(await director.runBeat("11")).toMatchObject({ where: "server", eventsCreated: 3 });

    // Convergence: after a final sync every replica holds the same synced event set.
    for (const t of [maitri, hq, ft3]) await sync(t);
    const [m, h, f] = await Promise.all([syncedIds(maitri), syncedIds(hq), syncedIds(ft3)]);
    expect([...m].sort()).toEqual([...h].sort());
    expect([...f].sort()).toEqual([...h].sort());
    expect(await maitri.db.events.where("type").equals("VESSEL_UPDATED").count()).toBe(1);

    // Reset to Start clears the server and every tab.
    await director.reset();
    expect(await maitri.db.events.count()).toBe(0);
    const state = await app.inject({ method: "GET", url: `${API}/state`, headers: auth(hqDevice) });
    expect(state.json().events).toEqual([]);
    expect(state.json().seed).toEqual(season48);
  });
});
