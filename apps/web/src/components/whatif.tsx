import * as React from "react";
import { FlaskConical, X, ArrowRight, Sigma } from "lucide-react";
import type { Health } from "../data/types";
import { SCENARIOS, WHATIF_BURN15 } from "../data/demo";
import { cx, Button, StateBadge, RatioDisplay, SectionHeader } from "./primitives";

export function ScenarioPicker({ value, onChange }: { value: string; onChange?: (id: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Scenario" className="grid grid-cols-2 gap-1.5">
      {SCENARIOS.map((s) => (
        <button key={s.id} role="radio" aria-checked={value === s.id} type="button" onClick={() => onChange?.(s.id)}
          className={cx("rounded-lg border p-2 text-left", value === s.id ? "border-accent bg-accent-tint" : "border-line hover:border-line-strong")}>
          <div className="text-[12px] font-semibold text-fg">{s.label}</div>
          <div className="font-mono text-[10px] text-fg-2">{s.input} · {s.overlay}</div>
        </button>
      ))}
    </div>
  );
}

export function BeforeAfter({ before, after }: { before: { state: Health; ratio: number; sub: string }; after: { state: Health; ratio: number; sub: string } }) {
  const Col = ({ t, v }: { t: string; v: typeof before }) => (
    <div className="flex-1 rounded-lg border border-line bg-bg p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-2">{t}</div>
      <div className="mt-1 flex items-baseline gap-2"><RatioDisplay value={v.ratio} size="xl" state={v.state === "GREEN" ? undefined : v.state} /><StateBadge state={v.state} size="sm" /></div>
      <p className="mt-1.5 text-[12px] text-fg-2">{v.sub}</p>
    </div>
  );
  return <div className="flex items-stretch gap-2"><Col t="Now" v={before} /><ArrowRight className="self-center text-fg-2" size={16} aria-hidden /><Col t="If this happens" v={after} /></div>;
}

/** Same engine on an overlay. Never commits: Apply as proposal → DECISION_PROPOSED. */
export function WhatIfDrawer({ onClose, onApply, onDiscard, role = "HQ_OPS" }: { onClose?: () => void; onApply?: () => void; onDiscard?: () => void; role?: string }) {
  const [sc, setSc] = React.useState("burn");
  const w = WHATIF_BURN15;
  return (
    <aside role="dialog" aria-label="What-if" className="absolute inset-y-0 right-0 z-40 flex w-[480px] flex-col border-l-2 border-accent bg-surface shadow-drawer">
      <header className="flex items-center gap-2 border-b border-line px-5 py-4">
        <FlaskConical size={17} className="text-accent" aria-hidden />
        <h2 className="flex-1 text-base font-semibold">What-if · Maitri</h2>
        <span className="rounded border border-accent/60 px-1.5 font-mono text-[10px] font-bold tracking-widest text-accent">SIMULATION</span>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-fg-2 hover:bg-elevated"><X size={16} /></button>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
        <ScenarioPicker value={sc} onChange={setSc} />
        <div>
          <label className="flex items-center justify-between text-[12px] text-fg-2"><span>Burn rate change</span><span className="font-mono font-semibold text-fg">+15 %</span></label>
          <input type="range" min={-20} max={30} defaultValue={15} aria-label="Burn rate change percent" className="mt-1 w-full accent-accent" />
        </div>
        <p className="rounded-md border border-line bg-bg px-3 py-2 text-[12px] text-fg"><span className="font-semibold">Changed assumption:</span> {w.assumption}</p>
        <SectionHeader title="Fuel · before and after" />
        <BeforeAfter before={{ state: w.before.state, ratio: w.before.ratio, sub: `R ${w.before.R} kL · ${w.before.slip}` }} after={{ state: w.after.state, ratio: w.after.ratio, sub: w.after.slip }} />
        <p className="font-mono text-[11px] text-fg-2">[R03] {w.after.formula} = 0.9223 -&gt; RED</p>
        <SectionHeader title="Options that still work" />
        <div className="rounded-lg border border-warn/50 bg-warn-tint/50 p-3">
          <div className="flex items-center gap-2"><span className="font-mono text-[11px] text-fg">+ {w.withLevers.levers.join(" + ")}</span><StateBadge state={w.withLevers.state} size="sm" className="ml-auto" /><RatioDisplay value={w.withLevers.ratio} state="AMBER" /></div>
          <p className="mt-1 font-mono text-[10.5px] text-fg-2">{w.withLevers.formula} · act by {w.withLevers.deadline}</p>
        </div>
        <p className="text-[12px] text-fg-2"><span className="font-semibold text-fg">PNR:</span> {w.pnr}. <span className="font-semibold text-fg">Missions:</span> {w.missions}.</p>
        <button type="button" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent"><Sigma size={14} aria-hidden />Show the math for the new result</button>
      </div>
      <footer className="flex gap-2 border-t border-line px-5 py-3">
        <Button variant="primary" onClick={onApply} disabledReason={role === "FIELD_LEAD" ? "Field Leads cannot propose decisions" : undefined}>Apply as proposal</Button>
        <Button onClick={onDiscard}>Discard</Button>
        <span className="ml-auto self-center text-[11px] text-fg-2">Overlay is never written to the log</span>
      </footer>
    </aside>
  );
}
