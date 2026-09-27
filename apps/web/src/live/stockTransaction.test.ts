import { describe, expect, it } from "vitest";
import { IDS, season48 } from "@dhruv/seed";
import { previewConsequence } from "./useConsequencePreview";
import { stockActionsFor, validateStock } from "./StockTransactionForm";

describe("stock transaction form contract", () => {
  it("offers each role only the stock actions EVENT_RULES allows", () => {
    expect(stockActionsFor("STATION_LEADER").map((a) => a.type)).toEqual(["STOCK_ISSUED", "STOCK_RECEIVED", "STOCK_COUNTED"]);
    expect(stockActionsFor("HQ_OPS").map((a) => a.type)).toEqual(["STOCK_COUNTED"]);
    expect(stockActionsFor("FIELD_LEAD")).toEqual([]);
  });

  it("blocks an issue without a positive quantity or a reason", () => {
    expect(validateStock("STOCK_ISSUED", "0", "refuel").qty).toBeDefined();
    expect(validateStock("STOCK_ISSUED", "-2", "refuel").qty).toBeDefined();
    expect(validateStock("STOCK_ISSUED", "3", " ").reason).toBeDefined();
    expect(validateStock("STOCK_ISSUED", "3.5", "generator refuel")).toEqual({});
  });

  it("allows a zero count, rejects non-numbers and negatives", () => {
    expect(validateStock("STOCK_COUNTED", "0", "")).toEqual({});
    expect(validateStock("STOCK_COUNTED", "", "").qty).toBeDefined();
    expect(validateStock("STOCK_COUNTED", "abc", "").qty).toBeDefined();
    expect(validateStock("STOCK_RECEIVED", "-1", "").qty).toBeDefined();
    expect(validateStock("STOCK_RECEIVED", "12", "")).toEqual({});
  });
});

describe("consequence preview (engine with the draft as an overlay)", () => {
  const ctx = { seed: season48, events: [], now: "2027-01-24T08:00:00.000Z" };
  it("issuing 1 kL diesel keeps Maitri fuel GREEN", () => {
    expect(previewConsequence({ type: "STOCK_ISSUED", itemId: IDS.dieselMaitri, node: "MAITRI", qty: 1, role: "STATION_LEADER" }, ctx))
      .toEqual({ text: "Diesel 92.0 → 91.0 kL · fuel ratio 1.061 → 1.053 · stays GREEN", tone: undefined });
  });
  it("issuing 2.5 kL takes the ratio below 1.05: the engine says AMBER", () => {
    expect(previewConsequence({ type: "STOCK_ISSUED", itemId: IDS.dieselMaitri, node: "MAITRI", qty: 2.5, role: "STATION_LEADER" }, ctx))
      .toEqual({ text: "Diesel 92.0 → 89.5 kL · fuel ratio 1.061 → 1.042 · turns AMBER", tone: "AMBER" });
  });
  it("issuing 10 kL turns it AMBER", () => {
    const line = previewConsequence({ type: "STOCK_ISSUED", itemId: IDS.dieselMaitri, node: "MAITRI", qty: 10, role: "STATION_LEADER" }, ctx);
    expect(line?.text).toMatch(/^Diesel 92\.0 → 82\.0 kL · fuel ratio 1\.061 → 0\.98\d · turns AMBER$/);
    expect(line?.tone).toBe("AMBER");
  });
  it("a count of 3 person-days food turns it RED", () => {
    expect(previewConsequence({ type: "STOCK_COUNTED", itemId: IDS.foodMaitri, node: "MAITRI", qty: 3, role: "STATION_LEADER" }, ctx))
      .toEqual({ text: "Food 8,900 → 3 person-days · food ratio 1.075 → 0.000 · turns RED", tone: "RED" });
  });
});
