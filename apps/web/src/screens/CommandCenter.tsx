import * as React from "react";
import { Siren, LayoutGrid, FlaskConical, RadioTower, CloudUpload } from "lucide-react";
import { MOMENTS, TIMELINES, HERO_TRACE, FRESHNESS_TRACE_HQ_2501600, START_TRACE, APPROVED_TRACE, CALENDAR, type MomentId } from "../data/demo";
import { Frame } from "./Frame";
import { PnrStrip, StationCard } from "../components/readiness";
import { DecisionQueue } from "../components/decisions";
import { RiskList, EventTimeline } from "../components/events";
import { MapPanel, SchematicMap } from "../components/map";
import { TraceDrawer } from "../components/trace";
import { IncidentPanel } from "../components/incident";
import { WhatIfDrawer } from "../components/whatif";
import { Button, cx } from "../components/primitives";
import { useNavigate } from "react-router-dom";
import { useLiveChrome, type LiveChrome } from "../live/chrome";
import { useLiveOps } from "../live/ops";
import { useLiveMapModel } from "../live/incident";
import { LiveMap } from "../live/LiveMap";
import { LiveIncidentPanel } from "./IncidentLive";

const LINK_TEXT = { ONLINE: "text-ok", DEGRADED: "text-warn", OFFLINE: "text-bad" } as const;

/** Comms and sync strip from this tab's device: own link and outbox; other stations by last contact. */
function LiveBottomStrip({ live }: { live: LiveChrome }) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-5 border-t border-line bg-surface px-5 font-mono text-[11px] text-fg-2">
      <span className="flex items-center gap-1.5"><RadioTower size={12} aria-hidden />COMMS</span>
      {live.stations.map((s) => s.own ? (
        <span key={s.node}>{s.label} link <b className={LINK_TEXT[s.status]}>{s.status}</b> <span className="text-fg-2">(simulated)</span></span>
      ) : (
        <span key={s.node}>{s.label} last heard <b className="text-fg">{s.age}</b> · {s.freshness}</span>
      ))}
      <span className="ml-auto flex items-center gap-1.5">
        <CloudUpload size={12} aria-hidden />{live.deviceId} · {live.pending.count} pending{live.pending.oldest && ` · oldest ${live.pending.oldest}`}
        {live.stalled ? <b className="text-bad"> · stalled</b> : live.lastSync && ` · synced ${live.lastSync}`}
      </span>
    </div>
  );
}

function BottomStrip({ moment }: { moment: MomentId }) {
  const m = MOMENTS[moment];
  const maitri = m.stations[0];
  return (
    <div className="flex h-9 shrink-0 items-center gap-5 border-t border-line bg-surface px-5 font-mono text-[11px] text-fg-2">
      <span className="flex items-center gap-1.5"><RadioTower size={12} aria-hidden />COMMS</span>
      <span>Maitri VSAT-1 OK · IRD-1 OK · link <b className={maitri.link.status === "ONLINE" ? "text-ok" : "text-bad"}>{maitri.link.status}</b>{maitri.link.status !== "ONLINE" && ` · last contact ${maitri.link.lastContact}`}</span>
      <span>Bharati link <b className="text-ok">ONLINE</b></span>
      <span className="ml-auto flex items-center gap-1.5"><CloudUpload size={12} aria-hidden />{m.viewer.id} · {m.pending.count} pending{m.pending.oldest && ` · oldest ${m.pending.oldest}`}</span>
    </div>
  );
}

/**
 * Command Center, 1440 × 900 (Bible §17, LOCKED layout). Signed in, the decision queue, PNR,
 * incident strip, emergency mode, station gates, link chips and timeline come from this device's
 * events; station readiness, risks and traces stay the design fixtures (engine output) for the
 * fixture moment that matches the live log.
 */
export function CommandCenter({ moment: momentProp = "start", cascade = false, trace = false, whatIf = false, stationsInEmergency = false }: {
  moment?: MomentId; cascade?: boolean; trace?: boolean; whatIf?: boolean; stationsInEmergency?: boolean;
}) {
  const live = useLiveChrome();
  const ops = useLiveOps();
  const mapModel = useLiveMapModel();
  const navigate = useNavigate();
  const moment = ops?.mockMoment ?? momentProp;
  const m = MOMENTS[moment];
  const [showTrace, setShowTrace] = React.useState(trace);
  const [showStations, setShowStations] = React.useState(stationsInEmergency);
  const [sim, setSim] = React.useState(whatIf);
  const incidentStrip = ops ? ops.incidentStrip : m.incident?.strip;
  const emergency = (ops ? ops.emergency : !!m.incident) && !showStations;
  const traceSteps = moment === "hq-2501600" ? [...HERO_TRACE.slice(0, 7), ...FRESHNESS_TRACE_HQ_2501600, ...HERO_TRACE.slice(7)] : moment === "start" ? START_TRACE : moment === "hq-2501620" ? APPROVED_TRACE : HERO_TRACE;

  // Live overrides on the fixture station cards: gates (open incidents and safety conflicts) and link.
  const stationFor = (s: (typeof m.stations)[number]) => {
    if (!ops || !live) return { station: s, link: undefined };
    const gates = [
      ...ops.openIncidents.filter((i) => i.node_id === s.nodeId).map((i) => `Incident ${i.id} open`),
      ...ops.openConflicts.filter((c) => c.node_id === s.nodeId).map((c) => `Unresolved safety conflict: ${c.entity_id} ${c.field}`),
    ];
    const l = live.stations.find((x) => x.node === s.nodeId);
    const link = l ? (l.own ? { status: l.status } : { age: l.age }) : undefined;
    return { station: { ...s, gates }, link };
  };
  const maitriView = stationFor(m.stations[0]);
  const bharatiView = stationFor(m.stations[1]);
  const maitri = maitriView.station;
  const fuelState = maitri.dimensions[0].state;
  const pnr = ops ? ops.pnr : maitri.pnr;

  const strip = (
    <>
      {incidentStrip && (
        <div role="alert" className="flex items-center gap-3 border-b border-bad/60 bg-bad-tint px-5 py-2">
          <Siren size={16} className="text-bad" aria-hidden />
          <span className="font-mono text-[12px] font-bold text-fg">{incidentStrip}</span>
          {(ops ? ops.emergency : true) && <span className="rounded border border-bad/60 px-1.5 text-[10px] font-bold uppercase tracking-wider text-bad">Emergency mode</span>}
          {(ops ? ops.emergency : true) && <button type="button" onClick={() => setShowStations((s) => !s)} className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-semibold text-accent hover:bg-accent-tint">
            <LayoutGrid size={13} aria-hidden />{showStations ? "Show incident snapshot" : "Show station cards"}
          </button>}
        </div>
      )}
      <PnrStrip phase={live?.phase ?? m.phase} daysToResupply={live?.daysToResupply ?? m.daysToResupply} vessel={moment === "hq-2501620" || moment === "hq-2600900" ? { name: "MV Ice Star", loadCutoff: "7 Feb (held)", departs: "9 Feb", eta: "27 Feb", closing: "28 Feb" } : CALENDAR.vessel} pnr={pnr}
        links={live ? live.stations.map((s) => (s.own ? { node: s.label, status: s.status } : { node: s.label, age: s.age }))
          : [{ node: "Maitri", status: maitri.link.status, age: maitri.link.status !== "ONLINE" ? maitri.link.lastContact : undefined }, { node: "Bharati", status: "ONLINE" }]} />
    </>
  );

  return (
    <Frame moment={moment} nav="command" strip={strip} simulation={sim}
      drawer={<>
        {showTrace && <TraceDrawer title={`Maitri · Fuel ${fuelState}`} subtitle={`As seen by ${live?.deviceId ?? m.viewer.id} at ${live?.clock ?? m.clock}`} steps={traceSteps} animate={cascade} onClose={() => setShowTrace(false)}
          explanation={fuelState !== "RED" ? undefined : { source: "template", text: "Diesel at Maitri now has a ratio of 0.697 against the 132.0 kL required to the next resupply (20 Nov) because container C-104 will reach Cape Town on 7 Feb, after the vessel's 4 Feb load cutoff. The last date to hold the vessel is 3 Feb." }} />}
        {sim && <WhatIfDrawer onClose={() => setSim(false)} onDiscard={() => setSim(false)} />}
      </>}>
      <div className="flex h-full flex-col">
        <div className="grid min-h-0 flex-1 grid-cols-[30fr_45fr_25fr] gap-4 p-4">
          <div className="min-h-0 space-y-5 overflow-auto pr-1">
            <DecisionQueue items={ops ? ops.decisions : m.decisions} onOpen={(id) => navigate(ops ? `/decisions/${id}` : `/decisions/${id}?moment=${moment}`)} />
            <RiskList items={m.risks} />
          </div>
          <div className={cx("min-h-0 space-y-3 overflow-auto pr-1", cascade && "dh-cascade-in")}>
            {emergency ? (ops ? <LiveIncidentPanel compact /> : <IncidentPanel compact />) : (
              <>
                <StationCard station={maitri} link={maitriView.link} onShowMath={() => setShowTrace(true)} animateIndex={cascade ? 5 : undefined} />
                <StationCard station={bharatiView.station} link={bharatiView.link} compact onShowMath={() => setShowTrace(true)} />
              </>
            )}
          </div>
          <div className="min-h-0 space-y-4 overflow-auto">
            {mapModel ? <LiveMap model={mapModel} view="all" height={250} compact /> : (
              <MapPanel><SchematicMap width={320} height={250} compact delayedLeg={moment !== "start" && moment !== "hq-2501620"} maitriState={maitri.state === "RED" ? "RED" : "GREEN"} /></MapPanel>
            )}
            {/* The runbook's what-if beat (2:25) comes after the approval while INC-01 is still open. */}
            {moment !== "start" && (
              <Button size="sm" icon={<FlaskConical size={14} />} onClick={() => setSim(true)}>Open what-if</Button>
            )}
            <EventTimeline events={ops ? ops.timeline : TIMELINES[moment]} empty="No events since the seed was loaded at 24 Jan 08:00." />
          </div>
        </div>
        {live ? <LiveBottomStrip live={live} /> : <BottomStrip moment={moment} />}
      </div>
    </Frame>
  );
}
