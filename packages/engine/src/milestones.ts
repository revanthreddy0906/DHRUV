import { withCreatedShipments } from "@dhruv/shared";
import { reduce } from "./reduce.js";
import type { EngineInput } from "./index.js";

/**
 * Back-scheduled cargo milestones (the planned-vs-actual pattern of shipment-visibility and
 * transport systems, and the US Antarctic Program's "required on site" date). For every shipment,
 * work back from the date the cargo must be on station: the vessel must arrive before the station
 * closes, the feeder must reach Cape Town by the vessel's load cut-off, so it must leave Mumbai by
 * the cut-off minus its planned transit. Each milestone carries the latest allowed date, the plan,
 * what the log says now, and a state.
 */

export type MilestoneState = "DONE" | "ON_TRACK" | "AT_RISK" | "MISSED" | "UNKNOWN";

export interface Milestone {
  key: "LEAVE_ORIGIN" | "LOAD_CUTOFF" | "VESSEL_DEPARTS" | "ON_STATION";
  label: string;
  /** The latest date this can happen without breaking the next step. */
  latest?: string;
  /** The seed's plan. */
  planned?: string;
  /** What the event log says now (an ETA or ETD), when it differs from the plan or has happened. */
  current?: string;
  state: MilestoneState;
  note: string;
}

export interface ShipmentMilestones {
  shipmentId: string;
  destNodeId: string;
  milestones: Milestone[];
  /** The worst milestone state, for sorting and for the exception queue. */
  worst: MilestoneState;
}

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round(((Date.parse(b) - Date.parse(a)) / DAY) * 10) / 10;
const RANK: Record<MilestoneState, number> = { MISSED: 0, AT_RISK: 1, UNKNOWN: 2, ON_TRACK: 3, DONE: 4 };

export function legMilestones(raw: EngineInput, now: string): ShipmentMilestones[] {
  const seed = withCreatedShipments(raw.seed, raw.events);
  const state = reduce(seed, raw.events);
  const out: ShipmentMilestones[] = [];
  const place = (id: string) => seed.nodes.find((n) => n.id === id)?.name ?? id;

  for (const shipment of [...seed.shipments].sort((a, b) => a.id.localeCompare(b.id))) {
    const legs = seed.legs.filter((l) => l.shipment_id === shipment.id).sort((a, b) => a.seq - b.seq);
    const vesselLeg = legs.find((l) => l.vessel_id);
    const vessel = vesselLeg?.vessel_id ? state.vessels.get(vesselLeg.vessel_id) : undefined;
    const feeder = [...legs].reverse().find((l) => !l.vessel_id && (!vesselLeg || l.seq < vesselLeg.seq));
    const feederNow = feeder ? state.legs.get(feeder.id) : undefined;
    const milestones: Milestone[] = [];

    if (feeder && feederNow) {
      const transit = feeder.etd ? days(feeder.etd, feeder.eta) : null;
      const departed = feederNow.status === "IN_TRANSIT" || feederNow.status === "DONE" || feederNow.status === "DELAYED";
      const latestLeave = vessel && transit !== null ? new Date(Date.parse(vessel.loadCutoff) - transit * DAY).toISOString() : undefined;
      milestones.push({
        key: "LEAVE_ORIGIN",
        label: `Leave ${place(feeder.from_node)}`,
        latest: latestLeave,
        planned: feeder.etd ?? undefined,
        current: feederNow.etd ?? undefined,
        state: departed ? "DONE" : latestLeave ? (now > latestLeave ? "MISSED" : days(now, latestLeave) <= 2 ? "AT_RISK" : "ON_TRACK") : "UNKNOWN",
        note: departed ? `${feeder.id} ${feederNow.status.toLowerCase().replace("_", " ")}` : transit === null ? "planned transit unknown (no ETD in the plan)" : `${transit} d planned transit to ${place(feeder.to_node)}`,
      });

      if (vessel) {
        const slack = days(feederNow.eta, vessel.loadCutoff);
        milestones.push({
          key: "LOAD_CUTOFF",
          label: "Reach the vessel by load cut-off",
          latest: vessel.loadCutoff,
          planned: feeder.eta,
          current: feederNow.eta,
          state: feederNow.status === "DONE" ? "DONE" : slack < 0 ? "MISSED" : slack <= 2 ? "AT_RISK" : "ON_TRACK",
          note: slack < 0 ? `feeder ETA ${-slack} d after cut-off: cargo misses the vessel (R02)` : `${slack} d slack (R16)`,
        });
      } else {
        milestones.push({ key: "LOAD_CUTOFF", label: `Arrive ${place(feeder.to_node)}`, planned: feeder.eta, current: feederNow.eta, state: feederNow.status === "DONE" ? "DONE" : "UNKNOWN", note: "no vessel leg in the plan" });
      }
    }

    if (vessel && vesselLeg) {
      const vesselNow = state.legs.get(vesselLeg.id);
      milestones.push({
        key: "VESSEL_DEPARTS",
        label: "Vessel departs",
        planned: seed.vessels.find((v) => v.id === vessel.vesselId)?.departure,
        current: vessel.departure,
        state: vesselNow?.status === "IN_TRANSIT" || vesselNow?.status === "DONE" ? "DONE" : Date.parse(now) > Date.parse(vessel.departure) ? "DONE" : "ON_TRACK",
        note: "cargo must be aboard by the load cut-off",
      });
      const margin = days(vessel.etaStation, vessel.stationClosingDate);
      milestones.push({
        key: "ON_STATION",
        label: `On station at ${place(shipment.dest_node_id)}`,
        latest: vessel.stationClosingDate,
        planned: seed.vessels.find((v) => v.id === vessel.vesselId)?.eta_station,
        current: vessel.etaStation,
        state: vesselNow?.status === "DONE" ? "DONE" : margin < 0 ? "MISSED" : margin <= 2 ? "AT_RISK" : "ON_TRACK",
        note: margin < 0 ? `vessel arrives ${-margin} d after the station closes` : `${margin} d before the station closes`,
      });
    }

    const worst = milestones.reduce<MilestoneState>((w, m) => (RANK[m.state] < RANK[w] ? m.state : w), "DONE");
    out.push({ shipmentId: shipment.id, destNodeId: shipment.dest_node_id, milestones, worst });
  }
  return out;
}
