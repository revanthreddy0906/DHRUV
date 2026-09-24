import type { Seed } from "@dhruv/shared";
import type { PhaseBoundaries } from "./requirement.js";

export interface FeederSlackResult {
  legId: string;
  eta: string;
  cutoff: string;
  slackDays: number;
  feasible: boolean;
  trace: string;
}

export interface SlipToleranceResult {
  availability: number;
  baseRequirement: number;
  reserve: number;
  marginE: number;
  hasDeficit: boolean;
  slipToleranceDays: number | null;
  reserveBreachDate: string | null;
  daysShortOfWindow: number | null;
  trace: string;
}

export interface ComputeSlipToleranceParams {
  availability: number;
  stock: number;
  reservePct: number;
  burnUplift?: number; // u, default 0
  now: string;
  phaseBoundaries: PhaseBoundaries;
  consumptionProfiles: Seed["consumption_profiles"];
  itemId: string;
  nextResupplyDate?: string; // default "2027-11-20T00:00:00.000Z"
  ratePost?: number;
}

function truncateToDate(iso: string): string {
  return iso.slice(0, 10) + "T00:00:00.000Z";
}

function daysBetween(a: string, b: string): number {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000));
}

/**
 * Concept 1: Feeder Slack.
 * Answers: "How much time is there between the inbound ETA and its required cutoff?"
 * Formula: slackDays = cutoffDate - etaDate
 * Boundary:
 * slackDays >= 0 -> feasible (ETA == cutoff is 0 days slack, feasible)
 * slackDays < 0  -> infeasible
 */
export function computeFeederSlack(
  legId: string,
  eta: string,
  cutoff: string,
): FeederSlackResult {
  const etaTrunc = truncateToDate(eta);
  const cutoffTrunc = truncateToDate(cutoff);
  const etaMs = new Date(etaTrunc).getTime();
  const cutoffMs = new Date(cutoffTrunc).getTime();
  const slackDays = Math.round((cutoffMs - etaMs) / 86400000);
  const feasible = slackDays >= 0;

  const trace = `[R16] Feeder ${legId}: ETA ${eta.slice(0, 10)} vs cutoff ${cutoff.slice(
    0,
    10,
  )} -> ${slackDays}d slack (${feasible ? "feasible" : "infeasible"})`;

  return {
    legId,
    eta,
    cutoff,
    slackDays,
    feasible,
    trace,
  };
}

/**
 * Concept 2: Station Resupply Slip Tolerance.
 * Answers: "How late can the next resupply ship be before the station touches its reserve?"
 * Spec §7 lines 262-269:
 * E = A - R_base * (1 + u) - reserve
 * if E >= 0: slipToleranceDays = floor( E / rate_post )
 * if E < 0:  reserveBreachDate = first date at which (A - cumulative burn from today) = reserve
 *            daysShortOfWindow = nextResupplyDate - reserveBreachDate
 */
export function computeSlipTolerance(params: ComputeSlipToleranceParams): SlipToleranceResult {
  const {
    availability,
    reservePct,
    burnUplift = 0,
    now,
    phaseBoundaries,
    consumptionProfiles,
    itemId,
    nextResupplyDate = "2027-11-20T00:00:00.000Z",
  } = params;

  const nowDate = truncateToDate(now);
  const itemProfiles = consumptionProfiles.filter((p) => p.item_id === itemId);

  // Compute base requirement R_base from now to next resupply date
  let baseRequirement = 0;
  for (const phase of Object.keys(phaseBoundaries)) {
    const profile = itemProfiles.find((p) => p.phase === phase);
    if (!profile) continue;
    const bounds = phaseBoundaries[phase]!;
    const from = nowDate > bounds.start ? nowDate : bounds.start;
    const days = daysBetween(from, bounds.end);
    baseRequirement += days * profile.rate_per_day;
  }

  const upliftMultiplier = 1 + burnUplift;
  const reserve = baseRequirement * upliftMultiplier * reservePct;
  const marginE = availability - baseRequirement * upliftMultiplier - reserve;

  // Post-window burn rate: default to MOBILISATION rate
  const mobProfile = itemProfiles.find((p) => p.phase === "MOBILISATION");
  const ratePost = (params.ratePost ?? mobProfile?.rate_per_day ?? 0.35) * upliftMultiplier;

  if (marginE >= 0) {
    const slipToleranceDays = Math.floor(marginE / ratePost);
    const trace = `[R16] Slip tolerance: A ${availability.toFixed(1)} - R_req ${(
      baseRequirement * upliftMultiplier +
      reserve
    ).toFixed(1)} = margin E +${marginE.toFixed(1)} kL -> slip tolerance ${slipToleranceDays} days (post rate ${ratePost.toFixed(2)} kL/d)`;

    return {
      availability,
      baseRequirement,
      reserve,
      marginE,
      hasDeficit: false,
      slipToleranceDays,
      reserveBreachDate: null,
      daysShortOfWindow: null,
      trace,
    };
  }

  // Deficit case (E < 0): find reserveBreachDate where (A - cumulative burn from today) = reserve
  const targetBurn = availability - reserve;
  let accumulatedBurn = 0;
  let reserveBreachDate: string | null = null;

  if (targetBurn <= 0) {
    // Reserve is already breached at `now`
    reserveBreachDate = nowDate;
  } else {
    // Walk phases chronologically to find the date where burn reaches targetBurn
    const sortedPhases = Object.keys(phaseBoundaries).sort((a, b) =>
      phaseBoundaries[a]!.start.localeCompare(phaseBoundaries[b]!.start),
    );

    for (const phase of sortedPhases) {
      const profile = itemProfiles.find((p) => p.phase === phase);
      if (!profile) continue;
      const bounds = phaseBoundaries[phase]!;
      const from = nowDate > bounds.start ? nowDate : bounds.start;
      const phaseDays = daysBetween(from, bounds.end);
      const phaseRate = profile.rate_per_day * upliftMultiplier;
      const phaseTotalBurn = phaseDays * phaseRate;

      if (accumulatedBurn + phaseTotalBurn >= targetBurn) {
        const remainingBurn = targetBurn - accumulatedBurn;
        const daysIntoPhase = remainingBurn / phaseRate;
        const breachMs = new Date(from).getTime() + Math.floor(daysIntoPhase) * 86400000;
        reserveBreachDate = new Date(breachMs).toISOString().slice(0, 10) + "T00:00:00.000Z";
        break;
      }
      accumulatedBurn += phaseTotalBurn;
    }

    if (!reserveBreachDate) {
      reserveBreachDate = truncateToDate(nextResupplyDate);
    }
  }

  const daysShortOfWindow = daysBetween(reserveBreachDate, truncateToDate(nextResupplyDate));
  const breachDateStr = reserveBreachDate.slice(0, 10);
  const nextResupplyStr = nextResupplyDate.slice(0, 10);

  const trace = `[R16] Reserve breach: margin E ${marginE.toFixed(1)} kL -> reserve breached on ${breachDateStr} (${daysShortOfWindow} days short of ${nextResupplyStr} window)`;

  return {
    availability,
    baseRequirement,
    reserve,
    marginE,
    hasDeficit: true,
    slipToleranceDays: null,
    reserveBreachDate,
    daysShortOfWindow,
    trace,
  };
}

