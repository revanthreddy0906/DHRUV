import { describe, expect, it } from "vitest";
import type { OpEvent, Seed } from "@dhruv/shared";
import {
  classifyFreshness,
  worstFreshness,
  computeConfidenceBand,
  evaluateOptionVerification,
  computeStationState,
  computePersonnelCoverage,
  computeAssetRedundancy,
  computeMissionImpact,
  evaluate,
  type EngineInput,
  type GeneratedOption,
  type CataloguedLever,
} from "../src/index.js";

describe("R12: Freshness Classification", () => {
  const now = "2027-01-25T16:00:00.000Z";

  it("1-4. Classifies stock freshness through FRESH, AGING, STALE, CRITICAL thresholds", () => {
    // FRESH: < 24h (e.g. 10h old)
    const freshObs = "2027-01-25T06:00:00.000Z";
    const freshRes = classifyFreshness("INV-DSL", "stock", freshObs, now);
    expect(freshRes.freshness).toBe("FRESH");
    expect(freshRes.ageHours).toBeCloseTo(10, 1);
    expect(freshRes.uncertainty).toBe(0.01);
    expect(freshRes.trace).toContain("FRESH (u=1%)");

    // AGING: 24h to < 72h (e.g. 36h old)
    const agingObs = "2027-01-24T04:00:00.000Z";
    const agingRes = classifyFreshness("INV-DSL", "stock", agingObs, now);
    expect(agingRes.freshness).toBe("AGING");
    expect(agingRes.ageHours).toBeCloseTo(36, 1);
    expect(agingRes.uncertainty).toBe(0.03);
    expect(agingRes.trace).toContain("AGING (u=3%)");

    // STALE: 72h to < 7d (e.g. 100h old)
    const staleObs = "2027-01-21T12:00:00.000Z";
    const staleRes = classifyFreshness("INV-DSL", "stock", staleObs, now);
    expect(staleRes.freshness).toBe("STALE");
    expect(staleRes.ageHours).toBeCloseTo(100, 1);
    expect(staleRes.uncertainty).toBe(0.06);
    expect(staleRes.trace).toContain("STALE (u=6%)");

    // CRITICAL: >= 7d (168h) (e.g. 8 days old)
    const critObs = "2027-01-17T16:00:00.000Z";
    const critRes = classifyFreshness("INV-DSL", "stock", critObs, now);
    expect(critRes.freshness).toBe("CRITICAL");
    expect(critRes.ageHours).toBeCloseTo(192, 1);
    expect(critRes.uncertainty).toBe(0.12);
    expect(critRes.trace).toContain("CRITICAL (u=12%)");
  });

  it("5. Exact boundary behavior (< threshold is strict)", () => {
    // 24.0h exactly is NOT FRESH (it flips to AGING)
    const exact24hObs = "2027-01-24T16:00:00.000Z";
    const res24 = classifyFreshness("INV-DSL", "stock", exact24hObs, now);
    expect(res24.ageHours).toBe(24);
    expect(res24.freshness).toBe("AGING");

    // Just under 24h (23.99h) is FRESH
    const justUnder24 = new Date(new Date(now).getTime() - 23.99 * 3600000).toISOString();
    const resUnder24 = classifyFreshness("INV-DSL", "stock", justUnder24, now);
    expect(resUnder24.freshness).toBe("FRESH");

    // 72.0h exactly is NOT AGING (it flips to STALE)
    const exact72hObs = "2027-01-22T16:00:00.000Z";
    const res72 = classifyFreshness("INV-DSL", "stock", exact72hObs, now);
    expect(res72.ageHours).toBe(72);
    expect(res72.freshness).toBe("STALE");

    // 7 days (168h) exactly is CRITICAL
    const exact168hObs = "2027-01-18T16:00:00.000Z";
    const res168 = classifyFreshness("INV-DSL", "stock", exact168hObs, now);
    expect(res168.ageHours).toBe(168);
    expect(res168.freshness).toBe("CRITICAL");
  });

  it("6. All five freshness tiers (stock, cargoEta, position, link, asset)", () => {
    // cargoEta: <12h FRESH, <48h AGING, <7d STALE, >=7d CRITICAL
    const cargo10h = new Date(new Date(now).getTime() - 10 * 3600000).toISOString();
    expect(classifyFreshness("L2-C104", "cargoEta", cargo10h, now).freshness).toBe("FRESH");
    const cargo30h = new Date(new Date(now).getTime() - 30 * 3600000).toISOString();
    expect(classifyFreshness("L2-C104", "cargoEta", cargo30h, now).freshness).toBe("AGING");

    // position: <1h FRESH, <6h AGING, <24h STALE, >=24h CRITICAL
    const pos30m = new Date(new Date(now).getTime() - 0.5 * 3600000).toISOString();
    expect(classifyFreshness("SK-1", "position", pos30m, now).freshness).toBe("FRESH");
    const pos3h = new Date(new Date(now).getTime() - 3 * 3600000).toISOString();
    expect(classifyFreshness("SK-1", "position", pos3h, now).freshness).toBe("AGING");
    const pos10h = new Date(new Date(now).getTime() - 10 * 3600000).toISOString();
    expect(classifyFreshness("SK-1", "position", pos10h, now).freshness).toBe("STALE");

    // link: <1h FRESH, <6h AGING, <24h STALE, >=24h CRITICAL
    const link2h = new Date(new Date(now).getTime() - 2 * 3600000).toISOString();
    expect(classifyFreshness("MAITRI", "link", link2h, now).freshness).toBe("AGING");

    // asset: <6h FRESH, <24h AGING, <72h STALE, >=72h CRITICAL
    const asset5h = new Date(new Date(now).getTime() - 5 * 3600000).toISOString();
    expect(classifyFreshness("GEN-1", "asset", asset5h, now).freshness).toBe("FRESH");
    const asset12h = new Date(new Date(now).getTime() - 12 * 3600000).toISOString();
    expect(classifyFreshness("GEN-1", "asset", asset12h, now).freshness).toBe("AGING");
    const asset40h = new Date(new Date(now).getTime() - 40 * 3600000).toISOString();
    expect(classifyFreshness("GEN-1", "asset", asset40h, now).freshness).toBe("STALE");
  });

  it("7-8. Missing and invalid timestamps produce CRITICAL with 12% uncertainty", () => {
    const missing = classifyFreshness("INV-DSL", "stock", null, now);
    expect(missing.freshness).toBe("CRITICAL");
    expect(missing.ageHours).toBe(Infinity);
    expect(missing.uncertainty).toBe(0.12);
    expect(missing.trace).toContain("missing timestamp -> CRITICAL");

    const empty = classifyFreshness("INV-DSL", "stock", "", now);
    expect(empty.freshness).toBe("CRITICAL");
    expect(empty.uncertainty).toBe(0.12);

    const invalid = classifyFreshness("INV-DSL", "stock", "invalid-date", now);
    expect(invalid.freshness).toBe("CRITICAL");
    expect(invalid.uncertainty).toBe(0.12);
  });

  it("9. worstFreshness aggregates by oldest critical input (T-FRESH-03)", () => {
    expect(worstFreshness([])).toBe("FRESH");
    expect(worstFreshness(["FRESH", "FRESH"])).toBe("FRESH");
    expect(worstFreshness(["FRESH", "AGING"])).toBe("AGING");
    expect(worstFreshness(["FRESH", "STALE", "AGING"])).toBe("STALE");
    expect(worstFreshness(["STALE", "CRITICAL", "FRESH"])).toBe("CRITICAL");
  });

  it("10. Determinism: identical calls produce identical results", () => {
    const res1 = classifyFreshness("INV-DSL", "stock", "2027-01-24T04:00:00.000Z", now);
    const res2 = classifyFreshness("INV-DSL", "stock", "2027-01-24T04:00:00.000Z", now);
    expect(res1).toEqual(res2);
  });
});

describe("R13: Asymmetric Confidence Band", () => {
  it("1-7. Reproduces T-ENG-07 exact golden scenario (25 Jan 16:00, count 24 Jan 04:00, option a)", () => {
    // T-ENG-07:
    // Clock 25 Jan 16:00, count 24 Jan 04:00 -> Age 36h AGING, u=3%, b=0.825 kL
    // Option (a) state: stock=92.0, inbound=48.0, req=132.0
    // low 1.0334, high 1.0815, straddles=true, text "GREEN, could be AMBER"
    const band = computeConfidenceBand({
      stock: 92.0,
      inbound: 48.0,
      requirement: 132.0,
      rateNow: 0.55,
      ageHours: 36.0,
      freshness: "AGING",
      uncertainty: 0.03,
    });

    expect(band.burnDepletion).toBeCloseTo(0.825, 3);
    expect(band.low).toBeCloseTo(1.0334, 4);
    expect(band.high).toBeCloseTo(1.0815, 4);
    expect(band.point).toBeCloseTo(1.0606, 4);

    expect(band.pointState).toBe("GREEN");
    expect(band.lowState).toBe("AMBER");
    expect(band.highState).toBe("GREEN");

    expect(band.straddles).toBe(true);
    expect(band.text).toBe("GREEN, could be AMBER");
    expect(band.level).toBe("MEDIUM");

    expect(band.trace).toContain("[R13]");
    expect(band.trace).toContain("1.0334");
    expect(band.trace).toContain("1.0815");
    expect(band.trace).toContain("GREEN, could be AMBER");
  });

  it("8. Clean GREEN scenario after sync (count 7h old, low 1.0524, no straddle)", () => {
    // Spec line 329: "Freshness example (after sync, count 7h old): FRESH; band low 1.0524 -> clean GREEN, no straddle"
    const band = computeConfidenceBand({
      stock: 92.0,
      inbound: 48.0,
      requirement: 132.0,
      rateNow: 0.55,
      ageHours: 7.0,
      freshness: "FRESH",
      uncertainty: 0.01,
    });

    expect(band.burnDepletion).toBeCloseTo(0.55 * (7 / 24), 4);
    expect(band.low).toBeCloseTo(1.0524, 4);
    expect(band.pointState).toBe("GREEN");
    expect(band.lowState).toBe("GREEN");
    expect(band.straddles).toBe(false);
    expect(band.text).toBe("clean GREEN");
    expect(band.level).toBe("HIGH");
  });

  it("9. Straddle to RED produces 'GREEN, could be RED' and level LOW", () => {
    // If uncertainty is large or requirement is tight, low drops below amber threshold (0.95)
    const band = computeConfidenceBand({
      stock: 92.0,
      inbound: 48.0,
      requirement: 132.0,
      rateNow: 0.55,
      ageHours: 192.0, // 8 days old -> CRITICAL
      freshness: "CRITICAL",
      uncertainty: 0.12,
    });

    expect(band.pointState).toBe("GREEN");
    expect(band.lowState).toBe("RED");
    expect(band.straddles).toBe(true);
    expect(band.text).toBe("GREEN, could be RED");
    expect(band.level).toBe("LOW");
  });

  it("10. Determinism: identical calls produce identical confidence bands", () => {
    const params = {
      stock: 92.0,
      inbound: 48.0,
      requirement: 132.0,
      rateNow: 0.55,
      ageHours: 36.0,
      freshness: "AGING" as const,
    };
    expect(computeConfidenceBand(params)).toEqual(computeConfidenceBand(params));
  });
});

describe("R14: Verify First", () => {
  const dummyLever: CataloguedLever = {
    id: "HOLD_VESSEL",
    nodeId: "MAITRI",
    label: "Hold vessel",
    effect: {},
    cutoff: "2027-02-06T00:00:00.000Z",
    leadDays: 3,
    deadline: "2027-02-03T00:00:00.000Z",
    costAmount: 1950000,
    costUnit: "INR",
    synthetic: true,
    available: true,
    daysRemaining: 10,
    trace: "",
  };

  const dummyOption: GeneratedOption = {
    id: "OPT-HOLD_VESSEL",
    leverIds: ["HOLD_VESSEL"],
    levers: [dummyLever],
    availability: 140.0,
    rawRequirement: 120.0,
    requirement: 132.0,
    ratio: 1.0606,
    state: "GREEN",
    gap: 0,
    cost: 1950000,
    costUnit: "INR",
    deadline: "2027-02-03T00:00:00.000Z",
    bindingLeverId: "HOLD_VESSEL",
    slackDays: 0,
    reachesTarget: true,
    trace: "",
  };

  it("1. Fresh input and non-straddling band requires no verification", () => {
    const freshStock = classifyFreshness("INV-DSL", "stock", "2027-01-25T12:00:00.000Z", "2027-01-25T16:00:00.000Z");
    const freshLeg = classifyFreshness("L2-C104", "cargoEta", "2027-01-25T12:00:00.000Z", "2027-01-25T16:00:00.000Z");
    const cleanBand = computeConfidenceBand({
      stock: 92.0,
      inbound: 48.0,
      requirement: 132.0,
      rateNow: 0.55,
      ageHours: 4.0,
      freshness: "FRESH",
    });

    const res = evaluateOptionVerification(dummyOption, { stockFreshness: freshStock, legFreshness: freshLeg }, cleanBand);
    expect(res.needsVerification).toBe(false);
    expect(res.requiresVerify.length).toBe(0);
    expect(res.trace).toContain("no verification needed");
  });

  it("2-3. STALE and CRITICAL inputs trigger verification", () => {
    const staleStock = classifyFreshness("INV-DSL", "stock", "2027-01-21T00:00:00.000Z", "2027-01-25T16:00:00.000Z");
    const resStale = evaluateOptionVerification(dummyOption, { stockFreshness: staleStock });
    expect(resStale.needsVerification).toBe(true);
    expect(resStale.requiresVerify[0]).toContain("INV-DSL count is STALE");

    const critStock = classifyFreshness("INV-DSL", "stock", "2027-01-15T00:00:00.000Z", "2027-01-25T16:00:00.000Z");
    const resCrit = evaluateOptionVerification(dummyOption, { stockFreshness: critStock });
    expect(resCrit.needsVerification).toBe(true);
    expect(resCrit.requiresVerify[0]).toContain("INV-DSL count is CRITICAL");
  });

  it("4. Straddling confidence band triggers verification", () => {
    const agingStock = classifyFreshness("INV-DSL", "stock", "2027-01-24T04:00:00.000Z", "2027-01-25T16:00:00.000Z");
    const straddlingBand = computeConfidenceBand({
      stock: 92.0,
      inbound: 48.0,
      requirement: 132.0,
      rateNow: 0.55,
      ageHours: 36.0,
      freshness: "AGING",
      uncertainty: 0.03,
    });

    const res = evaluateOptionVerification(dummyOption, { stockFreshness: agingStock }, straddlingBand);
    expect(res.needsVerification).toBe(true);
    expect(res.requiresVerify.some((r) => r.includes("band straddles AMBER"))).toBe(true);
  });

  it("5-7. Inbound with <=2 days slack and non-FRESH ETA triggers verification with clean deduplication", () => {
    const agingLeg = classifyFreshness("L2-C104", "cargoEta", "2027-01-24T12:00:00.000Z", "2027-01-25T16:00:00.000Z");
    const res = evaluateOptionVerification(dummyOption, { legFreshness: agingLeg });
    expect(res.needsVerification).toBe(true);
    expect(res.requiresVerify.some((r) => r.includes("0d slack"))).toBe(true);

    // No duplicate entries
    expect(new Set(res.requiresVerify).size).toBe(res.requiresVerify.length);
  });
});

describe("R15: Station State and Gates", () => {
  it("1-3. Readiness rule: station state = worst of dimensions", () => {
    // All GREEN -> GREEN
    const allGreen = [
      { key: "FUEL", state: "GREEN" as const },
      { key: "PERSONNEL", state: "GREEN" as const },
      { key: "POWER", state: "GREEN" as const },
    ];
    expect(computeStationState(allGreen, []).state).toBe("GREEN");

    // One AMBER -> AMBER
    const oneAmber = [
      { key: "FUEL", state: "GREEN" as const },
      { key: "PERSONNEL", state: "AMBER" as const },
      { key: "POWER", state: "GREEN" as const },
    ];
    expect(computeStationState(oneAmber, []).state).toBe("AMBER");

    // One RED -> RED
    const oneRed = [
      { key: "FUEL", state: "RED" as const },
      { key: "PERSONNEL", state: "GREEN" as const },
      { key: "POWER", state: "GREEN" as const },
    ];
    expect(computeStationState(oneRed, []).state).toBe("RED");
  });

  it("4. Personnel role coverage dimension states (T-ENG-11)", () => {
    const AT = "2027-01-24T04:00:00.000Z";
    // 2 available -> GREEN
    const twoDocs = [
      { personId: "P-MENON", role: "DOCTOR", nodeId: "MAITRI", status: "ON_STATION", lastObservedAt: AT },
      { personId: "P-SHAH", role: "DOCTOR", nodeId: "MAITRI", status: "ON_STATION", lastObservedAt: AT },
    ];
    expect(computePersonnelCoverage(twoDocs, "DOCTOR", 1).state).toBe("GREEN");

    // 1 available (Dr K. Menon UNAVAILABLE) -> AMBER
    const oneDoc = [
      { personId: "P-MENON", role: "DOCTOR", nodeId: "MAITRI", status: "UNAVAILABLE", lastObservedAt: AT },
      { personId: "P-SHAH", role: "DOCTOR", nodeId: "MAITRI", status: "ON_STATION", lastObservedAt: AT },
    ];
    expect(computePersonnelCoverage(oneDoc, "DOCTOR", 1).state).toBe("AMBER");

    // 0 available -> RED
    const zeroDocs = [
      { personId: "P-MENON", role: "DOCTOR", nodeId: "MAITRI", status: "UNAVAILABLE", lastObservedAt: AT },
      { personId: "P-SHAH", role: "DOCTOR", nodeId: "MAITRI", status: "UNAVAILABLE", lastObservedAt: AT },
    ];
    expect(computePersonnelCoverage(zeroDocs, "DOCTOR", 1).state).toBe("RED");
  });

  it("5. Generator redundancy dimension states (T-ENG-12)", () => {
    const AT = "2027-01-24T04:00:00.000Z";
    const gen = (id: string, status: string) => ({
      assetId: id,
      nodeId: "MAITRI",
      type: "GENERATOR",
      status,
      lat: null,
      lon: null,
      lastObservedAt: AT,
    });

    // 3 OK -> GREEN
    const threeGens = [gen("GEN-1", "OK"), gen("GEN-2", "OK"), gen("GEN-3", "OK")];
    expect(computeAssetRedundancy(threeGens, "GENERATOR", 2, "generators").state).toBe("GREEN");

    // 2 OK (GEN-3 DOWN) -> AMBER
    const twoGens = [gen("GEN-1", "OK"), gen("GEN-2", "OK"), gen("GEN-3", "DOWN")];
    expect(computeAssetRedundancy(twoGens, "GENERATOR", 2, "generators").state).toBe("AMBER");

    // 1 OK (two down) -> RED
    const oneGen = [gen("GEN-1", "OK"), gen("GEN-2", "DOWN"), gen("GEN-3", "DOWN")];
    expect(computeAssetRedundancy(oneGen, "GENERATOR", 2, "generators").state).toBe("RED");
  });

  it("6. Open incident adds OPEN_INCIDENT gate banner", () => {
    const incEvent: OpEvent = {
      event_id: "e-inc-1",
      device_id: "MAITRI-TAB-01",
      seq: 1,
      type: "INCIDENT_OPENED",
      entity_type: "incident",
      entity_id: "INC-01",
      node_id: "MAITRI",
      payload: {
        incident_id: "INC-01",
        type: "MEDICAL",
        person_ids: ["P-VERMA"],
        last_confirmed_at: "2027-01-24T08:00:00.000Z",
      },
      observed_at: "2027-01-24T08:00:00.000Z",
      created_at_client: "2027-01-24T08:00:00.000Z",
      priority: 0,
      actor_role: "STATION_LEADER",
      schema_version: 1,
    };

    const res = computeStationState([{ key: "FUEL", state: "GREEN" }], [incEvent], [], "MAITRI");
    expect(res.state).toBe("GREEN"); // state remains based on dimensions
    expect(res.gates.length).toBe(1);
    expect(res.gates[0]!.type).toBe("OPEN_INCIDENT");
    expect(res.gates[0]!.id).toBe("INC-01");
    expect(res.blocked).toBe(true);
    expect(res.trace.some((t) => t.includes("Gate: Open incident INC-01"))).toBe(true);
  });

  it("7. Resolved incident does NOT add a gate banner", () => {
    const incOpen: OpEvent = {
      event_id: "e-inc-1",
      device_id: "MAITRI-TAB-01",
      seq: 1,
      type: "INCIDENT_OPENED",
      entity_type: "incident",
      entity_id: "INC-01",
      node_id: "MAITRI",
      payload: { incident_id: "INC-01", type: "MEDICAL", person_ids: ["P-VERMA"], last_confirmed_at: "2027-01-24T08:00:00.000Z" },
      observed_at: "2027-01-24T08:00:00.000Z",
      created_at_client: "2027-01-24T08:00:00.000Z",
      priority: 0,
      actor_role: "STATION_LEADER",
      schema_version: 1,
    };
    const incResolved: OpEvent = {
      event_id: "e-inc-2",
      device_id: "MAITRI-TAB-01",
      seq: 2,
      type: "INCIDENT_UPDATED",
      entity_type: "incident",
      entity_id: "INC-01",
      node_id: "MAITRI",
      payload: { incident_id: "INC-01", status: "RESOLVED" },
      observed_at: "2027-01-24T12:00:00.000Z",
      created_at_client: "2027-01-24T12:00:00.000Z",
      priority: 0,
      actor_role: "STATION_LEADER",
      schema_version: 1,
    };

    const res = computeStationState([{ key: "FUEL", state: "GREEN" }], [incOpen, incResolved], [], "MAITRI");
    expect(res.gates.length).toBe(0);
    expect(res.blocked).toBe(false);
  });

  it("8. Blocked mission adds BLOCKED_MISSION gate banner", () => {
    const blockedMissions = [
      {
        missionId: "F-27",
        status: "BLOCKED" as const,
        why: "required asset SK-4 is not OK",
        trace: "[R07] F-27: BLOCKED",
      },
    ];

    const res = computeStationState([{ key: "FUEL", state: "GREEN" }], [], blockedMissions, "MAITRI");
    expect(res.gates.length).toBe(1);
    expect(res.gates[0]!.type).toBe("BLOCKED_MISSION");
    expect(res.gates[0]!.id).toBe("F-27");
  });
});

describe("Integration: Full Evaluation Pipeline (R01-R15)", () => {
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
    personnel: [
      { id: "P-MENON", name: "Dr K. Menon", role: "DOCTOR", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
      { id: "P-SHAH", name: "Dr P. Shah", role: "DOCTOR", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
      { id: "P-MECH1", name: "Mechanic 1", role: "DIESEL_MECHANIC", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
      { id: "P-MECH2", name: "Mechanic 2", role: "DIESEL_MECHANIC", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
      { id: "P-COMMS1", name: "Comms 1", role: "COMMS_ENGINEER", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
      { id: "P-COMMS2", name: "Comms 2", role: "COMMS_ENGINEER", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
      { id: "P-COOK1", name: "Cook 1", role: "COOK", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
      { id: "P-COOK2", name: "Cook 2", role: "COOK", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
      { id: "P-VERMA", name: "Dr A. Verma", role: "GLACIOLOGIST", node_id: "MAITRI", status: "ON_STATION", last_seen: "2027-01-24T04:00:00.000Z" },
      { id: "P-NAIR", name: "R. Nair", role: "FIELD_GUIDE", node_id: "MAITRI", status: "FIELD", last_seen: "2027-01-24T04:00:00.000Z" },
    ],
    assets: [
      { id: "GEN-1", node_id: "MAITRI", type: "GENERATOR", status: "OK", lat: null, lon: null, last_seen: "2027-01-24T04:00:00.000Z", speed_kmh: null },
      { id: "GEN-2", node_id: "MAITRI", type: "GENERATOR", status: "OK", lat: null, lon: null, last_seen: "2027-01-24T04:00:00.000Z", speed_kmh: null },
      { id: "GEN-3", node_id: "MAITRI", type: "GENERATOR", status: "OK", lat: null, lon: null, last_seen: "2027-01-24T04:00:00.000Z", speed_kmh: null },
      { id: "SK-4", node_id: "MAITRI", type: "SKIDOO", status: "OK", lat: null, lon: null, last_seen: "2027-01-24T04:00:00.000Z", speed_kmh: 30 },
    ],
    missions: [
      { id: "F-27", node_id: "MAITRI", name: "Traverse", start_date: "2027-02-03T00:00:00.000Z", end_date: "2027-02-10T00:00:00.000Z", fuel_kl: 4.0, needs: "", status: "PLANNED" },
    ],
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

  it("evaluate() runs R01-R15: fuel RED at 0.6970, confidence band calculated, options carry band and requiresVerify", () => {
    const input: EngineInput = { seed, events: [legDelayed] };
    const now = "2027-01-25T16:00:00.000Z"; // 36 hours after 24 Jan 04:00 count
    const res = evaluate(input, now);

    const station = res.stations[0]!;
    expect(station.state).toBe("RED"); // fuel is RED -> station is RED

    // Check dimensions
    expect(station.dimensions.length).toBe(3); // FUEL, PERSONNEL, POWER
    const fuelDim = station.dimensions.find((d) => d.key === "FUEL")!;
    expect(fuelDim.state).toBe("RED");
    expect(fuelDim.freshness).toBe("AGING"); // 36h is AGING
    expect(fuelDim.confidence).toBeDefined();

    const personDim = station.dimensions.find((d) => d.key === "PERSONNEL")!;
    expect(personDim.state).toBe("GREEN");

    const powerDim = station.dimensions.find((d) => d.key === "POWER")!;
    expect(powerDim.state).toBe("GREEN");

    // Options have confidence band and verify requirement
    expect(station.options).toBeDefined();
    const optA = station.options![0]!;
    expect(optA.confidenceBand).toBeDefined();
    expect(optA.confidenceBand!.low).toBeCloseTo(1.0382, 3);
    expect(optA.confidenceBand!.high).toBeCloseTo(1.0865, 3);
    expect(optA.confidenceBand!.straddles).toBe(true);
    expect(optA.confidenceBand!.text).toBe("GREEN, could be AMBER");

    expect(optA.requiresVerify).toBeDefined();
    expect(optA.requiresVerify!.length).toBeGreaterThan(0);
    expect(optA.requiresVerify!.some((r) => r.includes("band straddles AMBER"))).toBe(true);

    // Traces contain R12, R13, R14, R15
    const rules = fuelDim.trace.map((t) => t.rule);
    expect(rules).toContain("R12");
    expect(rules).toContain("R13");
    expect(rules).toContain("R14");
    expect(rules).toContain("R15");
  });

  it("Determinism: 50 repeated evaluations of full R01-R15 pipeline produce deep-equal results", () => {
    const input: EngineInput = { seed, events: [legDelayed] };
    const now = "2027-01-25T16:00:00.000Z";
    const base = evaluate(input, now);
    for (let i = 0; i < 50; i++) {
      expect(evaluate(input, now)).toEqual(base);
    }
  });
});
