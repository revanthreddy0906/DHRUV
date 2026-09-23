import { afterEach, describe, expect, it } from "vitest";
import { DhruvDb } from "./db.js";
import { now } from "./clock.js";
import { linkStatus } from "./controls.js";
import { attachDirectorListener, createDirector, type Director, type DirectorAdminApi, type DirectorChannel } from "./director.js";
import { writeEvent, type DeviceIdentity } from "./write.js";

const HQ: DeviceIdentity = { device_id: "HQ-WEB-01", role: "HQ_OPS", node_id: "HQ" };
const MAITRI: DeviceIdentity = { device_id: "MAITRI-TAB-01", role: "STATION_LEADER", node_id: "MAITRI" };
const FT3: DeviceIdentity = { device_id: "FT3-TAB-01", role: "FIELD_LEAD", node_id: "MAITRI" };

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

let channelName = "";
function channel(): DirectorChannel {
  const c = new BroadcastChannel(channelName) as unknown as DirectorChannel;
  cleanups.push(() => c.close());
  return c;
}

/** One simulated tab: its own store, its own channel, a Director listener. */
function openTab(identity: DeviceIdentity) {
  const db = new DhruvDb(`tab-${identity.device_id}-${Math.random()}`);
  const detach = attachDirectorListener(db, identity, channel());
  cleanups.push(detach);
  return db;
}

function setup(...tabs: DeviceIdentity[]) {
  channelName = `director-test-${Math.random()}`;
  const serverBeats: string[] = [];
  const admin: DirectorAdminApi & { resets: number } = {
    resets: 0,
    runServerBeat: async (beat) => {
      serverBeats.push(beat);
      return { events_created: 1 };
    },
    resetServer: async () => {
      admin.resets += 1;
    },
  };
  const dbs = Object.fromEntries(tabs.map((t) => [t.device_id, openTab(t)]));
  const director: Director = createDirector({ channel: channel(), admin, timeoutMs: 150 });
  return { director, dbs, admin, serverBeats };
}

describe("Scenario Director", () => {
  it("discovers the open device tabs", async () => {
    const { director } = setup(HQ, MAITRI);
    const devices = await director.devices();
    expect(devices.map((d) => d.device_id).sort()).toEqual(["HQ-WEB-01", "MAITRI-TAB-01"]);
  });

  it("server beats go to the admin endpoint", async () => {
    const { director, serverBeats } = setup(HQ);
    const result = await director.runBeat("1");
    expect(serverBeats).toEqual(["1"]);
    expect(result).toMatchObject({ where: "server", appliedOn: ["server"], eventsCreated: 1 });
  });

  it("beat 4 lands only in Maitri's local store and outbox, not HQ's", async () => {
    const { director, dbs } = setup(HQ, MAITRI);
    const result = await director.runBeat("4");

    expect(result.appliedOn).toEqual(["MAITRI-TAB-01"]);
    expect(await dbs["MAITRI-TAB-01"].outbox.count()).toBe(4);
    expect(await dbs["HQ-WEB-01"].events.count()).toBe(0);
    const types = (await dbs["MAITRI-TAB-01"].events.toArray()).map((e) => e.type).sort();
    expect(types).toEqual(["ASSET_STATUS_SET", "MISSION_UPDATED", "STOCK_COUNTED", "STOCK_ISSUED"]);
  });

  it("beat 6 jumps every open tab to 25 Jan 16:00", async () => {
    const { director, dbs } = setup(HQ, MAITRI, FT3);
    const result = await director.runBeat("6");
    expect(result.appliedOn.sort()).toEqual(["FT3-TAB-01", "HQ-WEB-01", "MAITRI-TAB-01"]);
    for (const db of Object.values(dbs)) expect(await now(db)).toBe("2027-01-25T16:00:00.000Z");
  });

  it("link control only affects devices at that node", async () => {
    const { director, dbs } = setup(HQ, MAITRI);
    await director.runBeat("3");
    expect(await linkStatus(dbs["MAITRI-TAB-01"], "MAITRI")).toBe("OFFLINE");
    expect(await linkStatus(dbs["HQ-WEB-01"], "HQ")).toBe("ONLINE");

    expect(await director.setLink("MAITRI", "DEGRADED")).toEqual(["MAITRI-TAB-01"]);
    expect(await linkStatus(dbs["MAITRI-TAB-01"], "MAITRI")).toBe("DEGRADED");
  });

  it("fails loudly when the device a beat needs is not open", async () => {
    const { director } = setup(HQ, MAITRI);
    await expect(director.runBeat("7")).rejects.toThrow(/no response from FT3-TAB-01/);
  });

  it("surfaces a device-side refusal (Maitri tab logged in with the wrong role)", async () => {
    const { director } = setup({ ...MAITRI, role: "FIELD_LEAD" });
    await expect(director.runBeat("4")).rejects.toThrow(/MAITRI-TAB-01: actor_role STATION_LEADER/);
  });

  it("reset clears the server and every open tab's local store", async () => {
    const { director, dbs, admin } = setup(HQ, MAITRI);
    await writeEvent(dbs["MAITRI-TAB-01"], MAITRI, { type: "STOCK_COUNTED", entity_type: "inventory_item", entity_id: "INV-DSL", payload: { item_id: "INV-DSL", qty: 92 } });

    expect((await director.reset()).sort()).toEqual(["HQ-WEB-01", "MAITRI-TAB-01"]);
    expect(admin.resets).toBe(1);
    expect(await dbs["MAITRI-TAB-01"].events.count()).toBe(0);
    expect(await dbs["MAITRI-TAB-01"].outbox.count()).toBe(0);
  });

  it("beat 9 pauses between its steps so the degraded state is visible, and ends online", async () => {
    channelName = `director-test-${Math.random()}`;
    const maitriDb = openTab(MAITRI);
    const director = createDirector({ channel: channel(), admin: { runServerBeat: async () => ({ events_created: 0 }), resetServer: async () => {} }, timeoutMs: 150, stepDelayMs: 80 });

    const started = Date.now();
    const pending = director.runBeat("9");
    await new Promise((r) => setTimeout(r, 40));
    expect(await linkStatus(maitriDb, "MAITRI")).toBe("DEGRADED");
    await pending;

    expect(Date.now() - started).toBeGreaterThanOrEqual(80);
    expect(await linkStatus(maitriDb, "MAITRI")).toBe("ONLINE");
  });

  it("beat 10 is emergent; unknown beats are errors", async () => {
    const { director } = setup(HQ);
    expect(await director.runBeat("10")).toMatchObject({ where: "emergent", appliedOn: [] });
    await expect(director.runBeat("99")).rejects.toThrow(/no Director beat 99/);
  });
});
