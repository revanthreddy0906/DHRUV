import { describe, expect, it } from "vitest";
import {
  applyUncertainties,
  evaluateBudgetCurve,
  evaluateDeterministicScenario,
  evaluateGamma,
  evaluateWithBudget,
  generateCombinations,
  type RobustnessBaseInputs,
  type UncertainInput,
} from "../src/robustness/index.js";
import { computeRequirement } from "../src/rules/requirement.js";
import { checkFeasibility } from "../src/rules/feasibility.js";
import { computeAvailability } from "../src/rules/availability.js";

function createBaseFixture(): RobustnessBaseInputs {
  return {
    item: {
      itemId: "INV-DSL",
      nodeId: "MAITRI",
      stock: 92.0,
      unit: "kL",
      reservePct: 0.10,
      dimension: "FUEL",
      lastObservedAt: "2027-01-24T04:00:00.000Z",
    },
    consumptionProfiles: [
      { item_id: "INV-DSL", phase: "CLOSING", rate_per_day: 0.55 },
      { item_id: "INV-DSL", phase: "WINTER", rate_per_day: 0.38 },
      { item_id: "INV-DSL", phase: "MOBILISATION", rate_per_day: 0.35 },
    ],
    now: "2027-01-24T08:00:00.000Z",
    phaseBoundaries: {
      CLOSING: { start: "2027-01-24T00:00:00.000Z", end: "2027-02-28T00:00:00.000Z" },
      WINTER: { start: "2027-03-01T00:00:00.000Z", end: "2027-10-31T00:00:00.000Z" },
      MOBILISATION: { start: "2027-11-01T00:00:00.000Z", end: "2027-11-20T00:00:00.000Z" },
    },
    inboundLeg: {
      legId: "L2-C104",
      shipmentId: "C-104",
      status: "IN_TRANSIT",
      eta: "2027-02-02T00:00:00.000Z",
      etd: "2027-01-12T00:00:00.000Z",
      vesselId: null,
    },
    vessel: {
      vesselId: "V-ICE-STAR",
      departure: "2027-02-06T00:00:00.000Z",
      loadCutoff: "2027-02-04T00:00:00.000Z",
      etaStation: "2027-02-24T00:00:00.000Z",
      stationClosingDate: "2027-02-28T00:00:00.000Z",
    },
    inboundCargoQty: 48.0,
  };
}

function createSampleUncertainties(): UncertainInput[] {
  return [
    {
      name: "burn_rate_cold_snap",
      target: "burnRate",
      nominal: 0,
      deviation: 15,
      unit: "percent",
      adverseDirection: "increase",
    },
    {
      name: "stock_measurement_error",
      target: "stockCount",
      nominal: 92.0,
      deviation: 10,
      unit: "percent",
      adverseDirection: "decrease",
    },
    {
      name: "feeder_transit_delay",
      target: "shipmentSlack",
      nominal: 2,
      deviation: 3,
      unit: "absolute",
      adverseDirection: "decrease",
    },
  ];
}

describe("Gamma Budget of Uncertainty Robustness Layer", () => {
  describe("Combination Generation (C(n, k))", () => {
    it("generates exact C(n, k) combinations without duplicates", () => {
      const items = ["A", "B", "C", "D"];

      expect(generateCombinations(items, 0)).toEqual([[]]);
      expect(generateCombinations(items, 1)).toEqual([["A"], ["B"], ["C"], ["D"]]);
      expect(generateCombinations(items, 2)).toEqual([
        ["A", "B"], ["A", "C"], ["A", "D"],
        ["B", "C"], ["B", "D"],
        ["C", "D"],
      ]);
      expect(generateCombinations(items, 3)).toEqual([
        ["A", "B", "C"], ["A", "B", "D"], ["A", "C", "D"], ["B", "C", "D"],
      ]);
      expect(generateCombinations(items, 4)).toEqual([["A", "B", "C", "D"]]);
    });

    it("handles combination count formula n! / (k! * (n-k)!)", () => {
      const items = [1, 2, 3, 4, 5];
      expect(generateCombinations(items, 0).length).toBe(1);
      expect(generateCombinations(items, 1).length).toBe(5);
      expect(generateCombinations(items, 2).length).toBe(10);
      expect(generateCombinations(items, 3).length).toBe(10);
      expect(generateCombinations(items, 4).length).toBe(5);
      expect(generateCombinations(items, 5).length).toBe(1);
    });

    it("rejects invalid k values (negative, greater than length, or non-integer)", () => {
      const items = ["A", "B"];
      expect(() => generateCombinations(items, -1)).toThrow(/Invalid combination size/);
      expect(() => generateCombinations(items, 3)).toThrow(/Invalid combination size/);
      expect(() => generateCombinations(items, 1.5)).toThrow(/Invalid combination size/);
    });
  });

  describe("Gamma 0 Exact Nominal Equivalence", () => {
    it("produces identical output to direct deterministic engine execution", () => {
      const fixture = createBaseFixture();
      const uncertainties = createSampleUncertainties();

      const nominalDirect = evaluateDeterministicScenario(fixture);
      const gamma0Res = evaluateWithBudget(fixture, uncertainties, 0);

      expect(gamma0Res.gamma).toBe(0);
      expect(gamma0Res.ratio).toBe(nominalDirect.ratio);
      expect(gamma0Res.state).toBe(nominalDirect.state);
      expect(gamma0Res.bindingInputs).toEqual([]);
      expect(gamma0Res.nominalRatio).toBe(nominalDirect.ratio);
      expect(gamma0Res.nominalState).toBe(nominalDirect.state);
      expect(gamma0Res.worstAvailability).toBe(nominalDirect.availability.availability);
      expect(gamma0Res.worstRequirement).toBe(nominalDirect.requirement.r);
    });
  });

  describe("Gamma 1 Individual Uncertainties Evaluation", () => {
    it("evaluates every individual uncertainty and selects the worst", () => {
      const fixture = createBaseFixture();
      const uncertainties = createSampleUncertainties();

      // Feeder transit delay causes inbound 48kL to miss cutoff (slack 2d - 3d = -1d -> infeasible)
      // This is the worst single uncertainty (availability drops from 140 to 92)
      const res = evaluateWithBudget(fixture, uncertainties, 1);

      expect(res.gamma).toBe(1);
      expect(res.bindingInputs).toEqual(["feeder_transit_delay"]);
      expect(res.state).toBe("RED");
      expect(res.ratio).toBeLessThan(res.nominalRatio!);
    });
  });

  describe("Gamma Monotonicity", () => {
    it("guarantees worst-case ratio never improves as Gamma increases", () => {
      const fixture = createBaseFixture();
      const uncertainties = createSampleUncertainties();

      const curve = evaluateBudgetCurve(fixture, uncertainties);

      expect(curve.length).toBe(4); // Gamma = 0, 1, 2, 3

      for (let i = 1; i < curve.length; i++) {
        const prev = curve[i - 1]!;
        const curr = curve[i]!;
        expect(curr.gamma).toBe(i);
        expect(curr.ratio).toBeLessThanOrEqual(prev.ratio);
      }
    });
  });

  describe("Determinism and Reproducibility", () => {
    it("produces exact identical results across repeated calls without randomness", () => {
      const fixture = createBaseFixture();
      const uncertainties = createSampleUncertainties();

      const run1 = evaluateWithBudget(fixture, uncertainties, 2);
      const run2 = evaluateWithBudget(fixture, uncertainties, 2);

      expect(run1).toEqual(run2);
    });

    it("breaks ties deterministically using lexical binding keys", () => {
      const fixture = createBaseFixture();
      // Create two uncertainties with identical impact on stock
      const uncertainties: UncertainInput[] = [
        {
          name: "source_b_loss",
          target: "stockCount",
          nominal: 92.0,
          deviation: 10,
          unit: "absolute",
          adverseDirection: "decrease",
        },
        {
          name: "source_a_loss",
          target: "stockCount",
          nominal: 92.0,
          deviation: 10,
          unit: "absolute",
          adverseDirection: "decrease",
        },
      ];

      const res = evaluateWithBudget(fixture, uncertainties, 1);
      // Both have identical ratio (stock = 82); source_a_loss wins tie-break lexically
      expect(res.bindingInputs).toEqual(["source_a_loss"]);
    });
  });

  describe("Gamma 2 Binding Pair and Gamma n Full Deviation", () => {
    it("finds the worst-case pair of concurrent uncertainties for Gamma 2", () => {
      const fixture = createBaseFixture();
      const uncertainties = createSampleUncertainties();

      const res = evaluateWithBudget(fixture, uncertainties, 2);

      expect(res.gamma).toBe(2);
      expect(res.bindingInputs.length).toBe(2);
      expect(res.bindingInputs).toEqual(["burn_rate_cold_snap", "feeder_transit_delay"]);
    });

    it("applies all active uncertainties at Gamma = n", () => {
      const fixture = createBaseFixture();
      const uncertainties = createSampleUncertainties();

      const res = evaluateWithBudget(fixture, uncertainties, 3);

      expect(res.gamma).toBe(3);
      expect(res.bindingInputs).toEqual([
        "burn_rate_cold_snap",
        "feeder_transit_delay",
        "stock_measurement_error",
      ]);
    });
  });

  describe("Validation & Error Handling", () => {
    it("rejects negative Gamma", () => {
      const fixture = createBaseFixture();
      const uncertainties = createSampleUncertainties();
      expect(() => evaluateWithBudget(fixture, uncertainties, -1)).toThrow(/Invalid Gamma value/);
    });

    it("rejects Gamma greater than number of uncertainties", () => {
      const fixture = createBaseFixture();
      const uncertainties = createSampleUncertainties();
      expect(() => evaluateWithBudget(fixture, uncertainties, 4)).toThrow(/Invalid Gamma value/);
    });

    it("rejects fractional Gamma", () => {
      const fixture = createBaseFixture();
      const uncertainties = createSampleUncertainties();
      expect(() => evaluateWithBudget(fixture, uncertainties, 1.5)).toThrow(/Invalid Gamma value/);
    });
  });

  describe("Immutability of Base Inputs", () => {
    it("does not mutate original item, leg, or vessel objects", () => {
      const fixture = createBaseFixture();
      const originalStock = fixture.item.stock;
      const originalUplift = fixture.item.burnUplift;
      const originalEta = fixture.inboundLeg!.eta;
      const uncertainties = createSampleUncertainties();

      evaluateWithBudget(fixture, uncertainties, 3);

      expect(fixture.item.stock).toBe(originalStock);
      expect(fixture.item.burnUplift).toBe(originalUplift);
      expect(fixture.inboundLeg!.eta).toBe(originalEta);
    });
  });

  describe("Engine Rules Integration Verification", () => {
    it("integrates with R01 computeRequirement: burnRate uncertainty modifies requirement R", () => {
      const fixture = createBaseFixture();
      const nominalReq = computeRequirement(
        fixture.item,
        fixture.consumptionProfiles,
        fixture.now,
        fixture.phaseBoundaries,
      );

      const burnUncertainty: UncertainInput[] = [
        {
          name: "cold_snap",
          target: "burnRate",
          nominal: 0,
          deviation: 20,
          unit: "percent",
          adverseDirection: "increase",
        },
      ];

      const res = evaluateWithBudget(fixture, burnUncertainty, 1);
      expect(res.worstRequirement).toBeCloseTo(nominalReq.r * 1.2, 2);
    });

    it("integrates with R02 checkFeasibility: shipmentSlack uncertainty modifies feasibility", () => {
      const fixture = createBaseFixture();
      const nominalFeas = checkFeasibility(fixture.inboundLeg!, fixture.vessel!);
      expect(nominalFeas.feasible).toBe(true);

      const slackUncertainty: UncertainInput[] = [
        {
          name: "vessel_delay",
          target: "shipmentSlack",
          nominal: 2,
          deviation: 3,
          unit: "absolute",
          adverseDirection: "decrease",
        },
      ];

      const res = evaluateWithBudget(fixture, slackUncertainty, 1);
      // Inbound 48kL is excluded because feeder leg moves past cutoff date (2 Feb + 3d = 5 Feb > 4 Feb)
      expect(res.worstAvailability).toBe(fixture.item.stock); // 92 instead of 140
    });

    it("integrates with R03 computeAvailability: stockCount uncertainty modifies stock", () => {
      const fixture = createBaseFixture();
      const nominalAvail = computeAvailability(
        fixture.item.itemId,
        fixture.item.stock,
        0,
        100,
      );
      expect(nominalAvail.availability).toBe(92);

      const stockUncertainty: UncertainInput[] = [
        {
          name: "tank_leakage",
          target: "stockCount",
          nominal: 92,
          deviation: 12,
          unit: "absolute",
          adverseDirection: "decrease",
        },
      ];

      const res = evaluateWithBudget(fixture, stockUncertainty, 1);
      expect(res.worstAvailability).toBe(92 - 12 + 48); // 80 stock + 48 inbound = 128
    });
  });
});
