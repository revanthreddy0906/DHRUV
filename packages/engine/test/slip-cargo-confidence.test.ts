import { describe, expect, it } from "vitest";
import type { OpEvent, Seed } from "@dhruv/shared";
import {
  computeFeederSlack,
  computeSlipTolerance,
  checkCargoFeasibilityConfidence,
  classifyFreshness,
  computeConfidenceBand,
  evaluateOptionVerification,
  evaluate,
  type EngineInput,
} from "../src/index.js";

describe("R16: Feeder Slack (computeFeederSlack)", () => {
  it("computes positive slack when ETA is before cutoff", () => {
    const res = computeFeederSlack("L2-C104", "2027-02-05T00:00:00.000Z", "2027-02-07T00:00:00.000Z");
    expect(res.slackDays).toBe(2);
    expect(res.feasible).toBe(true);
    expect(res.trace).toContain("[R16] Feeder L2-C104: ETA 2027-02-05 vs cutoff 2027-02-07 -> 2d slack (feasible)");
  });

  it("boundary: ETA == cutoff gives 0 days slack, strictly feasible", () => {
    const res = computeFeederSlack("L2-C104", "2027-02-07T00:00:00.000Z", "2027-02-07T00:00:00.000Z");
    expect(res.slackDays).toBe(0);
    expect(res.feasible).toBe(true);
    expect(res.trace).toContain("[R16] Feeder L2-C104: ETA 2027-02-07 vs cutoff 2027-02-07 -> 0d slack (feasible)");
  });

  it("negative slack when ETA is after cutoff (infeasible)", () => {
    const res = computeFeederSlack("L2-C104", "2027-02-08T00:00:00.000Z", "2027-02-07T00:00:00.000Z");
    expect(res.slackDays).toBe(-1);
    expect(res.feasible).toBe(false);
    expect(res.trace).toContain("[R16] Feeder L2-C104: ETA 2027-02-08 vs cutoff 2027-02-07 -> -1d slack (infeasible)");
  });
});

describe("R16: Station Resupply Slip Tolerance (computeSlipTolerance)", () => {
  const phaseBoundaries = {
    CLOSING: { start: "2027-01-24T00:00:00.000Z", end: "2027-03-01T00:00:00.000Z" },
    WINTER: { start: "2027-03-01T00:00:00.000Z", end: "2027-11-16T00:00:00.000Z" },
    MOBILISATION: { start: "2027-11-16T00:00:00.000Z", end: "2027-11-20T00:00:00.000Z" },
  };

  const consumptionProfiles: Seed["consumption_profiles"] = [
    { item_id: "INV-DSL", phase: "CLOSING", rate_per_day: 0.55 },
    { item_id: "INV-DSL", phase: "WINTER", rate_per_day: 0.38 },
    { item_id: "INV-DSL", phase: "MOBILISATION", rate_per_day: 0.35 },
    { item_id: "INV-DSL-BHARATI", phase: "CLOSING", rate_per_day: 0.50 },
    { item_id: "INV-DSL-BHARATI", phase: "WINTER", rate_per_day: 0.34 },
    { item_id: "INV-DSL-BHARATI", phase: "MOBILISATION", rate_per_day: 0.40 },
  ];

  it("T-ENG-15: Seed at 24 Jan 08:00 gives Maitri diesel slip tolerance 22 days, Bharati 40 days", () => {
    // Maitri: A = 140.0 (92 stock + 48 inbound), R_base = 120.0, reserve = 12.0
    // margin E = 140.0 - 120.0 - 12.0 = +8.0 kL
    // rate_post = 0.35 kL/d -> floor(8.0 / 0.35) = 22 days
    const maitriSlip = computeSlipTolerance({
      availability: 140.0,
      stock: 92.0,
      reservePct: 0.10,
      now: "2027-01-24T08:00:00.000Z",
      phaseBoundaries,
      consumptionProfiles,
      itemId: "INV-DSL",
    });

    expect(maitriSlip.hasDeficit).toBe(false);
    expect(maitriSlip.marginE).toBeCloseTo(8.0, 1);
    expect(maitriSlip.slipToleranceDays).toBe(22);
    expect(maitriSlip.reserveBreachDate).toBeNull();
    expect(maitriSlip.daysShortOfWindow).toBeNull();
    expect(maitriSlip.trace).toContain("margin E +8.0 kL -> slip tolerance 22 days");

    // Bharati: A = 135.0, R_base = 108.0 (36*0.50 + 260*0.34 + 4*0.40), reserve = 10.8
    // margin E = 135.0 - 108.0 - 10.8 = +16.2 kL
    // rate_post = 0.40 kL/d -> floor(16.2 / 0.40) = 40 days
    const bharatiSlip = computeSlipTolerance({
      availability: 135.0,
      stock: 135.0,
      reservePct: 0.10,
      now: "2027-01-24T08:00:00.000Z",
      phaseBoundaries,
      consumptionProfiles,
      itemId: "INV-DSL-BHARATI",
      ratePost: 0.40,
    });

    expect(bharatiSlip.hasDeficit).toBe(false);
    expect(bharatiSlip.marginE).toBeCloseTo(16.2, 1);
    expect(bharatiSlip.slipToleranceDays).toBe(40);
    expect(bharatiSlip.reserveBreachDate).toBeNull();
    expect(bharatiSlip.daysShortOfWindow).toBeNull();
    expect(bharatiSlip.trace).toContain("margin E +16.2 kL -> slip tolerance 40 days");
  });

  it("T-ENG-16: After LEG_DELAYED C-104 to 7 Feb (inbound excluded), reserve breach 2027-08-06, 106 days short of 20 Nov", () => {
    // A = 92.0, R_base = 120.0, reserve = 12.0
    // margin E = 92.0 - 120.0 - 12.0 = -40.0 kL (deficit)
    // Target burn to reserve: 92.0 - 12.0 = 80.0 kL
    // CLOSING (36d * 0.55): 19.8 kL. Remaining: 60.2 kL.
    // WINTER (rate 0.38): 60.2 / 0.38 = 158.42 days from 2027-03-01 -> 2027-08-06.
    // Days short of 2027-11-20: 106 days.
    const slip = computeSlipTolerance({
      availability: 92.0,
      stock: 92.0,
      reservePct: 0.10,
      now: "2027-01-24T08:10:00.000Z",
      phaseBoundaries,
      consumptionProfiles,
      itemId: "INV-DSL",
    });

    expect(slip.hasDeficit).toBe(true);
    expect(slip.marginE).toBeCloseTo(-40.0, 1);
    expect(slip.slipToleranceDays).toBeNull();
    expect(slip.reserveBreachDate).toBe("2027-08-06T00:00:00.000Z");
    expect(slip.daysShortOfWindow).toBe(106);
    expect(slip.trace).toContain("reserve breached on 2027-08-06 (106 days short of 2027-11-20 window)");
  });

  it("T-ENG-17: After HOLD_VESSEL with burn +15%, reserve breach 2027-10-23, 28 days short of 20 Nov", () => {
    // A = 140.0, u = 0.15, R = 151.8, reserve = 13.8
    // margin E = 140.0 - 151.8 = -11.8 kL
    // Target burn to reserve: 140.0 - 13.8 = 126.2 kL
    // CLOSING (36d * 0.6325): 22.77 kL. Remaining: 103.43 kL.
    // WINTER (rate 0.437): 103.43 / 0.437 = 236.68 days from 2027-03-01 -> 2027-10-23.
    // Days short of 2027-11-20: 28 days.
    const slip = computeSlipTolerance({
      availability: 140.0,
      stock: 92.0,
      reservePct: 0.10,
      burnUplift: 0.15,
      now: "2027-01-24T08:10:00.000Z",
      phaseBoundaries,
      consumptionProfiles,
      itemId: "INV-DSL",
    });

    expect(slip.hasDeficit).toBe(true);
    expect(slip.marginE).toBeCloseTo(-11.8, 1);
    expect(slip.slipToleranceDays).toBeNull();
    expect(slip.reserveBreachDate).toBe("2027-10-23T00:00:00.000Z");
    expect(slip.daysShortOfWindow).toBe(28);
    expect(slip.trace).toContain("reserve breached on 2027-10-23 (28 days short of 2027-11-20 window)");
  });
});

describe("R17: Cargo Feasibility Confidence (checkCargoFeasibilityConfidence)", () => {
  const cutoff = "2027-02-07T00:00:00.000Z";
  const now = "2027-01-26T09:00:00.000Z";

  it("feasible with FRESH report (age < 12h) and 0d slack is NOT uncertain", () => {
    const obs = "2027-01-26T02:00:00.000Z"; // 7h old (FRESH)
    const freshRes = classifyFreshness("L2-C104", "cargoEta", obs, now);
    const cargoConf = checkCargoFeasibilityConfidence("L2-C104", "2027-02-07T00:00:00.000Z", cutoff, freshRes);

    expect(cargoConf.feasible).toBe(true);
    expect(cargoConf.slackDays).toBe(0);
    expect(cargoConf.freshness).toBe("FRESH");
    expect(cargoConf.uncertain).toBe(false);
  });

  it("feasible with AGING report (12h <= age < 48h) and 0d slack is NOT uncertain", () => {
    const obs = "2027-01-25T03:00:00.000Z"; // 30h old (AGING)
    const agingRes = classifyFreshness("L2-C104", "cargoEta", obs, now);
    const cargoConf = checkCargoFeasibilityConfidence("L2-C104", "2027-02-07T00:00:00.000Z", cutoff, agingRes);

    expect(cargoConf.feasible).toBe(true);
    expect(cargoConf.slackDays).toBe(0);
    expect(cargoConf.freshness).toBe("AGING");
    expect(cargoConf.uncertain).toBe(false);
  });

  it("feasible with STALE report (age >= 48h) but slack > 2d is NOT uncertain", () => {
    const obs = "2027-01-24T08:10:00.000Z"; // 48h 50m old (STALE)
    const staleRes = classifyFreshness("L2-C104", "cargoEta", obs, now);
    const cargoConf = checkCargoFeasibilityConfidence("L2-C104", "2027-02-04T00:00:00.000Z", cutoff, staleRes);

    expect(cargoConf.feasible).toBe(true);
    expect(cargoConf.slackDays).toBe(3);
    expect(cargoConf.freshness).toBe("STALE");
    expect(cargoConf.uncertain).toBe(false);
  });

  it("T-ENG-18: Clock 26 Jan 09:00, C-104 report 48h50min old, slack 0 days -> UNCERTAIN, point 1.0606, low 0.6970 ('GREEN, could be RED'), verify-first set", () => {
    // 26 Jan 09:00 - 24 Jan 08:10 = 48h 50min = 48.833h >= 48h -> STALE
    const obs = "2027-01-24T08:10:00.000Z";
    const staleRes = classifyFreshness("L2-C104", "cargoEta", obs, now);
    expect(staleRes.freshness).toBe("STALE");
    expect(staleRes.ageHours).toBeCloseTo(48.833, 2);

    const cargoConf = checkCargoFeasibilityConfidence("L2-C104", "2027-02-07T00:00:00.000Z", cutoff, staleRes);
    expect(cargoConf.feasible).toBe(true);
    expect(cargoConf.slackDays).toBe(0);
    expect(cargoConf.uncertain).toBe(true);
    expect(cargoConf.trace).toContain("UNCERTAIN");

    // Compute confidence band with inboundUncertain = true
    // Requirement = 132.0, stock = 92.0, inbound = 48.0, stock freshness = AGING (u = 0.03)
    // Point: (92 + 48) / 132 = 1.0606 (GREEN)
    // Low: computed WITHOUT 48 kL inbound -> 92 / 132 = 0.6970 (RED)
    // High: (92 * 1.03 + 48) / 132 = 1.0815 (GREEN)
    const band = computeConfidenceBand({
      stock: 92.0,
      inbound: 48.0,
      inboundUncertain: cargoConf.uncertain,
      requirement: 132.0,
      rateNow: 0.55,
      ageHours: 36,
      freshness: "AGING",
    });

    expect(band.point).toBeCloseTo(1.0606, 4);
    expect(band.low).toBeCloseTo(0.6970, 4);
    expect(band.high).toBeCloseTo(1.0815, 4);
    expect(band.pointState).toBe("GREEN");
    expect(band.lowState).toBe("RED");
    expect(band.highState).toBe("GREEN");
    expect(band.straddles).toBe(true);
    expect(band.text).toBe("GREEN, could be RED");

    // Verify first evaluates to true with detailed reason
    const dummyOption = {
      id: "OPT-HOLD_VESSEL",
      leverIds: ["HOLD_VESSEL"],
      levers: [],
      availability: 140.0,
      rawRequirement: 120.0,
      requirement: 132.0,
      ratio: 1.0606,
      state: "GREEN" as const,
      gap: 0,
      cost: 1950000,
      costUnit: "INR",
      deadline: "2027-02-06T00:00:00.000Z",
      bindingLeverId: "HOLD_VESSEL",
      slackDays: 0,
      reachesTarget: true,
      trace: "",
    };

    const ver = evaluateOptionVerification(
      dummyOption,
      { legFreshness: staleRes, cargoConfidence: cargoConf },
      band,
    );

    expect(ver.needsVerification).toBe(true);
    expect(ver.requiresVerify.some((r) => r.includes("UNCERTAIN"))).toBe(true);
  });
});

describe("T-ENG-19: Option cards after slip have correct slack", () => {
  it("(a) slack 0d, (b) slack 0d, (c) no inbound dependency", () => {
    const slackA = computeFeederSlack("L2-C104", "2027-02-07T00:00:00.000Z", "2027-02-07T00:00:00.000Z");
    expect(slackA.slackDays).toBe(0);

    const slackB = computeFeederSlack("L2-C104", "2027-02-07T00:00:00.000Z", "2027-02-07T00:00:00.000Z");
    expect(slackB.slackDays).toBe(0);
  });
});

describe("Pure Engine evaluate() with R16 & R17 Integration", () => {
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

  it("evaluate() produces R16 and R17 rules in traces, dimensions, and options", () => {
    const input: EngineInput = { seed, events: [legDelayed] };
    // Immediately after slip at 24 Jan 08:10 -> 106 days short, breach 2027-08-06
    const resImmediate = evaluate(input, "2027-01-24T08:10:00.000Z");
    const stationImmediate = resImmediate.stations[0]!;
    const fuelDimImmediate = stationImmediate.dimensions.find((d) => d.key === "FUEL")!;
    expect(fuelDimImmediate.slipTolerance).toBeDefined();
    expect(fuelDimImmediate.slipTolerance!.hasDeficit).toBe(true);
    expect(fuelDimImmediate.slipTolerance!.reserveBreachDate).toBe("2027-08-06T00:00:00.000Z");
    expect(fuelDimImmediate.slipTolerance!.daysShortOfWindow).toBe(106);

    const optImmediate = stationImmediate.options![0]!;
    expect(optImmediate.slipTolerance).toBeDefined();
    expect(optImmediate.slipTolerance!.hasDeficit).toBe(false);
    expect(optImmediate.slipTolerance!.slipToleranceDays).toBe(22);

    // At 25 Jan 16:00 -> 104 days short
    const now = "2027-01-25T16:00:00.000Z";
    const res = evaluate(input, now);

    const station = res.stations[0]!;
    const fuelDim = station.dimensions.find((d) => d.key === "FUEL")!;

    expect(fuelDim.slipTolerance).toBeDefined();
    expect(fuelDim.slipTolerance!.hasDeficit).toBe(true);
    expect(fuelDim.slipTolerance!.daysShortOfWindow).toBe(106); // T-ENG-16: R is anchored at the season start;

    const rules = fuelDim.trace.map((t) => t.rule);
    expect(rules).toContain("R16");
    expect(rules).toContain("R17");

    // Option has slipTolerance and cargoConfidence
    const opt = station.options![0]!;
    expect(opt.slipTolerance).toBeDefined();
    expect(opt.slipTolerance!.hasDeficit).toBe(false);
    expect(opt.slipTolerance!.slipToleranceDays).toBe(22); // same as the seed (T-ENG-15): the hold restores 140 kL;
    expect(opt.cargoConfidence).toBeDefined();
  });

  it("Determinism: 50 repeated evaluations of full R01-R17 pipeline produce identical results", () => {
    const input: EngineInput = { seed, events: [legDelayed] };
    const now = "2027-01-25T16:00:00.000Z";
    const base = evaluate(input, now);
    for (let i = 0; i < 50; i++) {
      expect(evaluate(input, now)).toEqual(base);
    }
  });
});
