import { describe, expect, it } from "vitest";
import type { OpEvent, Seed } from "@dhruv/shared";
import {
  evaluate,
  reduce,
  computePob,
  computeFoodRequirement,
  type EngineInput,
} from "../src/index.js";
import type { InventoryState, PersonnelState } from "../src/state.js";

// Canonical seed representing Maitri with diesel, food, and 24 wintering personnel
const seed: Seed = {
  nodes: [
    { id: "CAPE_TOWN", name: "Cape Town", type: "CITY", lat: -33.92, lon: 18.42 },
    { id: "MAITRI", name: "Maitri", type: "STATION", lat: -70.77, lon: 11.73 },
  ],
  vessels: [
    {
      id: "V-ICE-STAR",
      name: "MV Ice Star",
      departure: "2027-02-06T00:00:00.000Z",
      load_cutoff: "2027-02-04T00:00:00.000Z",
      eta_station: "2027-02-24T00:00:00.000Z",
      station_closing_date: "2027-02-28T00:00:00.000Z",
    },
  ],
  shipments: [
    { id: "C-104", name: "Diesel Resupply", priority: "CRITICAL", dest_node_id: "MAITRI" },
  ],
  legs: [
    { id: "L2-C104", shipment_id: "C-104", seq: 2, from_node: "MUMBAI", to_node: "CAPE_TOWN", etd: "2027-01-12T00:00:00.000Z", eta: "2027-02-02T00:00:00.000Z", vessel_id: null, status: "IN_TRANSIT" },
    { id: "L3-C104", shipment_id: "C-104", seq: 3, from_node: "CAPE_TOWN", to_node: "MAITRI", etd: "2027-02-06T00:00:00.000Z", eta: "2027-02-24T00:00:00.000Z", vessel_id: "V-ICE-STAR", status: "PLANNED" },
  ],
  inventory_items: [
    { id: "INV-DSL", node_id: "MAITRI", name: "Diesel", category: "Fuel", unit: "kL", stock: 92.0, reserve_pct: 0.10, requirement_mode: "BURN", fixed_requirement: null, dimension: "FUEL", last_counted: "2027-01-24T04:00:00.000Z", count_source: "PHYSICAL" },
    { id: "INV-FOOD-MAITRI", node_id: "MAITRI", name: "Food", category: "Rations", unit: "person-days", stock: 8900, reserve_pct: 0.15, requirement_mode: "BURN", fixed_requirement: null, dimension: "FOOD", last_counted: "2027-01-23T20:00:00.000Z", count_source: "PHYSICAL" },
  ],
  consumption_profiles: [
    { item_id: "INV-DSL", phase: "CLOSING", rate_per_day: 0.55 },
    { item_id: "INV-DSL", phase: "WINTER", rate_per_day: 0.38 },
    { item_id: "INV-DSL", phase: "MOBILISATION", rate_per_day: 0.35 },
    { item_id: "INV-FOOD-MAITRI", phase: "CLOSING", rate_per_day: 24 },
    { item_id: "INV-FOOD-MAITRI", phase: "WINTER", rate_per_day: 24 },
    { item_id: "INV-FOOD-MAITRI", phase: "MOBILISATION", rate_per_day: 24 },
  ],
  cargo_items: [
    { id: "CI-C104-DSL", shipment_id: "C-104", inventory_item_id: "INV-DSL", qty: 48.0 },
  ],
  personnel: [
    { id: "P-RAO", name: "Cdr A. Rao", role: "STATION_LEADER", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
    { id: "P-MENON", name: "Dr K. Menon", role: "DOCTOR", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
    { id: "P-SHAH", name: "Dr P. Shah", role: "DOCTOR", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
    { id: "P-MECH1", name: "Diesel Mechanic 1", role: "DIESEL_MECHANIC", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
    { id: "P-MECH2", name: "Diesel Mechanic 2", role: "DIESEL_MECHANIC", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
    { id: "P-ELEC1", name: "Electrician 1", role: "ELECTRICIAN", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
    { id: "P-ELEC2", name: "Electrician 2", role: "ELECTRICIAN", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
    { id: "P-IYER", name: "V. Iyer", role: "COMMS_ENGINEER", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
    { id: "P-COMMS2", name: "Comms Engineer 2", role: "COMMS_ENGINEER", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
    { id: "P-COOK1", name: "Cook 1", role: "COOK", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
    { id: "P-COOK2", name: "Cook 2", role: "COOK", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
    { id: "P-VERMA", name: "Dr A. Verma", role: "GLACIOLOGIST", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
    { id: "P-GLAC2", name: "Glaciologist 2", role: "GLACIOLOGIST", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
    { id: "P-GLAC3", name: "Glaciologist 3", role: "GLACIOLOGIST", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
    { id: "P-ATMOS1", name: "Atmospheric Scientist 1", role: "ATMOSPHERIC_SCIENTIST", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
    { id: "P-ATMOS2", name: "Atmospheric Scientist 2", role: "ATMOSPHERIC_SCIENTIST", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
    { id: "P-ATMOS3", name: "Atmospheric Scientist 3", role: "ATMOSPHERIC_SCIENTIST", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
    { id: "P-NAIR", name: "R. Nair", role: "FIELD_GUIDE", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
    { id: "P-GUIDE2", name: "Field Guide 2", role: "FIELD_GUIDE", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
    { id: "P-KULKARNI", name: "S. Kulkarni", role: "LOGISTICS_OFFICER", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
    { id: "P-TECH1", name: "Technician 1", role: "TECHNICIAN", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
    { id: "P-TECH2", name: "Technician 2", role: "TECHNICIAN", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
    { id: "P-TECH3", name: "Technician 3", role: "TECHNICIAN", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
    { id: "P-TECH4", name: "Technician 4", role: "TECHNICIAN", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
  ],
  assets: [],
  missions: [],
  levers: [],
  dependencies: [],
  link_state: [],
};

describe("R19: POB-driven Food Requirement (Unit Tests)", () => {
  it("computePob counts all station personnel whose status is not EVACUATED", () => {
    const personnel: PersonnelState[] = [
      { personId: "P-1", role: "DOCTOR", nodeId: "MAITRI", status: "ON_STATION", lastObservedAt: "2027-01-24T00:00:00.000Z" },
      { personId: "P-2", role: "COOK", nodeId: "MAITRI", status: "FIELD", lastObservedAt: "2027-01-24T00:00:00.000Z" },
      { personId: "P-3", role: "TECHNICIAN", nodeId: "MAITRI", status: "INJURED", lastObservedAt: "2027-01-24T00:00:00.000Z" },
      { personId: "P-4", role: "ENGINEER", nodeId: "MAITRI", status: "UNAVAILABLE", lastObservedAt: "2027-01-24T00:00:00.000Z" },
      { personId: "P-5", role: "SCIENTIST", nodeId: "MAITRI", status: "EVACUATED", lastObservedAt: "2027-01-24T00:00:00.000Z" },
      { personId: "P-6", role: "HQ_OPS", nodeId: "HQ", status: "ON_STATION", lastObservedAt: "2027-01-24T00:00:00.000Z" },
    ];

    // P-1, P-2, P-3, P-4 are at MAITRI and not EVACUATED -> POB = 4
    expect(computePob(personnel, "MAITRI")).toBe(4);
    // P-6 is at HQ -> POB at HQ = 1
    expect(computePob(personnel, "HQ")).toBe(1);
    // Non-existent station -> POB = 0
    expect(computePob(personnel, "BHARATI")).toBe(0);
    // Empty list -> POB = 0
    expect(computePob([], "MAITRI")).toBe(0);
  });

  it("computeFoodRequirement calculates R_base, reserve, ratio, state, and trace accurately", () => {
    const foodItem: InventoryState = {
      itemId: "INV-FOOD-MAITRI",
      nodeId: "MAITRI",
      stock: 8900,
      unit: "person-days",
      reservePct: 0.15,
      dimension: "FOOD",
      lastObservedAt: "2027-01-23T20:00:00.000Z",
    };

    const personnel: PersonnelState[] = Array.from({ length: 24 }, (_, i) => ({
      personId: `P-${i + 1}`,
      role: "MEMBER",
      nodeId: "MAITRI",
      status: "ON_STATION",
      lastObservedAt: "2027-01-24T00:00:00.000Z",
    }));

    const res = computeFoodRequirement({
      foodItem,
      personnel,
      nodeId: "MAITRI",
    });

    expect(res.pob).toBe(24);
    expect(res.perPersonRate).toBe(1.0);
    expect(res.daysToResupply).toBe(300);
    expect(res.rBase).toBe(7200);
    expect(res.r).toBe(8280);
    expect(res.stock).toBe(8900);
    expect(res.ratio).toBeCloseTo(1.0749, 4);
    expect(res.state).toBe("GREEN");
    expect(res.trace).toBe(
      "[R19] Food requirement: POB 24 x 1.00/person/d x 300d = 7200.00; with 15% reserve = 8280.00; stock 8900.00 -> ratio 1.0749 -> GREEN",
    );
  });

  it("zero POB behavior: R_base = 0, R = 0, ratio = Infinity, state = GREEN", () => {
    const foodItem: InventoryState = {
      itemId: "INV-FOOD-MAITRI",
      nodeId: "MAITRI",
      stock: 8900,
      unit: "person-days",
      reservePct: 0.15,
      dimension: "FOOD",
      lastObservedAt: "2027-01-23T20:00:00.000Z",
    };

    const res = computeFoodRequirement({
      foodItem,
      personnel: [],
      nodeId: "MAITRI",
    });

    expect(res.pob).toBe(0);
    expect(res.rBase).toBe(0);
    expect(res.r).toBe(0);
    expect(res.ratio).toBe(Infinity);
    expect(res.state).toBe("GREEN");
  });
});

describe("R19 Spec Golden Acceptance Tests", () => {
  const now = "2027-01-24T08:00:00.000Z";

  it("T-ENG-01: Seed at 24 Jan 08:00 -> Maitri food ratio 1.0749 GREEN", () => {
    const input: EngineInput = { seed, events: [] };
    const res = evaluate(input, now);

    const station = res.stations[0]!;
    const foodDim = station.dimensions.find((d) => d.key === "FOOD");
    expect(foodDim).toBeDefined();
    expect(foodDim!.state).toBe("GREEN");
    expect(foodDim!.ratio).toBeCloseTo(1.0749, 4);
    expect(foodDim!.foodRequirement).toBeDefined();
    expect(foodDim!.foodRequirement!.pob).toBe(24);
    expect(foodDim!.foodRequirement!.rBase).toBe(7200);
    expect(foodDim!.foodRequirement!.r).toBe(8280);

    // Trace step verification
    const r19Trace = foodDim!.trace.find((t) => t.rule === "R19");
    expect(r19Trace).toBeDefined();
    expect(r19Trace!.text).toContain("POB 24 x 1.00/person/d x 300d = 7200.00");
    expect(r19Trace!.text).toContain("8280.00");
    expect(r19Trace!.text).toContain("1.0749 -> GREEN");
  });

  it("T-ENG-10: Food burn +10% -> R = 9108, ratio 0.9772 AMBER", () => {
    // Test both direct rule evaluation with burnUplift = 0.10 and via BURN_RATE_CHANGED event
    const burnEvent: OpEvent = {
      event_id: "e-burn-1",
      device_id: "HQ-WEB-01",
      seq: 1,
      type: "BURN_RATE_CHANGED",
      entity_type: "inventory_item",
      entity_id: "INV-FOOD-MAITRI",
      node_id: "MAITRI",
      payload: {
        item_id: "INV-FOOD-MAITRI",
        phase: "WINTER",
        uplift_pct: 0.10,
      },
      observed_at: "2027-01-24T08:10:00.000Z",
      created_at_client: "2027-01-24T08:10:00.000Z",
      priority: 2,
      actor_role: "STATION_LEADER",
      schema_version: 1,
    };

    const input: EngineInput = { seed, events: [burnEvent] };
    const res = evaluate(input, "2027-01-24T08:10:00.000Z");

    const station = res.stations[0]!;
    const foodDim = station.dimensions.find((d) => d.key === "FOOD")!;
    expect(foodDim).toBeDefined();
    expect(foodDim.state).toBe("AMBER");
    expect(foodDim.ratio).toBeCloseTo(0.9772, 4); // 8900 / 9108 = 0.97716...
    expect(foodDim.foodRequirement!.rBase).toBe(7200);
    expect(foodDim.foodRequirement!.r).toBe(9108); // 7200 * 1.10 * 1.15 = 9108

    const r19Trace = foodDim.trace.find((t) => t.rule === "R19")!;
    expect(r19Trace.text).toContain("+10% burn uplift: 7920.00");
    expect(r19Trace.text).toContain("9108.00");
    expect(r19Trace.text).toContain("0.9772 -> AMBER");
  });

  it("T-ENG-20 (P1): PERSON_MOVED one winterer Maitri->Cape Town -> POB 23, R = 7935, ratio 1.1216 GREEN", () => {
    // Tests the genuine PERSON_MOVED -> reduce() -> computePob() -> evaluate() path
    const personMoved: OpEvent = {
      event_id: "e-move-winterer-1",
      device_id: "HQ-WEB-01",
      seq: 1,
      type: "PERSON_MOVED",
      entity_type: "personnel",
      entity_id: "P-GLAC3",
      node_id: "HQ",
      payload: {
        person_id: "P-GLAC3",
        from_node: "MAITRI",
        to_node: "CAPE_TOWN",
        depart: "2027-01-25T00:00:00.000Z",
        arrive: "2027-02-10T00:00:00.000Z",
      },
      observed_at: "2027-01-24T08:10:00.000Z",
      created_at_client: "2027-01-24T08:10:00.000Z",
      priority: 1,
      actor_role: "HQ_OPS",
      schema_version: 1,
    };

    // 1. Verify reduce() correctly updates P-GLAC3's nodeId to CAPE_TOWN
    const state = reduce(seed, [personMoved]);
    const movedPerson = state.personnel.get("P-GLAC3")!;
    expect(movedPerson.nodeId).toBe("CAPE_TOWN");

    // 2. Verify computePob() sees 23 on-board personnel at Maitri
    const pob = computePob(state.personnel.values(), "MAITRI");
    expect(pob).toBe(23);

    // 3. Full evaluate() pipeline
    const input: EngineInput = { seed, events: [personMoved] };
    const res = evaluate(input, "2027-01-24T08:10:00.000Z");

    const station = res.stations[0]!;
    const foodDim = station.dimensions.find((d) => d.key === "FOOD")!;
    expect(foodDim).toBeDefined();
    expect(foodDim.state).toBe("GREEN");
    expect(foodDim.ratio).toBeCloseTo(1.1216, 4); // 8900 / 7935 = 1.121613...
    expect(foodDim.foodRequirement!.pob).toBe(23);
    expect(foodDim.foodRequirement!.rBase).toBe(6900); // 23 * 300 = 6900
    expect(foodDim.foodRequirement!.r).toBe(7935); // 6900 * 1.15 = 7935

    const r19Trace = foodDim.trace.find((t) => t.rule === "R19")!;
    expect(r19Trace.text).toContain("POB 23 x 1.00/person/d x 300d = 6900.00");
    expect(r19Trace.text).toContain("7935.00");
    expect(r19Trace.text).toContain("1.1216 -> GREEN");
  });

  it("PERSON_STATUS_SET: EVACUATED removes from POB, while FIELD/INJURED remain on station headcount", () => {
    // Evacuate P-GLAC2 from Maitri
    const evacuateEvent: OpEvent = {
      event_id: "e-evac-1",
      device_id: "MAITRI-TAB-01",
      seq: 1,
      type: "PERSON_STATUS_SET",
      entity_type: "personnel",
      entity_id: "P-GLAC2",
      node_id: "MAITRI",
      payload: {
        person_id: "P-GLAC2",
        status: "EVACUATED",
      },
      observed_at: "2027-01-24T08:15:00.000Z",
      created_at_client: "2027-01-24T08:15:00.000Z",
      priority: 1,
      actor_role: "STATION_LEADER",
      schema_version: 1,
    };

    const stateEvac = reduce(seed, [evacuateEvent]);
    expect(computePob(stateEvac.personnel.values(), "MAITRI")).toBe(23);

    // Contrast: set P-VERMA to FIELD
    const fieldEvent: OpEvent = {
      event_id: "e-field-1",
      device_id: "MAITRI-TAB-01",
      seq: 2,
      type: "PERSON_STATUS_SET",
      entity_type: "personnel",
      entity_id: "P-VERMA",
      node_id: "MAITRI",
      payload: {
        person_id: "P-VERMA",
        status: "FIELD",
      },
      observed_at: "2027-01-24T08:20:00.000Z",
      created_at_client: "2027-01-24T08:20:00.000Z",
      priority: 1,
      actor_role: "STATION_LEADER",
      schema_version: 1,
    };

    const stateField = reduce(seed, [fieldEvent]);
    // FIELD person still draws station food -> POB remains 24
    expect(computePob(stateField.personnel.values(), "MAITRI")).toBe(24);
  });

  it("FOOD dimension participates in worstOf() only when a food item exists", () => {
    // Seed without any FOOD dimension item
    const seedWithoutFood: Seed = {
      ...seed,
      inventory_items: seed.inventory_items.filter((i) => i.dimension !== "FOOD"),
      consumption_profiles: seed.consumption_profiles.filter((cp) => cp.item_id !== "INV-FOOD-MAITRI"),
    };

    const res = evaluate({ seed: seedWithoutFood, events: [] }, now);
    const station = res.stations[0]!;
    expect(station.dimensions.some((d) => d.key === "FOOD")).toBe(false);
  });

  it("Determinism: 50 repeated evaluations with R19 produce bitwise identical results", () => {
    const input: EngineInput = { seed, events: [] };
    const base = evaluate(input, now);
    for (let i = 0; i < 50; i++) {
      expect(evaluate(input, now)).toEqual(base);
    }
  });
});

