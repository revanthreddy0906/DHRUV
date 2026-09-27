import { compareEvents, type OpEvent, type PayloadOf } from "./events.js";
import type { Seed } from "./api.js";

/**
 * The seed plus every shipment created by a SHIPMENT_CREATED event (merge class A: a record is
 * created once). Events are taken in reduce order and the first creation of a shipment or leg id
 * wins; ids the seed already has are ignored, so folding an already folded seed changes nothing.
 * Returns the same seed object when the log holds no SHIPMENT_CREATED.
 */
export function withCreatedShipments(seed: Seed, events: OpEvent[]): Seed {
  const created = events.filter((e) => e.type === "SHIPMENT_CREATED");
  if (created.length === 0) return seed;

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
  return { ...seed, shipments, legs, cargo_items: cargo };
}
