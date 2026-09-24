import { config } from "@dhruv/shared";
import type { InventoryState, PersonnelState } from "../state.js";

/**
 * R19: POB-driven food requirement (docs/spec.md §7 line 273, line 297, §13 line 436).
 *
 * Food's R_base uses live personnel-on-board count (from PERSON_MOVED and
 * PERSON_STATUS_SET events), not a fixed headcount:
 *   R_base = POB × per_person_rate × days_to_resupply
 *   R = (R_base - S) × (1 + u) × (1 + r)
 *   Availability A = stock + sum(inbound_feasible)
 *   ratio = A / R
 *   state = GREEN (ratio >= 1.05), AMBER (0.95 <= ratio < 1.05), RED (ratio < 0.95)
 */

export interface ComputeFoodRequirementParams {
  foodItem: InventoryState;
  personnel: Iterable<PersonnelState>;
  nodeId: string;
  perPersonRate?: number;
  daysToResupply?: number;
  burnUplift?: number;
  inbound?: number;
  now?: string;
}

export interface FoodRequirementResult {
  itemId: string;
  nodeId: string;
  pob: number;
  perPersonRate: number;
  daysToResupply: number;
  burnUplift: number;
  rBase: number;
  reservePct: number;
  r: number;
  stock: number;
  availability: number;
  ratio: number;
  state: "GREEN" | "AMBER" | "RED";
  trace: string;
}

/**
 * Computes live Personnel-On-Board (POB) for a given station node.
 * Counts personnel assigned to the station (nodeId === stationNodeId) whose
 * status is not EVACUATED.
 * Personnel who were moved to another node via PERSON_MOVED have their nodeId
 * updated in reduce() and are therefore not counted here.
 */
export function computePob(
  personnel: Iterable<PersonnelState>,
  nodeId: string,
): number {
  let count = 0;
  for (const p of personnel) {
    if (p.nodeId === nodeId && p.status !== "EVACUATED") {
      count++;
    }
  }
  return count;
}

/**
 * Computes R19 food requirement and availability ratio using live POB.
 */
export function computeFoodRequirement(
  params: ComputeFoodRequirementParams,
): FoodRequirementResult {
  const {
    foodItem,
    personnel,
    nodeId,
    perPersonRate = config.food.defaultPerPersonRate,
    daysToResupply = config.food.defaultDaysToResupply,
    burnUplift = 0,
    inbound = 0,
  } = params;

  const pob = computePob(personnel, nodeId);
  const rBase = Math.round(pob * perPersonRate * Math.max(0, daysToResupply) * 10000) / 10000;
  const upliftFactor = 1 + burnUplift;
  const reserveFactor = 1 + foodItem.reservePct;
  const r = Math.round(rBase * upliftFactor * reserveFactor * 10000) / 10000;

  const availability = foodItem.stock + inbound;
  const ratio = r > 0 ? availability / r : Infinity;
  const state =
    ratio >= config.thresholds.green
      ? "GREEN"
      : ratio >= config.thresholds.amber
        ? "AMBER"
        : "RED";

  const upliftText =
    burnUplift !== 0
      ? ` (+${(burnUplift * 100).toFixed(0)}% burn uplift: ${(rBase * upliftFactor).toFixed(2)})`
      : "";

  const trace = `[R19] Food requirement: POB ${pob} x ${perPersonRate.toFixed(2)}/person/d x ${daysToResupply}d = ${rBase.toFixed(2)}${upliftText}; with ${(foodItem.reservePct * 100).toFixed(0)}% reserve = ${r.toFixed(2)}; stock ${availability.toFixed(2)} -> ratio ${ratio.toFixed(4)} -> ${state}`;

  return {
    itemId: foodItem.itemId,
    nodeId,
    pob,
    perPersonRate,
    daysToResupply,
    burnUplift,
    rBase,
    reservePct: foodItem.reservePct,
    r,
    stock: foodItem.stock,
    availability,
    ratio,
    state,
    trace,
  };
}
