import { computeRequirement } from "../rules/requirement.js";
import { checkFeasibility } from "../rules/feasibility.js";
import { computeAvailability } from "../rules/availability.js";
import type { DeterministicEvaluationResult, RobustnessBaseInputs } from "./types.js";

/**
 * Pure evaluator that runs the existing deterministic engine rules (R01, R02, R03)
 * against a given state scenario without modifying any logic.
 *
 * @param inputs Deterministic engine inputs for requirement, feasibility, and availability.
 * @returns Deterministic evaluation result containing R01, R02, and R03 outputs.
 */
export function evaluateDeterministicScenario(
  inputs: RobustnessBaseInputs,
): DeterministicEvaluationResult {
  // R01: Compute requirement based on item burn rates, phase boundaries, and reserves
  const requirement = computeRequirement(
    inputs.item,
    inputs.consumptionProfiles,
    inputs.now,
    inputs.phaseBoundaries,
  );

  // R02: Check feasibility of inbound feeder leg against vessel cutoff, if applicable
  let feasibility;
  let inboundQty = 0;

  if (inputs.inboundLeg && inputs.vessel) {
    feasibility = checkFeasibility(inputs.inboundLeg, inputs.vessel);
    if (feasibility.feasible) {
      inboundQty = inputs.inboundCargoQty ?? 0;
    }
  } else if (inputs.inboundCargoQty !== undefined) {
    inboundQty = inputs.inboundCargoQty;
  }

  // R03: Compute availability ratio and classification state (GREEN / AMBER / RED)
  const availability = computeAvailability(
    inputs.item.itemId,
    inputs.item.stock,
    inboundQty,
    requirement.r,
  );

  return {
    requirement,
    feasibility,
    inboundQty,
    availability,
    ratio: availability.ratio,
    state: availability.state,
  };
}
