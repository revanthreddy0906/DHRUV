import { UNKNOWN } from "./number";

/**
 * A ratio to 3 decimals, truncated toward zero, so a displayed ratio never crosses a threshold its
 * state does not (1.04996 shows 1.049, not 1.050). The trace drawer shows the engine's full
 * precision instead of this.
 */
export function formatRatio(r: number | null | undefined): string {
  if (r === null || r === undefined || Number.isNaN(r)) return UNKNOWN;
  if (!Number.isFinite(r)) return "no requirement";
  // The epsilon absorbs binary noise (0.697 * 1000 = 696.9999...) without rounding a real 1.0499.
  const t = Math.trunc(r * 1000 + Math.sign(r) * 1e-7) / 1000;
  return t.toFixed(3);
}
