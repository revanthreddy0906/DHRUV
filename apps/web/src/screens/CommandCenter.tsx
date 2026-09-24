import * as React from "react";
import { Siren, LayoutGrid, FlaskConical, RadioTower, CloudUpload } from "lucide-react";
import { MOMENTS, TIMELINES, HERO_TRACE, FRESHNESS_TRACE_HQ_2501600, START_TRACE, APPROVED_TRACE, CALENDAR, type MomentId } from "../data/demo";
import { Frame } from "./Frame";
import { PnrStrip, StationCard } from "../components/readiness";
import type { StationEval } from "../data/types";
import { DecisionQueue } from "../components/decisions";
import { RiskList, EventTimeline } from "../components/events";
import { MapPanel, SchematicMap } from "../components/map";
import { TraceDrawer } from "../components/trace";
import { IncidentPanel } from "../components/incident";
import { WhatIfDrawer } from "../components/whatif";
import { Button, cx } from "../components/primitives";
import { useNavigate } from "react-router-dom";
import { useDevice } from "../live/DeviceProvider";
import { useLiveChrome, type LiveChrome } from "../live/chrome";
import { useLiveOps } from "../live/ops";
import { useLiveMapModel } from "../live/incident";
import { LiveMap } from "../live/LiveMap";
import { LiveIncidentPanel } from "./IncidentLive";
import { LiveWhatIfDrawer } from "../live/WhatIfLive";

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
 * events; station readiness, risks, traces and what-if are the engine's evaluate() on the same events.
 */
export function CommandCenter({ moment: momentProp = "start", cascade = false, trace = false, whatIf = false, stationsInEmergency = false }: {
  moment?: MomentId; cascade?: boolean; trace?: boolean; whatIf?: boolean; stationsInEmergency?: boolean;
}) {
  const device = useDevice();
  const live = useLiveChrome();
  const ops = useLiveOps();
  const mapModel = useLiveMapModel();
  const navigate = useNavigate();
  const [showTrace, setShowTrace] = React.useState(trace);
  const [showStations, setShowStations] = React.useState(stationsInEmergency);
  const [sim, setSim] = React.useState(whatIf);

  if (device && !ops) {
    return (
      <Frame moment="start" nav="command" strip={<div className="h-9 border-t border-line bg-surface" />}>
        <div className="flex h-full flex-col items-center justify-center p-8">
          <div className="flex flex-col items-center gap-3 text-fg-2">
            <div className="size-6 animate-spin rounded-full border-2 border-line-ctrl border-t-accent" />
            <span className="font-mono text-xs tracking-wider">HYDRATING EXPEDITION STATE...</span>
          </div>
        </div>
      </Frame>
    );
  }

  // Signed in, everything below comes from this device (events + engine); `moment` only picks the
  // design fixture for the signed-out preview.
  const moment: MomentId = ops ? "start" : momentProp;
  const m = MOMENTS[moment];
  const incidentStrip = ops ? ops.incidentStrip : m.incident?.strip;
  const emergency = (ops ? ops.emergency : !!m.incident) && !showStations;
  const traceSteps = ops
    ? ops.traceSteps
    : (moment === "hq-2501600" ? [...HERO_TRACE.slice(0, 7), ...FRESHNESS_TRACE_HQ_2501600, ...HERO_TRACE.slice(7)] : moment === "start" ? START_TRACE : moment === "hq-2501620" ? APPROVED_TRACE : HERO_TRACE);

  // Live overrides on the station cards: gates (open incidents and safety conflicts) and link.
  const stationFor = (s: StationEval) => {
    if (!ops || !live) return { station: s, link: undefined };
    // Gates (open incidents, unresolved safety conflicts, blocked missions) are the engine's R15.
    const l = live.stations.find((x) => x.node === s.nodeId);
    const link = l ? (l.own ? { status: l.status } : { age: l.age }) : undefined;
    return { station: s, link };
  };
  const rawMaitri = ops ? (ops.stations.find((s) => s.nodeId === "MAITRI") ?? ops.maitriStation) : m.stations[0];
  const rawOther = ops ? ops.stations.find((s) => s.nodeId !== rawMaitri.nodeId) : m.stations[1];
  const maitriView = stationFor(rawMaitri);
  const bharatiView = rawOther ? stationFor(rawOther) : undefined;
  const maitri = maitriView.station;
  const fuel = maitri.dimensions.find((d) => d.key === "FUEL");
  const fuelState = fuel?.state ?? maitri.state;
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
      <PnrStrip phase={live?.phase ?? m.phase} daysToResupply={live?.daysToResupply ?? m.daysToResupply} vessel={ops ? (ops.vessel ?? CALENDAR.vessel) : moment === "hq-2501620" || moment === "hq-2600900" ? { name: "MV Ice Star", loadCutoff: "7 Feb (held)", departs: "9 Feb", eta: "27 Feb", closing: "28 Feb" } : CALENDAR.vessel} pnr={pnr}
        links={live ? live.stations.map((s) => (s.own ? { node: s.label, status: s.status } : { node: s.label, age: s.age }))
          : [{ node: "Maitri", status: maitri.link.status, age: maitri.link.status !== "ONLINE" ? maitri.link.lastContact : undefined }, { node: "Bharati", status: "ONLINE" }]} />
    </>
  );

  return (
    <Frame moment={moment} nav="command" strip={strip} simulation={sim}
      drawer={<>
        {showTrace && <TraceDrawer title={`${maitri.name} · Fuel ${fuelState}`} subtitle={`As seen by ${live?.deviceId ?? m.viewer.id} at ${live?.clock ?? m.clock}`} steps={traceSteps} animate={cascade} onClose={() => setShowTrace(false)}
          explanation={fuelState !== "RED" ? undefined : ops
            ? { source: "template", text: `Diesel at ${maitri.name} has a ratio of ${fuel?.ratio ?? "?"} (${fuel?.drivers[0] ?? ""}).${maitri.driver ? ` ${maitri.driver}.` : ""}${pnr ? ` Point of no return: ${pnr.date}, ${pnr.daysLeft} days left.` : ""}` }
            : { source: "template", text: "Diesel at Maitri now has a ratio of 0.697 against the 132.0 kL required to the next resupply (20 Nov) because container C-104 will reach Cape Town on 7 Feb, after the vessel's 4 Feb load cutoff. The last date to hold the vessel is 3 Feb." }} />}
        {sim && (ops && live ? <LiveWhatIfDrawer ops={ops} role={live.role} onClose={() => setSim(false)} /> : <WhatIfDrawer onClose={() => setSim(false)} onDiscard={() => setSim(false)} />)}
      </>}>
      <div className="flex h-full flex-col">
        <div className="grid min-h-0 flex-1 grid-cols-[30fr_45fr_25fr] gap-4 p-4">
          <div className="min-h-0 space-y-5 overflow-auto pr-1">
            <DecisionQueue items={ops ? ops.decisions : m.decisions} onOpen={(id) => navigate(ops ? `/decisions/${id}` : `/decisions/${id}?moment=${moment}`)} />
            <RiskList items={ops ? ops.risks : m.risks} />
          </div>
          <div className={cx("min-h-0 space-y-3 overflow-auto pr-1", cascade && "dh-cascade-in")}>
            {emergency ? (ops ? <LiveIncidentPanel compact /> : <IncidentPanel compact />) : (
              <>
                <StationCard station={maitri} link={maitriView.link} onShowMath={() => setShowTrace(true)} animateIndex={cascade ? 5 : undefined} />
                {bharatiView && <StationCard station={bharatiView.station} link={bharatiView.link} compact onShowMath={() => setShowTrace(true)} />}
              </>
            )}
          </div>
          <div className="min-h-0 space-y-4 overflow-auto">
            {mapModel ? <LiveMap model={mapModel} view="all" height={250} compact /> : (
              <MapPanel><SchematicMap width={320} height={250} compact delayedLeg={moment !== "start" && moment !== "hq-2501620"} maitriState={maitri.state === "RED" ? "RED" : "GREEN"} /></MapPanel>
            )}
            {/* The runbook's what-if beat (2:25) comes after the approval while INC-01 is still open. */}
            {(ops || moment !== "start") && (
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
