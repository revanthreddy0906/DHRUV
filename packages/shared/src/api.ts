import type { LoginRole, OpEvent } from "./events.js";

/** Build Bible section 15 (LOCKED). Base path /api/v1, JSON only. */
export const API_BASE = "/api/v1";

export const ERROR_CODES = [
  "ROLE_FORBIDDEN",
  "NODE_FORBIDDEN",
  "INVALID_EVENT",
  "DUPLICATE_SEQ_CONFLICT",
  "NOT_FOUND",
  "RATE_LIMITED",
  // Not in section 15's list; needed for login, the approval gate and the Phase-pending engine.
  "UNAUTHORIZED",
  "DECISION_NOT_PROPOSED",
  "DEADLINE_PASSED",
  "VERIFY_REQUIRED",
  "CONFLICT_OPEN",
  "NOT_IMPLEMENTED",
  "INTERNAL_ERROR",
  // The server's log was reset to Start since this device last loaded it (see `epoch`).
  "RESET_TO_START",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiError {
  error: { code: ErrorCode; message: string; details?: unknown };
}

export interface LoginRequest {
  device_id: string;
  pin: string;
  role: LoginRole;
  node_id: string;
}
export interface LoginResponse {
  token: string;
  role: LoginRole;
  node_id: string;
}

export interface PushRequest {
  device_id: string;
  events: OpEvent[];
  /**
   * The server log epoch this device loaded. A push from before a Reset to Start is refused with
   * RESET_TO_START instead of mixing the previous run's events into the new log.
   */
  epoch?: string;
}
export interface PushResponse {
  accepted: string[];
  duplicates: string[];
  rejected: { event_id: string; code: ErrorCode; message?: string }[];
  recorded_at_server: string;
}

export interface PullResponse {
  events: OpEvent[];
  cursor: number;
  /** Changes on every Reset to Start; a device holding another epoch must reload. */
  epoch?: string;
}

export interface PostEventResponse {
  event_id: string;
  recorded_at_server: string;
}

export interface ApproveRequest {
  chosen_option_id: string;
  verify_ack: boolean;
  /** Demo-clock time of the approval. The server has no demo clock (section 8), so the client supplies it. */
  observed_at?: string;
}
export interface ApproveResponse {
  event_id: string;
  follow_up_event_ids: string[];
}

export interface RejectRequest {
  reason: string;
  observed_at?: string;
}

/** POST /scenarios/run (section 11): hypothetical events evaluated by the same engine; nothing is stored. */
export interface ScenarioRequest {
  overlay: OpEvent[];
  /** Demo-clock time to evaluate at; the server has no demo clock. */
  now?: string;
}

/** Row shapes of the section 14 reference tables, returned as GET /state `seed`. */
export interface Seed {
  nodes: { id: string; name: string; type: "HQ" | "PORT" | "CITY" | "VESSEL" | "STATION"; lat: number | null; lon: number | null }[];
  vessels: { id: string; name: string; departure: string; load_cutoff: string; eta_station: string; station_closing_date: string }[];
  shipments: { id: string; name: string; priority: "CRITICAL" | "HIGH" | "NORMAL"; dest_node_id: string }[];
  legs: {
    id: string;
    shipment_id: string;
    seq: number;
    from_node: string;
    to_node: string;
    etd: string | null;
    eta: string;
    vessel_id: string | null;
    status: "PLANNED" | "IN_TRANSIT" | "DONE" | "DELAYED";
  }[];
  inventory_items: {
    id: string;
    node_id: string;
    name: string;
    category: string;
    unit: string;
    stock: number;
    /** Fraction of the requirement held in reserve: 0.1 = 10 %. */
    reserve_pct: number;
    requirement_mode: "BURN" | "FIXED";
    fixed_requirement: number | null;
    dimension: "FUEL" | "FOOD" | "MEDICAL" | "SPARES_POWER";
    last_counted: string;
    count_source: string;
  }[];
  consumption_profiles: { item_id: string; phase: "CLOSING" | "WINTER" | "MOBILISATION"; rate_per_day: number }[];
  cargo_items: { id: string; shipment_id: string; inventory_item_id: string; qty: number }[];
  personnel: { id: string; name: string; role: string; node_id: string; status: string; last_seen: string | null }[];
  assets: { id: string; node_id: string; type: string; status: string; lat: number | null; lon: number | null; last_seen: string | null; speed_kmh: number | null }[];
  missions: { id: string; node_id: string; name: string; start_date: string; end_date: string; fuel_kl: number; needs: string; status: string }[];
  levers: {
    id: string;
    node_id: string;
    label: string;
    effect: string;
    cutoff: string;
    lead_days: number;
    cost_amount: number | null;
    cost_unit: string | null;
    synthetic: number;
  }[];
  dependencies: { from_type: string; from_id: string; to_type: string; to_id: string; kind: string }[];
  link_state: { node_id: string; status: "ONLINE" | "DEGRADED" | "OFFLINE"; last_contact: string | null }[];
  /**
   * Optional season of a Director scenario. Absent (season48, aurora2016): the requirement runs over
   * config.season's fixed plan, 24 Jan to the 20 Nov resupply. Present: the requirement and the
   * reserve-breach walk run from now to the named vessel's current arrival at the station, over
   * these phases, so a vessel slip moves the horizon (marion2026).
   */
  season?: SeasonOverride;
}

export interface SeasonOverride {
  phases: { phase: "CLOSING" | "WINTER" | "MOBILISATION"; start: string; end: string }[];
  /** The relief vessel whose arrival is the next resupply. */
  resupply: { vesselId: string };
}

export interface StateResponse {
  seed: Seed;
  events: OpEvent[];
  cursor: number;
  /** Identifies this run of the log; changes on every Reset to Start. */
  epoch?: string;
}

export function emptySeed(): Seed {
  return {
    nodes: [],
    vessels: [],
    shipments: [],
    legs: [],
    inventory_items: [],
    consumption_profiles: [],
    cargo_items: [],
    personnel: [],
    assets: [],
    missions: [],
    levers: [],
    dependencies: [],
    link_state: [],
  };
}

/** GET /storage: row counts of the server's SQLite store (never rows). */
export interface StorageResponse {
  engine: "SQLite";
  journal_mode: string;
  file: string;
  epoch: string;
  cursor: number;
  log: { table: "events"; rows: number; by_type: { type: string; n: number }[]; by_device: { device_id: string; n: number; last_seq: number }[] };
  derived: { table: string; rows: number }[];
  reference: { table: string; rows: number }[];
}
