import { config, type OpEvent, type Seed } from "@dhruv/shared";
import { reduce, seasonFor } from "@dhruv/engine";
import { formatAge, formatDateTime, formatSimClock } from "../format";

/**
 * Chrome helpers. Display formats live in src/format; these names stay for existing callers.
 * Display helpers for the live chrome. Demo times are UTC ISO strings (section 14); the UI shows
 * them in UTC so every device prints the same clock.
 */

/** The sim clock: "24 Jan 2027, 08:00". */
export const formatClock = formatSimClock;

/** "24 Jan 09:00" */
export const formatShort = formatDateTime;

/** Age between two ISO times: "just now", "6 h 50 m", "36 h", "3 d 6 h". */
export { formatAge };

/** Season phase at `now` (section 13 calendar). */
export function phaseAt(nowIso: string): string {
  const t = Date.parse(nowIso);
  const phase = config.season.phases.find((p) => t >= Date.parse(p.start) && t < Date.parse(p.end));
  return phase?.phase ?? (t < Date.parse(config.season.phases[0]?.start ?? nowIso) ? "CLOSING" : "WINTER");
}

/** Whole days to the next resupply (20 Nov 2027), counting a part day as a day. */
export function daysToResupply(nowIso: string): number {
  return Math.max(0, Math.ceil((Date.parse(config.season.horizonAt) - Date.parse(nowIso)) / 86_400_000));
}

/**
 * The season this device's scenario runs on: the fixed section 13 calendar, or the scenario's own
 * season (Seed.season) whose next resupply is its relief vessel's current ETA.
 */
export function seasonAt(seed: Seed | null | undefined, events: OpEvent[], nowIso: string): { phase: string; daysToResupply: number; resupplyAt: string } {
  if (!seed?.season) return { phase: phaseAt(nowIso), daysToResupply: daysToResupply(nowIso), resupplyAt: config.season.horizonAt };
  const { resupplyAt } = seasonFor(seed, reduce(seed, events), nowIso);
  const phase = seed.season.phases.find((p) => p.start <= nowIso && nowIso < p.end)?.phase ?? "WINTER";
  const days = Math.max(0, Math.ceil((Date.parse(resupplyAt) - Date.parse(nowIso)) / 86_400_000));
  return { phase, daysToResupply: days, resupplyAt };
}

/** Absolute clock jump target for the +1 h / +6 h / +30 h buttons (v2 C5: always absolute). */
export function addHours(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * 3_600_000).toISOString();
}

/** "7 Feb", "7 Feb 2027" or "2027-02-07" as midnight UTC in the demo year; null if unreadable. */
export function parseEtaInput(input: string): string | null {
  const t = input.trim();
  // Date() alone is lenient ("soon 2027" parses), so only the three documented forms are read.
  if (!/^(\d{1,2} [A-Za-z]{3,9}( \d{4})?|\d{4}-\d{2}-\d{2})$/.test(t)) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t}T00:00:00Z` : `${t}${/\d{4}/.test(t) ? "" : " 2027"} 00:00 UTC`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
