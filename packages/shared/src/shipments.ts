import { compareEvents, type OpEvent, type PayloadOf } from "./events.js";
import type { Seed } from "./api.js";

/** Seeds this module produced: folding one again would draw receipts down twice. */
const FOLDED = new WeakSet<Seed>();

/**
 * The seed as the event log has changed its shipments:
 * - every shipment created by a SHIPMENT_CREATED event (merge class A: created once). Events are
 *   taken in reduce order and the first creation of a shipment or leg id wins; ids the seed
 *   already has are ignored.
 * - every STOCK_RECEIVED that names a shipment draws that shipment's cargo line for the item down
 *   by the quantity received (never below 0), so offloaded cargo is counted once, as stock, and
 *   no longer as inbound.
 * Returns the same seed object when the log changes nothing, and a folded seed is returned as is.
 */
export function withCreatedShipments(seed: Seed, events: OpEvent[]): Seed {
  if (FOLDED.has(seed)) return seed;
  const created = events.filter((e) => e.type === "SHIPMENT_CREATED");
  const receipts = events.filter((e) => e.type === "STOCK_RECEIVED" && typeof (e.payload as { shipment_id?: unknown }).shipment_id === "string");
  if (created.length === 0 && receipts.length === 0) return seed;

  const shipments = [...seed.shipments];
  const legs = [...seed.legs];
  const cargo = [...seed.cargo_items];
  const shipmentIds = new Set(shipments.map((s) => s.id));
  const legIds = new Set(legs.map((l) => l.id));

  for (const e of created.sort(compareEvents)) {
    const p = e.payload as PayloadOf<"SHIPMENT_CREATED">;
    if (shipmentIds.has(p.shipment_id) || p.legs.some((l) => legIds.has(l.leg_id))) continue;
    shipmentIds.add(p.shipment_id);
    shipments.push({ id: p.shipment_id, name: p.name, priority: p.priority, dest_node_id: p.dest_node_id });
    for (const l of p.legs) {
      legIds.add(l.leg_id);
      legs.push({
        id: l.leg_id,
        shipment_id: p.shipment_id,
        seq: l.seq,
        from_node: l.from_node,
        to_node: l.to_node,
        etd: l.etd ?? null,
        eta: l.eta,
        vessel_id: l.vessel_id ?? null,
        status: "PLANNED",
      });
    }
    p.cargo.forEach((c, i) => cargo.push({ id: `CG-${p.shipment_id}-${i + 1}`, shipment_id: p.shipment_id, inventory_item_id: c.inventory_item_id, qty: c.qty }));
  }
  // Receipts against a shipment: what has been offloaded is stock now, not inbound.
  const received = new Map<string, number>();
  for (const e of receipts) {
    const p = e.payload as PayloadOf<"STOCK_RECEIVED">;
    const key = `${p.shipment_id}|${p.item_id}`;
    received.set(key, (received.get(key) ?? 0) + p.qty);
  }
  const drawn = cargo.map((c) => {
    const key = `${c.shipment_id}|${c.inventory_item_id}`;
    const left = received.get(key);
    if (left === undefined || left <= 0) return c;
    const take = Math.min(left, c.qty);
    received.set(key, left - take);
    return { ...c, qty: Math.round((c.qty - take) * 1e6) / 1e6 };
  });

  const folded = { ...seed, shipments, legs, cargo_items: drawn };
  FOLDED.add(folded);
  return folded;
}
