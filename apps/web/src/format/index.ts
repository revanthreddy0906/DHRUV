/**
 * Every display format in the web app goes through here (docs/ui-redesign/CLAUDE.md section 6).
 * This is the only place components' numbers are shaped; it never computes readiness.
 */
export { UNKNOWN, decimalsFor, formatQty } from "./number";
export { formatRatio } from "./ratio";
export { formatHaveNeed, formatMargin } from "./margin";
export { formatAge, formatAgeMinutes, formatAgo, formatDate, formatDateTime, formatSimClock, formatTime, formatWallTime } from "./time";
