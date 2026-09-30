import { ageHours, etaMinutes, haversineKm, type LatLon } from "./geo.js";
import type { AssetPosition } from "./positions.js";

export interface CapableAsset {
  asset_id: string;
  type: string;
  distanceKm: number;
  etaMinutes: number;
  /** Section 10: "asset status age" shown next to each candidate. */
  statusAgeHours: number | null;
}

export interface ExcludedAsset {
  asset_id: string;
  reason: string;
}

export interface NearestResult {
  capable: CapableAsset[];
  excluded: ExcludedAsset[];
}

/**
 * Section 10 "Nearest capable assets with rough ETA": assets with status OK, ETA = distance /
 * speed. An asset under an unresolved status conflict is not capable (its conservative value
 * holds until a human resolves it), and each exclusion says why so the operator sees it.
 */
export function nearestCapableAssets(from: LatLon, assets: Iterable<AssetPosition>, now: string): NearestResult {
  const capable: CapableAsset[] = [];
  const excluded: ExcludedAsset[] = [];

  for (const a of assets) {
    if (!a.speedKmh) continue;
    if (a.conflict) {
      excluded.push({ asset_id: a.id, reason: `status conflict, kept ${a.status} until a human resolves it` });
      continue;
    }
    if (a.status !== "OK") {
      excluded.push({ asset_id: a.id, reason: `status ${a.status}` });
      continue;
    }
    if (a.lat === null || a.lon === null) {
      excluded.push({ asset_id: a.id, reason: "no known position" });
      continue;
    }

    const distanceKm = haversineKm(from, { lat: a.lat, lon: a.lon });
    capable.push({
      asset_id: a.id,
      type: a.type,
      distanceKm,
      etaMinutes: etaMinutes(distanceKm, a.speedKmh),
      statusAgeHours: a.observedAt ? ageHours(now, a.observedAt) : null,
    });
  }

  capable.sort((x, y) => x.etaMinutes - y.etaMinutes || x.asset_id.localeCompare(y.asset_id));
  return { capable, excluded };
}
