import { beforeEach, describe, expect, it } from "vitest";
import type { OpEvent, PushRequest, PushResponse } from "@dhruv/shared";
import { DhruvDb } from "./db.js";
import { now } from "./clock.js";
import { jumpClock, linkStatus, setLinkStatus } from "./controls.js";
import { drainOutbox, selectForDrain } from "./outbox.js";
import { pullOnce, syncOnce, syncStatus } from "./sync.js";
import { writeEvent, type DeviceIdentity } from "./write.js";

const maitri: DeviceIdentity = { device_id: "MAITRI-TAB-01", role: "STATION_LEADER", node_id: "MAITRI" };
const hq: DeviceIdentity = { device_id: "HQ-WEB-01", role: "HQ_OPS", node_id: "HQ" };

let db: DhruvDb;
beforeEach(async () => {
  db = new DhruvDb(`test-${Math.random()}`);
  await db.open();
});

const t = (day: number, hhmm: string) => `2027-01-${String(day).padStart(2, "0")}T${hhmm}:00.000Z`;

function count(qty: number, observed_at?: string) {
  return { type: "STOCK_COUNTED" as const, entity_type: "inventory_item", entity_id: "INV-DSL", payload: { item_id: "INV-DSL", qty }, observed_at };
}

function acceptAll(calls: PushRequest[] = []) {
  return async (req: PushRequest): Promise<PushResponse> => {
    calls.push(req);
    return { accepted: req.events.map((e) => e.event_id), duplicates: [], rejected: [], recorded_at_server: "2026-09-23T00:00:00.000Z" };
  };
}

describe("writeEvent (sections 9, 16)", () => {
  it("assigns uuid, monotonic seq, default priority and the clock's observed_at; writes events and outbox together", async () => {
    const a = await writeEvent(db, maitri, count(92));
    const b = await writeEvent(db, maitri, count(91));

    expect(a).toMatchObject({ device_id: "MAITRI-TAB-01", seq: 1, priority: 2, actor_role: "STATION_LEADER", node_id: "MAITRI", observed_at: t(24, "08:00") });
    expect(b.seq).toBe(2);
    expect(a.event_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await db.events.count()).toBe(2);
    expect(await db.outbox.count()).toBe(2);
  });

  it("keeps CLOCK_ADVANCED and LINK_STATE_SET out of the outbox (never synced)", async () => {
    await jumpClock(db, maitri, t(25, "16:00"));
    await setLinkStatus(db, maitri, "OFFLINE");
    expect(await db.events.count()).toBe(2);
    expect(await db.outbox.count()).toBe(0);
  });

  it("refuses events the role may not write, and invalid payloads", async () => {
    await expect(
      writeEvent(db, maitri, { type: "LEG_DELAYED", entity_type: "leg", entity_id: "L2-C104", payload: { leg_id: "L2-C104", new_eta: t(30, "00:00"), reason: "x" } }),
    ).rejects.toThrow(/may not write/);
    await expect(writeEvent(db, maitri, { ...count(1), payload: { item_id: "INV-DSL" } })).rejects.toThrow();
  });
});

describe("demo clock (section 8, v2 C5)", () => {
  it("starts at the demo start and follows absolute jumps", async () => {
    expect(await now(db)).toBe("2027-01-24T08:00:00.000Z");
    await jumpClock(db, maitri, t(25, "16:00"));
    expect(await now(db)).toBe(t(25, "16:00"));
    await jumpClock(db, maitri, t(24, "08:00"));
    expect(await now(db)).toBe(t(24, "08:00"));
  });
});

describe("priority drain and link simulation (section 9)", () => {
  it("sends incident first, then personnel, fuel, cargo", async () => {
    await writeEvent(db, maitri, { type: "MISSION_UPDATED", entity_type: "mission", entity_id: "F-27", payload: { mission_id: "F-27", fields: {} } });
    await writeEvent(db, maitri, count(92));
    await writeEvent(db, maitri, { type: "ASSET_STATUS_SET", entity_type: "asset", entity_id: "SK-2", payload: { asset_id: "SK-2", status: "DOWN" } });
    await writeEvent(db, maitri, {
      type: "INCIDENT_OPENED",
      entity_type: "incident",
      entity_id: "INC-01",
      payload: { incident_id: "INC-01", type: "OVERDUE", person_ids: [], last_confirmed_at: t(25, "07:00") },
    });

    const calls: PushRequest[] = [];
    const sentBytes = (await db.outbox.toArray()).reduce((sum, e) => sum + e.bytes, 0);
    const result = await drainOutbox(db, maitri, acceptAll(calls));
    expect(calls[0]!.events.map((e) => e.type)).toEqual(["INCIDENT_OPENED", "ASSET_STATUS_SET", "STOCK_COUNTED", "MISSION_UPDATED"]);
    expect(result.bytes).toBe(sentBytes);
    expect(await db.outbox.count()).toBe(0);
    expect((await db.events.toArray()).every((e) => e.recorded_at_server)).toBe(true);
  });

  it("Offline: nothing leaves and push is never called", async () => {
    await writeEvent(db, maitri, count(92));
    await setLinkStatus(db, maitri, "OFFLINE");
    expect(await linkStatus(db, "MAITRI")).toBe("OFFLINE");

    let called = false;
    const result = await drainOutbox(db, maitri, async () => {
      called = true;
      throw new Error("should not be called");
    });
    expect(called).toBe(false);
    expect(result).toMatchObject({ sent: 0, remaining: 1, skipped: "offline", bytes: 0 });
  });

  it("Degraded: sends in priority order within 2.5 KB per demo second, P5 waits", () => {
    const entry = (priority: number, seq: number, bytes: number) =>
      ({ device_id: "D", seq, priority, bytes, status: "pending", queued_at: "", event: { seq } as unknown as OpEvent }) as const;
    const pending = [entry(5, 1, 100), entry(3, 2, 1200), entry(0, 3, 900), entry(1, 4, 900)];

    expect(selectForDrain([...pending], "DEGRADED", 1).map((e) => e.seq)).toEqual([3, 4]);
    expect(selectForDrain([...pending], "DEGRADED", 2).map((e) => e.seq)).toEqual([3, 4, 2]);
    expect(selectForDrain([...pending], "ONLINE", 1).map((e) => e.seq)).toEqual([3, 4, 2, 1]);
  });

  it("marks server-rejected entries and does not resend them", async () => {
    const e = await writeEvent(db, maitri, count(92));
    await drainOutbox(db, maitri, async () => ({ accepted: [], duplicates: [], rejected: [{ event_id: e.event_id, code: "INVALID_EVENT", message: "why" }], recorded_at_server: "" }));
    expect((await db.outbox.toArray())[0]).toMatchObject({ status: "rejected", rejected_code: "INVALID_EVENT", rejected_message: "why" });

    const status = await syncStatus(db);
    expect(status).toMatchObject({ pending: 0, rejected: 1 });
    const calls: PushRequest[] = [];
    await drainOutbox(db, maitri, acceptAll(calls));
    expect(calls).toHaveLength(0);
  });
});

describe("pull and sync runner", () => {
  it("stores pulled events and advances the cursor; repeats are harmless", async () => {
    const remote = { ...(await writeEvent(new DhruvDb(`r-${Math.random()}`), hq, { ...count(10), node_id: "MAITRI" })) };
    const pull = async (since: number) => ({ events: since === 0 ? [remote] : [], cursor: 7 });

    expect(await pullOnce(db, pull)).toBe(1);
    expect(await pullOnce(db, pull)).toBe(0);
    expect(await db.events.get(remote.event_id)).toEqual(remote);
  });

  it("drops a pull response when the store was reset while the request was out", async () => {
    const remote = await writeEvent(new DhruvDb(`r-${Math.random()}`), hq, { ...count(10), node_id: "MAITRI" });
    await db.meta.put({ key: "cursor", value: 13 });
    const pull = async () => {
      // A Director reset lands mid-request.
      await db.meta.clear();
      return { events: [remote], cursor: 13 };
    };
    expect(await pullOnce(db, pull)).toBe(0);
    expect(await db.events.count()).toBe(0);
    expect(await db.meta.get("cursor")).toBeUndefined();
  });

  it("backs off 2, 4, 8, 16, 30 s and is stalled after 5 failures", async () => {
    const failing = { push: async () => Promise.reject(new Error("down")), pull: async () => Promise.reject(new Error("down")) };
    await writeEvent(db, maitri, count(92));

    const delays: number[] = [];
    let last;
    for (let i = 0; i < 6; i++) {
      last = await syncOnce(db, maitri, failing);
      if (!last.ok && "retryInSeconds" in last) delays.push(last.retryInSeconds);
    }
    expect(delays).toEqual([2, 4, 8, 16, 30, 30]);
    expect(last).toMatchObject({ stalled: true });
    expect((await syncStatus(db)).pending).toBe(1);
  });
});

describe("T-FRESH-04 mechanism (viewer-relative freshness, zero network)", () => {
  it("Maitri sees its 09:15 count as 6 h 45 min old; HQ, before sync, still holds the 04:00 count at 36 h", async () => {
    const maitriDb = new DhruvDb(`m-${Math.random()}`);
    const hqDb = new DhruvDb(`h-${Math.random()}`);

    await writeEvent(hqDb, hq, { ...count(92, t(24, "04:00")), node_id: "MAITRI" });
    await writeEvent(maitriDb, maitri, count(92, t(25, "09:15")));
    await jumpClock(maitriDb, maitri, t(25, "16:00"));
    await jumpClock(hqDb, hq, t(25, "16:00"));

    const ageHours = async (d: DhruvDb) => {
      const latest = (await d.events.where("type").equals("STOCK_COUNTED").toArray()).sort((a, b) => a.observed_at.localeCompare(b.observed_at)).at(-1)!;
      return (Date.parse(await now(d)) - Date.parse(latest.observed_at)) / 3_600_000;
    };
    expect(await ageHours(maitriDb)).toBe(6.75);
    expect(await ageHours(hqDb)).toBe(36);
  });
});
