import { describe, expect, it } from "vitest";
import { evaluate } from "@dhruv/engine";
import type { OpEvent } from "@dhruv/shared";
import { IDS, season48 } from "@dhruv/seed";
import { drivingDimension, traceSentence } from "../format";
import { traceDrawerProps } from "./traceView";

const AT = "2027-01-24T08:10:00.000Z";
const base = { created_at_client: AT, observed_at: AT, priority: 3, schema_version: 1 };
const slip = { ...base, event_id: "00000000-0000-4000-8000-000000000001", device_id: "HQ-WEB-01", seq: 1, type: "LEG_DELAYED", entity_type: "leg", entity_id: "L2-C104", node_id: "HQ", actor_role: "HQ_OPS",
  payload: { leg_id: "L2-C104", new_eta: "2027-02-07T00:00:00.000Z", reason: "feeder delayed" } } as OpEvent;
const foodCount = { ...base, event_id: "00000000-0000-4000-8000-000000000002", device_id: "MAITRI-TAB-01", seq: 1, type: "STOCK_COUNTED", entity_type: "inventory_item", entity_id: IDS.foodMaitri, node_id: "MAITRI", actor_role: "STATION_LEADER",
  payload: { item_id: IDS.foodMaitri, qty: 3 } } as OpEvent;
const maitri = (events: OpEvent[]) => evaluate({ seed: season48, events }, AT).stations.find((s) => s.nodeId === "MAITRI")!;
const rowMath = (events: OpEvent[]) => { const st = maitri(events); return traceDrawerProps(st, drivingDimension(st)!.key, "Maitri", "HQ-WEB-01", "24 Jan 2027, 08:10")!; };

describe("Show the math from a station row", () => {
  it("after the slip opens Fuel, with the engine's golden numbers at engine precision", () => {
    const p = rowMath([slip]);
    expect(p.title).toBe("Maitri · Fuel");
    expect(p.state).toBe("RED");
    const r03 = p.steps.find((s) => s.rule === "R03")!;
    expect(r03.text).toContain("92.0 / 132.0 = 0.6970");
    expect(traceSentence(r03, p.units)).toBe("Availability vs requirement: 92.0 of 132.0 kL = 0.6970, RED");
    expect(p.steps.find((s) => s.rule === "R01")!.text).toContain("= 132.00");
  });
  it("a station RED on food opens Food, not Fuel", () => {
    const p = rowMath([foodCount]);
    expect(p.title).toBe("Maitri · Food");
    expect(p.state).toBe("RED");
    expect(p.steps.map((s) => s.rule)).toContain("R19");
  });
});
