import { describe, expect, it } from "vitest";
import type { OpEvent, Seed } from "@dhruv/shared";
import {
  computeBaselineB0,
  evaluate,
  type EngineInput,
} from "../src/index.js";

describe("R18: Baseline B0 (computeBaselineB0)", () => {
  it("normal case: stock 92.0 kL at 0.55 kL/d gives 167 days of cover and no alert", () => {
    // 92.0 / 0.55 = 167.27 -> 167 days
    const res = computeBaselineB0({
      stock: 92.0,
      rate: 0.55,
      unit: "kL",
    });

    expect(res.stock).toBe(92.0);
    expect(res.rate).toBe(0.55);
    expect(res.daysOfCover).toBe(167);
    expect(res.hasAlert).toBe(false);
    expect(res.alert).toBe("none");
    expect(res.trace).toBe(
      "[R18] Baseline B0: on-hand 92.0 kL at 0.55 kL/d = 167 days of cover -> alert: none (a stock alert would show nothing here)",
    );
  });

  it("low stock triggers alert when days of cover <= minDaysOfCover limit", () => {
    // 15.0 / 0.55 = 27.27 -> 27 days <= 30 days limit
    const res = computeBaselineB0({
      stock: 15.0,
      rate: 0.55,
      unit: "kL",
      minDaysOfCover: 30,
    });

    expect(res.daysOfCover).toBe(27);
    expect(res.hasAlert).toBe(true);
    expect(res.alert).toBe("LOW_STOCK");
    expect(res.trace).toContain("alert: LOW_STOCK (stock alert triggered)");
  });

  it("boundary conditions: exactly at threshold vs just above", () => {
    // 30 days of cover with minDaysOfCover = 30 -> alert
    const res30 = computeBaselineB0({
      stock: 30,
      rate: 1.0,
      minDaysOfCover: 30,
    });
    expect(res30.daysOfCover).toBe(30);
    expect(res30.hasAlert).toBe(true);
    expect(res30.alert).toBe("LOW_STOCK");

    // 31 days of cover with minDaysOfCover = 30 -> no alert
    const res31 = computeBaselineB0({
      stock: 31,
      rate: 1.0,
      minDaysOfCover: 30,
    });
    expect(res31.daysOfCover).toBe(31);
    expect(res31.hasAlert).toBe(false);
    expect(res31.alert).toBe("none");
  });

  it("edge case: zero rate produces infinite days of cover and no alert", () => {
    const resZero = computeBaselineB0({
      stock: 92.0,
      rate: 0,
      unit: "kL",
    });
    expect(resZero.daysOfCover).toBe(Infinity);
    expect(resZero.hasAlert).toBe(false);
    expect(resZero.alert).toBe("none");
    expect(resZero.trace).toContain("inf of cover -> alert: none");
  });
});

describe("T-BASE-01: Golden Test & Spec Section 24 Comparison", () => {
  const seed: Seed = {
    nodes: [
      { id: "HQ", name: "HQ", type: "HQ", lat: 28.61, lon: 77.23 },
      { id: "MAITRI", name: "Maitri", type: "STATION", lat: -70.77, lon: 11.73 },
    ],
    vessels: [
      {
        id: "V-ICE-STAR",
        name: "MV Ice Star",
        departure: "2027-02-06T00:00:00.000Z",
        load_cutoff: "2027-02-04T00:00:00.000Z",
        eta_station: "2027-02-24T00:00:00.000Z",
        station_closing_date: "2027-03-01T00:00:00.000Z",
      },
    ],
    shipments: [
      { id: "C-104", name: "Diesel Resupply", priority: "CRITICAL", dest_node_id: "MAITRI" },
    ],
    legs: [
      {
        id: "L2-C104",
        shipment_id: "C-104",
        seq: 2,
        from_node: "MUMBAI",
        to_node: "CAPE_TOWN",
        etd: "2027-01-12T00:00:00.000Z",
        eta: "2027-02-02T00:00:00.000Z",
        vessel_id: null,
        status: "IN_TRANSIT",
      },
      {
        id: "L3-C104",
        shipment_id: "C-104",
        seq: 3,
        from_node: "CAPE_TOWN",
        to_node: "MAITRI",
        etd: "2027-02-06T00:00:00.000Z",
        eta: "2027-02-24T00:00:00.000Z",
        vessel_id: "V-ICE-STAR",
        status: "PLANNED",
      },
    ],
    inventory_items: [
      {
        id: "INV-DSL",
        node_id: "MAITRI",
        name: "Diesel",
        category: "Fuel",
        unit: "kL",
        stock: 92.0,
        reserve_pct: 0.10,
        requirement_mode: "BURN",
        fixed_requirement: null,
        dimension: "FUEL",
        last_counted: "2027-01-24T04:00:00.000Z",
        count_source: "PHYSICAL",
      },
    ],
    consumption_profiles: [
      { item_id: "INV-DSL", phase: "CLOSING", rate_per_day: 0.55 },
      { item_id: "INV-DSL", phase: "WINTER", rate_per_day: 0.38 },
      { item_id: "INV-DSL", phase: "MOBILISATION", rate_per_day: 0.35 },
    ],
    cargo_items: [
      { id: "CI-C104-DSL", shipment_id: "C-104", inventory_item_id: "INV-DSL", qty: 48.0 },
    ],
    personnel: [],
    assets: [],
    missions: [],
    levers: [
      {
        id: "HOLD_VESSEL",
        node_id: "MAITRI",
        label: "Hold vessel 3 days",
        effect: JSON.stringify({
          addAvailableKl: 48.0,
          newDeparture: "2027-02-09T00:00:00.000Z",
          newLoadCutoff: "2027-02-07T00:00:00.000Z",
          newLegEta: "2027-02-27T00:00:00.000Z",
        }),
        cutoff: "2027-02-06T00:00:00.000Z",
        lead_days: 3,
        cost_amount: 1950000,
        cost_unit: "INR",
        synthetic: 1,
      },
    ],
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

  it("T-BASE-01: After the slip: B0 alert = none (on-hand 92.0 kL unchanged); engine state RED", () => {
    const input: EngineInput = { seed, events: [legDelayed] };
    const now = "2027-01-24T08:10:00.000Z";
    const res = evaluate(input, now);

    const station = res.stations[0]!;
    expect(station.state).toBe("RED"); // Engine state is RED

    const fuelDim = station.dimensions.find((d) => d.key === "FUEL")!;
    expect(fuelDim.state).toBe("RED");
    expect(fuelDim.ratio).toBeCloseTo(0.6970, 3); // 92.0 / 132.0 = 0.6970

    // Baseline B0 is computed alongside the engine:
    expect(fuelDim.baselineB0).toBeDefined();
    expect(fuelDim.baselineB0!.stock).toBe(92.0); // on-hand stock unchanged at 92.0 kL
    expect(fuelDim.baselineB0!.daysOfCover).toBe(167); // 167 days of cover
    expect(fuelDim.baselineB0!.alert).toBe("none"); // B0 alert = none
    expect(fuelDim.baselineB0!.hasAlert).toBe(false);

    // B0 line is exposed in the trace drawer (Spec line 659)
    const r18Trace = fuelDim.trace.find((t) => t.rule === "R18");
    expect(r18Trace).toBeDefined();
    expect(r18Trace!.text).toContain("alert: none (a stock alert would show nothing here)");

    // PNR is 3 Feb (10 days left) and reserve breach 2027-08-06 (106 days short)
    expect(station.pnr).toBeDefined();
    expect(station.pnr!.pnrDate).toBe("2027-02-03T00:00:00.000Z");
    expect(station.pnr!.daysRemaining).toBe(10);
    expect(fuelDim.slipTolerance!.reserveBreachDate).toBe("2027-08-06T00:00:00.000Z");
    expect(fuelDim.slipTolerance!.daysShortOfWindow).toBe(106);
  });

  it("Non-interference: B0 alert never feeds into dimension state or station state", () => {
    // At start of season (no delay): B0 is none, engine is GREEN
    const startInput: EngineInput = { seed, events: [] };
    const startRes = evaluate(startInput, "2027-01-24T08:00:00.000Z");
    const startStation = startRes.stations[0]!;
    const startFuel = startStation.dimensions.find((d) => d.key === "FUEL")!;

    expect(startFuel.baselineB0!.alert).toBe("none");
    expect(startFuel.state).toBe("GREEN"); // driven by R03, not B0
    expect(startStation.state).toBe("GREEN"); // driven by R15, not B0

    // After slip: B0 is STILL none, but engine is RED
    const slipInput: EngineInput = { seed, events: [legDelayed] };
    const slipRes = evaluate(slipInput, "2027-01-24T08:10:00.000Z");
    const slipStation = slipRes.stations[0]!;
    const slipFuel = slipStation.dimensions.find((d) => d.key === "FUEL")!;

    expect(slipFuel.baselineB0!.alert).toBe("none");
    expect(slipFuel.state).toBe("RED"); // driven by R03, completely independent of B0
    expect(slipStation.state).toBe("RED");
  });

  it("Determinism: 50 repeated evaluations with R18 produce identical results", () => {
    const input: EngineInput = { seed, events: [legDelayed] };
    const now = "2027-01-24T08:10:00.000Z";
    const base = evaluate(input, now);
    for (let i = 0; i < 50; i++) {
      expect(evaluate(input, now)).toEqual(base);
    }
  });
});

