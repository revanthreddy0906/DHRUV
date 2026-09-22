import { Dexie, type EntityTable } from "dexie";
import type { EventEnvelope } from "@dhruv/shared";

/**
 * Client-side Dexie (IndexedDB) store (section 2.3, LOCKED stack).
 * Owned by C — B builds views on top of this, does not redefine it.
 *
 * Tables:
 * - events: the local copy of the event log this node knows about
 * - outbox: events written locally but not yet acknowledged by /sync/push
 *           (drained in priority order — see priorityDrain in this package)
 * - meta:   small key/value state, including the demo clock's locally-known
 *           "now" (Phase 3 — must be readable with zero network round-trip)
 * - cache:  derived/computed values worth memoizing between evaluate() calls
 */
export interface OutboxEntry {
  id?: number;
  device_id: string;
  seq: number;
  priority: number;
  event: EventEnvelope;
  queued_at: string;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export interface CacheEntry {
  key: string;
  value: unknown;
  computed_at: string;
}

export class DhruvDb extends Dexie {
  events!: EntityTable<EventEnvelope, "seq">;
  outbox!: EntityTable<OutboxEntry, "id">;
  meta!: EntityTable<MetaEntry, "key">;
  cache!: EntityTable<CacheEntry, "key">;

  constructor(name = "dhruv") {
    super(name);
    this.version(1).stores({
      events: "[device_id+seq], observed_at, type, priority",
      outbox: "++id, [device_id+seq], priority, queued_at",
      meta: "key",
      cache: "key",
    });
  }
}

export function createDb(name?: string): DhruvDb {
  return new DhruvDb(name);
}
