import { evaluateGamma } from "./evaluateGamma.js";
import type {
  GammaEvaluationResult,
  RobustnessBaseInputs,
  UncertainInput,
} from "./types.js";

/**
 * Public evaluation entry point for evaluating a deterministic state with a specified
 * Gamma budget of uncertainty.
 *
 * For Gamma = 0, this is strictly equivalent to the nominal deterministic calculation.
 * For Gamma > 0, it determines the worst-case scenario over all combinations of size Gamma.
 *
 * @param inputs Deterministic engine inputs.
 * @param uncertainties Array of discrete uncertain inputs.
 * @param gamma Budget of uncertainty (0 <= gamma <= uncertainties.length).
 * @returns GammaEvaluationResult for the requested budget level.
 */
export function evaluateWithBudget(
  inputs: RobustnessBaseInputs,
  uncertainties: readonly UncertainInput[],
  gamma: number,
): GammaEvaluationResult {
  return evaluateGamma(inputs, uncertainties, gamma);
}

/**
 * Evaluates the full Gamma robustness curve across all budget levels from 0 to n.
 *
 * @param inputs Deterministic engine inputs.
 * @param uncertainties Array of discrete uncertain inputs.
 * @returns Array of GammaEvaluationResult from Gamma = 0 to Gamma = uncertainties.length.
 */
export function evaluateBudgetCurve(
  inputs: RobustnessBaseInputs,
  uncertainties: readonly UncertainInput[],
): GammaEvaluationResult[] {
  const curve: GammaEvaluationResult[] = [];
  for (let gamma = 0; gamma <= uncertainties.length; gamma++) {
    curve.push(evaluateGamma(inputs, uncertainties, gamma));
  }
  return curve;
}
