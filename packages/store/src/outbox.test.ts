import { beforeEach, describe, expect, it } from "vitest";
import type { EventEnvelope } from "@dhruv/shared";
import { createDb, type DhruvDb } from "./db.js";
import { commitLocalEvent, drainOutbox } from "./outbox.js";

const sampleEvent: EventEnvelope = {
  device_id: "maitri-leader",
  seq: 1,
  observed_at: "2027-01-24T09:15:00.000Z",
  priority: 3,
  type: "STOCK_COUNTED",
  payload: { item: "diesel", quantity_kl: 92.0 },
};

let db: DhruvDb;

beforeEach(async () => {
  db = createDb(`test-${Math.random()}`);
  await db.open();
});

describe("commitLocalEvent", () => {
  it("writes to both the local events table and the outbox", async () => {
    await commitLocalEvent(db, sampleEvent);

    const stored = await db.events.get([sampleEvent.device_id, sampleEvent.seq]);
    expect(stored).toEqual(sampleEvent);

    const outboxEntries = await db.outbox.toArray();
    expect(outboxEntries).toHaveLength(1);
    expect(outboxEntries[0].event).toEqual(sampleEvent);
  });
});

describe("drainOutbox", () => {
  it("removes entries the server acknowledges, in either applied state", async () => {
    await commitLocalEvent(db, sampleEvent);
    await commitLocalEvent(db, { ...sampleEvent, seq: 2 });

    const result = await drainOutbox(db, async (events) => ({
      results: events.map((e) => ({ device_id: e.device_id, seq: e.seq, applied: true })),
    }));

    expect(result).toEqual({ pushed: 2, remaining: 0 });
    expect(await db.outbox.count()).toBe(0);
  });

  it("keeps entries the server did not acknowledge, for retry", async () => {
    await commitLocalEvent(db, sampleEvent);
    await commitLocalEvent(db, { ...sampleEvent, seq: 2 });

    // Simulate the server only acking seq 1 (e.g. seq 2 failed validation).
    const result = await drainOutbox(db, async () => ({
      results: [{ device_id: sampleEvent.device_id, seq: 1, applied: true }],
    }));

    expect(result).toEqual({ pushed: 1, remaining: 1 });
    const remaining = await db.outbox.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].seq).toBe(2);
  });

  it("is a no-op on an empty outbox", async () => {
    const result = await drainOutbox(db, async () => ({ results: [] }));
    expect(result).toEqual({ pushed: 0, remaining: 0 });
  });
});
