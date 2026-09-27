import { describe, expect, it } from "vitest";
import { evaluate, fuelRobustness } from "@dhruv/engine";
import type { EventType, OpEvent } from "@dhruv/shared";
import { season48 } from "@dhruv/seed";

const AT = "2027-01-24T08:10:00.000Z";
let seq = 0;
const ev = (type: EventType, entity_type: string, entity_id: string, payload: Record<string, unknown>, node_id = "HQ", actor_role: OpEvent["actor_role"] = "HQ_OPS"): OpEvent => ({
  event_id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
  device_id: "HQ-WEB-01", seq, type, entity_type, entity_id, node_id, payload,
  observed_at: "2027-01-24T08:05:00.000Z", created_at_client: "2027-01-24T08:05:00.000Z", priority: 3, actor_role, schema_version: 1,
});
const fuelRatio = (events: OpEvent[], node = "MAITRI") =>
  evaluate({ seed: season48, events }, AT).stations.find((s) => s.nodeId === node)!.dimensions.find((d) => d.key === "FUEL")!.ratio!;

describe("fuel robustness on live state", () => {
  it("Γ = 0 is the dashboard's fuel ratio, and the curve matches the robustness README", () => {
    const r = fuelRobustness({ seed: season48, events: [] }, "MAITRI", AT)!;
    expect(r.curve[0]!.ratio).toBeCloseTo(fuelRatio([]), 10);
    expect(r.curve.map((c) => c.ratio.toFixed(4))).toEqual(["1.0606", "0.6970", "0.6061", "0.5455"]);
    expect(r.curve.map((c) => c.state)).toEqual(["GREEN", "RED", "RED", "RED"]);
    expect(r.curve[1]!.bindingInputs).toEqual(["feeder_weather_delay"]);
    expect(r.feeder).toMatchObject({ legId: "L2-C104", slackDays: 2 });
    expect(r.inboundQty).toBe(48);
  });

  it("follows the log: after the C-104 slip there is no inbound to delay, so the shipment deviation drops out", () => {
    const slip = ev("LEG_DELAYED", "leg", "L2-C104", { leg_id: "L2-C104", new_eta: "2027-02-07T00:00:00.000Z", reason: "feeder delayed" });
    const r = fuelRobustness({ seed: season48, events: [slip] }, "MAITRI", AT)!;
    expect(r.curve[0]!.ratio).toBeCloseTo(fuelRatio([slip]), 10);
    expect(r.feeder).toBeUndefined();
    expect(r.uncertainties.map((u) => u.name)).toEqual(["cold_snap_burn_rate", "tank_measurement_error"]);
    expect(r.curve).toHaveLength(3);
  });

  it("counts, burn-rate changes and Bharati's own fuel feed the same numbers as evaluate()", () => {
    const count = ev("STOCK_COUNTED", "inventory_item", "INV-DSL", { item_id: "INV-DSL", qty: 80 }, "MAITRI", "STATION_LEADER");
    const burn = ev("BURN_RATE_CHANGED", "inventory_item", "INV-DSL", { item_id: "INV-DSL", phase: "WINTER", uplift_pct: 10 }, "MAITRI", "STATION_LEADER");
    expect(fuelRobustness({ seed: season48, events: [count, burn] }, "MAITRI", AT)!.curve[0]!.ratio).toBeCloseTo(fuelRatio([count, burn]), 10);
    const bharati = fuelRobustness({ seed: season48, events: [] }, "BHARATI", AT)!;
    expect(bharati.curve[0]!.ratio).toBeCloseTo(fuelRatio([], "BHARATI"), 10);
    expect(bharati.feeder).toBeUndefined();
  });
});
