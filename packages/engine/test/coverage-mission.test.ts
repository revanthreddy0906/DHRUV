import { describe, expect, it } from "vitest";
import { computeAssetRedundancy, computePersonnelCoverage } from "../src/rules/coverage.js";
import { computeMissionImpact, type MissionNeeds } from "../src/rules/mission.js";
import type { AssetState, MissionState, PersonnelState } from "../src/state.js";

const AT = "2027-01-24T04:00:00.000Z";

function person(personId: string, role: string, status: string): PersonnelState {
  return { personId, role, nodeId: "MAITRI", status, lastObservedAt: AT };
}

function asset(assetId: string, type: string, status: string): AssetState {
  return { assetId, nodeId: "MAITRI", status, lat: null, lon: null, lastObservedAt: AT, type };
}

const f27: MissionState = { missionId: "F-27", nodeId: "MAITRI", fields: {}, status: "PLANNED" };
const f27Needs: MissionNeeds = { fuelItemId: "INV-DSL", personIds: ["P-VERMA", "P-NAIR"], assetIds: ["SK-4"] };

function missionPeople(): Map<string, PersonnelState> {
  return new Map([
    ["P-VERMA", person("P-VERMA", "GLACIOLOGIST", "ON_STATION")],
    ["P-NAIR", person("P-NAIR", "FIELD_GUIDE", "FIELD")],
  ]);
}

describe("R05-R07 rules", () => {
  it("R05: doctor coverage GREEN with 2, AMBER with 1, RED with 0", () => {
    const two = [person("P-MENON", "DOCTOR", "ON_STATION"), person("P-SHAH", "DOCTOR", "ON_STATION")];
    const one = [person("P-MENON", "DOCTOR", "UNAVAILABLE"), person("P-SHAH", "DOCTOR", "ON_STATION")];
    const zero = [person("P-RAO", "STATION_LEADER", "ON_STATION")];

    expect(computePersonnelCoverage(two, "DOCTOR", 1).state).toBe("GREEN");
    expect(computePersonnelCoverage(one, "DOCTOR", 1).state).toBe("AMBER");
    expect(computePersonnelCoverage(zero, "DOCTOR", 1).state).toBe("RED");
  });

  it("R06: generator redundancy GREEN with 3 OK, RED with 1 OK", () => {
    const allOk = [asset("GEN-1", "GENERATOR", "OK"), asset("GEN-2", "GENERATOR", "OK"), asset("GEN-3", "GENERATOR", "OK")];
    const oneOk = [asset("GEN-1", "GENERATOR", "OK"), asset("GEN-2", "GENERATOR", "DOWN"), asset("GEN-3", "GENERATOR", "DOWN")];

    expect(computeAssetRedundancy(allOk, "GENERATOR", 2, "generators").state).toBe("GREEN");
    expect(computeAssetRedundancy(oneOk, "GENERATOR", 2, "generators").state).toBe("RED");
  });

  it("R07: mission BLOCKED when required asset is DOWN, even if fuel is GREEN", () => {
    const assets = new Map([["SK-4", asset("SK-4", "SKIDOO", "DOWN")]]);
    expect(computeMissionImpact(f27, f27Needs, "GREEN", missionPeople(), assets).status).toBe("BLOCKED");
  });

  it("R07: mission AT_RISK when fuel is RED and all people/assets available", () => {
    const assets = new Map([["SK-4", asset("SK-4", "SKIDOO", "OK")]]);
    expect(computeMissionImpact(f27, f27Needs, "RED", missionPeople(), assets).status).toBe("AT_RISK");
  });

  it("R07: mission OK when fuel is GREEN and all needs satisfied", () => {
    const assets = new Map([["SK-4", asset("SK-4", "SKIDOO", "OK")]]);
    expect(computeMissionImpact(f27, f27Needs, "GREEN", missionPeople(), assets).status).toBe("OK");
  });
});
