import type { EventEnvelope } from "@dhruv/shared";

/**
 * Placeholder for the pure evaluate() engine (section 2.2/2.4, owned by A).
 * Zero runtime deps, no clock, no randomness — `now` and `state` are always
 * passed in by the caller (browser or server), never read from the environment.
 *
 * The backend imports this function directly (not over HTTP) for sync-time
 * checks per the deployment diagram in section 2.1.
 */
export interface EngineState {
  events: EventEnvelope[];
}

export interface EngineResult {
  // TODO(A): readiness, options, PNR, freshness, traces (section 2.2, layer 5)
}

export function evaluate(_state: EngineState, _now: Date): EngineResult {
  throw new Error("evaluate() not implemented yet — owned by A");
}
