import type { EventType } from "@dhruv/shared";
import { IDS, NODES } from "./ids.js";

export interface FollowUp {
  type: EventType;
  entity_type: string;
  entity_id: string;
  node_id: string;
  payload: Record<string, unknown>;
}

export interface LeverAction {
  /** Section 4: only HQ Ops can approve decisions touching shipments, vessels or cross-station allocation. */
  hqOnly: boolean;
  followUps: FollowUp[];
}

/**
 * Domain events emitted by the server when an option using a lever is approved (section 15).
 * The engine also folds every approved option's levers into the requirement and availability
 * (it reads them from DECISION_PROPOSED + DECISION_APPROVED), so CONSERVE and AIRLIFT_PARTIAL
 * need no domain event; DEFER_F27 records the mission as deferred for the Missions screen.
 */
export const LEVER_ACTIONS: Record<string, LeverAction> = {
  HOLD_VESSEL: {
    hqOnly: true,
    followUps: [
      {
        type: "VESSEL_UPDATED",
        entity_type: "vessel",
        entity_id: IDS.vessel,
        node_id: NODES.HQ,
        payload: { vessel_id: IDS.vessel, departure: "2027-02-09T00:00:00.000Z", load_cutoff: "2027-02-07T00:00:00.000Z", eta_station: "2027-02-27T00:00:00.000Z" },
      },
      {
        type: "LEG_UPDATED",
        entity_type: "leg",
        entity_id: IDS.legC104Vessel,
        node_id: NODES.HQ,
        payload: { leg_id: IDS.legC104Vessel, eta: "2027-02-27T00:00:00.000Z", status: "PLANNED" },
      },
    ],
  },
  AIRLIFT_PARTIAL: { hqOnly: true, followUps: [] },
  DEFER_F27: {
    hqOnly: false,
    followUps: [
      {
        type: "MISSION_UPDATED",
        entity_type: "mission",
        entity_id: IDS.missionF27,
        node_id: NODES.MAITRI,
        payload: { mission_id: IDS.missionF27, fields: { status: "DEFERRED" } },
      },
    ],
  },
  CONSERVE: { hqOnly: false, followUps: [] },
};
