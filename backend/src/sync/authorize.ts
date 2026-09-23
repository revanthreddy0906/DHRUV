import type Database from "better-sqlite3";
import type { ErrorCode, OpEvent } from "@dhruv/shared";
import { LEVER_ACTIONS, type FollowUp } from "@dhruv/seed";
import { listConflicts } from "../db/projections.js";
import type { Identity } from "./ingest.js";

/**
 * Record ownership for the node rule (Build Bible section 4). The rule is about the station a
 * record belongs to, not the node_id a caller writes on its own event: otherwise a Bharati leader
 * could close Maitri's incident by declaring node_id "BHARATI".
 */

const SEED_OWNER_TABLE: Record<string, string> = {
  inventory_item: "inventory_items",
  asset: "assets",
  person: "personnel",
  mission: "missions",
};

/** Owning node of a seeded entity, or null when the seed does not know it. */
export function entityOwner(db: Database.Database, entityType: string, entityId: string): string | null {
  const table = SEED_OWNER_TABLE[entityType];
  if (!table) return null;
  const row = db.prepare(`SELECT node_id FROM ${table} WHERE id = ?`).get(entityId) as { node_id: string } | undefined;
  return row?.node_id ?? null;
}

const SEEDED_TARGET: Partial<Record<OpEvent["type"], { entityType: string; payloadKey: string }>> = {
  STOCK_COUNTED: { entityType: "inventory_item", payloadKey: "item_id" },
  STOCK_ISSUED: { entityType: "inventory_item", payloadKey: "item_id" },
  STOCK_RECEIVED: { entityType: "inventory_item", payloadKey: "item_id" },
  BURN_RATE_CHANGED: { entityType: "inventory_item", payloadKey: "item_id" },
  ASSET_STATUS_SET: { entityType: "asset", payloadKey: "asset_id" },
  PERSON_STATUS_SET: { entityType: "person", payloadKey: "person_id" },
  ASSIGNMENT_SET: { entityType: "person", payloadKey: "person_id" },
  MISSION_UPDATED: { entityType: "mission", payloadKey: "mission_id" },
};

export interface ConflictFlagInfo {
  entity_type: string;
  entity_id: string;
  node_id: string;
  /** A CONFLICT_RESOLVED arrived after the latest flag with this id. */
  resolved: boolean;
}

export function conflictFlag(db: Database.Database, conflictId: string): ConflictFlagInfo | null {
  const flag = db
    .prepare(`
      SELECT node_id, payload, server_cursor FROM events
      WHERE type = 'CONFLICT_FLAGGED' AND json_extract(payload, '$.conflict_id') = ?
      ORDER BY server_cursor DESC LIMIT 1
    `)
    .get(conflictId) as { node_id: string; payload: string; server_cursor: number } | undefined;
  if (!flag) return null;

  const resolution = db
    .prepare(`
      SELECT 1 FROM events
      WHERE type = 'CONFLICT_RESOLVED' AND json_extract(payload, '$.conflict_id') = ? AND server_cursor > ?
      LIMIT 1
    `)
    .get(conflictId, flag.server_cursor);
  const p = JSON.parse(flag.payload) as { entity_type: string; entity_id: string };
  return { entity_type: p.entity_type, entity_id: p.entity_id, node_id: flag.node_id, resolved: Boolean(resolution) };
}

/** Node of the station that opened an incident. */
function incidentOwner(db: Database.Database, incidentId: string): string | null {
  const row = db
    .prepare(`
      SELECT node_id FROM events
      WHERE type = 'INCIDENT_OPENED' AND json_extract(payload, '$.incident_id') = ?
      ORDER BY server_cursor LIMIT 1
    `)
    .get(incidentId) as { node_id: string } | undefined;
  return row?.node_id ?? null;
}

export type Ownership = { owner: string | null } | { unknown: string };

/**
 * The node that owns the record this event changes. `owner: null` means the event does not
 * target an existing owned record (or the seed does not know it), so only the event's own
 * node_id is checked. `unknown` means the target must exist and does not.
 */
export function ownerOf(db: Database.Database, event: OpEvent): Ownership {
  const p = event.payload as Record<string, string>;

  if (event.type === "INCIDENT_UPDATED") {
    const owner = incidentOwner(db, p.incident_id);
    return owner ? { owner } : { unknown: `incident ${p.incident_id} has not been opened` };
  }
  if (event.type === "CONFLICT_RESOLVED") {
    const flag = conflictFlag(db, p.conflict_id);
    if (!flag) return { unknown: `conflict ${p.conflict_id} does not exist` };
    return { owner: entityOwner(db, flag.entity_type, flag.entity_id) ?? flag.node_id };
  }

  const target = SEEDED_TARGET[event.type];
  return { owner: target ? entityOwner(db, target.entityType, p[target.payloadKey]) : null };
}

export interface ProposedDecision {
  id: string;
  node_id: string;
  observed_at: string;
  options: DecisionOption[];
}

export interface DecisionOption {
  id?: string;
  levers?: string[];
  deadline?: string;
  requiresVerify?: string[];
}

export type Check<T> = { ok: true; value: T } | { ok: false; status: number; code: ErrorCode; message: string };
const deny = (status: number, code: ErrorCode, message: string): { ok: false; status: number; code: ErrorCode; message: string } => ({ ok: false, status, code, message });

/**
 * A decision as the event log records it: the first proposal to reach the server, and whether
 * any approval or rejection has been accepted since. Read from events, not the projection, so it
 * is current inside a batch.
 */
function loadOpenDecision(db: Database.Database, decisionId: string): Check<ProposedDecision> {
  const proposal = db
    .prepare(`
      SELECT node_id, observed_at, payload FROM events
      WHERE type = 'DECISION_PROPOSED' AND json_extract(payload, '$.decision_id') = ?
      ORDER BY server_cursor LIMIT 1
    `)
    .get(decisionId) as { node_id: string; observed_at: string; payload: string } | undefined;
  if (!proposal) return deny(404, "NOT_FOUND", `decision ${decisionId} not found`);

  const decided = db
    .prepare(`
      SELECT type FROM events
      WHERE type IN ('DECISION_APPROVED', 'DECISION_REJECTED') AND json_extract(payload, '$.decision_id') = ?
      LIMIT 1
    `)
    .get(decisionId) as { type: string } | undefined;
  if (decided) return deny(409, "DECISION_NOT_PROPOSED", `decision ${decisionId} is already ${decided.type === "DECISION_APPROVED" ? "APPROVED" : "REJECTED"}`);

  const options = (JSON.parse(proposal.payload) as { options: DecisionOption[] }).options;
  return { ok: true, value: { id: decisionId, node_id: proposal.node_id, observed_at: proposal.observed_at, options } };
}

export interface ApprovalCheckInput {
  decision_id: string;
  chosen_option_id: string;
  verify_ack: boolean;
  /** Demo time of the approval. */
  now: string;
}

export interface ApprovedChoice {
  decision: ProposedDecision;
  option: DecisionOption;
  followUps: FollowUp[];
}

/**
 * The single set of approval rules (section 15), used by POST /decisions/:id/approve and by
 * DECISION_APPROVED events synced from a station that approved offline (section 9: station-level
 * decisions are recorded offline), so the two paths cannot drift apart.
 */
export function checkApproval(db: Database.Database, identity: Identity, input: ApprovalCheckInput): Check<ApprovedChoice> {
  const loaded = loadOpenDecision(db, input.decision_id);
  if (!loaded.ok) return loaded;
  const decision = loaded.value;

  const option = decision.options.find((o) => o.id === input.chosen_option_id);
  if (!option) return deny(404, "NOT_FOUND", `option ${input.chosen_option_id} not found on ${input.decision_id}`);

  const levers = option.levers ?? [];
  // Unknown levers are treated as HQ-only: the conservative reading.
  const hqOnly = levers.some((l) => LEVER_ACTIONS[l]?.hqOnly ?? true);
  const stationCanApprove = identity.role === "STATION_LEADER" && !hqOnly && identity.node_id === decision.node_id;
  if (identity.role !== "HQ_OPS" && !stationCanApprove) {
    return deny(403, "ROLE_FORBIDDEN", hqOnly ? "only HQ Ops can approve options touching shipments or vessels" : "not permitted to approve this decision");
  }

  // An approval dated before its proposal would replay ahead of it and could never apply.
  if (input.now < decision.observed_at) return deny(400, "INVALID_EVENT", "approval cannot be dated before the proposal");
  if (option.deadline && input.now > option.deadline) return deny(409, "DEADLINE_PASSED", `option deadline ${option.deadline} has passed`);
  if ((option.requiresVerify?.length ?? 0) > 0 && !input.verify_ack) {
    return deny(409, "VERIFY_REQUIRED", `verify before acting: ${option.requiresVerify!.join(", ")}`);
  }

  const followUps = levers.flatMap((l) => LEVER_ACTIONS[l]?.followUps ?? []);
  const blocking = listConflicts(db, "OPEN").filter((c) => followUps.some((f) => f.entity_type === c.entity_type && f.entity_id === c.entity_id));
  if (blocking.length > 0) {
    return deny(409, "CONFLICT_OPEN", `resolve open conflicts first: ${blocking.map((c) => `${c.entity_type} ${c.entity_id}`).join(", ")}`);
  }

  return { ok: true, value: { decision, option, followUps } };
}

export function checkRejection(db: Database.Database, identity: Identity, decisionId: string, now: string): Check<ProposedDecision> {
  if (identity.role !== "HQ_OPS") return deny(403, "ROLE_FORBIDDEN", "only HQ Ops can reject decisions");
  const loaded = loadOpenDecision(db, decisionId);
  if (!loaded.ok) return loaded;
  if (now < loaded.value.observed_at) return deny(400, "INVALID_EVENT", "rejection cannot be dated before the proposal");
  return loaded;
}
