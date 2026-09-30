import { config } from "@dhruv/shared";
import type { MissionState, PersonnelState, AssetState } from "../state.js";

export interface MissionImpactResult {
  missionId: string;
  status: "OK" | "AT_RISK" | "BLOCKED" | "DEFERRED";
  why: string;
  trace: string;
}

export interface MissionNeeds {
  fuelItemId: string | null;
  /** Diesel the mission draws (kL). Draws under config.season.missionFuelMaterialKl are not put at risk. */
  fuelKl?: number;
  personIds: string[];
  assetIds: string[];
}

// R07: a mission with a RED fuel dependency is AT_RISK. A mission whose
// needed person is not ON_STATION/FIELD, or needed asset is not OK,
// is BLOCKED. BLOCKED takes priority over AT_RISK if both apply, since
// a missing person/asset is a harder stop than a fuel-margin concern.
export function computeMissionImpact(
  mission: MissionState,
  needs: MissionNeeds,
  fuelState: "GREEN" | "AMBER" | "RED" | null,
  personnel: Map<string, PersonnelState>,
  assets: Map<string, AssetState>,
): MissionImpactResult {
  if (mission.status === "DEFERRED") {
    return {
      missionId: mission.missionId, status: "DEFERRED", why: "deferred by an approved decision",
      trace: `[R07] ${mission.missionId}: DEFERRED`,
    };
  }
  for (const personId of needs.personIds) {
    const p = personnel.get(personId);
    if (!p || (p.status !== "ON_STATION" && p.status !== "FIELD")) {
      return {
        missionId: mission.missionId, status: "BLOCKED",
        why: `required person ${personId} is not available (status: ${p?.status ?? "unknown"})`,
        trace: `[R07] ${mission.missionId}: BLOCKED - person ${personId} unavailable`,
      };
    }
  }
  for (const assetId of needs.assetIds) {
    const a = assets.get(assetId);
    if (!a || a.status !== "OK") {
      return {
        missionId: mission.missionId, status: "BLOCKED",
        why: `required asset ${assetId} is not OK (status: ${a?.status ?? "unknown"})`,
        trace: `[R07] ${mission.missionId}: BLOCKED - asset ${assetId} not OK`,
      };
    }
  }
  const material = (needs.fuelKl ?? Infinity) >= config.season.missionFuelMaterialKl;
  if (needs.fuelItemId && fuelState === "RED" && material) {
    return {
      missionId: mission.missionId, status: "AT_RISK",
      why: `depends on ${needs.fuelItemId}, which is RED`,
      trace: `[R07] ${mission.missionId}: AT_RISK - fuel dependency is RED`,
    };
  }
  return {
    missionId: mission.missionId, status: "OK", why: "no blocking dependency",
    trace: `[R07] ${mission.missionId}: OK`,
  };
}
