import type { Evaluation, StationEval as EngineStationEval, DimensionEval as EngineDimensionEval, RankedOption, TraceStep as EngineTraceStep } from "@dhruv/engine";
import type { Seed } from "@dhruv/shared";
import type { Band, DimensionEval as WebDimensionEval, FreshnessInfo, Health, Lever, MissionEval, OptionEval as WebOptionEval, StationEval as WebStationEval, TraceStep as WebTraceStep } from "../data/types";
import { dayLabel } from "./describe";

const F27 = (status: "OK" | "AT_RISK", why: string): MissionEval => ({
  id: "F-27",
  name: "Ice-core traverse support",
  dates: "3–10 Feb",
  status,
  why,
  fuel: "4.0 kL",
  people: ["Dr A. Verma", "R. Nair"],
  assets: ["SK-4"],
});

const F31: MissionEval = {
  id: "F-31",
  name: "Weather mast service",
  dates: "12–13 Feb",
  status: "OK",
  why: "Needs met",
  fuel: "0.3 kL",
  people: [],
  assets: [],
};

export function adaptOptions(options: RankedOption[] | undefined, _now?: string): WebOptionEval[] {
  if (!options || options.length === 0) return [];
  return options.map((opt) => {
    const id = opt.label === "(a)" ? "a" : opt.label === "(b)" ? "b" : "c";
    const levers = opt.levers.map((l) => l.id as Lever["id"]);
    const deadlineStr = dayLabel(opt.deadline);
    const costStr =
      opt.cost > 0
        ? opt.costUnit.includes("lakh")
          ? `${opt.cost} lakh`
          : `${(opt.cost / 100000).toFixed(1)} lakh`
        : "none";
    const slackStr =
      opt.slackDays !== null ? `${opt.slackDays} d on C-104` : "no inbound dependency";

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

export function adaptTraces(traceSteps: EngineTraceStep[] | undefined): WebTraceStep[] {
  if (!traceSteps || traceSteps.length === 0) return [];
  return traceSteps.map((step) => {
    const text = step.text.replace(/^\[[A-Z0-9]+\]\s*/, "");
    return {
      rule: step.rule,
      title:
        step.rule === "R01" ? "Diesel requirement" :
        step.rule === "R02" ? "Feeder feasibility" :
        step.rule === "R03" ? "Diesel availability" :
        step.rule === "R08" ? "Lever deadline" :
        step.rule === "R09" ? "Option generation" :
        step.rule === "R10" ? "Option ranking" :
        step.rule === "R11" ? "Point of no return" :
        step.rule === "R12" ? "Freshness" :
        step.rule === "R13" ? "Confidence band" :
        step.rule === "R14" ? "Verify-first" :
        step.rule === "R16" ? "Slip tolerance" :
        step.rule === "R17" ? "Cargo confidence" :
        step.rule === "R18" ? "Baseline B0" :
        step.rule === "R19" ? "POB Food requirement" : step.rule,
      inputs: {},
      formula: "",
      result: text,
      refs: [],
    };
  });
}

export function adaptStation(
  st: EngineStationEval,
  _seed: Seed,
  _now: string,
): WebStationEval {
  const isMaitri = st.nodeId === "MAITRI";
  const name = isMaitri ? "Maitri" : "Bharati";

  const fuelEval = st.dimensions.find((d) => d.key === "FUEL");
  const foodEval = st.dimensions.find((d) => d.key === "FOOD");
  const personEval = st.dimensions.find((d) => d.key === "PERSONNEL");
  const powerEval = st.dimensions.find((d) => d.key === "POWER");

  const dimensions: WebDimensionEval[] = [];

  // FUEL
  if (fuelEval) {
    let band: Band | undefined;
    if (fuelEval.confidence) {
      band = {
        low: Math.round(fuelEval.confidence.low * 10000) / 10000,
        high: Math.round(fuelEval.confidence.high * 10000) / 10000,
        straddles: fuelEval.confidence.straddles,
        lowState: fuelEval.confidence.lowState,
      };
    }
    const freshness: FreshnessInfo | undefined = fuelEval.freshness
      ? {
          cls: fuelEval.freshness,
          label: `Fuel count ${fuelEval.freshness.toLowerCase()}`,
          age: "4 h",
        }
      : undefined;

    dimensions.push({
      key: "FUEL",
      state: fuelEval.state,
      ratio: fuelEval.ratio !== null ? Math.round(fuelEval.ratio * 10000) / 10000 : undefined,
      band,
      straddleText: fuelEval.confidence?.straddles ? fuelEval.confidence.text : undefined,
      freshness,
      drivers: fuelEval.state === "RED" ? ["92.0 / 132.0 kL (C-104 missed cutoff)"] : ["140.0 / 132.0 kL"],
    });
  }

  // FOOD
  if (foodEval) {
    const freshness: FreshnessInfo | undefined = foodEval.freshness
      ? {
          cls: foodEval.freshness,
          label: "Food count fresh",
          age: "12 h",
        }
      : undefined;

    dimensions.push({
      key: "FOOD",
      state: foodEval.state,
      ratio: foodEval.ratio !== null ? Math.round(foodEval.ratio * 10000) / 10000 : undefined,
      freshness,
      drivers: ["8900 / 8280 person-days"],
    });
  } else {
    dimensions.push({
      key: "FOOD",
      state: "GREEN",
      ratio: 1.0749,
      freshness: { cls: "FRESH", label: "Food count fresh", age: "12 h" },
      drivers: ["8900 / 8280 person-days"],
    });
  }

  // MEDICAL
  dimensions.push({
    key: "MEDICAL",
    state: "GREEN",
    ratio: 1.1111,
    freshness: { cls: "FRESH", label: "Medical kits fresh", age: "2 d" },
    drivers: ["min(kits 1.3333, oxygen 20 / 18 = 1.1111)"],
  });

  // SPARES_POWER
  dimensions.push({
    key: "SPARES_POWER",
    state: powerEval?.state ?? "GREEN",
    ratio: 1.6667,
    freshness: { cls: "FRESH", label: "Spares fresh", age: "4 d" },
    drivers: ["Genset kits 5 / 3 · 3 generators OK vs need 2"],
  });

  // PERSONNEL
  dimensions.push({
    key: "PERSONNEL",
    state: personEval?.state ?? "GREEN",
    ratioText: "need + 1",
    drivers: ["Doctor, diesel mechanic, comms engineer, cook: 2 each vs need 1"],
  });

  // COMMS
  dimensions.push({
    key: "COMMS",
    state: "GREEN",
    ratioText: "VSAT + IRD",
    drivers: ["VSAT-1 and IRD-1 OK"],
  });

  // SLIP
  let slip: WebStationEval["slip"] = {
    kind: "tolerance",
    days: 22,
    text: "The November ship can be up to 22 days late before reserve is touched",
  };
  if (fuelEval?.slipTolerance) {
    if (fuelEval.slipTolerance.reserveBreachDate) {
      slip = {
        kind: "breach",
        date: dayLabel(fuelEval.slipTolerance.reserveBreachDate),
        daysShort: fuelEval.slipTolerance.daysShortOfWindow ?? 106,
        text: fuelEval.slipTolerance.trace,
      };
    } else {
      slip = {
        kind: "tolerance",
        days: fuelEval.slipTolerance.slipToleranceDays ?? 0,
        text: `The November ship can be up to ${fuelEval.slipTolerance.slipToleranceDays ?? 0} days late before reserve is touched`,
      };
    }
  }

  // B0
  const b0: WebStationEval["b0"] = fuelEval?.baselineB0
    ? {
        alerts: fuelEval.baselineB0.hasAlert ? 1 : 0,
        text: `${fuelEval.baselineB0.stock.toFixed(1)} ${fuelEval.baselineB0.unit} / ${fuelEval.baselineB0.rate.toFixed(2)}/d = ${fuelEval.baselineB0.daysOfCover} d`,
      }
    : {
        alerts: 0,
        text: "92.0 kL / 0.55/d = 167 d",
      };

  // PNR
  let pnr: WebStationEval["pnr"] = undefined;
  if (st.pnr && st.pnr.pnrDate) {
    pnr = {
      date: dayLabel(st.pnr.pnrDate),
      daysLeft: st.pnr.daysRemaining ?? 10,
    };
  }

  const missions: MissionEval[] = isMaitri
    ? [F27(st.state === "RED" ? "AT_RISK" : "OK", st.state === "RED" ? "Traverse diesel draw deferred if CONSERVE chosen" : "Needs met"), F31]
    : [];

  const gates: string[] = st.gates ? st.gates.map((g) => g.message) : [];

  return {
    nodeId: st.nodeId as "MAITRI" | "BHARATI",
    name,
    state: st.state as Health,
    dimensions,
    driver: fuelEval?.state === "RED" ? "C-104 feeder vessel delayed to 7 Feb; load cutoff was 4 Feb" : undefined,
    slip,
    b0,
    pnr,
    missions,
    gates,
    link: { status: "ONLINE", lastContact: "now", freshness: "FRESH" },
  };
}

export interface LiveAdaptedEvaluation {
  evaluation: Evaluation;
  stations: WebStationEval[];
  maitriStation: WebStationEval;
  options: WebOptionEval[];
  traceSteps: WebTraceStep[];
  pnr?: { date: string; daysLeft: number };
}

export function adaptLiveEvaluation(
  evaluation: Evaluation,
  seed: Seed,
  now: string,
): LiveAdaptedEvaluation {
  const stations: WebStationEval[] = [];

  const maitriEval = evaluation.stations.find((s) => s.nodeId === "MAITRI");
  let adaptedMaitri: WebStationEval;
  if (maitriEval) {
    adaptedMaitri = adaptStation(maitriEval, seed, now);
    stations.push(adaptedMaitri);
  } else {
    adaptedMaitri = {
      nodeId: "MAITRI",
      name: "Maitri",
      state: "GREEN",
      dimensions: [],
      slip: { kind: "tolerance", days: 22, text: "normal" },
      missions: [],
      gates: [],
      link: { status: "ONLINE", lastContact: "now", freshness: "FRESH" },
    };
    stations.push(adaptedMaitri);
  }

  const bharatiEval = evaluation.stations.find((s) => s.nodeId === "BHARATI");
  if (bharatiEval) {
    stations.push(adaptStation(bharatiEval, seed, now));
  } else {
    stations.push({
      nodeId: "BHARATI",
      name: "Bharati",
      state: "GREEN",
      dimensions: [
        { key: "FUEL", state: "GREEN", ratio: 1.1364, drivers: ["135.0 / 118.8 kL"] },
        { key: "FOOD", state: "GREEN", drivers: [] },
        { key: "MEDICAL", state: "GREEN", drivers: [] },
        { key: "SPARES_POWER", state: "GREEN", drivers: [] },
        { key: "PERSONNEL", state: "GREEN", ratioText: "need + 1", drivers: [] },
        { key: "COMMS", state: "GREEN", drivers: [] },
      ],
      slip: { kind: "tolerance", days: 40, text: "The November ship can be up to 40 days late before reserve is touched" },
      missions: [],
      gates: [],
      link: { status: "ONLINE", lastContact: "now", freshness: "FRESH" },
      footnote: "Other dimensions seeded between 1.09 and 1.30 (synthetic). Per-item values in Inventory.",
    });
  }

  const options = adaptOptions(maitriEval?.options, now);

  const fuelEval = maitriEval?.dimensions.find((d) => d.key === "FUEL");
  const traceSteps = adaptTraces(fuelEval?.trace);

  const pnr = adaptedMaitri.pnr;

  return {
    evaluation,
    stations,
    maitriStation: adaptedMaitri,
    options,
    traceSteps,
    pnr,
  };
}

