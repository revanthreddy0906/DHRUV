import { describe, expect, it } from "vitest";
import { withCreatedShipments, type OpEvent } from "@dhruv/shared";
import { season48 } from "@dhruv/seed";
import { evaluate, reduce } from "@dhruv/engine";

const AT = "2027-01-24T08:00:00.000Z";

function created(seq: number, shipmentId: string, observedAt: string, qty = 10, legPrefix = shipmentId): OpEvent {
  return {
    event_id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    device_id: "HQ-WEB-01",
    seq,
    type: "SHIPMENT_CREATED",
    entity_type: "shipment",
    entity_id: shipmentId,
    node_id: "HQ",
    payload: {
      shipment_id: shipmentId,
      name: `Diesel ${qty} kL`,
      priority: "HIGH",
      dest_node_id: "MAITRI",
      legs: [
        { leg_id: `L2-${legPrefix}`, seq: 2, from_node: "MUMBAI", to_node: "CAPE_TOWN", etd: null, eta: "2027-01-30T00:00:00.000Z", vessel_id: null },
        { leg_id: `L3-${legPrefix}`, seq: 3, from_node: "CAPE_TOWN", to_node: "MAITRI", etd: "2027-02-06T00:00:00.000Z", eta: "2027-02-24T00:00:00.000Z", vessel_id: "V-ICE-STAR" },
      ],
      cargo: [{ inventory_item_id: "INV-DSL", qty }],
    },
    observed_at: observedAt,
    created_at_client: observedAt,
    priority: 3,
    actor_role: "HQ_OPS",
    schema_version: 1,
  };
}

const maitriDiesel = (events: OpEvent[]) =>
  evaluate({ seed: season48, events }, AT).stations.find((s) => s.nodeId === "MAITRI")!.dimensions.find((d) => d.key === "FUEL")!;

describe("SHIPMENT_CREATED", () => {
  it("leaves the seed untouched when no shipment was created", () => {
    expect(withCreatedShipments(season48, [])).toBe(season48);
  });

  it("adds the shipment, its legs and cargo lines; the first creation of an id wins", () => {
    const first = created(1, "C-120", "2027-01-24T07:00:00.000Z", 10);
    const later = created(2, "C-120", "2027-01-24T07:30:00.000Z", 99, "C-120b");
    const seed = withCreatedShipments(season48, [later, first]);
    expect(seed.shipments.filter((s) => s.id === "C-120")).toHaveLength(1);
    expect(seed.cargo_items.filter((c) => c.shipment_id === "C-120").map((c) => c.qty)).toEqual([10]);
    expect(seed.legs.filter((l) => l.shipment_id === "C-120").map((l) => l.id)).toEqual(["L2-C-120", "L3-C-120"]);
    // Folding again changes nothing, and seed ids can never be overwritten.
    expect(withCreatedShipments(seed, [first, later])).toEqual(seed);
    expect(withCreatedShipments(season48, [created(3, "C-104", AT)]).shipments).toEqual(season48.shipments);
  });

  it("counts as feasible inbound for the destination item, and its legs reduce like seeded ones", () => {
    const before = maitriDiesel([]);
    const ev = created(1, "C-120", "2027-01-24T07:00:00.000Z", 10);
    const after = maitriDiesel([ev]);
    expect(after.items![0]!.inbound! - before.items![0]!.inbound!).toBeCloseTo(10, 6);
    expect(after.ratio!).toBeGreaterThan(before.ratio!);

    const delay: OpEvent = { ...ev, event_id: "00000000-0000-4000-8000-000000000009", seq: 9, type: "LEG_DELAYED", entity_type: "leg", entity_id: "L2-C-120", payload: { leg_id: "L2-C-120", new_eta: "2027-02-10T00:00:00.000Z", reason: "feeder slipped" }, observed_at: "2027-01-24T07:30:00.000Z" };
    const leg = reduce(season48, [ev, delay]).legs.get("L2-C-120")!;
    expect(leg).toMatchObject({ shipmentId: "C-120", status: "DELAYED", eta: "2027-02-10T00:00:00.000Z" });
    // Past the vessel's load cut-off the created cargo stops counting (R02), like any seeded shipment.
    expect(maitriDiesel([ev, delay]).items![0]!.inbound).toBeCloseTo(before.items![0]!.inbound!, 6);
  });
});
