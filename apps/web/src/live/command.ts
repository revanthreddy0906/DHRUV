import type { AttentionView, EventView, SeasonView, StationRowView } from "../components/command";
import { drivingDimension, formatAgo, formatDate, isAllClear, stationReason, statusLine, timelinePositions } from "../format";
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
    return {
      nodeId: st.nodeId,
      name: names[st.nodeId]!,
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
  const marks = w ? timelinePositions([
    { key: "cutoff", at: w.loadCutoff }, { key: "departs", at: w.departure }, { key: "eta", at: w.etaStation }, { key: "closing", at: w.closing },
  ], now) : [];
  const pct = (k: string) => marks.find((m) => m.key === k)?.pct ?? 0;

  return {
    status: statusLine({ stations: evaluation.stations, names, decisionDeadlines: ops.openDecisions.map((d) => d.pnr ?? undefined), nextCutoff: w?.loadCutoff, now }),
    allClear: isAllClear(evaluation.stations, ops.openDecisions.length),
    incident: ops.incident && { title: ops.incident.title, confirmed: `Last confirmed ${formatAgo(ops.incident.lastConfirmedAt, now)}.` },
    rows,
    attention,
    season: {
      phaseLine: `${sentence(live.phase)} phase. Next resupply 20 Nov 2027, in ${live.daysToResupply} days.`,
      vessel: w && {
        name: w.name,
        marks: [
          { key: "cutoff", label: `Cutoff ${formatDate(w.loadCutoff)}`, pct: pct("cutoff"), strong: true },
          { key: "departs", label: `Departs ${formatDate(w.departure)}`, pct: pct("departs") },
          { key: "eta", label: `ETA ${formatDate(w.etaStation)}`, pct: pct("eta") },
          { key: "closing", label: `Closing ${formatDate(w.closing)}`, pct: pct("closing") },
        ],
        nowPct: pct("now"),
      },
    },
    events: ops.timeline.slice(0, 5).map((e) => ({ id: e.deviceSeq, text: e.summary, device: e.device, age: e.age })),
  };
}
