import { describe, expect, it } from "vitest";
import type { OpEvent, Seed } from "@dhruv/shared";
import { evaluate, type EngineInput } from "../src/index.js";

const seed: Seed = {
  nodes: [
    { id: "CAPE_TOWN", name: "Cape Town", type: "CITY", lat: -33.92, lon: 18.42 },
    { id: "MAITRI", name: "Maitri", type: "STATION", lat: -70.77, lon: 11.73 },
  ],
  vessels: [
    {
      id: "V-ICE-STAR", name: "MV Ice Star",
      departure: "2027-02-06T00:00:00.000Z",
      load_cutoff: "2027-02-04T00:00:00.000Z",
      eta_station: "2027-02-24T00:00:00.000Z",
      station_closing_date: "2027-02-28T00:00:00.000Z",
    },
  ],
  shipments: [{ id: "C-104", name: "Diesel Resupply", priority: "CRITICAL", dest_node_id: "MAITRI" }],
  legs: [
    { id: "L2-C104", shipment_id: "C-104", seq: 2, from_node: "MUMBAI", to_node: "CAPE_TOWN", etd: "2027-01-12T00:00:00.000Z", eta: "2027-02-02T00:00:00.000Z", vessel_id: null, status: "IN_TRANSIT" },
    { id: "L3-C104", shipment_id: "C-104", seq: 3, from_node: "CAPE_TOWN", to_node: "MAITRI", etd: "2027-02-06T00:00:00.000Z", eta: "2027-02-24T00:00:00.000Z", vessel_id: "V-ICE-STAR", status: "PLANNED" },
  ],
  inventory_items: [
    { id: "INV-DSL", node_id: "MAITRI", name: "Diesel", category: "Fuel", unit: "kL", stock: 92.0, reserve_pct: 0.10, requirement_mode: "BURN", fixed_requirement: null, dimension: "FUEL", last_counted: "2027-01-24T04:00:00.000Z", count_source: "PHYSICAL" },
  ],
  consumption_profiles: [
    { item_id: "INV-DSL", phase: "CLOSING", rate_per_day: 0.55 },
    { item_id: "INV-DSL", phase: "WINTER", rate_per_day: 0.38 },
    { item_id: "INV-DSL", phase: "MOBILISATION", rate_per_day: 0.35 },
  ],
  cargo_items: [{ id: "CI-C104-DSL", shipment_id: "C-104", inventory_item_id: "INV-DSL", qty: 48.0 }],
  personnel: [],
  assets: [],
  missions: [],
  levers: [],
  dependencies: [],
  link_state: [],
};

const legDelayed: OpEvent = {
  event_id: "e1000000-0000-4000-8000-000000000001",
  device_id: "HQ-WEB-01",
  seq: 1,
  type: "LEG_DELAYED",
  entity_type: "leg",
  entity_id: "L2-C104",
  node_id: "HQ",
  payload: { leg_id: "L2-C104", new_eta: "2027-02-07T00:00:00.000Z", reason: "port congestion" },
  observed_at: "2027-01-24T08:10:00.000Z",
  created_at_client: "2027-01-24T08:10:00.000Z",
  priority: 3,
  actor_role: "HQ_OPS",
  schema_version: 1,
};

describe("evaluate", () => {
  it("LEG_DELAYED C-104 feeder to 7 Feb: Maitri fuel RED at 0.697", () => {
    const input: EngineInput = { seed, events: [legDelayed] };
    const result = evaluate(input, "2027-01-24T08:10:00.000Z");

    expect(result.stations[0]?.state).toBe("RED");
    expect(result.stations[0]?.dimensions[0]?.ratio).toBeCloseTo(0.697, 3);
  });
});
