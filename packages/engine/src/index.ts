// packages/engine — pure deterministic engine (Paridhi v2 §2.3, §7)
// No Date.now(), no Math.random(), no fetch, no runtime deps. Enforced by lint later.
import type { OpEvent, Seed } from "@dhruv/shared";
import { reduce } from "./reduce.js";
import { computeRequirement } from "./rules/requirement.js";
import { checkFeasibility } from "./rules/feasibility.js";
import { computeAvailability, worstOf } from "./rules/availability.js";
import { computePersonnelCoverage, computeAssetRedundancy, type CoverageResult } from "./rules/coverage.js";
import { computeMissionImpact, type MissionImpactResult, type MissionNeeds } from "./rules/mission.js";
import { catalogueLevers, type CataloguedLever, type LeverEffect } from "./rules/levers.js";
import { generateOptions, type GeneratedOption, type GenerateOptionsParams } from "./rules/options.js";
import { rankOptions, type RankedOption } from "./rules/ranking.js";
import { computePnr, type PnrResult } from "./rules/pnr.js";
import {
  classifyFreshness,
  worstFreshness,
  type FreshnessClass,
  type FreshnessResult,
  type FreshnessTierKey,
} from "./rules/freshness.js";
import {
  computeConfidenceBand,
  type ConfidenceBand,
  type ComputeConfidenceParams,
} from "./rules/confidence.js";
import {
  evaluateOptionVerification,
  type VerificationInputs,
  type VerifyResult,
} from "./rules/verify.js";
import {
  computeStationState,
  type GateBanner,
  type StationStateResult,
} from "./rules/station.js";

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
export { computePersonnelCoverage, computeAssetRedundancy, type CoverageResult } from "./rules/coverage.js";
export { computeMissionImpact, type MissionImpactResult, type MissionNeeds } from "./rules/mission.js";
export { catalogueLevers, type CataloguedLever, type LeverEffect } from "./rules/levers.js";
export { generateOptions, type GeneratedOption, type GenerateOptionsParams } from "./rules/options.js";
export { rankOptions, type RankedOption } from "./rules/ranking.js";
export { computePnr, type PnrResult } from "./rules/pnr.js";
export {
  classifyFreshness,
  worstFreshness,
  type FreshnessClass,
  type FreshnessResult,
  type FreshnessTierKey,
} from "./rules/freshness.js";
export {
  computeConfidenceBand,
  type ConfidenceBand,
  type ComputeConfidenceParams,
} from "./rules/confidence.js";
export {
  evaluateOptionVerification,
  type VerificationInputs,
  type VerifyResult,
} from "./rules/verify.js";
export {
  computeStationState,
  type GateBanner,
  type StationStateResult,
} from "./rules/station.js";

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
  freshness?: FreshnessClass;
  confidence?: ConfidenceBand;
  trace: TraceStep[];
}

export interface StationEval {
  nodeId: string;
  state: "GREEN" | "AMBER" | "RED";
  dimensions: DimensionEval[];
  levers?: CataloguedLever[];
  options?: RankedOption[];
  pnr?: PnrResult | null;
  gates?: GateBanner[];
  blocked?: boolean;
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

    // R12: Freshness classification for stock
    const fuelFreshness = classifyFreshness(dieselId, "stock", diesel.lastObservedAt, now);

    // R12: Freshness classification for cargo ETA
    let legFreshness: FreshnessResult | undefined;
    if (leg) {
      legFreshness = classifyFreshness(leg.legId, "cargoEta", leg.eta, now);
    }

    // Rate for R13 confidence band
    const closingProfile = input.seed.consumption_profiles.find(
      (cp) => cp.item_id === dieselId && cp.phase === "CLOSING",
    );
    const rateNow = closingProfile?.rate_per_day ?? 0.55;

    // R13: Confidence band for Fuel dimension
    const fuelConfidence = computeConfidenceBand({
      stock: diesel.stock,
      inbound: feasibleQty,
      requirement: req.r,
      rateNow,
      ageHours: fuelFreshness.ageHours,
      freshness: fuelFreshness.freshness,
    });

    const dimensionTrace: TraceStep[] = [
      { rule: "R01", text: req.trace },
      ...legTrace,
      { rule: "R03", text: avail.trace },
      { rule: "R12", text: fuelFreshness.trace },
    ];
    if (legFreshness) {
      dimensionTrace.push({ rule: "R12", text: legFreshness.trace });
    }
    dimensionTrace.push({ rule: "R13", text: fuelConfidence.trace });

    let leversResult: CataloguedLever[] | undefined;
    let optionsResult: RankedOption[] | undefined;
    let pnrResult: PnrResult | null | undefined;

    if (input.seed.levers && input.seed.levers.length > 0) {
      const stationLevers = catalogueLevers(input.seed.levers, now, diesel.nodeId);
      leversResult = stationLevers;

      if (avail.state !== "GREEN") {
        for (const l of stationLevers) {
          dimensionTrace.push({ rule: "R08", text: l.trace });
        }

        const delayedLegEta = leg?.eta;
        const allOptions = generateOptions({
          levers: stationLevers,
          baseStock: diesel.stock,
          baseRawRequirement: req.rBase,
          reservePct: diesel.reservePct,
          inboundFeasibleQty: feasibleQty,
          delayedLegEta,
        });

        const ranked = rankOptions(allOptions);

        // Apply R13 (confidence band) and R14 (verify-first) to options
        for (const opt of ranked) {
          const optInbound = Math.max(0, opt.availability - diesel.stock);
          const optBand = computeConfidenceBand({
            stock: diesel.stock,
            inbound: optInbound,
            requirement: opt.requirement,
            rateNow,
            ageHours: fuelFreshness.ageHours,
            freshness: fuelFreshness.freshness,
          });
          opt.confidenceBand = optBand;

          const ver = evaluateOptionVerification(
            opt,
            { stockFreshness: fuelFreshness, legFreshness },
            optBand,
          );
          opt.requiresVerify = ver.requiresVerify.length > 0 ? ver.requiresVerify : undefined;

          dimensionTrace.push({ rule: "R09", text: opt.trace });
          dimensionTrace.push({ rule: "R10", text: opt.rankingTrace });
          dimensionTrace.push({ rule: "R13", text: `[R13] Option ${opt.id}: ${optBand.trace}` });
          if (ver.needsVerification) {
            dimensionTrace.push({ rule: "R14", text: ver.trace });
          }
        }

        optionsResult = ranked;

        const pnr = computePnr(allOptions, now);
        pnrResult = pnr;
        dimensionTrace.push({ rule: "R11", text: pnr.trace });
      }
    }

    const fuelDimension: DimensionEval = {
      key: "FUEL",
      state: avail.state,
      ratio: avail.ratio,
      freshness: fuelFreshness.freshness,
      confidence: fuelConfidence,
      trace: dimensionTrace,
    };

    const dimensions: DimensionEval[] = [fuelDimension];

    // R05: PERSONNEL dimension (if personnel are seeded for this station)
    if (input.seed.personnel && input.seed.personnel.length > 0) {
      const stationPersonnel = Array.from(state.personnel.values()).filter(
        (p) => p.nodeId === diesel.nodeId,
      );
      if (stationPersonnel.length > 0) {
        const docCov = computePersonnelCoverage(stationPersonnel, "DOCTOR", 1);
        const mechCov = computePersonnelCoverage(stationPersonnel, "DIESEL_MECHANIC", 1);
        const commsCov = computePersonnelCoverage(stationPersonnel, "COMMS_ENGINEER", 1);
        const cookCov = computePersonnelCoverage(stationPersonnel, "COOK", 1);
        const roles = [docCov, mechCov, commsCov, cookCov];
        const personnelState = worstOf(roles.map((r) => r.state));
        const personnelTrace: TraceStep[] = roles.map((r) => ({ rule: "R05", text: r.trace }));
        dimensions.push({
          key: "PERSONNEL",
          state: personnelState,
          ratio: null,
          trace: personnelTrace,
        });
      }
    }

    // R06: POWER dimension (if assets are seeded for this station)
    if (input.seed.assets && input.seed.assets.length > 0) {
      const stationAssets = Array.from(state.assets.values()).filter(
        (a) => a.nodeId === diesel.nodeId,
      );
      if (stationAssets.length > 0) {
        const genRed = computeAssetRedundancy(stationAssets, "GENERATOR", 2, "generators");
        dimensions.push({
          key: "POWER",
          state: genRed.state,
          ratio: null,
          trace: [{ rule: "R06", text: genRed.trace }],
        });
      }
    }

    // R07: Missions impact
    const missionImpacts: MissionImpactResult[] = [];
    if (input.seed.missions && input.seed.missions.length > 0) {
      for (const m of state.missions.values()) {
        if (m.nodeId === diesel.nodeId && m.missionId === "F-27") {
          const needs: MissionNeeds = {
            fuelItemId: dieselId,
            personIds: ["P-VERMA", "P-NAIR"],
            assetIds: ["SK-4"],
          };
          const impact = computeMissionImpact(m, needs, avail.state, state.personnel, state.assets);
          missionImpacts.push(impact);
        }
      }
    }

    // R15: Station State and Gates
    const stationStateRes = computeStationState(
      dimensions,
      input.events,
      missionImpacts,
      diesel.nodeId,
    );
    for (const t of stationStateRes.trace) {
      dimensionTrace.push({ rule: "R15", text: t });
    }

    stations.push({
      nodeId: diesel.nodeId,
      state: stationStateRes.state,
      dimensions,
      levers: leversResult,
      options: optionsResult,
      pnr: pnrResult,
      gates: stationStateRes.gates.length > 0 ? stationStateRes.gates : undefined,
      blocked: stationStateRes.blocked ? true : undefined,
    });
  }

  return { at: now, stations };
}
