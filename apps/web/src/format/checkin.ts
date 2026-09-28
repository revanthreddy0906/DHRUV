import { formatAgo, formatDate, formatDateTime, formatTime } from "./time";

/**
 * Field Lead check-in wording (SPEC B.3). The schedule is the configured interval and grace
 * (config.season, the same numbers the incident panel shows); the only UI choice is how early
 * "Due soon" starts (ui-config). Display arithmetic on times only: no readiness, no thresholds.
 */

export type CheckInState = "NONE" | "ON_SCHEDULE" | "DUE_SOON" | "OVERDUE";

export interface CheckInStatus {
  state: CheckInState;
  /** "On schedule", "Due soon", "Due now", "Overdue", or "No check-in recorded yet". */
  headline: string;
  /** "Checked in just now", "Checked in 9 h ago". */
  checkedIn?: string;
  /** "Next due 11:00 · overdue from 14:00". */
  schedule?: string;
}

const HOUR = 3_600_000;
const sameDay = (a: string, b: string) => a.slice(0, 10) === b.slice(0, 10);

export function checkInStatus(
  lastAt: string | undefined,
  now: string,
  rule: { intervalHours: number; graceHours: number; dueSoonMinutes: number },
): CheckInStatus {
  if (!lastAt) return { state: "NONE", headline: "No check-in recorded yet" };
  const due = Date.parse(lastAt) + rule.intervalHours * HOUR;
  const overdue = due + rule.graceHours * HOUR;
  const t = Date.parse(now);
  const at = (ms: number) => {
    const iso = new Date(ms).toISOString();
    return sameDay(iso, now) ? formatTime(iso) : formatDateTime(iso);
  };
  const state: CheckInState = t >= overdue ? "OVERDUE" : t >= due - rule.dueSoonMinutes * 60_000 ? "DUE_SOON" : "ON_SCHEDULE";
  const headline = state === "OVERDUE" ? "Overdue" : state === "DUE_SOON" ? (t >= due ? "Due now" : "Due soon") : "On schedule";
  return {
    state,
    headline,
    checkedIn: `Checked in ${formatAgo(lastAt, now)}`,
    schedule: state === "OVERDUE" ? `Due ${at(due)} · overdue since ${at(overdue)}` : `Next due ${at(due)} · overdue from ${at(overdue)}`,
  };
}

/**
 * The field device's one link line (B.3 header): "Online via Maitri · synced 14:35",
 * "Offline via Maitri · 2 waiting to send".
 */
export function fieldLinkLine(link: "ONLINE" | "DEGRADED" | "OFFLINE", station: string, pending: number, syncedAt?: string): string {
  const head = `${link === "ONLINE" ? "Online" : link === "DEGRADED" ? "Degraded" : "Offline"} via ${station}`;
  if (pending > 0) return `${head} · ${pending} waiting to send`;
  if (link === "ONLINE" && syncedAt) return `${head} · synced ${syncedAt}`;
  return head;
}

/** "3–10 Feb", "28 Jan – 3 Feb". */
export function formatDateRange(startIso: string, endIso: string): string {
  const [a, b] = [formatDate(startIso), formatDate(endIso)];
  const [da, ma] = a.split(" "), [db, mb] = b.split(" ");
  if (a === b) return a;
  return ma === mb ? `${da}–${db} ${mb}` : `${a} – ${b}`;
}
