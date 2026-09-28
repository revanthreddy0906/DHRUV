import * as React from "react";
import { Scale, ArrowRight, ShieldCheck, TriangleAlert, Ban, CircleCheck, MessageSquareText, Printer, Timer } from "lucide-react";
import type { Health, Lever, OptionEval, Role, TraceStep as TStep } from "../data/types";
import { cx, STATE_META, StateBadge, RatioDisplay, ConfidenceBand, CountdownChip, Button, Checkbox, Tag, Card, SectionHeader } from "./primitives";
import { TraceList } from "./trace";

/* ---------- Queue ---------- */

export interface QueueItem { id: string; title: string; station: string; deadline: string; daysLeft: number; current: { state: Health; ratio: number }; best: { state: Health; ratio: number }; approveReason?: string; straddle?: string }

export function DecisionCard({ d, onOpen, selected }: { d: QueueItem; onOpen?: () => void; selected?: boolean }) {
  return (
    <button type="button" onClick={onOpen}
      className={cx("w-full rounded-lg border bg-surface p-4 text-left transition-colors duration-150 hover:border-accent/60", selected ? "border-accent ring-1 ring-accent/40" : "border-bad/50")}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-fg-2">{d.id} · {d.station}</span>
        <span className="inline-flex items-center gap-1 rounded bg-bad-tint px-1.5 py-0.5 text-xs font-bold text-bad">Decision required</span>
      </div>
      <h3 className="mt-1.5 text-heading font-semibold leading-5 text-fg">{d.title}</h3>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex flex-col"><span className="text-xs text-fg-2">Now</span><span className="flex items-center gap-1.5"><StateBadge state={d.current.state} size="sm" /><RatioDisplay value={d.current.ratio} size="sm" state={d.current.state} /></span></div>
        <ArrowRight size={14} className="mt-3 text-fg-2" aria-hidden />
        <div className="flex flex-col"><span className="text-xs text-fg-2">Best case</span><span className="flex items-center gap-1.5"><StateBadge state={d.best.state} size="sm" /><RatioDisplay value={d.best.ratio} size="sm" /></span></div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {d.deadline === "no deadline" ? <Tag>No point of no return: every option stays open for now</Tag> : <CountdownChip date={d.deadline} daysLeft={d.daysLeft} label="Act by" />}
        {d.straddle && <Tag tone="amber"><TriangleAlert size={11} aria-hidden />{d.straddle}</Tag>}
      </div>
      {d.approveReason && <p className="mt-2 text-xs text-fg-2">{d.approveReason}</p>}
    </button>
  );
}

export function DecisionQueue({ items, onOpen }: { items: QueueItem[]; onOpen?: (id: string) => void }) {
  return (
    <section aria-label="Decision queue">
      <SectionHeader title="Decision queue" meta={<span className="font-mono text-xs text-fg-2">{items.length}</span>} />
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong p-4 text-sm text-fg-2">
          <CircleCheck size={16} className="mb-1 text-ok" aria-hidden />
          No active decisions. All monitored stations are within their thresholds.
        </div>
      ) : <div className="space-y-2">{items.map((d) => <DecisionCard key={d.id} d={d} onOpen={() => onOpen?.(d.id)} />)}</div>}
    </section>
  );
}

/* ---------- Lever windows (N1) ---------- */

const MON: Record<string, number> = { Jan: 0, Feb: 31, Mar: 59, Apr: 90, May: 120, Jun: 151, Jul: 181, Aug: 212, Sep: 243, Oct: 273, Nov: 304, Dec: 334 };
/** Day index from 24 Jan 2027 for "D Mon" labels (render helper, not engine math). A trailing year is ignored. */
export const dayIdx = (d: string) => { const [n, m] = d.split(" "); return Number(n) + (MON[m ?? ""] ?? NaN) - 24; };
/** "D Mon" for a day index from 24 Jan. */
export const idxLabel = (i: number) => {
  const doy = i + 24;
  const m = Object.entries(MON).filter(([, start]) => start < doy).at(-1)!;
  return `${doy - m[1]} ${m[0]}`;
};

/**
 * A day axis for date labels: the fixed [from, to] window when every date falls inside it (the
 * season48 layout), otherwise one fitted to the dates with `pad` days either side.
 */
export function dayAxis(dates: (string | undefined)[], from: string, to: string, pad = 3) {
  const idx = dates.filter((d): d is string => !!d).map(dayIdx).filter((n) => Number.isFinite(n));
  const [a, b] = [dayIdx(from), dayIdx(to)];
  const fits = idx.every((n) => n >= a && n <= b);
  const lo = fits ? a : Math.min(...idx) - pad;
  const hi = fits ? b : Math.max(...idx, lo + 7) + pad;
  return { lo, hi, fits, pct: (d: string) => ((dayIdx(d) - lo) / (hi - lo)) * 100 };
}

export function LeverWindow({ levers, today = "24 Jan", pnr = "3 Feb", end = "1 Mar" }: { levers: Lever[]; today?: string; pnr?: string; end?: string }) {
  const axis = dayAxis([today, pnr, ...levers.flatMap((l) => [l.deadline, l.cutoff])], "24 Jan", end, 4);
  const span = 100;
  const x = (d: string) => `${axis.pct(d)}%`;
  // Weekly ticks: the season48 dates on its fixed axis, otherwise every 7 days from the axis start.
  const ticks = axis.fits
    ? ["24 Jan", "31 Jan", "7 Feb", "14 Feb", "21 Feb", "28 Feb"]
    : Array.from({ length: Math.floor((axis.hi - axis.lo) / 7) + 1 }, (_, k) => idxLabel(axis.lo + 7 * k)).filter((t) => axis.pct(t) <= 95);
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <SectionHeader title="Decision windows · per lever" meta={<span className="text-xs text-fg-2">deadline = cutoff − lead</span>} />
      <div className="relative ml-[152px] mt-2 h-4 font-mono text-xs text-fg-2">
        {ticks.map((t) => <span key={t} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: x(t) }}>{t}</span>)}
      </div>
      <div className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-[152px] right-0">
          <div className="absolute inset-y-0 w-px bg-accent" style={{ left: x(today) }}><span className="absolute -top-1 left-1 font-mono text-xs text-accent">now</span></div>
          {pnr && <div className="absolute inset-y-0 w-0.5 bg-bad" style={{ left: x(pnr) }}><span className="absolute bottom-0 left-1.5 whitespace-nowrap text-xs font-semibold text-bad">Point of no return {pnr}</span></div>}
        </div>
        <ul className="space-y-1.5 pb-5 pt-1">
          {levers.map((l) => {
            const expired = l.daysLeft < 0;
            return (
              <li key={l.id} className="flex items-center">
                <div className="w-[152px] shrink-0 pr-3" title={l.effect}>
                  <div className="font-mono text-xs font-semibold text-fg">{l.id}</div>
                  <div className="truncate text-xs leading-4 text-fg-2">{l.effect}</div>
                </div>
                <div className="relative h-5 flex-1 rounded bg-bg">
                  <div className={cx("absolute inset-y-1 rounded-sm", expired ? "bg-fg-3/40" : "bg-accent/35")} style={{ left: x(today), width: `calc(${x(l.deadline)} - ${x(today)})` }} />
                  <div className="absolute inset-y-1 dh-stale rounded-sm border border-warn/40" style={{ left: x(l.deadline), width: `calc(${x(l.cutoff)} - ${x(l.deadline)})` }} title={`Lead ${l.leadDays} d`} />
                  <div className="absolute -inset-y-0.5 w-0.5 bg-fg" style={{ left: x(l.deadline) }} />
                  <span className={cx("absolute top-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-xs text-fg", axis.pct(l.cutoff) / span > 0.6 ? "-translate-x-full pr-1.5" : "pl-1.5")} style={{ left: axis.pct(l.cutoff) / span > 0.6 ? x(l.deadline) : x(l.cutoff) }}>
                    act by {l.deadline} · {l.daysLeft} d · cutoff {l.cutoff}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-fg-2">
        <span className="flex items-center gap-1.5"><span className="h-2 w-5 rounded-sm bg-accent/35" />still possible</span>
        <span className="flex items-center gap-1.5"><span className="dh-stale h-2 w-5 rounded-sm border border-warn/40" />lead time before hard cutoff</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 bg-bad" />point of no return: after this no option reaches GREEN</span>
      </div>
    </div>
  );
}

/* ---------- Options ---------- */

export function OptionCard({ o, selected, onSelect }: { o: OptionEval; selected?: boolean; onSelect?: () => void }) {
  const slackState: Health = o.slack.startsWith("0 d") ? "AMBER" : "GREEN";
  const expired = !!o.expired;
  return (
    <div role="radio" aria-checked={selected} aria-disabled={expired} tabIndex={expired ? -1 : 0} onClick={() => !expired && onSelect?.()}
      onKeyDown={(e) => { if (!expired && (e.key === " " || e.key === "Enter")) { e.preventDefault(); onSelect?.(); } }}
      className={cx("flex flex-col rounded-lg border bg-surface p-4 transition-colors duration-150",
        expired ? "cursor-not-allowed border-dashed border-line opacity-50 grayscale" : "cursor-pointer hover:border-accent/60",
        selected ? "border-accent ring-1 ring-accent/50" : !expired && "border-line")}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className={cx("flex size-4 items-center justify-center rounded-full border", selected ? "border-accent" : "border-line-strong")}>{selected && <span className="size-2 rounded-full bg-accent" />}</span>
          <span className="whitespace-nowrap text-sm font-semibold text-fg">Option ({o.id})</span>
        </span>
        {o.reachesTarget ? <Tag tone="green" className="whitespace-nowrap">reaches GREEN</Tag> : <Tag tone="red">partial</Tag>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">{o.levers.map((l) => <span key={l} className={cx("rounded border px-1.5 font-mono text-xs", l === o.bindingLever ? "border-warn/50 text-warn" : "border-line-strong text-fg-2")} title={l === o.bindingLever ? "Binding lever (earliest deadline)" : undefined}>{l}</span>)}</div>

      <div className="mt-3 flex items-baseline gap-2">
        <RatioDisplay value={o.resultingRatio} size="xl" state={o.resultingState === "GREEN" ? undefined : o.resultingState} />
        <StateBadge state={o.resultingState} size="sm" />
      </div>
      {o.straddleText && (
        <p className="mt-1.5 flex items-center gap-1.5 rounded-md border border-warn/50 bg-warn-tint px-2 py-1 text-xs font-semibold text-warn" role="status">
          <TriangleAlert size={13} aria-hidden />{o.straddleText}
        </p>
      )}
      {o.band && <ConfidenceBand className="mt-2" point={o.resultingRatio} band={o.band} />}
      {o.residualGap !== undefined && <p className="mt-1 font-mono text-xs text-bad">residual gap {o.residualGap} kL</p>}

      <dl className="mt-3 grid grid-cols-[56px_1fr] gap-x-2 gap-y-1 border-t border-line pt-2 text-xs">
        <dt className="text-fg-2">Act by</dt><dd className="font-mono font-semibold text-fg">{o.deadline}{o.bindingLever && <span className="block text-xs font-normal text-fg-2">binding: {o.bindingLever}</span>}</dd>
        <dt className="text-fg-2">Slack</dt><dd className={cx("font-mono", slackState === "AMBER" ? "font-semibold text-warn" : "text-fg-2")}>{o.slack}</dd>
        <dt className="text-fg-2">Cost</dt><dd className="font-mono text-fg">{o.cost} <span className="text-xs text-fg-2">synthetic</span></dd>
      </dl>
      {o.requiresVerify.length > 0 && !expired && (
        <div className="mt-2 rounded-md border border-warn/40 bg-warn-tint/60 p-2">
          <p className="flex items-center gap-1 text-xs font-semibold text-warn"><ShieldCheck size={12} aria-hidden />Verify before acting</p>
          <ul className="mt-1 space-y-0.5 font-mono text-xs text-fg">{o.requiresVerify.map((r) => <li key={r}>· {r}</li>)}</ul>
        </div>
      )}
      {expired && <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-fg"><Ban size={13} aria-hidden />Expired · {o.expired}</p>}
    </div>
  );
}

/* ---------- Verify gate ---------- */

export function VerifyGate({ items, checked, onChange }: { items: string[]; checked: boolean; onChange: (v: boolean) => void }) {
  if (items.length === 0) return <p className="flex items-center gap-1.5 text-xs text-fg-2"><CircleCheck size={13} className="text-ok" aria-hidden />All inputs FRESH or AGING without straddle. No verification required.</p>;
  return (
    <div className="rounded-lg border border-warn/50 bg-warn-tint p-3">
      <Checkbox checked={checked} onChange={onChange}
        label={<span className="font-semibold">I have verified these inputs before acting</span>}
        description={<span>{items.join(" · ")}. Recorded as <span className="font-mono">verify_ack</span> on the approval.</span>} />
    </div>
  );
}

/* ---------- Decision Detail (an approval console, not a modal) ---------- */

export interface DecisionStatus { tone: "ok" | "warn" | "bad"; text: string }

const STATUS_STYLE: Record<DecisionStatus["tone"], { box: string; Icon: typeof CircleCheck; icon: string }> = {
  ok: { box: "border-ok/40 bg-ok-tint", Icon: CircleCheck, icon: "text-ok" },
  warn: { box: "border-warn/50 bg-warn-tint", Icon: Timer, icon: "text-warn" },
  bad: { box: "border-bad/50 bg-bad-tint", Icon: Ban, icon: "text-bad" },
};

export function DecisionDetail({ id, title, station, current, trigger, pnr, trace, levers, options, role, today, approved, onApprove, onReject, onExplain, onPrint,
  blocked, optionBlocked, status, busy, error, note }: {
  id: string; title: string; station: string; current: { state: Health; ratio: number; text: string }; trigger: string; pnr: { date: string; daysLeft: number } | null;
  trace: TStep[]; levers: Lever[]; options: OptionEval[]; role: Role; today?: string; approved?: string;
  onApprove?: (opt: string, verifyAck: boolean) => void; onReject?: (reason: string) => void; onExplain?: () => void; onPrint?: () => void;
  /** Live permission reasons (section 4). Without it the design default applies: HQ Ops only. */
  blocked?: { approve?: string; reject?: string };
  /** Why a specific option cannot be approved (expired, not in the recorded proposal). */
  optionBlocked?: (optionId: string) => string | undefined;
  /** Outcome shown instead of the approval controls (approved, rejected, waiting to sync). */
  status?: DecisionStatus;
  busy?: boolean;
  error?: string;
  /** Shown under the controls, e.g. how the approval will be recorded on this link. */
  note?: string;
}) {
  const [sel, setSel] = React.useState<string>(options[0]?.id);
  const [ack, setAck] = React.useState(false);
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const chosen = options.find((o) => o.id === sel)!;
  const needsVerify = chosen.requiresVerify.length > 0;
  const roleReason = blocked ? blocked.approve : role !== "HQ_OPS" ? "Only HQ Ops can approve decisions touching vessels" : undefined;
  const rejectReason = blocked ? blocked.reject : role !== "HQ_OPS" ? "Only HQ Ops can reject vessel decisions" : undefined;
  const gateReason = roleReason ?? optionBlocked?.(sel) ?? (needsVerify && !ack ? "Tick the verification above to enable Approve" : undefined);
  const outcome = status ?? (approved ? { tone: "ok" as const, text: approved } : undefined);
  return (
    <div className="grid h-full grid-cols-[400px_minmax(0,1fr)] gap-5 p-5">
      <div className="flex min-h-0 flex-col gap-4">
        <Card pad="lg">
          <div className="flex items-center gap-2 font-mono text-xs text-fg-2"><Scale size={13} aria-hidden />{id} · {station}</div>
          <h1 className="mt-1 text-heading font-semibold leading-6 text-fg">{title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <StateBadge state={current.state} size="lg" />
            <RatioDisplay value={current.ratio} size="xl" state={current.state} />
            <span className="text-sm text-fg-2">{current.text}</span>
          </div>
          <p className="mt-3 text-sm text-fg-2"><span className="text-xs font-semibold">Trigger</span> <span className="ml-1 text-fg">{trigger}</span></p>
          <div className="mt-3 flex items-center gap-2">{pnr ? <CountdownChip date={pnr.date} daysLeft={pnr.daysLeft} label="Point of no return" /> : <span className="text-xs text-fg-2">No point of no return in the proposal</span>}</div>
        </Card>
        <Card className="min-h-0 flex-1 overflow-auto">
          <SectionHeader title="Trace · propagation order" />
          <TraceList steps={trace} />
        </Card>
      </div>

      <div className="flex min-h-0 flex-col gap-4 overflow-auto">
        <div>
          <SectionHeader title={`Options · ${options.length} of max 3`} meta={<span className="text-xs text-fg-2">engine ranking · reaches target first, then earliest deadline</span>} />
          <div role="radiogroup" aria-label="Options" className="grid grid-cols-3 gap-3">
            {options.map((o) => <OptionCard key={o.id} o={o} selected={o.id === sel} onSelect={() => { setSel(o.id); setAck(false); }} />)}
          </div>
        </div>
        <LeverWindow levers={levers} today={today} pnr={pnr ? pnr.date.replace(" 2027", "") : ""} />
        <div className="sticky bottom-0 z-10 -mx-1 bg-bg px-1 pb-1 pt-2">
        {outcome ? (
          <div role="status" className={cx("flex items-center gap-2 rounded-lg border p-3 text-sm text-fg", STATUS_STYLE[outcome.tone].box)}>
            {React.createElement(STATUS_STYLE[outcome.tone].Icon, { size: 16, className: STATUS_STYLE[outcome.tone].icon, "aria-hidden": true })}{outcome.text}
          </div>
        ) : (
          <Card>
            <VerifyGate items={needsVerify ? chosen.requiresVerify : []} checked={ack} onChange={setAck} />
            {rejecting && (
              <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-line-strong p-3">
                <label className="flex min-w-72 flex-1 flex-col gap-1 text-xs text-fg-2">Reason for rejecting (recorded in DECISION_REJECTED)
                  <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 rounded-md border border-line-ctrl bg-bg px-2 text-sm text-fg" />
                </label>
                <Button variant="danger" disabled={busy || !reason.trim()} onClick={() => onReject?.(reason.trim())}>Confirm reject</Button>
                <Button variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-start gap-2">
              <Button variant="secondary" onClick={() => setRejecting(true)} disabled={busy || rejecting} disabledReason={rejectReason}>Reject</Button>
              <Button variant="primary" onClick={() => onApprove?.(sel, ack)} disabled={busy} disabledReason={gateReason}>{busy ? "Recording…" : `Approve option (${sel})`}</Button>
              <span className="ml-auto flex gap-2">
                <Button variant="ghost" icon={<MessageSquareText size={15} />} onClick={onExplain}>AI explain</Button>
                <Button icon={<Printer size={15} />} onClick={onPrint}>Print brief</Button>
              </span>
            </div>
            {error && <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs text-fg"><Ban size={13} className="text-bad" aria-hidden />{error}</p>}
            {note && <p className="mt-2 text-xs text-fg-2">{note}</p>}
            <p className="mt-2 flex items-center gap-1.5 text-xs text-fg-2"><Timer size={12} aria-hidden />Nothing changes operational state until DECISION_APPROVED is recorded. Approval emits VESSEL_UPDATED and LEG_UPDATED as SYSTEM events.</p>
          </Card>
        )}
        </div>
      </div>
    </div>
  );
}
