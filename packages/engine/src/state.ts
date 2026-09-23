export interface InventoryState {
  itemId: string; nodeId: string; stock: number; unit: string;
  reservePct: number; dimension: string; lastObservedAt: string;
}
export interface LegState {
  legId: string; shipmentId: string; status: string;
  eta: string; etd: string | null; vesselId: string | null;
}
export interface VesselState {
  vesselId: string; departure: string; loadCutoff: string;
  etaStation: string; stationClosingDate: string;
}
export interface PersonnelState {
  personId: string; role: string; nodeId: string; status: string;
  lastObservedAt: string;
}
export interface AssetState {
  assetId: string; nodeId: string; type: string; status: string;
  lat: number | null; lon: number | null; lastObservedAt: string;
}
export interface MissionState {
  missionId: string; nodeId: string; fields: Record<string, unknown>;
  status: string;
}
export interface LinkNodeState {
  nodeId: string; status: string; lastContact: string | null;
}
export interface DecisionState {
  decisionId: string; status: string; chosenOptionId: string | null;
  approver: string | null;
}
export interface State {
  asOf: string;
  inventory: Map<string, InventoryState>;
  legs: Map<string, LegState>;
  vessels: Map<string, VesselState>;
  personnel: Map<string, PersonnelState>;
  assets: Map<string, AssetState>;
  missions: Map<string, MissionState>;
  links: Map<string, LinkNodeState>;
  decisions: Map<string, DecisionState>;
}
