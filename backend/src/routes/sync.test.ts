import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import type { EventEnvelope } from "@dhruv/shared";
import { openDb } from "../db/index.js";
import { buildApp } from "../app.js";
import { issueDemoToken } from "../auth.js";

function authHeader() {
  return { Authorization: `Bearer ${issueDemoToken("hq")}` };
}

function makeEvents(count: number): EventEnvelope[] {
  const devices = ["maitri-leader", "hq-ops", "bharati-leader"];
  return Array.from({ length: count }, (_, i) => ({
    device_id: devices[i % devices.length],
    seq: Math.floor(i / devices.length) + 1,
    observed_at: new Date(2027, 0, 24, 0, 0, i).toISOString(),
    priority: i % 6,
    type: "TEST_EVENT",
    payload: { i },
  }));
}

function shuffled<T>(items: T[], seed: number): T[] {
  const copy = [...items];
  let s = seed;
  for (let i = copy.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function pushOneAtATime(app: FastifyInstance, events: EventEnvelope[]) {
  for (const event of events) {
    await app.inject({ method: "POST", url: "/events", headers: authHeader(), payload: event });
  }
}

async function pullAll(app: FastifyInstance): Promise<EventEnvelope[]> {
  const res = await app.inject({ method: "GET", url: "/state", headers: authHeader() });
  return res.json().events;
}

describe("sync convergence (T-SYNC-01 precursor: raw event log)", () => {
  let dbA: Database.Database;
  let dbB: Database.Database;
  let appA: FastifyInstance;
  let appB: FastifyInstance;

  beforeEach(() => {
    dbA = openDb(":memory:");
    dbB = openDb(":memory:");
    appA = buildApp(dbA);
    appB = buildApp(dbB);
  });

  it("produces the same stored event set regardless of arrival order", async () => {
    const events = makeEvents(50);

    // Two replicas receive the same 50 events in two different shuffled orders.
    await pushOneAtATime(appA, shuffled(events, 1));
    await pushOneAtATime(appB, shuffled(events, 2));

    const stateA = await pullAll(appA);
    const stateB = await pullAll(appB);

    expect(stateA).toEqual(stateB);
    expect(stateA).toHaveLength(50);
  });

  it("/sync/push idempotently accepts a repeated batch", async () => {
    const events = makeEvents(5);

    const first = await appA.inject({
      method: "POST",
      url: "/sync/push",
      headers: authHeader(),
      payload: { events },
    });
    const second = await appA.inject({
      method: "POST",
      url: "/sync/push",
      headers: authHeader(),
      payload: { events },
    });

    expect(first.json().results.every((r: { applied: boolean }) => r.applied)).toBe(true);
    expect(second.json().results.every((r: { applied: boolean }) => r.applied === false)).toBe(true);

    const state = await pullAll(appA);
    expect(state).toHaveLength(5);
  });

  it("/sync/pull with a cursor returns only events after the watermark", async () => {
    const events = makeEvents(6);
    await appA.inject({ method: "POST", url: "/sync/push", headers: authHeader(), payload: { events } });

    const full = await appA.inject({ method: "GET", url: "/sync/pull", headers: authHeader() });
    const { events: fullEvents, cursor } = full.json();
    expect(fullEvents).toHaveLength(6);

    const resumed = await appA.inject({
      method: "GET",
      url: `/sync/pull?after_observed_at=${encodeURIComponent(cursor.observed_at)}&after_device_id=${cursor.device_id}&after_seq=${cursor.seq}`,
      headers: authHeader(),
    });
    expect(resumed.json().events).toHaveLength(0);

    const midpointCursor = { observed_at: fullEvents[2].observed_at, device_id: fullEvents[2].device_id, seq: fullEvents[2].seq };
    const partial = await appA.inject({
      method: "GET",
      url: `/sync/pull?after_observed_at=${encodeURIComponent(midpointCursor.observed_at)}&after_device_id=${midpointCursor.device_id}&after_seq=${midpointCursor.seq}`,
      headers: authHeader(),
    });
    expect(partial.json().events).toHaveLength(3);
  });
});
