import * as React from "react";
import { EVENT_RULES, config, type EventType, type OpEvent } from "@dhruv/shared";
import { lastCheckIn } from "@dhruv/store";
import { DemoDock } from "../components/DemoDock";
import { FieldFrame, FieldView, type FieldFeedback, type FieldModel } from "../components/field";
import { ROLE_LABEL } from "../data/demo";
import type { Role } from "../data/types";
import { checkInStatus, fieldLinkLine, formatAge, formatDate, formatDateRange, formatDateTime, formatTime } from "../format";
import { nodeLabel, useLiveChrome } from "../live/chrome";
import { coords, incidentTypeLabel } from "../live/describe";
import { useDevice } from "../live/DeviceProvider";
import { nextIncidentId } from "../live/fieldIds";
import { useFactEvents } from "../live/incident";
import { useLiveOps } from "../live/ops";
import { useEventWriter, useWriteStatus } from "../live/writeStatus";
import { CHECKIN_DUE_SOON_MINUTES, FIELD_DEMO_POSITION, FIELD_DEVICES } from "../ui-config";

/** Incident types a team raises about itself; OVERDUE_CHECKIN is raised by the station about a team. */
const FIELD_INCIDENT_TYPES = ["SOS", "MEDICAL", "INJURY"];

/** A control this role may not use says why (CLAUDE.md 2.6), from EVENT_RULES. */
const notAllowed = (type: EventType, role: Role, what: string) =>
  (EVENT_RULES[type].allowedRoles as readonly string[]).includes(role) ? undefined : `${ROLE_LABEL[role]}s cannot ${what}.`;

/** Where a write stands, from the device's store: saved, waiting, sent or refused. */
function useFieldFeedback(event: OpEvent | undefined, error: string | undefined, what: string, extra = ""): FieldFeedback | undefined {
  const status = useWriteStatus(event?.event_id);
  if (error) return { kind: "error", text: `${what} not saved on this device: ${error}. Try again.` };
  if (!event || !status) return undefined;
  switch (status.kind) {
    case "rejected": return { kind: "rejected", text: `${what} refused by the server: ${status.reason}. It is not counted.` };
    case "synced": return { kind: "synced", text: `${what} sent.${extra}` };
    default: return { kind: status.kind, text: `${what} saved on this device. Waiting to send.${extra}` };
  }
}

/** Field Lead home on a signed-in field device (SPEC B). */
export function LiveFieldScreen() {
  const device = useDevice();
  const chrome = useLiveChrome();
  const ops = useLiveOps();
  const events = useFactEvents();
  const checkInWriter = useEventWriter();
  const incidentWriter = useEventWriter();
  const checkInFeedback = useFieldFeedback(checkInWriter.last?.event, checkInWriter.error, "Check-in", " Position from device (demo constant).");
  const incidentId = incidentWriter.last?.event.payload && (incidentWriter.last.event.payload as { incident_id?: string }).incident_id;
  const incidentFeedback = useFieldFeedback(incidentWriter.last?.event, incidentWriter.error, incidentId ?? "Incident");

  const snap = device?.snapshot;
  if (!device || !snap?.seed || !chrome || !events) {
    return <FieldFrame><p className="p-4 text-sm text-fg-2">Loading this device's data.</p></FieldFrame>;
  }

  const { identity } = device.session;
  const role = identity.role as Role;
  const assigned = FIELD_DEVICES[identity.device_id];
  const team = assigned?.team;
  const station = nodeLabel(identity.node_id);
  const now = snap.now;
  const last = team ? lastCheckIn(events, team) : null;

  const mission = assigned ? snap.seed.missions.find((m) => m.id === assigned.mission) : undefined;
  let needs: { people?: string[]; assets?: string[] } = {};
  try { needs = mission ? JSON.parse(mission.needs) : {}; } catch { /* no needs recorded */ }
  const impact = ops?.evaluation.stations.find((s) => s.nodeId === mission?.node_id)?.missions?.find((m) => m.missionId === mission?.id);
  const people = (needs.people ?? []).map((id) => snap.seed!.personnel.find((p) => p.id === id)?.name ?? id);

  const waiting = snap.outbox
    .filter((o) => o.status === "pending" && o.event.type === "CHECKIN_RECORDED" && o.event.entity_id === team)
    .map((o) => o.event.observed_at)
    .sort()
    // A time from another day carries its date ("24 Jan 08:11").
    .map((t) => (t.slice(0, 10) === now.slice(0, 10) ? formatTime(t) : formatDateTime(t)));

  const noTeam = team ? undefined : "No field team is set up for this device.";

  const checkIn = () => {
    if (!team) return;
    void checkInWriter.submit(
      { type: "CHECKIN_RECORDED", entity_type: "team", entity_id: team, node_id: identity.node_id, payload: { person_or_team_id: team, lat: FIELD_DEMO_POSITION.lat, lon: FIELD_DEMO_POSITION.lon } },
      `${team} check-in`,
    );
  };

  const raise = (type: string, note: string) => {
    if (!team) return;
    const known = events.filter((e) => e.type === "INCIDENT_OPENED").map((e) => (e.payload as { incident_id: string }).incident_id);
    const id = nextIncidentId(team, known);
    void incidentWriter.submit(
      {
        type: "INCIDENT_OPENED", entity_type: "incident", entity_id: id, node_id: identity.node_id,
        payload: { incident_id: id, type, person_ids: needs.people ?? [], team_id: team, last_confirmed_at: last?.observed_at ?? now, ...(note ? { note } : {}) },
      },
      `${id} ${incidentTypeLabel(type)}`,
    );
  };

  const model: FieldModel = {
    team: team ?? identity.device_id,
    station,
    clock: { date: formatDate(now), time: formatTime(now) },
    link: { status: snap.link, text: fieldLinkLine(snap.link, station, chrome.pending.count, chrome.lastSync) },
    user: { role, deviceId: identity.device_id, onSignOut: chrome.signOut },
    checkIn: {
      status: checkInStatus(last?.observed_at, now, { intervalHours: config.season.checkInIntervalHours, graceHours: config.season.checkInGraceHours, dueSoonMinutes: CHECKIN_DUE_SOON_MINUTES }),
      waiting,
      feedback: checkInFeedback,
      disabledReason: noTeam ?? notAllowed("CHECKIN_RECORDED", role, "record check-ins"),
      busy: checkInWriter.busy,
      onCheckIn: checkIn,
    },
    mission: mission && {
      id: mission.id,
      name: mission.name,
      dates: formatDateRange(mission.start_date, mission.end_date),
      vehicle: needs.assets?.[0],
      people,
      risk: impact?.status === "AT_RISK" ? { state: "AMBER", word: "At risk" } : impact?.status === "BLOCKED" ? { state: "RED", word: "Blocked" } : undefined,
    },
    position: last ? { coords: coords(last.lat, last.lon), age: formatAge(last.observed_at, now) } : undefined,
    incident: {
      types: FIELD_INCIDENT_TYPES.map((id) => ({ id, label: incidentTypeLabel(id).replace(/^\w/, (c) => c.toUpperCase()) })),
      disabledReason: noTeam ?? notAllowed("INCIDENT_OPENED", role, "raise incidents"),
      feedback: incidentFeedback,
      busy: incidentWriter.busy,
      onRaise: raise,
    },
  };

  return (
    <>
      <FieldFrame><FieldView model={model} /></FieldFrame>
      <DemoDock role={role} link={snap.link} onRoleChange={chrome.onRoleChange} onLinkChange={chrome.onLinkChange}
        onJump={chrome.onJump} onJumpTo={chrome.onJumpTo} onReset={chrome.onReset} clockJumps={chrome.clockJumps} />
    </>
  );
}
