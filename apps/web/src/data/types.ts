// Engine-facing types (Bible §7, v2 §2.4). The UI renders these; it never computes them.

export type Health = "GREEN" | "AMBER" | "RED";
export type Freshness = "FRESH" | "AGING" | "STALE" | "CRITICAL";
export type LinkStatus = "ONLINE" | "DEGRADED" | "OFFLINE";
export type Role = "HQ_OPS" | "STATION_LEADER" | "FIELD_LEAD";
export type Tier = 0 | 1 | 2 | 3 | 4 | 5;
export type DimensionKey = "FUEL" | "FOOD" | "MEDICAL" | "SPARES_POWER" | "PERSONNEL" | "COMMS";
export type MissionStatus = "OK" | "AT_RISK" | "BLOCKED" | "DEFERRED";

export interface EntityRef { type: string; id: string }

export interface TraceStep {
  rule: string;            // "R03" | "EVENT" | "R18"
  title: string;
  inputs: Record<string, number | string>;
  formula: string;         // "92.0 / 132.0"
  result: string;          // "0.697 -> RED"
  resultState?: Health;
  refs: EntityRef[];
  muted?: boolean;         // B0 comparison line: greyed, never drives state
}

export interface Band { low: number; high?: number; straddles: boolean; lowState?: Health }

export interface FreshnessInfo {
  cls: Freshness;
  label: string;           // "Fuel count 36 h old"
  age: string;             // "36 h"
}

export interface DimensionEval {
  key: DimensionKey;
  state: Health;
  ratio?: number;
  ratioText?: string;      // for non-ratio dimensions, e.g. "need + 1"
  band?: Band;
  straddleText?: string;   // "GREEN, could be AMBER"
  freshness?: FreshnessInfo;
  drivers: string[];
}

export interface Lever {
  id: "HOLD_VESSEL" | "AIRLIFT_PARTIAL" | "DEFER_F27" | "CONSERVE";
  label: string;
  effect: string;
  cutoff: string;
  leadDays: number;
  deadline: string;
  daysLeft: number;
  cost: string;            // SYNTHETIC
  sideEffects: string[];
}

export interface OptionEval {
  id: "a" | "b" | "c";
  levers: Lever["id"][];
  resultingRatio: number;
  resultingState: Health;
  residualGap?: number;
  deadline: string;
  bindingLever?: Lever["id"];
  slack: string;           // v2 C4: "0 d on C-104" | "no inbound dependency"
  cost: string;
  band?: Band;
  straddleText?: string;
  requiresVerify: string[];
  expired?: string;        // reason, if expired
  reachesTarget: boolean;
}

export interface MissionEval { id: string; name: string; dates: string; status: MissionStatus; why: string; fuel: string; people: string[]; assets: string[] }

export interface StationEval {
  nodeId: "MAITRI" | "BHARATI";
  name: string;
  state: Health;
  dimensions: DimensionEval[];
  driver?: string;
  slip: { kind: "tolerance"; days: number; text: string } | { kind: "breach"; date: string; daysShort: number; text: string };
  b0?: { alerts: number; text: string };
  pnr?: { date: string; daysLeft: number };
  missions: MissionEval[];
  gates: string[];
  link: { status: LinkStatus; lastContact: string; freshness: Freshness };
  footnote?: string;
}

export interface OpEventRow {
  deviceSeq: string;       // "MAITRI-TAB-01 · 2"
  device: string;
  seq: number;
  type: string;
  entity: string;
  node: string;
  actor: Role | "SYSTEM";
  observedAt: string;
  recordedAtServer?: string;
  tier: Tier | null;
  summary: string;
  bytes?: number;
  pending?: boolean;
}

export interface Conflict {
  id: string;
  entity: string;
  entityKind: string;
  field: string;
  mergeClass: "C-S" | "B";
  contenders: { device: string; value: string; note: string; at: string }[];
  kept: string;
  status: "OPEN" | "RESOLVED";
  blocks: string[];
}
