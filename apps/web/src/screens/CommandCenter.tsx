import * as React from "react";
import { MOMENTS, TIMELINES, HERO_TRACE, FRESHNESS_TRACE_HQ_2501600, START_TRACE, APPROVED_TRACE, CALENDAR, type MomentId } from "../data/demo";
import { Frame } from "./Frame";
import { DecisionCallout, IncidentStrip, NeedsAttention, RecentEvents, SeasonPanel, StationsTable, StatusLine, SummaryCounts, type AttentionView, type DecisionCalloutView } from "../components/command";
import { NetworkSchematic } from "../components/network";
import { evaluate } from "@dhruv/engine";
import { DIRECTOR_BEATS, season48 } from "@dhruv/seed";
import { decisionsView } from "@dhruv/store";
import { replayBeats } from "../live/beatReplay";
import { buildDecisionScreen } from "../live/decisionView";
import { networkView } from "../live/network";
import { TraceDrawer, traceText } from "../components/trace";
import { WhatIfDrawer } from "../components/whatif";
import { Card, PageHeader, cx } from "../components/primitives";
import { useDevice } from "../live/DeviceProvider";
import { useLiveChrome } from "../live/chrome";
import { liveCommandView, type CommandView } from "../live/command";
import { parseEtaInput } from "../live/format";
import { useLiveOps } from "../live/ops";
import { LiveWhatIfDrawer } from "../live/WhatIfLive";
import { drivingDimension, timelinePositions } from "../format";
import { nodeLabel } from "../live/chrome";
import { traceDrawerProps } from "../live/traceView";

/** The signed-out preview: the same layout from the design fixture for `moment` (values frozen). */
function fixtureCommandView(moment: MomentId): CommandView & { callout?: DecisionCalloutView } {
  const m = MOMENTS[moment];
  const [d, mon, y, hm] = m.clock.split(" ");
  const now = new Date(`${d} ${mon} ${y} ${hm} UTC`).toISOString();
  // The network for a signed-out preview: the season48 script replayed to the slip (beat 2), or none at the start.
  const replayed = moment === "start" ? [] : replayBeats(season48, DIRECTOR_BEATS, { upTo: "2" });
  const off = m.stations.filter((s) => s.state !== "GREEN");
  const attention: AttentionView[] = [
    ...m.decisions.map((x): AttentionView => ({
      id: x.id, severity: x.daysLeft <= 3 ? "RED" : "AMBER", title: `Decision required: ${x.station} ${x.id}`, owner: "HQ Ops",
      deadline: x.deadline === "no deadline" ? undefined : x.deadline, cause: x.title, action: { to: `/decisions/${x.id}?moment=${moment}`, label: "Review decision" }, steps: [],
    })),
    ...m.risks.filter((r) => r.state === "RED" || r.state === "AMBER").map((r, i): AttentionView => ({
      id: `risk-${i}`, severity: r.state as "RED" | "AMBER", title: r.text, cause: r.age ? `Data ${r.age} old.` : "", steps: [],
    })),
  ];
  const v = CALENDAR.vessel;
  const iso = (label: string) => parseEtaInput(label.replace(/ \(.*\)$/, "")) ?? now;
  const marks = timelinePositions([{ key: "cutoff", at: iso(v.loadCutoff) }, { key: "departs", at: iso(v.departs) }, { key: "eta", at: iso(v.eta) }, { key: "closing", at: iso(v.closing) }], now);
  const pct = (k: string) => marks.find((x) => x.key === k)?.pct ?? 0;
  return {
    status: [
      off.length ? off.map((s) => `${s.name} is ${s.state}${s.driver ? `: ${s.driver}` : ""}.`).join(" ") : "All stations within thresholds.",
      m.decisions.length ? `${m.decisions.length} ${m.decisions.length === 1 ? "decision" : "decisions"} due by ${m.decisions[0]!.deadline}.` : off.length ? "" : `Next vessel cutoff ${v.loadCutoff}.`,
    ].filter(Boolean).join(" "),
    allClear: off.length === 0 && m.decisions.length === 0,
    incident: m.incident && { title: m.incident.id, confirmed: m.incident.strip.replace(/^[^·]*·\s*/, "") },
    rows: m.stations.map((s) => ({
      nodeId: s.nodeId, name: s.name, state: s.state,
      reason: s.driver ?? "All six dimensions within thresholds",
      deadline: s.pnr ? `Point of no return ${s.pnr.date.replace(/ \d{4}$/, "")}` : undefined,
      link: { text: s.link.status === "ONLINE" ? "Online" : `${s.link.status.charAt(0)}${s.link.status.slice(1).toLowerCase()} · ${s.link.lastContact}` },
    })),
    attention,
    season: {
      phaseLine: `Closing phase. Next resupply 20 Nov 2027, in ${m.daysToResupply} days.`,
      vessel: { name: v.name, nowPct: pct("now"), marks: [
        { key: "cutoff", label: `Cutoff ${v.loadCutoff}`, pct: pct("cutoff"), strong: true },
        { key: "departs", label: `Departs ${v.departs}`, pct: pct("departs") },
        { key: "eta", label: `ETA ${v.eta}`, pct: pct("eta") },
        { key: "closing", label: `Closing ${v.closing}`, pct: pct("closing") },
      ] },
    },
    events: TIMELINES[moment].slice(0, 5).map((e) => ({ id: e.deviceSeq, text: e.summary, device: e.device, age: (e as { age?: string }).age ?? e.observedAt })),
    summary: { stations: off.length, worst: off.some((s) => s.state === "RED") ? "RED" : off.length ? "AMBER" : undefined, incidents: m.incident ? 1 : 0, decisions: m.decisions.length },
    network: networkView(season48, replayed, evaluate({ seed: season48, events: replayed }, now), now),
    callout: m.decisions[0] && {
      id: m.decisions[0].id, station: m.decisions[0].station, title: m.decisions[0].title, chain: [],
      deadline: m.decisions[0].deadline === "no deadline" ? undefined : `Point of no return ${m.decisions[0].deadline}`, href: `/decisions/${m.decisions[0].id}?moment=${moment}`,
    },
  };
}

/**
 * Command Center (L1, section 8): in five seconds, is anything wrong, what must be decided by when,
 * and how are the stations. Signed in, every line is this device's evaluate() and event log; the
 * all-clear comes from the same evaluation as the stations table. Deeper levels (station page,
 * trace, what-if) open by click.
 */
export function CommandCenter({ moment: momentProp = "start", cascade = false, trace = false, whatIf = false }: {
  moment?: MomentId; cascade?: boolean; trace?: boolean; whatIf?: boolean; stationsInEmergency?: boolean;
}) {
  const device = useDevice();
  const live = useLiveChrome();
  const ops = useLiveOps();
  const [showTrace, setShowTrace] = React.useState(trace);
  const [sim, setSim] = React.useState(whatIf);
  const [mathNode, setMathNode] = React.useState<string>();

  // The top pending decision, phrased by the Decision screen's own view model (one source of wording).
  const callout = React.useMemo((): DecisionCalloutView | undefined => {
    const snap = device?.snapshot;
    if (!ops || !snap || !device) return undefined;
    const first = [...ops.openDecisions].sort((a, b) => (a.pnr ?? "9999").localeCompare(b.pnr ?? "9999"))[0];
    if (!first) return undefined;
    const events = snap.events.filter((e) => !snap.rejected.has(e.event_id));
    const decision = decisionsView(events).find((d) => d.id === first.id);
    if (!decision) return undefined;
    const data = buildDecisionScreen({
      decision, events, allEvents: snap.events, pendingIds: snap.pendingIds, rejected: snap.rejected, seed: snap.seed ?? season48,
      evaluation: ops.evaluation, now: snap.now, identity: device.session.identity, stationName: nodeLabel,
    });
    return { id: data.id, station: data.station, title: data.title, chain: data.chain, deadline: data.deadline?.text, lead: data.deadline?.lead, href: `/decisions/${data.id}` };
  }, [device, ops]);

  if (device && !ops) {
    return <Frame moment="start" nav="command"><p className="p-8 text-center text-sm text-fg-2">Loading this device's expedition state.</p></Frame>;
  }

  // Signed in, everything comes from this device; `moment` only picks the signed-out design fixture.
  const moment: MomentId = ops ? "start" : momentProp;
  const fixture = ops && live ? undefined : fixtureCommandView(moment);
  const view: CommandView = fixture ?? liveCommandView(ops!, live!);
  const top = fixture ? fixture.callout : callout;
  const fixtureTrace = moment === "hq-2501600" ? [...HERO_TRACE.slice(0, 7), ...FRESHNESS_TRACE_HQ_2501600, ...HERO_TRACE.slice(7)] : moment === "start" ? START_TRACE : moment === "hq-2501620" ? APPROVED_TRACE : HERO_TRACE;

  return (
    <Frame moment={moment} nav="command" simulation={sim}
      drawer={<>
        {/* Design previews only (?trace=1): signed in, the math opens from the Station page on the dimension clicked. */}
        {showTrace && !ops && <TraceDrawer title="Maitri · Fuel" state={MOMENTS[moment].stations[0]?.dimensions.find((d) => d.key === "FUEL")?.state} subtitle={`As seen by ${MOMENTS[moment].viewer.id} at ${MOMENTS[moment].clock}`}
          steps={fixtureTrace.map((s) => ({ rule: s.rule, text: traceText(s) }))} units={{ "INV-DSL": "kL" }} animate={cascade} onClose={() => setShowTrace(false)} />}
        {mathNode && ops && live && (() => {
          // The station row's math opens the dimension that drives its state (section 9.2).
          const st = ops.evaluation.stations.find((s) => s.nodeId === mathNode);
          const key = st && drivingDimension(st)?.key;
          const props = st && key ? traceDrawerProps(st, key, nodeLabel(mathNode), live.deviceId, live.clock) : undefined;
          return props ? <TraceDrawer key={`${mathNode}:${key}`} {...props} onClose={() => setMathNode(undefined)} /> : null;
        })()}
        {sim && (ops && live ? <LiveWhatIfDrawer ops={ops} role={live.role} onClose={() => setSim(false)} /> : <WhatIfDrawer onClose={() => setSim(false)} onDiscard={() => setSim(false)} />)}
      </>}>
      <div className="space-y-6 p-6">
        <PageHeader title="Command center" subtitle="Is anything wrong, what must be decided by when, and how the stations are." actions={<SummaryCounts summary={view.summary} />} />
        <StatusLine text={view.status} />
        {view.incident && <IncidentStrip title={view.incident.title} confirmed={view.incident.confirmed} to="/incident" />}
        <div className="grid items-start gap-6 xl:grid-cols-2 min-[87.5rem]:grid-cols-[minmax(0,1.05fr)_minmax(0,1.45fr)_minmax(0,0.9fr)]">
          <NeedsAttention items={view.attention} allClear={view.allClear} />
          {view.network && (
            <Card heading="Network position" pad="none" meta={`${view.network.nodes.filter((n) => n.kind === "station").length} stations · ${view.network.nodes.filter((n) => n.kind === "team").length} team`}>
              <NetworkSchematic view={view.network} />
              <p className="border-t border-line px-4 py-2 text-xs text-fg-2">Solid lines are supply legs; dashed in a state colour, a delayed leg or an overdue team. Select a station to open it.</p>
            </Card>
          )}
          {/* Beside the band on wide screens; below 1400 px the two cards sit side by side under it. */}
          <div className="grid items-start gap-6 xl:col-span-2 xl:grid-cols-2 min-[87.5rem]:col-span-1 min-[87.5rem]:grid-cols-1">
            <RecentEvents events={view.events} />
            <SeasonPanel season={view.season} />
          </div>
        </div>
        <StationsTable rows={view.rows} className={cx(cascade && "dh-cascade-in")} onShowMath={ops ? setMathNode : undefined} />
        {top && <DecisionCallout d={top} />}
      </div>
    </Frame>
  );
}
