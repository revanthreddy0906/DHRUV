import { formatQty } from "./number";

/**
 * Trace display (section 9.2): which group a rule's step belongs to and a short sentence for it,
 * cut from the engine's own text. Numbers are never rewritten; the full engine line stays one
 * click away, verbatim.
 */

export interface EngineStep { rule: string; text: string }

export const RULE_TITLE: Record<string, string> = {
  R01: "Requirement", R02: "Feeder feasibility", R03: "Availability vs requirement", R05: "Role coverage", R06: "Redundancy",
  R07: "Mission impact", R08: "Lever deadline", R09: "Option generation", R10: "Option ranking", R11: "Point of no return",
  R12: "Freshness", R13: "Confidence band", R14: "Verify first", R15: "Station state", R16: "Slip tolerance",
  R17: "Cargo confidence", R18: "Baseline B0", R19: "Food requirement from people on station",
};

export type TraceGroup = "Inputs" | "Calculation" | "Result";
export const TRACE_GROUPS: TraceGroup[] = ["Inputs", "Calculation", "Result"];

const GROUP: Record<string, TraceGroup> = {
  R01: "Inputs", R02: "Inputs", R12: "Inputs", R17: "Inputs",
  R03: "Calculation", R05: "Calculation", R06: "Calculation", R13: "Calculation", R16: "Calculation", R19: "Calculation",
  R07: "Result", R08: "Result", R09: "Result", R10: "Result", R11: "Result", R14: "Result", R15: "Result",
};

export const traceGroup = (rule: string): TraceGroup => GROUP[rule] ?? "Calculation";

/** Steps by group, each group in the engine's own (propagation) order. B0 (R18) is left for the footer. */
export function groupTrace<S extends EngineStep>(steps: S[]): { group: TraceGroup; steps: S[] }[] {
  return TRACE_GROUPS.map((group) => ({ group, steps: steps.filter((s) => s.rule !== "R18" && traceGroup(s.rule) === group) })).filter((g) => g.steps.length > 0);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Drops "[R03] " prefixes and shows ISO dates as "7 Feb" (the only change made to engine text). */
function readable(text: string): string {
  return text
    .replace(/\[R\d+\]\s*/g, "")
    .replace(/(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z)?/g, (_m, y: string, mo: string, d: string, time?: string) =>
      `${Number(d)} ${MONTHS[Number(mo) - 1]}${y !== "2027" ? ` ${y}` : ""}${time && !time.startsWith("T00:00") ? ` ${time.slice(1, 6)}` : ""}`);
}

/**
 * One line for a step: "Availability vs requirement: 140.0 of 132.0 kL = 1.0606, GREEN". The
 * numbers are the engine's characters; `units` (item id → unit) only adds the unit after them.
 */
export function traceSentence(step: EngineStep, units: Record<string, string> = {}): string {
  const title = RULE_TITLE[step.rule] ?? step.rule;
  const text = readable(step.text);
  const unit = Object.entries(units).find(([id]) => text.includes(id))?.[1];
  const u = unit ? ` ${unit}` : "";
  const ratio = text.match(/(-?[\d.]+) \/ (-?[\d.]+) = (-?[\d.]+) (?:->|→) (GREEN|AMBER|RED)/);
  if (step.rule === "R03" && ratio) return `${title}: ${ratio[1]} of ${ratio[2]}${u} = ${ratio[3]}, ${ratio[4]}`;
  const food = text.match(/POB (\d+).*= ([\d.]+); stock ([\d.]+) (?:->|→) ratio ([\d.]+) (?:->|→) (GREEN|AMBER|RED)/);
  if (step.rule === "R19" && food) {
    const fu = u || (Object.keys(units).length === 1 ? ` ${Object.values(units)[0]}` : "");
    return `${title}: POB ${food[1]}, stock ${food[3]} of ${food[2]}${fu} = ${food[4]}, ${food[5]}`;
  }
  const arrow = text.split(/\s(?:->|→)\s/);
  if (arrow.length > 1) return `${title}: ${arrow[arrow.length - 1]!.trim()}`;
  const eq = text.lastIndexOf("= ");
  if (eq >= 0 && step.rule === "R01") return `${title}: ${text.slice(eq + 2).trim()}${u}`;
  const colon = text.indexOf(": ");
  return `${title}: ${colon >= 0 ? text.slice(colon + 2).trim() : text}`;
}

/**
 * The B0 footer line (v2 C8): what a plain stock-table alert would say, next to the engine's view.
 * "A stock-level alert would show nothing here: on-hand stock has not changed."
 */
export function b0Line(b0: { hasAlert: boolean; stock: number; unit: string; rate: number; daysOfCover: number }): string {
  const cover = `${formatQty(b0.stock, b0.unit)} at ${b0.rate} ${b0.unit} a day is ${b0.daysOfCover} days of cover`;
  return b0.hasAlert
    ? `Baseline B0: a stock-level alert fires here (${cover}).`
    : `Baseline B0: ${cover}. A stock-level alert would show nothing here: on-hand stock has not changed.`;
}
