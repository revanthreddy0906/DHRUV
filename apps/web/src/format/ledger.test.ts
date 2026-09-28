import { describe, expect, it } from "vitest";
import { compareEvents, stockBalance, type OpEvent } from "@dhruv/shared";
import { season48 } from "@dhruv/seed";
import { assetHistory, entryPlace, entryPlaceText, maintainedBy, needsVarianceReason, personHistory, stockDerivation, stockLedger, variance, varianceReview } from "./ledger";

let n = 0;
const ev = (type: OpEvent["type"], device: string, role: OpEvent["actor_role"], payload: Record<string, unknown>, at: string, extra: Partial<OpEvent> = {}): OpEvent => ({
  event_id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, device_id: device, seq: n, type, entity_type: "x", entity_id: "x", node_id: "MAITRI",
  payload, observed_at: at, created_at_client: at, priority: 2, actor_role: role, schema_version: 1, ...extra,
});
const at = (day: number, hhmm: string) => `2027-01-${String(day).padStart(2, "0")}T${hhmm}:00.000Z`;
const diesel = season48.inventory_items.find((i) => i.id === "INV-DSL")!;

describe("stock ledger", () => {
  const issue = ev("STOCK_ISSUED", "MAITRI-TAB-01", "STATION_LEADER", { item_id: "INV-DSL", qty: 2.5, reason: "generator refuel" }, at(24, "09:40"));
  const receipt = ev("STOCK_RECEIVED", "MAITRI-TAB-01", "STATION_LEADER", { item_id: "INV-DSL", qty: 10, shipment_id: "C-104" }, at(24, "10:00"), { recorded_at_server: "2026-09-28T09:05:00.000Z" });
  const count = ev("STOCK_COUNTED", "MAITRI-TAB-01", "STATION_LEADER", { item_id: "INV-DSL", qty: 95, reason: " Evaporation loss " }, at(24, "11:00"));
  const other = ev("STOCK_ISSUED", "MAITRI-TAB-01", "STATION_LEADER", { item_id: "INV-FOOD", qty: 100, reason: "x" }, at(24, "09:50"));
  const sorted = [issue, receipt, count, other].sort(compareEvents);

  it("opens with the season count and carries a running balance from the stock rule", () => {
    const rows = stockLedger(sorted, diesel);
    expect(rows.map((r) => [r.entry, r.qty, r.balance])).toEqual([
      ["Opening count (season data)", "92.0 kL", 92],
      ["Issue", "−2.5 kL", 89.5],
      ["Receipt", "+10.0 kL", 99.5],
      ["Count", "95.0 kL", 95],
    ]);
    // The last row equals stockBalance() over the whole log: one rule, not a second copy.
    expect(rows.at(-1)!.balance).toBe(stockBalance(sorted, "INV-DSL", diesel.stock)!.balance);
    expect(rows[0]!.reason).toBe("station count");
    expect(rows[1]!.reason).toBe("generator refuel");
    expect(rows[2]!.reason).toBe("from shipment C-104");
  });

  it("gives each count its variance from the book balance before it, and its trimmed reason", () => {
    const c = stockLedger(sorted, diesel).at(-1)!;
    expect(c.variance?.text).toBe("−4.5 kL (−4.5 %)");
    expect(c.reason).toBe("Evaporation loss");
  });

  it("derives the balance in one line", () => {
    expect(stockDerivation([issue].sort(compareEvents), diesel)).toBe("Last count 92.0 kL on 24 Jan 04:00, minus 2.5 kL issued since.");
    expect(stockDerivation([], diesel)).toBe("Last count 92.0 kL on 24 Jan 04:00, nothing issued or received since.");
    expect(stockDerivation(sorted, diesel)).toBe("Last count 95.0 kL on 24 Jan 11:00, nothing issued or received since.");
  });

  it("lists a refused entry without counting it", () => {
    const rows = stockLedger(sorted, diesel, new Set([issue.event_id]));
    expect(rows.map((r) => [r.entry, r.balance, r.counted])).toEqual([
      ["Opening count (season data)", 92, true],
      ["Issue", 92, false],
      ["Receipt", 102, true],
      ["Count", 95, true],
    ]);
  });

  it("variance wording", () => {
    expect(variance(11, 10, "kits").text).toBe("+1 kits (+10.0 %)");
    expect(variance(10, 10, "kits").text).toBe("no change");
    expect(variance(5, 0, "kits")).toMatchObject({ fraction: null, text: "+5 kits" });
  });
});

describe("where an entry is", () => {
  const e = ev("STOCK_ISSUED", "MAITRI-TAB-01", "STATION_LEADER", { item_id: "INV-DSL", qty: 1, reason: "x" }, at(24, "09:00"));
  it("waiting, at HQ (receipt time only in the tooltip), refused", () => {
    expect(entryPlaceText(entryPlace(e, { pendingIds: new Set([e.event_id]), rejected: new Map() }))).toEqual({ text: "Waiting to send · on MAITRI-TAB-01", tone: "warn" });
    const atHq = entryPlaceText(entryPlace({ ...e, recorded_at_server: "2026-09-28T09:05:00.000Z" }, { pendingIds: new Set(), rejected: new Map() }));
    expect(atHq.text).toBe("At HQ");
    expect(atHq.tooltip).toMatch(/^Received by HQ \d{1,2} Sep \d{2}:\d{2} \(real time\)$/);
    expect(entryPlaceText(entryPlace(e, { pendingIds: new Set(), rejected: new Map([[e.event_id, "stock would go negative"]]) }))).toEqual({ text: "Refused: stock would go negative", tone: "bad" });
  });
});

describe("maintained by, from EVENT_RULES", () => {
  it("groups entry kinds with the same roles", () => {
    expect(maintainedBy(["STOCK_COUNTED", "STOCK_ISSUED", "STOCK_RECEIVED"], "Maitri")).toEqual([
      "Counts: Maitri Station Leader or HQ Ops",
      "Issues and receipts: Maitri Station Leader",
    ]);
    expect(maintainedBy(["ASSET_STATUS_SET"], "Maitri")).toEqual(["Status changes: Maitri Station Leader or HQ Ops"]);
  });
});

describe("asset and person histories", () => {
  const sk2 = season48.assets.find((a) => a.id === "SK-2")!;
  const down = ev("ASSET_STATUS_SET", "MAITRI-TAB-01", "STATION_LEADER", { asset_id: "SK-2", status: "DOWN", note: "track fault" }, at(24, "09:20"));
  const ok = ev("ASSET_STATUS_SET", "DIRECTOR", "HQ_OPS", { asset_id: "SK-2", status: "OK", note: "stale maintenance plan" }, at(24, "11:00"));
  const flag = ev("CONFLICT_FLAGGED", "SERVER", "SYSTEM", {
    conflict_id: "CF-1", entity_type: "asset", entity_id: "SK-2", field: "status",
    contenders: [{ event_id: down.event_id, device_id: "MAITRI-TAB-01", value: "DOWN" }, { event_id: ok.event_id, device_id: "DIRECTOR", value: "OK" }], conservative_value: "DOWN",
  }, at(25, "16:11"));
  const resolved = ev("CONFLICT_RESOLVED", "HQ-WEB-01", "HQ_OPS", { conflict_id: "CF-1", chosen_value: "DOWN", resolver: "HQ-WEB-01" }, at(25, "16:15"));

  it("SK-2: season status, both status entries, the flag and its resolution", () => {
    const rows = assetHistory([down, ok, flag, resolved].sort(compareEvents), sk2);
    expect(rows.map((r) => r.entry)).toEqual(["Status OK (season data)", "Status DOWN", "Status OK", "Disagreement flagged", "Disagreement resolved: DOWN"]);
    expect(rows[3]!.detail).toBe("DOWN from MAITRI-TAB-01, OK from DIRECTOR. DOWN kept until someone decides.");
  });

  it("a person: status, move and incident", () => {
    const verma = season48.personnel.find((p) => p.id === "P-VERMA")!;
    const inc = ev("INCIDENT_OPENED", "MAITRI-TAB-01", "STATION_LEADER", { incident_id: "INC-01", type: "OVERDUE_CHECKIN", person_ids: ["P-VERMA", "P-NAIR"], last_confirmed_at: at(25, "07:00") }, at(25, "16:00"));
    const rows = personHistory([inc], verma, (n) => (n === "MAITRI" ? "Maitri" : n));
    expect(rows.map((r) => r.entry)).toEqual(["Field at Maitri (season data)", "Named in incident INC-01"]);
    expect(rows[1]!.detail).toBe("Last confirmed 25 Jan 07:00");
  });
});

describe("stocktake", () => {
  it("a variance over 10 % needs a reason; 10 % exactly does not; a zero book needs one for any count", () => {
    expect(needsVarianceReason(variance(11, 10, "kits"), 0.1)).toBe(false);
    expect(needsVarianceReason(variance(8.9, 10, "kits"), 0.1)).toBe(true);
    expect(needsVarianceReason(variance(10, 10, "kits"), 0.1)).toBe(false);
    expect(needsVarianceReason(variance(2, 0, "kits"), 0.1)).toBe(true);
  });

  it("variance review lists large-variance counts, newest first, with their reasons", () => {
    const food = season48.inventory_items.find((i) => i.id === "INV-FOOD")!;
    const small = ev("STOCK_COUNTED", "MAITRI-TAB-01", "STATION_LEADER", { item_id: "INV-DSL", qty: 90 }, at(24, "12:00"));
    const big = ev("STOCK_COUNTED", "MAITRI-TAB-01", "STATION_LEADER", { item_id: "INV-FOOD", qty: 6000, reason: "Freezer failure, spoiled stock written off" }, at(24, "12:05"));
    const review = varianceReview([small, big].sort(compareEvents), [diesel, food], new Set(), 0.1);
    expect(review.map((r) => [r.item.id, r.row.reason, r.row.variance?.text])).toEqual([["INV-FOOD", "Freezer failure, spoiled stock written off", "−2,900 person-days (−32.6 %)"]]);
  });
});
