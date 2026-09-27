import * as React from "react";
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

const STATUS_TEXT: Record<string, string> = { OK: "text-fg-2", DEGRADED: "text-warn", DOWN: "text-bad" };

/** Map screen for the signed-in device: the whole route, and the incident area when one is open. */
export function LiveMapScreen() {
  const ops = useLiveOps();
  const incidentId = ops?.openIncidents[0]?.id;
  const all = useLiveMapModel();
  const focus = useLiveMapModel(incidentId);
  if (!all || !ops) return null;
  const assets = all.features.filter((f) => f.kind === "asset");
  return (
    <Frame moment="start" nav="map">
      <div className="space-y-4 p-5">
        <div>
          <h1 className="text-xl font-semibold text-fg">Map</h1>
          <p className="mt-0.5 text-sm text-fg-2">Positions are always last known with their age. Nothing here is live. Tiles: NASA Blue Marble; the schematic is used when tiles are unavailable.</p>
        </div>
        <div className="grid grid-cols-[1.3fr_1fr] gap-4">
          <LiveMap model={all} view="all" height={500} />
          <div className="space-y-4">
            {focus?.incident ? (
              <LiveMap model={focus} view="incident" height={300} />
            ) : (
              <Card><p className="text-sm text-fg-2">No open incident on this device. The incident map appears here when one is opened.</p></Card>
            )}
            <Card>
              <SectionHeader title="Assets with a known position" />
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px]">
                {assets.map((a) => (
                  <li key={a.id} className="flex justify-between gap-2">
                    <span className="text-fg">{a.id}</span>
                    <span className={cx(STATUS_TEXT[a.status ?? "OK"], a.conflict && "font-bold text-warn")}>{a.status}{a.conflict ? " · conflict" : ""}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <SectionHeader title="Route legs" />
              <ul className="font-mono text-[11px] text-fg-2">
                {all.routes.map((r) => (
                  <li key={r.leg_id} className="flex justify-between gap-2">
                    <span className="text-fg">{r.leg_id}</span>
                    <span>{nodeLabel(r.from.node_id)} → {nodeLabel(r.to.node_id)}</span>
                    <span className={r.status === "DELAYED" ? "text-warn" : undefined}>{r.status} · ETA {r.eta.slice(5, 10)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </Frame>
  );
}
