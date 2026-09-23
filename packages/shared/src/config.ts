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

  /** Section 13 (SYNTHETIC, fictional calendar): values the section 14 tables have no column for. */
  season: {
    phases: [
      { phase: "CLOSING", start: "2027-01-24T00:00:00.000Z", end: "2027-03-01T00:00:00.000Z", days: 36 },
      { phase: "WINTER", start: "2027-03-01T00:00:00.000Z", end: "2027-11-16T00:00:00.000Z", days: 260 },
      { phase: "MOBILISATION", start: "2027-11-16T00:00:00.000Z", end: "2027-11-20T00:00:00.000Z", days: 4 },
    ],
    /** Next resupply, the requirement horizon (300 days from start). */
    horizonAt: "2027-11-20T00:00:00.000Z",
    horizonDays: 300,
    /** Person-days of food per person over the horizon (section 13: 24 people x 300 days). */
    foodDaysPerPerson: 300,
    checkInIntervalHours: 4,
    checkInGraceHours: 3,
    /** Personnel rule: minimum on station per critical role; GREEN needs at least need + 1. */
    roleNeed: { DOCTOR: 1, DIESEL_MECHANIC: 1, COMMS_ENGINEER: 1, COOK: 1 } as Record<string, number>,
    generatorsNeeded: 2,
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
    /**
     * Section 16: no paid map APIs. Tiles are cached by the PWA; offline falls back to the schematic.
     * Default: NASA GIBS Blue Marble (free, web mercator, native zoom 8), which shows the ice and the
     * Schirmacher Oasis around Maitri where OpenStreetMap is nearly blank. Note the {y}/{x} order.
     */
    tileUrl: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-08-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg",
    tileAttribution: "NASA GIBS Blue Marble",
    /** Deeper zooms (the 27 km circle is about z9-10) upscale level-8 tiles instead of requesting tiles that do not exist. */
    tileMaxNativeZoom: 8,
    tileMaxZoom: 12,
    /** Alternative street tiles, for places where they help (ports, cities). */
    altTileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    altTileAttribution: "&copy; OpenStreetMap contributors",
  },

  // TODO(A): freshness class boundaries per source type (section 4 of v2 / section 8)
  // TODO(A): confidence band uncertainty percentages (R13 v2)
  // TODO(A): slip tolerance / reserve constants (R16 v2)
} as const;
