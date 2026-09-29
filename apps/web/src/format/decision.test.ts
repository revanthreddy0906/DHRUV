import { describe, expect, it } from "vitest";
import {
  actorLabel, appliedLeversSentence, compareRows, consequenceChain, costText, daysText, deadlineHeadline, decisionPhase, expectedResultText, expiredText, followUpSentence,
  leverAxis, leverEffect, leverName, markerAlign, optionName, parseVerify, rankingReason, slackText, triggerPhrase, verifyInputs, verifySentence,
  type OptionFacts,
} from "./decision";

const NOW = "2027-01-24T08:11:00.000Z";

describe("lever names", () => {
  it("maps the lever codes to plain names", () => {
    expect(leverName("AIRLIFT_PARTIAL")).toBe("Partial airlift");
    expect(leverName("CONSERVE")).toBe("Conserve diesel");
    expect(leverName("HOLD_VESSEL")).toBe("Hold vessel");
    expect(leverName("DEFER_F27")).toBe("Defer F-27");
    expect(leverName("LOAD_SHED")).toBe("Load shed");
  });
  it("names an option by its levers", () => {
    expect(optionName(["HOLD_VESSEL"])).toBe("Hold vessel");
    expect(optionName(["CONSERVE", "DEFER_F27", "HOLD_VESSEL"])).toBe("Conserve diesel, defer F-27 and hold vessel");
  });
  it("describes an engine lever effect", () => {
    expect(leverEffect({ addAvailableKl: 48, newDeparture: "2027-02-09T00:00:00.000Z" })).toBe("+48.0 kL, vessel departs 9 Feb");
    expect(leverEffect({ saveRawKl: 8 })).toBe("saves 8.0 kL");
  });
});

describe("deadlines", () => {
  it("counts days in words", () => {
    expect(daysText(10)).toBe("10 days");
    expect(daysText(1)).toBe("1 day");
    expect(daysText(0)).toBe("today");
    expect(daysText(-2)).toBe("2 days ago");
  });
  it("leads with the PNR when there is one", () => {
    expect(deadlineHeadline({ now: NOW, pnr: { date: "2027-02-03T00:00:00.000Z", daysLeft: 10 } })).toEqual({ text: "Decide by 3 Feb · 10 days", prefix: "Decide by", date: "3 Feb", after: "· 10 days" });
  });
  it("falls back to the top-ranked option's deadline when no option restores GREEN", () => {
    expect(deadlineHeadline({ now: "2027-02-26T15:00:00.000Z", pnr: null, top: { label: "(a)", deadline: "2027-03-02T00:00:00.000Z" } })).toEqual({
      lead: "No option restores GREEN on its own",
      text: "Act by 2 Mar (option (a)) · 4 days",
      prefix: "Act by",
      date: "2 Mar",
      after: "(option (a)) · 4 days",
    });
  });
});

describe("decisionPhase", () => {
  const base = { pnr: "2027-02-03T00:00:00.000Z", optionDeadlines: ["2027-02-03T00:00:00.000Z", "2027-01-31T00:00:00.000Z"] };
  it("keeps recorded outcomes", () => {
    expect(decisionPhase({ ...base, status: "APPROVED" }, NOW)).toBe("APPROVED");
    expect(decisionPhase({ ...base, status: "REJECTED" }, NOW)).toBe("REJECTED");
  });
  it("is awaiting until the PNR passes, then expired", () => {
    expect(decisionPhase({ ...base, status: "PROPOSED" }, NOW)).toBe("AWAITING");
    expect(decisionPhase({ ...base, status: "PROPOSED" }, "2027-02-03T00:00:01.000Z")).toBe("EXPIRED");
  });
  it("without a PNR, expires once every option deadline has passed", () => {
    const d = { status: "PROPOSED" as const, pnr: null, optionDeadlines: ["2027-03-02T00:00:00.000Z", "2027-03-08T00:00:00.000Z"] };
    expect(decisionPhase(d, "2027-03-05T00:00:00.000Z")).toBe("AWAITING");
    expect(decisionPhase(d, "2027-03-09T00:00:00.000Z")).toBe("EXPIRED");
    expect(expiredText(null, d.optionDeadlines)).toBe("Expired: no option was approved before the last option deadline, 8 Mar.");
    expect(expiredText(base.pnr, [])).toBe("Expired: no option was approved before the point of no return, 3 Feb.");
  });
});

describe("actorLabel", () => {
  it("shows a real device beside the role", () => {
    expect(actorLabel("HQ_OPS", "HQ-WEB-01")).toBe("HQ Ops on HQ-WEB-01");
    expect(actorLabel("STATION_LEADER", "MAITRI-TAB-01")).toBe("Station Leader on MAITRI-TAB-01");
  });
  it("shows the role alone for script and server ids, never DIRECTOR", () => {
    expect(actorLabel("HQ_OPS", "DIRECTOR")).toBe("HQ Ops");
    expect(actorLabel("HQ_OPS", "SERVER")).toBe("HQ Ops");
    expect(actorLabel("HQ_OPS")).toBe("HQ Ops");
  });
});

describe("verify inputs (R14)", () => {
  const names = { "INV-DSL": "Diesel" };
  it("names the input of each engine line", () => {
    expect(parseVerify("INV-DSL count is STALE (112h old)", names).input).toBe("the diesel count (4 d 16 h old, stale)");
    expect(parseVerify("Fuel count 36h old (band straddles AMBER)").input).toBe("the fuel count (36 h old)");
    expect(parseVerify("Inbound shipment L2-C104 has 0d slack (AGING ETA report)").input).toBe("the L2-C104 ETA report (aging, 0 d slack)");
    expect(parseVerify("Inbound shipment L2-C104 is UNCERTAIN (591h old, 2d slack)").input).toBe("the L2-C104 ETA report (24 d 15 h old, 2 d slack)");
    expect(parseVerify("Something new").input).toBe("Something new");
  });
  it("keeps one line per input", () => {
    const lines = ["Fuel count 0h old (band straddles RED)", "Inbound shipment L2-C104 is UNCERTAIN (591h old, 2d slack)", "INV-DSL count is STALE (112h old)", "Fuel count 112h old (band straddles RED)"];
    expect(verifyInputs(lines, names).map((v) => v.input)).toEqual(["the fuel count (just now)", "the L2-C104 ETA report (24 d 15 h old, 2 d slack)"]);
  });
  it("builds the checkbox sentence", () => {
    expect(verifySentence(["Fuel count 36h old (band straddles AMBER)"])).toBe("I have verified the fuel count (36 h old) with the station");
    expect(verifySentence(["Inbound shipment L2-C104 has 0d slack (AGING ETA report)", "INV-DSL count is STALE (79h old)"], names))
      .toBe("I have verified the L2-C104 ETA report (aging, 0 d slack) and the diesel count (3 d 7 h old, stale) with the station");
    expect(verifySentence([])).toBeUndefined();
  });
});

describe("compareRows", () => {
  const a: OptionFacts = {
    label: "(a)", levers: ["HOLD_VESSEL"], reachesTarget: true, ratio: 1.0606060606060606, state: "GREEN", available: 140, required: 132, unit: "kL",
    deadline: "2027-02-03T00:00:00.000Z", bindingLever: "HOLD_VESSEL", slackDays: 0, slackLeg: "L2-C104", cost: 19.5, costUnit: "lakh INR", verify: [],
    effects: { HOLD_VESSEL: "+48.0 kL, vessel departs 9 Feb" },
  };
  const b: OptionFacts = { ...a, label: "(b)", levers: ["CONSERVE", "DEFER_F27", "HOLD_VESSEL"], ratio: 1.1784511784511784, required: 118.8, deadline: "2027-02-02T00:00:00.000Z", bindingLever: "DEFER_F27", effects: {} };
  const c: OptionFacts = {
    label: "(c)", levers: ["AIRLIFT_PARTIAL", "CONSERVE", "DEFER_F27"], reachesTarget: false, ratio: 0.8754208754208753, state: "RED", available: 104, required: 118.8, unit: "kL",
    deadline: "2027-01-31T00:00:00.000Z", bindingLever: "AIRLIFT_PARTIAL", slackDays: null, cost: 48, costUnit: "lakh INR", verify: [],
  };
  const rows = compareRows([a, b, c], NOW);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));

  it("has the same rows in the same order for every option", () => {
    expect(rows.map((r) => r.label)).toEqual(["Restores GREEN?", "Fuel after", "Last date to act", "Slack", "Cost (synthetic)", "Data confidence", "What it does"]);
    expect(rows.every((r) => r.cells.length === 3)).toBe(true);
  });
  it("uses margins in real units with the ratio beside them", () => {
    expect(byKey.fuel!.cells.map((x) => x.text)).toEqual(["+8.0 kL margin", "+21.2 kL margin", "−14.8 kL short"]);
    expect(byKey.fuel!.cells[0]!.sub).toBe("ratio 1.061");
  });
  it("says when an option does not restore GREEN", () => {
    expect(byKey.restores!.cells.map((x) => x.text)).toEqual(["Restores GREEN", "Restores GREEN", "Does not restore GREEN"]);
  });
  it("marks rows that differ and leaves identical rows unmarked", () => {
    expect(byKey.fuel!.differs).toBe(true);
    expect(byKey.confidence!.differs).toBe(false);
    expect(compareRows([a, { ...a, label: "(b)" }], NOW).find((r) => r.key === "cost")!.differs).toBe(false);
  });
  it("formats deadline, slack and cost", () => {
    expect(byKey.deadline!.cells[1]).toMatchObject({ text: "2 Feb · 9 days", sub: "set by defer f-27" });
    expect(byKey.slack!.cells.map((x) => x.text)).toEqual(["0 d slack on L2-C104", "0 d slack on L2-C104", "No inbound dependency"]);
    expect(byKey.slack!.cells[0]!.tone).toBe("amber");
    expect(byKey.cost!.cells[2]!.text).toBe("48.0 lakh INR");
    expect(byKey.does!.cells[0]!.text).toBe("Hold vessel: +48.0 kL, vessel departs 9 Feb");
  });
  it("shows the straddle text and the inputs to verify", () => {
    const s = compareRows([{ ...a, straddleText: "GREEN, could be AMBER (count 36h old)", verify: ["Fuel count 36h old (band straddles AMBER)"] }], NOW)[5]!.cells[0]!;
    expect(s).toMatchObject({ text: "GREEN, could be AMBER (count 36h old)", sub: "Verify before acting: the fuel count (36 h old)", tone: "amber" });
  });
  it("falls back to the recorded gap, then the ratio, when margins are not recorded", () => {
    const rec = compareRows([{ ...c, available: undefined, required: undefined, gap: 14.8 }, { ...a, available: undefined, unit: undefined }], NOW)[1]!;
    expect(rec.cells.map((x) => x.text)).toEqual(["−14.8 kL short", "1.061"]);
  });
  it("formats costs and slack", () => {
    expect(costText(0, "comfort and ops impact")).toBe("None (comfort and ops impact)");
    expect(costText(undefined)).toBe("unknown");
    expect(slackText(2)).toBe("2 d slack");
  });
});

describe("rankingReason", () => {
  it("gives the ranking rule's reason for the top option", () => {
    expect(rankingReason("RECOMMENDED_TARGET", true)).toMatch(/^Cheapest option that restores GREEN/);
    expect(rankingReason(undefined, false)).toMatch(/no option restores GREEN on its own/);
  });
});

describe("consequenceChain", () => {
  const trace = [
    { rule: "R02", text: "[R02] L2-C104: EXCLUDED - leg ETA 2027-02-07T00:00:00.000Z is after vessel load cutoff 2027-02-04T00:00:00.000Z (window cliff)" },
    { rule: "R03", text: "[R03] INV-DSL availability vs requirement: 92.0 / 132.0 = 0.6970 -> RED" },
  ];
  it("builds the chain from the trigger and the engine's trace", () => {
    const trigger = triggerPhrase({ type: "LEG_DELAYED", payload: { leg_id: "L2-C104", new_eta: "2027-02-07T00:00:00.000Z", reason: "x" } });
    expect(consequenceChain({
      trigger, trace, fuel: { have: 92, need: 132, unit: "kL", ratio: 0.696969696969697, state: "RED" },
      station: { name: "Maitri", state: "RED" }, missions: [{ id: "F-27", status: "AT_RISK" }, { id: "F-31", status: "OK" }],
    })).toEqual(["L2-C104 delayed to 7 Feb", "Misses vessel cutoff 4 Feb", "Cargo excluded by vessel cutoff", "Fuel 92.0 of 132.0 kL = 0.697, RED", "Maitri RED", "F-27 at risk"]);
  });
  it("uses the station closing date when that is what excludes the cargo", () => {
    const closing = [{ rule: "R02", text: "[R02] L2-C104: EXCLUDED - vessel ETA 2027-04-15 is after station closing date 2027-03-15" }];
    expect(consequenceChain({ trace: closing, station: { name: "Maitri", state: "RED" }, missions: [] })).toEqual(["Arrives after station closing 15 Mar", "Cargo excluded", "Maitri RED"]);
  });
  it("phrases a vessel trigger with its name", () => {
    expect(triggerPhrase({ type: "VESSEL_UPDATED", payload: { vessel_id: "V-ICE-STAR", eta_station: "2027-04-15T00:00:00.000Z" } }, { "V-ICE-STAR": "MV Ice Star" })).toBe("MV Ice Star station ETA moves to 15 Apr");
    expect(triggerPhrase({ type: "STOCK_COUNTED", payload: {} }, {}, "fallback")).toBe("fallback");
  });
});

describe("follow-ups", () => {
  const names = { "V-ICE-STAR": "MV Ice Star" };
  it("says what each follow-up event records", () => {
    expect(followUpSentence({ type: "VESSEL_UPDATED", entity_id: "V-ICE-STAR", payload: { vessel_id: "V-ICE-STAR", departure: "2027-02-09T00:00:00.000Z", load_cutoff: "2027-02-07T00:00:00.000Z", eta_station: "2027-02-27T00:00:00.000Z" } }, names))
      .toBe("MV Ice Star departure moves to 9 Feb (load cutoff 7 Feb, station ETA 27 Feb)");
    expect(followUpSentence({ type: "LEG_UPDATED", entity_id: "L4-C104", payload: { leg_id: "L4-C104", eta: "2027-02-27T00:00:00.000Z", status: "PLANNED" } })).toBe("Leg L4-C104 ETA moves to 27 Feb");
    expect(followUpSentence({ type: "MISSION_UPDATED", entity_id: "F-27", payload: { mission_id: "F-27", fields: { status: "DEFERRED" } } })).toBe("Mission F-27 marked deferred");
  });
  it("says what engine-only levers applied", () => {
    expect(appliedLeversSentence(["AIRLIFT_PARTIAL", "CONSERVE"], { AIRLIFT_PARTIAL: "+12.0 kL", CONSERVE: "saves 8.0 kL" }))
      .toBe("Partial airlift (+12.0 kL) and conserve diesel (saves 8.0 kL) applied to the fuel calculation.");
    expect(appliedLeversSentence([])).toBeUndefined();
  });
});

describe("leverAxis", () => {
  const dates = ["2027-02-03T00:00:00.000Z", "2027-02-06T00:00:00.000Z", "2027-02-27T00:00:00.000Z", "2027-03-01T00:00:00.000Z"];
  const axis = leverAxis(NOW, dates);
  it("covers today through the latest date with padding at both ends", () => {
    expect(axis.pct(NOW)).toBeGreaterThan(0);
    expect(axis.pct("2027-03-01T00:00:00.000Z")).toBeLessThan(100);
    for (const d of dates) expect(axis.pct(d)).toBeGreaterThan(axis.pct(NOW));
  });
  it("starts at the earliest date when a deadline has already passed", () => {
    const late = leverAxis("2027-03-12T08:00:00.000Z", ["2027-03-02T00:00:00.000Z", "2027-03-10T00:00:00.000Z"]);
    expect(late.pct("2027-03-02T00:00:00.000Z")).toBeGreaterThan(0);
    expect(late.pct("2027-03-12T08:00:00.000Z")).toBeLessThan(100);
  });
  it("keeps tick labels away from the edges and handles a year boundary", () => {
    expect(axis.ticks.every((t) => t.pct >= 4 && t.pct <= 96)).toBe(true);
    const year = leverAxis("2026-12-28T00:00:00.000Z", ["2027-01-10T00:00:00.000Z"]);
    expect(year.pct("2027-01-10T00:00:00.000Z")).toBeGreaterThan(year.pct("2026-12-28T00:00:00.000Z"));
    expect(year.ticks.length).toBeGreaterThan(0);
  });
  it("runs a marker label inward near the right edge", () => {
    expect(markerAlign(20)).toBe("start");
    expect(markerAlign(80)).toBe("end");
  });
});

describe("expectedResultText", () => {
  it("shows the fuel ratio now and after the option", () => {
    expect(expectedResultText("Maitri", 0.696969696969697, 1.0606060606060606, "GREEN")).toBe("Maitri fuel 0.697 → 1.061, GREEN");
    expect(expectedResultText("Maitri", null, 0.8754, "RED")).toBe("Maitri fuel unknown → 0.875, RED");
  });
});
