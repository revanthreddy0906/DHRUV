import * as React from "react";
import { RouteDiagram } from "../components/route";
import { routeView } from "../live/route";
import { ShieldCheck } from "lucide-react";
import { IncidentPanel } from "../components/incident";
import { Card, SectionHeader, cx } from "../components/primitives";
import { useDevice } from "../live/DeviceProvider";
import { LiveMap } from "../live/LiveMap";
import { nodeLabel } from "../live/chrome";
import { useLiveIncident, useLiveMapModel } from "../live/incident";
import { useLiveOps } from "../live/ops";
import { Frame } from "./Frame";

/**
 * Emergency-mode panel for the signed-in device (F4): the section 10 snapshot as this device knows
 * it, the incident map (circle, nearest capable assets) and the responders. Escalate records
 * INCIDENT_UPDATED (status ESCALATED, still open) through the normal write path.
 */
export function LiveIncidentPanel({ compact = false }: { compact?: boolean }) {
  const device = useDevice();
  const live = useLiveIncident();
  const [error, setError] = React.useState<string>();
  if (!device || !live) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-line-strong p-5 text-sm text-fg-2">
        <ShieldCheck size={16} className="text-ok" aria-hidden />No open incident on this device.
      </div>
    );
  }
  const { incident, data, rows, model, conflicts, canEscalate } = live;
  const conflictLines = conflicts.map(
    (c) => `${c.entity_id} ${c.field} ${c.contenders.map((x) => `${String(x.value)} (${x.device_id})`).join(" vs ")} · ${String(c.conservative_value)} kept`,
  );

  const escalate = async () => {
    setError(undefined);
    try {
      await device.write({
        type: "INCIDENT_UPDATED",
        entity_type: "incident",
        entity_id: incident.id,
        node_id: incident.node_id,
        payload: { incident_id: incident.id, status: "ESCALATED", note: `escalated by ${device.session.identity.device_id}` },
      });
      device.syncNow();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-2">
      <IncidentPanel
        inc={data}
        rows={rows}
        compact={compact}
        conflicts={conflictLines}
        status={incident.status}
        escalated={incident.status === "ESCALATED"}
        canEscalate={canEscalate}
        onEscalate={() => void escalate()}
        onPrint={() => window.print()}
        map={<LiveMap model={model} view="incident" height={340} />}
      />
      {error && <p role="alert" className="text-xs text-fg">{error}</p>}
    </div>
  );
}

export function LiveIncidentScreen() {
  const ops = useLiveOps();
  return (
    <Frame moment="start" nav="incident">
      <div className="p-5"><LiveIncidentPanel /></div>
    </Frame>
  );
}


/**
 * Map for the signed-in device (section 9.7): the Antarctic stations and the Cape Town leg by
 * default, the route as a horizontal diagram, the incident area while one is open, and assets by
 * exception. Positions are always last known with their age.
 */
export function LiveMapScreen() {
  const ops = useLiveOps();
  const incidentId = ops?.openIncidents[0]?.id;
  const all = useLiveMapModel();
  const focus = useLiveMapModel(incidentId);
  const [showOk, setShowOk] = React.useState(false);
  const route = React.useMemo(() => (ops ? routeView(ops.seed, ops.events, ops.maitriStation.nodeId) : undefined), [ops]);
  if (!all || !ops) return null;
  const assets = all.features.filter((f) => f.kind === "asset");
  const exceptions = assets.filter((a) => (a.status ?? "OK") !== "OK" || a.conflict);
  const ok = assets.filter((a) => !exceptions.includes(a));
  return (
    <Frame moment="start" nav="map">
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-title font-semibold text-fg">Map</h1>
          <p className="mt-0.5 text-sm text-fg-2">Positions are last known, each with its age. Tiles: NASA Blue Marble; the schematic is used when tiles are unavailable.</p>
        </div>
        {route && (
          <Card>
            <SectionHeader title={`Route of ${route.shipmentId}`} meta={<span className="text-xs text-fg-2">{route.name}</span>} />
            <RouteDiagram route={route} />
          </Card>
        )}
        <div className="grid items-start gap-6 xl:grid-cols-[1.4fr_1fr]">
          <LiveMap model={all} view="antarctic" height={520} />
          <div className="space-y-6">
            {focus?.incident && (
              <section>
                <SectionHeader title={`Incident area · ${incidentId}`} />
                <LiveMap model={focus} view="incident" height={300} />
              </section>
            )}
            <section>
              <SectionHeader title="Assets" />
              <Card pad="none">
                <ul className="divide-y divide-line">
                  {exceptions.map((a) => (
                    <li key={a.id} className="flex h-10 items-center justify-between gap-2 px-4 text-sm">
                      <span className="font-mono text-fg">{a.id}</span>
                      <span className={cx("font-semibold", a.status === "DOWN" ? "text-bad" : "text-warn")}>
                        {(a.status ?? "OK").charAt(0) + (a.status ?? "OK").slice(1).toLowerCase()}{a.conflict ? ", conflicting reports" : ""}
                      </span>
                    </li>
                  ))}
                  {ok.length > 0 && (
                    <li className="px-4 py-2">
                      <button type="button" aria-expanded={showOk} onClick={() => setShowOk((s) => !s)} className="text-sm font-semibold text-accent hover:underline">
                        {ok.length} of {assets.length} assets OK
                      </button>
                      {showOk && <p className="mt-1 font-mono text-xs text-fg-2">{ok.map((a) => a.id).join(", ")}</p>}
                    </li>
                  )}
                </ul>
              </Card>
            </section>
          </div>
        </div>
      </div>
    </Frame>
  );
}
