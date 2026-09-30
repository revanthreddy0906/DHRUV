import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { compareEvents } from "@dhruv/shared";
import { Card, SectionHeader, StateBadge, cx } from "../components/primitives";
import { MaintainedBy, RecordedBy, TD, TH, WhereCell } from "../components/records";
import { formatDateTime, formatMargin, formatQty, maintainedBy, stockDerivation, stockLedger } from "../format";
import { nodeLabel } from "../live/chrome";
import { useDevice } from "../live/DeviceProvider";
import { useLiveOps } from "../live/ops";
import { shipmentsOf } from "../live/shipments";
import { StockTransactionForm, stockActionsFor } from "../live/StockTransactionForm";
import { findItem } from "../live/useConsequencePreview";
import { Frame, QuietLine, REFRESHING_AFTER_RESET } from "./Frame";

const FEASIBLE_TEXT = { FEASIBLE: "Counts as inbound", UNCERTAIN: "Uncertain: verify the ETA", EXCLUDED: "Excluded: misses the vessel cutoff" } as const;

/**
 * Stock card for one inventory item (/inventory/:itemId): the balance now and how it is derived,
 * every count, receipt and issue with the balance after it, who recorded it on which device and
 * where that entry is now, the inbound shipments and the requirement from the engine, and the
 * form to record the next entry. Entries are never edited; a correction is a new count.
 */
export function LiveStockCard() {
  const { itemId = "" } = useParams();
  const device = useDevice();
  const ops = useLiveOps();
  const [form, setForm] = React.useState<{ key: number; correction: boolean }>({ key: 0, correction: false });
  const snap = device?.snapshot;

  if (device?.refreshing) return <Frame moment="start" nav="inventory"><QuietLine>{REFRESHING_AFTER_RESET}</QuietLine></Frame>;
  if (!device || !ops || !snap) return <Frame moment="start" nav="inventory"><QuietLine>Loading this device's data…</QuietLine></Frame>;

  const item = ops.seed.inventory_items.find((i) => i.id === itemId);
  if (!item) {
    return (
      <Frame moment="start" nav="inventory">
        <div className="p-8 text-sm text-fg-2">
          <p className="font-semibold text-fg">Item {itemId} is not in this run's season data.</p>
          <p className="mt-1"><Link to="/inventory" className="text-accent hover:underline">Open inventory</Link> for the items this device holds.</p>
        </div>
      </Frame>
    );
  }

  const station = nodeLabel(item.node_id);
  const outbox = { pendingIds: snap.pendingIds, rejected: snap.rejected };
  const sorted = [...snap.events].sort(compareEvents);
  const refused = new Set(snap.rejected.keys());
  const ledger = stockLedger(sorted, item, refused);
  const balance = ledger.at(-1)!.balance;
  const derivation = stockDerivation(sorted.filter((e) => !refused.has(e.event_id)), item);
  const line = findItem(ops.evaluation, item.node_id, item.id)?.item;
  const lines = ops.seed.cargo_items.filter((c) => c.inventory_item_id === item.id);
  const inbound = shipmentsOf(ops.seed, ops.events, ops.now).shipments
    .filter((s) => lines.some((c) => c.shipment_id === s.id))
    .map((s) => ({ s, qty: lines.filter((c) => c.shipment_id === s.id).reduce((n, c) => n + c.qty, 0) }));
  const role = device.session.identity.role;
  const canRecord = stockActionsFor(role).length > 0;
  const margin = line ? formatMargin(line.have, line.need, item.unit) : undefined;

  return (
    <Frame moment="start" nav="inventory">
      <div className="space-y-6 p-6">
        <header className="flex flex-wrap items-start gap-x-8 gap-y-3">
          <div className="min-w-0 flex-1 space-y-1">
            <Link to={`/inventory?station=${item.node_id}`} className="text-sm text-accent hover:underline">Inventory · {station}</Link>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-title font-semibold text-fg">{item.name}</h1>
              {line && line.state !== "GREEN" && <StateBadge state={line.state} />}
            </div>
            <p className="text-sm text-fg-2">Stock card for <span className="font-mono">{item.id}</span> at {station}, in {item.unit}.</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-fg-2">Balance now</div>
            <div className="font-mono text-headline font-semibold tabular-nums text-fg">{formatQty(balance, item.unit)}</div>
            <p className="max-w-md text-sm text-fg-2">{derivation}</p>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <section>
            <SectionHeader title="Requirement" />
            {line ? (
              <dl className="grid grid-cols-3 gap-4 text-sm">
                <div><dt className="text-xs text-fg-2">Required to the next resupply</dt><dd className="font-mono tabular-nums text-fg">{formatQty(line.need, item.unit)}</dd></div>
                <div><dt className="text-xs text-fg-2">Available with feasible inbound</dt><dd className="font-mono tabular-nums text-fg">{formatQty(line.have, item.unit)}</dd></div>
                <div><dt className="text-xs text-fg-2">Margin</dt><dd className={cx("font-mono tabular-nums", line.state === "RED" ? "font-semibold text-bad" : line.state === "AMBER" ? "font-semibold text-warn" : "text-fg")}>{margin ?? "unknown"}</dd></div>
              </dl>
            ) : <p className="text-sm text-fg-2">The engine has no requirement line for this item on this device. Its margin is unknown.</p>}
          </section>
          <section>
            <SectionHeader title="Maintained by" />
            <MaintainedBy owner={station} lines={maintainedBy(["STOCK_COUNTED", "STOCK_ISSUED", "STOCK_RECEIVED"], station)} />
          </section>
        </div>

        {inbound.length > 0 && (
          <section>
            <SectionHeader title="Inbound shipments" />
            <Card pad="none" className="overflow-hidden">
              <table className="w-full">
                <thead className="bg-elevated"><tr>{["Shipment", "Quantity of this item", "Slack", "State"].map((h, i) => <th key={h} className={cx(TH, i === 1 && "text-right")}>{h}</th>)}</tr></thead>
                <tbody>
                  {inbound.map(({ s, qty }) => (
                    <tr key={s.id} className={cx("border-t border-line", s.feasible === "EXCLUDED" && "bg-bad-tint/50", s.feasible === "UNCERTAIN" && "bg-warn-tint/60")}>
                      <td className={TD}><span className="font-mono">{s.id}</span> <span className="text-fg-2">{s.contents}</span></td>
                      <td className={cx(TD, "text-right font-mono tabular-nums")}>{formatQty(qty, item.unit)}</td>
                      <td className={cx(TD, "font-mono", s.slackState === "RED" ? "text-bad" : s.slackState === "AMBER" ? "text-warn" : "text-fg")}>{s.slack === "—" ? "" : `${s.slack} slack`}</td>
                      <td className={cx(TD, s.feasible === "EXCLUDED" ? "font-semibold text-bad" : s.feasible === "UNCERTAIN" ? "font-semibold text-warn" : "text-fg")}>{FEASIBLE_TEXT[s.feasible]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        )}

        <section>
          <SectionHeader title="Ledger" meta={<span className="text-xs text-fg-2">Every count, receipt and issue, oldest first. Entries are never edited.</span>} />
          <Card pad="none" className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-elevated">
                <tr>{["Date", "Entry", "Quantity", "Balance", "Reason", "Recorded by", "Where this entry is"].map((h, i) => <th key={h} className={cx(TH, (i === 2 || i === 3) && "text-right")}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {ledger.map((r) => (
                  <tr key={r.id} className={cx("border-t border-line", !r.counted && "bg-bad-tint/50")}>
                    <td className={cx(TD, "whitespace-nowrap font-mono text-fg-2")}>{formatDateTime(r.at)}</td>
                    <td className={cx(TD, "text-fg")}>{r.entry}{!r.counted && <span className="block text-xs text-fg-2">not counted</span>}</td>
                    <td className={cx(TD, "whitespace-nowrap text-right font-mono tabular-nums text-fg")}>{r.qty}</td>
                    <td className={cx(TD, "whitespace-nowrap text-right font-mono tabular-nums text-fg")}>{formatQty(r.balance, item.unit)}</td>
                    <td className={cx(TD, "text-fg-2")}>
                      {r.reason ?? ""}
                      {r.variance && r.variance.diff !== 0 && <span className="block text-xs">Against the book balance: <span className="font-mono">{r.variance.text}</span></span>}
                    </td>
                    <td className={TD}><RecordedBy event={r.event} /></td>
                    <td className={TD}><WhereCell event={r.event} outbox={outbox} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <SectionHeader title="Record an entry" className="mb-0" />
            {canRecord && stockActionsFor(role).some((a) => a.type === "STOCK_COUNTED") && (
              <button type="button" onClick={() => setForm((f) => ({ key: f.key + 1, correction: true }))} className="text-sm font-semibold text-accent hover:underline">Record correction</button>
            )}
          </div>
          {form.correction && <p className="text-sm text-fg-2">Entries are never edited; a correction is a new count.</p>}
          <StockTransactionForm key={form.key} role={role} node={item.node_id} seed={ops.seed} rows={ops.inventory} events={ops.events} now={ops.now} evaluation={ops.evaluation}
            fixedItemId={item.id} initialAction={form.correction ? "STOCK_COUNTED" : undefined} autoFocusQuantity={form.correction} />
        </section>
      </div>
    </Frame>
  );
}
