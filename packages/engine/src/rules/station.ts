import { config, detectConflicts, type OpEvent, type PayloadOf } from "@dhruv/shared";
import { worstOf } from "./availability.js";
import type { MissionImpactResult } from "./mission.js";

export interface GateBanner {
  type: "OPEN_INCIDENT" | "SAFETY_CONFLICT" | "BLOCKED_MISSION";
  id: string;
  message: string;
  blocking: boolean;
  trace: string;
}

export interface DimensionStateInput {
  key: string;
  state: "GREEN" | "AMBER" | "RED";
}

export interface StationStateResult {
  state: "GREEN" | "AMBER" | "RED";
  gates: GateBanner[];
  blocked: boolean;
  trace: string[];
}

interface IncidentTracker {
  id: string;
  nodeId: string;
  status: string;
}

/**
 * R15: Station State and Gates.
 * Spec §7 line 293 / line 51:
 * "Station state = worst dimension; open incident or unresolved safety conflict adds a gate banner."
 * Pure and deterministic.
 */
export function computeStationState(
  dimensions: DimensionStateInput[],
  events: OpEvent[],
  missions?: MissionImpactResult[],
  nodeId?: string,
): StationStateResult {
  const dimensionStates = dimensions.map((d) => d.state);
  const state = dimensionStates.length > 0 ? worstOf(dimensionStates) : "GREEN";

  const gates: GateBanner[] = [];
  const trace: string[] = [];

  // 1. Scan for open incidents
  const incidentMap = new Map<string, IncidentTracker>();
  for (const event of events) {
    if (event.type === "INCIDENT_OPENED") {
      const p = event.payload as PayloadOf<"INCIDENT_OPENED">;
      incidentMap.set(p.incident_id, {
        id: p.incident_id,
        nodeId: event.node_id,
        status: "OPEN",
      });
    } else if (event.type === "INCIDENT_UPDATED") {
      const p = event.payload as PayloadOf<"INCIDENT_UPDATED">;
      const existing = incidentMap.get(p.incident_id);
      if (existing) {
        existing.status = p.status;
      } else {
        incidentMap.set(p.incident_id, {
          id: p.incident_id,
          nodeId: event.node_id,
          status: p.status,
        });
      }
    }
  }

  const closedStatuses = config.conflicts.closedIncidentStatuses as readonly string[];
  for (const inc of incidentMap.values()) {
    if (nodeId && inc.nodeId && inc.nodeId !== nodeId && inc.nodeId !== "HQ") {
      continue;
    }
    if (!closedStatuses.includes(inc.status)) {
      const gateTrace = `[R15] Gate: Open incident ${inc.id} (${inc.status}) adds gate banner`;
      gates.push({
        type: "OPEN_INCIDENT",
        id: inc.id,
        message: `Open incident ${inc.id} active (${inc.status})`,
        blocking: true,
        trace: gateTrace,
      });
      trace.push(gateTrace);
    }
  }

  // 2. Scan for unresolved safety-critical conflicts
  const conflicts = detectConflicts(events, events);
  for (const c of conflicts) {
    if (c.kind === "SAFETY_CRITICAL") {
      const gateTrace = `[R15] Gate: Unresolved safety-critical conflict on ${c.entity_type} ${c.entity_id} (${c.field}) adds gate banner`;
      gates.push({
        type: "SAFETY_CONFLICT",
        id: c.entity_id,
        message: `Unresolved safety conflict on ${c.entity_type} ${c.entity_id} (${c.field})`,
        blocking: true,
        trace: gateTrace,
      });
      trace.push(gateTrace);
    }
  }

  // 3. Scan for blocked missions
  if (missions) {
    for (const m of missions) {
      if (m.status === "BLOCKED") {
        const gateTrace = `[R15] Gate: Mission ${m.missionId} is BLOCKED (${m.why})`;
        gates.push({
          type: "BLOCKED_MISSION",
          id: m.missionId,
          message: `Mission ${m.missionId} is BLOCKED: ${m.why}`,
          blocking: false,
          trace: gateTrace,
        });
        trace.push(gateTrace);
      }
    }
  }

  const blocked = gates.some((g) => g.blocking);

  const summaryTrace = `[R15] Station readiness: dimensions [${dimensions
    .map((d) => `${d.key}=${d.state}`)
    .join(", ")}] -> ${state}${gates.length > 0 ? ` (${gates.length} active gates, blocked=${blocked})` : ""}`;
  trace.unshift(summaryTrace);

  return {
    state,
    gates,
    blocked,
    trace,
  };
}
