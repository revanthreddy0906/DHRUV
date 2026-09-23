import { config } from "@dhruv/shared";

export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance (section 10: "haversine distance from last-known position"). */
export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function ageHours(now: string, observedAt: string): number {
  return (Date.parse(now) - Date.parse(observedAt)) / 3_600_000;
}

/**
 * Section 8 rule 5: for a position older than FRESH, radius = min(age_h x v, cap)
 * (v = 3 km/h, cap = 30 km, SYNTHETIC). A FRESH position gets no circle.
 */
export function uncertaintyRadiusKm(ageH: number): number | null {
  const { driftKmPerHour, driftCapKm, positionFreshHours } = config.map;
  if (ageH < positionFreshHours) return null;
  return Math.min(ageH * driftKmPerHour, driftCapKm);
}

/** Section 10: rough ETA = distance / asset speed (SYNTHETIC speeds). */
export function etaMinutes(distanceKm: number, speedKmh: number): number {
  return (distanceKm / speedKmh) * 60;
}

/** Section 8 visual language: "25 min ago", "9 h ago", "35 h ago", "4 d ago". Never "live". */
export function formatAge(hours: number): string {
  if (hours < 1) return `${Math.max(0, Math.round(hours * 60))} min ago`;
  if (hours < 48) return `${Math.round(hours)} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
