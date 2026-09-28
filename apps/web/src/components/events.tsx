import * as React from "react";
import { CloudOff, Info } from "lucide-react";
import type { Freshness, Health, OpEventRow } from "../data/types";
import { cx, PriorityTierBadge, STATE_META, FreshnessChip, SectionHeader } from "./primitives";

export function EventRow({ e }: { e: OpEventRow & { age?: string } }) {
  return (
    <li className="flex items-start gap-2.5 py-2">
      <PriorityTierBadge tier={e.tier} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-mono text-xs font-semibold text-fg">{e.type}</span>
          {e.age && <span className="shrink-0 font-mono text-xs text-fg-2">{e.age}</span>}
        </div>
        <p className="text-xs leading-4 text-fg-2">{e.summary}</p>
        <p className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-fg-2">
          {e.device}{e.pending && <span className="inline-flex items-center gap-1 text-warn"><CloudOff size={10} aria-hidden />pending sync</span>}
        </p>
      </div>
    </li>
  );
}

export function EventTimeline({ events, title = "Event timeline", empty = "No events since the seed was loaded." }: { events: (OpEventRow & { age?: string })[]; title?: string; empty?: string }) {
  return (
    <section aria-label={title}>
      <SectionHeader title={title} meta={<span className="text-xs tabular-nums text-fg-2">last {Math.min(10, events.length)}</span>} />
      {events.length === 0 ? <p className="rounded-lg border border-dashed border-line-strong p-3 text-xs text-fg-2">{empty}</p>
        : <ul className="divide-y divide-line">{events.slice(0, 10).map((e, i) => <EventRow key={i} e={e} />)}</ul>}
    </section>
  );
}

export function RiskList({ items }: { items: { text: string; state: Health | "INFO"; freshness?: Freshness; age?: string }[] }) {
  return (
    <section aria-label="Risk and freshness">
      <SectionHeader title="Risk and freshness" />
      {items.length === 0 ? <p className="text-xs text-fg-2">No open risks.</p> : (
        <ul className="space-y-1.5">
          {items.map((r, i) => {
            const m = r.state === "INFO" ? null : STATE_META[r.state];
            return (
              <li key={i} className="flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2">
                {m ? <m.Icon size={14} className={cx("mt-0.5 shrink-0", m.text)} aria-label={m.word} /> : <Info size={14} className="mt-0.5 shrink-0 text-fg-2" aria-hidden />}
                <span className="flex-1 text-sm leading-5 text-fg">{r.text}</span>
                {r.freshness && <FreshnessChip cls={r.freshness} label={r.freshness.toLowerCase()} compact className="shrink-0" />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
