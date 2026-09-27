import * as React from "react";
import { X, RefreshCw, GitMerge, ShieldAlert, CheckCircle2, CircleAlert, Play } from "lucide-react";
import type { Conflict, LinkStatus, OpEventRow, Tier } from "../data/types";
import { TIERS } from "../data/demo";
import { cx, PriorityTierBadge, Button, SectionHeader, Tag } from "./primitives";
import { LinkStatusText, LinkSwitch } from "./shell";

export function ByteBudgetBar({ used, budget, label }: { used: number; budget: number; label: string }) {
  const pct = Math.min(100, (used / budget) * 100);
  return (
    <div>
      <div className="flex justify-between text-xs"><span className="text-fg-2">{label}</span><span className="font-mono text-fg">{used.toLocaleString("en-IN")} / {budget.toLocaleString("en-IN")} B</span></div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-sm bg-bg" role="meter" aria-valuemin={0} aria-valuemax={budget} aria-valuenow={used} aria-label={label}>
        <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function TierQueue({ items, leaving, stalled, leaveDelayMs }: { items: OpEventRow[]; leaving?: Set<string>; stalled?: string; leaveDelayMs?: Map<string, number> }) {
  return (
    <div className="space-y-2">
      {TIERS.map((t) => {
        const rows = items.filter((i) => i.tier === t.tier);
        return (
          <div key={t.tier} className="rounded-lg border border-line bg-bg/50">
            <div className="flex items-center gap-2 px-3 py-1.5">
              <PriorityTierBadge tier={t.tier as Tier} />
              <span className="text-xs font-medium text-fg">{t.cls}</span>
              <span className="ml-auto font-mono text-xs text-fg-2">{rows.length}</span>
            </div>
            {rows.length > 0 && (
              <ul className="border-t border-line">
                {rows.map((r) => (
                  <li key={r.deviceSeq} className={cx("flex items-center gap-2 px-3 py-1.5 font-mono text-xs", leaving?.has(r.deviceSeq) && "dh-drain-out", stalled === r.deviceSeq && "bg-bad-tint")}
                    style={leaveDelayMs?.has(r.deviceSeq) ? { animationDelay: `${leaveDelayMs.get(r.deviceSeq)}ms` } : undefined}>
                    <span className="text-fg">{r.type}</span>
                    <span className="truncate text-fg-2">{r.summary}</span>
                    <span className="ml-auto shrink-0 text-fg-2">{r.bytes} B</span>
                    {stalled === r.deviceSeq && <Tag tone="red">stalled · 5 failures</Tag>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The real outbox, when the drawer is driven by a signed-in device instead of the design's simulation. */
export interface LiveSyncProps {
  /** Bytes the last cycle sent. */
  sentBytes: number;
  /** Bytes one cycle may send: null = unlimited (Online), 0 = nothing leaves (Offline). */
  budget: number | null;
  budgetLabel: string;
  /** Rows that just left the outbox, still shown while they animate out. */
  leaving: Set<string>;
  /** Animation delay per leaving row, so a batch visibly leaves in drain order. */
  leaveDelayMs?: Map<string, number>;
  refused: { row: OpEventRow; reason: string }[];
  onDrain: () => void;
  onRetry: () => void;
}

/** Pending queue by tier; drain leaves in (priority, seq) order within the link's byte budget. */
export function SyncDrawer({ link, device, queue, oldest, onClose, onLinkChange, stalled, autoDrain, live }: {
  link: LinkStatus; device: string; queue: OpEventRow[]; oldest?: string; onClose?: () => void; onLinkChange?: (l: LinkStatus) => void; stalled?: string; autoDrain?: boolean;
  live?: LiveSyncProps;
}) {
  const [simLeaving, setLeaving] = React.useState<Set<string>>(new Set());
  const [gone, setGone] = React.useState<Set<string>>(new Set());
  const simBudget = link === "DEGRADED" ? 2500 : link === "ONLINE" ? Infinity : 0;
  const budget = live ? (live.budget === null ? Infinity : live.budget) : simBudget;
  const remaining = live ? queue : queue.filter((q) => !gone.has(q.deviceSeq));
  const pendingCount = live ? remaining.filter((r) => !live.leaving.has(r.deviceSeq)).length : remaining.length;
  const leaving = live ? live.leaving : simLeaving;
  const sentBytes = live ? live.sentBytes : queue.filter((q) => gone.has(q.deviceSeq)).reduce((a, b) => a + (b.bytes ?? 0), 0);

  const drain = React.useCallback(() => {
    if (live) return live.onDrain();
    if (link === "OFFLINE") return;
    const order = [...remaining].filter((r) => r.deviceSeq !== stalled).sort((a, b) => (a.tier ?? 9) - (b.tier ?? 9) || a.seq - b.seq);
    order.forEach((r, i) => {
      setTimeout(() => setLeaving((s) => new Set(s).add(r.deviceSeq)), i * 400);
      setTimeout(() => setGone((s) => new Set(s).add(r.deviceSeq)), i * 400 + 250);
    });
  }, [remaining, link, stalled, live]);

  React.useEffect(() => { if (!autoDrain) return; const t = setTimeout(drain, 1200); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [autoDrain]);

  return (
    <aside role="dialog" aria-label="Sync" className="absolute inset-y-0 right-0 z-20 flex w-[440px] flex-col border-l border-line-strong bg-surface shadow-drawer">
      <header className="flex items-center gap-2 border-b border-line px-5 py-4">
        <RefreshCw size={16} className="text-accent" aria-hidden />
        <h2 className="flex-1 text-heading font-semibold">Sync · <span className="font-mono text-sm text-fg-2">{device}</span></h2>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-fg-2 hover:bg-elevated"><X size={16} /></button>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          {onLinkChange ? <LinkSwitch value={link} onChange={onLinkChange} /> : <span className="text-sm">Link <LinkStatusText status={link} className="font-semibold" /></span>}
          <div className="text-right font-mono text-xs">
            <div className="font-semibold text-fg" aria-live="polite">{pendingCount} pending</div>
            {oldest && pendingCount > 0 && <div className="text-fg-2">oldest {oldest}</div>}
          </div>
        </div>
        <ByteBudgetBar used={Math.min(sentBytes, budget === Infinity ? sentBytes : budget)} budget={budget === Infinity ? Math.max(sentBytes, 1) : budget || 1}
          label={live ? live.budgetLabel : link === "DEGRADED" ? "Budget · 2.5 KB per demo second (Degraded); P5 waits" : link === "ONLINE" ? "Budget · unlimited (Online)" : "Budget · 0 (Offline): nothing leaves"} />
        <SectionHeader title="Pending queue by priority tier" />
        {remaining.length === 0 ? (
          <p className="flex items-center gap-2 rounded-lg border border-ok/40 bg-ok-tint p-3 text-sm"><CheckCircle2 size={15} className="text-ok" aria-hidden />Queue drained. All events acknowledged by the server.</p>
        ) : <TierQueue items={remaining} leaving={leaving} stalled={stalled} leaveDelayMs={live?.leaveDelayMs} />}
        {live && live.refused.length > 0 && (
          <div>
            <SectionHeader title="Refused by the server" meta={<span className="font-mono text-xs text-bad">{live.refused.length}</span>} />
            <ul className="space-y-1">
              {live.refused.map(({ row, reason }) => (
                <li key={row.deviceSeq} className="rounded-lg border border-bad/40 bg-bad-tint/50 px-3 py-1.5 font-mono text-xs">
                  <span className="text-fg">{row.type}</span> <span className="text-fg-2">{row.summary}</span>
                  <div className="text-fg">{reason}. Not a fact; kept here for the audit trail.</div>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-xs text-fg-2">Retry backoff 2 / 4 / 8 / 16 / 30 s. An item is marked stalled after 5 failures. LINK_STATE_SET and CLOCK_ADVANCED are never synced.</p>
      </div>
      <footer className="flex gap-2 border-t border-line px-5 py-3">
        <Button variant="primary" icon={<Play size={14} />} onClick={drain} disabledReason={link === "OFFLINE" ? "Link is Offline: local operations continue, nothing leaves" : undefined}>Drain now</Button>
        <Button icon={<RefreshCw size={14} />} disabled={!stalled} onClick={live?.onRetry}>Retry stalled</Button>
      </footer>
    </aside>
  );
}

/* ---------- Conflicts ---------- */

export function ConflictCard({ c, onReview }: { c: Conflict; onReview?: () => void }) {
  return (
    <article className="rounded-lg border border-warn/50 bg-surface p-4" aria-label={`Conflict on ${c.entity}`}>
      <header className="flex items-center gap-2">
        <GitMerge size={15} className="text-warn" aria-hidden />
        <h3 className="text-sm font-semibold text-fg">Conflict on <span className="font-mono">{c.entity}</span> {c.field} <span className="font-normal text-fg-2">({c.entityKind})</span></h3>
        <Tag tone="amber" className="ml-auto">class {c.mergeClass}</Tag>
      </header>
      <table className="mt-3 w-full font-mono text-xs">
        <tbody>
          {c.contenders.map((x, i) => (
            <tr key={`${x.device}-${i}`} className="border-t border-line">
              <td className="py-1.5 pr-3 text-fg-2">{x.device}</td>
              <td className={cx("pr-2 font-bold", x.value === c.kept ? "text-bad" : "text-fg")}>{x.value}</td>
              <td className="pr-3 text-fg-2">{x.note}</td>
              <td className="text-right text-fg-2">{x.at}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 font-mono text-xs">
        <span className="font-bold text-fg">KEPT: {c.kept} (conservative)</span>
        <span className="flex items-center gap-1 font-bold text-warn"><ShieldAlert size={12} aria-hidden />REQUIRES HUMAN RESOLUTION</span>
        {onReview && <span className="ml-auto"><Button size="sm" variant="primary" onClick={onReview}>Review</Button></span>}
      </div>
      <ul className="mt-2 space-y-0.5 text-xs text-fg-2">{c.blocks.map((b) => <li key={b}>· {b}</li>)}</ul>
    </article>
  );
}

export function ConflictResolver({ c, onResolve, role = "HQ_OPS", disabledReason }: { c: Conflict; onResolve?: (value: string) => void; role?: string; disabledReason?: string }) {
  const [v, setV] = React.useState<string | null>(null);
  const canResolve = role !== "FIELD_LEAD";
  const blocked = disabledReason ?? (!canResolve ? "Field Leads cannot resolve conflicts" : undefined);
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <SectionHeader title={`Resolve ${c.entity} ${c.field}`} />
      <p className="mb-3 text-xs text-fg-2">Choose the value confirmed on the ground. Resolving emits CONFLICT_RESOLVED and is recorded in the audit log.</p>
      <div role="radiogroup" className="grid grid-cols-2 gap-2">
        {c.contenders.map((x, i) => (
          <button key={`${x.device}-${i}`} role="radio" aria-checked={v === x.value} type="button" onClick={() => setV(x.value)}
            className={cx("rounded-lg border p-3 text-left", v === x.value ? "border-accent ring-1 ring-accent/50" : "border-line hover:border-line-strong")}>
            <div className="font-mono text-sm font-bold text-fg">{x.value}</div>
            <div className="text-xs text-fg-2">{x.note} · {x.device} · {x.at}</div>
          </button>
        ))}
      </div>
      <div className="mt-3">
        <Button variant="primary" disabled={!v} onClick={() => v && onResolve?.(v)}
          disabledReason={blocked}>Resolve as {v ?? "…"}</Button>
      </div>
    </div>
  );
}

export function ReviewQueue({ conflicts, onReview }: { conflicts: Conflict[]; onReview?: (id: string) => void }) {
  return (
    <section aria-label="Review queue">
      <SectionHeader title="Review queue" meta={<span className="font-mono text-xs text-warn">{conflicts.filter((c) => c.status === "OPEN").length} open</span>} />
      {conflicts.length === 0
        ? <p className="flex items-center gap-2 rounded-lg border border-dashed border-line-strong p-3 text-xs text-fg-2"><CircleAlert size={13} aria-hidden />No conflicts. Stock deltas and ordinary fields merged without review.</p>
        : <div className="space-y-2">{conflicts.map((c) => <ConflictCard key={c.id} c={c} onReview={() => onReview?.(c.id)} />)}</div>}
    </section>
  );
}
