import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { applySchema } from "./schema.js";
import { writeEvent, listEvents } from "./events.js";
import type { EventEnvelope } from "@dhruv/shared";

function makeDb() {
  const db = new Database(":memory:");
  applySchema(db);
  return db;
}

const sampleEvent: EventEnvelope = {
  device_id: "maitri-leader",
  seq: 1,
  observed_at: "2027-01-24T04:00:00.000Z",
  priority: 3,
  type: "STOCK_COUNTED",
  payload: { item: "diesel", quantity_kl: 92.0 },
};

describe("writeEvent idempotency", () => {
  it("applies a new event once", () => {
    const db = makeDb();
    const result = writeEvent(db, sampleEvent);
    expect(result.applied).toBe(true);
    expect(listEvents(db)).toHaveLength(1);
  });

  it("is a no-op when the same (device_id, seq) is pushed again", () => {
    const db = makeDb();
    const first = writeEvent(db, sampleEvent);
    const second = writeEvent(db, sampleEvent);

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    // row count unchanged after double-push
    expect(listEvents(db)).toHaveLength(1);
  });

  it("orders events by (observed_at, device_id, seq)", () => {
    const db = makeDb();
    writeEvent(db, { ...sampleEvent, seq: 2, observed_at: "2027-01-25T00:00:00.000Z" });
    writeEvent(db, { ...sampleEvent, seq: 1, observed_at: "2027-01-24T00:00:00.000Z" });

    const events = listEvents(db);
    expect(events.map((e) => e.seq)).toEqual([1, 2]);
  });
});
