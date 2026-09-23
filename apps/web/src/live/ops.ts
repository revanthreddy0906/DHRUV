import * as React from "react";
import { EVENT_RULES } from "@dhruv/shared";
import { LEVER_ACTIONS, NODES } from "@dhruv/seed";
import { ageHours, uncertaintyRadiusKm } from "@dhruv/map";
import { conflictsView, decisionsView, incidentsView, lastCheckIn, timeline, type ConflictView, type DecisionView, type IncidentView } from "@dhruv/store";
import type { QueueItem } from "../components/decisions";
import { MOMENTS, type MomentId } from "../data/demo";
import type { OpEventRow, Tier } from "../data/types";
import { useDevice } from "./DeviceProvider";
import { nodeLabel } from "./chrome";
import { coords, dayLabel, describeEvent, incidentTypeLabel } from "./describe";
import { formatAge } from "./format";

/**
 * Operational records for this device, from the events it holds (F2): open decisions with their
 * windows, conflicts, incidents, the timeline. Viewer-relative: HQ sees Maitri's offline entries
 * only after they sync.
 *
 * Readiness (station cards, ratios, bands, traces, each decision's current and best-case state) is
 * the engine's. Until A's evaluate() lands, those panels keep the design fixtures, and `mockMoment`
 * picks the fixture that matches where the live event log is in the demo.
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
  mockMoment: MomentId;
}

const DAY_MS = 86_400_000;
export const daysLeft = (nowIso: string, deadline: string) => Math.ceil((Date.parse(deadline) - Date.parse(nowIso)) / DAY_MS);
export const fullDate = (iso: string) => `${dayLabel(iso)} ${new Date(iso).getUTCFullYear()}`;

/** Why this viewer cannot approve, if they cannot (section 4 permission rules, mirrored from the API). */
export function approveReason(decision: DecisionView, role: string, nodeId: string): string | undefined {
  if (role === "FIELD_LEAD") return "Field Leads cannot approve decisions";
  if (role === "STATION_LEADER") {
    if (decision.options.some((o) => o.levers.some((l) => LEVER_ACTIONS[l]?.hqOnly))) return "Only HQ Ops can approve decisions touching vessels";
    if (decision.node_id !== nodeId) return `Only ${nodeLabel(decision.node_id)}'s Station Leader or HQ Ops can approve`;
  }
  return undefined;
}

/** The design fixture closest to the live demo state, for the engine-driven panels only. */
function pickMockMoment(args: { now: string; slipped: boolean; approved: boolean; conflictFlagged: boolean; maitriViewer: boolean; incidentOpen: boolean }): MomentId {
  const t = Date.parse(args.now);
  if (!args.slipped) return "start";
  if (args.approved) return t >= Date.parse("2027-01-26T09:00:00.000Z") ? "hq-2600900" : "hq-2501620";
  if (args.maitriViewer && args.incidentOpen) return "maitri-2501600";
  if (t >= Date.parse("2027-01-25T16:00:00.000Z")) return args.conflictFlagged ? "hq-2501610" : "hq-2501600";
  return "slip";
}

export function useLiveOps(): LiveOps | null {
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

    const mockMoment = pickMockMoment({
      now,
      slipped: events.some((e) => e.type === "LEG_DELAYED"),
      approved: decisions.some((d) => d.status === "APPROVED"),
      conflictFlagged: conflicts.length > 0,
      maitriViewer: identity.node_id === NODES.MAITRI,
      incidentOpen: openIncidents.length > 0,
    });
    // Engine stand-in: current and best-case state per decision from the fixtures.
    const mockFor = (id: string) => MOMENTS[mockMoment].decisions.find((d) => d.id === id) ?? MOMENTS.slip.decisions.find((d) => d.id === id);

    const queue: QueueItem[] = openDecisions.map((d) => {
      const mock = mockFor(d.id);
      return {
        id: d.id,
        title: mock?.title ?? `Decision ${d.id}`,
        station: nodeLabel(d.node_id),
        deadline: d.pnr ? dayLabel(d.pnr) : "no deadline",
        daysLeft: d.pnr ? daysLeft(now, d.pnr) : 0,
        current: mock?.current ?? { state: "AMBER", ratio: 0 },
        best: mock?.best ?? { state: "AMBER", ratio: 0 },
        straddle: mock?.straddle,
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
      incidentStrip = [
        `${incident.id} · ${incident.team_id ?? incident.person_ids.join(", ")} ${incidentTypeLabel(incident.type)}`,
        `last confirmed ${formatAge(incident.last_confirmed_at, now)} ago${position ? ` at ${coords(position.lat, position.lon)}` : ""}`,
        radius !== null ? `circle ${Math.round(radius)} km` : "position fresh",
      ].join(" · ");
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

    return {
      decisions: queue,
      openDecisions,
      openConflicts,
      openIncidents,
      emergency: !!incident && identity.role !== "FIELD_LEAD",
      incidentStrip,
      pnr: firstPnr ? { date: fullDate(firstPnr), daysLeft: daysLeft(now, firstPnr) } : undefined,
      timeline: rows,
      mockMoment,
    };
  }, [device, snap]);
}
