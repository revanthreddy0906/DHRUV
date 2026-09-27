// packages/engine — pure deterministic engine (Paridhi v2 §2.3, §7)
// No Date.now(), no Math.random(), no fetch, no runtime deps. Enforced by lint later.
import { config, withCreatedShipments, type OpEvent, type Seed } from "@dhruv/shared";
import { reduce } from "./reduce.js";
import { computeRequirement, type PhaseBoundaries } from "./rules/requirement.js";
import { checkFeasibility } from "./rules/feasibility.js";
import { computeAvailability, worstOf } from "./rules/availability.js";
import { evaluateBudgetCurve, type GammaEvaluationResult, type UncertainInput } from "./robustness/index.js";
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
import {
  computeFeederSlack,
  computeSlipTolerance,
  type FeederSlackResult,
  type SlipToleranceResult,
  type ComputeSlipToleranceParams,
} from "./rules/slip.js";
import {
  checkCargoFeasibilityConfidence,
  type CargoFeasibilityConfidence,
} from "./rules/cargo.js";
import {
  computeBaselineB0,
  type BaselineB0Result,
  type ComputeBaselineB0Params,
} from "./rules/baseline.js";
import {
  computePob,
  computeFoodRequirement,
  type FoodRequirementResult,
  type ComputeFoodRequirementParams,
} from "./rules/food.js";

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
export {
  computeFeederSlack,
  computeSlipTolerance,
  type FeederSlackResult,
  type SlipToleranceResult,
  type ComputeSlipToleranceParams,
} from "./rules/slip.js";
export {
  checkCargoFeasibilityConfidence,
  type CargoFeasibilityConfidence,
} from "./rules/cargo.js";
export {
  computeBaselineB0,
  type BaselineB0Result,
  type ComputeBaselineB0Params,
} from "./rules/baseline.js";
export {
  computePob,
  computeFoodRequirement,
  type FoodRequirementResult,
  type ComputeFoodRequirementParams,
} from "./rules/food.js";
export * from "./robustness/index.js";

/**
 * The pure engine (Build Bible section 7). No clock, no randomness: `now` is always passed in.
 * Every STATION node is evaluated on every dimension the seed has data for.
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
  slipTolerance?: SlipToleranceResult;
  cargoConfidence?: CargoFeasibilityConfidence;
  baselineB0?: BaselineB0Result;
  foodRequirement?: FoodRequirementResult;
  /** Per-item or per-role lines behind the dimension (medical items, roles, units). */
  items?: DimensionItem[];
  /** Oldest count behind the dimension (for "counted 36 h ago"). */
  observedAt?: string;
  trace: TraceStep[];
}

export interface DimensionItem {
  id: string;
  label: string;
  state: "GREEN" | "AMBER" | "RED";
  ratio: number | null;
  have: number;
  need: number;
  unit: string;
  /** Inventory lines only: on-hand stock, feasible inbound, reserve fraction and last count. */
  stock?: number;
  inbound?: number;
  reservePct?: number;
  observedAt?: string;
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
  missions?: MissionImpactResult[];
  /** Levers of approved decisions, already folded into the requirement and availability. */
  appliedLevers?: string[];
}

export interface Evaluation {
  at: string;
  stations: StationEval[];
}

type Light = "GREEN" | "AMBER" | "RED";
type State = ReturnType<typeof reduce>;

const PHASE_BOUNDARIES: PhaseBoundaries = Object.fromEntries(
  config.season.phases.map((p) => [p.phase, { start: p.start, end: p.end }]),
);

/**
 * R01 horizon anchor. Stock changes only through counts, issues and receipts, never through elapsed
 * time, so the requirement it is compared with must cover the same fixed horizon: from the start of
 * the season plan (24 Jan) to the next resupply. Counting from "today" instead would shrink the
 * requirement every day while the stock stays put, and overstate readiness (131.4 kL at 25 Jan
 * 16:00 instead of the Bible's 132.0). Slip tolerance projects over the same horizon.
 */
const PLAN_FROM = config.season.phases[0]!.start;

const lightOf = (ratio: number): Light =>
  ratio >= config.thresholds.green ? "GREEN" : ratio >= config.thresholds.amber ? "AMBER" : "RED";

interface Inbound {
  qty: number;
  trace: TraceStep[];
  /** The feeder leg of the first shipment carrying this item: R16/R17 and HOLD_VESSEL key off it. */
  feeder?: State["legs"] extends Map<string, infer L> ? L : never;
  vessel?: State["vessels"] extends Map<string, infer V> ? V : never;
}

/** R02: inbound cargo for an item counts only if its feeder leg reaches the vessel before load cut-off. */
function feasibleInbound(itemId: string, seed: Seed, state: State): Inbound {
  const out: Inbound = { qty: 0, trace: [] };
  for (const cargo of seed.cargo_items.filter((c) => c.inventory_item_id === itemId)) {
    const shipmentLegs = seed.legs.filter((l) => l.shipment_id === cargo.shipment_id).sort((a, b) => a.seq - b.seq);
    const vesselLeg = shipmentLegs.find((l) => l.vessel_id);
    const vessel = vesselLeg?.vessel_id ? state.vessels.get(vesselLeg.vessel_id) : undefined;
    const feederSeed = [...shipmentLegs].reverse().find((l) => !l.vessel_id && (!vesselLeg || l.seq < vesselLeg.seq));
    const feeder = feederSeed ? state.legs.get(feederSeed.id) : undefined;
    if (!feeder || !vessel) continue;
    const feas = checkFeasibility(feeder, vessel);
    out.trace.push({ rule: "R02", text: feas.trace });
    if (feas.feasible) out.qty += cargo.qty;
    if (!out.feeder) {
      out.feeder = feeder;
      out.vessel = vessel;
      out.trace.push({ rule: "R16", text: computeFeederSlack(feeder.legId, feeder.eta, vessel.loadCutoff).trace });
    }
  }
  return out;
}

/** When the leg's ETA was last reported (LEG_UPDATED / LEG_DELAYED), for R12. */
function legReportedAt(events: OpEvent[], legId: string): string | undefined {
  let latest: string | undefined;
  for (const ev of events) {
    if ((ev.type === "LEG_UPDATED" || ev.type === "LEG_DELAYED") && (ev.entity_id === legId || (ev.payload as { leg_id?: string })?.leg_id === legId)) {
      if (!latest || ev.observed_at > latest) latest = ev.observed_at;
    }
  }
  return latest;
}

/** Levers of approved decisions for this node. */
function appliedLeverIds(state: State, nodeId: string): string[] {
  const ids = new Set<string>();
  for (const d of state.decisions.values()) {
    if (d.status === "APPROVED" && (!d.nodeId || d.nodeId === nodeId)) for (const l of d.appliedLeverIds ?? []) ids.add(l);
  }
  return [...ids].sort();
}

function evaluateFuel(input: EngineInput, state: State, nodeId: string, now: string, applied: CataloguedLever[]) {
  const diesel = [...state.inventory.values()].find((i) => i.nodeId === nodeId && i.dimension === "FUEL");
  if (!diesel) return null;
  const dieselId = diesel.itemId;
  const burnUplift = diesel.burnUplift ?? 0;

  // Applied levers (R08 effects of approved options). HOLD_VESSEL acts through its follow-ups
  // (VESSEL_UPDATED), so only levers without a new load cut-off add stock here.
  const appliedSave = applied.reduce((s, l) => s + (l.effect.saveRawKl ?? 0), 0);
  const appliedAdd = applied.reduce((s, l) => s + (l.effect.newLoadCutoff ? 0 : (l.effect.addAvailableKl ?? 0)), 0);

  const req0 = computeRequirement(diesel, input.seed.consumption_profiles, PLAN_FROM, PHASE_BOUNDARIES);
  const rBase = Math.max(0, req0.rBase - appliedSave);
  const r = rBase * (1 + burnUplift) * (1 + diesel.reservePct);
  const reqTrace = appliedSave > 0
    ? `${req0.trace}; approved levers save ${appliedSave.toFixed(1)} -> R = ${r.toFixed(2)}`
    : req0.trace;

  const inbound = feasibleInbound(dieselId, input.seed, state);
  const leg = inbound.feeder;
  const vessel = inbound.vessel;
  const feasibleQty = inbound.qty + appliedAdd;

  const avail = computeAvailability(dieselId, diesel.stock, feasibleQty, r);
  const fuelFreshness = classifyFreshness(dieselId, "stock", diesel.lastObservedAt, now);

  let legFreshness: FreshnessResult | undefined;
  let cargoConfidence: CargoFeasibilityConfidence | undefined;
  if (leg) {
    legFreshness = classifyFreshness(leg.legId, "cargoEta", legReportedAt(input.events, leg.legId) ?? leg.eta, now);
    if (vessel) cargoConfidence = checkCargoFeasibilityConfidence(leg.legId, leg.eta, vessel.loadCutoff, legFreshness);
  }

  const closingProfile = input.seed.consumption_profiles.find((cp) => cp.item_id === dieselId && cp.phase === "CLOSING");
  const rateNow = (diesel.rateOverrides?.CLOSING ?? closingProfile?.rate_per_day ?? 0) * (1 + burnUplift);

  const fuelConfidence = computeConfidenceBand({
    stock: diesel.stock,
    inbound: feasibleQty,
    inboundUncertain: cargoConfidence?.uncertain ?? false,
    requirement: r,
    rateNow,
    ageHours: fuelFreshness.ageHours,
    freshness: fuelFreshness.freshness,
  });

  const slipTol = computeSlipTolerance({
    availability: avail.availability,
    stock: diesel.stock,
    reservePct: diesel.reservePct,
    burnUplift,
    now: PLAN_FROM,
    phaseBoundaries: PHASE_BOUNDARIES,
    consumptionProfiles: input.seed.consumption_profiles,
    itemId: dieselId,
  });

  const trace: TraceStep[] = [
    { rule: "R01", text: reqTrace },
    ...inbound.trace,
    { rule: "R03", text: avail.trace },
    { rule: "R12", text: fuelFreshness.trace },
  ];
  if (legFreshness) trace.push({ rule: "R12", text: legFreshness.trace });
  trace.push({ rule: "R13", text: fuelConfidence.trace });
  trace.push({ rule: "R16", text: slipTol.trace });
  if (cargoConfidence) trace.push({ rule: "R17", text: cargoConfidence.trace });

  const baselineB0 = computeBaselineB0({ stock: diesel.stock, rate: rateNow, unit: diesel.unit });
  trace.push({ rule: "R18", text: baselineB0.trace });

  let levers: CataloguedLever[] | undefined;
  let options: RankedOption[] | undefined;
  let pnr: PnrResult | null | undefined;
  const appliedIds = new Set(applied.map((l) => l.id));

  if (input.seed.levers.length > 0) {
    levers = catalogueLevers(input.seed.levers, now, nodeId);
    if (avail.state !== "GREEN") {
      for (const l of levers) trace.push({ rule: "R08", text: l.trace });
      // A lever already applied by an approved decision is not offered again.
      const offered = levers.filter((l) => !appliedIds.has(l.id));
      const allOptions = generateOptions({
        levers: offered,
        baseStock: diesel.stock,
        baseRawRequirement: rBase,
        reservePct: diesel.reservePct,
        burnUplift,
        inboundFeasibleQty: feasibleQty,
        delayedLegEta: leg?.eta,
      });
      const ranked = rankOptions(allOptions);

      for (const opt of ranked) {
        const optInbound = Math.max(0, opt.availability - diesel.stock);
        let optCargoConfidence = cargoConfidence;
        const holdVesselLever = opt.levers.find((l) => l.effect.newLoadCutoff);
        if (holdVesselLever && leg && legFreshness) {
          optCargoConfidence = checkCargoFeasibilityConfidence(leg.legId, leg.eta, holdVesselLever.effect.newLoadCutoff!, legFreshness);
        }
        opt.cargoConfidence = optCargoConfidence;

        const optBand = computeConfidenceBand({
          stock: diesel.stock,
          inbound: optInbound,
          inboundUncertain: optCargoConfidence?.uncertain ?? false,
          requirement: opt.requirement,
          rateNow,
          ageHours: fuelFreshness.ageHours,
          freshness: fuelFreshness.freshness,
        });
        opt.confidenceBand = optBand;

        const optUplift = opt.levers.reduce((s, l) => s + (l.effect.burnRateUplift ?? 0), burnUplift);
        const optSlip = computeSlipTolerance({
          availability: opt.availability,
          stock: diesel.stock,
          reservePct: diesel.reservePct,
          burnUplift: optUplift,
          now: PLAN_FROM,
          phaseBoundaries: PHASE_BOUNDARIES,
          consumptionProfiles: input.seed.consumption_profiles,
          itemId: dieselId,
        });
        opt.slipTolerance = optSlip;

        const ver = evaluateOptionVerification(opt, { stockFreshness: fuelFreshness, legFreshness, cargoConfidence: optCargoConfidence }, optBand);
        opt.requiresVerify = ver.requiresVerify.length > 0 ? ver.requiresVerify : undefined;

        trace.push({ rule: "R09", text: opt.trace });
        trace.push({ rule: "R10", text: opt.rankingTrace });
        trace.push({ rule: "R13", text: `[R13] Option ${opt.id}: ${optBand.trace}` });
        trace.push({ rule: "R16", text: `[R16] Option ${opt.id}: ${optSlip.trace}` });
        if (optCargoConfidence) trace.push({ rule: "R17", text: `[R17] Option ${opt.id}: ${optCargoConfidence.trace}` });
        if (ver.needsVerification) trace.push({ rule: "R14", text: ver.trace });
      }
      options = ranked;
      pnr = computePnr(allOptions, now);
      trace.push({ rule: "R11", text: pnr.trace });
    }
  }

  const dimension: DimensionEval = {
    key: "FUEL",
    state: avail.state,
    ratio: avail.ratio,
    freshness: fuelFreshness.freshness,
    confidence: fuelConfidence,
    slipTolerance: slipTol,
    cargoConfidence,
    baselineB0,
    items: [{ id: dieselId, label: "Diesel", state: avail.state, ratio: avail.ratio, have: avail.availability, need: r, unit: diesel.unit, stock: diesel.stock, inbound: feasibleQty, reservePct: diesel.reservePct, observedAt: diesel.lastObservedAt }],
    observedAt: diesel.lastObservedAt,
    trace,
  };
  return { dimension, dieselId, levers, options, pnr };
}

/** FIXED-requirement items (medical, genset kits): R = fixed x (1 + reserve), A = stock + feasible inbound. */
function fixedItems(input: EngineInput, state: State, nodeId: string, dimension: string, now: string) {
  const items: DimensionItem[] = [];
  const trace: TraceStep[] = [];
  let oldest: string | undefined;
  for (const item of [...state.inventory.values()].filter((i) => i.nodeId === nodeId && i.dimension === dimension)) {
    const seedItem = input.seed.inventory_items.find((s) => s.id === item.itemId);
    const fixed = seedItem?.fixed_requirement ?? 0;
    const r = fixed * (1 + item.reservePct);
    const inbound = feasibleInbound(item.itemId, input.seed, state);
    const avail = computeAvailability(item.itemId, item.stock, inbound.qty, r);
    trace.push({ rule: "R01", text: `[R01] ${item.itemId} fixed requirement ${fixed} ${item.unit}; with ${(item.reservePct * 100).toFixed(0)}% reserve = ${r.toFixed(2)}` });
    trace.push(...inbound.trace.filter((t) => t.rule === "R02"));
    trace.push({ rule: "R03", text: avail.trace });
    items.push({ id: item.itemId, label: seedItem?.name ?? item.itemId, state: avail.state, ratio: avail.ratio, have: avail.availability, need: r, unit: item.unit, stock: item.stock, inbound: inbound.qty, reservePct: item.reservePct, observedAt: item.lastObservedAt });
    if (!oldest || item.lastObservedAt < oldest) oldest = item.lastObservedAt;
  }
  const freshness = oldest ? classifyFreshness(`${nodeId}-${dimension}`, "stock", oldest, now) : undefined;
  return { items, trace, freshness, oldest };
}

/** Dimension of a list of lines: worst state, lowest ratio. */
function rollUp(key: string, items: DimensionItem[], trace: TraceStep[], freshness?: FreshnessResult, observedAt?: string): DimensionEval {
  const ratios = items.map((i) => i.ratio).filter((r): r is number => r !== null);
  return {
    key,
    state: worstOf(items.map((i) => i.state)),
    ratio: ratios.length > 0 ? Math.min(...ratios) : null,
    freshness: freshness?.freshness,
    items,
    observedAt,
    trace,
  };
}

const coverageItem = (c: CoverageResult, unit: string): DimensionItem => ({
  id: c.key, label: c.key, state: c.state, ratio: c.need > 0 ? c.count / c.need : null, have: c.count, need: c.need, unit,
});

function evaluateStation(input: EngineInput, state: State, nodeId: string, now: string): StationEval | null {
  const appliedIds = appliedLeverIds(state, nodeId);
  const applied = catalogueLevers(input.seed.levers, now, nodeId).filter((l) => appliedIds.includes(l.id));

  const dimensions: DimensionEval[] = [];
  const fuel = evaluateFuel(input, state, nodeId, now, applied);
  if (fuel) dimensions.push(fuel.dimension);

  // R19: FOOD from live POB.
  const foodItem = [...state.inventory.values()].find((i) => i.nodeId === nodeId && i.dimension === "FOOD");
  if (foodItem) {
    const foodReq = computeFoodRequirement({ foodItem, personnel: state.personnel.values(), nodeId, burnUplift: foodItem.burnUplift ?? 0, now });
    const foodFreshness = classifyFreshness(foodItem.itemId, "stock", foodItem.lastObservedAt, now);
    dimensions.push({
      key: "FOOD",
      state: foodReq.state,
      ratio: foodReq.ratio,
      freshness: foodFreshness.freshness,
      foodRequirement: foodReq,
      items: [{ id: foodItem.itemId, label: "Food", state: foodReq.state, ratio: foodReq.ratio, have: foodReq.availability, need: foodReq.r, unit: foodItem.unit, stock: foodItem.stock, inbound: 0, reservePct: foodItem.reservePct, observedAt: foodItem.lastObservedAt }],
      observedAt: foodItem.lastObservedAt,
      trace: [{ rule: "R19", text: foodReq.trace }],
    });
  }

  // Medical: winter medical kits, oxygen cylinders (FIXED).
  const medical = fixedItems(input, state, nodeId, "MEDICAL", now);
  if (medical.items.length > 0) dimensions.push(rollUp("MEDICAL", medical.items, medical.trace, medical.freshness, medical.oldest));

  // Spares and power: genset kits (FIXED) and R06 generator redundancy.
  const stationAssets = [...state.assets.values()].filter((a) => a.nodeId === nodeId);
  const spares = fixedItems(input, state, nodeId, "SPARES_POWER", now);
  const gens = computeAssetRedundancy(stationAssets, "GENERATOR", config.season.generatorsNeeded, "generators");
  const hasGens = stationAssets.some((a) => a.type.toUpperCase() === "GENERATOR");
  if (spares.items.length > 0 || hasGens) {
    const items = [...spares.items, ...(hasGens ? [coverageItem(gens, "running")] : [])];
    const trace = [...spares.trace, ...(hasGens ? [{ rule: "R06", text: gens.trace }] : [])];
    const dim = rollUp("POWER", items, trace, spares.freshness, spares.oldest);
    // The dimension ratio is the kits' ratio; generator redundancy is a count, not a ratio.
    dim.ratio = spares.items.length > 0 ? Math.min(...spares.items.map((i) => i.ratio ?? Infinity)) : null;
    dimensions.push(dim);
  }

  // R05: personnel role coverage.
  const people = [...state.personnel.values()].filter((p) => p.nodeId === nodeId);
  if (people.length > 0) {
    const roles = Object.entries(config.season.roleNeed).map(([role, need]) => computePersonnelCoverage(people, role, need));
    dimensions.push({
      key: "PERSONNEL",
      state: worstOf(roles.map((r) => r.state)),
      ratio: null,
      items: roles.map((r) => coverageItem(r, "people")),
      trace: roles.map((r) => ({ rule: "R05", text: r.trace })),
    });
  }

  // Comms: VSAT and Iridium units, R06 pattern.
  const commsAssets = stationAssets.filter((a) => /^(VSAT|IRIDIUM)$/i.test(a.type));
  if (commsAssets.length > 0) {
    const units = commsAssets.map((a) => ({ ...a, type: "COMMS" }));
    const comms = computeAssetRedundancy(units, "COMMS", config.season.commsNeeded, "comms units");
    dimensions.push({ key: "COMMS", state: comms.state, ratio: null, items: [coverageItem(comms, "OK")], trace: [{ rule: "R06", text: comms.trace }] });
  }

  if (dimensions.length === 0) return null;

  // R07: mission impact for every mission at the station.
  const fuelState = fuel?.dimension.state ?? null;
  const missions: MissionImpactResult[] = [];
  for (const m of state.missions.values()) {
    if (m.nodeId !== nodeId) continue;
    const seedMission = input.seed.missions.find((s) => s.id === m.missionId);
    let parsed: { people?: string[]; assets?: string[] } = {};
    try { parsed = JSON.parse(seedMission?.needs ?? "{}"); } catch { parsed = {}; }
    const drawsFrom = input.seed.dependencies.find((d) => d.from_type === "mission" && d.from_id === m.missionId && d.kind === "DRAWS_FROM")?.to_id;
    const needs: MissionNeeds = {
      fuelItemId: drawsFrom ?? ((seedMission?.fuel_kl ?? 0) > 0 ? fuel?.dieselId ?? null : null),
      fuelKl: seedMission?.fuel_kl,
      personIds: parsed.people ?? [],
      assetIds: parsed.assets ?? [],
    };
    missions.push(computeMissionImpact(m, needs, fuelState, state.personnel, state.assets));
  }

  // R15: station state and gates.
  const stationStateRes = computeStationState(dimensions, input.events, missions, nodeId);
  const fuelTrace = fuel?.dimension.trace ?? dimensions[0]!.trace;
  for (const m of missions) fuelTrace.push({ rule: "R07", text: m.trace });
  for (const t of stationStateRes.trace) fuelTrace.push({ rule: "R15", text: t });

  return {
    nodeId,
    state: stationStateRes.state,
    dimensions,
    levers: fuel?.levers,
    options: fuel?.options,
    pnr: fuel?.pnr,
    gates: stationStateRes.gates.length > 0 ? stationStateRes.gates : undefined,
    blocked: stationStateRes.blocked ? true : undefined,
    missions: missions.length > 0 ? missions : undefined,
    appliedLevers: appliedIds.length > 0 ? appliedIds : undefined,
  };
}

export function evaluate(raw: EngineInput, now: string): Evaluation {
  // Shipments created by events count as inbound exactly like the seed's (feasibleInbound).
  const input: EngineInput = { ...raw, seed: withCreatedShipments(raw.seed, raw.events) };
  const state = reduce(input.seed, input.events);
  const stations: StationEval[] = [];
  for (const node of input.seed.nodes.filter((n) => n.type === "STATION")) {
    const s = evaluateStation(input, state, node.id, now);
    if (s) stations.push(s);
  }
  return { at: now, stations };
}

/**
 * The three adverse deviations the fuel robustness panel starts from (robustness/README.md):
 * a cold snap raising burn 15 %, a tank reading 10 % high, and the feeder arriving 3 days later.
 */
export const DEFAULT_FUEL_UNCERTAINTIES: readonly UncertainInput[] = [
  { name: "cold_snap_burn_rate", target: "burnRate", nominal: 0, deviation: 15, unit: "percent", adverseDirection: "increase" },
  { name: "tank_measurement_error", target: "stockCount", nominal: 0, deviation: 10, unit: "percent", adverseDirection: "decrease" },
  { name: "feeder_weather_delay", target: "shipmentSlack", nominal: 0, deviation: 3, unit: "absolute", adverseDirection: "decrease" },
];

export interface FuelRobustness {
  nodeId: string;
  itemId: string;
  unit: string;
  stock: number;
  /** Feasible inbound the analysis starts from (all of it rides `feeder`, see below). */
  inboundQty: number;
  /** The feasible feeder with the least slack to its vessel's load cut-off, if any. */
  feeder?: { legId: string; shipmentId: string; eta: string; loadCutoff: string; slackDays: number };
  /** The deviations actually applied: a shipment delay is dropped when no inbound can slip. */
  uncertainties: UncertainInput[];
  /** Γ = 0 .. n, from the robustness layer on R01-R03. */
  curve: GammaEvaluationResult[];
  /** The fuel ratio evaluate() reports for this station now. Γ = 0 equals it unless approved levers apply. */
  engineRatio: number;
  /** Approved levers change the live ratio but are not modelled by the robustness layer. */
  leversApplied: boolean;
}

/**
 * Γ-budget robustness (packages/engine/src/robustness) on a station's live fuel state: the same
 * reduce(), requirement horizon (PLAN_FROM) and R02 feasibility as evaluate(), so Γ = 0 is the
 * dashboard's fuel ratio. Every feasible inbound line is treated as riding the tightest feeder, so
 * one feeder delay can take all of it out: the conservative reading a worst case wants.
 */
export function fuelRobustness(
  raw: EngineInput,
  nodeId: string,
  now: string,
  uncertainties: readonly UncertainInput[] = DEFAULT_FUEL_UNCERTAINTIES,
): FuelRobustness | null {
  const input: EngineInput = { ...raw, seed: withCreatedShipments(raw.seed, raw.events) };
  const state = reduce(input.seed, input.events);
  const diesel = [...state.inventory.values()].find((i) => i.nodeId === nodeId && i.dimension === "FUEL");
  if (!diesel) return null;
  const fuel = evaluate(input, now).stations.find((s) => s.nodeId === nodeId)?.dimensions.find((d) => d.key === "FUEL");

  // Feasible inbound lines, each with its feeder and vessel (the R02 walk of feasibleInbound()).
  let inboundQty = 0;
  let tightest: { leg: NonNullable<Inbound["feeder"]>; vessel: NonNullable<Inbound["vessel"]>; slack: number } | undefined;
  for (const cargo of input.seed.cargo_items.filter((c) => c.inventory_item_id === diesel.itemId)) {
    const legs = input.seed.legs.filter((l) => l.shipment_id === cargo.shipment_id).sort((a, b) => a.seq - b.seq);
    const vesselLeg = legs.find((l) => l.vessel_id);
    const vessel = vesselLeg?.vessel_id ? state.vessels.get(vesselLeg.vessel_id) : undefined;
    const feederSeed = [...legs].reverse().find((l) => !l.vessel_id && (!vesselLeg || l.seq < vesselLeg.seq));
    const leg = feederSeed ? state.legs.get(feederSeed.id) : undefined;
    if (!leg || !vessel || !checkFeasibility(leg, vessel).feasible) continue;
    inboundQty += cargo.qty;
    const slack = (Date.parse(vessel.loadCutoff) - Date.parse(leg.eta)) / 86_400_000;
    if (!tightest || slack < tightest.slack) tightest = { leg, vessel, slack };
  }

  const applied = uncertainties.filter((u) => u.target !== "shipmentSlack" || tightest);
  const curve = evaluateBudgetCurve(
    {
      item: diesel,
      consumptionProfiles: input.seed.consumption_profiles,
      now: PLAN_FROM,
      phaseBoundaries: PHASE_BOUNDARIES,
      inboundLeg: tightest?.leg,
      vessel: tightest?.vessel,
      inboundCargoQty: inboundQty,
    },
    applied,
  );
  return {
    nodeId,
    itemId: diesel.itemId,
    unit: diesel.unit,
    stock: diesel.stock,
    inboundQty,
    feeder: tightest && { legId: tightest.leg.legId, shipmentId: tightest.leg.shipmentId, eta: tightest.leg.eta, loadCutoff: tightest.vessel.loadCutoff, slackDays: Math.round(tightest.slack * 10) / 10 },
    uncertainties: applied,
    curve,
    engineRatio: fuel?.ratio ?? curve[0]!.ratio,
    leversApplied: appliedLeverIds(state, nodeId).length > 0,
  };
}
export { knowledgeGraph, impactOf, type KnowledgeGraph, type GraphNode, type GraphEdge, type GraphNodeType, type EdgeSource } from "./graph.js";
export { legMilestones, type Milestone, type MilestoneState, type ShipmentMilestones } from "./milestones.js";
