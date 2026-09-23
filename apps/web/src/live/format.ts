import { config } from "@dhruv/shared";

/**
 * Display helpers for the live chrome. Demo times are UTC ISO strings (section 14); the UI shows
 * them in UTC so every device prints the same clock.
 */

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const pad = (n: number) => String(n).padStart(2, "0");

/** "24 JAN 2027 08:11" */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "24 Jan 09:00" */
export function formatShort(iso: string): string {
  const d = new Date(iso);
  const month = MONTHS[d.getUTCMonth()] ?? "";
  return `${d.getUTCDate()} ${month.charAt(0)}${month.slice(1).toLowerCase()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Age between two ISO times: "0 m", "6 h 50 m", "3 d 6 h". */
export function formatAge(fromIso: string, toIso: string): string {
  const minutes = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60_000));
  if (minutes < 60) return `${minutes} m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} h ${pad(minutes % 60)} m` : `${hours} h`;
  return hours % 24 ? `${Math.floor(hours / 24)} d ${hours % 24} h` : `${Math.floor(hours / 24)} d`;
}

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

/** Absolute clock jump target for the +1 h / +6 h / +30 h buttons (v2 C5: always absolute). */
export function addHours(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * 3_600_000).toISOString();
}
