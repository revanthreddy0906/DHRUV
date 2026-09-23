// packages/engine — pure deterministic engine (Paridhi v2 §2.3, §7)
// No Date.now(), no Math.random(), no fetch, no runtime deps. Enforced by lint later.
import type { OpEvent, Seed } from "@dhruv/shared";
import { reduce } from "./reduce.js";
import { computeRequirement } from "./rules/requirement.js";
import { checkFeasibility } from "./rules/feasibility.js";
import { computeAvailability } from "./rules/availability.js";

export { reduce } from "./reduce.js";
export type {
  AssetState,
  DecisionState,
  InventoryState,
  LegState,
  LinkNodeState,
  MissionState,
  PersonnelState,
  State,
  VesselState,
} from "./state.js";
export {
  computeRequirement,
  type PhaseBoundaries,
  type PhaseBoundary,
  type RequirementResult,
} from "./rules/requirement.js";
export { checkFeasibility, type FeasibilityResult } from "./rules/feasibility.js";
export { computeAvailability, worstOf, type AvailabilityResult } from "./rules/availability.js";

/**
 * Placeholder for the pure engine (Build Bible section 7, owned by A).
 * No clock, no randomness: `now` is always passed in by the caller.
 * The backend calls evaluate() directly for POST /scenarios/run.
 */
export interface EngineInput {
  seed: Seed;
  events: OpEvent[];
}

export interface TraceStep {
  rule: string;
  text: string;
}

export interface DimensionEval {
  key: string;
  state: "GREEN" | "AMBER" | "RED";
  ratio: number | null;
  trace: TraceStep[];
}

export interface StationEval {
  nodeId: string;
  state: "GREEN" | "AMBER" | "RED";
  dimensions: DimensionEval[];
}

export interface Evaluation {
  at: string;
  stations: StationEval[];
}

const MAITRI_DIESEL_PHASE_BOUNDARIES = {
  CLOSING: { start: "2027-01-24T00:00:00.000Z", end: "2027-03-01T00:00:00.000Z" },
  WINTER: { start: "2027-03-01T00:00:00.000Z", end: "2027-11-16T00:00:00.000Z" },
  MOBILISATION: { start: "2027-11-16T00:00:00.000Z", end: "2027-11-20T00:00:00.000Z" },
};

export function evaluate(input: EngineInput, now: string): Evaluation {
  const state = reduce(input.seed, input.events);

  const dieselId = "INV-DSL"; // TODO(A): hardcoded to Maitri diesel only tonight.
  // Full multi-item, multi-station, multi-dimension evaluation (R05-R19)
  // is a separate task. Do not silently expand scope here.
  const diesel = state.inventory.get(dieselId);

  const stations: StationEval[] = [];
  if (diesel) {
    const req = computeRequirement(diesel, input.seed.consumption_profiles, now, MAITRI_DIESEL_PHASE_BOUNDARIES);

    const legId = "L2-C104"; // TODO(A): hardcoded to C-104's feeder leg tonight.
    const leg = state.legs.get(legId);
    const vessel = state.vessels.get("V-ICE-STAR");
    let feasibleQty = 0;
    const legTrace: TraceStep[] = [];
    if (leg && vessel) {
      const feas = checkFeasibility(leg, vessel);
      legTrace.push({ rule: "R02", text: feas.trace });
      if (feas.feasible) feasibleQty = 48.0; // TODO(A): cargo qty hardcoded, no cargo_items lookup yet.
    }

    const avail = computeAvailability(dieselId, diesel.stock, feasibleQty, req.r);

    stations.push({
      nodeId: diesel.nodeId,
      state: avail.state,
      dimensions: [
        {
          key: "FUEL",
          state: avail.state,
          ratio: avail.ratio,
          trace: [
            { rule: "R01", text: req.trace },
            ...legTrace,
            { rule: "R03", text: avail.trace },
          ],
        },
      ],
    });
  }

  return { at: now, stations };
}
