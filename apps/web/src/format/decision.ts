import { DEVICES } from "@dhruv/seed";
import { roleWords } from "./ledger";
import { formatHaveNeed, formatMargin } from "./margin";
import { formatQty } from "./number";
import { formatRatio } from "./ratio";
import { formatAgeMinutes, formatDate } from "./time";

/**
 * Decision detail text (docs/ui-redesign/CLAUDE.md section 9.3). Everything here phrases or lays
 * out what the engine and the event log already hold: option values, deadlines and states are
 * the engine's; lifecycle comes from the recorded events. Nothing here decides readiness.
 */

type Light = "GREEN" | "AMBER" | "RED";
const DAY_MS = 86_400_000;

const upperFirst = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const joinAnd = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/* ---------- Levers ---------- */

const LEVER_NAME: Record<string, string> = {
  HOLD_VESSEL: "Hold vessel",
  AIRLIFT_PARTIAL: "Partial airlift",
  CONSERVE: "Conserve diesel",
  DEFER_F27: "Defer F-27",
  EVACUATE: "Evacuate the station",
};

/** "Partial airlift" for AIRLIFT_PARTIAL; an unknown code reads as its words ("Load shed"). */
export function leverName(id: string): string {
  return LEVER_NAME[id] ?? upperFirst(id.replace(/_/g, " ").toLowerCase());
}

/** An option's levers as one phrase: "Conserve diesel, defer F-27 and hold vessel". */
export function optionName(levers: string[]): string {
  const names = levers.map(leverName);
  return upperFirst(joinAnd(names.map((n, i) => (i === 0 ? n : n[0]!.toLowerCase() + n.slice(1)))));
}

/** What a lever does, from the engine's lever effect: "+48.0 kL, vessel departs 9 Feb", "saves 8.0 kL". */
export function leverEffect(effect: { addAvailableKl?: number; saveRawKl?: number; burnRateUplift?: number; newDeparture?: string }): string {
  const parts: string[] = [];
  if (effect.addAvailableKl) parts.push(`+${formatQty(effect.addAvailableKl, "kL")}`);
  if (effect.saveRawKl) parts.push(`saves ${formatQty(effect.saveRawKl, "kL")}`);
  if (effect.burnRateUplift) parts.push(`burn ${effect.burnRateUplift > 0 ? "+" : "−"}${Math.round(Math.abs(effect.burnRateUplift) * 100)} %`);
  if (effect.newDeparture) parts.push(`vessel departs ${formatDate(effect.newDeparture)}`);
  return parts.join(", ");
}

/* ---------- Days and deadlines ---------- */

/** Whole days from now to a date, rounded up (the countdown every screen uses). */
export function daysUntil(nowIso: string, iso: string): number {
  return Math.ceil((Date.parse(iso) - Date.parse(nowIso)) / DAY_MS);
}

/** "10 days", "1 day", "today", "2 days ago". */
export function daysText(n: number): string {
  if (n === 0) return "today";
  if (n < 0) return `${-n} day${n === -1 ? "" : "s"} ago`;
  return `${n} day${n === 1 ? "" : "s"}`;
}

/**
 * The header's deadline (the most prominent element): the engine's point of no return, else the
 * top-ranked option's own deadline when no option restores GREEN.
 */
export function deadlineHeadline(input: { now: string; pnr?: { date: string; daysLeft?: number } | null; top?: { label: string; deadline: string } }): { lead?: string; text: string } | undefined {
  const { now, pnr, top } = input;
  if (pnr) return { text: `Decide by ${formatDate(pnr.date)} · ${daysText(pnr.daysLeft ?? daysUntil(now, pnr.date))}` };
  if (top) return { lead: "No option restores GREEN on its own", text: `Act by ${formatDate(top.deadline)} (option ${top.label}) · ${daysText(daysUntil(now, top.deadline))}` };
  return undefined;
}

/* ---------- Lifecycle ---------- */

export type DecisionPhase = "AWAITING" | "EXPIRED" | "APPROVED" | "REJECTED";

/**
 * Where the decision stands, from its recorded status. Expired is not a stored state: an open
 * decision is expired once the point of no return has passed, or, when the proposal has none,
 * once every option's deadline has (the server refuses approvals after an option's deadline).
 */
export function decisionPhase(d: { status: "PROPOSED" | "APPROVED" | "REJECTED"; pnr: string | null; optionDeadlines: (string | undefined)[] }, now: string): DecisionPhase {
  if (d.status !== "PROPOSED") return d.status;
  const t = Date.parse(now);
  if (d.pnr) return t > Date.parse(d.pnr) ? "EXPIRED" : "AWAITING";
  const deadlines = d.optionDeadlines.filter((x): x is string => !!x);
  return deadlines.length > 0 && deadlines.every((x) => t > Date.parse(x)) ? "EXPIRED" : "AWAITING";
}

/** The last date anything could be approved: the PNR, else the latest option deadline. */
export function lastActDate(pnr: string | null, optionDeadlines: (string | undefined)[]): string | undefined {
  return pnr ?? optionDeadlines.filter((x): x is string => !!x).sort().at(-1);
}

/** "Expired: no option was approved before the point of no return, 3 Feb." */
export function expiredText(pnr: string | null, optionDeadlines: (string | undefined)[]): string {
  const last = lastActDate(pnr, optionDeadlines);
  if (!last) return "Expired: no option was approved in time.";
  return pnr ? `Expired: no option was approved before the point of no return, ${formatDate(pnr)}.` : `Expired: no option was approved before the last option deadline, ${formatDate(last)}.`;
}

/* ---------- Who ---------- */

/** Ids that are not a person's device: Director beats and server-written events. */
const NOT_A_DEVICE = new Set<string>([DEVICES.DIRECTOR, DEVICES.SERVER]);

/**
 * "HQ Ops on HQ-WEB-01" when a real device is recorded, else the role alone ("HQ Ops"). Script and
 * server ids (DIRECTOR, SERVER) are never shown as a device.
 */
export function actorLabel(role: string, device?: string): string {
  const who = roleWords(role);
  return device && !NOT_A_DEVICE.has(device) ? `${who} on ${device}` : who;
}

/* ---------- Verify first (R14) ---------- */

export interface VerifyInput {
  /** The input this line is about; lines about the same input share a key. */
  key: string;
  /** "the fuel count (36 h old)" */
  input: string;
}

/** "36 h old", or "just now" for a fresh count. */
const hoursAge = (h: string) => { const a = formatAgeMinutes(Number(h) * 60); return a === "just now" ? a : `${a} old`; };

/**
 * The input an engine verify line is about, in plain words. The engine writes four shapes (R14);
 * anything else is kept as written.
 */
export function parseVerify(text: string, names: Record<string, string> = {}): VerifyInput {
  const name = (id: string) => (names[id] ?? id).toLowerCase();
  let m = text.match(/^(\S+) count is (STALE|CRITICAL) \((\d+(?:\.\d+)?)h old\)$/);
  if (m) return { key: "stock", input: `the ${name(m[1]!)} count (${hoursAge(m[3]!)}, ${m[2]!.toLowerCase()})` };
  m = text.match(/^Fuel count (?:(\d+(?:\.\d+)?)h old|aging) \(band straddles (\w+)\)$/);
  if (m) return { key: "stock", input: m[1] !== undefined ? `the fuel count (${hoursAge(m[1])})` : "the fuel count (aging)" };
  m = text.match(/^Inbound shipment (\S+) has (-?\d+)d slack \((\w+) ETA report\)$/);
  if (m) return { key: `leg:${m[1]}`, input: `the ${m[1]} ETA report (${m[3]!.toLowerCase()}, ${m[2]} d slack)` };
  m = text.match(/^Inbound shipment (\S+) is UNCERTAIN \((\d+(?:\.\d+)?)h old, (-?\d+)d slack\)$/);
  if (m) return { key: `leg:${m[1]}`, input: `the ${m[1]} ETA report (${hoursAge(m[2]!)}, ${m[3]} d slack)` };
  return { key: text, input: text };
}

/** One line per input: the first line for each input wins. */
export function verifyInputs(lines: string[], names: Record<string, string> = {}): VerifyInput[] {
  const seen = new Map<string, VerifyInput>();
  for (const l of lines) {
    const v = parseVerify(l, names);
    if (!seen.has(v.key)) seen.set(v.key, v);
  }
  return [...seen.values()];
}

/** The verify checkbox: "I have verified the fuel count (36 h old) with the station". */
export function verifySentence(lines: string[], names: Record<string, string> = {}): string | undefined {
  const inputs = verifyInputs(lines, names);
  if (inputs.length === 0) return undefined;
  return `I have verified ${joinAnd(inputs.map((i) => i.input))} with the station`;
}

/* ---------- Options comparison ---------- */

/** The facts of one option, from one source only (the live engine, or the recorded proposal). */
export interface OptionFacts {
  label: string;
  levers: string[];
  reachesTarget: boolean;
  ratio: number;
  state: Light;
  available?: number;
  required?: number;
  unit?: string;
  gap?: number;
  deadline?: string;
  bindingLever?: string;
  slackDays: number | null;
  slackLeg?: string;
  cost?: number;
  costUnit?: string;
  straddleText?: string;
  verify: string[];
  effects?: Record<string, string>;
}

export type CellTone = "amber" | "red" | "green";
export interface Cell { text: string; sub?: string; tone?: CellTone; state?: Light; mono?: boolean }
export interface CompareRow { key: string; label: string; cells: Cell[]; differs: boolean }

/** "19.5 lakh INR", "none (comfort and ops impact)". Costs are synthetic (section 13). */
export function costText(cost: number | undefined, unit = ""): string {
  if (cost === undefined) return "unknown";
  if (cost <= 0) return unit && !unit.includes("lakh") ? `None (${unit})` : "None";
  return unit.includes("lakh") ? `${cost.toFixed(1)} lakh INR` : `${(cost / 100000).toFixed(1)} lakh INR`;
}

/** "0 d slack on L2-C104", "No inbound dependency". */
export function slackText(days: number | null, leg?: string): string {
  if (days === null) return "No inbound dependency";
  return `${days} d slack${leg ? ` on ${leg}` : ""}`;
}

const sameCell = (a: Cell, b: Cell) => a.text === b.text && a.sub === b.sub;

/**
 * The comparison table: the same rows in the same order for every option. `differs` marks a row
 * whose cells are not all the same, so it can be emphasised; identical rows can be merged.
 */
export function compareRows(options: OptionFacts[], now: string, names: Record<string, string> = {}): CompareRow[] {
  const row = (key: string, label: string, cell: (o: OptionFacts) => Cell): CompareRow => {
    const cells = options.map(cell);
    return { key, label, cells, differs: cells.some((c) => !sameCell(c, cells[0]!)) };
  };
  return [
    row("restores", "Restores GREEN?", (o) => (o.reachesTarget ? { text: "Restores GREEN", tone: "green" } : { text: "Does not restore GREEN", tone: o.state === "RED" ? "red" : "amber" })),
    row("fuel", "Fuel after", (o) => {
      const margin = o.unit ? formatMargin(o.available, o.required, o.unit) : undefined;
      const gap = !margin && o.gap && o.gap > 0 ? `−${formatQty(o.gap, o.unit ?? "kL")} short` : undefined;
      return { text: margin ?? gap ?? formatRatio(o.ratio), sub: margin || gap ? `ratio ${formatRatio(o.ratio)}` : undefined, state: o.state, mono: true };
    }),
    row("deadline", "Last date to act", (o) => (o.deadline
      ? { text: `${formatDate(o.deadline)} · ${daysText(daysUntil(now, o.deadline))}`, sub: o.bindingLever && o.levers.length > 1 ? `set by ${leverName(o.bindingLever).toLowerCase()}` : undefined, mono: true }
      : { text: "unknown" })),
    row("slack", "Slack", (o) => ({ text: slackText(o.slackDays, o.slackLeg), tone: o.slackDays !== null && o.slackDays <= 0 ? "amber" : undefined })),
    row("cost", "Cost (synthetic)", (o) => ({ text: costText(o.cost, o.costUnit) })),
    row("confidence", "Data confidence", (o) => {
      const inputs = verifyInputs(o.verify, names);
      if (o.straddleText) return { text: upperFirst(o.straddleText), sub: inputs.length ? `Verify before acting: ${joinAnd(inputs.map((i) => i.input))}` : undefined, tone: "amber" };
      if (inputs.length) return { text: "Verify before acting", sub: joinAnd(inputs.map((i) => i.input)), tone: "amber" };
      return { text: "Inputs current" };
    }),
    row("does", "What it does", (o) => ({ text: o.levers.map((l) => (o.effects?.[l] ? `${leverName(l)}: ${o.effects[l]}` : leverName(l))).join("\n") })),
  ];
}

/* ---------- Ranking (R10) ---------- */

export type RankCategory = "RECOMMENDED_TARGET" | "ALTERNATIVE_TARGET" | "PARTIAL_RECOVERY";

const RANK_REASON: Record<RankCategory, string> = {
  RECOMMENDED_TARGET: "Cheapest option that restores GREEN, then fewest levers, then latest deadline.",
  ALTERNATIVE_TARGET: "Restores GREEN with the largest margin at the lowest cost.",
  PARTIAL_RECOVERY: "Closes the most of the fuel gap at the lowest cost; no option restores GREEN on its own.",
};

/**
 * The one-line reason under "Engine ranking 1", from the ranking rule. A recorded proposal has no
 * category; R10 ranks a GREEN-restoring option first whenever one exists, so the first recorded
 * option's category follows from whether it restores GREEN.
 */
export function rankingReason(category: RankCategory | undefined, reachesTarget: boolean): string {
  return RANK_REASON[category ?? (reachesTarget ? "RECOMMENDED_TARGET" : "PARTIAL_RECOVERY")];
}

/* ---------- What happened ---------- */

export interface ChainInput {
  /** The trigger in words ("L2-C104 delayed to 7 Feb"). */
  trigger?: string;
  /** The fuel dimension's trace steps (the engine's own). */
  trace: { rule: string; text: string }[];
  fuel?: { have: number; need: number; unit: string; ratio: number | null; state: Light };
  station: { name: string; state: Light };
  missions: { id: string; status: string }[];
}

const isoDate = /(\d{4}-\d{2}-\d{2})(?:T[\d:.]+Z)?/;

/**
 * A one-line consequence chain from the engine's trace: leg delayed → misses cutoff → cargo
 * excluded → fuel ratio → station state → missions at risk. Steps the trace does not support are
 * left out; nothing is inferred.
 */
export function consequenceChain(c: ChainInput): string[] {
  const out: string[] = [];
  if (c.trigger) out.push(c.trigger);
  const excluded = c.trace.find((t) => t.rule === "R02" && /EXCLUDED/.test(t.text));
  if (excluded) {
    const cutoff = excluded.text.match(new RegExp(`vessel load cutoff ${isoDate.source}`));
    const closing = excluded.text.match(new RegExp(`station closing date ${isoDate.source}`));
    if (cutoff) out.push(`Misses vessel cutoff ${formatDate(cutoff[1]!)}`);
    else if (closing) out.push(`Arrives after station closing ${formatDate(closing[1]!)}`);
    out.push(cutoff ? "Cargo excluded by vessel cutoff" : "Cargo excluded");
  }
  if (c.fuel) out.push(`Fuel ${formatHaveNeed(c.fuel.have, c.fuel.need, c.fuel.unit)} = ${formatRatio(c.fuel.ratio)}, ${c.fuel.state}`);
  out.push(`${c.station.name} ${c.station.state}`);
  const atRisk = c.missions.filter((m) => m.status === "AT_RISK" || m.status === "BLOCKED");
  if (atRisk.length) out.push(`${joinAnd(atRisk.map((m) => m.id))} ${atRisk.some((m) => m.status === "BLOCKED") ? "blocked" : "at risk"}`);
  return out;
}

/** The trigger event in words, for the chain. Falls back to `fallback` for other event types. */
export function triggerPhrase(e: { type: string; payload: Record<string, unknown> } | undefined, names: Record<string, string> = {}, fallback?: string): string | undefined {
  if (!e) return undefined;
  const p = e.payload;
  const s = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : undefined);
  if (e.type === "LEG_DELAYED" && s("leg_id") && s("new_eta")) return `${s("leg_id")} delayed to ${formatDate(s("new_eta")!)}`;
  if (e.type === "VESSEL_UPDATED" && s("vessel_id")) {
    const v = names[s("vessel_id")!] ?? s("vessel_id")!;
    if (s("eta_station")) return `${v} station ETA moves to ${formatDate(s("eta_station")!)}`;
    if (s("departure")) return `${v} departure moves to ${formatDate(s("departure")!)}`;
  }
  return fallback;
}

/* ---------- Follow-ups ---------- */

/**
 * What an approval records, one sentence per follow-up event: "MV Ice Star departure moves to
 * 9 Feb (load cutoff 7 Feb, station ETA 27 Feb)".
 */
export function followUpSentence(e: { type: string; entity_id: string; payload: Record<string, unknown> }, names: Record<string, string> = {}): string {
  const p = e.payload;
  const s = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : undefined);
  if (e.type === "VESSEL_UPDATED") {
    const v = names[s("vessel_id") ?? e.entity_id] ?? s("vessel_id") ?? e.entity_id;
    const rest = [s("load_cutoff") && `load cutoff ${formatDate(s("load_cutoff")!)}`, s("eta_station") && `station ETA ${formatDate(s("eta_station")!)}`].filter(Boolean);
    if (s("departure")) return `${v} departure moves to ${formatDate(s("departure")!)}${rest.length ? ` (${rest.join(", ")})` : ""}`;
    return `${v} updated${rest.length ? `: ${rest.join(", ")}` : ""}`;
  }
  if (e.type === "LEG_UPDATED") {
    const leg = s("leg_id") ?? e.entity_id;
    if (s("eta")) return `Leg ${leg} ETA moves to ${formatDate(s("eta")!)}`;
    return `Leg ${leg} updated`;
  }
  if (e.type === "MISSION_UPDATED") {
    const fields = (p.fields ?? {}) as Record<string, unknown>;
    const id = s("mission_id") ?? e.entity_id;
    if (typeof fields.status === "string") return `Mission ${id} marked ${fields.status.toLowerCase().replace(/_/g, " ")}`;
    return `Mission ${id} updated`;
  }
  return `${e.type.replace(/_/g, " ").toLowerCase()} ${e.entity_id}`;
}

/** Levers that act only inside the engine: "Partial airlift (+12.0 kL) and conserve diesel (saves 8.0 kL) applied to the fuel requirement." */
export function appliedLeversSentence(levers: string[], effects: Record<string, string> = {}): string | undefined {
  if (levers.length === 0) return undefined;
  const parts = levers.map((l, i) => {
    const n = leverName(l);
    const name = i === 0 ? n : n[0]!.toLowerCase() + n.slice(1);
    return effects[l] ? `${name} (${effects[l]})` : name;
  });
  return `${joinAnd(parts)} applied to the fuel calculation.`;
}

/* ---------- Lever timeline axis ---------- */

export interface LeverAxis {
  start: number;
  end: number;
  pct: (iso: string) => number;
  ticks: { iso: string; label: string; pct: number }[];
}

/**
 * The per-lever timeline axis (ISO dates, year-aware): from today (or the earliest date, if
 * earlier) through the latest date, with padding so nothing sits on an edge. Ticks fall on whole
 * days inside the padded range, weekly (daily for short spans, fortnightly for long ones).
 */
export function leverAxis(now: string, dates: (string | undefined)[]): LeverAxis {
  const ts = [Date.parse(now), ...dates.filter((d): d is string => !!d).map((d) => Date.parse(d))].filter(Number.isFinite);
  const lo = Math.min(...ts);
  const hi = Math.max(...ts, lo + 7 * DAY_MS);
  const pad = Math.max(2 * DAY_MS, (hi - lo) * 0.06);
  const start = lo - pad;
  const end = hi + pad;
  const pct = (iso: string) => ((Date.parse(iso) - start) / (end - start)) * 100;
  const spanDays = (end - start) / DAY_MS;
  const step = spanDays <= 12 ? 1 : spanDays <= 70 ? 7 : 14;
  const first = Math.ceil(start / DAY_MS) * DAY_MS;
  const ticks: LeverAxis["ticks"] = [];
  for (let t = first; t <= end; t += step * DAY_MS) {
    const iso = new Date(t).toISOString();
    const p = pct(iso);
    // Keep tick labels clear of both edges so they are never cut.
    if (p >= 4 && p <= 96) ticks.push({ iso, label: formatDate(iso), pct: p });
  }
  return { start, end, pct, ticks };
}

/** Which way a marker label runs from its line, so it stays inside the axis. */
export function markerAlign(pct: number): "start" | "end" {
  return pct > 60 ? "end" : "start";
}
