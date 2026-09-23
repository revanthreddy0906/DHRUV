import type { ActorRole, EventType } from "@dhruv/shared";
import { DEVICES, IDS, NODES } from "./ids.js";

/**
 * Scenario Director script (Build Bible section 13) with v2 amendments:
 * C5 beat 6 is an absolute jump to 25 Jan 16:00; C6 beat 4 adds a diesel count at 09:15.
 *
 * Where a beat runs matters for the offline story:
 * - "server": HQ-side facts, injected via POST /admin/director/:beat.
 * - "client": must be written on the named device's local store (e.g. Maitri while offline),
 *   so HQ only sees them after sync. The Director panel runs these locally.
 * - "emergent": no events; happens by itself (beat 10, conflict flagged on sync).
 */
export interface BeatEvent {
  device_id: string;
  actor_role: ActorRole;
  node_id: string;
  type: EventType;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
  observed_at: string;
  priority?: number;
}

export interface DirectorBeat {
  beat: string;
  label: string;
  where: "server" | "client" | "emergent";
  events: BeatEvent[];
  /** Absolute demo-clock jump applied on every open device (v2 C5). */
  clockJump?: string;
  /** For DECISION_PROPOSED: resolve trigger_event_id to the latest event of this type and entity. */
  resolveTrigger?: { type: EventType; entity_id: string };
  /** Pause between the beat's events so the audience sees each state (beat 9's degraded drain). */
  stepDelayMs?: number;
  /** Server-side fallback for the human approval beat. */
  approve?: { decision_id: string; chosen_option_id: string; verify_ack: boolean; observed_at: string };
}

const at = (day: number, hhmm: string) => `2027-01-${String(day).padStart(2, "0")}T${hhmm}:00.000Z`;

export const DIRECTOR_BEATS: DirectorBeat[] = [
  {
    beat: "1",
    label: "Slip: C-104 feeder leg delayed to 7 Feb",
    where: "server",
    events: [
      {
        device_id: DEVICES.DIRECTOR,
        actor_role: "HQ_OPS",
        node_id: NODES.HQ,
        type: "LEG_DELAYED",
        entity_type: "leg",
        entity_id: IDS.legC104Feeder,
        payload: { leg_id: IDS.legC104Feeder, new_eta: "2027-02-07T00:00:00.000Z", reason: "feeder vessel delayed" },
        observed_at: at(24, "08:10"),
      },
    ],
  },
  {
    beat: "2",
    label: "Decision proposed: DEC-01",
    where: "server",
    resolveTrigger: { type: "LEG_DELAYED", entity_id: IDS.legC104Feeder },
    events: [
      {
        device_id: DEVICES.DIRECTOR,
        actor_role: "SYSTEM",
        node_id: NODES.MAITRI,
        type: "DECISION_PROPOSED",
        entity_type: "decision",
        entity_id: IDS.decision1,
        payload: {
          decision_id: IDS.decision1,
          trigger_event_id: "",
          // TODO(A): options 2 and 3 (and ratios, slack, traces) come from the engine's R09/R10 output.
          options: [{ id: "OPT-1", levers: ["HOLD_VESSEL"], deadline: "2027-02-03T00:00:00.000Z", requiresVerify: [] }],
          trace: [],
        },
        observed_at: at(24, "08:11"),
      },
    ],
  },
  {
    beat: "3",
    label: "Link lost at Maitri",
    where: "client",
    events: [
      {
        device_id: DEVICES.MAITRI_TAB,
        actor_role: "SYSTEM",
        node_id: NODES.MAITRI,
        type: "LINK_STATE_SET",
        entity_type: "node",
        entity_id: NODES.MAITRI,
        payload: { node_id: NODES.MAITRI, status: "OFFLINE" },
        observed_at: at(24, "09:00"),
      },
    ],
  },
  {
    beat: "4",
    label: "Offline entries at Maitri",
    where: "client",
    events: [
      {
        device_id: DEVICES.MAITRI_TAB,
        actor_role: "STATION_LEADER",
        node_id: NODES.MAITRI,
        type: "STOCK_ISSUED",
        entity_type: "inventory_item",
        entity_id: IDS.medKitsMaitri,
        payload: { item_id: IDS.medKitsMaitri, qty: 1, reason: "medical kit issue" },
        observed_at: at(24, "09:10"),
      },
      {
        device_id: DEVICES.MAITRI_TAB,
        actor_role: "STATION_LEADER",
        node_id: NODES.MAITRI,
        type: "ASSET_STATUS_SET",
        entity_type: "asset",
        entity_id: IDS.skidoo2,
        payload: { asset_id: IDS.skidoo2, status: "DOWN", note: "track fault" },
        observed_at: at(24, "09:20"),
      },
      {
        device_id: DEVICES.MAITRI_TAB,
        actor_role: "STATION_LEADER",
        node_id: NODES.MAITRI,
        type: "MISSION_UPDATED",
        entity_type: "mission",
        entity_id: IDS.missionF27,
        payload: { mission_id: IDS.missionF27, fields: { note: "SK-2 unavailable, reassess traverse support" } },
        observed_at: at(24, "09:30"),
      },
      {
        // v2 C6. The golden numbers (6 h 45 min at 25 Jan 16:00; 7 h at 16:20) need 25 Jan 09:15,
        // although the beat itself runs on 24 Jan. TODO(A/E): confirm the date.
        device_id: DEVICES.MAITRI_TAB,
        actor_role: "STATION_LEADER",
        node_id: NODES.MAITRI,
        type: "STOCK_COUNTED",
        entity_type: "inventory_item",
        entity_id: IDS.dieselMaitri,
        payload: { item_id: IDS.dieselMaitri, qty: 92.0 },
        observed_at: at(25, "09:15"),
      },
    ],
  },
  {
    beat: "5",
    label: "HQ side edit: SK-2 OK (stale maintenance plan)",
    where: "server",
    events: [
      {
        device_id: DEVICES.DIRECTOR,
        actor_role: "HQ_OPS",
        node_id: NODES.MAITRI,
        type: "ASSET_STATUS_SET",
        entity_type: "asset",
        entity_id: IDS.skidoo2,
        payload: { asset_id: IDS.skidoo2, status: "OK", note: "stale maintenance plan" },
        observed_at: at(24, "11:00"),
      },
    ],
  },
  { beat: "6", label: "Jump to 25 Jan 16:00", where: "client", events: [], clockJump: at(25, "16:00") },
  {
    beat: "7",
    label: "FT-3 check-in (relayed to the station)",
    where: "client",
    // The team's own tablet records it, and the station records the same check-in relayed by
    // radio (the Bible's role table lets a Station Leader record check-ins). Maitri's satellite
    // link is down, so without the relay the offline station would have no position for the
    // 1:40-1:50 incident beat (circle, nearest assets). Both copies are class A facts and merge.
    events: [
      {
        device_id: DEVICES.FT3_TAB,
        actor_role: "FIELD_LEAD",
        node_id: NODES.MAITRI,
        type: "CHECKIN_RECORDED",
        entity_type: "team",
        entity_id: IDS.fieldTeam3,
        payload: { person_or_team_id: IDS.fieldTeam3, lat: -70.62, lon: 12.1 },
        observed_at: at(25, "07:00"),
      },
      {
        device_id: DEVICES.MAITRI_TAB,
        actor_role: "STATION_LEADER",
        node_id: NODES.MAITRI,
        type: "CHECKIN_RECORDED",
        entity_type: "team",
        entity_id: IDS.fieldTeam3,
        payload: { person_or_team_id: IDS.fieldTeam3, lat: -70.62, lon: 12.1, note: "relayed by radio to the station" },
        observed_at: at(25, "07:00"),
      },
    ],
  },
  {
    beat: "8",
    label: "Incident INC-01 opened for FT-3",
    where: "client",
    events: [
      {
        device_id: DEVICES.MAITRI_TAB,
        actor_role: "STATION_LEADER",
        node_id: NODES.MAITRI,
        type: "INCIDENT_OPENED",
        entity_type: "incident",
        entity_id: IDS.incident1,
        payload: {
          incident_id: IDS.incident1,
          type: "OVERDUE_CHECKIN",
          person_ids: [IDS.personVerma, IDS.personNair],
          team_id: IDS.fieldTeam3,
          last_confirmed_at: at(25, "07:00"),
          note: "FT-3 overdue",
        },
        observed_at: at(25, "16:00"),
      },
    ],
  },
  {
    beat: "9",
    label: "Link returns at Maitri (Degraded, then Online)",
    where: "client",
    stepDelayMs: 5000,
    events: [
      {
        device_id: DEVICES.MAITRI_TAB,
        actor_role: "SYSTEM",
        node_id: NODES.MAITRI,
        type: "LINK_STATE_SET",
        entity_type: "node",
        entity_id: NODES.MAITRI,
        payload: { node_id: NODES.MAITRI, status: "DEGRADED" },
        observed_at: at(25, "16:10"),
      },
      {
        device_id: DEVICES.MAITRI_TAB,
        actor_role: "SYSTEM",
        node_id: NODES.MAITRI,
        type: "LINK_STATE_SET",
        entity_type: "node",
        entity_id: NODES.MAITRI,
        payload: { node_id: NODES.MAITRI, status: "ONLINE" },
        observed_at: at(25, "16:11"),
      },
    ],
  },
  { beat: "10", label: "Conflict flagged on sync (SK-2, DOWN kept)", where: "emergent", events: [] },
  {
    beat: "11",
    label: "HQ approves option 1 (HOLD_VESSEL)",
    where: "server",
    events: [],
    approve: { decision_id: IDS.decision1, chosen_option_id: "OPT-1", verify_ack: true, observed_at: at(25, "16:20") },
  },
];

export function findBeat(beat: string): DirectorBeat | undefined {
  return DIRECTOR_BEATS.find((b) => b.beat === beat);
}
