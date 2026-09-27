import * as React from "react";
import { X, Sigma, CornerDownRight, Printer, MessageSquareText } from "lucide-react";
import type { TraceStep as TStep } from "../data/types";
import { cx, STATE_META, Button } from "./primitives";

/** "[R03] Diesel availability vs requirement: 92.0 / 132.0 = 0.697 -> RED" */
export const traceText = (s: TStep) =>
  s.formula ? `[${s.rule}] ${s.title}: ${s.formula} -> ${s.result}` : `[${s.rule}] ${s.title}: ${s.result}`;

export function TraceFormula({ children }: { children: React.ReactNode }) {
  return <code className="block rounded-md border border-line bg-bg px-2.5 py-1.5 font-mono text-[12px] leading-5 text-fg">{children}</code>;
}

export function TraceConnector({ last }: { last?: boolean }) {
  return <div aria-hidden className={cx("absolute left-[15px] top-8 w-px bg-line-strong", last ? "h-0" : "bottom-[-12px]")} />;
}

export function TraceStep({ step, index, last, animate, onRef }: { step: TStep; index: number; last?: boolean; animate?: boolean; onRef?: (r: { type: string; id: string }) => void }) {
  const st = step.resultState ? STATE_META[step.resultState] : undefined;
  return (
    <li className={cx("relative pl-10", animate && "dh-cascade-in", step.muted && "opacity-70")} style={animate ? { animationDelay: `calc(var(--cascade-step) * ${index})` } : undefined}>
      <TraceConnector last={last} />
      <span className={cx("absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-md border font-mono text-[10px] font-bold",
        step.muted ? "border-dashed border-line-strong text-fg-2" : st ? cx(st.border, st.tint, st.text) : "border-line-strong bg-elevated text-fg")}>{step.rule}</span>
      <div className="pb-4">
        <div className="flex min-h-8 items-start justify-between gap-2">
          <p className={cx("pt-1.5 font-mono text-[12px] leading-5", step.muted ? "text-fg-2" : "text-fg")}>{traceText(step)}</p>
          {st && <span className={cx("mt-1.5 flex shrink-0 items-center gap-1 text-[11px] font-bold", st.text)}><st.Icon size={12} aria-hidden />{st.word}</span>}
        </div>
        {Object.keys(step.inputs).length > 0 && (
          <dl className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px]">
            {Object.entries(step.inputs).map(([k, v]) => (
              <div key={k} className="flex gap-1"><dt className="text-fg-2">{k}</dt><dd className="text-fg">{v}</dd></div>
            ))}
          </dl>
        )}
        {step.refs.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {step.refs.map((r) => (
              <button key={r.type + r.id} type="button" onClick={() => onRef?.(r)} className="inline-flex items-center gap-1 rounded border border-line px-1.5 font-mono text-[10px] text-accent hover:border-accent/60">
                <CornerDownRight size={10} aria-hidden />{r.type}:{r.id}
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

/** Wraps children so each reveals 250 ms after the previous (respects reduced motion via CSS). */
export function CascadeAnimation({ children, run = true }: { children: React.ReactNode; run?: boolean }) {
  const items = React.Children.toArray(children);
  return <>{items.map((c, i) => <div key={i} className={run ? "dh-cascade-in" : undefined} style={run ? { animationDelay: `calc(var(--cascade-step) * ${i})` } : undefined}>{c}</div>)}</>;
}

export function TraceList({ steps, animate, onRef }: { steps: TStep[]; animate?: boolean; onRef?: (r: { type: string; id: string }) => void }) {
  return <ol className="mt-1" aria-live={animate ? "polite" : undefined}>{steps.map((s, i) => <TraceStep key={i} step={s} index={i} last={i === steps.length - 1} animate={animate} onRef={onRef} />)}</ol>;
}

/** Show-the-math drawer. The engine returns TraceStep[]; this only renders them. */
export function TraceDrawer({ title, subtitle, steps, open = true, animate, onClose, onExplain, explanation, className }: {
  title: string; subtitle?: string; steps: TStep[]; open?: boolean; animate?: boolean; onClose?: () => void; onExplain?: () => void; explanation?: { text: string; source: "template" | "llm" }; className?: string;
}) {
  if (!open) return null;
  return (
    <aside role="dialog" aria-label={`Show the math: ${title}`}
      className={cx("absolute inset-y-0 right-0 z-20 flex w-[520px] flex-col border-l border-line-strong bg-surface shadow-drawer", className)}>
      <header className="flex items-start gap-3 border-b border-line px-5 py-4">
        <Sigma size={18} className="mt-0.5 text-accent" aria-hidden />
        <div className="flex-1">
          <h2 className="text-base font-semibold text-fg">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-fg-2">{subtitle}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-fg-2 hover:bg-elevated hover:text-fg"><X size={16} /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        <p className="mb-3 text-[11px] uppercase tracking-wider text-fg-2">Propagation order · {steps.length} steps · deterministic</p>
        <TraceList steps={steps} animate={animate} />
        {explanation && (
          <div className="mt-2 rounded-lg border border-line bg-bg p-3">
            <p className="text-sm leading-6 text-fg">{explanation.text}</p>
            <p className="mt-2 text-[11px] text-fg-2">
              {explanation.source === "llm" ? "Explanation drafted by AI from the engine's trace. The engine is the source of truth." : "Explanation generated from engine trace (template)."}
            </p>
          </div>
        )}
      </div>
      <footer className="flex items-center gap-2 border-t border-line px-5 py-3">
        <Button size="sm" icon={<MessageSquareText size={14} />} onClick={onExplain}>Explain this alert</Button>
        <span className="ml-auto text-[11px] text-fg-2">Click a reference to open the entity</span>
      </footer>
    </aside>
  );
}

export function PrintBriefButton({ onClick }: { onClick?: () => void }) {
  return <Button icon={<Printer size={15} />} onClick={onClick}>Print brief</Button>;
}
