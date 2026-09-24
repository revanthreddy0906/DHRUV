import * as React from "react";
import { EVENT_RULES, config, stockBalance, type OpEvent } from "@dhruv/shared";
import { buildMapModel, haversineKm, type MapModel } from "@dhruv/map";
import { reduceOrder, type ConflictView, type IncidentView } from "@dhruv/store";
import { INCIDENT, MOMENTS } from "../data/demo";
import type { Freshness, Tier } from "../data/types";
import { useDevice } from "./DeviceProvider";
import { nodeLabel } from "./chrome";
import { coords, describeEvent } from "./describe";
import { formatAge, formatShort } from "./format";
import { useLiveOps } from "./ops";

import type { Inc as IncidentData, SnapshotRow } from "../components/incident";

export interface LiveIncident {
  incident: IncidentView;
  data: IncidentData;
  rows: SnapshotRow[];
  model: MapModel;
  conflicts: ConflictView[];
  canEscalate: boolean;
}

const HOUR = 3_600_000;
const hoursBetween = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / HOUR;

/** Section 8 freshness for positions (<1 h, <6 h, <24 h) and for stock counts (<24 h, <72 h, <7 d). */
const positionFreshness = (h: number): Freshness => (h < 1 ? "FRESH" : h < 6 ? "AGING" : h < 24 ? "STALE" : "CRITICAL");
const countFreshness = (h: number): Freshness => (h < 24 ? "FRESH" : h < 72 ? "AGING" : h < 168 ? "STALE" : "CRITICAL");

/** The events this device holds, minus any the server refused (they are not facts). */
export function useFactEvents(): OpEvent[] | null {
  const snap = useDevice()?.snapshot;
  return React.useMemo(() => (snap ? (snap.rejected.size ? snap.events.filter((e) => !snap.rejected.has(e.event_id)) : snap.events) : null), [snap]);
}

/** buildMapModel on this device's seed, events and clock; the one source for positions, circles and nearest assets. */
export function useLiveMapModel(incidentId?: string): MapModel | null {
  const snap = useDevice()?.snapshot;
  const events = useFactEvents();
  return React.useMemo(() => (snap?.seed && events ? buildMapModel({ seed: snap.seed, events, now: snap.now, incidentId }) : null), [snap?.seed, snap?.now, events, incidentId]);
}

/**
 * The incident snapshot (section 10) as this device knows it. Position, age, circle and nearest
 * capable assets come from the map model; people, doctors and medical stock from the seed and the
 * event log (stock by the shared class B rule). Autonomy cost is the engine's (what-if), so it is
 * stated as pending, with the v2 C10 wording for the helicopter.
 */
export function useLiveIncident(): LiveIncident | null {
  const device = useDevice();
  const ops = useLiveOps();
  const events = useFactEvents();
  const incident = ops?.openIncidents[0];
  const model = useLiveMapModel(incident?.id);

  return React.useMemo(() => {
    const snap = device?.snapshot;
    if (!device || !snap?.seed || !ops || !events || !incident || !model) return null;
    const { seed, now } = snap;
    const { identity } = device.session;
    const focus = model.incident;
    const sorted = [...events].sort(reduceOrder);
    const station = seed.nodes.find((n) => n.id === incident.node_id);

    // People: names and roles from the seed, latest status from PERSON_STATUS_SET.
    const personStatus = (id: string) =>
      (sorted.filter((e) => e.type === "PERSON_STATUS_SET" && (e.payload as { person_id: string }).person_id === id).at(-1)?.payload as { status: string } | undefined)?.status;
    const people = incident.person_ids.map((id) => {
      const p = seed.personnel.find((x) => x.id === id);
      return { name: p?.name ?? id, role: p ? p.role.replaceAll("_", " ").toLowerCase() : "unknown", status: personStatus(id) ?? "last seen at check-in", age: focus ? formatAge(focus.lastConfirmedAt, now) : "unknown" };
    });

    const ageH = focus ? hoursBetween(focus.lastConfirmedAt, now) : hoursBetween(incident.last_confirmed_at, now);
    const position = focus?.position;
    const distance = position && station?.lat != null && station.lon != null ? `≈ ${Math.round(haversineKm(position, { lat: station.lat, lon: station.lon }))} km from ${station.name}` : "position not received on this device";
    const lastAt = focus?.lastConfirmedAt ?? incident.last_confirmed_at;
    const lastConfirmed = {
      at: formatShort(lastAt),
      age: formatAge(lastAt, now),
      ageHours: ageH,
      lat: position ? coords(position.lat, position.lon).split(", ")[0]! : "—",
      lon: position ? coords(position.lat, position.lon).split(", ")[1]! : "—",
      distance,
      circleKm: Math.round(focus?.uncertaintyKm ?? 0),
      freshness: positionFreshness(ageH),
    };
    const due = new Date(Date.parse(lastAt) + config.season.checkInIntervalHours * HOUR).toISOString();
    const overdue = new Date(Date.parse(due) + config.season.checkInGraceHours * HOUR).toISOString();
    const schedule = `Check-ins every ${config.season.checkInIntervalHours} h · next due ${formatShort(due)} · grace ${config.season.checkInGraceHours} h · overdue ${formatShort(overdue)}`;

    // Medical resources at the incident's station.
    const doctors = seed.personnel.filter((p) => p.node_id === incident.node_id && p.role === "DOCTOR");
    const medical = [
      { text: `Doctors at ${nodeLabel(incident.node_id)}: ${doctors.map((d) => d.name).join(", ") || "none"} (${doctors.length})`, age: "roster · seed" },
      ...seed.inventory_items
        .filter((i) => i.node_id === incident.node_id && i.dimension === "MEDICAL")
        .map((item) => {
          const stock = stockBalance(sorted, item.id, item.stock);
          const countedAt = stock?.countedAt ?? item.last_counted;
          const h = hoursBetween(countedAt, now);
          const moves = stock?.deltas.length ? ` (${stock.deltas.length} change${stock.deltas.length === 1 ? "" : "s"} since the count)` : "";
          return { text: `${item.name}: ${stock?.balance ?? item.stock} ${item.unit} on hand${moves}`, age: `count ${formatAge(countedAt, now)} · ${countFreshness(h)}` };
        }),
    ];

    // Responders from the nearest-assets rule; excluded vehicles keep their reason.
    const assetOf = (id: string) => seed.assets.find((a) => a.id === id);
    const autonomy = (type: string) =>
      /helicopter/i.test(type)
        ? "Aviation fuel is not tracked by DHRUV. Diesel autonomy unaffected; confirm aviation fuel separately."
        : "Draws from the station diesel pool. Autonomy cost comes from the what-if engine (pending).";
    const capable = (focus?.nearest.capable ?? []).slice(0, 3).map((c) => ({
      id: c.asset_id,
      type: c.type,
      distance: `≈ ${c.distanceKm.toFixed(1)} km`,
      eta: `≈ ${Math.round(c.etaMinutes)} min at ${assetOf(c.asset_id)?.speed_kmh ?? "?"} km/h`,
      status: "OK",
      excluded: false,
      autonomy: autonomy(c.type),
    }));
    const excluded = (focus?.nearest.excluded ?? [])
      .filter((x) => x.reason !== "no known position")
      .map((x) => ({ id: x.asset_id, type: assetOf(x.asset_id)?.type ?? "", distance: "", eta: "—", status: x.reason.startsWith("status conflict") ? "CONFLICT" : x.reason.replace("status ", ""), excluded: true, autonomy: `Excluded: ${x.reason}.` }));

    const own = identity.node_id === incident.node_id;
    const heard = ops.openIncidents.length ? snap.lastHeard[incident.node_id] : null;
    const comms = own
      ? `${nodeLabel(incident.node_id)} link ${snap.link} (simulated link)${snap.link === "OFFLINE" ? " · local operations active" : ""}`
      : `${nodeLabel(incident.node_id)} last heard ${heard ? `${formatAge(heard, now)} ago` : "at seed"} (as seen from ${identity.device_id})`;

    // Incident timeline: the incident, the team's check-ins and responder status changes.
    const responderIds = new Set([...capable, ...excluded].map((r) => r.id));
    const related = sorted.filter((e) => {
      const p = e.payload as Record<string, unknown>;
      return (
        ((e.type === "INCIDENT_OPENED" || e.type === "INCIDENT_UPDATED") && p.incident_id === incident.id) ||
        (e.type === "CHECKIN_RECORDED" && (p.person_or_team_id === incident.team_id || incident.person_ids.includes(p.person_or_team_id as string))) ||
        (e.type === "ASSET_STATUS_SET" && responderIds.has(p.asset_id as string))
      );
    });
    const timeline = related
      .reverse()
      .slice(0, 8)
      .map((e) => ({ at: formatShort(e.observed_at), text: `${e.type === "INCIDENT_OPENED" ? "Opened · " : ""}${describeEvent(e)} · ${e.device_id}`, tier: (e.actor_role === "SYSTEM" || EVENT_RULES[e.type].localOnly ? null : e.priority) as Tier | null }));

    const mission = seed.missions.find((m) => {
      try {
        return (JSON.parse(m.needs) as { people?: string[] }).people?.some((p) => incident.person_ids.includes(p));
      } catch {
        return false;
      }
    });
    const missionState = MOMENTS[ops.mockMoment].stations[0]?.missions.find((m) => m.id === mission?.id);

    const conflicts = ops.openConflicts.filter((c) => c.entity_type === "asset" && responderIds.has(c.entity_id));
    const opener = incident.opened_by;

    const data: IncidentData = {
      ...INCIDENT,
      id: incident.id,
      openedAt: formatShort(incident.opened_at),
      openedBy: opener,
      team: incident.team_id ?? incident.person_ids.join(", "),
      mission: mission ? `${mission.id} ${mission.name}` : "no mission recorded",
      people,
      lastConfirmed,
      schedule,
      medical,
      responders: [...capable, ...excluded],
      comms,
      timeline,
    };

    const rows: SnapshotRow[] = [
      { k: "People involved", v: people.map((p) => `${p.name} (${p.role})`).join(", "), age: `status ${lastConfirmed.age}`, tone: ageH >= 1 ? "amber" : undefined },
      { k: "Mission", v: `${data.team} · ${data.mission}`, age: "plan · seed" },
      { k: "Last confirmed position", v: position ? `${lastConfirmed.lat}, ${lastConfirmed.lon} · circle ${lastConfirmed.circleKm} km` : "Not received on this device yet", age: `${lastConfirmed.age} · ${lastConfirmed.freshness}`, tone: lastConfirmed.freshness === "FRESH" ? undefined : "amber" },
      ...medical.map((m) => ({ k: "Medical", v: m.text, age: m.age, tone: /STALE|CRITICAL/.test(m.age) ? ("amber" as const) : undefined })),
      ...(capable[0] ? [{ k: "Nearest capable", v: `${capable[0].id} ${capable[0].type} · ${capable[0].distance} · ${capable[0].eta}`, age: "status age unknown" }] : []),
      ...excluded.map((x) => ({ k: "Excluded", v: `${x.id} · ${x.autonomy.replace("Excluded: ", "").replace(/\.$/, "")}`, age: "until resolved", tone: "red" as const })),
      { k: "Comms", v: comms, age: own ? snap.link : heard ? formatAge(heard, now) : "seed", tone: own && snap.link !== "ONLINE" ? "red" : undefined },
      { k: "Mission state", v: missionState ? `${missionState.id} ${missionState.status} (${missionState.why})` : "engine evaluation pending", age: "engine · fixture" },
    ];

    return { incident, data, rows, model, conflicts, canEscalate: identity.role === "HQ_OPS" || identity.role === "STATION_LEADER" };
  }, [device, ops, events, incident, model]);
}

