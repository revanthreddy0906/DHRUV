import type Database from "better-sqlite3";
import type { ErrorCode, OpEvent } from "@dhruv/shared";
import { LEVER_ACTIONS } from "@dhruv/seed";
import { latestObservedAt } from "../db/events.js";
import { getDecision, listConflicts, rebuildProjections, type DecisionRow } from "../db/projections.js";
import { emitServerEvent, type Identity } from "./ingest.js";

export type DecisionOutcome =
  | { ok: true; event: OpEvent; followUps: OpEvent[] }
  | { ok: false; status: number; code: ErrorCode; message: string };

interface OptionShape {
  id?: string;
  levers?: string[];
  deadline?: string;
  requiresVerify?: string[];
}

const fail = (status: number, code: ErrorCode, message: string): DecisionOutcome => ({ ok: false, status, code, message });

/** The server has no demo clock (section 8): take the client's time, else the latest demo time it has seen. */
function demoNow(db: Database.Database, observedAt?: string): string {
  return observedAt ?? latestObservedAt(db) ?? new Date().toISOString();
}

function loadProposed(db: Database.Database, decisionId: string): DecisionRow | DecisionOutcome {
  const decision = getDecision(db, decisionId);
  if (!decision) return fail(404, "NOT_FOUND", `decision ${decisionId} not found`);
  if (decision.status !== "PROPOSED") return fail(409, "DECISION_NOT_PROPOSED", `decision ${decisionId} is ${decision.status}`);
  return decision;
}

export interface ApproveInput {
  decision_id: string;
  chosen_option_id: string;
  verify_ack: boolean;
  observed_at?: string;
}

/**
 * Section 15 approval flow: validate role, check the decision is still PROPOSED and the option's
 * deadline has not passed, enforce verify-first (R14) and open-conflict blocking (section 6),
 * write DECISION_APPROVED, then emit the chosen levers' follow-up domain events as SYSTEM.
 */
export function approveDecision(db: Database.Database, identity: Identity, input: ApproveInput): DecisionOutcome {
  const run = db.transaction((): DecisionOutcome => {
    const decision = loadProposed(db, input.decision_id);
    if ("ok" in decision) return decision;

    const option = (decision.options as OptionShape[]).find((o) => o.id === input.chosen_option_id);
    if (!option) return fail(404, "NOT_FOUND", `option ${input.chosen_option_id} not found on ${input.decision_id}`);

    const levers = option.levers ?? [];
    // Unknown levers are treated as HQ-only: the conservative reading.
    const hqOnly = levers.some((l) => LEVER_ACTIONS[l]?.hqOnly ?? true);
    const stationCanApprove = identity.role === "STATION_LEADER" && !hqOnly && identity.node_id === decision.node_id;
    if (identity.role !== "HQ_OPS" && !stationCanApprove) {
      return fail(403, "ROLE_FORBIDDEN", hqOnly ? "only HQ Ops can approve options touching shipments or vessels" : "not permitted to approve this decision");
    }

    const now = demoNow(db, input.observed_at);
    if (option.deadline && now > option.deadline) {
      return fail(409, "DEADLINE_PASSED", `option deadline ${option.deadline} has passed`);
    }
    if ((option.requiresVerify?.length ?? 0) > 0 && !input.verify_ack) {
      return fail(409, "VERIFY_REQUIRED", `verify before acting: ${option.requiresVerify!.join(", ")}`);
    }

    const followUps = levers.flatMap((l) => LEVER_ACTIONS[l]?.followUps ?? []);
    const open = listConflicts(db, "OPEN");
    const blocking = open.filter((c) => followUps.some((f) => f.entity_type === c.entity_type && f.entity_id === c.entity_id));
    if (blocking.length > 0) {
      return fail(409, "CONFLICT_OPEN", `resolve open conflicts first: ${blocking.map((c) => `${c.entity_type} ${c.entity_id}`).join(", ")}`);
    }

    const recordedAt = new Date().toISOString();
    const event = emitServerEvent(
      db,
      {
        type: "DECISION_APPROVED",
        entity_type: "decision",
        entity_id: input.decision_id,
        node_id: decision.node_id,
        actor_role: identity.role,
        observed_at: now,
        payload: { decision_id: input.decision_id, chosen_option_id: input.chosen_option_id, approver: identity.device_id, verify_ack: input.verify_ack },
      },
      recordedAt,
    );
    const emitted = followUps.map((f) =>
      emitServerEvent(db, { ...f, observed_at: now, payload: { ...f.payload, decision_id: input.decision_id } }, recordedAt),
    );

    rebuildProjections(db);
    return { ok: true, event, followUps: emitted };
  });
  return run();
}

export function rejectDecision(db: Database.Database, identity: Identity, decisionId: string, reason: string, observedAt?: string): DecisionOutcome {
  const run = db.transaction((): DecisionOutcome => {
    if (identity.role !== "HQ_OPS") return fail(403, "ROLE_FORBIDDEN", "only HQ Ops can reject decisions");
    const decision = loadProposed(db, decisionId);
    if ("ok" in decision) return decision;

    const event = emitServerEvent(
      db,
      {
        type: "DECISION_REJECTED",
        entity_type: "decision",
        entity_id: decisionId,
        node_id: decision.node_id,
        actor_role: identity.role,
        observed_at: demoNow(db, observedAt),
        payload: { decision_id: decisionId, reason },
      },
      new Date().toISOString(),
    );
    rebuildProjections(db);
    return { ok: true, event, followUps: [] };
  });
  return run();
}
