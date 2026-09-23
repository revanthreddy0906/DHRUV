import { config } from "./config.js";
import { compareEvents, EVENT_RULES, type OpEvent } from "./events.js";

export interface Contender {
  event_id: string;
  device_id: string;
  value: unknown;
}

export interface ConflictFinding {
  kind: "SAFETY_CRITICAL" | "NEGATIVE_STOCK" | "DOUBLE_ASSIGNMENT";
  entity_type: string;
  entity_id: string;
  field: string;
  contenders: Contender[];
  conservative_value: unknown;
}

interface SafetyTarget {
  entity_type: string;
  entity_id: string;
  field: string;
  value: string;
}

function safetyTarget(event: OpEvent): SafetyTarget | null {
  const p = event.payload as Record<string, string>;
  switch (event.type) {
    case "ASSET_STATUS_SET":
      return { entity_type: "asset", entity_id: p.asset_id, field: "status", value: p.status };
    case "PERSON_STATUS_SET":
      return { entity_type: "person", entity_id: p.person_id, field: "status", value: p.status };
    case "INCIDENT_UPDATED":
      return { entity_type: "incident", entity_id: p.incident_id, field: "status", value: p.status };
    default:
      return null;
  }
}

function severity(entityType: string, value: string): number {
  const c = config.conflicts;
  if (entityType === "asset") return c.assetStatusSeverity[value] ?? 0;
  if (entityType === "person") return c.personStatusSeverity[value] ?? 0;
  return (c.closedIncidentStatuses as readonly string[]).includes(value) ? 0 : 1;
}

function keyOf(entityType: string, entityId: string, field: string): string {
  return `${entityType}|${entityId}|${field}`;
}

/** The latest CONFLICT_RESOLVED per entity field; events ordered at or before it are settled. */
function resolutionCutoffs(sorted: OpEvent[]): Map<string, OpEvent> {
  const flagTargets = new Map<string, string>();
  const cutoffs = new Map<string, OpEvent>();
  for (const e of sorted) {
    if (e.type === "CONFLICT_FLAGGED") {
      const p = e.payload as Record<string, string>;
      flagTargets.set(p.conflict_id, keyOf(p.entity_type, p.entity_id, p.field));
    } else if (e.type === "CONFLICT_RESOLVED") {
      const target = flagTargets.get((e.payload as Record<string, string>).conflict_id);
      if (target) cutoffs.set(target, e);
    }
  }
  return cutoffs;
}

function detectSafety(sorted: OpEvent[], touched: Set<string>, cutoffs: Map<string, OpEvent>): ConflictFinding[] {
  const latestPerDevice = new Map<string, Map<string, { event: OpEvent; target: SafetyTarget }>>();
  for (const e of sorted) {
    if (EVENT_RULES[e.type].mergeClass !== "CS") continue;
    const target = safetyTarget(e);
    if (!target) continue;
    const key = keyOf(target.entity_type, target.entity_id, target.field);
    if (!touched.has(key)) continue;
    const cutoff = cutoffs.get(key);
    if (cutoff && compareEvents(e, cutoff) <= 0) continue;
    const perDevice = latestPerDevice.get(key) ?? new Map();
    perDevice.set(e.device_id, { event: e, target });
    latestPerDevice.set(key, perDevice);
  }

  const findings: ConflictFinding[] = [];
  for (const perDevice of latestPerDevice.values()) {
    const entries = [...perDevice.values()];
    const values = new Set(entries.map((x) => x.target.value));
    if (values.size < 2) continue;

    const { entity_type, entity_id, field } = entries[0].target;
    if (entity_type === "person" && ![...values].some((v) => config.conflicts.safetyCriticalPersonStatuses.includes(v))) {
      continue;
    }

    const conservative = entries.reduce((best, x) =>
      severity(entity_type, x.target.value) > severity(entity_type, best.target.value) ? x : best,
    );
    findings.push({
      kind: "SAFETY_CRITICAL",
      entity_type,
      entity_id,
      field,
      contenders: entries
        .sort((a, b) => compareEvents(a.event, b.event))
        .map((x) => ({ event_id: x.event.event_id, device_id: x.event.device_id, value: x.target.value })),
      conservative_value: conservative.target.value,
    });
  }
  return findings;
}

function detectNegativeStock(sorted: OpEvent[], touchedItems: Set<string>, seedStock: Map<string, number>): ConflictFinding[] {
  const findings: ConflictFinding[] = [];
  for (const itemId of touchedItems) {
    const stockEvents = sorted.filter(
      (e) => (e.type === "STOCK_COUNTED" || e.type === "STOCK_ISSUED" || e.type === "STOCK_RECEIVED") && (e.payload as { item_id: string }).item_id === itemId,
    );
    const lastCountIndex = stockEvents.findLastIndex((e) => e.type === "STOCK_COUNTED");
    const base = lastCountIndex >= 0 ? (stockEvents[lastCountIndex].payload as { qty: number }).qty : seedStock.get(itemId);
    if (base === undefined) continue;

    const deltas = stockEvents.slice(lastCountIndex + 1);
    const balance = deltas.reduce((sum, e) => {
      const q = (e.payload as { qty: number }).qty;
      return e.type === "STOCK_RECEIVED" ? sum + q : sum - q;
    }, base);
    if (balance >= 0) continue;

    findings.push({
      kind: "NEGATIVE_STOCK",
      entity_type: "inventory_item",
      entity_id: itemId,
      field: "stock",
      contenders: deltas
        .filter((e) => e.type === "STOCK_ISSUED")
        .map((e) => ({ event_id: e.event_id, device_id: e.device_id, value: -(e.payload as { qty: number }).qty })),
      conservative_value: balance,
    });
  }
  return findings;
}

function detectDoubleAssignment(sorted: OpEvent[], touchedPeople: Set<string>): ConflictFinding[] {
  const findings: ConflictFinding[] = [];
  for (const personId of touchedPeople) {
    const assignments = sorted.filter((e) => e.type === "ASSIGNMENT_SET" && (e.payload as { person_id: string }).person_id === personId);
    const overlapping = new Map<string, OpEvent>();
    for (let i = 0; i < assignments.length; i++) {
      for (let j = i + 1; j < assignments.length; j++) {
        const a = assignments[i].payload as { mission_id?: string; task?: string; start: string; end: string };
        const b = assignments[j].payload as { mission_id?: string; task?: string; start: string; end: string };
        const sameTarget = (a.mission_id ?? a.task) === (b.mission_id ?? b.task);
        if (!sameTarget && a.start < b.end && b.start < a.end) {
          overlapping.set(assignments[i].event_id, assignments[i]);
          overlapping.set(assignments[j].event_id, assignments[j]);
        }
      }
    }
    if (overlapping.size === 0) continue;
    findings.push({
      kind: "DOUBLE_ASSIGNMENT",
      entity_type: "person",
      entity_id: personId,
      field: "assignment",
      contenders: [...overlapping.values()].map((e) => {
        const p = e.payload as { mission_id?: string; task?: string };
        return { event_id: e.event_id, device_id: e.device_id, value: p.mission_id ?? p.task };
      }),
      conservative_value: null,
    });
  }
  return findings;
}

/**
 * Conflict detection (section 6 "How each field merges", section 9 "Conflict handling").
 * Pure: same event set in, same findings out. Only entities touched by `incoming` are examined.
 * Callers dedupe against conflicts already open and emit CONFLICT_FLAGGED for the rest.
 */
export function detectConflicts(allEvents: OpEvent[], incoming: OpEvent[], seedStock: Map<string, number> = new Map()): ConflictFinding[] {
  const sorted = [...allEvents].sort(compareEvents);

  const touchedSafety = new Set<string>();
  const touchedItems = new Set<string>();
  const touchedPeople = new Set<string>();
  for (const e of incoming) {
    const target = safetyTarget(e);
    if (target) touchedSafety.add(keyOf(target.entity_type, target.entity_id, target.field));
    if (e.type === "STOCK_COUNTED" || e.type === "STOCK_ISSUED" || e.type === "STOCK_RECEIVED") {
      touchedItems.add((e.payload as { item_id: string }).item_id);
    }
    if (e.type === "ASSIGNMENT_SET") touchedPeople.add((e.payload as { person_id: string }).person_id);
  }

  return [
    ...detectSafety(sorted, touchedSafety, resolutionCutoffs(sorted)),
    ...detectNegativeStock(sorted, touchedItems, seedStock),
    ...detectDoubleAssignment(sorted, touchedPeople),
  ];
}
