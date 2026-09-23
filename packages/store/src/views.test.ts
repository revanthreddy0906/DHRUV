import { describe, expect, it } from "vitest";
import { EVENT_RULES, type EventType, type OpEvent } from "@dhruv/shared";
import { conflictsView, decisionsView, incidentsView, lastCheckIn, timeline } from "./views.js";

let n = 0;
function ev(type: EventType, device_id: string, payload: Record<string, unknown>, observed_at: string, node_id = "MAITRI"): OpEvent {
  n += 1;
  return {
    event_id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    device_id,
    seq: n,
    type,
    entity_type: "x",
    entity_id: "x",
    node_id,
    payload,
    observed_at,
    created_at_client: observed_at,
    priority: EVENT_RULES[type].defaultPriority,
    actor_role: "SYSTEM",
    schema_version: 1,
  };
}

const t = (day: number, hhmm: string) => `2027-01-${String(day).padStart(2, "0")}T${hhmm}:00.000Z`;
const proposal = (id: string, at: string, deadlines: string[]) =>
  ev("DECISION_PROPOSED", "DIRECTOR", { decision_id: id, trigger_event_id: "", options: deadlines.map((d, i) => ({ id: `OPT-${i + 1}`, levers: ["HOLD_VESSEL"], deadline: d })), trace: [] }, at);

describe("decisionsView", () => {
  it("is PROPOSED with the latest option deadline as PNR, then takes the first outcome", () => {
    const events = [
      proposal("DEC-01", t(24, "08:11"), ["2027-02-02T00:00:00.000Z", "2027-02-03T00:00:00.000Z"]),
      proposal("DEC-01", t(24, "09:00"), ["2027-03-01T00:00:00.000Z"]),
    ];
    const [open] = decisionsView(events);
    expect(open).toMatchObject({ id: "DEC-01", status: "PROPOSED", pnr: "2027-02-03T00:00:00.000Z", proposed_at: t(24, "08:11") });

    events.push(ev("DECISION_APPROVED", "HQ-WEB-01", { decision_id: "DEC-01", chosen_option_id: "OPT-1", approver: "HQ-WEB-01", verify_ack: true }, t(25, "16:20")));
    events.push(ev("DECISION_REJECTED", "HQ-WEB-01", { decision_id: "DEC-01", reason: "late" }, t(25, "16:30")));
    expect(decisionsView(events)[0]).toMatchObject({ status: "APPROVED", chosen_option_id: "OPT-1", decided_by: "HQ-WEB-01" });
  });
});

describe("conflictsView", () => {
  it("opens on CONFLICT_FLAGGED and closes on CONFLICT_RESOLVED", () => {
    const flag = ev("CONFLICT_FLAGGED", "SERVER", { conflict_id: "CF-1", entity_type: "asset", entity_id: "SK-2", field: "status", contenders: [], conservative_value: "DOWN" }, t(24, "11:00"));
    expect(conflictsView([flag])[0]).toMatchObject({ id: "CF-1", status: "OPEN", conservative_value: "DOWN", node_id: "MAITRI" });
    const resolved = ev("CONFLICT_RESOLVED", "HQ-WEB-01", { conflict_id: "CF-1", chosen_value: "DOWN", resolver: "HQ-WEB-01" }, t(25, "16:15"));
    expect(conflictsView([resolved, flag])[0]).toMatchObject({ status: "RESOLVED", resolved_value: "DOWN" });
  });
});

describe("incidentsView and lastCheckIn", () => {
  it("keeps an incident open until a closed status, and finds the team's last position", () => {
    const events = [
      ev("CHECKIN_RECORDED", "FT3-TAB-01", { person_or_team_id: "FT-3", lat: -70.7, lon: 11.9 }, t(25, "03:00")),
      ev("CHECKIN_RECORDED", "FT3-TAB-01", { person_or_team_id: "FT-3", lat: -70.62, lon: 12.1 }, t(25, "07:00")),
      ev("INCIDENT_OPENED", "MAITRI-TAB-01", { incident_id: "INC-01", type: "OVERDUE_CHECKIN", person_ids: ["P-VERMA", "P-NAIR"], team_id: "FT-3", last_confirmed_at: t(25, "07:00") }, t(25, "16:00")),
    ];
    expect(incidentsView(events)[0]).toMatchObject({ id: "INC-01", open: true, team_id: "FT-3", opened_by: "MAITRI-TAB-01" });
    expect(lastCheckIn(events, "FT-3")).toMatchObject({ lat: -70.62, lon: 12.1, observed_at: t(25, "07:00") });

    events.push(ev("INCIDENT_UPDATED", "MAITRI-TAB-01", { incident_id: "INC-01", status: "RESOLVED" }, t(25, "18:00")));
    expect(incidentsView(events)[0]).toMatchObject({ open: false, status: "RESOLVED" });
    expect(lastCheckIn(events, "FT-9")).toBeNull();
  });
});

describe("timeline", () => {
  it("is newest first in reduce order, without clock jumps, capped", () => {
    const events = [
      ev("LEG_DELAYED", "DIRECTOR", { leg_id: "L2-C104", new_eta: t(30, "00:00"), reason: "x" }, t(24, "08:10")),
      ev("CLOCK_ADVANCED", "HQ-WEB-01", { now: t(25, "16:00") }, t(25, "16:00")),
      ev("LINK_STATE_SET", "MAITRI-TAB-01", { node_id: "MAITRI", status: "OFFLINE" }, t(24, "09:00")),
    ];
    expect(timeline(events).map((e) => e.type)).toEqual(["LINK_STATE_SET", "LEG_DELAYED"]);
    expect(timeline(events, 1)).toHaveLength(1);
  });
});
