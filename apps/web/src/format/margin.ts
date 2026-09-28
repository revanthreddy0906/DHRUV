import { decimalsFor, formatQty } from "./number";

/**
 * The headline for a stock dimension, from the engine's own available and required values:
 * "+8.0 kL margin" or "−40.0 kL short". The subtraction is display-only; the state still comes
 * from the engine. Returns undefined when either value is missing, so the caller shows the ratio.
 */
export function formatMargin(available: number | null | undefined, required: number | null | undefined, unit: string): string | undefined {
  if (available === null || available === undefined || required === null || required === undefined) return undefined;
  if (!Number.isFinite(available) || !Number.isFinite(required)) return undefined;
  const diff = available - required;
  // Decide the sign on the value as shown, so a margin that rounds to zero never reads "−0.0".
  const shown = Number(Math.abs(diff).toFixed(decimalsFor(unit, Math.abs(diff))));
  if (diff < 0 && shown > 0) return `−${formatQty(Math.abs(diff), unit)} short`;
  return `+${formatQty(Math.abs(diff), unit)} margin`;
}

/** "3 of 8,280 person-days": available against required, both in the item's unit. */
export function formatHaveNeed(available: number, required: number, unit: string): string {
  return `${formatQty(available, unit).replace(` ${unit}`, "")} of ${formatQty(required, unit)}`;
}
