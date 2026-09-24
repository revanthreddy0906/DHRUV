import type { OpEvent } from "./events.js";

export function computeStockBalance(
  itemId: string,
  sortedEvents: OpEvent[],
  seedStock: number | undefined,
): number {
  const stockEvents = sortedEvents.filter(
    (e) =>
      (e.type === "STOCK_COUNTED" || e.type === "STOCK_ISSUED" || e.type === "STOCK_RECEIVED") &&
      (e.payload as { item_id: string }).item_id === itemId,
  );
  const lastCountIndex = stockEvents.findLastIndex((e) => e.type === "STOCK_COUNTED");
  const lastCount = stockEvents[lastCountIndex];
  const base = lastCount !== undefined ? (lastCount.payload as { qty: number }).qty : (seedStock ?? 0);
  const deltas = stockEvents.slice(lastCountIndex + 1);
  return deltas.reduce((sum, e) => {
    const q = (e.payload as { qty: number }).qty;
    return e.type === "STOCK_RECEIVED" ? sum + q : sum - q;
  }, base);
}
