import { EVENT_RULES, opEventSchema, validateEvent, type ActorRole, type EventType, type LoginRole, type OpEvent } from "@dhruv/shared";
import { getMeta, setMeta, type DhruvDb } from "./db.js";
import { now } from "./clock.js";

export interface DeviceIdentity {
  device_id: string;
  role: LoginRole;
  node_id: string;
}

export interface EventDraft {
  type: EventType;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
  node_id?: string;
  observed_at?: string;
  priority?: number;
  /** Defaults to the logged-in role; engine-emitted events on this device use SYSTEM. */
  actor_role?: ActorRole;
}

/**
 * writeEvent() (sections 9 and 16): the only way the client changes state. Assigns event_id,
 * the next per-device seq, observed_at from clock.now() and the type's default priority, then
 * writes to events and outbox in one transaction. Local-only types never enter the outbox.
 */
export async function writeEvent(db: DhruvDb, identity: DeviceIdentity, draft: EventDraft, { demoMode = true } = {}): Promise<OpEvent> {
  const rule = EVENT_RULES[draft.type];
  const actorRole = draft.actor_role ?? identity.role;
  if (actorRole !== identity.role && actorRole !== "SYSTEM") throw new Error(`actor_role ${actorRole} does not match ${identity.role}`);
  if (!rule.allowedRoles.includes(actorRole)) throw new Error(`${actorRole} may not write ${draft.type}`);

  const observedAt = draft.observed_at ?? (await now(db, { demoMode }));

  return db.transaction("rw", db.events, db.outbox, db.meta, async () => {
    const seq = (await getMeta<number>(db, "seq", 0)) + 1;
    const event: OpEvent = {
      event_id: crypto.randomUUID(),
      device_id: identity.device_id,
      seq,
      type: draft.type,
      entity_type: draft.entity_type,
      entity_id: draft.entity_id,
      node_id: draft.node_id ?? identity.node_id,
      payload: draft.payload,
      observed_at: observedAt,
      created_at_client: new Date().toISOString(),
      priority: draft.priority ?? rule.defaultPriority,
      actor_role: actorRole,
      schema_version: 1,
    };

    opEventSchema.parse(event);
    const valid = validateEvent(event);
    if (!valid.ok) throw new Error(valid.message);

    await setMeta(db, "seq", seq);
    await db.events.add(event);
    if (!rule.localOnly) {
      await db.outbox.add({
        device_id: event.device_id,
        seq,
        priority: event.priority,
        event,
        bytes: new TextEncoder().encode(JSON.stringify(event)).length,
        status: "pending",
        queued_at: event.created_at_client,
      });
    }
    return event;
  });
}
