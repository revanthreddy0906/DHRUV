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

/** Command Center, 1440 × 900 (Bible §17, LOCKED layout). */
export function CommandCenter({ moment = "start", cascade = false, trace = false, whatIf = false, stationsInEmergency = false }: {
  moment?: MomentId; cascade?: boolean; trace?: boolean; whatIf?: boolean; stationsInEmergency?: boolean;
}) {
  const m = MOMENTS[moment];
  const [showTrace, setShowTrace] = React.useState(trace);
  const [showStations, setShowStations] = React.useState(stationsInEmergency);
  const [sim, setSim] = React.useState(whatIf);
  const emergency = !!m.incident && !showStations;
  const maitri = m.stations[0];
  const traceSteps = moment === "hq-2501600" ? [...HERO_TRACE.slice(0, 7), ...FRESHNESS_TRACE_HQ_2501600, ...HERO_TRACE.slice(7)] : moment === "start" ? START_TRACE : moment === "hq-2501620" ? APPROVED_TRACE : HERO_TRACE;
  const fuelState = maitri.dimensions[0].state;

  const strip = (
    <>
      {m.incident && (
        <div role="alert" className="flex items-center gap-3 border-b border-bad/60 bg-bad-tint px-5 py-2">
          <Siren size={16} className="text-bad" aria-hidden />
          <span className="font-mono text-[12px] font-bold text-fg">{m.incident.strip}</span>
          <span className="rounded border border-bad/60 px-1.5 text-[10px] font-bold uppercase tracking-wider text-bad">Emergency mode</span>
          <button type="button" onClick={() => setShowStations((s) => !s)} className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-semibold text-accent hover:bg-accent-tint">
            <LayoutGrid size={13} aria-hidden />{showStations ? "Show incident snapshot" : "Show station cards"}
          </button>
        </div>
      )}
      <PnrStrip phase={m.phase} daysToResupply={m.daysToResupply} vessel={moment === "hq-2501620" || moment === "hq-2600900" ? { name: "MV Ice Star", loadCutoff: "7 Feb (held)", departs: "9 Feb", eta: "27 Feb", closing: "28 Feb" } : CALENDAR.vessel} pnr={maitri.pnr}
        links={[{ node: "Maitri", status: maitri.link.status, age: maitri.link.status !== "ONLINE" ? maitri.link.lastContact : undefined }, { node: "Bharati", status: "ONLINE" }]} />
    </>
  );

  return (
    <Frame moment={moment} nav="command" strip={strip} simulation={sim}
      drawer={<>
        {showTrace && <TraceDrawer title={`Maitri · Fuel ${fuelState}`} subtitle={`As seen by ${m.viewer.id} at ${m.clock}`} steps={traceSteps} animate={cascade} onClose={() => setShowTrace(false)}
          explanation={fuelState !== "RED" ? undefined : { source: "template", text: "Diesel at Maitri now has a ratio of 0.697 against the 132.0 kL required to the next resupply (20 Nov) because container C-104 will reach Cape Town on 7 Feb, after the vessel's 4 Feb load cutoff. The last date to hold the vessel is 3 Feb." }} />}
        {sim && <WhatIfDrawer onClose={() => setSim(false)} onDiscard={() => setSim(false)} />}
      </>}>
      <div className="flex h-full flex-col">
        <div className="grid min-h-0 flex-1 grid-cols-[30fr_45fr_25fr] gap-4 p-4">
          <div className="min-h-0 space-y-5 overflow-auto pr-1">
            <DecisionQueue items={m.decisions} />
            <RiskList items={m.risks} />
          </div>
          <div className={cx("min-h-0 space-y-3 overflow-auto pr-1", cascade && "dh-cascade-in")}>
            {emergency ? <IncidentPanel compact /> : (
              <>
                <StationCard station={maitri} onShowMath={() => setShowTrace(true)} animateIndex={cascade ? 5 : undefined} />
                <StationCard station={m.stations[1]} compact onShowMath={() => setShowTrace(true)} />
              </>
            )}
          </div>
          <div className="min-h-0 space-y-4 overflow-auto">
            <MapPanel><SchematicMap width={320} height={250} compact delayedLeg={moment !== "start" && moment !== "hq-2501620"} maitriState={maitri.state === "RED" ? "RED" : "GREEN"} /></MapPanel>
            {!m.incident && moment !== "start" && (
              <Button size="sm" icon={<FlaskConical size={14} />} onClick={() => setSim(true)}>Open what-if</Button>
            )}
            <EventTimeline events={TIMELINES[moment]} empty="No events since the seed was loaded at 24 Jan 08:00." />
          </div>
        </div>
        <BottomStrip moment={moment} />
      </div>
    </Frame>
  );
}
