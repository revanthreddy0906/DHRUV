import { config } from "@dhruv/shared";
import type { FreshnessClass } from "./freshness.js";

export interface ConfidenceBand {
  low: number;
  high: number;
  point: number;
  pointState: "GREEN" | "AMBER" | "RED";
  lowState: "GREEN" | "AMBER" | "RED";
  highState: "GREEN" | "AMBER" | "RED";
  straddles: boolean;
  text: string;
  level: "HIGH" | "MEDIUM" | "LOW";
  burnDepletion: number;
  uncertainty: number;
  freshness: FreshnessClass;
  inboundUncertain?: boolean;
  trace: string;
}

export interface ComputeConfidenceParams {
  stock: number;
  inbound?: number;
  inboundUncertain?: boolean;
  requirement: number;
  rateNow: number;
  ageHours: number;
  freshness: FreshnessClass;
  uncertainty?: number;
}

const UNCERTAINTY_MAP: Record<FreshnessClass, number> = {
  FRESH: config.freshness.bandUncertaintyByTier[0],
  AGING: config.freshness.bandUncertaintyByTier[1],
  STALE: config.freshness.bandUncertaintyByTier[2],
  CRITICAL: config.freshness.bandUncertaintyByTier[3],
};

const STATE_SEVERITY: Record<"GREEN" | "AMBER" | "RED", number> = {
  GREEN: 0,
  AMBER: 1,
  RED: 2,
};

function stateFromRatio(ratio: number): "GREEN" | "AMBER" | "RED" {
  if (ratio >= config.thresholds.green) return "GREEN";
  if (ratio >= config.thresholds.amber) return "AMBER";
  return "RED";
}

/**
 * R13: Asymmetric Confidence Band.
 * Spec §8 lines 352-359:
 * b = expected burn since the count = rate_now × age_days
 * low  = ( stock × (1 − u_f) − b + inbound ) / R
 * high = ( stock × (1 + u_f) + inbound ) / R
 * Straddle flag fires when `low` falls into a worse state than the point estimate.
 */
export function computeConfidenceBand(params: ComputeConfidenceParams): ConfidenceBand {
  const {
    stock,
    inbound = 0,
    inboundUncertain = false,
    requirement,
    rateNow,
    ageHours,
    freshness,
    uncertainty = UNCERTAINTY_MAP[freshness],
  } = params;

  const ageDays = ageHours === Infinity ? 0 : ageHours / 24;
  const burnDepletion = rateNow * ageDays;

  const pointNumerator = stock + inbound;
  const point = requirement > 0 ? pointNumerator / requirement : Infinity;

  // R17: If inbound is UNCERTAIN, band's low side is computed without it (evaluating to on-hand stock ratio = stock / requirement)
  // Spec §7 line 330 & line 607 (T-ENG-18): point 1.0606, low 0.6970, high 1.0815 -> "GREEN, could be RED"
  const lowNumerator = inboundUncertain
    ? stock
    : stock * (1 - uncertainty) - burnDepletion + inbound;
  const low = requirement > 0 ? lowNumerator / requirement : Infinity;

  const highNumerator = stock * (1 + uncertainty) + inbound;
  const high = requirement > 0 ? highNumerator / requirement : Infinity;

  const pointState = stateFromRatio(point);
  const lowState = stateFromRatio(low);
  const highState = stateFromRatio(high);

  // Straddle flag fires when low falls into a worse state than point estimate (Spec §8 line 358)
  const straddles = STATE_SEVERITY[lowState] > STATE_SEVERITY[pointState];

  let text: string;
  if (straddles) {
    text = `${pointState}, could be ${lowState}`;
  } else {
    text = `clean ${pointState}`;
  }

  let level: "HIGH" | "MEDIUM" | "LOW";
  if (freshness === "FRESH" && !straddles) {
    level = "HIGH";
  } else if (freshness === "AGING" || (straddles && lowState === "AMBER")) {
    level = "MEDIUM";
  } else {
    level = "LOW";
  }

  const trace = `[R13] Confidence band: [${low.toFixed(4)}, ${high.toFixed(4)}] (u=${(
    uncertainty * 100
  ).toFixed(0)}%, b=${burnDepletion.toFixed(3)} kL, age ${ageHours.toFixed(
    1,
  )}h${inboundUncertain ? ", inbound UNCERTAIN excluded from low" : ""}) -> ${text} (straddles=${straddles})`;

  return {
    low,
    high,
    point,
    pointState,
    lowState,
    highState,
    straddles,
    text,
    level,
    burnDepletion,
    uncertainty,
    freshness,
    inboundUncertain,
    trace,
  };
}

