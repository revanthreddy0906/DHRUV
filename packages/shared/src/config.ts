/**
 * All thresholds and synthetic parameters live here (Build Bible section 16, convention 2).
 * Engine thresholds (freshness classes, bands, reserve, slip tolerance) are owned by A.
 * The sync, conflict and map blocks below are owned by C.
 */
export const config = {
  demo: {
    /** Section 13: demo start (simulated). */
    startAt: "2027-01-24T08:00:00.000Z",
  },

  sync: {
    /** Section 9 (SYNTHETIC): bytes per second of demo time while DEGRADED (20 kbps link). */
    degradedBytesPerSecond: 2500,
    /** Section 9: attachments wait while DEGRADED. */
    degradedMaxPriority: 4,
    /** Section 9: retry backoff in seconds, capped; stalled after this many failures. */
    backoffSeconds: [2, 4, 8, 16, 30],
    stalledAfterFailures: 5,
    pullLimit: 500,
    /** Section 15: observed_at may be at most this far ahead of recorded_at_server (off in demo mode). */
    maxFutureSkewMinutes: 10,
  },

  conflicts: {
    /** Section 6/9: higher = more conservative; the most conservative contender is kept. */
    assetStatusSeverity: { OK: 0, DEGRADED: 1, DOWN: 2 } as Record<string, number>,
    personStatusSeverity: { ON_STATION: 0, FIELD: 0, EVACUATED: 1, UNAVAILABLE: 2, INJURED: 3 } as Record<string, number>,
    /** Only these person statuses make a disagreement safety-critical (v2 section 2.6). */
    safetyCriticalPersonStatuses: ["INJURED", "UNAVAILABLE"] as readonly string[],
    /** An incident that is still open is the conservative reading. */
    closedIncidentStatuses: ["RESOLVED", "CLOSED"],
  },

  map: {
    /** Section 8 (SYNTHETIC): position uncertainty circle radius = min(age_h x speed, cap). */
    driftKmPerHour: 3,
    driftCapKm: 30,
    /** Section 8: a position is FRESH under 1 h; older positions get the circle. */
    positionFreshHours: 1,
    /** Section 16: no paid map APIs. Tiles are cached by the PWA; offline falls back to the schematic. */
    tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    tileAttribution: "&copy; OpenStreetMap contributors",
  },

  // TODO(A): freshness class boundaries per source type (section 4 of v2 / section 8)
  // TODO(A): confidence band uncertainty percentages (R13 v2)
  // TODO(A): slip tolerance / reserve constants (R16 v2)
} as const;
