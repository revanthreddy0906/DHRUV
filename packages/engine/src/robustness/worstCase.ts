import type { InventoryState, LegState, VesselState } from "../state.js";
import type { RobustnessBaseInputs, UncertainInput } from "./types.js";

/**
 * Deep/safe cloning helper for RobustnessBaseInputs.
 * Ensures the original input objects are never mutated.
 */
export function cloneBaseInputs(inputs: RobustnessBaseInputs): RobustnessBaseInputs {
  const clonedItem: InventoryState = {
    ...inputs.item,
    rateOverrides: inputs.item.rateOverrides ? { ...inputs.item.rateOverrides } : undefined,
  };

  const clonedLeg: LegState | undefined = inputs.inboundLeg
    ? { ...inputs.inboundLeg }
    : undefined;

  const clonedVessel: VesselState | undefined = inputs.vessel
    ? { ...inputs.vessel }
    : undefined;

  return {
    item: clonedItem,
    consumptionProfiles: [...inputs.consumptionProfiles],
    now: inputs.now,
    phaseBoundaries: { ...inputs.phaseBoundaries },
    inboundLeg: clonedLeg,
    vessel: clonedVessel,
    inboundCargoQty: inputs.inboundCargoQty,
  };
}

/**
 * Pure worst-case application function.
 * Applies a list of adverse deviations to a cloned state without mutating the original.
 */
export function applyUncertainties(
  baseInputs: RobustnessBaseInputs,
  uncertainties: readonly UncertainInput[],
): RobustnessBaseInputs {
  const state = cloneBaseInputs(baseInputs);

  for (const unc of uncertainties) {
    switch (unc.target) {
      case "burnRate": {
        // Adverse change to burn rate (uplift)
        const currentUplift = state.item.burnUplift ?? 0;
        if (unc.unit === "percent") {
          const factor = unc.adverseDirection === "increase"
            ? (1 + unc.deviation / 100)
            : (1 - unc.deviation / 100);
          state.item.burnUplift = (1 + currentUplift) * factor - 1;
        } else {
          const delta = unc.adverseDirection === "increase" ? unc.deviation : -unc.deviation;
          state.item.burnUplift = currentUplift + delta;
        }
        break;
      }

      case "stockCount": {
        // Adverse change to stock count on hand
        const currentStock = state.item.stock;
        if (unc.unit === "percent") {
          const delta = currentStock * (unc.deviation / 100);
          state.item.stock = unc.adverseDirection === "decrease"
            ? Math.max(0, currentStock - delta)
            : currentStock + delta;
        } else {
          state.item.stock = unc.adverseDirection === "decrease"
            ? Math.max(0, currentStock - unc.deviation)
            : currentStock + unc.deviation;
        }
        break;
      }

      case "shipmentSlack": {
        // Adverse change to feeder leg timing affecting feasibility (R02)
        if (state.inboundLeg) {
          let deviationDays = unc.deviation;
          if (unc.unit === "percent" && state.vessel) {
            const legEtaMs = new Date(state.inboundLeg.eta).getTime();
            const cutoffMs = new Date(state.vessel.loadCutoff).getTime();
            const nominalSlackDays = Math.max(0, (cutoffMs - legEtaMs) / 86400000);
            deviationDays = nominalSlackDays * (unc.deviation / 100);
          }

          // Adverse direction for slack: "decrease" slack means ETA arrives later (+deviationDays)
          const shiftDays = unc.adverseDirection === "decrease" ? deviationDays : -deviationDays;
          const currentEtaMs = new Date(state.inboundLeg.eta).getTime();
          const newEtaMs = currentEtaMs + shiftDays * 86400000;
          state.inboundLeg.eta = new Date(newEtaMs).toISOString();
        }
        break;
      }
    }
  }

  return state;
}
