import * as React from "react";
import { Network, PackagePlus, Pencil } from "lucide-react";
import { Link } from "react-router-dom";
import { evaluate, reduce } from "@dhruv/engine";
import type { OpEvent, Seed } from "@dhruv/shared";
import { LegTimeline, ShipmentRow } from "../components/ops";
import { Button, Card, FIELD, PageHeader, SectionHeader, cx } from "../components/primitives";
import { formatRatio } from "../format";
import { useDevice } from "../live/DeviceProvider";
import { useLiveOps } from "../live/ops";
import { ShipmentForm } from "../live/ShipmentForm";
import { MilestoneStrip } from "../live/MilestoneStrip";
import { nodeLabel } from "../live/chrome";
import { dayLabel } from "../live/describe";
import { parseEtaInput } from "../live/format";
import { shipmentsOf } from "../live/shipments";
import { Frame, QuietLine } from "./Frame";

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
  // Shipments the operator opened or closed by hand; the default is open exactly when something is at risk.
  const [toggled, setToggled] = React.useState<Set<string>>(new Set());
  const toggle = (id: string) => setToggled((t) => { const n = new Set(t); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const view = React.useMemo(() => (ops ? shipmentsOf(ops.seed, ops.events, ops.now) : null), [ops]);

  if (!device || !ops || !view) {
    return <Frame moment="start" nav="cargo"><QuietLine>Loading this device's expedition state.</QuietLine></Frame>;
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

  // Section 9.5: shipments with an at-risk or missed milestone (or inbound in doubt) first and open.
  const atRisk = (id: string, feasible: string) =>
    feasible !== "FEASIBLE" || !!ops.milestones.find((m) => m.shipmentId === id)?.milestones.some((x) => x.state === "AT_RISK" || x.state === "MISSED");
  const ordered = [...view.shipments].sort((a, b) => Number(atRisk(b.id, b.feasible)) - Number(atRisk(a.id, a.feasible)));
  const isOpen = (id: string, feasible: string) => atRisk(id, feasible) !== toggled.has(id);
  const collapsed = ordered.filter((s) => !isOpen(s.id, s.feasible));

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
    <Frame moment="start" nav="cargo"
      drawer={creating && isHq ? (
        <aside role="dialog" aria-label="New shipment" className="absolute inset-y-0 right-0 z-20 flex w-[560px] flex-col border-l border-line bg-surface shadow-drawer">
          {/* The form carries its own title and Close; the drawer only holds it. */}
          <div className="min-h-0 flex-1 overflow-auto p-5">
            <ShipmentForm
              seed={seed}
              vessels={seed.vessels.flatMap((v) => { const st = reduce(seed, events).vessels.get(v.id); return st ? [{ id: v.id, name: v.name, departure: st.departure, etaStation: st.etaStation, loadCutoff: st.loadCutoff }] : []; })}
              onDone={() => setCreating(false)}
            />
          </div>
        </aside>
      ) : undefined}>
      <div className="space-y-6 p-6">
        <PageHeader title="Cargo"
          subtitle={vessel ? <>Inbound to {[...new Set(seed.shipments.map((s) => nodeLabel(s.dest_node_id)))].join(" and ") || nodeLabel("MAITRI")}. {seed.vessels[0]!.name}: load cutoff <span className="font-semibold text-fg">{dayLabel(vessel.loadCutoff)}</span>, departs {dayLabel(vessel.departure)}, station closing {dayLabel(vessel.stationClosingDate)}.</> : undefined}
          actions={<>
            <Link to={`/graph?focus=${seed.shipments[0]?.id ?? ""}`} className="flex items-center gap-1.5 px-2 text-sm text-fg-2 hover:text-fg"><Network size={16} aria-hidden />Connections</Link>
            <Button icon={<PackagePlus size={16} />} onClick={() => setCreating(true)} disabledReason={isHq ? undefined : "Shipments are created by HQ Ops"}>New shipment</Button>
            <Button icon={<Pencil size={16} />} onClick={() => setEdit(true)} disabledReason={isHq ? undefined : "Leg delays are recorded by HQ Ops"}>Edit ETA</Button>
          </>} />

        {edit && isHq && (
          <Card heading={`Edit ETA · ${target?.id ?? ""} ${targetLeg ? `${nodeLabel(targetLeg.from_node)} → ${nodeLabel(targetLeg.to_node)}` : ""}`} meta="The preview runs the engine on this device; nothing is recorded until you press Record delay">
            <form onSubmit={record} className="flex flex-wrap items-end gap-4">
              <label className="text-xs text-fg-2">Shipment
                <select value={target?.id} onChange={(e) => setShipmentId(e.target.value)} className={cx(FIELD, "mt-1 block font-mono")}>
                  {seed.shipments.map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
                </select>
              </label>
              <label className="text-xs text-fg-2">New ETA
                <input value={newEtaInput} onChange={(e) => setNewEtaInput(e.target.value)} className="ml-2 h-8 w-24 rounded-md border border-line-ctrl bg-bg px-2 font-mono text-sm text-fg" />
              </label>
              <label className="text-xs text-fg-2">Reason
                <input value={reasonInput} onChange={(e) => setReasonInput(e.target.value)} className="ml-2 h-8 w-56 rounded-md border border-line-ctrl bg-bg px-2 text-sm text-fg" />
              </label>
              {preview?.before && preview.after && (
                <p aria-live="polite" className={cx("basis-full rounded-md px-3 py-2 text-sm", preview.after.state === "RED" ? "bg-bad-tint font-semibold text-bad" : preview.after.state === "AMBER" ? "bg-warn-tint font-semibold text-warn" : "bg-elevated text-fg")}>
                  <span className="text-fg-2">If recorded: </span>
                  {nodeLabel(target!.dest_node_id)} fuel ratio {formatRatio(preview.before.ratio)} → {formatRatio(preview.after.ratio)}, {preview.before.state === preview.after.state ? "stays" : "turns"} {preview.after.state}.
                  {preview.pnr && ` Point of no return ${dayLabel(preview.pnr)}.`}
                </p>
              )}
              {!newEta && <span className="text-xs text-bad">Enter a date like "7 Feb"</span>}
              <Button variant="primary" type="submit" disabled={busy || !newEta}>Record delay</Button>
              <Button variant="ghost" type="button" onClick={() => setEdit(false)}>Cancel</Button>
            </form>
            {error && <p className="mt-2 text-xs text-bad">{error}</p>}
          </Card>
        )}

        {ordered.filter((s) => isOpen(s.id, s.feasible)).map((s) => {
          const ms = ops.milestones.find((x) => x.shipmentId === s.id);
          return <LegTimeline key={s.id} s={s} today={dayLabel(now)} originalEta={view.original[s.id]} milestones={ms && <MilestoneStrip m={ms} />} onCollapse={() => toggle(s.id)} />;
        })}

        {collapsed.length > 0 && (
          <section>
            <SectionHeader title={`${collapsed.length} of ${ordered.length} shipments on track`} />
            <Card pad="none"><ul className="divide-y divide-line">{collapsed.map((s) => <ShipmentRow key={s.id} s={s} onExpand={() => toggle(s.id)} />)}</ul></Card>
          </section>
        )}

        <p className="text-xs text-fg-2">
          When an ETA report is stale or older and slack is 2 d or less, the inbound is uncertain (R17): the band's low side leaves it out. Verify before acting.
        </p>
      </div>
    </Frame>
  );
}
