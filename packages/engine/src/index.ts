// packages/engine — pure deterministic engine (Paridhi v2 §2.3, §7)
// No Date.now(), no Math.random(), no fetch, no runtime deps. Enforced by lint later.
import type { OpEvent, Seed } from "@dhruv/shared";

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
  throw new Error("evaluate() not implemented yet — owned by A");
}
