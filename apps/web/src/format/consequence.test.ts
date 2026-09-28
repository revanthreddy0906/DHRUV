import { describe, expect, it } from "vitest";
import { consequenceLine, countPlausibility } from "./consequence";

describe("consequence preview line", () => {
  it("stays GREEN, plain", () => {
    expect(consequenceLine({
      item: "Diesel", unit: "kL", dimension: "Fuel", stock: { before: 92, after: 89.5 }, ratio: { before: 140 / 132, after: 137.5 / 132 }, state: { before: "GREEN", after: "GREEN" },
    })).toEqual({ text: "Diesel 92.0 → 89.5 kL · fuel ratio 1.061 → 1.042 · stays GREEN", tone: undefined });
  });
  it("turns AMBER in amber", () => {
    expect(consequenceLine({
      item: "Diesel", unit: "kL", dimension: "Fuel", stock: { before: 92, after: 83 }, ratio: { before: 140 / 132, after: 131 / 132 }, state: { before: "GREEN", after: "AMBER" },
    })).toEqual({ text: "Diesel 92.0 → 83.0 kL · fuel ratio 1.061 → 0.992 · turns AMBER", tone: "AMBER" });
  });
  it("an improvement is plain", () => {
    expect(consequenceLine({
      item: "Food", unit: "person-days", dimension: "Food", stock: { before: 3, after: 8900 }, ratio: { before: 0.0004, after: 1.075 }, state: { before: "RED", after: "GREEN" },
    }).tone).toBeUndefined();
  });
});

describe("count plausibility guard", () => {
  it("flags a count far from the recorded stock, in the operator's words", () => {
    expect(countPlausibility(3, 8900, 8280, "person-days")).toBe("This count is 99.97 % lower than the recorded 8,900 person-days. Record 3 person-days anyway?");
    expect(countPlausibility(200, 92, 132, "kL")).toBe("This count is 117.39 % higher than the recorded 92.0 kL. Record 200.0 kL anyway?");
  });
  it("lets a plausible count through", () => {
    expect(countPlausibility(90, 92, 132, "kL")).toBeUndefined();
    expect(countPlausibility(47, 92, 132, "kL")).toBeUndefined();
  });
  it("flags 0 for an item with a requirement", () => {
    expect(countPlausibility(0, 10, 9, "kits")).toBe("This count is 100 % lower than the recorded 10 kits. Record 0 kits anyway?");
    expect(countPlausibility(0, 0, 9, "kits")).toMatch(/^This count is 0 kits for an item with a requirement of 9 kits/);
  });
});
