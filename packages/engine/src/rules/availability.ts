import { config } from "@dhruv/shared";

export interface AvailabilityResult {
  itemId: string;
  availability: number;
  ratio: number;
  state: "GREEN" | "AMBER" | "RED";
  trace: string;
}

export function computeAvailability(
  itemId: string,
  stock: number,
  feasibleInboundQty: number,
  requirement: number,
): AvailabilityResult {
  const availability = stock + feasibleInboundQty;
  const ratio = requirement > 0 ? availability / requirement : Infinity;
  const state = ratio >= config.thresholds.green ? "GREEN" : ratio >= config.thresholds.amber ? "AMBER" : "RED";
  return {
    itemId, availability, ratio, state,
    trace: `[R03] ${itemId} availability vs requirement: ${availability.toFixed(1)} / ${requirement.toFixed(1)} = ${ratio.toFixed(4)} -> ${state}`,
  };
}

export function worstOf(states: ("GREEN" | "AMBER" | "RED")[]): "GREEN" | "AMBER" | "RED" {
  if (states.includes("RED")) return "RED";
  if (states.includes("AMBER")) return "AMBER";
  return "GREEN";
}
