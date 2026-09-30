import { describe, expect, it } from "vitest";
import type { Seed, OpEvent } from "@dhruv/shared";
import {
  catalogueLevers,
  generateOptions,
  rankOptions,
  computePnr,
  evaluate,
  type EngineInput,
} from "../src/index.js";

const syntheticLevers: Seed["levers"] = [
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
  {
    id: "AIRLIFT_PARTIAL",
    node_id: "MAITRI",
    label: "Partial airlift",
    effect: JSON.stringify({ addAvailableKl: 12.0 }),
    cutoff: "2027-02-09T00:00:00.000Z",
    lead_days: 9,
    cost_amount: 4800000,
    cost_unit: "INR",
    synthetic: 1,
  },
  {
    id: "DEFER_F27",
    node_id: "MAITRI",
    label: "Defer mission F-27",
    effect: JSON.stringify({ saveRawKl: 4.0 }),
    cutoff: "2027-02-03T00:00:00.000Z",
    lead_days: 1,
    cost_amount: null,
    cost_unit: null,
    synthetic: 1,
  },
  {
    id: "CONSERVE",
    node_id: "MAITRI",
    label: "Conservation measures",
    effect: JSON.stringify({ saveRawKl: 8.0 }),
    cutoff: "2027-03-01T00:00:00.000Z",
    lead_days: 2,
    cost_amount: null,
    cost_unit: null,
    synthetic: 1,
  },
];

describe("R08: Lever Catalogue", () => {
  const now = "2027-01-24T08:00:00.000Z";

  it("1. All four synthetic levers are available on 24 Jan 2027", () => {
    const catalog = catalogueLevers(syntheticLevers, now, "MAITRI");
    expect(catalog.length).toBe(4);
    expect(catalog.every((l) => l.available)).toBe(true);

    const hold = catalog.find((l) => l.id === "HOLD_VESSEL")!;
    expect(hold.deadline).toBe("2027-02-03T00:00:00.000Z");
    expect(hold.daysRemaining).toBe(10);
    expect(hold.costAmount).toBe(1950000);
    expect(hold.trace).toContain("[R08]");

    const airlift = catalog.find((l) => l.id === "AIRLIFT_PARTIAL")!;
    expect(airlift.deadline).toBe("2027-01-31T00:00:00.000Z");
    expect(airlift.daysRemaining).toBe(7);

    const defer = catalog.find((l) => l.id === "DEFER_F27")!;
    expect(defer.deadline).toBe("2027-02-02T00:00:00.000Z");
    expect(defer.daysRemaining).toBe(9);

    const conserve = catalog.find((l) => l.id === "CONSERVE")!;
    expect(conserve.deadline).toBe("2027-02-27T00:00:00.000Z");
    expect(conserve.daysRemaining).toBe(34);
  });

  it("2. A lever becomes unavailable once its deadline is before now", () => {
    // On 1 Feb 2027, AIRLIFT_PARTIAL (deadline 31 Jan) is unavailable
    const laterNow = "2027-02-01T08:00:00.000Z";
    const catalog = catalogueLevers(syntheticLevers, laterNow, "MAITRI");

    const airlift = catalog.find((l) => l.id === "AIRLIFT_PARTIAL")!;
    expect(airlift.available).toBe(false);
    expect(airlift.trace).toContain("EXPIRED");

    const hold = catalog.find((l) => l.id === "HOLD_VESSEL")!;
    expect(hold.available).toBe(true);
  });

  it("3. Deadline equal to now remains available (boundary condition)", () => {
    // On 31 Jan 2027, AIRLIFT_PARTIAL (deadline 31 Jan) is available
    const sameDayNow = "2027-01-31T14:30:00.000Z";
    const catalog = catalogueLevers(syntheticLevers, sameDayNow, "MAITRI");

    const airlift = catalog.find((l) => l.id === "AIRLIFT_PARTIAL")!;
    expect(airlift.available).toBe(true);
    expect(airlift.daysRemaining).toBe(0);
  });
});

describe("R09: Option Generation", () => {
  const now = "2027-01-24T08:00:00.000Z";
  const catalog = catalogueLevers(syntheticLevers, now, "MAITRI");

  // Frozen scenario baseline: stock = 92.0, baseRaw = 120.0, reserve = 10%
  const params = {
    levers: catalog,
    baseStock: 92.0,
    baseRawRequirement: 120.0,
    reservePct: 0.10,
    inboundFeasibleQty: 0,
    delayedLegEta: "2027-02-07T00:00:00.000Z",
  };

  it("1-4. Generates single, 2-lever, 3-lever combinations without duplicates", () => {
    const options = generateOptions(params);
    // 4 choose 1 = 4, 4 choose 2 = 6, 4 choose 3 = 4 -> total 14
    expect(options.length).toBe(14);

    const singleLever = options.filter((o) => o.leverIds.length === 1);
    const twoLevers = options.filter((o) => o.leverIds.length === 2);
    const threeLevers = options.filter((o) => o.leverIds.length === 3);

    expect(singleLever.length).toBe(4);
    expect(twoLevers.length).toBe(6);
    expect(threeLevers.length).toBe(4);

    // Ensure all option IDs are unique (no duplicate combinations)
    const ids = options.map((o) => o.id);
    expect(new Set(ids).size).toBe(options.length);
  });

  it("5-7. Availability and requirement effects applied correctly according to spec", () => {
    const options = generateOptions(params);

    // Option {HOLD_VESSEL}: +48 kL availability
    const optHold = options.find((o) => o.id === "OPT-HOLD_VESSEL")!;
    expect(optHold.availability).toBeCloseTo(140.0, 1);
    expect(optHold.rawRequirement).toBeCloseTo(120.0, 1);
    expect(optHold.requirement).toBeCloseTo(132.0, 1);
    expect(optHold.ratio).toBeCloseTo(1.0606, 3);
    expect(optHold.state).toBe("GREEN");
    expect(optHold.gap).toBe(0);
    expect(optHold.reachesTarget).toBe(true);
    expect(optHold.slackDays).toBe(0);

    // Option {HOLD_VESSEL, CONSERVE, DEFER_F27}: +48 avail, -12 raw
    const optMaxBuffer = options.find(
      (o) =>
        o.leverIds.includes("HOLD_VESSEL") &&
        o.leverIds.includes("CONSERVE") &&
        o.leverIds.includes("DEFER_F27"),
    )!;
    expect(optMaxBuffer.availability).toBeCloseTo(140.0, 1);
    expect(optMaxBuffer.rawRequirement).toBeCloseTo(108.0, 1);
    expect(optMaxBuffer.requirement).toBeCloseTo(118.8, 1);
    expect(optMaxBuffer.ratio).toBeCloseTo(1.1785, 3);
    expect(optMaxBuffer.state).toBe("GREEN");
    expect(optMaxBuffer.reachesTarget).toBe(true);
    expect(optMaxBuffer.slackDays).toBe(0);

    // Option {AIRLIFT_PARTIAL, DEFER_F27, CONSERVE}: +12 avail, -12 raw
    const optAirlift = options.find(
      (o) =>
        o.leverIds.includes("AIRLIFT_PARTIAL") &&
        o.leverIds.includes("CONSERVE") &&
        o.leverIds.includes("DEFER_F27"),
    )!;
    expect(optAirlift.availability).toBeCloseTo(104.0, 1);
    expect(optAirlift.rawRequirement).toBeCloseTo(108.0, 1);
    expect(optAirlift.requirement).toBeCloseTo(118.8, 1);
    expect(optAirlift.ratio).toBeCloseTo(0.8754, 3);
    expect(optAirlift.state).toBe("RED");
    expect(optAirlift.gap).toBeCloseTo(14.8, 1);
    expect(optAirlift.reachesTarget).toBe(false);
    expect(optAirlift.slackDays).toBeNull();
  });

  it("8. Option deadline is the minimum deadline among selected levers", () => {
    const options = generateOptions(params);

    // {HOLD_VESSEL (3 Feb), DEFER_F27 (2 Feb), CONSERVE (27 Feb)} -> min is 2 Feb (DEFER_F27)
    const opt = options.find(
      (o) =>
        o.leverIds.includes("HOLD_VESSEL") &&
        o.leverIds.includes("CONSERVE") &&
        o.leverIds.includes("DEFER_F27"),
    )!;
    expect(opt.deadline).toBe("2027-02-02T00:00:00.000Z");
    expect(opt.bindingLeverId).toBe("DEFER_F27");
  });
});

describe("R10: Option Ranking and Selection", () => {
  const now = "2027-01-24T08:00:00.000Z";
  const catalog = catalogueLevers(syntheticLevers, now, "MAITRI");
  const options = generateOptions({
    levers: catalog,
    baseStock: 92.0,
    baseRawRequirement: 120.0,
    reservePct: 0.10,
    inboundFeasibleQty: 0,
    delayedLegEta: "2027-02-07T00:00:00.000Z",
  });

  it("1-6. Selects top 3 options matching spec: (a) HOLD_VESSEL, (b) HOLD+CONSERVE+DEFER, (c) AIRLIFT+DEFER+CONSERVE", () => {
    const ranked = rankOptions(options);

    expect(ranked.length).toBe(3);

    // Option (a): cheapest target-reaching option (T-ENG-04 tie break: fewer levers)
    const optA = ranked[0]!;
    expect(optA.label).toBe("(a)");
    expect(optA.category).toBe("RECOMMENDED_TARGET");
    expect(optA.leverIds).toEqual(["HOLD_VESSEL"]);
    expect(optA.ratio).toBeCloseTo(1.0606, 3);
    expect(optA.state).toBe("GREEN");
    expect(optA.cost).toBe(1950000);
    expect(optA.deadline).toBe("2027-02-03T00:00:00.000Z");
    expect(optA.slackDays).toBe(0);

    // Option (b): alternative target-reaching option with maximum buffer/ratio
    const optB = ranked[1]!;
    expect(optB.label).toBe("(b)");
    expect(optB.category).toBe("ALTERNATIVE_TARGET");
    expect(optB.leverIds).toEqual(["CONSERVE", "DEFER_F27", "HOLD_VESSEL"]);
    expect(optB.ratio).toBeCloseTo(1.1785, 3);
    expect(optB.state).toBe("GREEN");
    expect(optB.deadline).toBe("2027-02-02T00:00:00.000Z");
    expect(optB.slackDays).toBe(0);

    // Option (c): best partial recovery option
    const optC = ranked[2]!;
    expect(optC.label).toBe("(c)");
    expect(optC.category).toBe("PARTIAL_RECOVERY");
    expect(optC.leverIds).toEqual(["AIRLIFT_PARTIAL", "CONSERVE", "DEFER_F27"]);
    expect(optC.ratio).toBeCloseTo(0.8754, 3);
    expect(optC.state).toBe("RED");
    expect(optC.gap).toBeCloseTo(14.8, 1);
    expect(optC.deadline).toBe("2027-01-31T00:00:00.000Z");
    expect(optC.slackDays).toBeNull();
  });

  it("Determinism: Repeated rankings produce identical order and fields", () => {
    const run1 = rankOptions(options);
    const run2 = rankOptions(options);
    expect(run1).toEqual(run2);
  });
});

describe("R11: Point of No Return", () => {
  const now = "2027-01-24T08:00:00.000Z";
  const catalog = catalogueLevers(syntheticLevers, now, "MAITRI");
  const options = generateOptions({
    levers: catalog,
    baseStock: 92.0,
    baseRawRequirement: 120.0,
    reservePct: 0.10,
    inboundFeasibleQty: 0,
    delayedLegEta: "2027-02-07T00:00:00.000Z",
  });

  it("1-3. Frozen scenario produces PNR of 3 Feb 2027 (10 days left)", () => {
    const pnr = computePnr(options, now);

    expect(pnr.pnrDate).toBe("2027-02-03T00:00:00.000Z");
    expect(pnr.daysRemaining).toBe(10);
    expect(pnr.bindingOptionId).toBe("OPT-HOLD_VESSEL");
    expect(pnr.trace).toContain("2027-02-03");
    expect(pnr.trace).toContain("10 days left");

    // Must NOT be the station closing date (28 Feb) or latest lever deadline (27 Feb)
    expect(pnr.pnrDate).not.toBe("2027-02-28T00:00:00.000Z");
    expect(pnr.pnrDate).not.toBe("2027-02-27T00:00:00.000Z");
  });

  it("4. PNR updates when the set of target reaching options changes", () => {
    // If only Option B {HOLD_VESSEL, CONSERVE, DEFER_F27} is available, PNR is 2 Feb
    const onlyOptionB = options.filter(
      (o) =>
        o.id === "OPT-CONSERVE+DEFER_F27+HOLD_VESSEL" ||
        (!o.reachesTarget && o.leverIds.includes("AIRLIFT_PARTIAL")),
    );
    const pnr = computePnr(onlyOptionB, now);
    expect(pnr.pnrDate).toBe("2027-02-02T00:00:00.000Z");
    expect(pnr.daysRemaining).toBe(9);
  });

  it("5. When no target-reaching option exists, returns null without fabricating a date", () => {
    const nonTargetOptions = options.filter((o) => !o.reachesTarget);
    const pnr = computePnr(nonTargetOptions, now);

    expect(pnr.pnrDate).toBeNull();
    expect(pnr.daysRemaining).toBeNull();
    expect(pnr.bindingOptionId).toBeNull();
    expect(pnr.trace).toContain("No option reaches target state");
  });
});

describe("Integration: Golden Scenario (T-ENG-02, T-ENG-03, T-ENG-04)", () => {
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
    levers: syntheticLevers,
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

  it("evaluate() runs R01-R11 on delayed C-104: Maitri turns RED, options generated, PNR 3 Feb", () => {
    const input: EngineInput = { seed, events: [legDelayed] };
    const now = "2027-01-24T08:10:00.000Z";
    const result = evaluate(input, now);

    const station = result.stations[0]!;
    expect(station.state).toBe("RED");
    expect(station.dimensions[0]?.ratio).toBeCloseTo(0.697, 3);

    // Options attached to station
    expect(station.options).toBeDefined();
    expect(station.options!.length).toBe(3);
    expect(station.options![0]!.label).toBe("(a)");
    expect(station.options![0]!.leverIds).toEqual(["HOLD_VESSEL"]);
    expect(station.options![0]!.ratio).toBeCloseTo(1.0606, 3);
    expect(station.options![0]!.state).toBe("GREEN");

    expect(station.options![1]!.label).toBe("(b)");
    expect(station.options![1]!.ratio).toBeCloseTo(1.1785, 3);
    expect(station.options![1]!.state).toBe("GREEN");

    expect(station.options![2]!.label).toBe("(c)");
    expect(station.options![2]!.ratio).toBeCloseTo(0.8754, 3);
    expect(station.options![2]!.state).toBe("RED");
    expect(station.options![2]!.gap).toBeCloseTo(14.8, 1);

    // PNR
    expect(station.pnr).toBeDefined();
    expect(station.pnr!.pnrDate).toBe("2027-02-03T00:00:00.000Z");
    expect(station.pnr!.daysRemaining).toBe(10);

    // Trace contains R08, R09, R10, R11 steps
    const traceRules = station.dimensions[0]?.trace.map((t) => t.rule);
    expect(traceRules).toContain("R01");
    expect(traceRules).toContain("R02");
    expect(traceRules).toContain("R03");
    expect(traceRules).toContain("R08");
    expect(traceRules).toContain("R09");
    expect(traceRules).toContain("R10");
    expect(traceRules).toContain("R11");
  });

  it("Determinism: evaluates identically 50 times", () => {
    const input: EngineInput = { seed, events: [legDelayed] };
    const now = "2027-01-24T08:10:00.000Z";
    const base = evaluate(input, now);
    for (let i = 0; i < 50; i++) {
      const res = evaluate(input, now);
      expect(res).toEqual(base);
    }
  });
});

