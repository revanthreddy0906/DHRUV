// packages/engine — pure deterministic engine (Paridhi v2 §2.3, §7)
// No Date.now(), no Math.random(), no fetch, no runtime deps. Enforced by lint later.
import type { OpEvent, Seed } from "@dhruv/shared";
import { reduce } from "./reduce.js";

export { reduce } from "./reduce.js";
export type {
  AssetState,
  DecisionState,
  InventoryState,
  LegState,
  LinkNodeState,
  MissionState,
  PersonnelState,
  State,
  VesselState,
} from "./state.js";

/**
 * Placeholder for the pure engine (Build Bible section 7, owned by A).
 * No clock, no randomness: `now` is always passed in by the caller.
 * The backend calls evaluate() directly for POST /scenarios/run.
 */
export interface EngineInput {
  seed: Seed;
  events: OpEvent[];
}

export type Evaluation = unknown;

export function evaluate(_input: EngineInput, _now: string): Evaluation {
  const state = reduce(_input.seed, _input.events);
  void state;
  throw new Error("evaluate() not implemented yet — owned by A");
}
