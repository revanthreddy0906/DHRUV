import { describe, expect, it } from "vitest";
import { evaluate, legMilestones } from "@dhruv/engine";
import type { OpEvent } from "@dhruv/shared";
import { season48 } from "@dhruv/seed";
import { exceptionsOf, forViewer, rankForAttention, type OpsException } from "./exceptions";

const AT = "2027-01-24T08:10:00.000Z";
const slip: OpEvent = {
  event_id: "00000000-0000-4000-8000-000000000001", device_id: "HQ-WEB-01", seq: 1, type: "LEG_DELAYED", entity_type: "leg", entity_id: "L2-C104", node_id: "HQ",
  payload: { leg_id: "L2-C104", new_eta: "2027-02-07T00:00:00.000Z", reason: "feeder delayed" },
  observed_at: "2027-01-24T08:05:00.000Z", created_at_client: "2027-01-24T08:05:00.000Z", priority: 3, actor_role: "HQ_OPS", schema_version: 1,
};
const run = (events: OpEvent[]) => exceptionsOf({
  evaluation: evaluate({ seed: season48, events }, AT), milestones: legMilestones({ seed: season48, events }, AT),
  decisions: [], conflicts: [], incidents: [], refused: 0, now: AT,
});

describe("exception queue", () => {
  it("after the C-104 slip: Maitri fuel RED and a missed cut-off owned by HQ, each with a playbook", () => {
    const list = run([slip]);
    const fuel = list.find((e) => e.id === "dim:MAITRI:FUEL")!;
    expect(fuel).toMatchObject({ severity: "RED", owners: ["STATION_LEADER", "HQ_OPS"] });
    expect(fuel.playbook.length).toBeGreaterThan(1);
    const cutoff = list.find((e) => e.id === "ms:C-104:LOAD_CUTOFF")!;
    expect(cutoff).toMatchObject({ severity: "RED", owners: ["HQ_OPS"], link: { to: "/cargo" } });
    expect(list[0]!.severity).toBe("RED");
  });

  it("before the slip the tight cut-off is only AMBER, and station roles see their own station", () => {
    const list = run([]);
    expect(list.find((e) => e.id === "ms:C-104:LOAD_CUTOFF")?.severity).toBe("AMBER");
    const bharati = forViewer(run([slip]), "STATION_LEADER", "BHARATI");
    expect(bharati.every((e) => e.node === "BHARATI" || e.node === "HQ")).toBe(true);
    const hq = forViewer(run([slip]), "HQ_OPS", "HQ");
    expect(hq[0]!.owners).toContain("HQ_OPS");
  });
});

describe("needs attention order", () => {
  const ex = (id: string, severity: "RED" | "AMBER", deadline?: string) =>
    ({ id, severity, node: "MAITRI", owners: ["HQ_OPS"], title: id, why: "", playbook: [], link: { to: "/", label: "" }, deadline }) as OpsException;

  it("decisions, incidents and conflicts, RED, CRITICAL data, AMBER, milestones, refused, STALE", () => {
    const shuffled = [
      ex("fresh:MAITRI:POWER", "AMBER"), ex("refused", "AMBER"), ex("ms:C-104:LOAD_CUTOFF", "RED", "2027-02-04T00:00:00.000Z"),
      ex("dim:MAITRI:MEDICAL", "AMBER"), ex("fresh:MAITRI:FOOD", "RED"), ex("dim:MAITRI:FUEL", "RED", "2027-02-03T00:00:00.000Z"),
      ex("conf:CF-1", "AMBER"), ex("inc:INC-01", "RED"), ex("dec:DEC-01", "AMBER", "2027-02-03T00:00:00.000Z"),
    ];
    expect(rankForAttention(shuffled).map((e) => e.id)).toEqual([
      "dec:DEC-01", "conf:CF-1", "inc:INC-01", "dim:MAITRI:FUEL", "fresh:MAITRI:FOOD", "dim:MAITRI:MEDICAL",
      "ms:C-104:LOAD_CUTOFF", "refused", "fresh:MAITRI:POWER",
    ]);
  });

  it("ties go by earliest deadline, undated last", () => {
    const list = rankForAttention([ex("ms:C-112:ON_STATION", "AMBER", "2027-02-28T00:00:00.000Z"), ex("ms:X:Y", "AMBER"), ex("ms:C-104:LOAD_CUTOFF", "AMBER", "2027-02-04T00:00:00.000Z")]);
    expect(list.map((e) => e.id)).toEqual(["ms:C-104:LOAD_CUTOFF", "ms:C-112:ON_STATION", "ms:X:Y"]);
  });

  it("on the real slip, the decision leads and its Review decision action", () => {
    const decision = { id: "DEC-01", status: "PROPOSED", node_id: "MAITRI", pnr: "2027-02-03T00:00:00.000Z", options: [{}, {}, {}] } as never;
    const list = rankForAttention(forViewer(exceptionsOf({
      evaluation: evaluate({ seed: season48, events: [slip] }, AT), milestones: legMilestones({ seed: season48, events: [slip] }, AT),
      decisions: [decision], conflicts: [], incidents: [], refused: 0, now: AT,
    }), "HQ_OPS", "HQ"));
    expect(list[0]!.link.label).toBe("Review decision");
    expect(list[1]!.id).toBe("dim:MAITRI:FUEL");
    expect(list[1]!.why).toBe("Fuel below requirement: 92.0 of 132.0 kL. Cargo excluded by vessel cutoff.");
  });
});
