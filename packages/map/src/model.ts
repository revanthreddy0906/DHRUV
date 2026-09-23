import { compareEvents, type OpEvent, type Seed } from "@dhruv/shared";
import { ageHours, formatAge, uncertaintyRadiusKm, type LatLon } from "./geo.js";
import { nearestCapableAssets, type NearestResult } from "./nearest.js";
import { derivePositions } from "./positions.js";

export interface MapFeature extends LatLon {
  id: string;
  kind: "node" | "asset" | "team";
  label: string;
  /** Null for fixed nodes; every other feature carries its age (section 10 rule 1). */
  ageHours: number | null;
  ageLabel: string | null;
  status?: string;
  conflict?: boolean;
  /** Radius of the last-known-position circle, null when FRESH or not a moving thing. */
  uncertaintyKm: number | null;
}

export interface RouteSegment {
  leg_id: string;
  shipment_id: string;
  from: LatLon & { node_id: string };
  to: LatLon & { node_id: string };
  status: string;
  eta: string;
}

export interface IncidentFocus {
  incident_id: string;
  team_id: string | null;
  position: LatLon | null;
  lastConfirmedAt: string;
  ageHours: number;
  /** Section 10 rule 2 wording, e.g. "Last confirmed 9 h ago". */
  ageLabel: string;
  uncertaintyKm: number | null;
  nearest: NearestResult;
}

export interface MapModel {
  now: string;
  features: MapFeature[];
  routes: RouteSegment[];
  incident: IncidentFocus | null;
}

export interface BuildMapModelInput {
  seed: Seed;
  events: OpEvent[];
  /** clock.now() of the viewing node: ages are viewer-relative (section 8). */
  now: string;
  incidentId?: string;
}

function buildIncident(events: OpEvent[], incidentId: string, teams: ReturnType<typeof derivePositions>["teams"], assets: ReturnType<typeof derivePositions>["assets"], now: string): IncidentFocus | null {
  const opened = events
    .filter((e) => e.type === "INCIDENT_OPENED" && (e.payload as { incident_id: string }).incident_id === incidentId)
    .sort(compareEvents)
    .at(-1);
  if (!opened) return null;

  const p = opened.payload as { team_id?: string; person_ids: string[]; last_confirmed_at: string };
  const candidates = [p.team_id, ...p.person_ids].filter((id): id is string => Boolean(id));
  const last = candidates.map((id) => teams.get(id)).find(Boolean) ?? null;

  const lastConfirmedAt = last?.observedAt ?? p.last_confirmed_at;
  const age = ageHours(now, lastConfirmedAt);
  const position = last ? { lat: last.lat, lon: last.lon } : null;
  return {
    incident_id: incidentId,
    team_id: last?.id ?? p.team_id ?? null,
    position,
    lastConfirmedAt,
    ageHours: age,
    ageLabel: `Last confirmed ${formatAge(age)}`,
    uncertaintyKm: position ? uncertaintyRadiusKm(age) : null,
    nearest: position ? nearestCapableAssets(position, assets.values(), now) : { capable: [], excluded: [] },
  };
}

/** The spatial picture for the Map screen and the Incident map (section 17). */
export function buildMapModel({ seed, events, now, incidentId }: BuildMapModelInput): MapModel {
  const { assets, teams, legs } = derivePositions(seed, events);
  const nodes = new Map(seed.nodes.filter((n) => n.lat !== null && n.lon !== null).map((n) => [n.id, n]));

  const features: MapFeature[] = [
    ...[...nodes.values()].map((n) => ({ id: n.id, kind: "node" as const, label: n.name, lat: n.lat!, lon: n.lon!, ageHours: null, ageLabel: null, uncertaintyKm: null })),
    ...[...assets.values()]
      .filter((a) => a.lat !== null && a.lon !== null)
      .map((a) => {
        const age = a.observedAt ? ageHours(now, a.observedAt) : null;
        return {
          id: a.id,
          kind: "asset" as const,
          label: `${a.id} (${a.type})`,
          lat: a.lat!,
          lon: a.lon!,
          ageHours: age,
          ageLabel: age === null ? "age unknown" : formatAge(age),
          status: a.status,
          conflict: a.conflict,
          uncertaintyKm: age !== null && a.speedKmh ? uncertaintyRadiusKm(age) : null,
        };
      }),
    ...[...teams.values()].map((t) => {
      const age = ageHours(now, t.observedAt);
      return { id: t.id, kind: "team" as const, label: t.id, lat: t.lat, lon: t.lon, ageHours: age, ageLabel: formatAge(age), uncertaintyKm: uncertaintyRadiusKm(age) };
    }),
  ];

  const routes: RouteSegment[] = legs.flatMap((l) => {
    const from = nodes.get(l.from_node);
    const to = nodes.get(l.to_node);
    if (!from || !to) return [];
    return [
      {
        leg_id: l.id,
        shipment_id: l.shipment_id,
        from: { node_id: from.id, lat: from.lat!, lon: from.lon! },
        to: { node_id: to.id, lat: to.lat!, lon: to.lon! },
        status: l.status,
        eta: l.eta,
      },
    ];
  });

  return { now, features, routes, incident: incidentId ? buildIncident(events, incidentId, teams, assets, now) : null };
}
