import * as React from "react";
import { ShieldAlert } from "lucide-react";
import { DEFAULT_FUEL_UNCERTAINTIES, fuelRobustness, type UncertainInput } from "@dhruv/engine";
import type { OpEvent, Seed } from "@dhruv/shared";
import { Card, Checkbox, RatioDisplay, SectionHeader, StateBadge, cx } from "../components/primitives";
import { nodeLabel } from "./chrome";
import { dayLabel } from "./describe";

const LABEL: Record<string, { what: string; unit: string; worst: (d: number) => string }> = {
  cold_snap_burn_rate: { what: "Cold snap: burn rate up", unit: "%", worst: (d) => `burn +${d} %` },
  tank_measurement_error: { what: "Tank reading high: stock lower", unit: "%", worst: (d) => `stock −${d} %` },
  feeder_weather_delay: { what: "Feeder arrives later", unit: "days", worst: (d) => `feeder +${d} d` },
};

const choose = (n: number, k: number) => {
  let c = 1;
  for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
  return c;
};

/**
 * Γ-budget robustness on this station's live fuel (engine: fuelRobustness). Γ is how many of the
 * deviations may go wrong at once; each level is the worst case over every such combination, run
 * through the same R01-R03 as the dashboard. Nothing here is written: it is analysis, like what-if.
 */
export function RobustnessPanel({ seed, events, now, node }: { seed: Seed; events: OpEvent[]; now: string; node: string }) {
  const [deviation, setDeviation] = React.useState<Record<string, number>>(() => Object.fromEntries(DEFAULT_FUEL_UNCERTAINTIES.map((u) => [u.name, u.deviation])));
  const [enabled, setEnabled] = React.useState<Record<string, boolean>>(() => Object.fromEntries(DEFAULT_FUEL_UNCERTAINTIES.map((u) => [u.name, true])));
  const [gamma, setGamma] = React.useState(1);

  const uncertainties: UncertainInput[] = DEFAULT_FUEL_UNCERTAINTIES.filter((u) => enabled[u.name]).map((u) => ({ ...u, deviation: Math.max(0, deviation[u.name] ?? 0) }));
  const result = React.useMemo(() => fuelRobustness({ seed, events }, node, now, uncertainties), [seed, events, now, node, JSON.stringify(uncertainties)]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!result) return null;
  const n = result.uncertainties.length;
  const g = Math.min(gamma, n);
  const at = result.curve[g]!;
  const nominal = result.curve[0]!;
  const byName = new Map(result.uncertainties.map((u) => [u.name, u]));
  const describe = (names: string[]) => names.length === 0 ? "nothing goes wrong (nominal)" : names.map((x) => LABEL[x]?.worst(byName.get(x)?.deviation ?? 0) ?? x).join(" + ");

  return (
    <Card>
      <SectionHeader
        title={`Fuel robustness · Γ budget · ${nodeLabel(node)}`}
        meta={<span className="text-[11px] text-fg-2">Deterministic worst case · analysis only, nothing is recorded</span>}
      />
      <p className="mb-3 text-[12px] text-fg-2">
        Γ is how many of the deviations below may go wrong <em>at the same time</em>. For each Γ the engine tries every combination of that size through R01–R03 and keeps the worst fuel ratio. Γ = 0 is today's ratio.
      </p>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-2">
          {DEFAULT_FUEL_UNCERTAINTIES.map((u) => {
            const noFeeder = u.target === "shipmentSlack" && !result.feeder;
            const meta = LABEL[u.name]!;
            return (
              <div key={u.name} className={cx("flex items-center gap-3 rounded-md border border-line px-3 py-2", noFeeder && "opacity-60")}>
                <div className="flex-1">
                  <Checkbox
                    checked={!!enabled[u.name] && !noFeeder}
                    onChange={(v) => setEnabled((s) => ({ ...s, [u.name]: v }))}
                    label={meta.what}
                    description={noFeeder ? "No feasible inbound to delay for this station" : undefined}
                  />
                </div>
                <label className="flex items-center gap-1.5 text-xs text-fg-2">
                  <input
                    aria-label={`${meta.what} (${meta.unit})`}
                    type="number" min={0} step={u.target === "shipmentSlack" ? 1 : 5}
                    value={deviation[u.name]}
                    disabled={noFeeder || !enabled[u.name]}
                    onChange={(e) => setDeviation((s) => ({ ...s, [u.name]: Number(e.target.value) }))}
                    className="h-8 w-16 rounded-md border border-line-ctrl bg-bg px-2 text-right font-mono text-sm text-fg disabled:opacity-50"
                  />
                  {meta.unit}
                </label>
              </div>
            );
          })}
          <p className="text-[11px] text-fg-2">
            Stock {result.stock.toFixed(1)} {result.unit} · feasible inbound {result.inboundQty.toFixed(1)} {result.unit}
            {result.feeder
              ? ` · tightest feeder ${result.feeder.legId} (${result.feeder.shipmentId}) ETA ${dayLabel(result.feeder.eta)}, cut-off ${dayLabel(result.feeder.loadCutoff)}, slack ${result.feeder.slackDays} d. All inbound is treated as riding it.`
              : "."}
          </p>
        </div>

        <div>
          <div role="radiogroup" aria-label="Gamma" className="mb-3 flex items-center gap-2">
            <span className="text-xs text-fg-2">Γ</span>
            {result.curve.map((c) => (
              <button key={c.gamma} type="button" role="radio" aria-checked={c.gamma === g} onClick={() => setGamma(c.gamma)}
                className={cx("h-8 w-9 rounded-md border font-mono text-sm", c.gamma === g ? "border-accent bg-accent-tint text-fg" : "border-line-ctrl text-fg-2 hover:border-line-strong")}>
                {c.gamma}
              </button>
            ))}
            <span className="ml-1 text-[11px] text-fg-2">of {n} · {choose(n, g)} combination{choose(n, g) === 1 ? "" : "s"} checked</span>
          </div>
          <div className="flex items-center gap-3 rounded-md border border-line-strong bg-bg px-3 py-2.5">
            <ShieldAlert size={18} className={at.state === "GREEN" ? "text-ok" : at.state === "AMBER" ? "text-warn" : "text-bad"} aria-hidden />
            <RatioDisplay value={at.ratio.toFixed(4)} state={at.state} size="lg" />
            <StateBadge state={at.state} size="sm" />
            <span className="text-[12px] text-fg-2">worst case at Γ = {g}: {describe(at.bindingInputs)}{g > 0 && ` · nominal ${nominal.ratio.toFixed(4)}`}</span>
          </div>

          <table className="mt-3 w-full text-[12px]">
            <thead className="text-left text-[10px] uppercase tracking-wider text-fg-2">
              <tr><th className="w-10 py-1 font-semibold">Γ</th><th className="w-28 font-semibold">Worst ratio</th><th className="w-24 font-semibold">State</th><th className="font-semibold">What goes wrong</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {result.curve.map((c) => (
                <tr key={c.gamma} className={cx(c.gamma === g && "bg-elevated")}>
                  <td className="py-1.5 font-mono">{c.gamma}</td>
                  <td className="font-mono">{c.ratio.toFixed(4)}</td>
                  <td><StateBadge state={c.state} size="sm" /></td>
                  <td className="text-fg-2">{describe(c.bindingInputs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.leversApplied && (
            <p className="mt-2 text-[11px] text-warn">An approved decision's levers apply to this station: the dashboard ratio ({result.engineRatio.toFixed(4)}) includes them, this analysis does not.</p>
          )}
        </div>
      </div>
    </Card>
  );
}
