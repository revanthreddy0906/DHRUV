import * as React from "react";
import { Sigma } from "lucide-react";
import type { DimensionEval } from "@dhruv/engine";
import type { Freshness, MissionEval } from "../data/types";
import { DIMENSION_LABEL, dimensionHeadline, dimensionReason, formatAge, formatRatio } from "../format";
import { cx, FreshnessChip, StateBadge } from "./primitives";

/**
 * The six dimensions of one station (section 9.1, L2). Every value is the engine's; this only
 * formats it. RED and AMBER rows take their tint, GREEN stays plain.
 */
export function DimensionsTable({ dimensions, now, onShowMath }: { dimensions: DimensionEval[]; now: string; onShowMath: (key: string) => void }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-elevated text-left text-xs text-fg-2">
        <tr>
          <th scope="col" className="px-4 py-2 font-semibold">Dimension</th>
          <th scope="col" className="px-3 py-2 font-semibold">State</th>
          <th scope="col" className="px-3 py-2 text-right font-semibold">Headline</th>
          <th scope="col" className="px-3 py-2 text-right font-semibold">Ratio</th>
          <th scope="col" className="px-3 py-2 font-semibold">Why</th>
          <th scope="col" className="px-3 py-2 font-semibold">Data age</th>
          <th scope="col" className="px-4 py-2"><span className="sr-only">Show the math</span></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {dimensions.map((d) => {
          const label = DIMENSION_LABEL[d.key] ?? d.key;
          const critical = d.freshness === "CRITICAL";
          const straddle = d.confidence?.straddles ? ` ${d.confidence.text}.` : "";
          return (
            <tr key={d.key} className={cx("h-12", d.state === "RED" ? "bg-bad-tint" : d.state === "AMBER" ? "bg-warn-tint" : "")}>
              <th scope="row" className="px-4 py-2 text-left font-semibold text-fg">{label}</th>
              <td className="px-3 py-2"><StateBadge state={d.state} size="sm" /></td>
              <td className={cx("whitespace-nowrap px-3 py-2 text-right font-mono text-heading font-semibold tabular-nums text-fg", critical && "dh-critical", d.freshness === "STALE" && "dh-stale")}>
                {dimensionHeadline(d)}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-fg-2">{d.ratio !== null ? formatRatio(d.ratio) : ""}</td>
              <td className="px-3 py-2 text-fg">{dimensionReason(d)}{straddle}</td>
              <td className="whitespace-nowrap px-3 py-2">
                {d.observedAt && d.freshness && <FreshnessChip cls={d.freshness as Freshness} label={formatAge(d.observedAt, now)} />}
              </td>
              <td className="px-4 py-2 text-right">
                <button type="button" onClick={() => onShowMath(d.key)} aria-label={`Show the math: ${label}`}
                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-sm font-semibold text-accent hover:bg-accent-tint">
                  <Sigma size={16} strokeWidth={1.75} aria-hidden />Show the math
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Missions at the station; only those not OK are coloured. */
export function MissionList({ missions }: { missions: MissionEval[] }) {
  return (
    <ul className="divide-y divide-line">
      {missions.map((m) => (
        <li key={m.id} className="flex flex-wrap items-baseline gap-x-3 py-2 text-sm">
          <span className="w-12 shrink-0 font-mono text-fg-2">{m.id}</span>
          <span className="min-w-0 flex-1 text-fg">{m.name}<span className="ml-2 text-xs text-fg-2">{m.dates}</span></span>
          <span className={cx("shrink-0 text-xs", m.status === "OK" ? "text-fg-2" : m.status === "AT_RISK" ? "font-semibold text-warn" : "font-semibold text-bad")}>
            {m.status === "OK" ? "On plan" : m.status === "AT_RISK" ? "At risk" : "Blocked"}
          </span>
          {m.status !== "OK" && <span className="w-full basis-full pl-15 text-xs text-fg-2">{m.why}</span>}
        </li>
      ))}
    </ul>
  );
}

/** A collapsed disclosure: deeper levels open by click (section 3.2). */
export function Disclosure({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border border-line bg-surface">
      <summary className="cursor-pointer list-none px-4 py-3 text-heading font-semibold text-fg marker:hidden">
        <span className="mr-2 inline-block text-fg-2 transition-transform group-open:rotate-90" aria-hidden>›</span>{title}
      </summary>
      <div className="space-y-4 border-t border-line p-4">{children}</div>
    </details>
  );
}
