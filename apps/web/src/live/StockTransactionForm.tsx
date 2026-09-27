import * as React from "react";
import { EVENT_RULES, type Seed } from "@dhruv/shared";
import { Button, Card, SectionHeader } from "../components/primitives";
import type { InventoryView } from "../data/demo";
import { WriteFeedback, useEventWriter } from "./writeStatus";

const STOCK_ACTIONS = [
  { type: "STOCK_ISSUED", label: "Issue" },
  { type: "STOCK_RECEIVED", label: "Receive" },
  { type: "STOCK_COUNTED", label: "Count" },
] as const;
type StockType = (typeof STOCK_ACTIONS)[number]["type"];

/** The stock actions a role may record, straight from the event contract (EVENT_RULES). */
export function stockActionsFor(role: string) {
  return STOCK_ACTIONS.filter((a) => (EVENT_RULES[a.type].allowedRoles as readonly string[]).includes(role));
}

/** Field errors for one stock transaction; mirrors the STOCK_* payload schemas in @dhruv/shared. */
export function validateStock(action: StockType, qtyInput: string, reason: string): { qty?: string; reason?: string } {
  const errors: { qty?: string; reason?: string } = {};
  const qty = Number(qtyInput);
  if (qtyInput.trim() === "" || !Number.isFinite(qty)) errors.qty = "Enter a number";
  else if (action === "STOCK_ISSUED" && qty <= 0) errors.qty = "Issue quantity must be greater than 0";
  else if (qty < 0) errors.qty = "Quantity cannot be negative";
  if (action === "STOCK_ISSUED" && !reason.trim()) errors.reason = "A reason is required for an issue";
  return errors;
}

const input = "h-8 rounded-md border border-line-ctrl bg-bg px-2 text-sm text-fg";

/**
 * One transaction card for a station's stock: Item, Action, Quantity (and Reason / Shipment), Submit.
 * It only produces STOCK_* events through device.write(); the table beside it moves because the
 * engine re-reduces the log, never because this form touched a number. Mount it keyed by station.
 */
export function StockTransactionForm({ role, node, seed, rows }: { role: string; node: string; seed: Seed; rows: InventoryView[] }) {
  const actions = stockActionsFor(role);
  const items = seed.inventory_items.filter((i) => i.node_id === node);
  const shipments = seed.shipments.filter((s) => s.dest_node_id === node);

  const [itemId, setItemId] = React.useState(items[0]?.id ?? "");
  const [action, setAction] = React.useState<StockType>(actions[0]?.type ?? "STOCK_COUNTED");
  const [qty, setQty] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [shipmentId, setShipmentId] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const { busy, error, last, submit } = useEventWriter();

  if (actions.length === 0) {
    return (
      <Card>
        <SectionHeader title="Stock transactions" />
        <p className="text-sm text-fg-2">Read only. Stock is counted, issued and received by the Station Leader (HQ Ops may count).</p>
      </Card>
    );
  }

  const item = items.find((i) => i.id === itemId);
  const row = rows.find((r) => r.id === itemId);
  const errors = validateStock(action, qty, reason);
  const invalid = !item || Object.keys(errors).length > 0;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (busy || invalid || !item) return;
    const n = Number(qty);
    const payload =
      action === "STOCK_ISSUED" ? { item_id: item.id, qty: n, reason: reason.trim() }
      : action === "STOCK_RECEIVED" ? { item_id: item.id, qty: n, ...(shipmentId ? { shipment_id: shipmentId } : {}) }
      : { item_id: item.id, qty: n };
    const verb = STOCK_ACTIONS.find((a) => a.type === action)!.label.toLowerCase();
    const ok = await submit(
      { type: action, entity_type: "inventory_item", entity_id: item.id, node_id: item.node_id, payload },
      `${verb} ${n} ${item.unit} ${item.name}`,
    );
    // Clear only after the local write succeeded; on failure the operator keeps what they typed.
    if (ok) {
      setQty("");
      setReason("");
      setShipmentId("");
      setTouched(false);
    }
  };

  const fieldError = (msg?: string) => (touched && msg ? <span className="mt-1 block text-xs text-bad">{msg}</span> : null);

  return (
    <Card>
      <SectionHeader title="Stock transaction" meta={<span className="text-xs text-fg-2">Saved on this device first, then synced</span>} />
      <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-start gap-4">
        <label className="text-xs text-fg-2">Item
          <select aria-label="Item" value={itemId} onChange={(e) => setItemId(e.target.value)} className={`${input} mt-1 block w-56`}>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.id})</option>)}
          </select>
          {row && <span className="mt-1 block text-xs">Current stock <span className="font-mono text-fg">{row.stock}</span></span>}
        </label>
        <label className="text-xs text-fg-2">Action
          <select aria-label="Action" value={action} onChange={(e) => setAction(e.target.value as StockType)} className={`${input} mt-1 block w-32`}>
            {actions.map((a) => <option key={a.type} value={a.type}>{a.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-fg-2">{action === "STOCK_COUNTED" ? "Counted quantity" : "Quantity"}{item ? ` (${item.unit})` : ""}
          <input aria-label="Quantity" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className={`${input} mt-1 block w-32 font-mono`} />
          {fieldError(errors.qty)}
        </label>
        {action === "STOCK_ISSUED" && (
          <label className="text-xs text-fg-2">Reason
            <input aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. generator refuel" className={`${input} mt-1 block w-60`} />
            {fieldError(errors.reason)}
          </label>
        )}
        {action === "STOCK_RECEIVED" && shipments.length > 0 && (
          <label className="text-xs text-fg-2">Shipment (optional)
            <select aria-label="Shipment" value={shipmentId} onChange={(e) => setShipmentId(e.target.value)} className={`${input} mt-1 block w-40 font-mono`}>
              <option value="">—</option>
              {shipments.map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
            </select>
          </label>
        )}
        <div className="pt-5">
          <Button variant="primary" type="submit" disabled={busy || (touched && invalid)}>{busy ? "Saving…" : "Submit"}</Button>
        </div>
      </form>
      <div className="mt-3">
        <WriteFeedback event={last?.event} summary={last?.summary} error={error} />
      </div>
    </Card>
  );
}
