import { compareEvents, type OpEvent, type Seed } from "@dhruv/shared";

export interface AssetPosition {
  id: string;
  type: string;
  node_id: string;
  status: string;
  /** True while a CONFLICT_FLAGGED on this asset's status is unresolved; status then holds the conservative value. */
  conflict: boolean;
  lat: number | null;
  lon: number | null;
  /** Age source for the status and position (section 10: "asset status age"). */
  observedAt: string | null;
  speedKmh: number | null;
}

export interface TeamPosition {
  id: string;
  lat: number;
  lon: number;
  observedAt: string;
}

export interface LegState {
  id: string;
  shipment_id: string;
  seq: number;
  from_node: string;
  to_node: string;
  status: string;
  eta: string;
}

export interface Positions {
  assets: Map<string, AssetPosition>;
  teams: Map<string, TeamPosition>;
  legs: LegState[];
}

/**
 * Last-known positions and statuses for the map, from seed plus events in reduce order.
 * Asset status is last-write-wins, except that an unresolved safety conflict pins it to the
 * conservative value (sections 6 and 9); CONFLICT_RESOLVED applies the human's chosen value.
 */
export function derivePositions(seed: Seed, events: OpEvent[]): Positions {
  const assets = new Map<string, AssetPosition>(
    seed.assets.map((a) => [
      a.id,
      { id: a.id, type: a.type, node_id: a.node_id, status: a.status, conflict: false, lat: a.lat, lon: a.lon, observedAt: a.last_seen, speedKmh: a.speed_kmh },
    ]),
  );
  const teams = new Map<string, TeamPosition>();
  const legs = new Map<string, LegState>(
    seed.legs.map((l) => [l.id, { id: l.id, shipment_id: l.shipment_id, seq: l.seq, from_node: l.from_node, to_node: l.to_node, status: l.status, eta: l.eta }]),
  );
  const assetConflicts = new Map<string, string>();

  for (const e of [...events].sort(compareEvents)) {
    const p = e.payload as Record<string, unknown>;
    switch (e.type) {
      case "ASSET_STATUS_SET": {
        const asset = assets.get(p.asset_id as string);
        if (!asset) break;
        if (!asset.conflict) asset.status = p.status as string;
        if (typeof p.lat === "number" && typeof p.lon === "number") {
          asset.lat = p.lat;
          asset.lon = p.lon;
        }
        asset.observedAt = e.observed_at;
        break;
      }
      case "CONFLICT_FLAGGED": {
        const asset = p.entity_type === "asset" && p.field === "status" ? assets.get(p.entity_id as string) : undefined;
        if (!asset) break;
        assetConflicts.set(p.conflict_id as string, asset.id);
        asset.conflict = true;
        asset.status = p.conservative_value as string;
        break;
      }
      case "CONFLICT_RESOLVED": {
        const asset = assets.get(assetConflicts.get(p.conflict_id as string) ?? "");
        if (!asset) break;
        asset.conflict = false;
        asset.status = p.chosen_value as string;
        break;
      }
      case "CHECKIN_RECORDED":
        teams.set(p.person_or_team_id as string, { id: p.person_or_team_id as string, lat: p.lat as number, lon: p.lon as number, observedAt: e.observed_at });
        break;
      case "LEG_DELAYED": {
        const leg = legs.get(p.leg_id as string);
        if (leg) Object.assign(leg, { status: "DELAYED", eta: p.new_eta as string });
        break;
      }
      case "LEG_UPDATED": {
        const leg = legs.get(p.leg_id as string);
        if (leg) Object.assign(leg, { status: p.status as string, ...(p.eta ? { eta: p.eta as string } : {}) });
        break;
      }
      default:
        break;
    }
  }

  return { assets, teams, legs: [...legs.values()].sort((a, b) => a.shipment_id.localeCompare(b.shipment_id) || a.seq - b.seq) };
}
