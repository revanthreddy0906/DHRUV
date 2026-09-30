import type Database from "better-sqlite3";
import type { ErrorCode, OpEvent } from "@dhruv/shared";
import { latestObservedAt } from "../db/events.js";
import { rebuildProjections } from "../db/projections.js";
import { checkApproval, checkRejection } from "./authorize.js";
import { emitServerEvent, type Identity } from "./ingest.js";

export type DecisionOutcome =
  | { ok: true; event: OpEvent; followUps: OpEvent[] }
  | { ok: false; status: number; code: ErrorCode; message: string };

/** The server has no demo clock (section 8): take the client's time, else the latest demo time it has seen. */
function demoNow(db: Database.Database, observedAt?: string): string {
  return observedAt ?? latestObservedAt(db) ?? new Date().toISOString();
}

export interface ApproveInput {
  decision_id: string;
  chosen_option_id: string;
  verify_ack: boolean;
  observed_at?: string;
}

/**
 * Section 15 approval flow: checkApproval enforces role, open decision, deadline, verify-first and
 * open-conflict blocking; then write DECISION_APPROVED and the chosen levers' follow-ups as SYSTEM.
 */
export function approveDecision(db: Database.Database, identity: Identity, input: ApproveInput): DecisionOutcome {
  const run = db.transaction((): DecisionOutcome => {
    const now = demoNow(db, input.observed_at);
    const checked = checkApproval(db, identity, { ...input, now });
    if (!checked.ok) return checked;
    const { decision, followUps } = checked.value;

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
    const now = demoNow(db, observedAt);
    const checked = checkRejection(db, identity, decisionId, now);
    if (!checked.ok) return checked;

    const event = emitServerEvent(
      db,
      {
        type: "DECISION_REJECTED",
        entity_type: "decision",
        entity_id: decisionId,
        node_id: checked.value.node_id,
        actor_role: identity.role,
        observed_at: now,
        payload: { decision_id: decisionId, reason },
      },
      new Date().toISOString(),
    );
    rebuildProjections(db);
    return { ok: true, event, followUps: [] };
  });
  return run();
}
