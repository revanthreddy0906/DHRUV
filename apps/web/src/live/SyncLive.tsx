import * as React from "react";
import { config } from "@dhruv/shared";
import type { OutboxEntry } from "@dhruv/store";
import { SyncDrawer } from "../components/sync";
import type { OpEventRow, Tier } from "../data/types";
import { SYNC_INTERVAL_MS, useDevice } from "./DeviceProvider";
import { describeEvent } from "./describe";
import { formatAge } from "./format";

const row = (o: OutboxEntry): OpEventRow => ({
  deviceSeq: `${o.device_id} · ${o.seq}`,
  device: o.device_id,
  seq: o.seq,
  type: o.event.type,
  entity: o.event.entity_id,
  node: o.event.node_id,
  actor: o.event.actor_role,
  observedAt: o.event.observed_at,
  tier: o.priority as Tier,
  summary: describeEvent(o.event),
  bytes: o.bytes,
  pending: true,
});

/** How long a drained row stays on screen while it animates out (tokens: --dur-slow). */
const LEAVE_MS = 400;
/** Gap between rows of one drained batch, so they visibly leave in (priority, seq) order. */
const STAGGER_MS = 300;

/**
 * The Sync drawer on the real outbox (section 9): pending events by priority tier, leaving in
 * (priority, seq) order as the sync loop drains them, the byte budget of the current link, items
 * the server refused, Drain now and Retry stalled. Nothing here simulates the drain.
 */
export function LiveSyncDrawer({ onClose }: { onClose: () => void }) {
  const device = useDevice();
  const snap = device?.snapshot;
  const pending = React.useMemo(() => (snap?.outbox ?? []).filter((o) => o.status === "pending").map(row), [snap?.outbox]);

  // Rows that left the outbox since the last render stay briefly, animated out.
  const previous = React.useRef<OpEventRow[]>([]);
  const [ghosts, setGhosts] = React.useState<(OpEventRow & { delay: number })[]>([]);
  // Timers live until they fire (a later snapshot must not cancel them), and are cleared on unmount.
  const timers = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  React.useEffect(() => () => timers.current.forEach(clearTimeout), []);
  React.useEffect(() => {
    const now = new Set(pending.map((r) => r.deviceSeq));
    const left = previous.current.filter((r) => !now.has(r.deviceSeq));
    previous.current = pending;
    if (left.length === 0) return;
    // `previous` is in drain order, so the batch leaves top priority first.
    const leaving = left.map((r, i) => ({ ...r, delay: i * STAGGER_MS }));
    const ids = new Set(left.map((r) => r.deviceSeq));
    setGhosts((g) => [...g, ...leaving]);
    timers.current.push(setTimeout(() => setGhosts((g) => g.filter((x) => !ids.has(x.deviceSeq))), LEAVE_MS + left.length * STAGGER_MS));
  }, [pending]);

  if (!device || !snap) return null;
  const link = snap.link;
  const cycleSeconds = SYNC_INTERVAL_MS / 1000;
  const degradedBudget = config.sync.degradedBytesPerSecond * cycleSeconds;
  const drain = device.lastSync?.outcome.ok ? device.lastSync.outcome.drain : null;
  const oldest = snap.sync.oldestPendingAt;
  const stalledRow = snap.sync.stalled ? pending[0]?.deviceSeq : undefined;
  const refused = snap.outbox
    .filter((o) => o.status === "rejected")
    .map((o) => ({ row: row(o), reason: o.rejected_message ?? o.rejected_code ?? "refused" }));

  return (
    <SyncDrawer
      link={link}
      device={device.session.identity.device_id}
      queue={[...pending, ...ghosts]}
      oldest={oldest ? formatAge(oldest, snap.now) : undefined}
      stalled={stalledRow}
      onClose={onClose}
      live={{
        sentBytes: drain?.bytes ?? 0,
        budget: link === "ONLINE" ? null : link === "DEGRADED" ? degradedBudget : 0,
        budgetLabel:
          link === "DEGRADED"
            ? `Budget · 2.5 KB per demo second × ${cycleSeconds} s cycle (Degraded); P5 waits · last cycle`
            : link === "ONLINE"
              ? "Budget · unlimited (Online) · last cycle"
              : "Budget · 0 (Offline): nothing leaves",
        leaving: new Set(ghosts.map((g) => g.deviceSeq)),
        leaveDelayMs: new Map(ghosts.map((g) => [g.deviceSeq, g.delay])),
        refused,
        onDrain: () => device.syncNow(),
        onRetry: () => void device.retry(),
      }}
    />
  );
}
