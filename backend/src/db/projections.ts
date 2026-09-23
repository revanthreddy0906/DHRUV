import type Database from "better-sqlite3";
import type { OpEvent } from "@dhruv/shared";
import { listAllEvents } from "./events.js";

/**
 * decisions / conflicts / incidents are read-friendly views derived from events (section 14).
 * They are rebuilt from the full log in reduce order, so arrival order never changes them.
 */
export function rebuildProjections(db: Database.Database): void {
  const events = listAllEvents(db);
  const run = db.transaction(() => {
    db.prepare(`DELETE FROM decisions`).run();
    db.prepare(`DELETE FROM conflicts`).run();
    db.prepare(`DELETE FROM incidents`).run();
    for (const event of events) applyProjection(db, event);
  });
  run();
}

function applyProjection(db: Database.Database, e: OpEvent): void {
  const p = e.payload as Record<string, unknown>;
  switch (e.type) {
    case "DECISION_PROPOSED":
      db.prepare(`
        INSERT OR IGNORE INTO decisions (id, trigger_event_id, status, options, trace)
        VALUES (?, ?, 'PROPOSED', ?, ?)
      `).run(p.decision_id, p.trigger_event_id, JSON.stringify(p.options), JSON.stringify(p.trace));
      break;
    case "DECISION_APPROVED":
      db.prepare(`
        UPDATE decisions SET status = 'APPROVED', chosen_option_id = ?, approver = ?, verify_ack = ?, decided_at = ?
        WHERE id = ? AND status = 'PROPOSED'
      `).run(p.chosen_option_id, p.approver, p.verify_ack ? 1 : 0, e.observed_at, p.decision_id);
      break;
    case "DECISION_REJECTED":
      db.prepare(`UPDATE decisions SET status = 'REJECTED', decided_at = ? WHERE id = ? AND status = 'PROPOSED'`).run(e.observed_at, p.decision_id);
      break;
    case "CONFLICT_FLAGGED":
      db.prepare(`
        INSERT OR REPLACE INTO conflicts (id, entity_type, entity_id, field, contenders, conservative_value, status)
        VALUES (?, ?, ?, ?, ?, ?, 'OPEN')
      `).run(p.conflict_id, p.entity_type, p.entity_id, p.field, JSON.stringify(p.contenders), JSON.stringify(p.conservative_value ?? null));
      break;
    case "CONFLICT_RESOLVED":
      db.prepare(`UPDATE conflicts SET status = 'RESOLVED', resolved_value = ?, resolver = ? WHERE id = ?`).run(
        JSON.stringify(p.chosen_value ?? null),
        p.resolver,
        p.conflict_id,
      );
      break;
    case "INCIDENT_OPENED":
      db.prepare(`
        INSERT OR IGNORE INTO incidents (id, type, status, opened_at, last_confirmed_at, involved)
        VALUES (?, ?, 'OPEN', ?, ?, ?)
      `).run(p.incident_id, p.type, e.observed_at, p.last_confirmed_at, JSON.stringify(p.person_ids));
      break;
    case "INCIDENT_UPDATED":
      db.prepare(`UPDATE incidents SET status = ? WHERE id = ?`).run(p.status, p.incident_id);
      break;
    default:
      break;
  }
}

export interface DecisionRow {
  id: string;
  trigger_event_id: string;
  status: "PROPOSED" | "APPROVED" | "REJECTED";
  options: Record<string, unknown>[];
  node_id: string;
}

export function getDecision(db: Database.Database, id: string): DecisionRow | null {
  const row = db.prepare(`SELECT id, trigger_event_id, status, options FROM decisions WHERE id = ?`).get(id) as
    | { id: string; trigger_event_id: string; status: DecisionRow["status"]; options: string }
    | undefined;
  if (!row) return null;
  const proposal = db
    .prepare(`SELECT node_id FROM events WHERE type = 'DECISION_PROPOSED' AND entity_id = ? ORDER BY server_cursor LIMIT 1`)
    .get(id) as { node_id: string } | undefined;
  return { ...row, options: JSON.parse(row.options), node_id: proposal?.node_id ?? "" };
}

export interface ConflictRow {
  id: string;
  entity_type: string;
  entity_id: string;
  field: string;
  contenders: { event_id: string; device_id: string; value: unknown }[];
  conservative_value: unknown;
  status: "OPEN" | "RESOLVED";
}

export function listConflicts(db: Database.Database, status?: "OPEN" | "RESOLVED"): ConflictRow[] {
  const rows = db
    .prepare(`SELECT id, entity_type, entity_id, field, contenders, conservative_value, status FROM conflicts ${status ? "WHERE status = ?" : ""}`)
    .all(...(status ? [status] : [])) as (Omit<ConflictRow, "contenders" | "conservative_value"> & { contenders: string; conservative_value: string | null })[];
  return rows.map((r) => ({
    ...r,
    contenders: JSON.parse(r.contenders),
    conservative_value: r.conservative_value === null ? null : JSON.parse(r.conservative_value),
  }));
}
