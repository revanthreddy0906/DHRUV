import { describe, expect, it } from "vitest";
import { computeRequirement, type PhaseBoundaries } from "../src/rules/requirement.js";
import { checkFeasibility } from "../src/rules/feasibility.js";
import { computeAvailability } from "../src/rules/availability.js";
import type { InventoryState, LegState, VesselState } from "../src/state.js";

const maitriDiesel: InventoryState = {
  itemId: "INV-DSL", nodeId: "MAITRI", stock: 92.0, unit: "kL",
  reservePct: 0.10, dimension: "FUEL", lastObservedAt: "2027-01-24T04:00:00.000Z",
};

const dieselProfiles = [
  { item_id: "INV-DSL", phase: "CLOSING" as const, rate_per_day: 0.55 },
  { item_id: "INV-DSL", phase: "WINTER" as const, rate_per_day: 0.38 },
  { item_id: "INV-DSL", phase: "MOBILISATION" as const, rate_per_day: 0.35 },
];

const phaseBoundaries: PhaseBoundaries = {
  CLOSING: { start: "2027-01-24T00:00:00.000Z", end: "2027-03-01T00:00:00.000Z" },
  WINTER: { start: "2027-03-01T00:00:00.000Z", end: "2027-11-16T00:00:00.000Z" },
  MOBILISATION: { start: "2027-11-16T00:00:00.000Z", end: "2027-11-20T00:00:00.000Z" },
};

const feederLeg: LegState = {
  legId: "L2-C104", shipmentId: "C-104", status: "IN_TRANSIT",
  eta: "2027-02-02T00:00:00.000Z", etd: "2027-01-12T00:00:00.000Z", vesselId: null,
};

const vessel: VesselState = {
  vesselId: "V-ICE-STAR", departure: "2027-02-06T00:00:00.000Z",
  loadCutoff: "2027-02-04T00:00:00.000Z", etaStation: "2027-02-24T00:00:00.000Z",
  stationClosingDate: "2027-02-28T00:00:00.000Z",
};

describe("R01-R04 rules", () => {
  it("start state: requirement, feasible inbound, GREEN", () => {
    const req = computeRequirement(maitriDiesel, dieselProfiles, "2027-01-24T08:00:00.000Z", phaseBoundaries);
    expect(req.rBase).toBeCloseTo(120.0, 1);
    expect(req.r).toBeCloseTo(132.0, 1);

    const feas = checkFeasibility(feederLeg, vessel);
    expect(feas.feasible).toBe(true);
    expect(feas.slackDays).toBeCloseTo(2, 1);

    const avail = computeAvailability("INV-DSL", 92.0, 48.0, req.r);
    expect(avail.ratio).toBeCloseTo(1.0606, 3);
    expect(avail.state).toBe("GREEN");
  });

  it("after delay: leg excluded (window cliff), state RED", () => {
    const delayedLeg: LegState = { ...feederLeg, eta: "2027-02-07T00:00:00.000Z" };
    const feas = checkFeasibility(delayedLeg, vessel);
    expect(feas.feasible).toBe(false);
    expect(feas.reason).toContain("window cliff");

    const req = computeRequirement(maitriDiesel, dieselProfiles, "2027-01-24T08:00:00.000Z", phaseBoundaries);
    const avail = computeAvailability("INV-DSL", 92.0, 0, req.r);
    expect(avail.ratio).toBeCloseTo(0.697, 3);
    expect(avail.state).toBe("RED");
  });
});
