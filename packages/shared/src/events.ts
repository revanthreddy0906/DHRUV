import { z } from "zod";

/** Build Bible section 6 (LOCKED) plus v2 amendments C5 (absolute clock) and C9 (PERSON_MOVED). */

export const ACTOR_ROLES = ["HQ_OPS", "STATION_LEADER", "FIELD_LEAD", "SYSTEM"] as const;
export const actorRoleSchema = z.enum(ACTOR_ROLES);
export type ActorRole = z.infer<typeof actorRoleSchema>;

export const LOGIN_ROLES = ["HQ_OPS", "STATION_LEADER", "FIELD_LEAD"] as const;
export type LoginRole = (typeof LOGIN_ROLES)[number];

const iso = z.string().datetime();
const qty = z.number().nonnegative();
const LINK_STATUS = z.enum(["ONLINE", "DEGRADED", "OFFLINE"]);
export type LinkStatus = z.infer<typeof LINK_STATUS>;

export const ASSET_STATUSES = ["OK", "DEGRADED", "DOWN"] as const;
export const PERSON_STATUSES = ["ON_STATION", "FIELD", "UNAVAILABLE", "INJURED", "EVACUATED"] as const;

export const payloadSchemas = {
  /** `reason` (DHRUV extension, optional): why a count differs from the book balance, e.g. at a stocktake. */
  STOCK_COUNTED: z.object({ item_id: z.string(), qty, reason: z.string().trim().max(200).optional() }),
  STOCK_ISSUED: z.object({ item_id: z.string(), qty: z.number().positive(), reason: z.string(), mission_id: z.string().optional() }),
  STOCK_RECEIVED: z.object({ item_id: z.string(), qty, shipment_id: z.string().optional() }),
  BURN_RATE_CHANGED: z
    .object({ item_id: z.string(), phase: z.enum(["CLOSING", "WINTER", "MOBILISATION"]), new_rate: z.number().optional(), uplift_pct: z.number().optional() })
    .refine((p) => p.new_rate !== undefined || p.uplift_pct !== undefined, "new_rate or uplift_pct is required"),
  /**
   * DHRUV extension (not in section 6): a new inbound shipment with its legs and cargo lines. The
   * seed's shipments are the only other source; withCreatedShipments() folds these into the seed.
   */
  SHIPMENT_CREATED: z.object({
    shipment_id: z.string().min(1),
    name: z.string().min(1),
    priority: z.enum(["CRITICAL", "HIGH", "NORMAL"]),
    dest_node_id: z.string().min(1),
    legs: z
      .array(
        z.object({
          leg_id: z.string().min(1),
          seq: z.number().int().min(1),
          from_node: z.string().min(1),
          to_node: z.string().min(1),
          etd: iso.nullable().optional(),
          eta: iso,
          vessel_id: z.string().nullable().optional(),
        }),
      )
      .min(1)
      .refine((legs) => new Set(legs.map((l) => l.leg_id)).size === legs.length, "leg ids must be unique"),
    cargo: z.array(z.object({ inventory_item_id: z.string().min(1), qty: z.number().positive() })),
  }),
  LEG_UPDATED: z.object({ leg_id: z.string(), etd: iso.optional(), eta: iso.optional(), status: z.enum(["PLANNED", "IN_TRANSIT", "DONE", "DELAYED"]) }),
  LEG_DELAYED: z.object({ leg_id: z.string(), new_eta: iso, reason: z.string() }),
  VESSEL_UPDATED: z.object({ vessel_id: z.string(), departure: iso.optional(), load_cutoff: iso.optional(), eta_station: iso.optional() }),
  PERSON_STATUS_SET: z.object({ person_id: z.string(), status: z.enum(PERSON_STATUSES) }),
  PERSON_MOVED: z.object({ person_id: z.string(), from_node: z.string(), to_node: z.string(), depart: iso, arrive: iso }),
  CHECKIN_RECORDED: z.object({ person_or_team_id: z.string(), lat: z.number(), lon: z.number(), note: z.string().optional() }),
  ASSET_STATUS_SET: z.object({ asset_id: z.string(), status: z.enum(ASSET_STATUSES), lat: z.number().optional(), lon: z.number().optional(), note: z.string().optional() }),
  MISSION_UPDATED: z.object({ mission_id: z.string(), fields: z.record(z.unknown()) }),
  ASSIGNMENT_SET: z.object({ person_id: z.string(), mission_id: z.string().optional(), task: z.string().optional(), start: iso, end: iso }),
  LINK_STATE_SET: z.object({ node_id: z.string(), status: LINK_STATUS }),
  INCIDENT_OPENED: z.object({
    incident_id: z.string(),
    type: z.string(),
    person_ids: z.array(z.string()),
    last_confirmed_at: iso,
    note: z.string().optional(),
    /** Not in section 6; check-ins are recorded per team (CHECKIN_RECORDED.person_or_team_id), so this links the two. */
    team_id: z.string().optional(),
  }),
  INCIDENT_UPDATED: z.object({ incident_id: z.string(), status: z.string(), note: z.string().optional() }),
  DECISION_PROPOSED: z.object({ decision_id: z.string(), trigger_event_id: z.string(), options: z.array(z.record(z.unknown())), trace: z.array(z.unknown()) }),
  DECISION_APPROVED: z.object({ decision_id: z.string(), chosen_option_id: z.string(), approver: z.string(), verify_ack: z.boolean() }),
  DECISION_REJECTED: z.object({ decision_id: z.string(), reason: z.string() }),
  CONFLICT_FLAGGED: z.object({
    conflict_id: z.string(),
    entity_type: z.string(),
    entity_id: z.string(),
    field: z.string(),
    contenders: z.array(z.object({ event_id: z.string(), device_id: z.string(), value: z.unknown() })),
    conservative_value: z.unknown(),
  }),
  CONFLICT_RESOLVED: z.object({ conflict_id: z.string(), chosen_value: z.unknown(), resolver: z.string() }),
  // v2 C5: absolute jumps only; the Build Bible's delta_minutes is withdrawn.
  CLOCK_ADVANCED: z.object({ now: iso }),
} as const;

export type EventType = keyof typeof payloadSchemas;
export const EVENT_TYPES = Object.keys(payloadSchemas) as EventType[];
export const eventTypeSchema = z.enum(EVENT_TYPES as [EventType, ...EventType[]]);
export type PayloadOf<T extends EventType> = z.infer<(typeof payloadSchemas)[T]>;

/** Merge class per section 9.1 (A immutable, B invariant quantity, C last-write-wins, CS safety-critical). */
export type MergeClass = "A" | "B" | "C" | "CS";

export interface EventRule {
  defaultPriority: number;
  allowedRoles: readonly ActorRole[];
  mergeClass: MergeClass;
  /** Section 9: CLOCK_ADVANCED and LINK_STATE_SET are never synced. */
  localOnly?: true;
}

const HQ = "HQ_OPS";
const SL = "STATION_LEADER";
const FL = "FIELD_LEAD";
const SYS = "SYSTEM";

// Tiers marked "unspecified" are not listed in section 6's priority table; team to confirm.
export const EVENT_RULES: Record<EventType, EventRule> = {
  INCIDENT_OPENED: { defaultPriority: 0, allowedRoles: [SL, HQ, FL], mergeClass: "A" },
  INCIDENT_UPDATED: { defaultPriority: 0, allowedRoles: [SL, HQ], mergeClass: "CS" },
  PERSON_STATUS_SET: { defaultPriority: 1, allowedRoles: [SL, FL, HQ], mergeClass: "CS" },
  CHECKIN_RECORDED: { defaultPriority: 1, allowedRoles: [FL, SL], mergeClass: "A" },
  PERSON_MOVED: { defaultPriority: 1, allowedRoles: [HQ, SL], mergeClass: "A" },
  ASSET_STATUS_SET: { defaultPriority: 1, allowedRoles: [SL, HQ], mergeClass: "CS" },
  STOCK_COUNTED: { defaultPriority: 2, allowedRoles: [SL, HQ], mergeClass: "B" },
  STOCK_ISSUED: { defaultPriority: 2, allowedRoles: [SL], mergeClass: "B" },
  STOCK_RECEIVED: { defaultPriority: 2, allowedRoles: [SL], mergeClass: "B" },
  BURN_RATE_CHANGED: { defaultPriority: 2, allowedRoles: [SL, HQ], mergeClass: "C" }, // unspecified
  SHIPMENT_CREATED: { defaultPriority: 3, allowedRoles: [HQ], mergeClass: "A" },
  LEG_UPDATED: { defaultPriority: 3, allowedRoles: [HQ, SYS], mergeClass: "C" },
  LEG_DELAYED: { defaultPriority: 3, allowedRoles: [HQ], mergeClass: "C" },
  VESSEL_UPDATED: { defaultPriority: 3, allowedRoles: [HQ, SYS], mergeClass: "C" },
  MISSION_UPDATED: { defaultPriority: 4, allowedRoles: [HQ, SL, SYS], mergeClass: "C" },
  ASSIGNMENT_SET: { defaultPriority: 4, allowedRoles: [HQ, SL], mergeClass: "C" },
  DECISION_PROPOSED: { defaultPriority: 3, allowedRoles: [SYS], mergeClass: "A" }, // unspecified
  DECISION_APPROVED: { defaultPriority: 3, allowedRoles: [HQ, SL], mergeClass: "A" }, // unspecified
  DECISION_REJECTED: { defaultPriority: 3, allowedRoles: [HQ], mergeClass: "A" }, // unspecified
  CONFLICT_FLAGGED: { defaultPriority: 1, allowedRoles: [SYS], mergeClass: "A" }, // unspecified
  CONFLICT_RESOLVED: { defaultPriority: 1, allowedRoles: [HQ, SL], mergeClass: "A" }, // unspecified
  LINK_STATE_SET: { defaultPriority: 4, allowedRoles: [SYS], mergeClass: "A", localOnly: true },
  CLOCK_ADVANCED: { defaultPriority: 4, allowedRoles: [HQ, SL, FL, SYS], mergeClass: "A", localOnly: true },
};

/** Non-critical stock lines travel as routine (P4, section 6 priority table). */
const STOCK_TYPES: ReadonlySet<EventType> = new Set(["STOCK_COUNTED", "STOCK_ISSUED", "STOCK_RECEIVED"]);

export function isPriorityAllowed(type: EventType, priority: number, payload: Record<string, unknown>): boolean {
  const { defaultPriority } = EVENT_RULES[type];
  if (priority === defaultPriority) return true;
  if (STOCK_TYPES.has(type) && priority === 4) return true;
  return payload.critical === true && priority < defaultPriority;
}

export const opEventSchema = z.object({
  event_id: z.string().uuid(),
  device_id: z.string().min(1),
  seq: z.number().int().min(1),
  type: eventTypeSchema,
  entity_type: z.string().min(1),
  entity_id: z.string().min(1),
  node_id: z.string().min(1),
  payload: z.record(z.unknown()),
  observed_at: iso,
  created_at_client: iso,
  recorded_at_server: iso.optional(),
  priority: z.number().int().min(0).max(5),
  actor_role: actorRoleSchema,
  schema_version: z.literal(1),
});

export type OpEvent = z.infer<typeof opEventSchema>;

export type EventValidation = { ok: true } | { ok: false; message: string };

/** Envelope + per-type payload + priority rule. Role and node rules need the caller's identity and live on the server. */
export function validateEvent(event: OpEvent): EventValidation {
  const payload = payloadSchemas[event.type].safeParse(event.payload);
  if (!payload.success) {
    return { ok: false, message: `payload does not match ${event.type}: ${payload.error.issues.map((i) => i.message).join("; ")}` };
  }
  if (!isPriorityAllowed(event.type, event.priority, event.payload)) {
    return { ok: false, message: `priority ${event.priority} not allowed for ${event.type}` };
  }
  return { ok: true };
}

/** Canonical reduce order (section 6): (observed_at, device_id, seq). */
export function compareEvents(a: OpEvent, b: OpEvent): number {
  return a.observed_at.localeCompare(b.observed_at) || a.device_id.localeCompare(b.device_id) || a.seq - b.seq;
}
