import { describe, expect, it } from "vitest";
import { season48, IDS, DEVICES, NODES } from "@dhruv/seed";
import { evaluate } from "@dhruv/engine";
import type { OpEvent } from "@dhruv/shared";
import { adaptLiveEvaluation, inventoryRows, readable, roleRows } from "./adapter";

describe("Maitri Season 48 Hero Demo Vertical Slice", () => {
  const at = "2027-01-24T08:10:00.000Z";

  it("1. Normal state: Maitri is GREEN with Fuel ratio ~1.0606", () => {
    const eval0 = evaluate({ seed: season48, events: [] }, "2027-01-24T08:00:00.000Z");
    const live0 = adaptLiveEvaluation(eval0, season48, "2027-01-24T08:00:00.000Z");

    expect(live0.maitriStation.state).toBe("GREEN");
    const fuel = live0.maitriStation.dimensions.find((d) => d.key === "FUEL");
    expect(fuel).toBeDefined();
    expect(fuel?.state).toBe("GREEN");
    expect(fuel?.ratio).toBeCloseTo(1.0606, 3);
  });

  it("2. Trigger event: LEG_DELAYED for C-104 feeder leg drops Fuel to RED (0.6970), displays PNR and options", () => {
    const legDelayed: OpEvent = {
      event_id: "e-trigger-01",
      device_id: DEVICES.DIRECTOR,
      seq: 1,
      type: "LEG_DELAYED",
      entity_type: "leg",
      entity_id: IDS.legC104Feeder,
      node_id: NODES.HQ,
      payload: { leg_id: IDS.legC104Feeder, new_eta: "2027-02-07T00:00:00.000Z", reason: "port congestion" },
      observed_at: at,
      created_at_client: at,
      priority: 3,
      actor_role: "HQ_OPS",
      schema_version: 1,
    };

    const eval1 = evaluate({ seed: season48, events: [legDelayed] }, at);
    const live1 = adaptLiveEvaluation(eval1, season48, at);

    // Maitri Station and Fuel drop to RED
    expect(live1.maitriStation.state).toBe("RED");
    const fuel = live1.maitriStation.dimensions.find((d) => d.key === "FUEL");
    expect(fuel).toBeDefined();
    expect(fuel?.state).toBe("RED");
    expect(fuel?.ratio).toBeCloseTo(0.6970, 3);

    // PNR shown: 3 Feb, 10 days remaining
    expect(live1.pnr).toBeDefined();
    expect(live1.pnr?.date).toBe("3 Feb");
    expect(live1.pnr?.daysLeft).toBe(10);

    // Ranked options generated:
    expect(live1.options).toHaveLength(3);

    // Option (a): HOLD_VESSEL
    const optA = live1.options.find((o) => o.id === "a");
    expect(optA).toBeDefined();
    expect(optA?.levers).toContain("HOLD_VESSEL");
    expect(optA?.resultingRatio).toBeCloseTo(1.0606, 3);
    expect(optA?.resultingState).toBe("GREEN");
    expect(optA?.deadline).toBe("3 Feb");
    expect(optA?.cost).toContain("19.5 lakh");
    expect(optA?.slack).toBe("0 d on C-104");
    expect(optA?.reachesTarget).toBe(true);

    // Option (b): CONSERVE + DEFER_F27 + HOLD_VESSEL
    const optB = live1.options.find((o) => o.id === "b");
    expect(optB).toBeDefined();
    expect(optB?.resultingRatio).toBeCloseTo(1.1785, 3);
    expect(optB?.resultingState).toBe("GREEN");
    expect(optB?.deadline).toBe("2 Feb");

    // Option (c): AIRLIFT_PARTIAL + CONSERVE + DEFER_F27
    const optC = live1.options.find((o) => o.id === "c");
    expect(optC).toBeDefined();
    expect(optC?.resultingRatio).toBeCloseTo(0.8754, 3);
    expect(optC?.resultingState).toBe("RED");
    expect(optC?.deadline).toBe("31 Jan");
    expect(optC?.reachesTarget).toBe(false);

    // Reasoning trace contains real engine rules
    expect(live1.traceSteps.length).toBeGreaterThan(5);
    const rules = live1.traceSteps.map((t) => t.rule);
    expect(rules).toContain("R01");
    expect(rules).toContain("R02");
    expect(rules).toContain("R03");
    expect(rules).toContain("R08");
    expect(rules).toContain("R09");
    expect(rules).toContain("R10");
    expect(rules).toContain("R11");
  });

  it("3. Human decision: approving HOLD_VESSEL commits follow-ups and returns Maitri to GREEN (1.0606)", () => {
    const legDelayed: OpEvent = {
      event_id: "e-trigger-01",
      device_id: DEVICES.DIRECTOR,
      seq: 1,
      type: "LEG_DELAYED",
      entity_type: "leg",
      entity_id: IDS.legC104Feeder,
      node_id: NODES.HQ,
      payload: { leg_id: IDS.legC104Feeder, new_eta: "2027-02-07T00:00:00.000Z", reason: "port congestion" },
      observed_at: at,
      created_at_client: at,
      priority: 3,
      actor_role: "HQ_OPS",
      schema_version: 1,
    };

    const vesselUpdated: OpEvent = {
      event_id: "e-followup-01",
      device_id: DEVICES.DIRECTOR,
      seq: 2,
      type: "VESSEL_UPDATED",
      entity_type: "vessel",
      entity_id: IDS.vessel,
      node_id: NODES.HQ,
      payload: {
        vessel_id: IDS.vessel,
        departure: "2027-02-09T00:00:00.000Z",
        load_cutoff: "2027-02-07T00:00:00.000Z",
      },
      observed_at: "2027-01-24T08:20:00.000Z",
      created_at_client: "2027-01-24T08:20:00.000Z",
      priority: 3,
      actor_role: "HQ_OPS",
      schema_version: 1,
    };

    const legUpdated: OpEvent = {
      event_id: "e-followup-02",
      device_id: DEVICES.DIRECTOR,
      seq: 3,
      type: "LEG_UPDATED",
      entity_type: "leg",
      entity_id: IDS.legC104Vessel,
      node_id: NODES.HQ,
      payload: {
        leg_id: IDS.legC104Vessel,
        eta: "2027-02-27T00:00:00.000Z",
      },
      observed_at: "2027-01-24T08:20:00.000Z",
      created_at_client: "2027-01-24T08:20:00.000Z",
      priority: 3,
      actor_role: "HQ_OPS",
      schema_version: 1,
    };

    const eval2 = evaluate(
      { seed: season48, events: [legDelayed, vesselUpdated, legUpdated] },
      "2027-01-24T08:20:00.000Z",
    );
    const live2 = adaptLiveEvaluation(eval2, season48, "2027-01-24T08:20:00.000Z");

    // Maitri Station and Fuel return to GREEN
    expect(live2.maitriStation.state).toBe("GREEN");
    const fuel = live2.maitriStation.dimensions.find((d) => d.key === "FUEL");
    expect(fuel).toBeDefined();
    expect(fuel?.state).toBe("GREEN");
    expect(fuel?.ratio).toBeCloseTo(1.0606, 3);
  });

  it("4. Cargo screen Edit ETA interaction: writing LEG_DELAYED transitions Cargo to EXCLUDED (-3 d) and Command Center to RED (0.6970) with PNR 3 Feb and HOLD_VESSEL; clearing returns to GREEN", () => {
    // A. Clean start (0:00): zero events
    const cleanEvents: OpEvent[] = [];
    const evalStart = evaluate({ seed: season48, events: cleanEvents }, "2027-01-24T08:00:00.000Z");
    const liveStart = adaptLiveEvaluation(evalStart, season48, "2027-01-24T08:00:00.000Z");
    expect(liveStart.maitriStation.state).toBe("GREEN");
    expect(liveStart.maitriStation.dimensions.find((d) => d.key === "FUEL")?.ratio).toBeCloseTo(1.0606, 3);
    expect(liveStart.pnr).toBeUndefined();

    // B. Cargo Edit ETA action (0:20): record LEG_DELAYED for L2-C104 with new_eta: 2027-02-07
    const legDelayed: OpEvent = {
      event_id: "e-cargo-edit-01",
      device_id: DEVICES.HQ_WEB,
      seq: 1,
      type: "LEG_DELAYED",
      entity_type: "leg",
      entity_id: IDS.legC104Feeder,
      node_id: NODES.HQ,
      payload: { leg_id: IDS.legC104Feeder, new_eta: "2027-02-07T00:00:00.000Z", reason: "feeder vessel delayed" },
      observed_at: "2027-01-24T08:10:00.000Z",
      created_at_client: "2027-01-24T08:10:00.000Z",
      priority: 3,
      actor_role: "HQ_OPS",
      schema_version: 1,
    };

    // C. Re-evaluation with updated event log (0:30)
    const evalSlip = evaluate({ seed: season48, events: [legDelayed] }, "2027-01-24T08:10:00.000Z");
    const liveSlip = adaptLiveEvaluation(evalSlip, season48, "2027-01-24T08:10:00.000Z");

    // Command Center reflects RED 0.6970, PNR 3 Feb, HOLD_VESSEL option
    expect(liveSlip.maitriStation.state).toBe("RED");
    const fuelSlip = liveSlip.maitriStation.dimensions.find((d) => d.key === "FUEL");
    expect(fuelSlip?.state).toBe("RED");
    expect(fuelSlip?.ratio).toBeCloseTo(0.6970, 3);
    expect(liveSlip.pnr?.date).toBe("3 Feb");
    expect(liveSlip.pnr?.daysLeft).toBe(10);

    const holdVesselOption = liveSlip.options.find((o) => o.levers.includes("HOLD_VESSEL"));
    expect(holdVesselOption).toBeDefined();
    expect(holdVesselOption?.resultingState).toBe("GREEN");
    expect(holdVesselOption?.resultingRatio).toBeCloseTo(1.0606, 3);

    // D. Resetting / clearing events returns state to clean GREEN 1.0606
    const evalReset = evaluate({ seed: season48, events: [] }, "2027-01-24T08:00:00.000Z");
    const liveReset = adaptLiveEvaluation(evalReset, season48, "2027-01-24T08:00:00.000Z");
    expect(liveReset.maitriStation.state).toBe("GREEN");
    expect(liveReset.maitriStation.dimensions.find((d) => d.key === "FUEL")?.ratio).toBeCloseTo(1.0606, 3);
    expect(liveReset.pnr).toBeUndefined();
  });
});


describe("recorded proposal options (I3)", () => {
  it("renders a recorded option with its proposal-time ratio and the live band and verify flags on top", async () => {
    const { adaptRecordedOption } = await import("./adapter");
    const recorded = {
      id: "OPT-1", label: "(a)", levers: ["HOLD_VESSEL"], deadline: "2027-02-03T00:00:00.000Z", requiresVerify: [],
      ratio: 1.0606060606, state: "GREEN" as const, gap: 0, reachesTarget: true, bindingLever: "HOLD_VESSEL", slackDays: 0, cost: 19.5, costUnit: "lakh INR",
    };
    const live = { id: "a" as const, levers: ["HOLD_VESSEL" as const], resultingRatio: 1.0606, resultingState: "GREEN" as const, deadline: "3 Feb", slack: "0 d on C-104", cost: "19.5 lakh",
      band: { low: 1.0334, high: 1.0815, straddles: true, lowState: "AMBER" as const }, straddleText: "GREEN, could be AMBER", requiresVerify: ["Fuel count 36 h old"], reachesTarget: true };

    const o = adaptRecordedOption(recorded, 0, live);
    expect(o).toMatchObject({ id: "a", resultingRatio: 1.0606, deadline: "3 Feb", slack: "0 d on C-104", cost: "19.5 lakh", straddleText: "GREEN, could be AMBER", reachesTarget: true });
    expect(o.band?.low).toBe(1.0334);
    expect(o.requiresVerify).toEqual(["Fuel count 36 h old"]);

    const c = adaptRecordedOption({ ...recorded, id: "OPT-3", label: "(c)", levers: ["AIRLIFT_PARTIAL"], ratio: 0.8754, state: "RED", gap: 14.8, reachesTarget: false, slackDays: null, cost: 48 }, 2, undefined);
    expect(c).toMatchObject({ id: "c", resultingState: "RED", residualGap: 14.8, slack: "no inbound dependency", reachesTarget: false });
    expect(c.band).toBeUndefined();
  });
});

describe("I4: screens read the engine, not fixtures", () => {
  const at = "2027-01-24T08:00:00.000Z";
  const evaluation = evaluate({ seed: season48, events: [] }, at);
  const live = adaptLiveEvaluation(evaluation, season48, at);

  it("Bharati's card is the engine's evaluation, with every dimension", () => {
    const bharati = live.stations.find((s) => s.nodeId === "BHARATI")!;
    expect(bharati.dimensions.map((d) => d.key)).toEqual(["FUEL", "FOOD", "MEDICAL", "SPARES_POWER", "PERSONNEL", "COMMS"]);
    expect(bharati.dimensions.find((d) => d.key === "FUEL")?.ratio).toBeCloseTo(1.1364, 4);
    expect(bharati.slip).toMatchObject({ kind: "tolerance", days: 40 });
    expect(bharati.footnote).toBeUndefined();
  });

  it("Maitri medical is min(kits, oxygen) = 1.1111 and missions come from R07", () => {
    expect(live.maitriStation.dimensions.find((d) => d.key === "MEDICAL")?.ratio).toBeCloseTo(1.1111, 4);
    expect(live.maitriStation.missions.map((m) => `${m.id} ${m.status}`)).toEqual(["F-27 OK", "F-31 OK"]);
  });

  it("inventory rows and role coverage come from the engine's per-item lines", () => {
    const maitri = evaluation.stations.find((s) => s.nodeId === "MAITRI");
    const rows = inventoryRows(maitri, season48, at);
    expect(rows.find((r) => r.id === IDS.dieselMaitri)).toMatchObject({ stock: "92.0", requirement: "132.0", ratio: 1.0606 });
    expect(roleRows(maitri, season48).find((r) => r.role === "Doctor")).toMatchObject({ have: 2, need: 1, state: "GREEN" });
  });
});

describe("engine text for people", () => {
  it("drops nested rule prefixes and shows dates as days", () => {
    expect(readable("[R13] Option X: [R13] band [1.0, 1.1]")).toBe("Option X: band [1.0, 1.1]");
    expect(readable("leg ETA 2027-02-07T00:00:00.000Z after 2027-02-04")).toBe("leg ETA 7 Feb after 4 Feb");
    expect(readable("observed 2027-01-24T04:00:00.000Z")).toBe("observed 24 Jan 04:00");
  });
});
