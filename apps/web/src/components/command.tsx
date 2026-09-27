import * as React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, CircleCheck, OctagonAlert, Siren, TriangleAlert } from "lucide-react";
import type { Freshness, Health } from "../data/types";
import { ALL_CLEAR } from "../format";
import { Card, FreshnessChip, SectionHeader, StateBadge, cx } from "./primitives";

/**
 * Command Center (L1, section 8) pieces. They take view models already phrased from evaluate()
 * (live/command.ts, or the design fixtures when signed out) and only lay them out.
 */

export interface StationRowView {
  nodeId: string;
  name: string;
  state: Health;
  reason: string;
  deadline?: string;
  link?: { text: string; freshness?: Freshness };
  href?: string;
}

export interface AttentionView {
  id: string;
  severity: "RED" | "AMBER";
  title: string;
  owner?: string;
  deadline?: string;
  cause: string;
  action?: { to: string; label: string };
  steps: string[];
}

export interface SeasonView {
  phaseLine: string;
  vessel?: { name: string; marks: { key: string; label: string; pct: number; strong?: boolean }[]; nowPct: number };
}

export interface EventView { id: string; text: string; device: string; age: string }

export function StatusLine({ text }: { text: string }) {
  return <p className="max-w-[110ch] text-heading font-medium text-fg" aria-live="polite">{text}</p>;
}

/** Above the stations table while an incident is open; the incident panel is one click away. */
export function IncidentStrip({ title, confirmed, to }: { title: string; confirmed?: string; to: string }) {
  return (
    <div role="alert" className="flex items-center gap-3 rounded-lg bg-bad-tint px-4 py-3">
      <Siren size={16} strokeWidth={1.75} className="shrink-0 text-bad" aria-hidden />
      <span className="text-sm font-semibold text-fg">{title}</span>
      {confirmed && <span className="text-sm text-fg">{confirmed}</span>}
      <Link to={to} className="ml-auto flex h-8 items-center rounded-md border border-bad/50 bg-surface px-3 text-sm font-semibold text-bad hover:bg-bad-tint">Open incident</Link>
    </div>
  );
}

/** One row per station: state, the reason in a sentence, the deadline, link age, and the way in. */
export function StationsTable({ rows, className }: { rows: StationRowView[]; className?: string }) {
  return (
    <Card pad="none" className={cx("overflow-hidden", className)}>
      <table className="w-full text-sm">
        <thead className="bg-elevated text-left text-xs text-fg-2">
          <tr>
            <th scope="col" className="w-36 px-4 py-2 font-semibold">Station</th>
            <th scope="col" className="w-28 px-3 py-2 font-semibold">State</th>
            <th scope="col" className="px-3 py-2 font-semibold">Reason</th>
            <th scope="col" className="w-48 px-3 py-2 font-semibold">Deadline</th>
            <th scope="col" className="w-56 px-3 py-2 font-semibold">Link</th>
            <th scope="col" className="w-12 px-3 py-2"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.nodeId} className={cx("h-12", r.state === "RED" ? "bg-bad-tint" : r.state === "AMBER" ? "bg-warn-tint" : "")}>
              <th scope="row" className="px-4 py-2 text-left font-semibold text-fg">{r.name}</th>
              <td className="px-3 py-2"><StateBadge state={r.state} size="sm" /></td>
              <td className="px-3 py-2 text-fg">{r.reason}</td>
              <td className={cx("px-3 py-2", r.state === "RED" ? "font-semibold text-bad" : "text-fg")}>{r.deadline ?? ""}</td>
              <td className="px-3 py-2 text-fg-2">
                {r.link && (r.link.freshness ? <FreshnessChip cls={r.link.freshness} label={r.link.text} /> : <span className="text-xs">{r.link.text}</span>)}
              </td>
              <td className="px-3 py-2 text-right">
                {r.href && (
                  <Link to={r.href} aria-label={`Open ${r.name}`} className="inline-flex size-8 items-center justify-center rounded-md text-fg-2 hover:bg-elevated hover:text-fg">
                    <ChevronRight size={16} aria-hidden />
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

const MAX_ITEMS = 6;

/**
 * Needs attention (section 8): decisions first, then RED, AMBER and stale. Each item is a severity
 * word, title, owner, deadline, a one-line cause and one action; its steps open on click. The
 * all-clear sentence shows only when `allClear` is true, from the same evaluation as the table.
 */
export function NeedsAttention({ items, allClear }: { items: AttentionView[]; allClear: boolean }) {
  const [showAll, setShowAll] = React.useState(false);
  const [open, setOpen] = React.useState<string>();
  const shown = showAll ? items : items.slice(0, MAX_ITEMS);
  return (
    <section aria-label="Needs attention">
      <SectionHeader title="Needs attention" meta={items.length > 0 ? <span className="text-xs tabular-nums text-fg-2">{items.length}</span> : undefined} />
      {items.length === 0 ? (
        allClear ? <p className="flex items-center gap-2 text-sm text-fg"><CircleCheck size={16} className="text-ok" aria-hidden />{ALL_CLEAR}</p> : null
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {shown.map((e) => {
            const Icon = e.severity === "RED" ? OctagonAlert : TriangleAlert;
            const expanded = open === e.id;
            return (
              <li key={e.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <span className={cx("mt-0.5 flex w-16 shrink-0 items-center gap-1 text-xs font-semibold", e.severity === "RED" ? "text-bad" : "text-warn")}>
                    <Icon size={16} strokeWidth={1.75} aria-hidden />{e.severity}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-fg">{e.title}</p>
                    <p className="mt-0.5 text-sm text-fg-2">{e.cause}</p>
                    <p className="mt-1 text-xs text-fg-2">
                      {e.owner && <>Owner {e.owner}</>}
                      {e.steps.length > 0 && (
                        <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? undefined : e.id)} className="ml-3 font-semibold text-accent hover:underline">
                          {expanded ? "Hide steps" : `Steps (${e.steps.length})`}
                        </button>
                      )}
                    </p>
                    {expanded && <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-fg">{e.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {e.action && (
                      <Link to={e.action.to} className="flex h-8 items-center rounded-md border border-line-strong bg-elevated px-3 text-sm font-semibold text-fg hover:border-accent/60">{e.action.label}</Link>
                    )}
                    {e.deadline && <span className="text-xs tabular-nums text-fg-2">by {e.deadline}</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > MAX_ITEMS && (
        <button type="button" onClick={() => setShowAll((s) => !s)} className="mt-2 text-sm font-semibold text-accent hover:underline">
          {showAll ? "Show fewer" : `Show all (${items.length})`}
        </button>
      )}
    </section>
  );
}

/** Season: the phase line and the vessel window as a mini timeline with "now". */
export function SeasonPanel({ season }: { season: SeasonView }) {
  const v = season.vessel;
  return (
    <section>
      <SectionHeader title="Season" />
      <Card>
        <p className="text-sm text-fg">{season.phaseLine}</p>
        {v && (
          <div className="mt-3">
            <p className="text-xs text-fg-2">{v.name} window</p>
            <div className="relative mx-2 mt-7 mb-7 h-px bg-line-strong" role="img"
              aria-label={`${v.name}: ${v.marks.map((m) => m.label).join(", ")}`}>
              {v.marks.map((m, i) => (
                <div key={m.key} className="absolute -top-1.5 h-3" style={{ left: `${m.pct}%` }}>
                  <div className={cx("h-3 w-px", m.strong ? "w-0.5 bg-fg" : "bg-fg-2")} />
                  <span className={cx("absolute whitespace-nowrap text-xs tabular-nums", m.pct > 85 ? "right-0" : m.pct < 15 ? "left-0" : "-translate-x-1/2", i % 2 ? "top-4" : "bottom-4", m.strong ? "font-semibold text-fg" : "text-fg-2")}>{m.label}</span>
                </div>
              ))}
              <div className="absolute -top-2.5 h-5" style={{ left: `${v.nowPct}%` }}>
                <div className="h-5 w-0.5 bg-accent" />
                <span className="absolute bottom-6 -translate-x-1/2 text-xs font-semibold text-accent">Now</span>
              </div>
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}

export function RecentEvents({ events }: { events: EventView[] }) {
  return (
    <section>
      <SectionHeader title="Recent events" action={<Link to="/audit" className="text-sm font-semibold text-accent hover:underline">Open audit</Link>} />
      {events.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {events.map((e) => (
            <li key={e.id} className="px-4 py-2">
              <p className="text-sm text-fg">{e.text}</p>
              <p className="mt-0.5 flex justify-between text-xs text-fg-2"><span className="font-mono">{e.device}</span><span className="tabular-nums">{e.age}</span></p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
