import type { ConfidenceBand } from "./confidence.js";
import type { FreshnessResult } from "./freshness.js";
import type { GeneratedOption } from "./options.js";

export interface VerifyResult {
  requiresVerify: string[];
  needsVerification: boolean;
  trace: string;
}

export interface VerificationInputs {
  stockFreshness?: FreshnessResult;
  legFreshness?: FreshnessResult;
  assetFreshness?: Map<string, FreshnessResult>;
}

/**
 * R14: Verify First.
 * Spec §8 line 363:
 * "any option depending on a STALE/CRITICAL input, or an UNCERTAIN inbound (R17),
 * shows 'Verify before acting' and requires a ticked confirmation, recorded in DECISION_APPROVED.verify_ack."
 * Also fires when confidence band straddles (Spec line 662: "Option (a): 'GREEN, could be AMBER (count 36h old)', 0 days slack, verify required").
 */
export function evaluateOptionVerification(
  option: GeneratedOption,
  inputs: VerificationInputs,
  confidenceBand?: ConfidenceBand,
): VerifyResult {
  const requiresVerify: string[] = [];

  // 1. Check stock count freshness
  if (inputs.stockFreshness) {
    const sf = inputs.stockFreshness;
    if (sf.freshness === "STALE" || sf.freshness === "CRITICAL") {
      requiresVerify.push(`${sf.sourceId} count is ${sf.freshness} (${sf.ageHours.toFixed(0)}h old)`);
    }
  }

  // 2. Check confidence band straddling
  if (confidenceBand?.straddles) {
    const ageStr = inputs.stockFreshness ? `${inputs.stockFreshness.ageHours.toFixed(0)}h old` : "aging";
    requiresVerify.push(`Fuel count ${ageStr} (band straddles ${confidenceBand.lowState})`);
  }

  // 3. Check inbound leg dependency (slack <= 2 days with non-FRESH report)
  if (option.slackDays !== null && option.slackDays <= 2 && inputs.legFreshness) {
    const lf = inputs.legFreshness;
    if (lf.freshness !== "FRESH") {
      requiresVerify.push(
        `Inbound shipment ${lf.sourceId} has ${option.slackDays}d slack (${lf.freshness} ETA report)`,
      );
    }
  }

  // Deduplicate entries
  const uniqueRequiresVerify = Array.from(new Set(requiresVerify));
  const needsVerification = uniqueRequiresVerify.length > 0;

  const trace = `[R14] Option ${option.id}: ${
    needsVerification ? `requires verification [${uniqueRequiresVerify.join("; ")}]` : "no verification needed"
  }`;

  return {
    requiresVerify: uniqueRequiresVerify,
    needsVerification,
    trace,
  };
}

