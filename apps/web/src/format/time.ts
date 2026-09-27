/**
 * Ages, dates and the sim clock. Demo times are UTC ISO strings; everything is shown in UTC so
 * every device prints the same clock.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Age from minutes: "just now" under 1 minute (never "0 m"), "25 m", "6 h 50 m", "36 h" (hours up
 * to 48 h, minutes dropped from 24 h), then "3 d 6 h".
 */
export function formatAgeMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.floor(totalMinutes));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} h ${minutes % 60} m` : `${hours} h`;
  if (hours < 48) return `${hours} h`;
  return hours % 24 ? `${Math.floor(hours / 24)} d ${hours % 24} h` : `${Math.floor(hours / 24)} d`;
}

/** Age between two ISO times (see formatAgeMinutes). */
export function formatAge(fromIso: string, toIso: string): string {
  return formatAgeMinutes((Date.parse(toIso) - Date.parse(fromIso)) / 60_000);
}

/** "4 h ago", or "just now" (never "just now ago"). */
export function formatAgo(fromIso: string, toIso: string): string {
  const age = formatAge(fromIso, toIso);
  return age === "just now" ? age : `${age} ago`;
}

/** "3 Feb" */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "24 Jan 08:00" */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(iso)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Sim clock: "24 Jan 2027, 08:00". */
export function formatSimClock(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(iso)} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "20:35" */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
