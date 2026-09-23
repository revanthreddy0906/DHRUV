import type { LinkStatus, OpEvent } from "@dhruv/shared";
import type { DhruvDb } from "./db.js";
import { writeEvent, type DeviceIdentity } from "./write.js";

/** Demo clock control (section 8, v2 C5): an absolute jump, recorded as a local CLOCK_ADVANCED. */
export function jumpClock(db: DhruvDb, identity: DeviceIdentity, iso: string): Promise<OpEvent> {
  return writeEvent(db, identity, {
    type: "CLOCK_ADVANCED",
    entity_type: "clock",
    entity_id: identity.device_id,
    payload: { now: iso },
    observed_at: iso,
  });
}

/** Simulated link switch (section 9): a local LINK_STATE_SET that the sync module obeys. */
export function setLinkStatus(db: DhruvDb, identity: DeviceIdentity, status: LinkStatus, observedAt?: string): Promise<OpEvent> {
  return writeEvent(db, identity, {
    type: "LINK_STATE_SET",
    entity_type: "node",
    entity_id: identity.node_id,
    payload: { node_id: identity.node_id, status },
    actor_role: "SYSTEM",
    observed_at: observedAt,
  });
}

export async function linkStatus(db: DhruvDb, nodeId: string): Promise<LinkStatus> {
  const changes = await db.events.where("type").equals("LINK_STATE_SET").toArray();
  const latest = changes.filter((e) => (e.payload as { node_id: string }).node_id === nodeId).sort((a, b) => a.seq - b.seq).at(-1);
  return latest ? (latest.payload as { status: LinkStatus }).status : "ONLINE";
}
