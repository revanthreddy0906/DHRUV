import type { Seed } from "@dhruv/shared";

export interface LeverEffect {
  addAvailableKl?: number;
  saveRawKl?: number;
  burnRateUplift?: number;
  newDeparture?: string;
  newLoadCutoff?: string;
  newLegEta?: string;
  /** The lever's cutoff is this many days before the station's reserve-breach date (marion2026 EVACUATE). */
  cutoffBeforeBreachDays?: number;
  [key: string]: unknown;
}

export interface CataloguedLever {
  id: string;
  nodeId: string;
  label: string;
  effect: LeverEffect;
  cutoff: string;
  leadDays: number;
  deadline: string;
  costAmount: number | null;
  costUnit: string | null;
  synthetic: boolean;
  available: boolean;
  daysRemaining: number;
  trace: string;
}

function truncateToDate(iso: string): string {
  return iso.slice(0, 10) + "T00:00:00.000Z";
}

function daysBetween(a: string, b: string): number {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

function parseEffect(raw: string): LeverEffect {
  try {
    const obj = JSON.parse(raw);
    const addAvailableKl = obj.addAvailableKl ?? obj.adds_kl;
    const saveRawKl = obj.saveRawKl ?? obj.saves_kl;
    const burnRateUplift = obj.burnRateUplift ?? obj.burn_rate_uplift;
    const newDeparture = obj.newDeparture ?? obj.vessel_departure;
    let newLoadCutoff = obj.newLoadCutoff ?? obj.new_load_cutoff;
    if (!newLoadCutoff && newDeparture) {
      const depMs = new Date(newDeparture).getTime();
      newLoadCutoff = new Date(depMs - 2 * 86400000).toISOString();
    }
    const newLegEta = obj.newLegEta ?? obj.new_leg_eta;
    const cutoffBeforeBreachDays = obj.cutoffBeforeBreachDays ?? obj.cutoff_before_breach_days;
    return {
      ...obj,
      cutoffBeforeBreachDays,
      addAvailableKl,
      saveRawKl,
      burnRateUplift,
      newDeparture,
      newLoadCutoff,
      newLegEta,
    };
  } catch {
    return {};
  }
}

/**
 * R08: Lever Catalogue.
 * Computes lever deadlines (cutoff - lead_days) and determines availability against `now`.
 * A lever is available when deadline >= now (deadline == today is available; deadline < today is unavailable).
 */
export function catalogueLevers(
  levers: Seed["levers"],
  now: string,
  nodeId?: string,
  /** The station's reserve-breach date, for levers whose cutoff is set relative to it. */
  reserveBreachDate?: string | null,
): CataloguedLever[] {
  const nowDate = truncateToDate(now);
  const nowMs = new Date(nowDate).getTime();

  const filtered = nodeId ? levers.filter((l) => l.node_id === nodeId) : levers;

  return filtered.map((l) => {
    const effect = parseEffect(l.effect);
    // A cutoff tied to the reserve-breach date moves with the fuel: conserving pushes it later.
    const relative = effect.cutoffBeforeBreachDays !== undefined && reserveBreachDate
      ? new Date(new Date(truncateToDate(reserveBreachDate)).getTime() - effect.cutoffBeforeBreachDays * 86400000).toISOString()
      : undefined;
    const cutoffDate = truncateToDate(relative ?? l.cutoff);
    const cutoffMs = new Date(cutoffDate).getTime();
    const deadlineMs = cutoffMs - l.lead_days * 86400000;
    const deadline = new Date(deadlineMs).toISOString();
    const deadlineDate = truncateToDate(deadline);

    const available = deadlineMs >= nowMs;
    const daysRemaining = daysBetween(nowDate, deadlineDate);

    const dateStr = deadlineDate.slice(0, 10);
    const trace = `[R08] ${l.id}: cutoff ${cutoffDate.slice(0, 10)}${relative ? ` (reserve breach ${reserveBreachDate!.slice(0, 10)} - ${effect.cutoffBeforeBreachDays}d)` : ""} - lead ${l.lead_days}d = deadline ${dateStr} -> ${
      available ? `available (${daysRemaining}d left)` : "EXPIRED"
    }`;

    return {
      id: l.id,
      nodeId: l.node_id,
      label: l.label,
      effect,
      cutoff: relative ?? l.cutoff,
      leadDays: l.lead_days,
      deadline,
      costAmount: l.cost_amount,
      costUnit: l.cost_unit,
      synthetic: l.synthetic === 1,
      available,
      daysRemaining,
      trace,
    };
  });
}

