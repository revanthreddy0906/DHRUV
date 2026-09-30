import type { InventoryState, LegState, VesselState } from "../state.js";
import type { Seed } from "@dhruv/shared";
import type { PhaseBoundaries, RequirementResult } from "../rules/requirement.js";
import type { FeasibilityResult } from "../rules/feasibility.js";
import type { AvailabilityResult } from "../rules/availability.js";

/** Target calculation parameter being perturbed. */
export type UncertaintyTarget =
  | "burnRate"
  | "stockCount"
  | "shipmentSlack";

/** Unit of deviation: percentage of nominal or absolute value. */
export type DeviationUnit =
  | "percent"
  | "absolute";

/** Direction of the adverse deviation. */
export type AdverseDirection =
  | "increase"
  | "decrease";

/** Clean TypeScript definition for a discrete uncertain input. */
export interface UncertainInput {
  /** Unique human-readable identifier (e.g., 'fuel_burn_rate'). */
  name: string;
  /** Identifies which calculation input is being perturbed. */
  target: UncertaintyTarget;
  /** Nominal value around which the uncertainty is defined. */
  nominal: number;
  /** Maximum adverse deviation. */
  deviation: number;
  /** Deviation unit: percent or absolute. */
  unit: DeviationUnit;
  /** Whether the adverse case increases or decreases the nominal value. */
  adverseDirection: AdverseDirection;
}

/** Complete input structure required for the deterministic R01/R02/R03 evaluation. */
export interface RobustnessBaseInputs {
  /** The inventory state for the item under evaluation (holds stock, reservePct, burnUplift, rateOverrides). */
  item: InventoryState;
  /** Consumption profiles across mission phases. */
  consumptionProfiles: Seed["consumption_profiles"];
  /** Evaluation timestamp as an ISO string. */
  now: string;
  /** Phase boundaries (start/end ISO dates per phase). */
  phaseBoundaries: PhaseBoundaries;
  /** Inbound feeder leg for feasibility check (R02), if any. */
  inboundLeg?: LegState;
  /** Assigned vessel for cutoff and closing check (R02), if any. */
  vessel?: VesselState;
  /** Nominal cargo quantity arriving on this shipment. */
  inboundCargoQty?: number;
}

/** Result of executing the exact deterministic R01/R02/R03 engine. */
export interface DeterministicEvaluationResult {
  requirement: RequirementResult;
  feasibility?: FeasibilityResult;
  inboundQty: number;
  availability: AvailabilityResult;
  ratio: number;
  state: "GREEN" | "AMBER" | "RED";
}

/** Result for a discrete Gamma budget level. */
export interface GammaEvaluationResult {
  gamma: number;
  ratio: number;
  state: "GREEN" | "AMBER" | "RED";
  bindingInputs: string[];
  nominalRatio?: number;
  nominalState?: "GREEN" | "AMBER" | "RED";
  worstAvailability?: number;
  worstRequirement?: number;
}

/** Internal representation of an evaluated scenario combination. */
export interface EvaluatedScenario {
  combo: readonly UncertainInput[];
  bindingInputs: string[];
  bindingKey: string;
  result: DeterministicEvaluationResult;
  ratio: number;
  state: "GREEN" | "AMBER" | "RED";
  availability: number;
  requirement: number;
}
