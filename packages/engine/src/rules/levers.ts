import type { Seed } from "@dhruv/shared";

export interface LeverEffect {
  addAvailableKl?: number;
  saveRawKl?: number;
  newDeparture?: string;
  newLoadCutoff?: string;
  newLegEta?: string;
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
    return JSON.parse(raw);
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
): CataloguedLever[] {
  const nowDate = truncateToDate(now);
  const nowMs = new Date(nowDate).getTime();

  const filtered = nodeId ? levers.filter((l) => l.node_id === nodeId) : levers;

  return filtered.map((l) => {
    const cutoffDate = truncateToDate(l.cutoff);
    const cutoffMs = new Date(cutoffDate).getTime();
    const deadlineMs = cutoffMs - l.lead_days * 86400000;
    const deadline = new Date(deadlineMs).toISOString();
    const deadlineDate = truncateToDate(deadline);

    const available = deadlineMs >= nowMs;
    const daysRemaining = daysBetween(nowDate, deadlineDate);
    const effect = parseEffect(l.effect);

    const dateStr = deadlineDate.slice(0, 10);
    const trace = `[R08] ${l.id}: cutoff ${cutoffDate.slice(0, 10)} - lead ${l.lead_days}d = deadline ${dateStr} -> ${
      available ? `available (${daysRemaining}d left)` : "EXPIRED"
    }`;

    return {
      id: l.id,
      nodeId: l.node_id,
      label: l.label,
      effect,
      cutoff: l.cutoff,
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

