import { describe, expect, it } from "vitest";
import { evaluate, impactOf, knowledgeGraph } from "@dhruv/engine";
import type { OpEvent } from "@dhruv/shared";
import { aurora2016Seed, season48 } from "@dhruv/seed";
import { defaultFocus, downstreamOf, focusView, linkToPath, upstreamOf } from "./graphFocus";
import { numberRuns, readableDates, recordAction, recordLabel, recordDetail, recordReason, sourceNote } from "./graphText";

const AT = "2027-01-24T08:10:00.000Z";
const base = { created_at_client: AT, observed_at: AT, priority: 3, schema_version: 1 };
const slip = {
  ...base, event_id: "00000000-0000-4000-8000-000000000001", device_id: "HQ-WEB-01", seq: 1, type: "LEG_DELAYED", entity_type: "leg", entity_id: "L2-C104", node_id: "HQ", actor_role: "HQ_OPS",
  payload: { leg_id: "L2-C104", new_eta: "2027-02-07T00:00:00.000Z", reason: "feeder delayed" },
} as OpEvent;
const proposal = {
  ...base, event_id: "00000000-0000-4000-8000-000000000002", device_id: "DIRECTOR", seq: 2, type: "DECISION_PROPOSED", entity_type: "decision", entity_id: "DEC-01", node_id: "MAITRI", actor_role: "SYSTEM",
  payload: { decision_id: "DEC-01", trigger_event_id: slip.event_id, options: [{ id: "OPT-1", levers: ["HOLD_VESSEL"] }, { id: "OPT-2", levers: ["AIRLIFT_PARTIAL", "CONSERVE"] }], trace: [] },
} as OpEvent;

const build = (events: OpEvent[], seed = season48, node = "MAITRI") => {
  const evaluation = evaluate({ seed, events }, AT);
  return { graph: knowledgeGraph({ seed, events }, evaluation, node), station: evaluation.stations.find((s) => s.nodeId === node) };
};
const visible = (v: ReturnType<typeof focusView>) => [...v.roles.keys()];

describe("graph navigation", () => {
  it("upstream is the reverse walk; downstream is impactOf's set, nearest first", () => {
    const { graph } = build([slip]);
    expect(upstreamOf(graph, "MAITRI.FUEL")).toEqual(["INV-DSL", "C-104", "L2-C104", "L3-C104", "V-ICE-STAR"]);
    expect(upstreamOf(graph, "L2-C104")).toEqual([]);
    const down = downstreamOf(graph, "L2-C104");
    expect(new Set(down)).toEqual(new Set(impactOf(graph, "L2-C104")));
    expect(down.slice(0, 3)).toEqual(["C-104", "INV-DSL", "MAITRI.FUEL"]);
  });

  it("default focus: Fuel while the station is GREEN, even with an AMBER feeder leg", () => {
    const { graph } = build([]);
    expect(graph.nodes.find((n) => n.id === "L2-C104")?.state).toBe("AMBER");
    expect(defaultFocus(graph)).toBe("MAITRI.FUEL");
  });

  it("default focus after the slip: the RED record furthest upstream, L2-C104", () => {
    expect(defaultFocus(build([slip]).graph)).toBe("L2-C104");
    expect(defaultFocus(build([slip, proposal]).graph)).toBe("L2-C104");
  });

  it("Aurora: the graph builds and a focus is chosen", () => {
    const { graph } = build([], aurora2016Seed);
    const focus = defaultFocus(graph);
    expect(graph.nodes.some((n) => n.id === focus)).toBe(true);
    expect(focusView(graph, focus).roles.get(focus)).toBe("focus");
  });
});

describe("focus view", () => {
  it("season start on Fuel: a short calm chain, the rest collapsed", () => {
    const { graph } = build([]);
    const v = focusView(graph, "MAITRI.FUEL");
    expect(v.downstream).toEqual(["MAITRI"]);
    expect(v.remedies).toEqual(["AIRLIFT_PARTIAL", "CONSERVE", "DEFER_F27", "HOLD_VESSEL"]);
    expect(visible(v).length).toBeLessThanOrEqual(12);
    // Only L2-C104 is AMBER and C-104 is GREEN, so no line carries trouble.
    expect(v.edges.filter((e) => e.trouble)).toEqual([]);
    expect(v.pathClear).toBe(false);
    const items = v.collapsed.find((c) => c.column === 2)!;
    expect(items.labels).toEqual(["+ 4 more", "11 roles, all covered", "12 assets OK"]);
  });

  it("after the slip on L2-C104: red path to Maitri and F-27, Hold vessel dashed, route as context", () => {
    const { graph } = build([slip, proposal]);
    const v = focusView(graph, "L2-C104");
    expect(v.downstream).toEqual(expect.arrayContaining(["C-104", "INV-DSL", "MAITRI.FUEL", "MAITRI", "F-27"]));
    expect(v.context).toEqual(["L1-C104", "L3-C104", "V-ICE-STAR"]);
    expect(v.remedies).toContain("HOLD_VESSEL");
    expect(v.remedies).toContain("DEC-01");
    const hold = v.edges.filter((e) => e.edge.from === "HOLD_VESSEL");
    expect(hold.length).toBeGreaterThan(0);
    expect(hold.every((e) => e.style === "dashed")).toBe(true);
    const trouble = (from: string, to: string) => v.edges.find((e) => e.edge.from === from && e.edge.to === to)?.trouble;
    expect(trouble("L2-C104", "C-104")).toBe("RED");
    expect(trouble("MAITRI.FUEL", "MAITRI")).toBe("RED");
    expect(trouble("INV-DSL", "F-27")).toBe("AMBER");
    expect(trouble("INV-DSL", "F-31")).toBeUndefined();
    // Hold vessel sits beside C-104 (its first target on screen), keeping every column short.
    expect(v.column.get("HOLD_VESSEL")).toBe(1);
    const perColumn = [0, 1, 2, 3, 4].map((c) => [...v.column.values()].filter((x) => x === c).length);
    expect(Math.max(...perColumn)).toBeLessThanOrEqual(5);
  });

  it("expanding a column and show-all bring hidden records back", () => {
    const { graph } = build([slip]);
    const expanded = focusView(graph, "L2-C104", { expanded: new Set([2]) });
    expect(expanded.roles.get("role:MAITRI:DOCTOR")).toBe("other");
    expect(expanded.collapsed.some((c) => c.column === 2)).toBe(false);
    const all = focusView(graph, "L2-C104", { showAll: true });
    expect(all.roles.size).toBe(graph.nodes.length);
    expect(all.collapsed).toEqual([]);
  });

  it("links each shown record to the path by its own edge", () => {
    const { graph } = build([slip]);
    const v = focusView(graph, "MAITRI.FUEL");
    expect(linkToPath(v, graph, "C-104")?.kind).toBe("carries 48");
    expect(linkToPath(v, graph, "MAITRI")?.kind).toBe("rolls up into");
  });
});

describe("graph wording", () => {
  it("cards: ratios, dates and quantities in display form", () => {
    const { graph, station } = build([slip]);
    const n = (id: string) => graph.nodes.find((x) => x.id === id)!;
    expect(recordDetail(n("MAITRI.FUEL"), station)).toBe("Ratio 0.697");
    expect(recordDetail(n("L2-C104"), station)).toBe("Delayed · ETA 7 Feb");
    expect(recordDetail(n("INV-DSL"), station)).toBe("92.0 kL on hand");
    expect(recordDetail(n("role:MAITRI:DOCTOR"), station)).toBe("2 of need 1");
    expect(recordDetail(n("assets:MAITRI:Skidoo"), station)).toBe("5 of 5 OK");
    expect(recordDetail(n("V-ICE-STAR"), station)).toBe("Cutoff 4 Feb · ETA 24 Feb");
    expect(recordDetail(n("MAITRI"), station)).toBe("Fuel −40.0 kL short");
    const start = build([]);
    const s = (id: string) => start.graph.nodes.find((x) => x.id === id)!;
    expect(recordDetail(s("L2-C104"), start.station)).toBe("ETA 2 Feb");
    expect(recordDetail(s("INV-DSL"), start.station)).toBe("92.0 kL + 48.0 inbound");
    expect(recordDetail(s("MAITRI"), start.station)).toBe("Within thresholds");
    const places = season48.nodes.map((x) => ({ id: x.id, name: x.name }));
    expect(recordLabel(n("L2-C104"), places)).toBe("L2-C104 Mumbai port → Cape Town");
    expect(recordLabel(n("role:MAITRI:DOCTOR"))).toBe("Doctor");
  });

  it("reasons: one sentence per record", () => {
    const { graph, station } = build([slip]);
    const n = (id: string) => graph.nodes.find((x) => x.id === id)!;
    expect(recordReason(n("L2-C104"), graph, station)).toBe("Leg ETA 7 Feb misses the 4 Feb vessel cutoff.");
    expect(recordReason(n("C-104"), graph, station)).toBe("Cargo excluded by vessel cutoff: the feeder leg arrives 7 Feb, after the 4 Feb cutoff.");
    expect(recordReason(n("F-27"), graph, station)).toBe("Depends on Diesel, which is RED.");
    expect(recordLabel(n("MAITRI.POWER"))).toBe("Spares and power");
    expect(recordReason(n("MAITRI.FUEL"), graph, station)).toBe("Fuel below requirement: 92.0 of 132.0 kL. Cargo excluded by vessel cutoff.");
    const start = build([]);
    expect(recordReason(start.graph.nodes.find((x) => x.id === "L2-C104")!, start.graph, start.station)).toBe("Leg ETA 2 Feb is close to the 4 Feb vessel cutoff.");
  });

  it("source notes, actions and number runs", () => {
    const { graph } = build([slip, proposal]);
    expect(sourceNote(graph.edges.filter((e) => e.from === "L2-C104" || e.to === "L2-C104"))).toBe("From season data and engine rule R02.");
    expect(recordAction(graph.nodes.find((n) => n.id === "HOLD_VESSEL")!, graph)).toEqual({ label: "Open decision", path: "/decisions/DEC-01" });
    expect(recordAction(graph.nodes.find((n) => n.id === "L2-C104")!, graph)?.label).toBe("Open in Cargo");
    expect(numberRuns("Ratio 0.697")).toEqual([{ text: "Ratio ", mono: false }, { text: "0.697", mono: true }]);
    expect(readableDates("until 2027-01-31")).toBe("until 31 Jan");
  });
});
