import * as React from "react";
import { Fuel, Utensils, HeartPulse, Cog, Users, RadioTower, Sigma, Anchor, CalendarClock, ArrowRight } from "lucide-react";
import type { DimensionEval, StationEval, LinkStatus, Health } from "../data/types";
import { DIM_LABEL } from "../data/demo";
import { cx, STATE_META, StateBadge, FreshnessChip, RatioDisplay, CountdownChip, GateBanner, Tag } from "./primitives";
import { LinkChip } from "./shell";

const DIM_ICON = { FUEL: Fuel, FOOD: Utensils, MEDICAL: HeartPulse, SPARES_POWER: Cog, PERSONNEL: Users, COMMS: RadioTower } as const;

/** One of the six readiness dimensions: colour + word + icon, ratio, freshness. */
export function DimensionChip({ dim, onClick, emphasis }: { dim: DimensionEval; onClick?: () => void; emphasis?: boolean }) {
  const m = STATE_META[dim.state];
  const Icon = DIM_ICON[dim.key];
  const stale = dim.freshness?.cls === "STALE" || dim.freshness?.cls === "CRITICAL";
  return (
    <button type="button" onClick={onClick}
      className={cx("group flex min-w-0 flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-colors duration-150",
        dim.state === "GREEN" ? "border-line bg-bg/40 hover:border-line-strong" : cx(m.border, m.tint),
        emphasis && "ring-1 ring-bad/60")}
      aria-label={`${DIM_LABEL[dim.key]}: ${dim.state}${dim.ratio !== undefined ? `, ratio ${dim.ratio}` : ""}${dim.freshness ? `, ${dim.freshness.label}, ${dim.freshness.cls}` : ""}`}>
      <span className="flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium text-fg"><Icon size={13} className="shrink-0 text-fg-2" aria-hidden />{DIM_LABEL[dim.key]}</span>
      <div className="flex items-baseline justify-between gap-2">
        {dim.ratio !== undefined
          ? <RatioDisplay value={dim.ratio} state={dim.state === "GREEN" ? undefined : dim.state} size="lg" stale={stale} />
          : <span className="font-mono text-[13px] text-fg-2">{dim.ratioText ?? "—"}</span>}
        <span className={cx("flex shrink-0 items-center gap-1 text-[10px] font-bold tracking-wide", m.text)}><m.Icon size={12} aria-hidden />{m.word}</span>
      </div>
      {dim.straddleText && <span className="text-[11px] font-semibold leading-4 text-warn">{dim.straddleText}</span>}
      {dim.freshness && <FreshnessChip cls={dim.freshness.cls} label={dim.freshness.age} className="-ml-1.5" />}
    </button>
  );
}

/** v2 N2: under the Fuel chip. */
export function SlipToleranceLine({ slip }: { slip: StationEval["slip"] }) {
  const breach = slip.kind === "breach";
  return (
    <div className={cx("flex items-start gap-2 text-[12px] leading-4", breach ? "text-fg" : "text-fg-2")}>
      <CalendarClock size={13} className={cx("mt-px shrink-0", breach ? "text-bad" : "text-fg-2")} aria-hidden />
      <span>
        <span className="font-semibold text-fg">{breach ? "Reserve breach" : `Slip tolerance ${slip.days} d`}</span>
        <span className="text-fg-2"> · {slip.text}</span>
      </span>
    </div>
  );
}

/** v2 C8 / R18: the stock-table baseline shown next to the engine. */
export function BaselineB0Badge({ alerts, engineState, text }: { alerts: number; engineState: Health; text: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-line-strong px-2 py-1.5 text-[11px]">
      <span className="font-mono font-semibold text-fg-2">B0</span>
      <span className="text-fg-2">{text}</span>
      <ArrowRight size={12} className="text-fg-2" aria-hidden />
      <span className="text-fg-2">Engine:</span>
      <StateBadge state={engineState} size="sm" />
      {alerts === 0 && engineState !== "GREEN" && <span className="text-fg-2">A stock table sees nothing; the engine sees the missed cutoff.</span>}
    </div>
  );
}

export function StationCard({ station, link, onShowMath, onOpenDimension, compact, animateIndex }: {
  station: StationEval; onShowMath?: () => void; onOpenDimension?: (k: string) => void; compact?: boolean; animateIndex?: number;
  /** Live link as this device knows it: its own status, or only the last-heard age for another station. */
  link?: { status?: LinkStatus; age?: string };
}) {
  const worst = station.dimensions.find((d) => d.state === station.state && d.state !== "GREEN");
  const ctx = station.state === "GREEN" ? "All dimensions within thresholds" : `${worst ? DIM_LABEL[worst.key] : ""} below required threshold`;
  const fuel = station.dimensions.find((d) => d.key === "FUEL");
  return (
    <article aria-labelledby={`st-${station.nodeId}`}
      className={cx("rounded-xl border bg-surface p-5", station.state === "RED" ? "border-bad/60" : station.state === "AMBER" ? "border-warn/50" : "border-line")}>
      <header className="mb-3 flex flex-wrap items-center gap-3">
        <h2 id={`st-${station.nodeId}`} className="text-lg font-semibold text-fg">{station.name}</h2>
        <StateBadge state={station.state} context={ctx} size={compact ? "md" : "lg"} className={animateIndex !== undefined ? "dh-cascade-in" : undefined} />
        <span className="ml-auto">{link ? <LinkChip node="Link" status={link.status} age={link.age} /> : <LinkChip node="Link" status={station.link.status as LinkStatus} age={station.link.status !== "ONLINE" ? `last contact ${station.link.lastContact}` : undefined} />}</span>
      </header>

      {station.gates.length > 0 && <div className="mb-3 space-y-1.5">{station.gates.map((g) => <GateBanner key={g}>{g}</GateBanner>)}</div>}

      {station.driver && (
        <p className="mb-3 flex items-center gap-2 text-sm text-fg">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-2">Driver</span>
          <span className="font-medium">{station.driver}</span>
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        {station.dimensions.map((d) => <DimensionChip key={d.key} dim={d} emphasis={d.state === "RED"} onClick={() => onOpenDimension?.(d.key)} />)}
      </div>

      {fuel && (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          {fuel.band && (
            <div className="font-mono text-[11px] text-fg-2">
              Fuel band {fuel.band.low.toFixed(4)}{fuel.band.high !== undefined ? ` – ${fuel.band.high.toFixed(4)}` : ""} · {fuel.band.straddles ? <span className="font-semibold text-warn">straddles</span> : "no straddle"}
              {fuel.freshness && <> · {fuel.freshness.label} ({fuel.freshness.cls})</>}
            </div>
          )}
          <SlipToleranceLine slip={station.slip} />
          {station.b0 && <BaselineB0Badge alerts={station.b0.alerts} engineState={fuel.state} text={station.b0.text} />}
        </div>
      )}

      {station.footnote && <p className="mt-3 text-[11px] text-fg-2">{station.footnote}</p>}

      <footer className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {station.missions.map((m) => (
          <Tag key={m.id} tone={m.status === "OK" ? "neutral" : m.status === "AT_RISK" ? "amber" : "red"}>
            <span className="font-mono">{m.id}</span> {m.status}
          </Tag>
        ))}
        {station.pnr && <CountdownChip date={station.pnr.date.replace(" 2027", "")} daysLeft={station.pnr.daysLeft} label="Point of no return" />}
        {(
          <button type="button" onClick={onShowMath} className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-semibold text-accent hover:bg-accent-tint">
            <Sigma size={14} aria-hidden />Show the math
          </button>
        )}
      </footer>
    </article>
  );
}

/** Top strip: phase, days to resupply, vessel window, link chips, PNR. */
export function PnrStrip({ phase, daysToResupply, links, pnr, vessel }: {
  phase: string; daysToResupply: number; links: { node: string; status?: LinkStatus; age?: string }[]; pnr?: { date: string; daysLeft: number };
  vessel: { name: string; loadCutoff: string; departs: string; eta: string; closing: string };
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-surface/60 px-5 py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] uppercase tracking-wider text-fg-2">Phase</span>
        <span className="font-mono text-sm font-semibold text-fg">{phase}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] uppercase tracking-wider text-fg-2">Next resupply</span>
        <span className="font-mono text-sm font-semibold text-fg">20 Nov 2027 · {daysToResupply} d</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-fg-2">
        <Anchor size={13} aria-hidden />
        <span className="text-fg">{vessel.name}</span>
        <span className="font-mono">cutoff {vessel.loadCutoff} · departs {vessel.departs} · ETA {vessel.eta} · closing {vessel.closing}</span>
      </div>
      <div className="flex items-center gap-2">{links.map((l) => <LinkChip key={l.node} {...l} />)}</div>
      <div className="ml-auto">
        {pnr ? (
          <span className="inline-flex items-center gap-2 rounded-lg border border-bad/60 bg-bad-tint px-3 py-1.5" role="status" aria-live="polite">
            <span className="text-[11px] font-bold uppercase tracking-wider text-bad">Point of no return</span>
            <span className="font-mono text-base font-bold text-fg">PNR: {pnr.date.replace(" 2027", "")} ({pnr.daysLeft} days)</span>
          </span>
        ) : <span className="text-xs text-fg-2">No point of no return active</span>}
      </div>
    </div>
  );
}
