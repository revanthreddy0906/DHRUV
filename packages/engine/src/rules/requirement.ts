import type { InventoryState } from "../state.js";
import type { Seed } from "@dhruv/shared";

export interface PhaseBoundary { start: string; end: string; }
export type PhaseBoundaries = Record<string, PhaseBoundary>;

export interface RequirementResult {
  itemId: string;
  rBase: number;
  r: number;
  trace: string;
}

function truncateToDate(iso: string): string {
  return iso.slice(0, 10) + "T00:00:00.000Z";
}

function daysBetween(a: string, b: string): number {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

export function computeRequirement(
  item: InventoryState,
  profiles: Seed["consumption_profiles"],
  now: string,
  phaseBoundaries: PhaseBoundaries,
): RequirementResult {
  const nowDate = truncateToDate(now);
  const itemProfiles = profiles.filter((p) => p.item_id === item.itemId);
  let rBase = 0;
  const lines: string[] = [];
  for (const phase of Object.keys(phaseBoundaries)) {
    const profile = itemProfiles.find((p) => p.phase === phase);
    if (!profile) continue;
    const bounds = phaseBoundaries[phase]!;
    const from = nowDate > bounds.start ? nowDate : bounds.start;
    const days = daysBetween(from, bounds.end);
    const contribution = days * profile.rate_per_day;
    rBase += contribution;
    lines.push(`${phase}: ${days.toFixed(1)}d x ${profile.rate_per_day} = ${contribution.toFixed(2)}`);
  }
  const r = rBase * (1 + item.reservePct);
  return {
    itemId: item.itemId,
    rBase,
    r,
    trace: `[R01] ${item.itemId} requirement: ${lines.join(" + ")} = ${rBase.toFixed(2)}; with ${(item.reservePct * 100).toFixed(0)}% reserve = ${r.toFixed(2)}`,
  };
}
