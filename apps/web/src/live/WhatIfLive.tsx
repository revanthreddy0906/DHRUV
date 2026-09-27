import * as React from "react";
import { FlaskConical, X } from "lucide-react";
import { evaluate } from "@dhruv/engine";
import type { OpEvent } from "@dhruv/shared";
import { BeforeAfter } from "../components/whatif";
import { Button, SectionHeader, StateBadge, RatioDisplay, cx } from "../components/primitives";
import { readable } from "./adapter";
import { dayLabel } from "./describe";
import { nodeLabel } from "./chrome";
import type { LiveOps } from "./ops";

type Scenario = "burn" | "delay";
const SCENARIOS: { id: Scenario; label: string; input: string }[] = [
  { id: "burn", label: "Diesel burn changes", input: "BURN_RATE_CHANGED" },
  { id: "delay", label: "Inbound diesel slips", input: "LEG_DELAYED" },
];

/**
 * What-if (section 7): the same evaluate() on this device's events plus one hypothetical event.
 * The overlay lives only in this drawer; nothing is written to the log or sent anywhere.
 */
export function LiveWhatIfDrawer({ ops, role, onClose }: { ops: LiveOps; role: string; onClose: () => void }) {
  const [scenario, setScenario] = React.useState<Scenario>("burn");
  const [burnPct, setBurnPct] = React.useState(15);
  const [delayDays, setDelayDays] = React.useState(5);
  const { seed, events, now } = ops;
  const node = ops.maitriStation.nodeId;
  const diesel = seed.inventory_items.find((i) => i.node_id === node && i.dimension === "FUEL");
  const cargo = diesel && seed.cargo_items.find((c) => c.inventory_item_id === diesel.id);
  const feeder = cargo && seed.legs.filter((l) => l.shipment_id === cargo.shipment_id && !l.vessel_id && l.status !== "DONE").sort((a, b) => b.seq - a.seq)[0];

  const result = React.useMemo(() => {
    if (!diesel) return null;
    const base = { event_id: "whatif-overlay", device_id: "WHATIF", seq: 0, observed_at: now, created_at_client: now, actor_role: "HQ_OPS", schema_version: 1, priority: 2 };
    let overlay: OpEvent | null = null;
    let assumption = "";
    if (scenario === "burn") {
      overlay = { ...base, type: "BURN_RATE_CHANGED", entity_type: "inventory_item", entity_id: diesel.id, node_id: node, payload: { item_id: diesel.id, phase: "WINTER", uplift_pct: burnPct } } as OpEvent;
      assumption = `${nodeLabel(node)} diesel burn ${burnPct >= 0 ? "+" : ""}${burnPct} % for the rest of the season`;
    } else if (feeder) {
      const current = ops.evaluation && events.filter((e) => e.type === "LEG_DELAYED" && (e.payload as { leg_id?: string }).leg_id === feeder.id).map((e) => (e.payload as { new_eta: string }).new_eta).sort().at(-1);
      const eta = new Date(Date.parse(current ?? feeder.eta) + delayDays * 86_400_000).toISOString();
      overlay = { ...base, type: "LEG_DELAYED", entity_type: "leg", entity_id: feeder.id, node_id: "HQ", payload: { leg_id: feeder.id, new_eta: eta, reason: "what-if" } } as OpEvent;
      assumption = `${cargo!.shipment_id} feeder reaches Cape Town ${delayDays} d later (${dayLabel(eta)})`;
    }
    if (!overlay) return null;
    const station = (evs: OpEvent[]) => evaluate({ seed, events: evs }, now).stations.find((s) => s.nodeId === node);
    const before = station(events);
    const after = station([...events, overlay]);
    return { assumption, before, after, fuelBefore: before?.dimensions.find((d) => d.key === "FUEL"), fuelAfter: after?.dimensions.find((d) => d.key === "FUEL") };
  }, [scenario, burnPct, delayDays, seed, events, now, node, diesel, feeder, cargo, ops.evaluation]);

  const sub = (d: typeof result extends null ? never : NonNullable<typeof result>["fuelAfter"]) => {
    const i = d?.items?.[0];
    const tol = d?.slipTolerance;
    return `${i ? `${i.have.toFixed(1)} / ${i.need.toFixed(1)} ${i.unit}` : ""}${tol ? ` · ${tol.reserveBreachDate ? `reserve breach ${dayLabel(tol.reserveBreachDate)}` : `slip tolerance ${tol.slipToleranceDays} d`}` : ""}`;
  };
  const r4 = (n: number | null | undefined) => Math.round((n ?? 0) * 10000) / 10000;

  return (
    <aside role="dialog" aria-label="What-if" className="absolute inset-y-0 right-0 z-40 flex w-[480px] flex-col border-l-2 border-accent bg-surface shadow-drawer">
      <header className="flex items-center gap-2 border-b border-line px-5 py-4">
        <FlaskConical size={17} className="text-accent" aria-hidden />
        <h2 className="flex-1 text-base font-semibold">What-if · {nodeLabel(node)}</h2>
        <span className="rounded border border-accent/60 px-1.5 font-mono text-[10px] font-bold tracking-widest text-accent">SIMULATION</span>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-fg-2 hover:bg-elevated"><X size={16} /></button>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
        <div role="radiogroup" aria-label="Scenario" className="grid grid-cols-2 gap-1.5">
          {SCENARIOS.map((s) => (
            <button key={s.id} role="radio" aria-checked={scenario === s.id} type="button" onClick={() => setScenario(s.id)} disabled={s.id === "delay" && !feeder}
              className={cx("rounded-lg border p-2 text-left disabled:opacity-40", scenario === s.id ? "border-accent bg-accent-tint" : "border-line hover:border-line-strong")}>
              <div className="text-[12px] font-semibold text-fg">{s.label}</div>
              <div className="font-mono text-[10px] text-fg-2">{s.input} · overlay</div>
            </button>
          ))}
        </div>
        {scenario === "burn" ? (
          <label className="block text-[12px] text-fg-2">
            <span className="flex justify-between"><span>Burn rate change</span><span className="font-mono font-semibold text-fg">{burnPct >= 0 ? "+" : ""}{burnPct} %</span></span>
            <input type="range" min={-20} max={30} value={burnPct} onChange={(e) => setBurnPct(Number(e.target.value))} aria-label="Burn rate change percent" className="mt-1 w-full accent-accent" />
          </label>
        ) : (
          <label className="block text-[12px] text-fg-2">
            <span className="flex justify-between"><span>Feeder delay</span><span className="font-mono font-semibold text-fg">+{delayDays} d</span></span>
            <input type="range" min={1} max={20} value={delayDays} onChange={(e) => setDelayDays(Number(e.target.value))} aria-label="Feeder delay days" className="mt-1 w-full accent-accent" />
          </label>
        )}
        {result?.fuelBefore && result.fuelAfter ? (
          <>
            <p className="rounded-md border border-line bg-bg px-3 py-2 text-[12px] text-fg"><span className="font-semibold">Changed assumption:</span> {result.assumption}</p>
            <SectionHeader title="Fuel · before and after" />
            <BeforeAfter before={{ state: result.fuelBefore.state, ratio: r4(result.fuelBefore.ratio), sub: sub(result.fuelBefore) }} after={{ state: result.fuelAfter.state, ratio: r4(result.fuelAfter.ratio), sub: sub(result.fuelAfter) }} />
            <p className="font-mono text-[11px] text-fg-2">{readable(result.fuelAfter.trace.find((t) => t.rule === "R03")?.text ?? "")}</p>
            <SectionHeader title="Options that still work" />
            {(result.after?.options ?? []).length === 0 ? (
              <p className="text-[12px] text-fg-2">{result.fuelAfter.state === "GREEN" ? "Fuel stays GREEN: no options needed." : "No lever combination is still available."}</p>
            ) : (
              result.after!.options!.map((o) => (
                <div key={o.id} className="rounded-lg border border-line p-3">
                  <div className="flex items-center gap-2"><span className="font-mono text-[11px] text-fg">{o.label} {o.leverIds.join(" + ")}</span><StateBadge state={o.state} size="sm" className="ml-auto" /><RatioDisplay value={r4(o.ratio)} state={o.state === "GREEN" ? undefined : o.state} /></div>
                  <p className="mt-1 font-mono text-[10.5px] text-fg-2">act by {dayLabel(o.deadline)}{o.gap > 0 ? ` · ${o.gap.toFixed(1)} kL short` : ""}</p>
                </div>
              ))
            )}
            <p className="text-[12px] text-fg-2">
              <span className="font-semibold text-fg">PNR:</span> {result.after?.pnr?.pnrDate ? dayLabel(result.after.pnr.pnrDate) : "none"}.{" "}
              <span className="font-semibold text-fg">Missions:</span> {(result.after?.missions ?? []).map((m) => `${m.missionId} ${m.status}`).join(", ") || "none"}.
            </p>
          </>
        ) : (
          <p className="text-[12px] text-fg-2">This station has no diesel line to simulate.</p>
        )}
      </div>
      <footer className="flex gap-2 border-t border-line px-5 py-3">
        <Button variant="primary" disabledReason={role === "FIELD_LEAD" ? "Field Leads cannot propose decisions" : "Proposals are recorded by the server's engine, not from a simulation"}>Apply as proposal</Button>
        <Button onClick={onClose}>Discard</Button>
        <span className="ml-auto self-center text-[11px] text-fg-2">Overlay is never written to the log</span>
      </footer>
    </aside>
  );
}
