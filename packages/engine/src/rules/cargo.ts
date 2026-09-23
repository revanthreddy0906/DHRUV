import type { FreshnessClass, FreshnessResult } from "./freshness.js";
import { computeFeederSlack } from "./slip.js";

export interface CargoFeasibilityConfidence {
  legId: string;
  eta: string;
  cutoff: string;
  slackDays: number;
  freshness: FreshnessClass;
  ageHours: number;
  feasible: boolean;
  uncertain: boolean;
  reason: string;
  trace: string;
}

/**
 * R17: Cargo Feasibility Confidence.
 * Spec §7 line 295 / §8 line 347 / line 330:
 * "if an inbound leg's ETA report is STALE+ and its slack to cutoff is <= 2 days,
 * mark the inbound UNCERTAIN; band's low side computed without it."
 */
export function checkCargoFeasibilityConfidence(
  legId: string,
  eta: string,
  cutoff: string,
  legFreshness: FreshnessResult,
): CargoFeasibilityConfidence {
  const slackRes = computeFeederSlack(legId, eta, cutoff);
  const { slackDays, feasible } = slackRes;

  const isStalePlus = legFreshness.freshness === "STALE" || legFreshness.freshness === "CRITICAL";
  const uncertain = feasible && isStalePlus && slackDays <= 2;

  let reason: string;
  let trace: string;

  if (uncertain) {
    reason = `Inbound leg ETA report is ${legFreshness.freshness} (${legFreshness.ageHours.toFixed(
      1,
    )}h old) with <= 2d slack (${slackDays}d)`;
    trace = `[R17] Inbound ${legId}: UNCERTAIN - ETA report is ${
      legFreshness.freshness
    } (${legFreshness.ageHours.toFixed(1)}h old) with ${slackDays}d slack <= 2d`;
  } else if (!feasible) {
    reason = `Infeasible: ETA ${eta.slice(0, 10)} is after cutoff ${cutoff.slice(0, 10)} (${slackDays}d slack)`;
    trace = `[R17] Inbound ${legId}: INFEASIBLE - ETA after cutoff (${slackDays}d slack)`;
  } else {
    reason = `Feasible with adequate confidence (${slackDays}d slack, ${legFreshness.freshness} report)`;
    trace = `[R17] Inbound ${legId}: CONFIDENT - ${slackDays}d slack, report is ${
      legFreshness.freshness
    } (${legFreshness.ageHours.toFixed(1)}h old)`;
  }

  return {
    legId,
    eta,
    cutoff,
    slackDays,
    freshness: legFreshness.freshness,
    ageHours: legFreshness.ageHours,
    feasible,
    uncertain,
    reason,
    trace,
  };
}

