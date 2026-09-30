import type { OpEvent } from "./events.js";

export interface StockBalance {
  /** The last STOCK_COUNTED, or the seed stock when there is none. */
  base: number;
  /** observed_at of that count; null when the base is the seed. */
  countedAt: string | null;
  /** Issues and receipts after the base, in reduce order. */
  deltas: OpEvent[];
  balance: number;
}

/**
 * Merge class B (section 9): stock is the last count plus the issues and receipts since. The one
 * rule for on-hand stock, used by conflict detection and by the screens. `sorted` must be in
 * reduce order. Null when neither a count nor a seed stock is known.
 */
export function stockBalance(sorted: OpEvent[], itemId: string, seedStock?: number): StockBalance | null {
  const stockEvents = sorted.filter(
    (e) => (e.type === "STOCK_COUNTED" || e.type === "STOCK_ISSUED" || e.type === "STOCK_RECEIVED") && (e.payload as { item_id: string }).item_id === itemId,
  );
  const lastCountIndex = stockEvents.findLastIndex((e) => e.type === "STOCK_COUNTED");
  const lastCount = stockEvents[lastCountIndex];
  const base = lastCount ? (lastCount.payload as { qty: number }).qty : seedStock;
  if (base === undefined) return null;

  const deltas = stockEvents.slice(lastCountIndex + 1);
  const balance = deltas.reduce((sum, e) => {
    const q = (e.payload as { qty: number }).qty;
    return e.type === "STOCK_RECEIVED" ? sum + q : sum - q;
  }, base);
  return { base, countedAt: lastCount?.observed_at ?? null, deltas, balance };
}

/**
 * The engine's form of the same rule: just the balance, 0 when neither a count nor a seed stock
 * is known. Kept so the engine's API is unchanged; there is one implementation, stockBalance().
 */
export function computeStockBalance(itemId: string, sortedEvents: OpEvent[], seedStock: number | undefined): number {
  return stockBalance(sortedEvents, itemId, seedStock)?.balance ?? seedStock ?? 0;
}
