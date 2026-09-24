import type { LegState, VesselState } from "../state.js";

export interface FeasibilityResult {
  feasible: boolean;
  slackDays: number | null;
  reason: string;
  trace: string;
}

export function checkFeasibility(leg: LegState, vessel: VesselState | undefined): FeasibilityResult {
  if (!vessel) {
    return { feasible: false, slackDays: null, reason: "no vessel assigned", trace: `[R02] ${leg.legId}: no vessel assigned, excluded` };
  }
  const legEta = new Date(leg.eta).getTime();
  const loadCutoff = new Date(vessel.loadCutoff).getTime();
  const legMakesCutoff = legEta <= loadCutoff;
  const vesselEta = new Date(vessel.etaStation).getTime();
  const closing = new Date(vessel.stationClosingDate).getTime();
  const vesselMakesClosing = vesselEta <= closing;
  const feasible = legMakesCutoff && vesselMakesClosing;
  const slackDays = legMakesCutoff ? (loadCutoff - legEta) / 86400000 : null;
  const reason = !legMakesCutoff
    ? `leg ETA ${leg.eta} is after vessel load cutoff ${vessel.loadCutoff} (window cliff)`
    : !vesselMakesClosing
    ? `vessel ETA ${vessel.etaStation} is after station closing date ${vessel.stationClosingDate}`
    : "feasible";
  return {
    feasible, slackDays, reason,
    trace: `[R02] ${leg.legId}: ${feasible ? "feasible" : "EXCLUDED"} - ${reason}`,
  };
}
