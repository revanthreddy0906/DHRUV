import type { DimensionEval, DimensionItem, StationEval } from "@dhruv/engine";
import { formatHaveNeed, formatMargin } from "./margin";
import { formatQty } from "./number";
import { formatRatio } from "./ratio";
import { formatDate } from "./time";

/**
 * Sentences built from evaluate() output (sections 3.4 and 8). They choose and phrase what the
 * engine returned; they never decide a state. Every state below is the engine's own.
 */

type Light = "GREEN" | "AMBER" | "RED";
const RANK: Record<Light, number> = { RED: 0, AMBER: 1, GREEN: 2 };

export const DIMENSION_LABEL: Record<string, string> = {
  FUEL: "Fuel", FOOD: "Food", MEDICAL: "Medical", POWER: "Spares and power", PERSONNEL: "Personnel", COMMS: "Comms",
};
const ROLE_LABEL: Record<string, string> = { DOCTOR: "Doctor", DIESEL_MECHANIC: "Diesel mechanic", COMMS_ENGINEER: "Comms engineer", COOK: "Cook" };

const STOCK_UNITS = new Set(["kL", "person-days", "kits", "cylinders"]);
const isStock = (i: DimensionItem) => STOCK_UNITS.has(i.unit);
const lowest = (r: number | null) => (r === null ? Infinity : r);

/**
 * The line behind a dimension that sets its state: worst state, then stock lines before coverage
 * counts (the dimension's ratio is its stock ratio), then the lowest ratio.
 */
export function drivingItem(d: DimensionEval): DimensionItem | undefined {
  const stockFirst = (i: DimensionItem) => (isStock(i) ? 0 : 1);
  return [...(d.items ?? [])].sort((a, b) => RANK[a.state] - RANK[b.state] || stockFirst(a) - stockFirst(b) || lowest(a.ratio) - lowest(b.ratio))[0];
}

/**
 * The dimension that drives a station's state (the engine's station state is its worst dimension):
 * worst state first, then the lowest ratio, then the engine's own order.
 */
export function drivingDimension(st: StationEval): DimensionEval | undefined {
  const ratioOf = (d: DimensionEval) => lowest(d.ratio ?? drivingItem(d)?.ratio ?? null);
  return st.dimensions
    .map((d, i) => ({ d, i }))
    .sort((a, b) => RANK[a.d.state] - RANK[b.d.state] || ratioOf(a.d) - ratioOf(b.d) || a.i - b.i)[0]?.d;
}

const itemName = (d: DimensionEval, i: DimensionItem) =>
  d.key === "PERSONNEL" ? (ROLE_LABEL[i.id] ?? i.label) : i.unit === "running" ? "Generators" : (d.items?.length ?? 0) > 1 ? i.label : DIMENSION_LABEL[d.key] ?? d.key;

/** True when the engine's R02 says the dimension's inbound misses the vessel cutoff. */
const cutoffExcluded = (d: DimensionEval) => d.trace.some((t) => t.rule === "R02" && /EXCLUDED|misses/i.test(t.text));

/**
 * The headline value for a dimension (section 9.1): the margin for stock dimensions, coverage
 * for Personnel, the units for Comms, else the ratio.
 */
export function dimensionHeadline(d: DimensionEval): string {
  const i = drivingItem(d);
  if (i && isStock(i)) return formatMargin(i.have, i.need, i.unit) ?? formatRatio(d.ratio);
  if (d.key === "PERSONNEL" && i) return `${itemName(d, i)} ${i.have} of need ${i.need}`;
  if (d.key === "COMMS" && i) return d.state === "GREEN" ? "VSAT + IRD" : `${i.have} of need ${i.need} units`;
  if (i?.unit === "running") return `${i.have} running, need ${i.need}`;
  return formatRatio(d.ratio);
}

/** One plain sentence for a dimension: "Food below requirement: 3 of 8,280 person-days." */
export function dimensionReason(d: DimensionEval): string {
  const i = drivingItem(d);
  if (!i) return d.state === "GREEN" ? "Within thresholds." : `${DIMENSION_LABEL[d.key] ?? d.key} ${d.state}.`;
  const name = itemName(d, i);
  if (isStock(i)) {
    const amount = formatHaveNeed(i.have, i.need, i.unit);
    const head = d.state === "RED" ? `${name} below requirement` : d.state === "AMBER" ? `${name} close to requirement` : `${name} within requirement`;
    return `${head}: ${amount}.${d.state !== "GREEN" && d.key === "FUEL" && cutoffExcluded(d) ? " Cargo excluded by vessel cutoff." : ""}`;
  }
  const cover = d.key === "PERSONNEL" ? `${i.have} of need ${i.need}` : `${i.have} ${i.unit === "running" ? "running" : "units OK"}, need ${i.need}`;
  if (d.state === "RED") return `${name} below need: ${cover}.`;
  if (d.state === "AMBER") return `${name} at need with no spare: ${cover}.`;
  return `${name} covered: ${cover}.`;
}

/** Short form for the status line: "fuel short 40.0 kL", "doctor below need". */
function shortReason(d: DimensionEval): string {
  const i = drivingItem(d);
  const name = (i ? itemName(d, i) : DIMENSION_LABEL[d.key] ?? d.key).toLowerCase();
  if (i && isStock(i)) return i.have < i.need ? `${name} short ${formatQty(i.need - i.have, i.unit)}` : `${name} close to requirement`;
  return d.state === "RED" ? `${name} below need` : `${name} at need with no spare`;
}

/** Stations table reason (section 8): the driving dimension, or the GREEN line with slip tolerance. */
export function stationReason(st: StationEval): string {
  if (st.state === "GREEN") {
    const tol = st.dimensions.find((d) => d.key === "FUEL")?.slipTolerance;
    const base = `All ${st.dimensions.length} dimensions within thresholds`;
    return tol && !tol.reserveBreachDate && tol.slipToleranceDays !== undefined ? `${base} · slip tolerance ${tol.slipToleranceDays} d` : base;
  }
  const d = drivingDimension(st);
  return d ? dimensionReason(d) : `${st.state}.`;
}

/**
 * The all-clear ("No active decisions. All monitored stations are within their thresholds.") is
 * true only when no decision is pending and the engine has every station GREEN, from the same
 * evaluation the stations table shows.
 */
export function isAllClear(stations: StationEval[], pendingDecisions: number): boolean {
  return pendingDecisions === 0 && stations.length > 0 && stations.every((s) => s.state === "GREEN");
}

export const ALL_CLEAR = "No active decisions. All monitored stations are within their thresholds.";

/**
 * The Command status line: what is wrong and what must be decided by when, or that nothing is.
 * "Maitri is RED: fuel short 40.0 kL. 1 decision due by 3 Feb." /
 * "All stations within thresholds. Next vessel cutoff 4 Feb."
 */
export function statusLine({ stations, names, decisionDeadlines, nextCutoff, now }: {
  stations: StationEval[];
  names: Record<string, string>;
  /** One entry per pending decision: its point of no return, if it has one. */
  decisionDeadlines: (string | undefined)[];
  nextCutoff?: string;
  now: string;
}): string {
  const out: string[] = [];
  const off = stations.filter((s) => s.state !== "GREEN").sort((a, b) => RANK[a.state] - RANK[b.state]);
  if (off.length === 0) out.push(stations.length > 1 ? "All stations within thresholds." : "Station within thresholds.");
  for (const s of off.slice(0, 2)) {
    const d = drivingDimension(s);
    out.push(`${names[s.nodeId] ?? s.nodeId} is ${s.state}${d ? `: ${shortReason(d)}` : ""}.`);
  }
  if (off.length > 2) out.push(`${off.length - 2} more ${off.length - 2 === 1 ? "station" : "stations"} not GREEN.`);
  const n = decisionDeadlines.length;
  if (n > 0) {
    const first = decisionDeadlines.filter((x): x is string => !!x).sort()[0];
    out.push(`${n} ${n === 1 ? "decision" : "decisions"} ${first ? `due by ${formatDate(first)}` : "waiting"}.`);
  }
  if (off.length === 0 && n === 0 && nextCutoff && nextCutoff > now) out.push(`Next vessel cutoff ${formatDate(nextCutoff)}.`);
  return out.join(" ");
}
