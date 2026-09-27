import * as React from "react";
import { Network, PackagePlus, Pencil, TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { checkCargoFeasibilityConfidence, classifyFreshness, evaluate, reduce } from "@dhruv/engine";
import type { OpEvent, Seed } from "@dhruv/shared";
import type { LegView, ShipmentView } from "../data/demo";
import { LegTimeline } from "../components/ops";
import { Button, Card, SectionHeader } from "../components/primitives";
import { useDevice } from "../live/DeviceProvider";
import { useLiveOps } from "../live/ops";
import { ShipmentForm } from "../live/ShipmentForm";
import { MilestoneStrip } from "../live/MilestoneStrip";
import { nodeLabel } from "../live/chrome";
import { dayLabel } from "../live/describe";
import { formatAge, parseEtaInput } from "../live/format";
import { Frame } from "./Frame";

/** When a leg's ETA was last reported (LEG_UPDATED / LEG_DELAYED). */
function reportedAt(events: OpEvent[], legId: string): string | undefined {
  return events
    .filter((e) => (e.type === "LEG_DELAYED" || e.type === "LEG_UPDATED") && (e.payload as { leg_id?: string }).leg_id === legId)
    .map((e) => e.observed_at)
    .sort()
    .at(-1);
}

/** Shipments from the seed with this device's leg and vessel state; feasibility and slack are the engine's (R02, R16, R17). */
function shipmentsOf(seed: Seed, events: OpEvent[], now: string): { shipments: ShipmentView[]; original: Record<string, string> } {
  const state = reduce(seed, events);
  const original: Record<string, string> = {};
  const shipments = seed.shipments.map((sh): ShipmentView => {
    const legs = seed.legs.filter((l) => l.shipment_id === sh.id).sort((a, b) => a.seq - b.seq);
    const vesselLeg = legs.find((l) => l.vessel_id);
    const vessel = vesselLeg?.vessel_id ? state.vessels.get(vesselLeg.vessel_id) : undefined;
    const feeder = [...legs].reverse().find((l) => !l.vessel_id && l.status !== "DONE");
    const feederState = feeder ? state.legs.get(feeder.id) : undefined;

    let feasible: ShipmentView["feasible"] = "FEASIBLE";
    let slack = "—";
    let slackState: ShipmentView["slackState"] = "GREEN";
    let note: string | undefined;
    if (feederState && vessel) {
      const fresh = classifyFreshness(feederState.legId, "cargoEta", reportedAt(events, feederState.legId) ?? feederState.eta, now);
      const conf = checkCargoFeasibilityConfidence(feederState.legId, feederState.eta, vessel.loadCutoff, fresh);
      slack = `${conf.slackDays < 0 ? "−" : ""}${Math.abs(conf.slackDays)} d`;
      slackState = conf.slackDays < 0 ? "RED" : conf.slackDays <= 2 ? "AMBER" : "GREEN";
      feasible = !conf.feasible ? "EXCLUDED" : conf.uncertain ? "UNCERTAIN" : "FEASIBLE";
      if (!conf.feasible) note = "Cargo excluded by vessel cutoff (window cliff)";
      else if (conf.uncertain) note = `ETA report ${fresh.freshness}, slack ${conf.slackDays} d: verify before relying on it (R17)`;
      if (feederState.eta !== feeder!.eta) original[sh.id] = dayLabel(feeder!.eta);
    }

    const legViews: LegView[] = legs.map((l) => {
      const s = state.legs.get(l.id);
      const at = reportedAt(events, l.id);
      return {
        id: `L${l.seq}`,
        from: nodeLabel(l.from_node),
        to: nodeLabel(l.to_node),
        etd: l.vessel_id && vessel ? dayLabel(vessel.departure) : (s?.etd ?? l.etd) ? dayLabel((s?.etd ?? l.etd)!) : undefined,
        eta: dayLabel(l.vessel_id && vessel ? vessel.etaStation : (s?.eta ?? l.eta)),
        status: (s?.status ?? l.status) as LegView["status"],
        vessel: !!l.vessel_id,
        freshness: at ? { cls: classifyFreshness(l.id, "cargoEta", at, now).freshness, age: formatAge(at, now) } : undefined,
      };
    });

    return { id: sh.id, contents: sh.name, priority: sh.priority, legs: legViews, cutoff: vessel ? dayLabel(vessel.loadCutoff) : "—", slack, slackState, feasible, note };
  });
  return { shipments, original };
}

export function LiveCargoScreen() {
  const device = useDevice();
  const ops = useLiveOps();
  const [edit, setEdit] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [shipmentId, setShipmentId] = React.useState<string>();
  const [newEtaInput, setNewEtaInput] = React.useState("7 Feb");
  const [reasonInput, setReasonInput] = React.useState("feeder vessel delayed");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();

  const view = React.useMemo(() => (ops ? shipmentsOf(ops.seed, ops.events, ops.now) : null), [ops]);

  if (!device || !ops || !view) {
    return (
      <Frame moment="start" nav="cargo">
        <div className="flex h-full flex-col items-center justify-center p-8">
          <div className="flex flex-col items-center gap-3 text-fg-2">
            <div className="size-6 animate-spin rounded-full border-2 border-line-ctrl border-t-accent" />
            <span className="font-mono text-xs tracking-wider">HYDRATING EXPEDITION STATE...</span>
          </div>
        </div>
      </Frame>
    );
  }

  const { seed, events, now } = ops;
  const isHq = device.session.identity.role === "HQ_OPS";
  const target = seed.shipments.find((s) => s.id === (shipmentId ?? seed.shipments[0]?.id));
  const targetLeg = target && [...seed.legs].filter((l) => l.shipment_id === target.id && !l.vessel_id && l.status !== "DONE").sort((a, b) => b.seq - a.seq)[0];
  const vessel = seed.vessels[0] && reduce(seed, events).vessels.get(seed.vessels[0].id);
  const newEta = parseEtaInput(newEtaInput);

  // Consequence preview: the same engine with the delay as an overlay, never written.
  const preview = (() => {
    if (!targetLeg || !newEta || !target) return null;
    const overlay = { event_id: "cargo-preview", device_id: "WHATIF", seq: 0, type: "LEG_DELAYED", entity_type: "leg", entity_id: targetLeg.id, node_id: "HQ", payload: { leg_id: targetLeg.id, new_eta: newEta, reason: "preview" }, observed_at: now, created_at_client: now, priority: 3, actor_role: "HQ_OPS", schema_version: 1 } as OpEvent;
    const fuel = (evs: OpEvent[]) => evaluate({ seed, events: evs }, now).stations.find((s) => s.nodeId === target.dest_node_id);
    const before = fuel(events);
    const after = fuel([...events, overlay]);
    const f = (s: typeof before) => s?.dimensions.find((d) => d.key === "FUEL");
    return { before: f(before), after: f(after), pnr: after?.pnr?.pnrDate, station: after?.state };
  })();

  const record = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !targetLeg || !newEta) return;
    setBusy(true);
    setError(undefined);
    try {
      await device.write({ type: "LEG_DELAYED", entity_type: "leg", entity_id: targetLeg.id, node_id: "HQ", payload: { leg_id: targetLeg.id, new_eta: newEta, reason: reasonInput.trim() || "delay reported" } });
      device.syncNow();
      setEdit(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame moment="start" nav="cargo">
      <div className="space-y-4 p-5">
        <div className="flex items-end gap-3">
          <div>
            <h1 className="text-xl font-semibold text-fg">Cargo</h1>
            {vessel && (
              <p className="mt-0.5 text-sm text-fg-2">
                Inbound to {[...new Set(seed.shipments.map((s) => nodeLabel(s.dest_node_id)))].join(" and ") || nodeLabel("MAITRI")} · {seed.vessels[0]!.name} load cutoff <span className="font-mono">{dayLabel(vessel.loadCutoff)}</span> · departs {dayLabel(vessel.departure)} · closing {dayLabel(vessel.stationClosingDate)}
              </p>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link to={`/graph?focus=${seed.shipments[0]?.id ?? ""}`} className="flex items-center gap-1 px-2 text-[12px] text-fg-2 hover:text-fg"><Network size={13} aria-hidden />Connections</Link>
            <Button icon={<PackagePlus size={14} />} onClick={() => setCreating(true)} disabledReason={isHq ? undefined : "Shipments are created by HQ Ops"}>New shipment</Button>
            <Button icon={<Pencil size={14} />} onClick={() => setEdit(true)} disabledReason={isHq ? undefined : "Leg delays are recorded by HQ Ops"}>Edit ETA</Button>
          </div>
        </div>

        {creating && isHq && (
          <ShipmentForm
            seed={seed}
            vessel={vessel && seed.vessels[0] ? { id: seed.vessels[0].id, name: seed.vessels[0].name, departure: vessel.departure, etaStation: vessel.etaStation, loadCutoff: vessel.loadCutoff } : undefined}
            onDone={() => setCreating(false)}
          />
        )}

        {edit && isHq && (
          <Card className="border-accent/60">
            <SectionHeader title={`Edit ETA · ${target?.id ?? ""} ${targetLeg ? `${nodeLabel(targetLeg.from_node)} → ${nodeLabel(targetLeg.to_node)}` : ""} · consequence preview`} />
            <form onSubmit={record} className="flex flex-wrap items-center gap-4">
              <label className="text-xs text-fg-2">Shipment{" "}
                <select value={target?.id} onChange={(e) => setShipmentId(e.target.value)} className="ml-2 h-8 rounded-md border border-line-ctrl bg-bg px-2 font-mono text-sm text-fg">
                  {seed.shipments.map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
                </select>
              </label>
              <label className="text-xs text-fg-2">New ETA{" "}
                <input value={newEtaInput} onChange={(e) => setNewEtaInput(e.target.value)} className="ml-2 h-8 w-24 rounded-md border border-line-ctrl bg-bg px-2 font-mono text-sm text-fg" />
              </label>
              <label className="text-xs text-fg-2">Reason{" "}
                <input value={reasonInput} onChange={(e) => setReasonInput(e.target.value)} className="ml-2 h-8 w-56 rounded-md border border-line-ctrl bg-bg px-2 text-sm text-fg" />
              </label>
              {preview?.before && preview.after && (
                <div className="flex items-center gap-2 rounded-md border border-line-strong bg-bg px-3 py-1.5 text-[12px] text-fg">
                  <TriangleAlert size={14} className={preview.after.state === "RED" ? "text-bad" : "text-fg-2"} aria-hidden />
                  Preview (engine, not recorded): Fuel {preview.before.ratio?.toFixed(4)} → <b className="font-mono">{preview.after.ratio?.toFixed(4)} {preview.after.state}</b>
                  {preview.pnr && ` · PNR ${dayLabel(preview.pnr)}`}
                </div>
              )}
              {!newEta && <span className="text-xs text-bad">Enter a date like "7 Feb"</span>}
              <Button variant="primary" type="submit" disabled={busy || !newEta}>Record LEG_DELAYED</Button>
              <Button variant="ghost" type="button" onClick={() => setEdit(false)}>Cancel</Button>
            </form>
            {error && <p className="mt-2 text-xs text-bad">{error}</p>}
          </Card>
        )}

        {view.shipments.map((s) => { const ms = ops.milestones.find((x) => x.shipmentId === s.id); return <LegTimeline key={s.id} s={s} today={dayLabel(now)} originalEta={view.original[s.id]} milestones={ms && <MilestoneStrip m={ms} />} />; })}

        <p className="text-[11px] text-fg-2">
          Cargo-leg freshness is shown as a badge. When an ETA report is STALE or worse and slack ≤ 2 d, R17 marks the inbound UNCERTAIN and the band's low side excludes it.
        </p>
      </div>
    </Frame>
  );
}
