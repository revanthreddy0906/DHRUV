import { describe, expect, it } from "vitest";
import { season48, IDS, DEVICES, NODES } from "@dhruv/seed";
import { evaluate } from "@dhruv/engine";
import type { OpEvent } from "@dhruv/shared";
import { adaptLiveEvaluation } from "./adapter";

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
});

