import { config, type LinkStatus, type PushRequest, type PushResponse } from "@dhruv/shared";
import type { DhruvDb, OutboxEntry } from "./db.js";
import { linkStatus } from "./controls.js";
import type { DeviceIdentity } from "./write.js";

export type PushFn = (request: PushRequest) => Promise<PushResponse>;

export interface DrainResult {
  sent: number;
  accepted: number;
  duplicates: number;
  rejected: number;
  remaining: number;
  skipped: "offline" | null;
}

export interface DrainOptions {
  /** Demo seconds this drain cycle represents; sets the DEGRADED byte budget. */
  cycleSeconds?: number;
}

/**
 * Section 9 priority drain. Sort pending entries by (priority, seq); send until the link's
 * budget is used: ONLINE unlimited, DEGRADED 2.5 KB per demo second with P5 waiting, OFFLINE
 * nothing (no network attempt). Stops at the first entry that does not fit, so a large item
 * never lets lower-priority ones overtake it.
 */
export function selectForDrain(pending: OutboxEntry[], status: LinkStatus, cycleSeconds: number): OutboxEntry[] {
  if (status === "OFFLINE") return [];
  const ordered = [...pending].sort((a, b) => a.priority - b.priority || a.seq - b.seq);
  if (status === "ONLINE") return ordered;

  let budget = config.sync.degradedBytesPerSecond * cycleSeconds;
  const selected: OutboxEntry[] = [];
  for (const entry of ordered) {
    if (entry.priority > config.sync.degradedMaxPriority || entry.bytes > budget) break;
    budget -= entry.bytes;
    selected.push(entry);
  }
  return selected;
}

export async function drainOutbox(db: DhruvDb, identity: DeviceIdentity, push: PushFn, { cycleSeconds = 1 }: DrainOptions = {}): Promise<DrainResult> {
  const pending = await db.outbox.where("status").equals("pending").toArray();
  const status = await linkStatus(db, identity.node_id);
  if (status === "OFFLINE") {
    return { sent: 0, accepted: 0, duplicates: 0, rejected: 0, remaining: pending.length, skipped: "offline" };
  }

  const batch = selectForDrain(pending, status, cycleSeconds);
  if (batch.length === 0) {
    return { sent: 0, accepted: 0, duplicates: 0, rejected: 0, remaining: pending.length, skipped: null };
  }

  const response = await push({ device_id: identity.device_id, events: batch.map((e) => e.event) });
  const byId = new Map(batch.map((e) => [e.event.event_id, e]));

  await db.transaction("rw", db.outbox, db.events, async () => {
    for (const id of [...response.accepted, ...response.duplicates]) {
      const entry = byId.get(id);
      if (!entry) continue;
      await db.outbox.delete([entry.device_id, entry.seq]);
      await db.events.update(id, { recorded_at_server: response.recorded_at_server });
    }
    for (const r of response.rejected) {
      const entry = byId.get(r.event_id);
      if (entry) await db.outbox.update([entry.device_id, entry.seq], { status: "rejected", rejected_code: r.code });
    }
  });

  const acknowledged = response.accepted.length + response.duplicates.length;
  return {
    sent: batch.length,
    accepted: response.accepted.length,
    duplicates: response.duplicates.length,
    rejected: response.rejected.length,
    remaining: pending.length - acknowledged - response.rejected.length,
    skipped: null,
  };
}
