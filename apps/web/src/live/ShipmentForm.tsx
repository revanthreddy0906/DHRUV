import * as React from "react";
import { STATION_NODES } from "@dhruv/seed";
import type { PayloadOf, Seed } from "@dhruv/shared";
import { Button, Card, Checkbox, FIELD } from "../components/primitives";
import { nodeLabel } from "./chrome";
import { dayLabel } from "./describe";
import { parseEtaInput } from "./format";
import { WriteFeedback, useEventWriter } from "./writeStatus";

type Priority = PayloadOf<"SHIPMENT_CREATED">["priority"];

export interface ShipmentInput {
  id: string;
  name: string;
  priority: Priority;
  dest: string;
  /** Feeder leg Mumbai → Cape Town ETA, as typed ("30 Jan"). */
  feederEta: string;
  /** The shipment is loaded on the season's vessel at Cape Town for the last leg. */
  onVessel: boolean;
  itemId: string;
  qty: string;
}

/** The next free "C-<n>" after every shipment this device knows. */
export function nextShipmentId(seed: Seed): string {
  const n = Math.max(100, ...seed.shipments.map((s) => Number(/^C-(\d+)$/.exec(s.id)?.[1] ?? 0)));
  return `C-${n + 1}`;
}

/** Field errors and, when there are none, the SHIPMENT_CREATED payload (legs follow the seed's pattern). */
export function buildShipment(
  input: ShipmentInput,
  seed: Seed,
  vessel?: { id: string; departure: string; etaStation: string },
): { errors: Partial<Record<keyof ShipmentInput, string>>; payload?: PayloadOf<"SHIPMENT_CREATED"> } {
  const errors: Partial<Record<keyof ShipmentInput, string>> = {};
  const id = input.id.trim();
  if (!/^C-\d+$/.test(id)) errors.id = 'Use the form "C-120"';
  else if (seed.shipments.some((s) => s.id === id)) errors.id = `${id} already exists`;
  if (!input.name.trim()) errors.name = "Describe the contents";
  const eta = parseEtaInput(input.feederEta);
  if (!eta) errors.feederEta = 'Enter a date like "30 Jan"';
  const qty = Number(input.qty);
  if (input.itemId && (input.qty.trim() === "" || !Number.isFinite(qty) || qty <= 0)) errors.qty = "Quantity must be greater than 0";
  if (input.onVessel && !vessel) errors.onVessel = "No vessel in this season";
  if (Object.keys(errors).length > 0 || !eta) return { errors };

  const legKey = id.replace("-", "");
  const legs: PayloadOf<"SHIPMENT_CREATED">["legs"] = [
    { leg_id: `L2-${legKey}`, seq: 2, from_node: "MUMBAI", to_node: "CAPE_TOWN", etd: null, eta, vessel_id: null },
  ];
  if (input.onVessel && vessel) {
    legs.push({ leg_id: `L3-${legKey}`, seq: 3, from_node: "CAPE_TOWN", to_node: input.dest, etd: vessel.departure, eta: vessel.etaStation, vessel_id: vessel.id });
  }
  return {
    errors,
    payload: {
      shipment_id: id,
      name: input.name.trim(),
      priority: input.priority,
      dest_node_id: input.dest,
      legs,
      cargo: input.itemId ? [{ inventory_item_id: input.itemId, qty }] : [],
    },
  };
}

const field = FIELD;

/**
 * HQ Ops creates an inbound shipment: one SHIPMENT_CREATED event through device.write(). The list
 * below and the destination's inbound stock pick it up from the event log (withCreatedShipments).
 */
export interface VesselOption { id: string; name: string; departure: string; etaStation: string; loadCutoff: string }

export function ShipmentForm({ seed, vessels, onDone }: { seed: Seed; vessels: VesselOption[]; onDone: () => void }) {
  const [vesselId, setVesselId] = React.useState(vessels[0]?.id);
  const vessel = vessels.find((v) => v.id === vesselId) ?? vessels[0];
  const [input, setInput] = React.useState<ShipmentInput>(() => ({
    id: nextShipmentId(seed), name: "", priority: "HIGH", dest: STATION_NODES[0]!, feederEta: "30 Jan", onVessel: true, itemId: "", qty: "",
  }));
  const [touched, setTouched] = React.useState(false);
  const { busy, error, last, submit } = useEventWriter();
  const set = <K extends keyof ShipmentInput>(k: K, v: ShipmentInput[K]) => setInput((s) => ({ ...s, [k]: v }));

  const items = seed.inventory_items.filter((i) => i.node_id === input.dest);
  const unit = items.find((i) => i.id === input.itemId)?.unit;
  const { errors, payload } = buildShipment(input, seed, vessel);
  const err = (k: keyof ShipmentInput) => (touched && errors[k] ? <span className="mt-1 block text-xs text-bad">{errors[k]}</span> : null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (busy || !payload) return;
    const ok = await submit(
      { type: "SHIPMENT_CREATED", entity_type: "shipment", entity_id: payload.shipment_id, node_id: "HQ", payload },
      `${payload.shipment_id} to ${nodeLabel(payload.dest_node_id)}`,
    );
    if (ok) {
      setTouched(false);
      setInput((s) => ({ ...s, id: `C-${Number(s.id.slice(2)) + 1}`, name: "", itemId: "", qty: "" }));
    }
  };

  return (
    <Card heading="New shipment" meta="Recorded by HQ Ops">
      <form onSubmit={onSubmit} noValidate className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] items-start gap-4">
        <label className="text-xs text-fg-2">Shipment id
          <input aria-label="Shipment id" value={input.id} onChange={(e) => set("id", e.target.value)} className={`${field} mt-1 block w-full font-mono`} />{err("id")}
        </label>
        <label className="col-span-2 text-xs text-fg-2">Contents
          <input aria-label="Contents" value={input.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Diesel 20 kL (ISO tank)" className={`${field} mt-1 block w-full`} />{err("name")}
        </label>
        <label className="text-xs text-fg-2">Priority
          <select aria-label="Priority" value={input.priority} onChange={(e) => set("priority", e.target.value as Priority)} className={`${field} mt-1 block w-full`}>
            {(["CRITICAL", "HIGH", "NORMAL"] as const).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="text-xs text-fg-2">Destination
          <select aria-label="Destination" value={input.dest} onChange={(e) => setInput((s) => ({ ...s, dest: e.target.value, itemId: "" }))} className={`${field} mt-1 block w-full`}>
            {STATION_NODES.map((n) => <option key={n} value={n}>{nodeLabel(n)}</option>)}
          </select>
        </label>
        <label className="text-xs text-fg-2">Feeder ETA (Mumbai → Cape Town)
          <input aria-label="Feeder ETA" value={input.feederEta} onChange={(e) => set("feederEta", e.target.value)} className={`${field} mt-1 block w-full font-mono`} />{err("feederEta")}
        </label>
        <label className="text-xs text-fg-2">Cargo line (optional)
          <select aria-label="Cargo item" value={input.itemId} onChange={(e) => set("itemId", e.target.value)} className={`${field} mt-1 block w-full`}>
            <option value="">— none —</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.id})</option>)}
          </select>
        </label>
        {input.itemId && (
          <label className="text-xs text-fg-2">Quantity{unit ? ` (${unit})` : ""}
            <input aria-label="Cargo quantity" inputMode="decimal" value={input.qty} onChange={(e) => set("qty", e.target.value)} className={`${field} mt-1 block w-full font-mono`} />{err("qty")}
          </label>
        )}
        <div className="col-span-2">
          <Checkbox
            checked={input.onVessel}
            onChange={(v) => set("onVessel", v)}
            label={vessel ? (vessels.length > 1 ? "Loads on a vessel at Cape Town" : `Loads on ${vessel.name} at Cape Town`) : "Loads on the season vessel"}
            description={vessel ? `Cut-off ${dayLabel(vessel.loadCutoff)} · departs ${dayLabel(vessel.departure)} · arrives ${dayLabel(vessel.etaStation)}. Cargo counts as inbound only if the feeder reaches Cape Town by the cut-off (R02).` : undefined}
          />
          {err("onVessel")}
          {vessels.length > 1 && input.onVessel && (
            <select aria-label="Vessel" value={vessel?.id} onChange={(e) => setVesselId(e.target.value)} className={`${field} ml-6 mt-2 block w-72`}>
              {vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          )}
        </div>
        <div className="col-span-full flex gap-2">
          <Button variant="primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Create shipment"}</Button>
          <Button variant="ghost" type="button" onClick={onDone}>Close</Button>
        </div>
      </form>
      <div className="mt-3"><WriteFeedback event={last?.event} summary={last?.summary} error={error} /></div>
    </Card>
  );
}
