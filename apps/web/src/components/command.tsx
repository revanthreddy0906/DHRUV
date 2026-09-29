import * as React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, CircleCheck, OctagonAlert, Sigma, Siren, TriangleAlert } from "lucide-react";
import type { Freshness, Health } from "../data/types";
import { ALL_CLEAR } from "../format";
import { Card, FreshnessChip, StateBadge, cx } from "./primitives";

/**
 * Command Center (L1, section 8) pieces, in the warm polar composition (the v0 mock): summary
 * counts, a band of Needs attention, network position and recent events, the station readiness
 * table, then the top decision and the vessel window. They take view models already phrased from
 * evaluate() (live/command.ts, or the design fixtures when signed out) and only lay them out.
 */

export interface StationRowView {
  nodeId: string;
  name: string;
  /** "MAI": the station's short code, shown in its box. */
  code?: string;
  state: Health;
  reason: string;
  /** The dimension driving a non-GREEN state, and its amount ("92.0 of 132.0 kL"). */
  critical?: { label: string; amount?: string };
  ratio?: string;
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
  vessel?: {
    name: string;
    /** "24 Feb": the vessel's current ETA at the station. */
    eta?: string;
    /** How old the ETA report is, with the engine's freshness class for a cargo ETA. */
    etaReport?: { age: string; freshness: Freshness };
    marks: { key: string; label: string; pct: number; strong?: boolean }[];
    nowPct: number;
  };
}

export interface EventView { id: string; text: string; device: string; age: string }

/** The three counts beside the page title (plain numbers, coloured only when there is something). */
export interface SummaryView { stations: number; worst?: "RED" | "AMBER"; incidents: number; decisions: number }

/** The top pending decision, phrased by the Decision screen's own view (live/decisionView). */
export interface DecisionCalloutView {
  id: string;
  station: string;
  title: string;
  chain: string[];
  deadline?: string;
  lead?: string;
  href: string;
}

export function StatusLine({ text }: { text: string }) {
  return <p className="max-w-[110ch] text-heading font-medium text-fg" aria-live="polite">{text}</p>;
}

/** Stations needing attention, open incidents, decisions due: the mock's stat row, as plain counts. */
export function SummaryCounts({ summary }: { summary: SummaryView }) {
  const item = (label: string, n: number, tone?: "RED" | "AMBER") => (
    <div className="border-l border-line pl-4 first:border-l-0 first:pl-0">
      <div className="text-xs text-fg-2">{label}</div>
      <div className={cx("font-mono text-heading font-semibold tabular-nums", n > 0 && tone === "RED" ? "text-bad" : n > 0 && tone === "AMBER" ? "text-warn" : "text-fg")}>{n}</div>
    </div>
  );
  return (
    <div className="flex items-center gap-4" aria-label="Summary">
      {item("Stations needing attention", summary.stations, summary.worst)}
      {item("Open incidents", summary.incidents, "RED")}
      {item("Decisions due", summary.decisions, "AMBER")}
    </div>
  );
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

/**
 * Station readiness: one row per station with its code and link age, state, the dimension driving
 * it with its amount and ratio, the reason in a sentence, the deadline, and the way in.
 */
export function StationsTable({ rows, className, onShowMath }: {
  rows: StationRowView[]; className?: string;
  /** Opens the trace on the dimension that drives a station's state (offered on non-GREEN rows). */
  onShowMath?: (nodeId: string) => void;
}) {
  return (
    <Card heading="Station readiness" pad="none" className={className}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-elevated text-left text-xs text-fg-2">
            <tr>
              <th scope="col" className="w-48 px-4 py-2 font-semibold">Station</th>
              <th scope="col" className="w-24 px-3 py-2 font-semibold">State</th>
              <th scope="col" className="w-48 px-3 py-2 font-semibold">Critical resource</th>
              <th scope="col" className="min-w-64 px-3 py-2 font-semibold">Reason</th>
              <th scope="col" className="px-3 py-2 font-semibold">Deadline</th>
              <th scope="col" className="w-px px-3 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.nodeId} className={cx("h-14", r.state === "RED" ? "bg-bad-tint" : r.state === "AMBER" ? "bg-warn-tint" : "")}>
                <th scope="row" className="px-4 py-2 text-left font-normal">
                  <span className="flex items-center gap-3">
                    {r.code && <span aria-hidden className="flex h-7 w-10 shrink-0 items-center justify-center rounded-sm border border-line-strong bg-surface font-mono text-xs font-semibold text-accent">{r.code}</span>}
                    <span className="block leading-tight">
                      <span className="block font-semibold text-fg">{r.name}</span>
                      {r.link && (r.link.freshness ? <FreshnessChip cls={r.link.freshness} label={r.link.text} /> : <span className="block text-xs text-fg-2">{r.link.text}</span>)}
                    </span>
                  </span>
                </th>
                <td className="px-3 py-2"><StateBadge state={r.state} size="sm" /></td>
                <td className="px-3 py-2">
                  {r.critical && (
                    <span className="flex items-baseline justify-between gap-3 leading-tight">
                      <span className="block">
                        <span className="block font-semibold text-fg">{r.critical.label}</span>
                        {r.critical.amount && <span className="block whitespace-nowrap font-mono text-xs tabular-nums text-fg-2">{r.critical.amount}</span>}
                      </span>
                      {r.ratio && <span className={cx("font-mono tabular-nums", r.state === "RED" ? "font-semibold text-bad" : "font-semibold text-warn")} title="Ratio">{r.ratio}</span>}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-fg">{r.reason}</td>
                <td className={cx("whitespace-nowrap px-3 py-2", r.state === "RED" ? "font-semibold text-bad" : "text-fg")}>{r.deadline ?? ""}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {onShowMath && r.state !== "GREEN" && (
                    <button type="button" onClick={() => onShowMath(r.nodeId)} aria-label={`Show the math: ${r.name}`}
                      className="mr-1 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm font-semibold text-accent hover:bg-accent-tint">
                      <Sigma size={16} strokeWidth={1.75} aria-hidden />Show the math
                    </button>
                  )}
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
      </div>
    </Card>
  );
}

const MAX_ITEMS = 6;

/**
 * Needs attention (section 8): decisions first, then RED, AMBER and stale. Each item is a severity
 * word, title, a one-line cause, owner, deadline and one action; its steps open on click. The
 * all-clear sentence shows only when `allClear` is true, from the same evaluation as the table.
 */
export function NeedsAttention({ items, allClear, className }: { items: AttentionView[]; allClear: boolean; className?: string }) {
  const [showAll, setShowAll] = React.useState(false);
  const [open, setOpen] = React.useState<string>();
  const shown = showAll ? items : items.slice(0, MAX_ITEMS);
  return (
    <Card heading="Needs attention" pad="none" className={className} aria-label="Needs attention"
      meta={items.length > 0 ? <span className="tabular-nums">{items.length} {items.length === 1 ? "item" : "items"}</span> : undefined}>
      {items.length === 0 ? (
        allClear ? <p className="flex items-center gap-2 px-4 py-4 text-sm text-fg"><CircleCheck size={16} className="text-ok" aria-hidden />{ALL_CLEAR}</p> : null
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((e) => {
            const Icon = e.severity === "RED" ? OctagonAlert : TriangleAlert;
            const expanded = open === e.id;
            return (
              <li key={e.id} className={cx("px-4 py-3", e.severity === "RED" && "bg-bad-tint/40")}>
                <p className="flex items-start gap-2">
                  <span className={cx("mt-0.5 flex shrink-0 items-center gap-1 text-xs font-semibold", e.severity === "RED" ? "text-bad" : "text-warn")}>
                    <Icon size={16} strokeWidth={1.75} aria-hidden />{e.severity}
                  </span>
                  <span className="text-sm font-semibold text-fg">{e.title}</span>
                </p>
                <p className="mt-1 text-sm text-fg-2">{e.cause}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                  {e.owner && <span className="text-xs text-fg-2">Owner {e.owner}</span>}
                  {e.steps.length > 0 && (
                    <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? undefined : e.id)} className="text-xs font-semibold text-accent hover:underline">
                      {expanded ? "Hide steps" : `Steps (${e.steps.length})`}
                    </button>
                  )}
                  <span className="ml-auto flex items-center gap-3">
                    {e.deadline && <span className="text-xs tabular-nums text-fg-2">by {e.deadline}</span>}
                    {e.action && (
                      <Link to={e.action.to} className="flex h-8 items-center rounded-md border border-line-strong bg-elevated px-3 text-sm font-semibold text-fg hover:border-accent/60">{e.action.label}</Link>
                    )}
                  </span>
                </div>
                {expanded && <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-fg">{e.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
              </li>
            );
          })}
        </ul>
      )}
      {items.length > MAX_ITEMS && (
        <div className="border-t border-line px-4 py-2">
          <button type="button" onClick={() => setShowAll((s) => !s)} className="text-sm font-semibold text-accent hover:underline">
            {showAll ? "Show fewer" : `Show all (${items.length})`}
          </button>
        </div>
      )}
    </Card>
  );
}

/** Label rows for the season marks: above, below, then a second row each side. */
const LANE = ["bottom-4", "top-4", "bottom-9", "top-9"] as const;
/**
 * Alternate labels above and below the line (season48's layout); a label that would overprint a
 * neighbour within 30 % in its row moves to the next free row. "Now" sits in the first row above.
 */
function labelLanes(pcts: number[], nowPct: number): number[] {
  const last: number[] = [nowPct, -Infinity, -Infinity, -Infinity];
  return pcts.map((p, i) => {
    const order = i % 2 ? [1, 0, 3, 2] : [0, 1, 2, 3];
    const lane = order.find((l) => Math.abs(p - last[l]!) >= 30) ?? order[0]!;
    last[lane] = p;
    return lane;
  });
}

/**
 * Season (the mock's "Next resupply" card): the vessel's ETA large, how old that report is, the
 * vessel window as a mini timeline with "now", and the phase line.
 */
export function SeasonPanel({ season, className }: { season: SeasonView; className?: string }) {
  const v = season.vessel;
  const lanes = v ? labelLanes(v.marks.map((m) => m.pct), v.nowPct) : [];
  return (
    <Card heading="Season" className={className} meta={v ? `${v.name} window` : undefined}>
      {v?.eta && (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="text-xs text-fg-2">Vessel ETA at the station</div>
            <div className="font-mono text-headline font-semibold tabular-nums text-fg">{v.eta}</div>
          </div>
          {v.etaReport && <FreshnessChip cls={v.etaReport.freshness} label={`ETA reported ${v.etaReport.age === "just now" ? "just now" : `${v.etaReport.age} ago`}`} />}
        </div>
      )}
      {v && (
        <div className={cx("relative mx-2 h-px bg-line-strong", lanes.some((l) => l > 1) ? "my-12" : "my-7")} role="img"
          aria-label={`${v.name}: ${v.marks.map((m) => m.label).join(", ")}`}>
          {v.marks.map((m, i) => (
            <div key={m.key} className="absolute -top-1.5 h-3" style={{ left: `${m.pct}%` }}>
              <div className={cx("h-3 w-px", m.strong ? "w-0.5 bg-fg" : "bg-fg-2")} />
              <span className={cx("absolute whitespace-nowrap text-xs tabular-nums", m.pct > 85 ? "right-0" : m.pct < 15 ? "left-0" : "-translate-x-1/2", LANE[lanes[i]!], m.strong ? "font-semibold text-fg" : "text-fg-2")}>{m.label}</span>
            </div>
          ))}
          <div className="absolute -top-2.5 h-5" style={{ left: `${v.nowPct}%` }}>
            <div className="h-5 w-0.5 bg-accent" />
            <span className="absolute bottom-6 -translate-x-1/2 text-xs font-semibold text-accent">Now</span>
          </div>
        </div>
      )}
      <p className="text-sm text-fg-2">{season.phaseLine}</p>
    </Card>
  );
}

/** Recent events (the mock's event stream): what, which device, how long ago. */
export function RecentEvents({ events, className }: { events: EventView[]; className?: string }) {
  return (
    <Card heading="Recent events" pad="none" className={className}
      action={<Link to="/audit" className="text-sm font-semibold text-accent hover:underline">Open audit</Link>}>
      {events.length > 0 && (
        <ul className="divide-y divide-line">
          {events.map((e) => (
            <li key={e.id} className="px-4 py-2.5">
              <p className="text-sm text-fg">{e.text}</p>
              <p className="mt-0.5 flex justify-between text-xs text-fg-2"><span className="font-mono">{e.device}</span><span className="tabular-nums">{e.age}</span></p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * The top pending decision (the mock's "Attention required" callout): the verbatim "Decision
 * required.", what happened as the consequence chain, the deadline and the way in.
 */
export function DecisionCallout({ d, className }: { d: DecisionCalloutView; className?: string }) {
  return (
    <section aria-label="Decision required" className={cx("rounded-lg border border-bad/40 bg-surface p-5", className)}>
      <div className="flex flex-wrap items-start gap-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-bad-tint text-bad"><OctagonAlert size={18} strokeWidth={1.75} aria-hidden /></span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
            <span className="font-semibold text-bad">Decision required.</span>
            <span className="font-mono text-xs text-fg-2">{d.id}</span>
            <span className="text-xs text-fg-2">{d.station}</span>
          </p>
          <h2 className="text-heading font-semibold text-fg">{d.title}</h2>
          {d.chain.length > 0 && (
            <ol aria-label="What happened" className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-fg-2">
              {d.chain.map((c, i) => (
                <li key={i} className="flex items-center gap-1.5">{i > 0 && <ChevronRight size={14} className="text-fg-3" aria-hidden />}{c}</li>
              ))}
            </ol>
          )}
          {d.lead && <p className="text-sm text-fg">{d.lead}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          {d.deadline && <span className="text-sm font-semibold text-bad">{d.deadline}</span>}
          <Link to={d.href} className="flex h-9 items-center rounded-md border border-accent bg-accent px-3.5 text-sm font-semibold text-on-accent hover:bg-accent/90">Review decision</Link>
        </div>
      </div>
    </section>
  );
}
