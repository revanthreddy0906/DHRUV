import { classifyFreshness } from "@dhruv/engine";
import type { AttentionView, EventView, SeasonView, StationRowView, SummaryView } from "../components/command";
import type { Freshness } from "../data/types";
import { DIMENSION_LABEL, drivingDimension, drivingItem, formatAge, formatAgo, formatDate, formatHaveNeed, formatRatio, isAllClear, stationReason, statusLine, timelinePositions } from "../format";
import { networkView, type NetworkView } from "./network";
import { nodeLabel, type LiveChrome } from "./chrome";
import { rankForAttention, type OwnerRole } from "./exceptions";
import type { LiveOps } from "./ops";

/**
 * The Command Center view for this device (section 8), from the same evaluate() output every other
 * screen uses: the status line, the stations table and the all-clear come from one evaluation.
 */
export interface CommandView {
  status: string;
  allClear: boolean;
  incident?: { title: string; confirmed: string };
  rows: StationRowView[];
  attention: AttentionView[];
  season: SeasonView;
  events: EventView[];
  summary: SummaryView;
  network?: NetworkView;
}

const OWNER: Record<OwnerRole, string> = { HQ_OPS: "HQ Ops", STATION_LEADER: "Station Leader", FIELD_LEAD: "Field Lead" };
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

export function liveCommandView(ops: LiveOps, live: LiveChrome): CommandView {
  const { evaluation, now } = ops;
  const names = Object.fromEntries(evaluation.stations.map((s) => [s.nodeId, nodeLabel(s.nodeId)]));

  const rows: StationRowView[] = evaluation.stations.map((st) => {
    // Deadline: the point of no return, else the next lever deadline while fuel drives the state
    // (the catalogued levers are fuel levers; they are no answer to a food or medical shortfall).
    const nextLever = st.state === "GREEN" || drivingDimension(st)?.key !== "FUEL" ? undefined : (st.levers ?? []).map((l) => l.deadline).filter((d) => d >= now).sort()[0];
    const link = live.stations.find((s) => s.node === st.nodeId);
    // The driving dimension and its amount, only while the station is not GREEN (don't show absence).
    const d = st.state === "GREEN" ? undefined : drivingDimension(st);
    const item = d && drivingItem(d);
    return {
      nodeId: st.nodeId,
      name: names[st.nodeId]!,
      code: names[st.nodeId]!.slice(0, 3).toUpperCase(),
      critical: d && { label: DIMENSION_LABEL[d.key] ?? d.key, amount: item && item.unit !== "running" && d.key !== "PERSONNEL" && d.key !== "COMMS" ? formatHaveNeed(item.have, item.need, item.unit) : undefined },
      ratio: d?.ratio != null ? formatRatio(d.ratio) : undefined,
      state: st.state,
      reason: stationReason(st),
      deadline: st.pnr?.pnrDate ? `Point of no return ${formatDate(st.pnr.pnrDate)}` : nextLever ? `Act by ${formatDate(nextLever)}` : undefined,
      link: link && (link.own ? { text: `${sentence(link.status)} (this device)` } : { text: link.age === "just now" ? "heard just now" : `heard ${link.age} ago`, freshness: link.freshness }),
      href: `/stations/${st.nodeId}?station=${st.nodeId}`,
    };
  });

  const attention: AttentionView[] = rankForAttention(ops.exceptions).map((e) => ({
    id: e.id,
    severity: e.severity,
    title: e.title,
    owner: e.owners[0] ? OWNER[e.owners[0]] : undefined,
    deadline: e.deadline ? formatDate(e.deadline) : undefined,
    cause: e.why,
    action: e.link,
    steps: e.playbook,
  }));

  const w = ops.vesselWindow;
  // A station open all year (marion2026 closes the next March) would squash the voyage marks
  // into the first few percent, so a closing date more than 60 days past the ETA is left off.
  const showClosing = !!w && Date.parse(w.closing) - Date.parse(w.etaStation) <= 60 * 86_400_000;
  const marks = w ? timelinePositions([
    { key: "cutoff", at: w.loadCutoff }, { key: "departs", at: w.departure }, { key: "eta", at: w.etaStation },
    ...(showClosing ? [{ key: "closing" as const, at: w.closing }] : []),
  ], now) : [];
  const pct = (k: string) => marks.find((m) => m.key === k)?.pct ?? 0;
  // How old the vessel's ETA report is: its latest VESSEL_UPDATED, classed by the engine (R12, cargo ETA tier).
  const vesselId = ops.seed.vessels.find((v) => v.name === w?.name)?.id;
  const report = vesselId ? ops.events.filter((e) => e.type === "VESSEL_UPDATED" && e.entity_id === vesselId).map((e) => e.observed_at).sort().at(-1) : undefined;
  const etaAge = report ? { age: formatAge(report, now), freshness: classifyFreshness(vesselId!, "cargoEta", report, now).freshness as Freshness } : undefined;

  return {
    // An open incident is the first thing wrong, whatever the stations' readiness says.
    status: `${ops.incident ? `${ops.incident.title} is open. ` : ""}${statusLine({ stations: evaluation.stations, names, decisionDeadlines: ops.openDecisions.map((d) => d.pnr ?? undefined), nextCutoff: w?.loadCutoff, now })}`,
    allClear: isAllClear(evaluation.stations, ops.openDecisions.length),
    incident: ops.incident && { title: ops.incident.title, confirmed: `Last confirmed ${formatAgo(ops.incident.lastConfirmedAt, now)}.` },
    rows,
    attention,
    season: {
      phaseLine: `${sentence(live.phase)} phase. Next resupply ${live.nextResupply}, in ${live.daysToResupply} days.`,
      vessel: w && {
        name: w.name,
        eta: formatDate(w.etaStation),
        etaReport: etaAge,
        marks: [
          { key: "cutoff", label: `Cutoff ${formatDate(w.loadCutoff)}`, pct: pct("cutoff"), strong: true },
          { key: "departs", label: `Departs ${formatDate(w.departure)}`, pct: pct("departs") },
          { key: "eta", label: `ETA ${formatDate(w.etaStation)}`, pct: pct("eta") },
          ...(showClosing ? [{ key: "closing", label: `Closing ${formatDate(w.closing)}`, pct: pct("closing") }] : []),
        ],
        nowPct: pct("now"),
      },
    },
    events: ops.timeline.slice(0, 5).map((e) => ({ id: e.deviceSeq, text: e.summary, device: e.device, age: e.age })),
    summary: {
      stations: evaluation.stations.filter((st) => st.state !== "GREEN").length,
      worst: evaluation.stations.some((st) => st.state === "RED") ? "RED" : evaluation.stations.some((st) => st.state === "AMBER") ? "AMBER" : undefined,
      incidents: ops.openIncidents.length,
      decisions: ops.openDecisions.length,
    },
    network: networkView(ops.seed, ops.events, evaluation, now),
  };
}
