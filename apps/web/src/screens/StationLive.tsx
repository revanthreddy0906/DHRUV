import * as React from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { FlaskConical, Network, Sigma } from "lucide-react";
import { Button, Card, GateBanner, StateBadge, cx } from "../components/primitives";
import { BaselineB0Badge, DimensionsTable, Disclosure, MissionList } from "../components/station";
import { TraceDrawer } from "../components/trace";
import { DIMENSION_LABEL, dimensionHeadline, drivingDimension, stationReason } from "../format";
import { traceDrawerProps } from "../live/traceView";
import { useDevice } from "../live/DeviceProvider";
import { useLiveChrome } from "../live/chrome";
import { useLiveOps } from "../live/ops";
import { useStationFocus } from "../live/stationFocus";
import { RobustnessPanel } from "../live/RobustnessPanel";
import { LiveWhatIfDrawer } from "../live/WhatIfLive";
import { Frame } from "./Frame";

/** /stations: a station role goes straight to its own station; HQ to the station it is looking at. */
export function StationsIndex() {
  const device = useDevice();
  const [focus] = useStationFocus();
  if (!device) return null;
  const { role, node_id } = device.session.identity;
  const node = role === "HQ_OPS" ? (focus ?? "MAITRI") : node_id;
  return <Navigate to={`/stations/${node}`} replace />;
}

/**
 * Station page (section 9.1, L2): the six dimensions of one station, what drives its state, the
 * fuel outlook, missions, and the analysis panels behind a disclosure. Everything is this device's
 * evaluate() for the station; nothing is computed here.
 */
export function LiveStationScreen() {
  const { nodeId = "MAITRI" } = useParams();
  const device = useDevice();
  const live = useLiveChrome();
  const navigate = useNavigate();
  const [focus] = useStationFocus();
  const ops = useLiveOps(nodeId);
  const [traceKey, setTraceKey] = React.useState<string>();
  const [whatIf, setWhatIf] = React.useState(false);
  const role = device?.session.identity.role;
  const own = device?.session.identity.node_id;

  // HQ's station select in the top bar moves this page to the chosen station.
  React.useEffect(() => {
    if (role === "HQ_OPS" && focus && focus !== nodeId) navigate(`/stations/${focus}?station=${focus}`, { replace: true });
  }, [role, focus, nodeId, navigate]);

  if (!device || !ops || !live) return <Frame moment="start" nav="stations"><p className="p-8 text-center text-sm text-fg-2">Loading this device's expedition state.</p></Frame>;
  // Station roles see their own station only (the token's node), as everywhere else.
  if (role !== "HQ_OPS" && own && nodeId !== own && ops.evaluation.stations.some((s) => s.nodeId === own)) return <Navigate to={`/stations/${own}`} replace />;

  const st = ops.evaluation.stations.find((s) => s.nodeId === nodeId);
  const view = ops.stations.find((s) => s.nodeId === nodeId);
  if (!st || !view) {
    return <Frame moment="start" nav="stations"><p className="p-8 text-sm text-fg-2">The engine has no evaluation for {nodeId} on this device. Readiness there is unknown.</p></Frame>;
  }

  const driving = drivingDimension(st);
  const fuel = st.dimensions.find((d) => d.key === "FUEL");
  const pob = st.dimensions.find((d) => d.key === "FOOD")?.foodRequirement?.pob;
  const link = live.stations.find((s) => s.node === nodeId);
  const traced = traceKey ? traceDrawerProps(st, traceKey, view.name, live.deviceId, live.clock) : undefined;

  return (
    <Frame moment="start" nav="stations" simulation={whatIf}
      drawer={<>
        {traced && (
          <TraceDrawer key={traceKey} {...traced} onClose={() => setTraceKey(undefined)} />
        )}
        {whatIf && <LiveWhatIfDrawer ops={ops} role={live.role} onClose={() => setWhatIf(false)} />}
      </>}>
      <div className="space-y-6 p-6">
        <header className="flex flex-wrap items-start gap-x-8 gap-y-3">
          <div className="flex min-w-0 flex-1 gap-4">
            <span aria-hidden className="mt-0.5 flex h-10 w-14 shrink-0 items-center justify-center rounded-sm border border-line-strong bg-surface font-mono text-sm font-semibold text-accent">{view.name.slice(0, 3).toUpperCase()}</span>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-title font-semibold text-fg">{view.name}</h1>
                <StateBadge state={st.state} />
              </div>
              <p className="text-sm text-fg">{stationReason(st)}</p>
              <p className="text-xs text-fg-2">
                {link ? (link.own ? `Link ${link.status.toLowerCase()} (this device)` : link.age === "just now" ? "Last heard just now" : `Last heard ${link.age} ago`) : ""}
                {pob !== undefined && <span className="ml-4">POB {pob}</span>}
              </p>
            </div>
          </div>
          {driving && st.state !== "GREEN" && (
            <div className="text-right">
              <div className="text-xs text-fg-2">{DIMENSION_LABEL[driving.key]}</div>
              <div className={cx("font-mono text-headline font-semibold tabular-nums", st.state === "RED" ? "text-bad" : "text-warn")}>{dimensionHeadline(driving)}</div>
            </div>
          )}
          <div className="flex items-center gap-2 self-center">
            {driving && <Button icon={<Sigma size={16} aria-hidden />} onClick={() => setTraceKey(driving.key)}>Show the math</Button>}
            <Button icon={<FlaskConical size={16} aria-hidden />} onClick={() => setWhatIf(true)}>What if…</Button>
          </div>
        </header>

        {(st.gates ?? []).length > 0 && <div className="space-y-2">{st.gates!.map((g) => <GateBanner key={g.id}>{g.message}</GateBanner>)}</div>}

        <Card heading="Dimensions" meta="Worst dimension sets the station's state" pad="none">
          <DimensionsTable dimensions={st.dimensions} now={ops.now} onShowMath={setTraceKey} />
        </Card>

        <div className="grid items-start gap-6 xl:grid-cols-2">
          <Card heading="Fuel outlook">
            {fuel?.slipTolerance ? (
              <p className="text-sm text-fg">
                {view.slip.text}.{view.slip.kind === "breach" && <span className="text-fg-2"> Arithmetic at current burn, not a prediction.</span>}
              </p>
            ) : <p className="text-sm text-fg-2">This station has no diesel line in the seed, so its fuel outlook is unknown.</p>}
          </Card>
          {view.missions.length > 0 && (
            <Card heading="Missions" pad="none" bodyClassName="px-4">
              <MissionList missions={view.missions} />
            </Card>
          )}
        </div>

        <Disclosure title="Analysis and stress tests">
          {view.b0 && fuel && <BaselineB0Badge alerts={view.b0.alerts} engineState={fuel.state} text={view.b0.text} />}
          <RobustnessPanel seed={ops.seed} events={ops.events} now={ops.now} node={nodeId} />
          {/* Opens Connections focused on the dimension that drives the station's state. */}
          <Link to={`/graph?station=${nodeId}${driving ? `&focus=${nodeId}.${driving.key}` : ""}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
            <Network size={16} aria-hidden />Connections for {view.name}{driving ? ` ${(DIMENSION_LABEL[driving.key] ?? driving.key).toLowerCase()}` : ""}
          </Link>
        </Disclosure>
      </div>
    </Frame>
  );
}
