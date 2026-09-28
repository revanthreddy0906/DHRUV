import { describe, expect, it } from "vitest";
import { evaluate } from "@dhruv/engine";
import { season48 } from "@dhruv/seed";
import { groupTrace, traceSentence } from "./trace";

const AT = "2027-01-24T08:10:00.000Z";

describe("trace display", () => {
  it("R03 as a sentence with the engine's own numbers and the unit", () => {
    expect(traceSentence({ rule: "R03", text: "[R03] INV-DSL availability vs requirement: 140.0 / 132.0 = 1.0606 -> GREEN" }, { "INV-DSL": "kL" }))
      .toBe("Availability vs requirement: 140.0 of 132.0 kL = 1.0606, GREEN");
  });

  it("R19 food requirement from POB", () => {
    expect(traceSentence({ rule: "R19", text: "[R19] Food requirement (POB): Food requirement: POB 24 x 1.00/person/d x 300d = 7200.00; with 15% reserve = 8280.00; stock 3.00 → ratio 0.0004 → RED" }, { "INV-FOOD": "person-days" }))
      .toBe("Food requirement from people on station: POB 24, stock 3.00 of 8280.00 person-days = 0.0004, RED");
  });

  it("other rules keep their outcome", () => {
    expect(traceSentence({ rule: "R01", text: "[R01] INV-DSL requirement: CLOSING: 36.0d x 0.55 = 19.80; with 10% reserve = 132.00" }, { "INV-DSL": "kL" }))
      .toBe("Requirement: 132.00 kL");
    expect(traceSentence({ rule: "R12", text: "[R12] Freshness: INV-DSL (stock): observed 2027-01-24T04:00:00.000Z, age 4.0h -> FRESH (u=1%)" }))
      .toBe("Freshness: FRESH (u=1%)");
  });

  it("groups keep the engine's order and leave B0 for the footer", () => {
    const fuel = evaluate({ seed: season48, events: [] }, AT).stations.find((s) => s.nodeId === "MAITRI")!.dimensions.find((d) => d.key === "FUEL")!;
    const groups = groupTrace(fuel.trace);
    expect(groups.map((g) => g.group)).toEqual(["Inputs", "Calculation", "Result"].filter((g) => groups.some((x) => x.group === g)));
    const flat = groups.flatMap((g) => g.steps);
    expect(flat.some((s) => s.rule === "R18")).toBe(false);
    expect(flat.length).toBe(fuel.trace.filter((s) => s.rule !== "R18").length);
    for (const g of groups) {
      const idx = g.steps.map((s) => fuel.trace.indexOf(s));
      expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    }
  });
});
