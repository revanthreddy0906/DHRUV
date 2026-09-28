import * as React from "react";
import { Link } from "react-router-dom";
import { OctagonAlert, TriangleAlert, Users, UserX } from "lucide-react";
import type { MissionEval } from "../data/types";
import type { ShipmentView, InventoryView } from "../data/demo";
import { cx, STATE_META, StateBadge, RatioDisplay, Tag, FreshnessChip, FRESH_META, Button } from "./primitives";
import { dayIdx } from "./decisions";

/* ---------- Cargo ---------- */

const AX0 = "10 Jan", AX1 = "1 Mar";
const pos = (d: string) => ((dayIdx(d) - dayIdx(AX0)) / (dayIdx(AX1) - dayIdx(AX0))) * 100;

/** The visual anchor of a shipment (section 9.5): one plain vertical line, "Vessel cutoff 4 Feb". */
export function CutoffMarker({ date, label = "Vessel cutoff" }: { date: string; label?: string }) {
  return (
    <div className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-fg" style={{ left: `${pos(date)}%` }}>
      <span className="absolute -top-5 left-1 whitespace-nowrap text-xs font-semibold tabular-nums text-fg">{label} {date}</span>
    </div>
  );
}

const PRIORITY: Record<ShipmentView["priority"], string> = { CRITICAL: "Critical priority", HIGH: "High priority", NORMAL: "Normal priority" };

/** "2 d slack" as text: amber at 0–2 d, red when negative (section 9.5). Nothing when there is no feeder slack. */
export function SlackText({ slack, state }: { slack: string; state: ShipmentView["slackState"] }) {
  if (!slack || slack === "—") return null;
  return <span className={cx("text-sm tabular-nums", state === "RED" ? "font-semibold text-bad" : state === "AMBER" ? "font-semibold text-warn" : "text-fg-2")}>{slack} slack</span>;
}

/** Inbound feasibility as a word; only uncertain or excluded cargo is coloured. */
export function Feasibility({ value }: { value: ShipmentView["feasible"] }) {
  if (value === "FEASIBLE") return <span className="text-sm text-fg-2">Feasible</span>;
  const red = value === "EXCLUDED";
  const Icon = red ? OctagonAlert : TriangleAlert;
  return <span className={cx("inline-flex items-center gap-1 text-sm font-semibold", red ? "text-bad" : "text-warn")}><Icon size={16} strokeWidth={1.75} aria-hidden />{red ? "Excluded" : "Uncertain"}</span>;
}

const LEG_STATUS: Record<string, string> = { PLANNED: "Planned", IN_TRANSIT: "In transit", DELAYED: "Delayed", DONE: "Done" };

/** A shipment with nothing at risk, collapsed to one row: id, name, priority, slack, state. */
export function ShipmentRow({ s, onExpand }: { s: ShipmentView; onExpand?: () => void }) {
  return (
    <li className="flex h-12 items-center gap-4 px-4">
      <span className="w-16 font-mono text-sm font-semibold text-fg">{s.id}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-fg">{s.contents}</span>
      <span className="w-32 text-sm text-fg-2">{PRIORITY[s.priority]}</span>
      <span className="w-24"><SlackText slack={s.slack} state={s.slackState} /></span>
      <span className="w-24"><Feasibility value={s.feasible} /></span>
      {onExpand && <button type="button" onClick={onExpand} className="text-sm font-semibold text-accent hover:underline" aria-label={`Show legs of ${s.id}`}>Legs</button>}
    </li>
  );
}

export function LegTimeline({ s, today = "24 Jan", originalEta, milestones, onCollapse }: { s: ShipmentView; today?: string; originalEta?: string; milestones?: React.ReactNode; onCollapse?: () => void }) {
  return (
    <article className={cx("rounded-lg border bg-surface p-4", s.feasible === "EXCLUDED" ? "border-bad/60" : s.feasible === "UNCERTAIN" ? "border-warn/50" : "border-line")}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h3 className="font-mono text-heading font-semibold text-fg">{s.id}</h3>
        <span className="text-sm text-fg">{s.contents}</span>
        <span className="text-sm text-fg-2">{PRIORITY[s.priority]}</span>
        <span className="ml-auto flex items-center gap-4">
          <SlackText slack={s.slack} state={s.slackState} />
          <Feasibility value={s.feasible} />
          {onCollapse && <button type="button" onClick={onCollapse} className="text-sm font-semibold text-accent hover:underline">Collapse</button>}
        </span>
      </header>
      {s.note && <p className={cx("mt-2 text-sm font-medium", s.feasible === "EXCLUDED" ? "text-bad" : "text-warn")}>{s.note}</p>}
      <div className="relative mt-7">
        <div className="pointer-events-none absolute inset-y-0 left-[220px] right-[120px]">
          <CutoffMarker date={s.cutoff} />
          <div className="absolute inset-y-0 w-px bg-accent" style={{ left: `${pos(today)}%` }}><span className="absolute -bottom-5 left-1 text-xs font-semibold text-accent">Now</span></div>
        </div>
        <ul className="space-y-2">
          {s.legs.map((l) => {
            const start = l.etd ? pos(l.etd) : 0;
            const end = pos(l.eta);
            const delayed = l.status === "DELAYED";
            return (
              <li key={l.id} className="flex items-center gap-0">
                <div className="w-[220px] shrink-0 pr-3">
                  <div className="text-sm text-fg"><span className="font-mono text-fg-2">{l.id}</span> {l.from} → {l.to}</div>
                  <div className="text-xs text-fg-2">{l.vessel ? "MV Ice Star, " : ""}{(LEG_STATUS[l.status] ?? l.status).toLowerCase()}{l.etd ? `, departs ${l.etd}` : ""}</div>
                  {l.freshness && l.freshness.cls !== "FRESH" && <FreshnessChip cls={l.freshness.cls} label={`ETA report ${l.freshness.age} old`} className="mt-0.5" />}
                </div>
                <div className="relative h-6 flex-1 rounded-sm bg-bg">
                  <div className={cx("absolute inset-y-1 rounded-sm border",
                    l.status === "DONE" ? "border-line-strong bg-elevated" : delayed ? "border-bad bg-bad-tint" : l.vessel ? "border-accent/60 bg-accent-tint" : "border-line-strong bg-elevated",
                    !l.etd && "border-dashed")} style={{ left: `${start}%`, width: `${Math.max(1, end - start)}%` }} />
                  {delayed && originalEta && <div className="absolute inset-y-0.5 w-px border-l border-dashed border-fg-2" style={{ left: `${pos(originalEta)}%` }} title={`Original ETA ${originalEta}`} />}
                </div>
                <div className={cx("w-[120px] shrink-0 pl-3 text-sm tabular-nums", delayed ? "font-semibold text-bad" : "text-fg-2")}>
                  ETA {l.eta}{delayed && originalEta && <span className="block text-xs font-normal text-fg-2">was {originalEta}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="ml-[220px] mr-[120px] mt-6 flex justify-between text-xs tabular-nums text-fg-2"><span>{AX0}</span><span>1 Feb</span><span>15 Feb</span><span>{AX1}</span></div>
      {milestones}
    </article>
  );
}

/* ---------- Inventory ---------- */

export function RequirementBreakdown({ rows }: { rows: NonNullable<InventoryView["breakdown"]> }) {
  return (
    <table className="font-mono text-xs">
      <tbody>{rows.map((r) => (
        <tr key={r.phase}><td className="pr-3 text-fg-2">{r.phase}</td><td className="pr-3 text-fg-2">{r.calc}</td><td className="text-right text-fg">{r.value}</td></tr>
      ))}</tbody>
    </table>
  );
}

export function InventoryRow({ i, expanded, unverified, href }: { i: InventoryView; expanded?: boolean; unverified?: boolean; /** Live: the item's stock card. */ href?: string }) {
  const f = FRESH_META[i.freshness.cls];
  return (
    <>
      <tr className={cx("border-t border-line align-top", i.state === "RED" && "bg-bad-tint/50")}>
        <td className="py-2.5 pr-3">
          {href ? <Link to={href} className="text-sm font-medium text-accent hover:underline">{i.name}</Link> : <div className="text-sm font-medium text-fg">{i.name}</div>}
          <div className="font-mono text-xs text-fg-2">{i.id} · {i.unit}</div>
          {unverified && <Tag tone="amber" className="mt-1">unverified · stock under review</Tag>}
        </td>
        <td className={cx("py-2.5 pr-3 text-right font-mono text-sm text-fg", f.bg)}>{i.stock}</td>
        <td className="py-2.5 pr-3 font-mono text-xs text-fg-2">{i.inbound}</td>
        <td className="py-2.5 pr-3 text-right font-mono text-sm text-fg">{i.requirement}<div className="text-xs text-fg-2">reserve {i.reserve}</div></td>
        <td className="py-2.5 pr-3"><div className="flex items-center gap-2"><RatioDisplay value={i.ratio} state={i.state === "GREEN" ? undefined : i.state} /><StateBadge state={i.state} size="sm" /></div></td>
        <td className="py-2.5 pr-3 font-mono text-xs text-fg-2">{i.cover ?? "fixed requirement"}</td>
        <td className="py-2.5 pr-3"><FreshnessChip cls={i.freshness.cls} label={`${i.freshness.age} · ${i.freshness.counted}`} /></td>
      </tr>
      {expanded && i.breakdown && (
        <tr><td /><td colSpan={6} className="pb-3">
          <div className="flex gap-6 rounded-md border border-line bg-bg p-2.5">
            <div><div className="mb-1 text-xs text-fg-2">Requirement by phase</div><RequirementBreakdown rows={i.breakdown} /></div>
            {i.note && <p className="self-center text-xs text-fg-2">{i.note}</p>}
          </div>
        </td></tr>
      )}
    </>
  );
}

/* ---------- Personnel & missions ---------- */

export function RoleCoverage({ roles }: { roles: { role: string; have: number; need: number; state: "GREEN" | "AMBER" | "RED"; names: string[] }[] }) {
  return (
    <ul className="grid grid-cols-4 gap-2">
      {roles.map((r) => {
        const state = r.state; // engine R05
        const m = STATE_META[state];
        return (
          <li key={r.role} className={cx("rounded-lg border p-3", state === "GREEN" ? "border-line bg-surface" : cx(m.border, m.tint))}>
            <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-sm font-medium text-fg"><Users size={13} className="text-fg-2" aria-hidden />{r.role}</span><StateBadge state={state} size="sm" /></div>
            <div className="mt-2 font-mono text-heading font-semibold text-fg">{r.have} <span className="text-sm text-fg-2">/ need {r.need}</span></div>
            <div className="text-xs text-fg-2">GREEN needs need + 1{r.names.length > 0 && <> · {r.names.join(", ")}</>}</div>
          </li>
        );
      })}
    </ul>
  );
}

export function MissionRow({ m, doubleAssigned, canEdit = true, reason }: { m: MissionEval; doubleAssigned?: boolean; canEdit?: boolean; reason?: string }) {
  const tone = m.status === "OK" || m.status === "DEFERRED" ? "border-line-strong text-fg-2" : m.status === "AT_RISK" ? "border-warn/50 text-warn bg-warn-tint" : "border-bad/50 text-bad bg-bad-tint";
  const Icon = m.status === "OK" || m.status === "DEFERRED" ? STATE_META.GREEN.Icon : m.status === "AT_RISK" ? STATE_META.AMBER.Icon : STATE_META.RED.Icon;
  return (
    <tr className="border-t border-line align-top">
      <td className="whitespace-nowrap py-2.5 pr-3 font-mono text-sm font-bold text-fg">{m.id}</td>
      <td className="py-2.5 pr-3"><div className="text-sm text-fg">{m.name}</div><div className="font-mono text-xs text-fg-2">{m.dates} · diesel {m.fuel}</div></td>
      <td className="py-2.5 pr-3 text-xs text-fg-2">{[...m.people, ...m.assets].join(", ") || "2 people (generated)"}</td>
      <td className="py-2.5 pr-3"><span className={cx("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-bold", tone)}><Icon size={12} aria-hidden />{m.status}</span>
        {doubleAssigned && <Tag tone="amber" className="ml-1"><UserX size={11} aria-hidden />double-assigned</Tag>}
        <div className="mt-1 text-xs text-fg-2">{m.why}</div></td>
      <td className="py-2.5 text-right"><Button size="sm" disabledReason={canEdit ? undefined : reason}>Set status</Button></td>
    </tr>
  );
}

