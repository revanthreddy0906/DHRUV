import * as React from "react";
import { Ship, TriangleAlert, Users, UserX } from "lucide-react";
import type { MissionEval } from "../data/types";
import type { ShipmentView, InventoryView } from "../data/demo";
import { cx, STATE_META, StateBadge, RatioDisplay, SlackBadge, Tag, FreshnessChip, FRESH_META, Button } from "./primitives";
import { dayIdx } from "./decisions";

/* ---------- Cargo ---------- */

const AX0 = "10 Jan", AX1 = "1 Mar";
const pos = (d: string) => ((dayIdx(d) - dayIdx(AX0)) / (dayIdx(AX1) - dayIdx(AX0))) * 100;

export function CutoffMarker({ date, label = "Vessel load cutoff" }: { date: string; label?: string }) {
  return (
    <div className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-warn" style={{ left: `${pos(date)}%` }}>
      <span className="absolute -top-5 left-1 whitespace-nowrap font-mono text-[10px] font-semibold text-warn">{label} {date}</span>
    </div>
  );
}

export function LegTimeline({ s, today = "24 Jan", originalEta }: { s: ShipmentView; today?: string; originalEta?: string }) {
  const feasTone = s.feasible === "FEASIBLE" ? "green" : s.feasible === "EXCLUDED" ? "red" : "amber";
  return (
    <article className={cx("rounded-xl border bg-surface p-4", s.feasible === "EXCLUDED" ? "border-bad/60" : s.feasible === "UNCERTAIN" ? "border-warn/50" : "border-line")}>
      <header className="flex flex-wrap items-center gap-2">
        <Ship size={15} className="text-fg-2" aria-hidden />
        <h3 className="font-mono text-sm font-bold text-fg">{s.id}</h3>
        <span className="text-sm text-fg">{s.contents}</span>
        <Tag tone={s.priority === "CRITICAL" ? "red" : s.priority === "HIGH" ? "amber" : "neutral"}>{s.priority}</Tag>
        <span className="ml-auto flex items-center gap-2">
          <SlackBadge slack={s.slack} state={s.slackState} />
          <Tag tone={feasTone as any}>{s.feasible}</Tag>
        </span>
      </header>
      {s.note && <p className={cx("mt-2 flex items-center gap-1.5 text-[12px] font-medium", s.feasible === "EXCLUDED" ? "text-bad" : "text-warn")}><TriangleAlert size={13} aria-hidden />{s.note}</p>}
      <div className="relative mt-6">
        <div className="pointer-events-none absolute inset-y-0 left-[200px] right-[120px]">
          <CutoffMarker date={s.cutoff} />
          <div className="absolute inset-y-0 w-px bg-accent/80" style={{ left: `${pos(today)}%` }}><span className="absolute -bottom-4 left-1 font-mono text-[10px] text-accent">now</span></div>
        </div>
        <ul className="space-y-1.5">
          {s.legs.map((l) => {
            const start = l.etd ? pos(l.etd) : 0;
            const end = pos(l.eta);
            const delayed = l.status === "DELAYED";
            return (
              <li key={l.id} className="flex items-center gap-0">
                <div className="w-[200px] shrink-0 pr-3">
                  <div className="font-mono text-[11px] text-fg"><b>{l.id}</b> {l.from} → {l.to}</div>
                  <div className="font-mono text-[10px] text-fg-2">{l.vessel ? "MV Ice Star · " : ""}{l.status}{l.etd ? ` · ETD ${l.etd}` : " · ETD not in seed"}</div>
                  {l.freshness && <FreshnessChip cls={l.freshness.cls} label={`ETA report ${l.freshness.age}`} className="-ml-1.5 mt-0.5" />}
                </div>
                <div className="relative h-6 flex-1 rounded bg-bg">
                  <div className={cx("absolute inset-y-1 rounded-sm border",
                    l.status === "DONE" ? "border-line-strong bg-fg-3/30" : delayed ? "border-bad bg-bad/35" : l.vessel ? "border-accent/60 bg-accent/20" : "border-line-strong bg-elevated",
                    !l.etd && "border-dashed")} style={{ left: `${start}%`, width: `${Math.max(1, end - start)}%` }} />
                  {delayed && originalEta && <div className="absolute inset-y-0.5 w-px border-l border-dashed border-fg-2" style={{ left: `${pos(originalEta)}%` }} title={`Original ETA ${originalEta}`} />}
                </div>
                <div className={cx("w-[120px] shrink-0 pl-3 font-mono text-[11px]", delayed ? "font-bold text-bad" : "text-fg-2")}>
                  ETA {l.eta}{delayed && originalEta && <span className="block text-[10px] font-normal text-fg-2">was {originalEta}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="ml-[200px] mr-[120px] mt-5 flex justify-between font-mono text-[10px] text-fg-2"><span>{AX0}</span><span>1 Feb</span><span>15 Feb</span><span>{AX1}</span></div>
    </article>
  );
}

/* ---------- Inventory ---------- */

export function RequirementBreakdown({ rows }: { rows: NonNullable<InventoryView["breakdown"]> }) {
  return (
    <table className="font-mono text-[11px]">
      <tbody>{rows.map((r) => (
        <tr key={r.phase}><td className="pr-3 text-fg-2">{r.phase}</td><td className="pr-3 text-fg-2">{r.calc}</td><td className="text-right text-fg">{r.value}</td></tr>
      ))}</tbody>
    </table>
  );
}

export function InventoryRow({ i, expanded, unverified }: { i: InventoryView; expanded?: boolean; unverified?: boolean }) {
  const f = FRESH_META[i.freshness.cls];
  return (
    <>
      <tr className={cx("border-t border-line align-top", i.state === "RED" && "bg-bad-tint/50")}>
        <td className="py-2.5 pr-3">
          <div className="text-sm font-medium text-fg">{i.name}</div>
          <div className="font-mono text-[10px] text-fg-2">{i.id} · {i.unit}</div>
          {unverified && <Tag tone="amber" className="mt-1">unverified · stock under review</Tag>}
        </td>
        <td className={cx("py-2.5 pr-3 text-right font-mono text-sm text-fg", f.bg)}>{i.stock}</td>
        <td className="py-2.5 pr-3 font-mono text-[12px] text-fg-2">{i.inbound}</td>
        <td className="py-2.5 pr-3 text-right font-mono text-sm text-fg">{i.requirement}<div className="text-[10px] text-fg-2">reserve {i.reserve}</div></td>
        <td className="py-2.5 pr-3"><div className="flex items-center gap-2"><RatioDisplay value={i.ratio} state={i.state === "GREEN" ? undefined : i.state} /><StateBadge state={i.state} size="sm" /></div></td>
        <td className="py-2.5 pr-3 font-mono text-[12px] text-fg-2">{i.cover ?? "fixed requirement"}</td>
        <td className="py-2.5 pr-3"><FreshnessChip cls={i.freshness.cls} label={`${i.freshness.age} · ${i.freshness.counted}`} /></td>
      </tr>
      {expanded && i.breakdown && (
        <tr><td /><td colSpan={6} className="pb-3">
          <div className="flex gap-6 rounded-md border border-line bg-bg p-2.5">
            <div><div className="mb-1 text-[10px] uppercase tracking-wider text-fg-2">Requirement by phase</div><RequirementBreakdown rows={i.breakdown} /></div>
            {i.note && <p className="self-center text-[12px] text-fg-2">{i.note}</p>}
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
            <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-[13px] font-medium text-fg"><Users size={13} className="text-fg-2" aria-hidden />{r.role}</span><StateBadge state={state} size="sm" /></div>
            <div className="mt-2 font-mono text-lg font-semibold text-fg">{r.have} <span className="text-sm text-fg-2">/ need {r.need}</span></div>
            <div className="text-[11px] text-fg-2">GREEN needs need + 1{r.names.length > 0 && <> · {r.names.join(", ")}</>}</div>
          </li>
        );
      })}
    </ul>
  );
}

export function MissionRow({ m, doubleAssigned, canEdit = true, reason }: { m: MissionEval; doubleAssigned?: boolean; canEdit?: boolean; reason?: string }) {
  const tone = m.status === "OK" ? "border-line-strong text-fg-2" : m.status === "AT_RISK" ? "border-warn/50 text-warn bg-warn-tint" : "border-bad/50 text-bad bg-bad-tint";
  const Icon = m.status === "OK" ? STATE_META.GREEN.Icon : m.status === "AT_RISK" ? STATE_META.AMBER.Icon : STATE_META.RED.Icon;
  return (
    <tr className="border-t border-line align-top">
      <td className="whitespace-nowrap py-2.5 pr-3 font-mono text-sm font-bold text-fg">{m.id}</td>
      <td className="py-2.5 pr-3"><div className="text-sm text-fg">{m.name}</div><div className="font-mono text-[11px] text-fg-2">{m.dates} · diesel {m.fuel}</div></td>
      <td className="py-2.5 pr-3 text-[12px] text-fg-2">{[...m.people, ...m.assets].join(", ") || "2 people (generated)"}</td>
      <td className="py-2.5 pr-3"><span className={cx("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-bold", tone)}><Icon size={12} aria-hidden />{m.status}</span>
        {doubleAssigned && <Tag tone="amber" className="ml-1"><UserX size={11} aria-hidden />double-assigned</Tag>}
        <div className="mt-1 text-[11px] text-fg-2">{m.why}</div></td>
      <td className="py-2.5 text-right"><Button size="sm" disabledReason={canEdit ? undefined : reason}>Set status</Button></td>
    </tr>
  );
}

