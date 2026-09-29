import * as React from "react";
import { Link } from "react-router-dom";
import { compareEvents, stockBalance, type OpEvent } from "@dhruv/shared";
import { Button, Card, SectionHeader, cx, FIELD } from "../components/primitives";
import { RecordedBy, TD, TH, WhereCell } from "../components/records";
import { formatAgo, formatDateTime, formatQty, needsVarianceReason, variance, varianceReview } from "../format";
import { nodeLabel } from "../live/chrome";
import type { LiveDevice } from "../live/DeviceProvider";
import type { LiveOps } from "../live/ops";
import { validateStock } from "../live/StockTransactionForm";
import { STOCKTAKE_VARIANCE_REASON_FRACTION, VARIANCE_REVIEW_FRACTION } from "../ui-config";

const input = FIELD;
const pct = (f: number) => `${Math.round(f * 100)} %`;

/**
 * Stocktake (Inventory, "Start stocktake"): one sheet for every item at the station, oldest count
 * first, with the book balance, the counted quantity and the variance. A variance over the UI
 * threshold needs a reason, which travels with the count (STOCK_COUNTED.reason). Recording writes
 * one STOCK_COUNTED per counted line through device.write(); each line then shows where its count is.
 */
export function StocktakePanel({ ops, device, node, onClose }: { ops: LiveOps; device: LiveDevice; node: string; onClose: () => void }) {
  const snap = device.snapshot!;
  const sorted = React.useMemo(() => [...ops.events].sort(compareEvents), [ops.events]);
  // Once recorded, the sheet keeps the book balances it was counted against (the new counts
  // become the book balance, which would otherwise make every variance read "no change").
  const [frozen, setFrozen] = React.useState<{ item: (typeof ops.seed.inventory_items)[number]; book: number; countedAt: string }[] | null>(null);
  const liveLines = React.useMemo(() => ops.seed.inventory_items
    .filter((i) => i.node_id === node)
    .map((item) => {
      const b = stockBalance(sorted, item.id, item.stock);
      return { item, book: b?.balance ?? item.stock, countedAt: b?.countedAt ?? item.last_counted };
    })
    .sort((a, b) => a.countedAt.localeCompare(b.countedAt)), [ops.seed, node, sorted]);
  const lines = frozen ?? liveLines;
  const [entries, setEntries] = React.useState<Record<string, { qty: string; reason: string }>>({});
  const [written, setWritten] = React.useState<Record<string, OpEvent>>({});
  const [failed, setFailed] = React.useState<Record<string, string>>({});
  const [touched, setTouched] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const done = Object.keys(written).length > 0;

  const checked = lines.map((l) => {
    const e = entries[l.item.id] ?? { qty: "", reason: "" };
    const filled = e.qty.trim() !== "";
    const errors = filled ? validateStock("STOCK_COUNTED", e.qty, e.reason) : {};
    const v = filled && !errors.qty ? variance(Number(e.qty), l.book, l.item.unit) : undefined;
    const reasonNeeded = !!v && needsVarianceReason(v, STOCKTAKE_VARIANCE_REASON_FRACTION);
    const reasonError = errors.reason ?? (reasonNeeded && !e.reason.trim() ? `A variance over ${pct(STOCKTAKE_VARIANCE_REASON_FRACTION)} needs a reason` : undefined);
    return { ...l, e, filled, v, reasonNeeded, qtyError: errors.qty, reasonError };
  });
  const counted = checked.filter((c) => c.filled);
  const invalid = counted.some((c) => c.qtyError || c.reasonError);

  const set = (id: string, patch: Partial<{ qty: string; reason: string }>) =>
    setEntries((all) => ({ ...all, [id]: { ...(all[id] ?? { qty: "", reason: "" }), ...patch } }));

  const record = async () => {
    setTouched(true);
    if (busy || invalid || counted.length === 0) return;
    setBusy(true);
    setFrozen(lines);
    const ok: Record<string, OpEvent> = {};
    const bad: Record<string, string> = {};
    for (const c of counted) {
      try {
        const reason = c.e.reason.trim();
        ok[c.item.id] = await device.write({
          type: "STOCK_COUNTED", entity_type: "inventory_item", entity_id: c.item.id, node_id: c.item.node_id,
          payload: { item_id: c.item.id, qty: Number(c.e.qty), ...(reason ? { reason } : {}) },
        });
      } catch (err) {
        bad[c.item.id] = `Not saved on this device: ${(err as Error).message}`;
      }
    }
    setWritten(ok);
    setFailed(bad);
    setBusy(false);
    device.syncNow();
  };

  const outbox = { pendingIds: snap.pendingIds, rejected: snap.rejected };
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1">
          <SectionHeader title={`Stocktake · ${nodeLabel(node)}`} className="mb-0" />
          <p className="text-sm text-fg-2">
            Count every item and enter what you find. Oldest count first. A variance over {pct(STOCKTAKE_VARIANCE_REASON_FRACTION)} of the book balance needs a reason, which is recorded with the count. Lines left empty are not recorded.
          </p>
        </div>
        <Button onClick={onClose}>{done ? "Close stocktake" : "Cancel stocktake"}</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-elevated">
            <tr>{["Item", "Last counted", "Book balance", "Counted", "Variance", "Reason", done ? "Where this count is" : ""].map((h, i) => <th key={i} className={cx(TH, (i === 2 || i === 4) && "text-right")}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {checked.map((c) => (
              <tr key={c.item.id} className={cx("border-t border-line", c.reasonNeeded && "bg-warn-tint/60")}>
                <td className={cx(TD, "whitespace-nowrap")}><Link to={`/inventory/${c.item.id}`} className="text-accent hover:underline">{c.item.name}</Link></td>
                <td className={cx(TD, "whitespace-nowrap")}><span className="font-mono text-fg-2">{formatDateTime(c.countedAt)}</span><span className="block text-xs text-fg-2">{formatAgo(c.countedAt, ops.now)}</span></td>
                <td className={cx(TD, "whitespace-nowrap text-right font-mono tabular-nums")}>{formatQty(c.book, c.item.unit)}</td>
                <td className={TD}>
                  <label className="flex items-center gap-1.5">
                    <input aria-label={`Counted ${c.item.name}`} inputMode="decimal" value={c.e.qty} disabled={done} onChange={(ev) => set(c.item.id, { qty: ev.target.value })} className={cx(input, "w-28 text-right font-mono")} />
                    <span className="text-xs text-fg-2">{c.item.unit}</span>
                  </label>
                  {touched && c.qtyError && <span className="mt-1 block text-xs text-bad">{c.qtyError}</span>}
                </td>
                <td className={cx(TD, "whitespace-nowrap text-right font-mono tabular-nums", c.reasonNeeded ? "font-semibold text-warn" : "text-fg-2")}>{c.v ? c.v.text : ""}</td>
                <td className={TD}>
                  <input aria-label={`Reason for ${c.item.name}`} value={c.e.reason} maxLength={200} disabled={done} placeholder={c.reasonNeeded ? "Reason required" : "Optional"}
                    onChange={(ev) => set(c.item.id, { reason: ev.target.value })} className={cx(input, "w-64")} />
                  {touched && c.reasonError && <span className="mt-1 block text-xs text-bad">{c.reasonError}</span>}
                </td>
                <td className={TD}>
                  {written[c.item.id] ? <WhereCell event={written[c.item.id]} outbox={outbox} /> : failed[c.item.id] ? <span className="text-bad">{failed[c.item.id]}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!done && (
        <div className="flex items-center gap-3">
          <Button variant="primary" disabled={busy || counted.length === 0 || (touched && invalid)} onClick={() => void record()}>
            {busy ? "Saving…" : counted.length === 1 ? "Record 1 count" : `Record ${counted.length} counts`}
          </Button>
          {touched && invalid && <span className="text-sm text-bad">Fix the marked lines first.</span>}
        </div>
      )}
      {done && <p role="status" className="text-sm text-fg">Recorded {Object.keys(written).length} {Object.keys(written).length === 1 ? "count" : "counts"} on this device. Each line shows where its count is now.</p>}
    </Card>
  );
}

/**
 * HQ's Variance review: counts whose variance from the book balance was large, with the reason
 * recorded with each count. Derived from the ledger; no new events.
 */
export function VarianceReview({ ops, device }: { ops: LiveOps; device: LiveDevice }) {
  const snap = device.snapshot!;
  const rows = React.useMemo(() => {
    const sorted = [...snap.events].sort(compareEvents);
    return varianceReview(sorted, ops.seed.inventory_items, new Set(snap.rejected.keys()), VARIANCE_REVIEW_FRACTION);
  }, [snap.events, snap.rejected, ops.seed]);
  if (rows.length === 0) return null;
  const outbox = { pendingIds: snap.pendingIds, rejected: snap.rejected };
  return (
    <section>
      <SectionHeader title="Variance review" meta={<span className="text-xs text-fg-2">Counts more than {pct(VARIANCE_REVIEW_FRACTION)} away from the book balance, newest first</span>} />
      <Card pad="none" className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-elevated">
            <tr>{["Date", "Station", "Item", "Counted", "Variance", "Reason", "Recorded by", "Where this entry is"].map((h, i) => <th key={h} className={cx(TH, (i === 3 || i === 4) && "text-right")}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(({ item, row }) => (
              <tr key={row.id} className="border-t border-line">
                <td className={cx(TD, "whitespace-nowrap font-mono text-fg-2")}>{formatDateTime(row.at)}</td>
                <td className={TD}>{nodeLabel(item.node_id)}</td>
                <td className={TD}><Link to={`/inventory/${item.id}`} className="text-accent hover:underline">{item.name}</Link></td>
                <td className={cx(TD, "whitespace-nowrap text-right font-mono tabular-nums")}>{row.qty}</td>
                <td className={cx(TD, "whitespace-nowrap text-right font-mono tabular-nums font-semibold text-warn")}>{row.variance?.text}</td>
                <td className={cx(TD, row.reason ? "text-fg" : "text-fg-2")}>{row.reason ?? "No reason recorded"}</td>
                <td className={TD}><RecordedBy event={row.event} /></td>
                <td className={TD}><WhereCell event={row.event} outbox={outbox} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}
