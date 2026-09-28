import * as React from "react";
import { MOMENTS, TIMELINES, HERO_TRACE, FRESHNESS_TRACE_HQ_2501600, START_TRACE, APPROVED_TRACE, CALENDAR, type MomentId } from "../data/demo";
import { Frame } from "./Frame";
import { IncidentStrip, NeedsAttention, RecentEvents, SeasonPanel, StationsTable, StatusLine, type AttentionView } from "../components/command";
import { TraceDrawer, traceText } from "../components/trace";
import { WhatIfDrawer } from "../components/whatif";
import { cx } from "../components/primitives";
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
function fixtureCommandView(moment: MomentId): CommandView {
  const m = MOMENTS[moment];
  const [d, mon, y, hm] = m.clock.split(" ");
  const now = new Date(`${d} ${mon} ${y} ${hm} UTC`).toISOString();
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

  if (device && !ops) {
    return <Frame moment="start" nav="command"><p className="p-8 text-center text-sm text-fg-2">Loading this device's expedition state.</p></Frame>;
  }

  // Signed in, everything comes from this device; `moment` only picks the signed-out design fixture.
  const moment: MomentId = ops ? "start" : momentProp;
  const view = ops && live ? liveCommandView(ops, live) : fixtureCommandView(moment);
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
        <StatusLine text={view.status} />
        {view.incident && <IncidentStrip title={view.incident.title} confirmed={view.incident.confirmed} to="/incident" />}
        <StationsTable rows={view.rows} className={cx(cascade && "dh-cascade-in")} onShowMath={ops ? setMathNode : undefined} />
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
          <NeedsAttention items={view.attention} allClear={view.allClear} />
          <div className="space-y-6">
            <SeasonPanel season={view.season} />
            <RecentEvents events={view.events} />
          </div>
        </div>
      </div>
    </Frame>
  );
}
