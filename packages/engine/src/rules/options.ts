import { config } from "@dhruv/shared";
import type { CataloguedLever } from "./levers.js";
import type { ConfidenceBand } from "./confidence.js";
import type { SlipToleranceResult } from "./slip.js";
import type { CargoFeasibilityConfidence } from "./cargo.js";

export interface GeneratedOption {
  id: string;
  leverIds: string[];
  levers: CataloguedLever[];
  availability: number;
  rawRequirement: number;
  requirement: number;
  ratio: number;
  state: "GREEN" | "AMBER" | "RED";
  gap: number;
  cost: number;
  costUnit: string;
  deadline: string;
  bindingLeverId: string;
  slackDays: number | null;
  reachesTarget: boolean;
  confidenceBand?: ConfidenceBand;
  requiresVerify?: string[];
  slipTolerance?: SlipToleranceResult;
  cargoConfidence?: CargoFeasibilityConfidence;
  trace: string;
}

export interface GenerateOptionsParams {
  levers: CataloguedLever[];
  baseStock: number;
  baseRawRequirement: number;
  reservePct: number;
  inboundFeasibleQty?: number;
  delayedLegEta?: string; // e.g. "2027-02-07T00:00:00.000Z" for C-104
  maxCombinationSize?: number; // default 3
}

function truncateToDate(iso: string): string {
  return iso.slice(0, 10) + "T00:00:00.000Z";
}

/**
 * Helper to generate k-combinations from an array.
 * Indices are strictly increasing to avoid duplicate combinations.
 */
function getCombinations<T>(arr: T[], k: number): T[][] {
  const result: T[][] = [];
  function backtrack(start: number, current: T[]) {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]!);
      backtrack(i + 1, current);
      current.pop();
    }
  }
  backtrack(0, []);
  return result;
}

/**
 * R09: Option Generation.
 * Generates all unique combinations of available levers (subsets of up to 3 levers)
 * and evaluates each deterministically against stock, requirement, and feasibility.
 */
export function generateOptions(params: GenerateOptionsParams): GeneratedOption[] {
  const {
    levers,
    baseStock,
    baseRawRequirement,
    reservePct,
    inboundFeasibleQty = 0,
    delayedLegEta = "2027-02-07T00:00:00.000Z",
    maxCombinationSize = 3,
  } = params;

  // Only consider levers that are currently available, sorted by ID for determinism
  const availableLevers = levers
    .filter((l) => l.available)
    .sort((a, b) => a.id.localeCompare(b.id));

  const combinations: CataloguedLever[][] = [];
  const maxSize = Math.min(maxCombinationSize, availableLevers.length);
  for (let k = 1; k <= maxSize; k++) {
    combinations.push(...getCombinations(availableLevers, k));
  }

  return combinations.map((combo) => {
    const leverIds = combo.map((l) => l.id).sort((a, b) => a.localeCompare(b));
    const id = `OPT-${leverIds.join("+")}`;

    let addedAvailability = 0;
    let savedRaw = 0;
    let cost = 0;
    let costUnit = "INR";
    let slackDays: number | null = null;

    for (const l of combo) {
      if (l.effect.addAvailableKl) {
        addedAvailability += l.effect.addAvailableKl;
      }
      if (l.effect.saveRawKl) {
        savedRaw += l.effect.saveRawKl;
      }
      if (l.costAmount) {
        cost += l.costAmount;
        if (l.costUnit) costUnit = l.costUnit;
      }
      // Check if this lever enables an inbound shipment (e.g. HOLD_VESSEL with newLoadCutoff)
      if (l.effect.newLoadCutoff) {
        const cutoffMs = new Date(truncateToDate(l.effect.newLoadCutoff)).getTime();
        const etaMs = new Date(truncateToDate(delayedLegEta)).getTime();
        slackDays = Math.max(0, (cutoffMs - etaMs) / 86400000);
      }
    }

    const availability = baseStock + inboundFeasibleQty + addedAvailability;
    const rawRequirement = Math.max(0, baseRawRequirement - savedRaw);
    const requirement = rawRequirement * (1 + reservePct);
    const ratio = requirement > 0 ? availability / requirement : Infinity;

    const state: "GREEN" | "AMBER" | "RED" =
      ratio >= config.thresholds.green
        ? "GREEN"
        : ratio >= config.thresholds.amber
        ? "AMBER"
        : "RED";

    const gap = Math.max(0, requirement - availability);

    // Option deadline is the minimum deadline among selected levers (Spec §7 line 257)
    let bindingLever = combo[0]!;
    for (const l of combo) {
      if (l.deadline < bindingLever.deadline) {
        bindingLever = l;
      }
    }
    const deadline = bindingLever.deadline;
    const bindingLeverId = bindingLever.id;
    const reachesTarget = state === "GREEN";

    const costInLakh = costUnit.includes("lakh") ? cost : cost / 100000;
    const costStr = cost > 0 ? `${costInLakh.toFixed(1)} lakh` : "none";
    const slackStr = slackDays !== null ? `${slackDays}d slack` : "no inbound dependency";
    const trace = `[R09] {${leverIds.join(", ")}}: avail ${availability.toFixed(1)} / req ${requirement.toFixed(
      1,
    )} = ${ratio.toFixed(4)} -> ${state} (deadline ${truncateToDate(deadline).slice(0, 10)}, cost ${costStr}, ${slackStr})`;

    return {
      id,
      leverIds,
      levers: combo,
      availability,
      rawRequirement,
      requirement,
      ratio,
      state,
      gap,
      cost,
      costUnit,
      deadline,
      bindingLeverId,
      slackDays,
      reachesTarget,
      trace,
    };
  });
}
