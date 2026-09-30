import { describe, expect, it } from "vitest";
import { evaluate, knowledgeGraph } from "@dhruv/engine";
import type { OpEvent } from "@dhruv/shared";
import { aurora2016Seed, season48 } from "@dhruv/seed";
import { defaultFocus, focusView } from "../format";
import { CARD_H, CARD_W, layoutFocus, roundedPath, routePoints, type Box, type Layout } from "./graphLayout";

const AT = "2027-01-24T08:10:00.000Z";
const slip = {
  event_id: "00000000-0000-4000-8000-000000000001", device_id: "HQ-WEB-01", seq: 1, created_at_client: AT, observed_at: AT, priority: 3, schema_version: 1,
  type: "LEG_DELAYED", entity_type: "leg", entity_id: "L2-C104", node_id: "HQ", actor_role: "HQ_OPS",
  payload: { leg_id: "L2-C104", new_eta: "2027-02-07T00:00:00.000Z", reason: "feeder delayed" },
} as OpEvent;
const graphOf = (events: OpEvent[], seed = season48) => knowledgeGraph({ seed, events }, evaluate({ seed, events }, AT), "MAITRI");

/** True if any segment of the route passes through a card other than its two ends. */
function crossesCard(points: [number, number][], layout: Layout, ends: string[]): string | undefined {
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1]!, [x2, y2] = points[i]!;
    for (const b of layout.boxes.values()) {
      if (ends.includes(b.id)) continue;
      const hitX = Math.max(x1, x2) > b.x + 1 && Math.min(x1, x2) < b.x + CARD_W - 1;
      const hitY = Math.max(y1, y2) > b.y + 1 && Math.min(y1, y2) < b.y + CARD_H - 1;
      if (hitX && hitY) return b.id;
    }
  }
  return undefined;
}

describe("Connections layout", () => {
  const cases = [
    ["season start, Fuel", graphOf([]), "MAITRI.FUEL", false],
    ["after the slip, L2-C104", graphOf([slip]), "L2-C104", false],
    ["after the slip, Diesel", graphOf([slip]), "INV-DSL", false],
    ["after the slip, show all", graphOf([slip]), "L2-C104", true],
    ["Aurora default", graphOf([], aurora2016Seed), undefined, false],
  ] as const;

  for (const [name, graph, focus, showAll] of cases) {
    it(`${name}: no line crosses a card`, () => {
      const view = focusView(graph, focus ?? defaultFocus(graph), { showAll });
      const layout = layoutFocus(view, graph.nodes.map((n) => n.id));
      for (const { edge } of view.edges) {
        const a = layout.boxes.get(edge.from)!, b = layout.boxes.get(edge.to)!;
        expect(crossesCard(routePoints(a, b, layout), layout, [a.id, b.id]), `${edge.from} -> ${edge.to}`).toBeUndefined();
      }
    });
  }

  it("the slip chain reads as one row: L2-C104, C-104, Diesel, Fuel, Maitri", () => {
    const graph = graphOf([slip]);
    const layout = layoutFocus(focusView(graph, "L2-C104"), graph.nodes.map((n) => n.id));
    const row = (id: string) => (layout.boxes.get(id) as Box).row;
    expect(["L2-C104", "C-104", "INV-DSL", "MAITRI.FUEL", "MAITRI"].map(row)).toEqual([0, 0, 0, 0, 0]);
    // Five columns of 200 px cards fit the 1440 px screen beside the sidebar.
    expect(layout.width).toBeLessThanOrEqual(1172);
  });

  it("rounded paths keep their end points", () => {
    expect(roundedPath([[0, 0], [10, 0], [10, 20], [30, 20]])).toMatch(/^M 0 0 .* L 30 20$/);
    expect(roundedPath([[0, 5], [40, 5]])).toBe("M 0 5 L 40 5");
  });
});
