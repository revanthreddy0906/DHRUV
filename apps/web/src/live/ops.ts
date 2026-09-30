import * as React from "react";
import { EVENT_RULES, withCreatedShipments } from "@dhruv/shared";
import { LEVER_ACTIONS, NODES, season48 } from "@dhruv/seed";
import { evaluate, legMilestones, reduce, type Evaluation, type ShipmentMilestones, type StationEval as EngineStationEval } from "@dhruv/engine";
import type { OpEvent, Seed } from "@dhruv/shared";
import { ageHours, uncertaintyRadiusKm } from "@dhruv/map";
import { conflictsView, decisionsView, incidentsView, lastCheckIn, timeline, type ConflictView, type DecisionView, type IncidentView } from "@dhruv/store";
import type { QueueItem } from "../components/decisions";
import type { InventoryView } from "../data/demo";
import type { Health, Lever, OpEventRow, OptionEval, StationEval, Tier, TraceStep } from "../data/types";
import { adaptLiveEvaluation, inventoryRows, leverViews, roleRows } from "./adapter";
import { useDevice } from "./DeviceProvider";
import { exceptionsOf, forViewer, type OpsException } from "./exceptions";
import { nodeLabel } from "./chrome";
import { coords, dayLabel, describeEvent, incidentTypeLabel } from "./describe";
import { formatAge, seasonAt } from "./format";
import { formatAgo, formatDate } from "../format";

/**
 * Operational records for this device, from the events it holds (F2): open decisions with their
 * windows, conflicts, incidents, the timeline. Viewer-relative: HQ sees Maitri's offline entries
 * only after they sync.
 *
 * Readiness (station cards, ratios, bands, traces, inventory, roles, missions, levers, risks) is the
 * engine's evaluate() on the same events at this device's clock. Nothing comes from design fixtures.
 */
export interface LiveOps {
  decisions: QueueItem[];
  openDecisions: DecisionView[];
  openConflicts: ConflictView[];
  openIncidents: IncidentView[];
  /** Emergency mode (section 4): an open incident, seen by HQ Ops or a Station Leader. */
  emergency: boolean;
  incidentStrip?: string;
  pnr?: { date: string; daysLeft: number };
  timeline: (OpEventRow & { age: string })[];
  evaluation: Evaluation;
  stations: StationEval[];
  /** The station this viewer looks at first: their own, or Maitri for HQ. */
  maitriStation: StationEval;
  focusEval?: EngineStationEval;
  options: OptionEval[];
  traceSteps: TraceStep[];
  risks: { text: string; state: Health | "INFO"; age?: string }[];
  /** Back-scheduled milestones per shipment (engine legMilestones). */
  milestones: ShipmentMilestones[];
  /** Exception queue for this viewer: their station, their role's items first. */
  exceptions: OpsException[];
  vessel?: { name: string; loadCutoff: string; departs: string; eta: string; closing: string };
  /** The same vessel window as ISO times, for the Season timeline. */
  vesselWindow?: { name: string; loadCutoff: string; departure: string; etaStation: string; closing: string };
  /** The first open incident, for the Command strip: title and when its position was last confirmed. */
  incident?: { id: string; title: string; lastConfirmedAt: string };
  inventory: InventoryView[];
  roles: ReturnType<typeof roleRows>;
  levers: Lever[];
  /** Inputs for a local what-if: the same engine on these plus overlay events. */
  seed: Seed;
  events: OpEvent[];
  now: string;
}

const DAY_MS = 86_400_000;
export const daysLeft = (nowIso: string, deadline: string) => Math.ceil((Date.parse(deadline) - Date.parse(nowIso)) / DAY_MS);
export const fullDate = (iso: string) => `${dayLabel(iso)} ${new Date(iso).getUTCFullYear()}`;

/**
 * Why this viewer cannot approve, if they cannot (section 4 permission rules, mirrored from the API).
 * Like the server, the HQ-only rule applies to the option chosen: a Station Leader may approve a
 * station-level option (conserve) of a decision that also offers an HQ-only one (evacuate). Without
 * an option (the queue card), any HQ-only option is flagged, as before.
 */
export function approveReason(decision: DecisionView, role: string, nodeId: string, optionLevers?: string[]): string | undefined {
  if (role === "FIELD_LEAD") return "Field Leads cannot approve decisions";
  if (role === "STATION_LEADER") {
    if (decision.node_id !== nodeId) return `Only ${nodeLabel(decision.node_id)}'s Station Leader or HQ Ops can approve`;
    const hqOnly = (levers: string[]) => levers.some((l) => LEVER_ACTIONS[l]?.hqOnly ?? true);
    if (optionLevers) return hqOnly(optionLevers) ? "Only HQ Ops can approve decisions touching vessels" : undefined;
    if (decision.options.some((o) => hqOnly(o.levers))) return "Only HQ Ops can approve decisions touching vessels";
  }
  return undefined;
}

const DIM_NAME: Record<string, string> = { FUEL: "Fuel", FOOD: "Food", MEDICAL: "Medical", POWER: "Spares & power", PERSONNEL: "Personnel", COMMS: "Comms" };

/** Risks from the engine: dimensions off GREEN, missions not OK, inputs gone STALE, open conflicts. */
function risksOf(evaluation: Evaluation, conflicts: ConflictView[], now: string): LiveOps["risks"] {
  const out: LiveOps["risks"] = [];
  for (const st of evaluation.stations) {
    const station = nodeLabel(st.nodeId);
    for (const d of st.dimensions) {
      if (d.state !== "GREEN") out.push({ text: `${station} ${DIM_NAME[d.key] ?? d.key} ${d.ratio !== null ? d.ratio.toFixed(4) + " " : ""}${d.state}`, state: d.state });
      if (d.freshness === "STALE" || d.freshness === "CRITICAL") out.push({ text: `${station} ${DIM_NAME[d.key] ?? d.key} count ${d.freshness}`, state: "AMBER", age: d.observedAt ? formatAge(d.observedAt, now) : undefined });
      if (d.confidence?.straddles) out.push({ text: `${station} ${DIM_NAME[d.key] ?? d.key}: ${d.confidence.text}`, state: "AMBER" });
    }
    for (const m of st.missions ?? []) if (m.status === "AT_RISK" || m.status === "BLOCKED") out.push({ text: `${m.missionId} ${m.status.replace("_", " ")}: ${m.why}`, state: m.status === "BLOCKED" ? "RED" : "AMBER" });
  }
  for (const c of conflicts) out.push({ text: `Conflict on ${c.entity_id} ${c.field}: kept ${String(c.conservative_value)}`, state: "AMBER" });
  const rank = { RED: 0, AMBER: 1, GREEN: 2, INFO: 3 } as const;
  return out.sort((a, b) => rank[a.state] - rank[b.state]);
}

/**
 * `focusNode` lets HQ Ops look at another station; it is ignored for station roles, who always see
 * the station in their token.
 */
export function useLiveOps(focusNode?: string): LiveOps | null {
  const device = useDevice();
  const snap = device?.snapshot;
  return React.useMemo(() => {
    if (!device || !snap) return null;
    const { identity } = device.session;
    const { now } = snap;
    // Events the server refused on sync are not facts: leave them out of every view.
    const events = snap.rejected.size ? snap.events.filter((e) => !snap.rejected.has(e.event_id)) : snap.events;

    const decisions = decisionsView(events);
    const openDecisions = decisions.filter((d) => d.status === "PROPOSED");
    const conflicts = conflictsView(events);
    const openConflicts = conflicts.filter((c) => c.status === "OPEN");
    const openIncidents = incidentsView(events).filter((i) => i.open);

    // Shipments HQ created (SHIPMENT_CREATED) join the seed's, so every view that lists shipments,
    // legs or cargo lines sees them without a second model.
    const seed = withCreatedShipments(snap.seed ?? season48, events);
    const realEvaluation = evaluate({ seed, events }, now);
    const evaluated = (n: string | undefined) => !!n && realEvaluation.stations.some((s) => s.nodeId === n);
    const focus = evaluated(identity.node_id)
      ? identity.node_id
      : identity.role === "HQ_OPS" && evaluated(focusNode) ? focusNode! : NODES.MAITRI;
    // A scenario with its own season (marion2026) names its relief vessel's current ETA in the slip line.
    const resupplyAt = seed.season ? seasonAt(seed, events, now).resupplyAt : undefined;
    const adapted = adaptLiveEvaluation(realEvaluation, seed, now, focus, resupplyAt && `${formatDate(resupplyAt)} ${new Date(resupplyAt).getUTCFullYear()}`);
    const focusEval = realEvaluation.stations.find((s) => s.nodeId === focus);
    const reduced = reduce(seed, events);
    const v = seed.vessels[0] ? reduced.vessels.get(seed.vessels[0].id) : undefined;
    const vessel = v && { name: seed.vessels[0]!.name, loadCutoff: dayLabel(v.loadCutoff), departs: dayLabel(v.departure), eta: dayLabel(v.etaStation), closing: dayLabel(v.stationClosingDate) };
    const vesselWindow = v && { name: seed.vessels[0]!.name, loadCutoff: v.loadCutoff, departure: v.departure, etaStation: v.etaStation, closing: v.stationClosingDate };

    // The queue shows decisions that were really proposed (DECISION_PROPOSED events, options from
    // the engine on the server). Nothing is invented here: an unproposed decision could not be approved.
    const queue: QueueItem[] = openDecisions.map((d) => {
      const st = adapted.stations.find((s) => s.nodeId === d.node_id) ?? adapted.maitriStation;
      const fuel = st.dimensions.find((dim) => dim.key === "FUEL");
      const current = {
        state: fuel?.state ?? st.state,
        ratio: fuel?.ratio ?? 0,
      };
      // Best case: the best recorded option that reaches the target, else the live engine's first.
      const recorded = d.options.filter((o) => o.reachesTarget !== false && o.ratio !== undefined && o.state).sort((a, b) => b.ratio! - a.ratio!)[0];
      const best = recorded
        ? { state: recorded.state!, ratio: Math.round(recorded.ratio! * 10000) / 10000 }
        : adapted.options[0]
          ? { state: adapted.options[0].resultingState, ratio: adapted.options[0].resultingRatio }
          : current;

      return {
        id: d.id,
        title: `${nodeLabel(d.node_id)} fuel ${current.state === "GREEN" ? "decision" : "below required threshold"}`,
        station: nodeLabel(d.node_id),
        deadline: d.pnr ? dayLabel(d.pnr) : "no deadline",
        daysLeft: d.pnr ? daysLeft(now, d.pnr) : 0,
        current,
        best,
        straddle: fuel?.straddleText,
        approveReason: approveReason(d, identity.role, identity.node_id),
      };
    });

    const firstPnr = openDecisions.map((d) => d.pnr).filter((p): p is string => !!p).sort()[0];

    const incident = openIncidents[0];
    let incidentStrip: string | undefined;
    if (incident) {
      const position = incident.team_id ? lastCheckIn(events, incident.team_id) : null;
      const age = ageHours(now, incident.last_confirmed_at);
      const radius = uncertaintyRadiusKm(age);
      // Only incidents about people or a team have a position to be uncertain about.
      const tracked = !!incident.team_id || incident.person_ids.length > 0;
      incidentStrip = tracked
        ? [
            `${incident.id} · ${incident.team_id ?? incident.person_ids.join(", ")} ${incidentTypeLabel(incident.type)}`,
            `last confirmed ${formatAgo(incident.last_confirmed_at, now)}${position ? ` at ${coords(position.lat, position.lon)}` : ""}`,
            radius !== null ? `circle ${Math.round(radius)} km` : "position fresh",
          ].join(" · ")
        : `${incident.id} · ${incidentTypeLabel(incident.type)} at ${nodeLabel(incident.node_id)} · opened ${formatAgo(incident.opened_at, now)}`;
    }

    const rows = timeline(events).map((e) => ({
      deviceSeq: `${e.device_id} · ${e.seq}`,
      device: e.device_id,
      seq: e.seq,
      type: e.type,
      entity: e.entity_id,
      node: e.node_id,
      actor: e.actor_role,
      observedAt: e.observed_at,
      recordedAtServer: e.recorded_at_server,
      // Server-written and local-only events are not queued, so they carry no tier (SYS).
      tier: e.actor_role === "SYSTEM" || EVENT_RULES[e.type].localOnly ? null : (e.priority as Tier),
      summary: describeEvent(e),
      pending: snap.pendingIds.has(e.event_id),
      age: formatAge(e.observed_at, now),
    }));

    const milestones = legMilestones({ seed, events }, now);
    const exceptions = forViewer(
      exceptionsOf({ evaluation: realEvaluation, milestones, decisions, conflicts, incidents: openIncidents, refused: snap.rejected.size, now }),
      identity.role, identity.node_id,
    );

    return {
      decisions: queue,
      openDecisions,
      openConflicts,
      openIncidents,
      emergency: !!incident && identity.role !== "FIELD_LEAD",
      incidentStrip,
      pnr: adapted.pnr ?? (firstPnr ? { date: fullDate(firstPnr), daysLeft: daysLeft(now, firstPnr) } : undefined),
      timeline: rows,
      evaluation: realEvaluation,
      stations: adapted.stations,
      maitriStation: adapted.maitriStation,
      focusEval,
      options: adapted.options,
      traceSteps: adapted.traceSteps,
      risks: risksOf(realEvaluation, openConflicts, now),
      milestones,
      exceptions,
      vessel,
      vesselWindow,
      incident: incident && {
        id: incident.id,
        title: `${incident.id}: ${incident.team_id ?? (incident.person_ids.join(", ") || nodeLabel(incident.node_id))} ${incidentTypeLabel(incident.type)}`,
        lastConfirmedAt: incident.last_confirmed_at,
      },
      inventory: inventoryRows(focusEval, seed, now),
      roles: roleRows(focusEval, seed),
      levers: leverViews(focusEval, now),
      seed,
      events,
      now,
    };
  }, [device, snap, focusNode]);
}
