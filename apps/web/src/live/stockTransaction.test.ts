import { describe, expect, it } from "vitest";
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
