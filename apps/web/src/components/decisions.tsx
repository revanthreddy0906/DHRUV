import * as React from "react";
import { ChevronRight, CircleCheck, OctagonAlert, Sigma, TriangleAlert } from "lucide-react";
import type { Health } from "../data/types";
import type { DecisionOptionColumn, DecisionScreenData, LeverRow } from "../live/decisionView";
import { cx, Button, Checkbox, SectionHeader, StateBadge } from "./primitives";
import { TraceGroups } from "./trace";
import { daysText, expectedResultText, formatDate, formatDateTime, formatRatio, formatSimClock, leverAxis, markerAlign, type Cell, type CompareRow } from "../format";

/* ---------- Queue item (the Command Center's decision rows) ---------- */

export interface QueueItem { id: string; title: string; station: string; deadline: string; daysLeft: number; current: { state: Health; ratio: number }; best: { state: Health; ratio: number }; approveReason?: string; straddle?: string }

/* ---------- Day axis for "D Mon" labels (Cargo timelines) ---------- */

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

/* ---------- Shared pieces ---------- */

const TONE: Record<NonNullable<Cell["tone"]>, { text: string; Icon: typeof CircleCheck }> = {
  green: { text: "text-ok", Icon: CircleCheck },
  amber: { text: "text-warn", Icon: TriangleAlert },
  red: { text: "text-bad", Icon: OctagonAlert },
};

function CellView({ cell }: { cell: Cell }) {
  const tone = cell.tone ? TONE[cell.tone] : undefined;
  return (
    <div className="space-y-0.5">
      <div className={cx("flex flex-wrap items-center gap-x-2 gap-y-1 whitespace-pre-line tabular-nums", tone ? tone.text : "text-fg", tone && "font-medium")}>
        {tone && <tone.Icon size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />}
        <span>{cell.text}</span>
        {cell.state && <StateBadge state={cell.state} size="sm" />}
      </div>
      {cell.sub && <div className="text-xs text-fg-2">{cell.sub}</div>}
    </div>
  );
}

/**
 * Options as columns, the same rows in the same order for each. Rows where the options differ are
 * emphasised; rows identical across every option are merged into one cell. When `selected` is
 * given, the column headers are a radio group.
 */
export function OptionsTable({ options, rows, selected, onSelect, chosen, name = "decision-option" }: {
  options: DecisionOptionColumn[]; rows: CompareRow[]; selected?: string; onSelect?: (label: string) => void; name?: string;
  /** The option that was approved (historical view). */
  chosen?: string;
}) {
  const many = options.length > 1;
  const pickable = !!onSelect;
  const table = (
    <table className="w-full table-fixed border-collapse text-sm">
      <colgroup>
        <col className="w-40" />
        {options.map((o) => <col key={o.label} />)}
      </colgroup>
      <thead>
        <tr className="border-b border-line">
          <th scope="col" className="p-3 text-left align-bottom text-xs font-normal text-fg-2">Option</th>
          {options.map((o) => {
            const isSel = pickable ? o.label === selected : o.label === chosen;
            return (
              <th key={o.label} scope="col" className={cx("p-3 text-left align-top font-normal", isSel && "bg-accent-tint")}>
                <label className={cx("flex items-start gap-2", pickable && "cursor-pointer")}>
                  {pickable && (
                    <input type="radio" name={name} value={o.label} checked={isSel} onChange={() => onSelect?.(o.label)}
                      className="mt-1 size-4 shrink-0 cursor-pointer accent-accent" />
                  )}
                  <span className="min-w-0">
                    <span className="block font-semibold text-fg">Option {o.label}</span>
                    <span className="block text-fg">{o.name}</span>
                  </span>
                </label>
                {!pickable && o.label === chosen && <p className="mt-2 flex items-center gap-1 text-xs font-medium text-fg"><CircleCheck size={16} strokeWidth={1.75} aria-hidden className="text-ok" />Approved</p>}
                {o.top && (
                  <div className="mt-2">
                    <span className="inline-block rounded-sm border border-accent px-1.5 text-xs font-medium text-accent">Engine ranking 1</span>
                    <p className="mt-1 text-xs text-fg-2">{o.top}</p>
                  </div>
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const merged = many && !r.differs;
          return (
            <tr key={r.key} className="border-b border-line last:border-b-0">
              <th scope="row" className={cx("p-3 text-left align-top", r.differs ? "font-semibold text-fg" : "font-normal text-fg-2")}>{r.label}</th>
              {merged ? (
                <td colSpan={options.length} className="p-3 align-top text-fg-2">
                  <div className="flex flex-wrap items-baseline gap-x-2"><CellView cell={r.cells[0]!} /><span className="text-xs text-fg-3">All options</span></div>
                </td>
              ) : r.cells.map((c, i) => (
                <td key={options[i]!.label} className={cx("p-3 align-top", options[i]!.label === (pickable ? selected : chosen) && "bg-accent-tint/40")}><CellView cell={c} /></td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
  return pickable ? <fieldset><legend className="sr-only">Choose an option</legend>{table}</fieldset> : table;
}

/* ---------- Deadlines (per-lever timeline) ---------- */

/**
 * One row per lever: time left to act (today to its deadline), then the lead time to its hard
 * cutoff. Today and the point of no return run through every row. All text sits beside the bars,
 * never on them, so nothing clips.
 */
export function LeverTimeline({ levers, now, pnr }: { levers: LeverRow[]; now: string; pnr?: string }) {
  const axis = leverAxis(now, [pnr, ...levers.flatMap((l) => [l.deadline, l.cutoff])]);
  const x = (iso: string) => `${axis.pct(iso)}%`;
  const nowPct = axis.pct(now);
  const marker = (iso: string, label: string, tone: string) => {
    const p = axis.pct(iso);
    return (
      <span className={cx("absolute top-0 whitespace-nowrap text-xs font-medium", tone, markerAlign(p) === "end" ? "-translate-x-full pr-1.5" : "pl-1.5")} style={{ left: x(iso) }}>{label}</span>
    );
  };
  const lines = (
    <>
      <span aria-hidden className="absolute inset-y-0 w-px bg-accent" style={{ left: x(now) }} />
      {pnr && <span aria-hidden className="absolute inset-y-0 w-0.5 bg-bad" style={{ left: x(pnr) }} />}
    </>
  );
  return (
    <div className="grid grid-cols-[minmax(160px,200px)_minmax(0,1fr)_minmax(150px,190px)] gap-x-4">
      <div />
      <div className="relative h-10">
        {marker(now, "Today", "text-accent")}
        {pnr && <span className="absolute top-5 left-0 right-0">{marker(pnr, `Point of no return ${formatDate(pnr)}`, "text-bad")}</span>}
        {lines}
      </div>
      <div />
      <div />
      <div className="relative h-5 font-mono text-xs text-fg-3">
        {axis.ticks.map((t) => <span key={t.iso} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${t.pct}%` }}>{t.label}</span>)}
        {lines}
      </div>
      <div />
      {levers.map((l) => {
        const open = Date.parse(l.deadline) > Date.parse(now);
        return (
          <React.Fragment key={l.id}>
            <div className="border-t border-line py-2.5">
              <div className="text-sm font-medium text-fg">{l.name}</div>
              {l.effect && <div className="text-xs text-fg-2">{l.effect}</div>}
            </div>
            <div className="relative border-t border-line">
              {lines}
              <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2">
                {open && <span className="absolute inset-y-0 rounded-l-sm bg-accent/25" style={{ left: `${Math.max(0, nowPct)}%`, width: `calc(${x(l.deadline)} - ${Math.max(0, nowPct)}%)` }} />}
                <span className="absolute inset-y-0 rounded-r-sm border border-line-strong bg-surface" style={{ left: x(l.deadline), width: `calc(${x(l.cutoff)} - ${x(l.deadline)})` }} />
                <span aria-hidden className="absolute -inset-y-1 w-0.5 bg-fg" style={{ left: x(l.deadline) }} />
              </div>
            </div>
            <div className="border-t border-line py-2.5 text-sm">
              {open
                ? <div className="text-fg">Act by <span className="font-mono">{formatDate(l.deadline)}</span> · {daysText(l.daysLeft)}</div>
                : <div className="text-fg-2">Closed <span className="font-mono">{formatDate(l.deadline)}</span></div>}
              <div className="text-xs text-fg-2">Cutoff <span className="font-mono">{formatDate(l.cutoff)}</span> · {l.leadDays} d lead</div>
            </div>
          </React.Fragment>
        );
      })}
      <div />
      <div className="col-span-2 mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-fg-2">
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-5 rounded-sm bg-accent/25" />Time left to act</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-5 rounded-sm border border-line-strong bg-surface" />Lead time before the hard cutoff</span>
        {pnr && <span className="flex items-center gap-1.5"><span aria-hidden className="h-3 w-0.5 bg-bad" />Point of no return: after this no option restores GREEN</span>}
      </div>
    </div>
  );
}

/* ---------- Approval confirmation ---------- */

function ApproveDialog({ option, station, fuelNow, preview, viewer, verified, linkNote, busy, onCancel, onConfirm }: {
  option: DecisionOptionColumn; station: string; fuelNow: number | null; preview: string[]; viewer: string; verified: boolean; linkNote?: string; busy?: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  const boxRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  React.useEffect(() => {
    // Cancel (the first button) takes focus: the safe default for a commit.
    boxRef.current?.querySelector("button")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-fg/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div ref={boxRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="dh-fade-in w-full max-w-lg rounded-lg border border-line bg-surface p-5">
        <h2 id={titleId} className="text-title font-semibold text-fg">Approve option {option.label}: {option.name}?</h2>
        <dl className="mt-4 space-y-4 text-sm">
          <div>
            <dt className="text-xs text-fg-2">What will be recorded</dt>
            <dd className="mt-1"><ul className="list-disc space-y-1 pl-5 text-fg">{preview.map((l) => <li key={l}>{l}</li>)}</ul></dd>
          </div>
          <div>
            <dt className="text-xs text-fg-2">Expected result</dt>
            <dd className="mt-1 tabular-nums text-fg">{expectedResultText(station, fuelNow, option.facts.ratio, option.facts.state)}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-2">Recorded as</dt>
            <dd className="mt-1 text-fg">{viewer}{verified ? ", with the inputs verified" : ""}</dd>
          </div>
        </dl>
        {linkNote && <p className="mt-4 text-xs text-fg-2">{linkNote}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={onConfirm}>{busy ? "Recording…" : `Approve option ${option.label}`}</Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Decision bar ---------- */

function DecisionBar({ data, chosen, viewer, preview, linkNote, busy, error, onApprove, onReject }: {
  data: DecisionScreenData; chosen: DecisionOptionColumn; viewer: string; preview: (levers: string[]) => string[]; linkNote?: string; busy?: boolean; error?: string;
  onApprove?: (optionId: string, verifyAck: boolean) => void; onReject?: (reason: string) => void;
}) {
  const [ack, setAck] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState("");
  React.useEffect(() => { setAck(false); setConfirming(false); }, [chosen.label]);
  const needsVerify = !!chosen.verifySentence;
  const approveReason = chosen.blocked ?? (needsVerify && !ack ? "Tick the verification above to approve" : undefined);
  const reasonId = React.useId();
  return (
    <div className="sticky bottom-0 z-10 border-t border-line bg-surface">
      <div className="mx-auto max-w-[1180px] space-y-2 px-6 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm text-fg-2">Selected: <span className="font-semibold text-fg">Option {chosen.label}: {chosen.name}</span></p>
            {needsVerify && (
              <div className="rounded-md border border-warn/45 bg-warn-tint px-3 py-2">
                <Checkbox checked={ack} onChange={setAck} label={chosen.verifySentence} description="Verify before acting." />
              </div>
            )}
          </div>
          {!rejecting && (
            <div className="flex flex-wrap items-start gap-2">
              <Button onClick={() => setRejecting(true)} disabled={busy} disabledReason={data.rejectBlocked}>Reject</Button>
              <Button variant="primary" onClick={() => setConfirming(true)} disabled={busy} disabledReason={approveReason}>
                Approve option {chosen.label}: {chosen.name}
              </Button>
            </div>
          )}
        </div>
        {rejecting && (
          <div className="flex flex-wrap items-end gap-2">
            <label htmlFor={reasonId} className="flex min-w-72 flex-1 flex-col gap-1 text-xs text-fg-2">
              Reason for rejecting (required)
              <input id={reasonId} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 rounded-md border border-line-ctrl bg-surface px-2 text-sm text-fg" />
            </label>
            <Button variant="danger" disabled={busy || !reason.trim()} onClick={() => onReject?.(reason.trim())}>Reject decision</Button>
            <Button variant="ghost" onClick={() => { setRejecting(false); setReason(""); }}>Cancel</Button>
          </div>
        )}
        <div aria-live="polite" className="space-y-1">
          {error && <p role="alert" className="flex items-center gap-1.5 text-sm text-fg"><OctagonAlert size={16} className="text-bad" aria-hidden />{error}</p>}
          {linkNote && <p className="text-xs text-fg-2">{linkNote}</p>}
        </div>
      </div>
      {confirming && (
        <ApproveDialog option={chosen} station={data.station} fuelNow={data.stationNow.fuelRatio} preview={preview(chosen.levers)} viewer={viewer} verified={needsVerify && ack}
          linkNote={linkNote} busy={busy} onCancel={() => setConfirming(false)} onConfirm={() => { setConfirming(false); onApprove?.(chosen.optionId, needsVerify && ack); }} />
      )}
    </div>
  );
}

/* ---------- The screen ---------- */

const PHASE_WORD: Record<DecisionScreenData["phase"], string> = { AWAITING: "Awaiting decision", APPROVED: "Approved", REJECTED: "Rejected", EXPIRED: "Expired" };

function WhyEngine({ data, title = "Why the engine says this" }: { data: DecisionScreenData; title?: string }) {
  if (data.why.length === 0) return null;
  return (
    <details className="group rounded-lg border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-heading font-semibold text-fg">
        <ChevronRight size={16} aria-hidden className="text-fg-2 transition-transform duration-150 group-open:rotate-90" />
        {title}
      </summary>
      <div className="space-y-5 border-t border-line px-4 py-4"><TraceGroups steps={data.why} units={data.units} /></div>
    </details>
  );
}

export interface DecisionScreenProps {
  data: DecisionScreenData;
  /** Who an approval is recorded as: "HQ Ops on HQ-WEB-01". */
  viewer: string;
  now: string;
  preview: (levers: string[]) => string[];
  linkNote?: string;
  busy?: boolean;
  error?: string;
  onShowMath?: () => void;
  onApprove?: (optionId: string, verifyAck: boolean) => void;
  onReject?: (reason: string) => void;
}

/**
 * Decision detail (section 9.3), built around the decision: the question and its deadline first,
 * then what happened, the options side by side, the per-lever deadlines and the decision bar.
 */
export function DecisionScreen(props: DecisionScreenProps) {
  const { data } = props;
  if (data.phase !== "AWAITING") return <DecidedDecision {...props} />;
  return <AwaitingDecision {...props} />;
}

function AwaitingDecision({ data, viewer, now, preview, linkNote, busy, error, onShowMath, onApprove, onReject }: DecisionScreenProps) {
  const initial = (data.options.find((o) => o.top && !o.blocked) ?? data.options.find((o) => !o.blocked) ?? data.options[0])?.label;
  const [sel, setSel] = React.useState(initial);
  const chosen = data.options.find((o) => o.label === sel) ?? data.options[0];
  const d = data.deadline;
  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto w-full max-w-[1180px] flex-1 space-y-8 p-6">
        <header className="space-y-3">
          <p className="flex items-center gap-3 text-xs text-fg-2"><span className="font-mono">{data.id}</span><span>{PHASE_WORD[data.phase]}</span></p>
          <h1 className="text-title font-semibold text-fg">{data.title}</h1>
          {d && (
            <div aria-live="polite" className={cx("inline-block rounded-lg border px-4 py-3", data.pnr ? "border-bad/50 bg-bad-tint" : "border-warn/45 bg-warn-tint")}>
              {d.lead && <p className="text-sm text-fg">{d.lead}</p>}
              <p className={cx("flex flex-wrap items-baseline gap-x-2 font-semibold", data.pnr ? "text-bad" : "text-warn")}>
                <span className="text-title">{d.prefix}</span>
                <span className="font-mono text-headline tabular-nums">{d.date}</span>
                <span className="text-title">{d.after}</span>
              </p>
            </div>
          )}
          {data.refused && (
            <p role="status" className="flex items-start gap-2 rounded-md border border-warn/45 bg-warn-tint px-3 py-2 text-sm text-fg">
              <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden />{data.refused}
            </p>
          )}
        </header>

        {data.chain.length > 0 && (
          <section>
            <SectionHeader title="What happened" action={onShowMath && <Button size="sm" icon={<Sigma size={16} aria-hidden />} onClick={onShowMath}>Show the math</Button>} />
            <ol aria-label="Consequence chain" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg">
              {data.chain.map((step, i) => (
                <li key={step} className="flex items-center gap-2">
                  {i > 0 && <ChevronRight size={16} aria-hidden className="text-fg-3" />}
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            {data.trigger && <p className="mt-1 text-xs text-fg-2">Trigger recorded by {data.trigger.actor}, <span className="font-mono">{formatDateTime(data.trigger.at)}</span></p>}
          </section>
        )}

        {data.options.length > 0 && chosen && (
          <section>
            <SectionHeader title="Options" meta={<span className="text-xs text-fg-2">{data.valuesNote}</span>} />
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <OptionsTable options={data.options} rows={data.rows} selected={chosen.label} onSelect={setSel} />
            </div>
          </section>
        )}

        {data.levers.length > 0 && (
          <section>
            <SectionHeader title="Deadlines" />
            <div className="rounded-lg border border-line bg-surface p-4"><LeverTimeline levers={data.levers} now={now} pnr={data.pnr} /></div>
          </section>
        )}

        <WhyEngine data={data} />
      </div>
      {chosen && <DecisionBar key={data.id} data={data} chosen={chosen} viewer={viewer} preview={preview} linkNote={linkNote} busy={busy} error={error} onApprove={onApprove} onReject={onReject} />}
    </div>
  );
}

function StationLine({ label, state, ratio }: { label: string; state?: Health; ratio: number | null }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-fg-2">{label}</div>
      <div className="flex flex-wrap items-center gap-3">
        {state && <StateBadge state={state} />}
        <span className="text-sm text-fg">Fuel ratio <span className="font-mono tabular-nums">{formatRatio(ratio)}</span></span>
      </div>
    </div>
  );
}

/**
 * A decided (or expired) decision: the outcome first, then what it did, then the options as they
 * were proposed, collapsed and labelled as history.
 */
function DecidedDecision({ data }: DecisionScreenProps) {
  const o = data.outcome;
  const approved = data.phase === "APPROVED";
  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-8 p-6">
      <header className="space-y-2">
        <p className="flex items-center gap-3 text-xs text-fg-2"><span className="font-mono">{data.id}</span><span>{data.title}</span></p>
        {o && (
          <h1 className="flex items-center gap-2 text-title font-semibold text-fg">
            {approved && <CircleCheck size={20} strokeWidth={1.75} aria-hidden className="text-ok" />}
            {o.title}
          </h1>
        )}
        {o?.actor && <p className="text-sm text-fg">By {o.actor}{o.at && <> at <span className="font-mono">{formatSimClock(o.at)}</span></>}</p>}
        {approved && o?.verified !== undefined && <p className="text-sm text-fg-2">Inputs verified before approval: {o.verified ? "yes" : "no"}</p>}
        {o?.reason && <p className="text-sm text-fg-2">Reason: <span className="text-fg">{o.reason}</span></p>}
        {data.waiting && (
          <p role="status" className="flex items-start gap-2 rounded-md border border-warn/45 bg-warn-tint px-3 py-2 text-sm text-fg">
            <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden />
            {approved ? "Approved" : "Rejected"} on this device · waiting to send. HQ applies the same checks when it arrives.
          </p>
        )}
      </header>

      {approved && (
        <section>
          <SectionHeader title={data.waiting ? "What it will record when sent" : "What it did"} />
          <div className="space-y-4 rounded-lg border border-line bg-surface p-4">
            {data.didLines.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-fg">{data.didLines.map((l) => <li key={l}>{l}</li>)}</ul>}
            {(data.atApproval || data.nowLine) && (
              <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
                {data.atApproval && <StationLine label={`${data.station}: ${data.atApproval.label.charAt(0).toLowerCase()}${data.atApproval.label.slice(1)}`} state={data.atApproval.state} ratio={data.atApproval.ratio} />}
                {data.nowLine && <StationLine label={`${data.station}: now`} state={data.nowLine.state} ratio={data.nowLine.ratio} />}
              </div>
            )}
          </div>
        </section>
      )}

      {data.options.length > 0 && (
        <details className="group rounded-lg border border-line bg-surface">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-heading font-semibold text-fg">
            <ChevronRight size={16} aria-hidden className="text-fg-2 transition-transform duration-150 group-open:rotate-90" />
            {data.valuesNote}
          </summary>
          <div className="overflow-x-auto border-t border-line"><OptionsTable options={data.options} rows={data.rows} chosen={data.chosenLabel} /></div>
        </details>
      )}

      <WhyEngine data={data} title="Why the engine proposed this" />
    </div>
  );
}
