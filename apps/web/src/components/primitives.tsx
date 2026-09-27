import * as React from "react";
import {
  CircleCheck, TriangleAlert, OctagonAlert, Clock, Lock, ShieldAlert, CircleHelp, Hourglass,
} from "lucide-react";
import type { Freshness, Health, Tier, Band } from "../data/types";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ---------- State ---------- */

export const STATE_META: Record<Health, { word: string; Icon: typeof CircleCheck; text: string; tint: string; border: string; fill: string }> = {
  GREEN: { word: "GREEN", Icon: CircleCheck, text: "text-ok", tint: "bg-ok-tint", border: "border-ok/40", fill: "bg-ok" },
  AMBER: { word: "AMBER", Icon: TriangleAlert, text: "text-warn", tint: "bg-warn-tint", border: "border-warn/45", fill: "bg-warn" },
  RED: { word: "RED", Icon: OctagonAlert, text: "text-bad", tint: "bg-bad-tint", border: "border-bad/50", fill: "bg-bad" },
};

/** State = word + icon + optional context. Never colour alone. */
export function StateBadge({ state, context, size = "md", className }: { state: Health; context?: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const m = STATE_META[state];
  const sz = size === "lg" ? "text-base px-3 py-1.5 gap-2" : size === "sm" ? "text-[11px] px-1.5 py-0.5 gap-1" : "text-xs px-2 py-1 gap-1.5";
  const icon = size === "lg" ? 18 : size === "sm" ? 12 : 14;
  return (
    <span className={cx("inline-flex items-center rounded-md border font-semibold tracking-wide", m.text, m.tint, m.border, sz, className)}>
      <m.Icon size={icon} aria-hidden strokeWidth={2.25} />
      <span>{m.word}</span>
      {context && <span className="font-medium text-fg">· {context}</span>}
    </span>
  );
}

/* ---------- Freshness (Bible §8 visual language) ---------- */

export const FRESH_META: Record<Freshness, { dot: string; text: string; bg?: string }> = {
  FRESH: { dot: "bg-ok", text: "text-fg-2" },
  AGING: { dot: "bg-warn", text: "text-warn" },
  STALE: { dot: "bg-warn", text: "text-warn", bg: "dh-stale" },
  CRITICAL: { dot: "bg-bad", text: "text-bad", bg: "dh-critical" },
};

/** "Fuel count 36 h old · AGING". One chip language wherever a number appears. */
export function FreshnessChip({ cls, label, compact, className }: { cls: Freshness; label: string; compact?: boolean; className?: string }) {
  const m = FRESH_META[cls];
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 font-mono text-[11px] leading-4", m.bg, className)}>
      <span className={cx("size-1.5 shrink-0 rounded-full", m.dot)} aria-hidden />
      <span className="text-fg-2">{label}</span>
      {!compact && <span className={cx("font-semibold", m.text)}>· {cls}</span>}
      {cls === "CRITICAL" && <span className="rounded border border-bad/50 px-1 text-[10px] font-semibold text-bad">VERIFY</span>}
    </span>
  );
}

/* ---------- Numbers ---------- */

export function RatioDisplay({ value, state, size = "md", stale, className }: { value: number | string; state?: Health; size?: "sm" | "md" | "lg" | "xl"; stale?: boolean; className?: string }) {
  const sz = { sm: "text-xs", md: "text-sm", lg: "text-lg", xl: "text-3xl" }[size];
  return (
    <span className={cx("font-mono tabular-nums font-semibold", sz, state ? STATE_META[state].text : "text-fg", stale && "dh-stale rounded px-1", className)}>
      {value}
    </span>
  );
}

/** Band on a fixed 0.60–1.25 scale with the 0.95 / 1.05 thresholds. */
export function ConfidenceBand({ point, band, className, label = true }: { point: number; band: Band; className?: string; label?: boolean }) {
  const lo = 0.6, hi = 1.25, pct = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
  const bandHi = band.high ?? point;
  return (
    <div className={cx("w-full", className)}>
      <div className="relative h-3 rounded-sm bg-bg" role="img"
        aria-label={`Point ${point}, band ${band.low}${band.high ? ` to ${band.high}` : " (low side)"}${band.straddles ? ", straddles a worse state" : ""}`}>
        <div className="absolute inset-y-0 left-0 bg-bad/15" style={{ width: pct(0.95) }} />
        <div className="absolute inset-y-0 bg-warn/15" style={{ left: pct(0.95), width: `calc(${pct(1.05)} - ${pct(0.95)})` }} />
        <div className="absolute inset-y-0 right-0 bg-ok/12" style={{ left: pct(1.05) }} />
        <div className={cx("absolute inset-y-[3px] rounded-sm", band.straddles ? "bg-warn/70" : "bg-fg-2/60")} style={{ left: pct(band.low), width: `calc(${pct(bandHi)} - ${pct(band.low)})` }} />
        {band.high === undefined && <div className="absolute inset-y-0 w-px border-l border-dashed border-fg-2" style={{ left: pct(point) }} />}
        <div className="absolute -inset-y-0.5 w-0.5 rounded bg-fg" style={{ left: pct(point) }} />
        {[0.95, 1.05].map((t) => <div key={t} className="absolute -top-1 -bottom-1 w-px bg-line-strong" style={{ left: pct(t) }} />)}
      </div>
      {label && (
        <div className="mt-1 flex justify-between font-mono text-[10px] text-fg-2">
          <span>{band.low.toFixed(4)}{band.high !== undefined ? ` – ${band.high.toFixed(4)}` : " (low)"}</span>
          <span>0.95 · 1.05</span>
        </div>
      )}
    </div>
  );
}

export function CountdownChip({ date, daysLeft, label = "PNR", tone = "red" }: { date: string; daysLeft: number; label?: string; tone?: "red" | "amber" | "neutral" }) {
  const c = tone === "red" ? "border-bad/50 bg-bad-tint text-bad" : tone === "amber" ? "border-warn/45 bg-warn-tint text-warn" : "border-line-strong bg-elevated text-fg";
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold", c)}>
      <Hourglass size={13} aria-hidden />
      <span>{label}</span>
      <span className="font-mono text-fg">{date}</span>
      <span className="font-mono">({daysLeft} d)</span>
    </span>
  );
}

/* ---------- Badges ---------- */

const TIER_STYLE: Record<Tier, string> = {
  0: "border-bad/60 text-bad bg-bad-tint", 1: "border-warn/50 text-warn bg-warn-tint", 2: "border-accent/50 text-accent bg-accent-tint",
  3: "border-line-strong text-fg bg-elevated", 4: "border-line text-fg-2 bg-surface", 5: "border-line text-fg-2 bg-surface",
};
export function PriorityTierBadge({ tier }: { tier: Tier | null }) {
  if (tier === null) return <span className="inline-flex min-w-7 justify-center rounded border border-line px-1 font-mono text-[10px] text-fg-2" title="SYSTEM event, not queued">SYS</span>;
  return <span className={cx("inline-flex min-w-7 justify-center rounded border px-1 font-mono text-[10px] font-semibold", TIER_STYLE[tier])} title={`Priority tier P${tier}`}>P{tier}</span>;
}

export function SlackBadge({ slack, state }: { slack: string; state: Health }) {
  const m = STATE_META[state];
  return <span className={cx("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px]", m.text, m.border, m.tint)}><Clock size={11} aria-hidden />slack {slack}</span>;
}

export function Tag({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: "neutral" | "accent" | "red" | "amber" | "green"; className?: string }) {
  const t = { neutral: "border-line-strong text-fg-2", accent: "border-accent/50 text-accent", red: "border-bad/50 text-bad", amber: "border-warn/50 text-warn", green: "border-ok/40 text-ok" }[tone];
  return <span className={cx("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium", t, className)}>{children}</span>;
}

export function UnknownValue({ what }: { what: string }) {
  return <span className="inline-flex items-center gap-1 font-mono text-xs italic text-fg-2"><CircleHelp size={12} aria-hidden />unknown · {what}</span>;
}

/* ---------- Surfaces ---------- */

export function Card({ children, className, pad = "md", as: As = "section", ...rest }: { children: React.ReactNode; className?: string; pad?: "none" | "sm" | "md" | "lg"; as?: any } & React.HTMLAttributes<HTMLElement>) {
  const p = { none: "", sm: "p-3", md: "p-4", lg: "p-5" }[pad];
  return <As className={cx("rounded-lg border border-line bg-surface", p, className)} {...rest}>{children}</As>;
}

export function SectionHeader({ title, meta, action, className }: { title: string; meta?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cx("mb-2 flex items-center justify-between gap-2", className)}>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-2">{title}</h3>
      <div className="flex items-center gap-2">{meta}{action}</div>
    </div>
  );
}

/* ---------- Buttons ---------- */

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" | "lg"; icon?: React.ReactNode; disabledReason?: string };

/** When disabled for a role or gate, pass `disabledReason`: it is shown, not just tooltipped. */
export function Button({ variant = "secondary", size = "md", icon, disabledReason, className, children, disabled, ...rest }: BtnProps) {
  const v = {
    primary: "bg-accent text-on-accent hover:bg-accent/90 border-accent",
    secondary: "bg-elevated text-fg border-line-strong hover:border-accent/60",
    ghost: "bg-transparent text-fg-2 border-transparent hover:text-fg hover:bg-elevated",
    danger: "bg-bad-tint text-bad border-bad/50 hover:bg-bad/20",
  }[variant];
  const s = { sm: "h-7 px-2.5 text-xs gap-1.5", md: "h-9 px-3.5 text-sm gap-2", lg: "h-12 px-5 text-base gap-2.5" }[size];
  const isDisabled = disabled || !!disabledReason;
  const id = React.useId();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button" disabled={isDisabled} aria-describedby={disabledReason ? id : undefined}
        className={cx("inline-flex items-center justify-center whitespace-nowrap rounded-lg border font-semibold transition-colors duration-150", v, s,
          isDisabled && "cursor-not-allowed opacity-45 hover:bg-inherit", className)}
        {...rest}
      >
        {icon}{children}
      </button>
      {disabledReason && <span id={id} className="inline-flex items-center gap-1 text-[11px] text-fg-2"><Lock size={11} aria-hidden />{disabledReason}</span>}
    </span>
  );
}

export function Checkbox({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; description?: React.ReactNode }) {
  const id = React.useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 cursor-pointer appearance-none rounded border border-line-ctrl bg-bg checked:border-accent checked:bg-accent
          checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22><path d=%22M3.5 8.5l3 3 6-7%22 fill=%22none%22 stroke=%22%230b1220%22 stroke-width=%222.2%22/></svg>')]" />
      <span>
        <span className="text-sm text-fg">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-fg-2">{description}</span>}
      </span>
    </label>
  );
}

export function Kv({ k, v, mono = true }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-xs text-fg-2">{k}</dt>
      <dd className={cx("text-right text-xs text-fg", mono && "font-mono")}>{v}</dd>
    </div>
  );
}

export function GateBanner({ children, tone = "red" }: { children: React.ReactNode; tone?: "red" | "amber" }) {
  return (
    <div role="status" className={cx("flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium",
      tone === "red" ? "border-bad/50 bg-bad-tint text-fg" : "border-warn/50 bg-warn-tint text-fg")}>
      <ShieldAlert size={14} className={tone === "red" ? "text-bad" : "text-warn"} aria-hidden />
      {children}
    </div>
  );
}
