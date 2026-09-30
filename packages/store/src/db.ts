import { Dexie, type EntityTable } from "dexie";
import type { ErrorCode, OpEvent } from "@dhruv/shared";

/**
 * Client store (Build Bible section 9, "Client architecture"). Same event shape as the server.
 * - events: every event this node knows, primary key event_id
 * - outbox: events not yet acknowledged by the server, key [device_id+seq]
 * - meta:   pull cursor, device id, seq counter, sync failure state
 * - cache:  map tile metadata and other memoised values
 *
 * One database per device, so two simulated devices in the same browser are separate replicas.
 */
export interface OutboxEntry {
  device_id: string;
  seq: number;
  priority: number;
  event: OpEvent;
  /** Serialised size, used by the DEGRADED byte budget. */
  bytes: number;
  status: "pending" | "rejected";
  rejected_code?: ErrorCode;
  /** The server's reason, shown to the operator (e.g. an approval that predates its proposal). */
  rejected_message?: string;
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
  events!: EntityTable<OpEvent, "event_id">;
  outbox!: Dexie.Table<OutboxEntry, [string, number]>;
  meta!: EntityTable<MetaEntry, "key">;
  cache!: EntityTable<CacheEntry, "key">;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      events: "event_id, [device_id+seq], observed_at, type, entity_id",
      outbox: "[device_id+seq], priority, status",
      meta: "key",
      cache: "key",
    });
  }
}

export function openDeviceDb(deviceId: string): DhruvDb {
  return new DhruvDb(`dhruv-${deviceId}`);
}

export async function getMeta<T>(db: DhruvDb, key: string, fallback: T): Promise<T> {
  const entry = await db.meta.get(key);
  return entry === undefined ? fallback : (entry.value as T);
}

export async function setMeta(db: DhruvDb, key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

/** Empties this device's store (Reset to Start, or the server log was reset since it loaded). */
export async function clearDeviceStore(db: DhruvDb): Promise<void> {
  await db.transaction("rw", db.events, db.outbox, db.meta, db.cache, async () => {
    await Promise.all([db.events.clear(), db.outbox.clear(), db.meta.clear(), db.cache.clear()]);
  });
}
