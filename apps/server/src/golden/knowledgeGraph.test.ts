import { describe, expect, it } from "vitest";
import { evaluate, impactOf, knowledgeGraph } from "@dhruv/engine";
import type { EventType, OpEvent } from "@dhruv/shared";
import { season48 } from "@dhruv/seed";

const AT = "2027-01-24T08:10:00.000Z";
let seq = 0;
const ev = (type: EventType, entity_type: string, entity_id: string, payload: Record<string, unknown>, node_id = "HQ", actor_role: OpEvent["actor_role"] = "HQ_OPS"): OpEvent => ({
  event_id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`, device_id: "HQ-WEB-01", seq, type, entity_type, entity_id, node_id, payload,
  observed_at: "2027-01-24T08:05:00.000Z", created_at_client: "2027-01-24T08:05:00.000Z", priority: 3, actor_role, schema_version: 1,
});
const graph = (events: OpEvent[], node = "MAITRI") => knowledgeGraph({ seed: season48, events }, evaluate({ seed: season48, events }, AT), node);
const has = (g: ReturnType<typeof graph>, from: string, to: string) => g.edges.some((e) => e.from === from && e.to === to);

describe("knowledge graph", () => {
  it("links vessel → feeder leg → shipment → item → dimension → station for Maitri diesel", () => {
    const g = graph([]);
    expect(has(g, "V-ICE-STAR", "L3-C104")).toBe(true);
    expect(has(g, "L2-C104", "C-104")).toBe(true);
    expect(has(g, "C-104", "INV-DSL")).toBe(true);
    expect(has(g, "INV-DSL", "MAITRI.FUEL")).toBe(true);
    expect(has(g, "MAITRI.FUEL", "MAITRI")).toBe(true);
    expect(has(g, "INV-DSL", "F-27")).toBe(true); // DRAWS_FROM
    expect(has(g, "role:MAITRI:DOCTOR", "MAITRI.PERSONNEL")).toBe(true);
    expect(has(g, "assets:MAITRI:Generator", "MAITRI.POWER")).toBe(true);
    expect(has(g, "HOLD_VESSEL", "C-104")).toBe(true);
    expect(has(g, "DEFER_F27", "F-27")).toBe(true);
    expect(g.nodes.find((n) => n.id === "MAITRI")!.state).toBe("GREEN");
  });

  it("shows what a feeder delay reaches, and turns that path RED after the slip", () => {
    expect(impactOf(graph([]), "L2-C104")).toEqual(expect.arrayContaining(["C-104", "INV-DSL", "MAITRI.FUEL", "MAITRI", "F-27", "F-31"]));
    const slipped = graph([ev("LEG_DELAYED", "leg", "L2-C104", { leg_id: "L2-C104", new_eta: "2027-02-07T00:00:00.000Z", reason: "feeder delayed" })]);
    for (const id of ["L2-C104", "C-104", "INV-DSL", "MAITRI.FUEL", "MAITRI"]) expect(slipped.nodes.find((n) => n.id === id)!.state, id).toBe("RED");
  });

  it("follows the log: created shipments, people moved away, incidents", () => {
    const created = ev("SHIPMENT_CREATED", "shipment", "C-113", {
      shipment_id: "C-113", name: "Diesel 10 kL", priority: "HIGH", dest_node_id: "BHARATI",
      legs: [{ leg_id: "L2-C113", seq: 2, from_node: "MUMBAI", to_node: "CAPE_TOWN", eta: "2027-01-30T00:00:00.000Z" }, { leg_id: "L3-C113", seq: 3, from_node: "CAPE_TOWN", to_node: "BHARATI", eta: "2027-02-24T00:00:00.000Z", vessel_id: "V-ICE-STAR" }],
      cargo: [{ inventory_item_id: "INV-BH-DSL", qty: 10 }],
    });
    const moved = ev("PERSON_MOVED", "person", "P-MENON", { person_id: "P-MENON", from_node: "MAITRI", to_node: "CAPE_TOWN", depart: "2027-01-24T08:00:00.000Z", arrive: "2027-01-24T08:00:00.000Z" });
    const g = graph([created, moved], "BHARATI");
    expect(g.edges.find((e) => e.from === "C-113" && e.to === "INV-BH-DSL")?.source).toBe("event");
    const maitri = graph([created, moved]);
    expect(maitri.nodes.find((n) => n.id === "role:MAITRI:DOCTOR")!.sub).toBe("1 / need 1");
  });

  it("is deterministic", () => {
    expect(JSON.stringify(graph([]))).toBe(JSON.stringify(graph([])));
  });
});
