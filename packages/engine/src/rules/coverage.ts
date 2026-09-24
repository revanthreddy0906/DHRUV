import type { PersonnelState, AssetState } from "../state.js";

export interface CoverageResult {
  key: string;
  count: number;
  need: number;
  state: "GREEN" | "AMBER" | "RED";
  trace: string;
}

function stateFromCount(count: number, need: number): "GREEN" | "AMBER" | "RED" {
  if (count >= need + 1) return "GREEN";
  if (count >= need) return "AMBER";
  return "RED";
}

// R05: personnel role coverage. A person counts if status is ON_STATION or FIELD.
export function computePersonnelCoverage(
  personnel: PersonnelState[],
  role: string,
  need: number,
): CoverageResult {
  const count = personnel.filter(
    (p) => p.role === role && (p.status === "ON_STATION" || p.status === "FIELD"),
  ).length;
  const state = stateFromCount(count, need);
  return {
    key: role, count, need, state,
    trace: `[R05] ${role} coverage: ${count} available, need ${need} -> ${state}`,
  };
}

// R06: asset redundancy (generators, comms), same threshold pattern as R05.
// An asset counts if status is OK.
export function computeAssetRedundancy(
  assets: AssetState[],
  type: string,
  need: number,
  label: string,
): CoverageResult {
  const count = assets.filter((a) => a.type === type && a.status === "OK").length;
  const state = stateFromCount(count, need);
  return {
    key: label, count, need, state,
    trace: `[R06] ${label} redundancy: ${count} OK, need ${need} -> ${state}`,
  };
}
