import type { DecisionOptionView } from "@dhruv/store";
import type { Evaluation, StationEval as EngineStationEval, DimensionEval as EngineDimensionEval, RankedOption, TraceStep as EngineTraceStep } from "@dhruv/engine";
import type { Seed } from "@dhruv/shared";
import type { Band, DimensionEval as WebDimensionEval, FreshnessInfo, Health, Lever, MissionEval, OptionEval as WebOptionEval, StationEval as WebStationEval, TraceStep as WebTraceStep } from "../data/types";
import type { InventoryView } from "../data/demo";
import { dayLabel } from "./describe";
import { formatAge, formatShort } from "./format";

/** "19.5 lakh" for a synthetic cost (section 13 costs are in lakh INR). */
export function formatCost(cost: number, costUnit: string): string {
  if (cost <= 0) return "none";
  return costUnit.includes("lakh") ? `${cost} lakh` : `${(cost / 100000).toFixed(1)} lakh`;
}

/** Slack on the inbound the option depends on, or that it has none (v2 C4). */
export function formatSlack(slackDays: number | null, leg = "C-104"): string {
  return slackDays !== null ? `${slackDays} d on ${leg}` : "no inbound dependency";
}

export function adaptOptions(options: RankedOption[] | undefined, _now?: string): WebOptionEval[] {
  if (!options || options.length === 0) return [];
  return options.map((opt) => {
    const id = opt.label === "(a)" ? "a" : opt.label === "(b)" ? "b" : "c";
    const levers = opt.levers.map((l) => l.id as Lever["id"]);
    const deadlineStr = dayLabel(opt.deadline);
    const costStr = formatCost(opt.cost, opt.costUnit);
    const slackStr = formatSlack(opt.slackDays);

    let band: Band | undefined;
    if (opt.confidenceBand) {
      band = {
        low: Math.round(opt.confidenceBand.low * 10000) / 10000,
        high: Math.round(opt.confidenceBand.high * 10000) / 10000,
        straddles: opt.confidenceBand.straddles,
        lowState: opt.confidenceBand.lowState,
      };
    }

    return {
      id,
      levers,
      resultingRatio: Math.round(opt.ratio * 10000) / 10000,
      resultingState: opt.state,
      residualGap: opt.gap > 0 ? Math.round(opt.gap * 10) / 10 : undefined,
      deadline: deadlineStr,
      bindingLever: opt.bindingLeverId as Lever["id"],
      slack: slackStr,
      cost: costStr,
      band,
      straddleText: opt.confidenceBand?.straddles ? opt.confidenceBand.text : undefined,
      requiresVerify: opt.requiresVerify ?? [],
      reachesTarget: opt.reachesTarget,
    };
  });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Engine text for people: "[R13] " prefixes dropped (also nested ones), ISO dates as "7 Feb". */
export function readable(text: string): string {
  return text
    .replace(/\[R\d+\]\s*/g, "")
    .replace(/(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z)?/g, (_m, y: string, mo: string, d: string, time?: string) =>
      `${Number(d)} ${MONTHS[Number(mo) - 1]}${y !== "2027" ? ` ${y}` : ""}${time && !time.startsWith("T00:00") ? ` ${time.slice(1, 6)}` : ""}`);
}

export function adaptTraces(traceSteps: EngineTraceStep[] | undefined): WebTraceStep[] {
  if (!traceSteps || traceSteps.length === 0) return [];
  return traceSteps.map((step) => {
    const text = readable(step.text);
    return {
      rule: step.rule,
      title:
        step.rule === "R01" ? "Requirement" :
        step.rule === "R02" ? "Feeder feasibility" :
        step.rule === "R03" ? "Availability" :
        step.rule === "R05" ? "Role coverage" :
        step.rule === "R06" ? "Redundancy" :
        step.rule === "R07" ? "Mission impact" :
        step.rule === "R08" ? "Lever deadline" :
        step.rule === "R09" ? "Option generation" :
        step.rule === "R10" ? "Option ranking" :
        step.rule === "R11" ? "Point of no return" :
        step.rule === "R12" ? "Freshness" :
        step.rule === "R13" ? "Confidence band" :
        step.rule === "R14" ? "Verify-first" :
        step.rule === "R15" ? "Station state" :
        step.rule === "R16" ? "Slip tolerance" :
        step.rule === "R17" ? "Cargo confidence" :
        step.rule === "R18" ? "Baseline B0" :
        step.rule === "R19" ? "Food requirement (POB)" : step.rule,
      inputs: {},
      formula: "",
      result: text,
      refs: [],
    };
  });
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const qty = (n: number, unit: string) => (unit === "kL" ? n.toFixed(1) : String(Math.round(n * 100) / 100));

const DIM_KEY: Record<string, WebDimensionEval["key"]> = { FUEL: "FUEL", FOOD: "FOOD", MEDICAL: "MEDICAL", POWER: "SPARES_POWER", PERSONNEL: "PERSONNEL", COMMS: "COMMS" };
const DIM_NOUN: Record<string, string> = { FUEL: "Fuel count", FOOD: "Food count", MEDICAL: "Medical count", POWER: "Genset kit count", PERSONNEL: "Roster", COMMS: "Comms status" };
const ROLE_LABEL: Record<string, string> = { DOCTOR: "Doctor", DIESEL_MECHANIC: "Diesel mechanic", COMMS_ENGINEER: "Comms engineer", COOK: "Cook" };

function bandOf(c: EngineDimensionEval["confidence"]): Band | undefined {
  return c ? { low: r4(c.low), high: r4(c.high), straddles: c.straddles, lowState: c.lowState } : undefined;
}

function freshnessOf(d: EngineDimensionEval, now: string): FreshnessInfo | undefined {
  if (!d.freshness || !d.observedAt) return undefined;
  const age = formatAge(d.observedAt, now);
  return { cls: d.freshness, label: `${DIM_NOUN[d.key] ?? d.key} ${age} old`, age };
}

/** One line per dimension, from the engine's per-item lines: what drives the ratio or state. */
function driversOf(d: EngineDimensionEval, st: EngineStationEval): string[] {
  const items = d.items ?? [];
  if (d.key === "FUEL") {
    const i = items[0];
    if (!i) return [];
    const excluded = d.trace.filter((t) => t.rule === "R02" && /EXCLUDED|infeasible|NOT feasible|misses/i.test(t.text)).length > 0;
    const inbound = (i.inbound ?? 0) > 0 ? `(${qty(i.stock ?? 0, i.unit)} + ${qty(i.inbound!, i.unit)})` : qty(i.stock ?? i.have, i.unit);
    const applied = st.appliedLevers?.length ? ` · approved: ${st.appliedLevers.join(", ")}` : "";
    return [`${inbound} / ${qty(i.need, i.unit)} ${i.unit}${excluded ? " · inbound misses vessel cutoff" : ""}${applied}`];
  }
  if (d.key === "FOOD") return items.map((i) => `${qty(i.have, i.unit)} / ${qty(i.need, i.unit)} ${i.unit}${d.foodRequirement ? ` · POB ${d.foodRequirement.pob}` : ""}`);
  if (d.key === "PERSONNEL") return [items.map((i) => `${ROLE_LABEL[i.id] ?? i.id} ${i.have}/${i.need}`).join(" · ")];
  if (d.key === "COMMS") return items.map((i) => `${i.have} units OK vs need ${i.need}`);
  // MEDICAL, POWER: every line with its ratio, the lowest drives the dimension.
  return [items.map((i) => (i.unit === "running" ? `${i.have} generators OK vs need ${i.need}` : `${i.label} ${qty(i.have, i.unit)} / ${qty(i.need, i.unit)}`)).join(" · ")];
}

function missionsOf(st: EngineStationEval, seed: Seed): MissionEval[] {
  const names = new Map(seed.personnel.map((p) => [p.id, p.name]));
  return (st.missions ?? []).map((m) => {
    const s = seed.missions.find((x) => x.id === m.missionId);
    let needs: { people?: string[]; assets?: string[] } = {};
    try { needs = JSON.parse(s?.needs ?? "{}"); } catch { needs = {}; }
    const dates = s ? `${dayLabel(s.start_date).split(" ")[0]}–${dayLabel(s.end_date)}` : "";
    const why = m.status === "OK" ? "Needs met" : m.status === "AT_RISK" ? `Draws ${s?.fuel_kl.toFixed(1)} kL diesel while Fuel is RED` : m.why[0]!.toUpperCase() + m.why.slice(1);
    return {
      id: m.missionId,
      name: s?.name ?? m.missionId,
      dates,
      status: m.status,
      why,
      fuel: s ? `${s.fuel_kl.toFixed(1)} kL` : "",
      people: (needs.people ?? []).map((p) => names.get(p) ?? p),
      assets: needs.assets ?? [],
    };
  });
}

/**
 * `resupply` names the next resupply in the slip line ("20 Nov 2027" style); omitted, the fixed
 * season's wording stays ("the 20 Nov resupply", "The November ship").
 */
export function adaptStation(st: EngineStationEval, seed: Seed, now: string, resupply?: string): WebStationEval {
  const name = seed.nodes.find((n) => n.id === st.nodeId)?.name ?? st.nodeId;
  const fuelEval = st.dimensions.find((d) => d.key === "FUEL");

  const dimensions: WebDimensionEval[] = st.dimensions
    .filter((d) => DIM_KEY[d.key])
    .map((d) => ({
      key: DIM_KEY[d.key]!,
      state: d.state,
      ratio: d.ratio !== null && Number.isFinite(d.ratio) ? r4(d.ratio) : undefined,
      ratioText: d.ratio === null ? (d.key === "COMMS" ? "VSAT + IRD" : "need + 1") : undefined,
      band: d.key === "FUEL" ? bandOf(d.confidence) : undefined,
      straddleText: d.key === "FUEL" && d.confidence?.straddles ? d.confidence.text : undefined,
      freshness: freshnessOf(d, now),
      drivers: driversOf(d, st),
    }));

  const tol = fuelEval?.slipTolerance;
  const slip: WebStationEval["slip"] = tol?.reserveBreachDate
    ? { kind: "breach", date: dayLabel(tol.reserveBreachDate), daysShort: tol.daysShortOfWindow ?? 0, text: `Reserve is breached on ${dayLabel(tol.reserveBreachDate)}, ${tol.daysShortOfWindow ?? 0} days before the ${resupply ? `next resupply on ${resupply}` : "20 Nov resupply"}` }
    : { kind: "tolerance", days: tol?.slipToleranceDays ?? 0, text: `${resupply ? `The relief ship due ${resupply}` : "The November ship"} can be up to ${tol?.slipToleranceDays ?? 0} days late before reserve is touched` };

  const b0 = fuelEval?.baselineB0;
  const worst = st.dimensions.find((d) => d.state === st.state && d.state !== "GREEN");
  const r02 = fuelEval?.trace.find((t) => t.rule === "R02" && /EXCLUDED|infeasible|NOT feasible|misses/i.test(t.text));

  return {
    nodeId: st.nodeId as WebStationEval["nodeId"],
    name,
    state: st.state as Health,
    dimensions,
    driver: worst ? (worst.key === "FUEL" && r02 ? readable(r02.text) : driversOf(worst, st)[0]) : undefined,
    slip,
    b0: b0 ? { alerts: b0.hasAlert ? 1 : 0, text: `B0 stock alert: ${b0.hasAlert ? "1 alert" : "none"} · ${b0.stock.toFixed(1)} ${b0.unit} / ${b0.rate.toFixed(2)}/d = ${b0.daysOfCover} d of cover` } : undefined,
    pnr: st.pnr?.pnrDate ? { date: dayLabel(st.pnr.pnrDate), daysLeft: st.pnr.daysRemaining ?? 0 } : undefined,
    missions: missionsOf(st, seed),
    gates: st.gates ? st.gates.map((g) => g.message) : [],
    link: { status: "ONLINE", lastContact: "now", freshness: "FRESH" },
  };
}

/** Inventory rows for a station, from the engine's per-item lines (R01-R03, R19). */
export function inventoryRows(st: EngineStationEval | undefined, seed: Seed, now: string): InventoryView[] {
  if (!st) return [];
  const rows: InventoryView[] = [];
  for (const d of st.dimensions) {
    for (const i of d.items ?? []) {
      if (i.stock === undefined) continue;
      const seedItem = seed.inventory_items.find((x) => x.id === i.id);
      const cargo = seed.cargo_items.filter((c) => c.inventory_item_id === i.id).map((c) => c.shipment_id).join(", ");
      const profile = seed.consumption_profiles.find((p) => p.item_id === i.id && p.phase === "CLOSING");
      const rate = profile?.rate_per_day;
      const counted = i.observedAt ?? seedItem?.last_counted ?? now;
      const fresh = d.key === "FUEL" || d.key === "FOOD" ? d.freshness : (d.freshness ?? "FRESH");
      rows.push({
        id: i.id,
        name: i.label,
        unit: i.unit,
        stock: qty(i.stock, i.unit),
        inbound: (i.inbound ?? 0) > 0 ? `${qty(i.inbound!, i.unit)}${cargo ? ` (${cargo})` : ""}` : cargo ? `0 (${cargo} excluded)` : "—",
        requirement: qty(i.need, i.unit),
        reserve: `${Math.round((i.reservePct ?? 0) * 100)} %`,
        ratio: i.ratio !== null ? r4(i.ratio) : 0,
        state: i.state,
        cover: rate && d.key === "FUEL" ? `${Math.floor(i.stock / rate)} d at ${rate}` : d.foodRequirement ? `${Math.floor(i.stock / Math.max(1, d.foodRequirement.pob))} d at ${d.foodRequirement.pob} people` : undefined,
        freshness: { cls: fresh ?? "FRESH", age: formatAge(counted, now), counted: formatShort(counted) },
        breakdown: d.trace.filter((t) => (t.rule === "R01" || t.rule === "R19") && t.text.includes(d.key === "FOOD" ? "Food" : i.id)).map((t) => ({ phase: t.rule, calc: readable(t.text), value: "" })),
      });
    }
  }
  return rows;
}

/** R05 role coverage with the people behind each role. */
export function roleRows(st: EngineStationEval | undefined, seed: Seed) {
  const people = st?.dimensions.find((d) => d.key === "PERSONNEL")?.items ?? [];
  return people.map((i) => ({
    role: ROLE_LABEL[i.id] ?? i.id,
    have: i.have,
    need: i.need,
    state: i.state,
    names: seed.personnel.filter((p) => p.role === i.id && p.node_id === st?.nodeId).map((p) => p.name),
  }));
}

/** Levers of a station with their windows (R08), as the Decision screen lists them. */
export function leverViews(st: EngineStationEval | undefined, now: string): Lever[] {
  return (st?.levers ?? []).map((l) => {
    const e = l.effect;
    const effect = e.addAvailableKl ? `+${e.addAvailableKl} kL available` : e.saveRawKl ? `saves ${e.saveRawKl} kL` : "";
    return {
      id: l.id as Lever["id"],
      label: l.label,
      effect: effect + (e.newDeparture ? ` · departs ${dayLabel(e.newDeparture)}` : ""),
      cutoff: dayLabel(l.cutoff),
      leadDays: l.leadDays,
      deadline: dayLabel(l.deadline),
      daysLeft: Math.ceil((Date.parse(l.deadline) - Date.parse(now)) / 86_400_000),
      cost: l.costAmount ? formatCost(l.costAmount, l.costUnit ?? "") : (l.costUnit ?? "none"),
      sideEffects: l.costAmount ? [] : l.costUnit ? [l.costUnit] : [],
    };
  });
}

export interface LiveAdaptedEvaluation {
  evaluation: Evaluation;
  stations: WebStationEval[];
  maitriStation: WebStationEval;
  options: WebOptionEval[];
  traceSteps: WebTraceStep[];
  pnr?: { date: string; daysLeft: number };
}

/** Every station the engine evaluated; nothing is filled in for a station it did not. */
export function adaptLiveEvaluation(evaluation: Evaluation, seed: Seed, now: string, focus = "MAITRI", resupply?: string): LiveAdaptedEvaluation {
  const stations = evaluation.stations.map((s) => adaptStation(s, seed, now, resupply));
  const focusEval = evaluation.stations.find((s) => s.nodeId === focus) ?? evaluation.stations[0];
  const maitriStation = stations.find((s) => s.nodeId === focusEval?.nodeId) ?? stations[0]!;
  return {
    evaluation,
    stations,
    maitriStation,
    options: adaptOptions(focusEval?.options, now),
    traceSteps: adaptTraces(focusEval?.dimensions.find((d) => d.key === "FUEL")?.trace),
    pnr: maitriStation?.pnr,
  };
}

/** A recorded option in the screen's shape, with the live engine's band and verify flags on top. */
export function adaptRecordedOption(r: DecisionOptionView, index: number, live: WebOptionEval | undefined): WebOptionEval {
  return {
    id: (r.label?.replace(/[()]/g, "") || String.fromCharCode(97 + index)) as WebOptionEval["id"],
    levers: r.levers as WebOptionEval["levers"],
    resultingRatio: Math.round(r.ratio! * 10000) / 10000,
    resultingState: r.state!,
    residualGap: r.gap !== undefined && r.gap > 0 ? Math.round(r.gap * 10) / 10 : undefined,
    deadline: r.deadline ? dayLabel(r.deadline) : "no deadline",
    bindingLever: r.bindingLever as WebOptionEval["bindingLever"],
    slack: formatSlack(r.slackDays ?? null),
    cost: r.cost !== undefined ? formatCost(r.cost, r.costUnit ?? "") : "unknown",
    band: live?.band,
    straddleText: live?.straddleText,
    requiresVerify: [...new Set([...r.requiresVerify, ...(live?.requiresVerify ?? [])])],
    reachesTarget: r.reachesTarget ?? r.state === "GREEN",
  };
}
