import { reduce } from "@dhruv/engine";
import type { OpEvent, Seed } from "@dhruv/shared";
import { nodeLabel } from "./chrome";

/** One shipment's route as stops and legs, for the horizontal route diagram on Map (section 9.7). */
export interface RouteView {
  shipmentId: string;
  name: string;
  stops: { node: string; label: string }[];
  legs: { id: string; eta: string; plannedEta: string; status: string; vessel: boolean }[];
  /** The vessel's load cutoff, at the stop where the vessel leg starts. */
  cutoff?: { stopIndex: number; date: string };
}

/**
 * The route of the shipment that carries the station's diesel (the demo's C-104), else the first
 * shipment. ETAs, statuses and the load cutoff are this device's reduce() of the events.
 */
export function routeView(seed: Seed, events: OpEvent[], node = "MAITRI"): RouteView | undefined {
  const diesel = seed.inventory_items.find((i) => i.node_id === node && i.dimension === "FUEL");
  const shipmentId = seed.cargo_items.find((c) => c.inventory_item_id === diesel?.id)?.shipment_id ?? seed.shipments[0]?.id;
  const shipment = seed.shipments.find((s) => s.id === shipmentId);
  if (!shipment) return undefined;
  const state = reduce(seed, events);
  const legs = seed.legs.filter((l) => l.shipment_id === shipment.id).sort((a, b) => a.seq - b.seq);
  if (legs.length === 0) return undefined;
  const stops = [legs[0]!.from_node, ...legs.map((l) => l.to_node)].map((n) => ({ node: n, label: nodeLabel(n) }));
  const vesselIndex = legs.findIndex((l) => l.vessel_id);
  const vessel = vesselIndex >= 0 ? state.vessels.get(legs[vesselIndex]!.vessel_id!) : undefined;
  return {
    shipmentId: shipment.id,
    name: shipment.name,
    stops,
    legs: legs.map((l) => {
      const s = state.legs.get(l.id);
      return { id: l.id, eta: l.vessel_id && vessel ? vessel.etaStation : (s?.eta ?? l.eta), plannedEta: l.eta, status: s?.status ?? l.status, vessel: !!l.vessel_id };
    }),
    cutoff: vessel ? { stopIndex: vesselIndex, date: vessel.loadCutoff } : undefined,
  };
}
