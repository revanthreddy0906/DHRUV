import { describe, expect, it } from "vitest";
import { season48 } from "@dhruv/seed";
import { payloadSchemas } from "@dhruv/shared";
import { buildShipment, nextShipmentId, type ShipmentInput } from "./ShipmentForm";

const vessel = { id: "V-ICE-STAR", departure: "2027-02-06T00:00:00.000Z", etaStation: "2027-02-24T00:00:00.000Z" };
const base: ShipmentInput = { id: "C-113", name: "Diesel 20 kL", priority: "HIGH", dest: "BHARATI", feederEta: "30 Jan", onVessel: true, itemId: "INV-BH-DSL", qty: "20" };

describe("new shipment form", () => {
  it("suggests the next free C- id", () => {
    expect(nextShipmentId(season48)).toBe("C-113");
  });

  it("builds a SHIPMENT_CREATED payload the contract accepts, with the seed's leg pattern", () => {
    const { errors, payload } = buildShipment(base, season48, vessel);
    expect(errors).toEqual({});
    expect(payloadSchemas.SHIPMENT_CREATED.safeParse(payload).success).toBe(true);
    expect(payload!.legs.map((l) => [l.leg_id, l.from_node, l.to_node, l.vessel_id])).toEqual([
      ["L2-C113", "MUMBAI", "CAPE_TOWN", null],
      ["L3-C113", "CAPE_TOWN", "BHARATI", "V-ICE-STAR"],
    ]);
    expect(payload!.cargo).toEqual([{ inventory_item_id: "INV-BH-DSL", qty: 20 }]);
  });

  it("blocks an existing id, missing contents, an unreadable date and a bad quantity", () => {
    const { errors, payload } = buildShipment({ ...base, id: "C-104", name: " ", feederEta: "soon", qty: "0" }, season48, vessel);
    expect(payload).toBeUndefined();
    expect(Object.keys(errors).sort()).toEqual(["feederEta", "id", "name", "qty"]);
  });
});
