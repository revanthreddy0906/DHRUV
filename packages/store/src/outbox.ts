import type { EventEnvelope } from "@dhruv/shared";
import type { DhruvDb } from "./db.js";

export interface PushBatchResult {
  device_id: string;
  seq: number;
  applied: boolean;
}

export type PushBatchFn = (events: EventEnvelope[]) => Promise<{ results: PushBatchResult[] }>;

/**
 * Commit an event locally: it lands in the client's own copy of the event
 * log immediately (so evaluate() can run offline with zero network
 * round-trip) and queues in the outbox until /sync/push acknowledges it.
 * Owned by C — B's screens call this, they don't write to Dexie directly.
 */
export async function commitLocalEvent(db: DhruvDb, event: EventEnvelope): Promise<void> {
  await db.transaction("rw", db.events, db.outbox, async () => {
    await db.events.put(event);
    await db.outbox.add({
      device_id: event.device_id,
      seq: event.seq,
      priority: event.priority,
      event,
      queued_at: new Date().toISOString(),
    });
  });
}

export interface DrainResult {
  pushed: number;
  remaining: number;
}

/**
 * Drain the outbox by pushing everything queued to /sync/push and removing
 * whatever the server acknowledges (applied:true = newly stored,
 * applied:false = already had it — both mean it's safely synced and can
 * leave the outbox). FIFO for now; Phase 3 replaces the ordering with
 * priority-tier-first and adds Degraded/Offline gating.
 */
export async function drainOutbox(db: DhruvDb, push: PushBatchFn): Promise<DrainResult> {
  const entries = await db.outbox.orderBy("queued_at").toArray();
  if (entries.length === 0) {
    return { pushed: 0, remaining: 0 };
  }

  const { results } = await push(entries.map((entry) => entry.event));
  const acked = new Set(results.map((r) => `${r.device_id}:${r.seq}`));

  const ackedIds = entries.filter((entry) => acked.has(`${entry.device_id}:${entry.seq}`)).map((entry) => entry.id!);

  await db.outbox.bulkDelete(ackedIds);

  return { pushed: ackedIds.length, remaining: entries.length - ackedIds.length };
}
