import { describe, expect, it } from "vitest";
import { evaluate } from "@dhruv/engine";
import { DEVICES, IDS, NODES, season48 } from "@dhruv/seed";
import type { OpEvent } from "@dhruv/shared";
import { networkView } from "./network";

const at = "2027-01-24T08:10:00.000Z";
const ev = (seq: number, type: string, entity_id: string, payload: Record<string, unknown>, observed_at = at): OpEvent => ({
  event_id: `n-${seq}`, device_id: DEVICES.DIRECTOR, seq, type, entity_type: type.startsWith("LEG") ? "leg" : "team", entity_id, node_id: NODES.HQ,
  payload, observed_at, created_at_client: observed_at, priority: 3, actor_role: "HQ_OPS", schema_version: 1,
} as OpEvent);

describe("networkView (Command network position)", () => {
  it("draws HQ, the ports and both stations, all quiet at the start", () => {
    const now = "2027-01-24T08:00:00.000Z";
    const v = networkView(season48, [], evaluate({ seed: season48, events: [] }, now), now);
    expect(v.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(["HQ", "MUMBAI", "CAPE_TOWN", "MAITRI", "BHARATI"]));
    const maitri = v.nodes.find((n) => n.id === "MAITRI")!;
    expect(maitri.state).toBe("GREEN");
    expect(maitri.sub).toMatch(/^GREEN · \d\.\d{3}$/);
    expect(maitri.href).toBe("/stations/MAITRI?station=MAITRI");
    expect(v.links.filter((l) => l.kind === "supply").every((l) => l.state === undefined)).toBe(true);
  });

  it("colours the delayed leg with the station's RED after the slip", () => {
    const events = [ev(1, "LEG_DELAYED", IDS.legC104Feeder, { leg_id: IDS.legC104Feeder, new_eta: "2027-02-07T00:00:00.000Z", reason: "port congestion" })];
    const v = networkView(season48, events, evaluate({ seed: season48, events }, at), at);
    expect(v.nodes.find((n) => n.id === "MAITRI")!.sub).toBe("RED · 0.697");
    const delayed = v.links.filter((l) => l.state === "RED");
    expect(delayed).toHaveLength(1);
    expect(delayed[0]!.title).toMatch(/delayed$/);
  });

  it("places FT-3 beside Maitri with its check-in status", () => {
    const events = [ev(1, "CHECKIN_RECORDED", "FT-3", { person_or_team_id: "FT-3", lat: -70.62, lon: 12.1 }, "2027-01-24T05:00:00.000Z")];
    const v = networkView(season48, events, evaluate({ seed: season48, events }, at), at);
    const team = v.nodes.find((n) => n.id === "FT-3")!;
    expect(team.kind).toBe("team");
    expect(team.sub).toBe("Checked in 3 h 10 m ago");
    expect(v.links.find((l) => l.from === "FT-3")?.to).toBe("MAITRI");
  });
});
