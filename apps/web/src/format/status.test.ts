import { describe, expect, it } from "vitest";
import { evaluate } from "@dhruv/engine";
import type { OpEvent } from "@dhruv/shared";
import { IDS, season48 } from "@dhruv/seed";
import { dimensionHeadline, dimensionReason, drivingDimension, isAllClear, stationReason, statusLine } from "./status";

const AT = "2027-01-24T08:10:00.000Z";
const base = { device_id: "HQ-WEB-01", created_at_client: AT, observed_at: AT, priority: 3, schema_version: 1 };
const slip = {
  ...base, event_id: "00000000-0000-4000-8000-000000000001", seq: 1, type: "LEG_DELAYED", entity_type: "leg", entity_id: "L2-C104", node_id: "HQ", actor_role: "HQ_OPS",
  payload: { leg_id: "L2-C104", new_eta: "2027-02-07T00:00:00.000Z", reason: "feeder delayed" },
} as OpEvent;
const badFoodCount = {
  ...base, event_id: "00000000-0000-4000-8000-000000000002", device_id: "MAITRI-TAB-01", seq: 1, type: "STOCK_COUNTED", entity_type: "inventory_item", entity_id: IDS.foodMaitri,
  node_id: "MAITRI", actor_role: "STATION_LEADER", payload: { item_id: IDS.foodMaitri, qty: 3 },
} as OpEvent;
const names = { MAITRI: "Maitri", BHARATI: "Bharati" };
const run = (events: OpEvent[]) => evaluate({ seed: season48, events }, AT).stations;
const maitri = (events: OpEvent[]) => run(events).find((s) => s.nodeId === "MAITRI")!;

describe("Command status line and all-clear", () => {
  it("start: all GREEN, all-clear true, next cutoff named", () => {
    const stations = run([]);
    expect(isAllClear(stations, 0)).toBe(true);
    expect(statusLine({ stations, names, decisionDeadlines: [], nextCutoff: "2027-02-04T00:00:00.000Z", now: AT })).toBe("All stations within thresholds. Next vessel cutoff 4 Feb.");
    expect(stationReason(maitri([]))).toBe("All 6 dimensions within thresholds · slip tolerance 22 d");
  });

  it("after the slip: Maitri RED on fuel, 40.0 kL short, one decision due", () => {
    const stations = run([slip]);
    expect(statusLine({ stations, names, decisionDeadlines: ["2027-02-03T00:00:00.000Z"], now: AT })).toBe("Maitri is RED: fuel short 40.0 kL. 1 decision due by 3 Feb.");
    expect(stationReason(maitri([slip]))).toBe("Fuel below requirement: 92.0 of 132.0 kL. Cargo excluded by vessel cutoff.");
    expect(isAllClear(stations, 1)).toBe(false);
  });

  it("regression: food RED with no decision proposed is not all-clear", () => {
    const stations = run([badFoodCount]);
    const m = stations.find((s) => s.nodeId === "MAITRI")!;
    expect(m.state).toBe("RED");
    expect(isAllClear(stations, 0)).toBe(false);
    expect(drivingDimension(m)?.key).toBe("FOOD");
    expect(stationReason(m)).toBe("Food below requirement: 3 of 8,280 person-days.");
    expect(statusLine({ stations, names, decisionDeadlines: [], now: AT })).toBe("Maitri is RED: food short 8,277 person-days.");
  });

  it("headlines per dimension kind", () => {
    const m = maitri([slip]);
    const dim = (k: string) => m.dimensions.find((d) => d.key === k)!;
    expect(dimensionHeadline(dim("FUEL"))).toBe("−40.0 kL short");
    expect(dimensionHeadline(dim("FOOD"))).toBe("+620 person-days margin");
    expect(dimensionHeadline(dim("COMMS"))).toBe("VSAT + IRD");
    expect(dimensionHeadline(dim("PERSONNEL"))).toMatch(/^\w[\w ]* \d+ of need \d+$/);
    expect(dimensionReason(dim("FOOD"))).toBe("Food within requirement: 8,900 of 8,280 person-days.");
  });
});
