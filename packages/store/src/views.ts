import { config, EVENT_RULES, type OpEvent, type PayloadOf } from "@dhruv/shared";

/**
 * Read-side views over the events this device holds (sections 6 and 14): decisions, conflicts,
 * incidents and the timeline. Pure functions of the event list, in reduce order
 * (observed_at, device_id, seq), so every replica with the same events shows the same thing.
 * They describe records, not readiness: ratios, states and traces are the engine's.
 */

export function reduceOrder(a: OpEvent, b: OpEvent): number {
  return a.observed_at.localeCompare(b.observed_at) || a.device_id.localeCompare(b.device_id) || a.seq - b.seq;
}

const sorted = (events: OpEvent[]) => [...events].sort(reduceOrder);
const ofType = <T extends OpEvent["type"]>(events: OpEvent[], type: T) => sorted(events).filter((e) => e.type === type) as (OpEvent & { payload: PayloadOf<T> })[];

export interface DecisionOptionView {
  id: string;
  levers: string[];
  deadline?: string;
  requiresVerify: string[];
}

export interface DecisionView {
  id: string;
  node_id: string;
  proposed_at: string;
  trigger_event_id: string;
  options: DecisionOptionView[];
  status: "PROPOSED" | "APPROVED" | "REJECTED";
  chosen_option_id?: string;
  decided_at?: string;
  /** The approving device (payload.approver; online approvals are stored under SERVER), else the writer. */
  decided_by?: string;
  /** The event that decided it, so a device can tell whether it is still in its outbox. */
  decided_event_id?: string;
  /** R11 as proposed: the latest option deadline, or null when no option carries one. */
  pnr: string | null;
}

function optionView(raw: Record<string, unknown>, index: number): DecisionOptionView {
  return {
    id: typeof raw.id === "string" ? raw.id : `OPT-${index + 1}`,
    levers: Array.isArray(raw.levers) ? raw.levers.filter((l): l is string => typeof l === "string") : [],
    deadline: typeof raw.deadline === "string" ? raw.deadline : undefined,
    requiresVerify: Array.isArray(raw.requiresVerify) ? raw.requiresVerify.filter((v): v is string => typeof v === "string") : [],
  };
}

/** Every decision this device knows, first proposal wins (as on the server), with its outcome. */
export function decisionsView(events: OpEvent[]): DecisionView[] {
  const byId = new Map<string, DecisionView>();
  for (const e of ofType(events, "DECISION_PROPOSED")) {
    if (byId.has(e.payload.decision_id)) continue;
    const options = e.payload.options.map(optionView);
    const deadlines = options.map((o) => o.deadline).filter((d): d is string => !!d).sort();
    byId.set(e.payload.decision_id, {
      id: e.payload.decision_id,
      node_id: e.node_id,
      proposed_at: e.observed_at,
      trigger_event_id: e.payload.trigger_event_id,
      options,
      status: "PROPOSED",
      pnr: deadlines.at(-1) ?? null,
    });
  }
  for (const e of sorted(events)) {
    if (e.type !== "DECISION_APPROVED" && e.type !== "DECISION_REJECTED") continue;
    const decision = byId.get((e.payload as { decision_id: string }).decision_id);
    if (!decision || decision.status !== "PROPOSED") continue;
    decision.status = e.type === "DECISION_APPROVED" ? "APPROVED" : "REJECTED";
    decision.decided_at = e.observed_at;
    decision.decided_by = e.device_id;
    decision.decided_event_id = e.event_id;
    if (e.type === "DECISION_APPROVED") {
      const p = e.payload as PayloadOf<"DECISION_APPROVED">;
      decision.chosen_option_id = p.chosen_option_id;
      decision.decided_by = p.approver;
    }
  }
  return [...byId.values()];
}

export interface ConflictView {
  id: string;
  entity_type: string;
  entity_id: string;
  field: string;
  node_id: string;
  contenders: PayloadOf<"CONFLICT_FLAGGED">["contenders"];
  conservative_value: unknown;
  flagged_at: string;
  status: "OPEN" | "RESOLVED";
  resolved_value?: unknown;
  resolver?: string;
}

/**
 * Conflicts flagged by the server; a CONFLICT_RESOLVED closes the latest flag with that id.
 * Flags are read first: a resolution recorded at the same demo time by a device that sorts
 * earlier must still find its flag.
 */
export function conflictsView(events: OpEvent[]): ConflictView[] {
  const byId = new Map<string, ConflictView>();
  const ordered = sorted(events);
  for (const e of ordered) {
    if (e.type === "CONFLICT_FLAGGED") {
      const p = e.payload as PayloadOf<"CONFLICT_FLAGGED">;
      byId.set(p.conflict_id, {
        id: p.conflict_id,
        entity_type: p.entity_type,
        entity_id: p.entity_id,
        field: p.field,
        node_id: e.node_id,
        contenders: p.contenders,
        conservative_value: p.conservative_value,
        flagged_at: e.observed_at,
        status: "OPEN",
      });
    }
  }
  for (const e of ordered) {
    if (e.type === "CONFLICT_RESOLVED") {
      const p = e.payload as PayloadOf<"CONFLICT_RESOLVED">;
      const c = byId.get(p.conflict_id);
      if (c) Object.assign(c, { status: "RESOLVED", resolved_value: p.chosen_value, resolver: p.resolver });
    }
  }
  return [...byId.values()];
}

export interface IncidentView {
  id: string;
  type: string;
  node_id: string;
  status: string;
  open: boolean;
  opened_at: string;
  opened_by: string;
  person_ids: string[];
  team_id?: string;
  last_confirmed_at: string;
}

/**
 * Incidents with their latest status; open until a status in the closed list (section 6).
 * Openings are read first, like proposals: an update written at the same demo time as the opening
 * (HQ escalating at 16:00 an incident Maitri opened at 16:00) sorts before it by device id and
 * must not be dropped.
 */
export function incidentsView(events: OpEvent[]): IncidentView[] {
  const byId = new Map<string, IncidentView>();
  const ordered = sorted(events);
  for (const e of ordered) {
    if (e.type === "INCIDENT_OPENED") {
      const p = e.payload as PayloadOf<"INCIDENT_OPENED">;
      if (byId.has(p.incident_id)) continue;
      byId.set(p.incident_id, {
        id: p.incident_id,
        type: p.type,
        node_id: e.node_id,
        status: "OPEN",
        open: true,
        opened_at: e.observed_at,
        opened_by: e.device_id,
        person_ids: p.person_ids,
        team_id: p.team_id,
        last_confirmed_at: p.last_confirmed_at,
      });
    }
  }
  for (const e of ordered) {
    if (e.type === "INCIDENT_UPDATED") {
      const p = e.payload as PayloadOf<"INCIDENT_UPDATED">;
      const incident = byId.get(p.incident_id);
      if (!incident) continue;
      incident.status = p.status;
      incident.open = !(config.conflicts.closedIncidentStatuses as readonly string[]).includes(p.status);
    }
  }
  return [...byId.values()];
}

export interface CheckIn {
  lat: number;
  lon: number;
  observed_at: string;
  device_id: string;
}

/** The latest check-in for a person or team: the last confirmed position. */
export function lastCheckIn(events: OpEvent[], personOrTeamId: string): CheckIn | null {
  const e = ofType(events, "CHECKIN_RECORDED")
    .filter((c) => c.payload.person_or_team_id === personOrTeamId)
    .at(-1);
  return e ? { lat: e.payload.lat, lon: e.payload.lon, observed_at: e.observed_at, device_id: e.device_id } : null;
}

/**
 * Event timeline, newest first. The clock is left out (it is a control, not an operational
 * event); the simulated link stays, because the Bible's timeline shows it.
 */
export function timeline(events: OpEvent[], limit = 10): OpEvent[] {
  return sorted(events)
    .filter((e) => e.type !== "CLOCK_ADVANCED")
    .reverse()
    .slice(0, limit);
}

/** True for events that never leave this device (clock, link switch). */
export const isLocalOnly = (e: OpEvent) => EVENT_RULES[e.type].localOnly;
