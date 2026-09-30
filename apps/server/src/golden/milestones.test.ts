import { describe, expect, it } from "vitest";
import { legMilestones } from "@dhruv/engine";
import type { OpEvent } from "@dhruv/shared";
import { season48 } from "@dhruv/seed";

const AT = "2027-01-24T08:10:00.000Z";
const slip: OpEvent = {
  event_id: "00000000-0000-4000-8000-000000000001", device_id: "HQ-WEB-01", seq: 1, type: "LEG_DELAYED", entity_type: "leg", entity_id: "L2-C104", node_id: "HQ",
  payload: { leg_id: "L2-C104", new_eta: "2027-02-07T00:00:00.000Z", reason: "feeder delayed" },
  observed_at: "2027-01-24T08:05:00.000Z", created_at_client: "2027-01-24T08:05:00.000Z", priority: 3, actor_role: "HQ_OPS", schema_version: 1,
};
const c104 = (events: OpEvent[]) => legMilestones({ seed: season48, events }, AT).find((s) => s.shipmentId === "C-104")!;

describe("back-scheduled cargo milestones", () => {
  it("works back from the station closing date: cut-off 4 Feb, 2 d slack, on station 24 Feb", () => {
    const m = c104([]);
    expect(m.milestones.map((x) => x.key)).toEqual(["LEAVE_ORIGIN", "LOAD_CUTOFF", "VESSEL_DEPARTS", "ON_STATION"]);
    const cutoff = m.milestones.find((x) => x.key === "LOAD_CUTOFF")!;
    expect(cutoff).toMatchObject({ latest: "2027-02-04T00:00:00.000Z", planned: "2027-02-02T00:00:00.000Z", state: "AT_RISK" });
    expect(m.milestones.find((x) => x.key === "LEAVE_ORIGIN")!.state).toBe("DONE");
    expect(m.milestones.find((x) => x.key === "ON_STATION")!.state).toBe("ON_TRACK");
  });

  it("marks the cut-off missed after the C-104 slip, with the new ETA as 'now'", () => {
    const cutoff = c104([slip]).milestones.find((x) => x.key === "LOAD_CUTOFF")!;
    expect(cutoff).toMatchObject({ state: "MISSED", current: "2027-02-07T00:00:00.000Z" });
    expect(c104([slip]).worst).toBe("MISSED");
  });
});
