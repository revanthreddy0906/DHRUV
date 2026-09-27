import { generateCombinations } from "./combinations.js";
import { applyUncertainties } from "./worstCase.js";
import { evaluateDeterministicScenario } from "./scenario.js";
import type {
  EvaluatedScenario,
  GammaEvaluationResult,
  RobustnessBaseInputs,
  UncertainInput,
} from "./types.js";

const RATIO_EPSILON = 1e-12;

/**
 * Evaluates the worst-case scenario under a given Gamma budget of uncertainty.
 *
 * Gamma represents the maximum number of simultaneous adverse deviations that may occur.
 * - Gamma = 0 evaluates the nominal deterministic state without deviations.
 * - Gamma = k evaluates all combinations of k simultaneous uncertainties and returns the worst ratio.
 *
 * @param inputs Deterministic engine inputs.
 * @param uncertainties List of potential adverse deviations.
 * @param gamma Budget of simultaneous deviations (0 <= gamma <= uncertainties.length).
 * @returns Worst-case GammaEvaluationResult.
 */
export function evaluateGamma(
  inputs: RobustnessBaseInputs,
  uncertainties: readonly UncertainInput[],
  gamma: number,
): GammaEvaluationResult {
  if (!Number.isInteger(gamma) || gamma < 0 || gamma > uncertainties.length) {
    throw new Error(
      `Invalid Gamma value: ${gamma}. Gamma must be an integer between 0 and ${uncertainties.length}.`,
    );
  }

  // Evaluate nominal state (baseline)
  const nominalResult = evaluateDeterministicScenario(inputs);

  if (gamma === 0 || uncertainties.length === 0) {
    return {
      gamma: 0,
      ratio: nominalResult.ratio,
      state: nominalResult.state,
      bindingInputs: [],
      nominalRatio: nominalResult.ratio,
      nominalState: nominalResult.state,
      worstAvailability: nominalResult.availability.availability,
      worstRequirement: nominalResult.requirement.r,
    };
  }

  const combinations = generateCombinations(uncertainties, gamma);
  const scenarios: EvaluatedScenario[] = combinations.map((combo) => {
    const perturbedInputs = applyUncertainties(inputs, combo);
    const result = evaluateDeterministicScenario(perturbedInputs);
    const bindingInputs = combo.map((u) => u.name).sort();
    const bindingKey = bindingInputs.join(",");

    return {
      combo,
      bindingInputs,
      bindingKey,
      result,
      ratio: result.ratio,
      state: result.state,
      availability: result.availability.availability,
      requirement: result.requirement.r,
    };
  });

  // Find the worst-case scenario (minimum availability ratio)
  // Tie-break deterministically using the lexical binding key
  let worst = scenarios[0]!;
  for (let i = 1; i < scenarios.length; i++) {
    const candidate = scenarios[i]!;
    const diff = candidate.ratio - worst.ratio;

    if (diff < -RATIO_EPSILON) {
      // Candidate is strictly worse
      worst = candidate;
    } else if (Math.abs(diff) <= RATIO_EPSILON) {
      // Equal ratio: break tie deterministically via bindingKey
      if (candidate.bindingKey.localeCompare(worst.bindingKey) < 0) {
        worst = candidate;
      }
    }
  }

  return {
    gamma,
    ratio: worst.ratio,
    state: worst.state,
    bindingInputs: worst.bindingInputs,
    nominalRatio: nominalResult.ratio,
    nominalState: nominalResult.state,
    worstAvailability: worst.availability,
    worstRequirement: worst.requirement,
  };
}
