import type { EventEnvelope } from "@dhruv/shared";
import type { DhruvDb, OutboxEntry } from "./db.js";
import { getLinkState } from "./link.js";

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
  skipped: "offline" | null;
}

export interface DrainOptions {
  /** Priority (inclusive ceiling) still sent while Degraded. Lower tier = higher priority; tier 0 is incident. */
  degradedPriorityCeiling?: number;
  /** Caps how many entries go out in one push while Degraded. */
  degradedMaxBatchSize?: number;
}

const DEFAULT_DEGRADED_PRIORITY_CEILING = 2;
const DEFAULT_DEGRADED_MAX_BATCH_SIZE = 10;

function sortByPriorityThenQueueOrder(entries: OutboxEntry[]): OutboxEntry[] {
  return [...entries].sort((a, b) => a.priority - b.priority || a.queued_at.localeCompare(b.queued_at));
}

/**
 * Drain the outbox by pushing to /sync/push and removing whatever the
 * server acknowledges (applied:true = newly stored, applied:false = already
 * had it — both mean it's safely synced and can leave the outbox).
 *
 * Priority drain (section 8.1, "never cut"): tier 0 (incident) goes out
 * first, always. Link-state gating: Offline skips the push entirely — no
 * network attempt is made, matching the demo's "link set to Offline" test.
 * Degraded sends only the highest-priority tiers, capped to a batch size,
 * so a thin link doesn't get swamped by low-priority chatter.
 */
export async function drainOutbox(db: DhruvDb, push: PushBatchFn, options: DrainOptions = {}): Promise<DrainResult> {
  const linkState = await getLinkState(db);
  const allEntries = await db.outbox.toArray();

  if (linkState === "offline") {
    return { pushed: 0, remaining: allEntries.length, skipped: "offline" };
  }

  const ordered = sortByPriorityThenQueueOrder(allEntries);

  const entries =
    linkState === "degraded"
      ? ordered
          .filter((entry) => entry.priority <= (options.degradedPriorityCeiling ?? DEFAULT_DEGRADED_PRIORITY_CEILING))
          .slice(0, options.degradedMaxBatchSize ?? DEFAULT_DEGRADED_MAX_BATCH_SIZE)
      : ordered;

  if (entries.length === 0) {
    return { pushed: 0, remaining: allEntries.length, skipped: null };
  }

  const { results } = await push(entries.map((entry) => entry.event));
  const acked = new Set(results.map((r) => `${r.device_id}:${r.seq}`));

  const ackedIds = entries.filter((entry) => acked.has(`${entry.device_id}:${entry.seq}`)).map((entry) => entry.id!);

  await db.outbox.bulkDelete(ackedIds);

  return { pushed: ackedIds.length, remaining: allEntries.length - ackedIds.length, skipped: null };
}
