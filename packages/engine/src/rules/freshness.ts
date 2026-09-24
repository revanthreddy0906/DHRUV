import { config } from "@dhruv/shared";

export type FreshnessClass = "FRESH" | "AGING" | "STALE" | "CRITICAL";

export type FreshnessTierKey = "stock" | "cargoEta" | "position" | "link" | "asset";

export interface FreshnessResult {
  sourceId: string;
  tier: FreshnessTierKey;
  observedAt: string | null;
  ageHours: number;
  freshness: FreshnessClass;
  uncertainty: number;
  trace: string;
}

const FRESHNESS_ORDER: Record<FreshnessClass, number> = {
  FRESH: 0,
  AGING: 1,
  STALE: 2,
  CRITICAL: 3,
};

/**
 * Returns the worst (oldest) freshness class among an array of classes.
 * Spec §8 line 361 / T-FRESH-03: Output freshness = oldest critical input.
 */
export function worstFreshness(classes: FreshnessClass[]): FreshnessClass {
  if (classes.length === 0) return "FRESH";
  let worst: FreshnessClass = "FRESH";
  for (const c of classes) {
    if (FRESHNESS_ORDER[c] > FRESHNESS_ORDER[worst]) {
      worst = c;
    }
  }
  return worst;
}

/**
 * R12: Freshness Classification.
 * Classifies the freshness of an input given its observedAt timestamp and injected `now`.
 * Pure and deterministic.
 */
export function classifyFreshness(
  sourceId: string,
  tier: FreshnessTierKey,
  observedAt: string | null | undefined,
  now: string,
): FreshnessResult {
  const uncertainties = config.freshness.bandUncertaintyByTier;

  if (!observedAt || observedAt.trim() === "") {
    const trace = `[R12] ${sourceId} (${tier}): missing timestamp -> CRITICAL (u=12%)`;
    return {
      sourceId,
      tier,
      observedAt: null,
      ageHours: Infinity,
      freshness: "CRITICAL",
      uncertainty: uncertainties[3],
      trace,
    };
  }

  const nowMs = new Date(now).getTime();
  const obsMs = new Date(observedAt).getTime();

  if (Number.isNaN(nowMs) || Number.isNaN(obsMs)) {
    const trace = `[R12] ${sourceId} (${tier}): invalid timestamp -> CRITICAL (u=12%)`;
    return {
      sourceId,
      tier,
      observedAt,
      ageHours: Infinity,
      freshness: "CRITICAL",
      uncertainty: uncertainties[3],
      trace,
    };
  }

  const ageMs = Math.max(0, nowMs - obsMs);
  const ageHours = ageMs / (1000 * 60 * 60);

  let freshness: FreshnessClass;
  let tierIndex: number;

  switch (tier) {
    case "stock": {
      const cfg = config.freshness.tiers.stock;
      const staleHours = cfg.staleDays * 24;
      if (ageHours < cfg.freshHours) {
        freshness = "FRESH";
        tierIndex = 0;
      } else if (ageHours < cfg.agingHours) {
        freshness = "AGING";
        tierIndex = 1;
      } else if (ageHours < staleHours) {
        freshness = "STALE";
        tierIndex = 2;
      } else {
        freshness = "CRITICAL";
        tierIndex = 3;
      }
      break;
    }
    case "cargoEta": {
      const cfg = config.freshness.tiers.cargoEta;
      const staleHours = cfg.staleDays * 24;
      if (ageHours < cfg.freshHours) {
        freshness = "FRESH";
        tierIndex = 0;
      } else if (ageHours < cfg.agingHours) {
        freshness = "AGING";
        tierIndex = 1;
      } else if (ageHours < staleHours) {
        freshness = "STALE";
        tierIndex = 2;
      } else {
        freshness = "CRITICAL";
        tierIndex = 3;
      }
      break;
    }
    case "position": {
      const cfg = config.freshness.tiers.position;
      if (ageHours < cfg.freshHours) {
        freshness = "FRESH";
        tierIndex = 0;
      } else if (ageHours < cfg.agingHours) {
        freshness = "AGING";
        tierIndex = 1;
      } else if (ageHours < cfg.staleHours) {
        freshness = "STALE";
        tierIndex = 2;
      } else {
        freshness = "CRITICAL";
        tierIndex = 3;
      }
      break;
    }
    case "link": {
      const cfg = config.freshness.tiers.link;
      if (ageHours < cfg.freshHours) {
        freshness = "FRESH";
        tierIndex = 0;
      } else if (ageHours < cfg.agingHours) {
        freshness = "AGING";
        tierIndex = 1;
      } else if (ageHours < cfg.staleHours) {
        freshness = "STALE";
        tierIndex = 2;
      } else {
        freshness = "CRITICAL";
        tierIndex = 3;
      }
      break;
    }
    case "asset": {
      const cfg = config.freshness.tiers.asset;
      if (ageHours < cfg.freshHours) {
        freshness = "FRESH";
        tierIndex = 0;
      } else if (ageHours < cfg.agingHours) {
        freshness = "AGING";
        tierIndex = 1;
      } else if (ageHours < cfg.staleHours) {
        freshness = "STALE";
        tierIndex = 2;
      } else {
        freshness = "CRITICAL";
        tierIndex = 3;
      }
      break;
    }
  }

  const uncertainty = uncertainties[tierIndex]!;
  const trace = `[R12] ${sourceId} (${tier}): observed ${observedAt}, age ${ageHours.toFixed(
    1,
  )}h -> ${freshness} (u=${(uncertainty * 100).toFixed(0)}%)`;

  return {
    sourceId,
    tier,
    observedAt,
    ageHours,
    freshness,
    uncertainty,
    trace,
  };
}

