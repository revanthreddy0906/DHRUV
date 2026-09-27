import { config } from "@dhruv/shared";
import { UNKNOWN } from "./number";

/** The engine's ratio bands (section 7 thresholds), used only to keep a displayed ratio honest. */
const band = (r: number) => (r >= config.thresholds.green ? 2 : r >= config.thresholds.amber ? 1 : 0);

/**
 * A ratio to 3 decimals (section 6): rounded half up, unless the rounded value would fall in a
 * different band than the engine value, then truncated instead (1.04996 shows 1.049, not 1.050).
 * The trace drawer shows the engine's full precision instead of this.
 */
export function formatRatio(r: number | null | undefined): string {
  if (r === null || r === undefined || Number.isNaN(r)) return UNKNOWN;
  if (!Number.isFinite(r)) return "no requirement";
  // The epsilon absorbs binary noise (1.0605 * 1000 = 1060.4999...) without moving a real value.
  const rounded = Math.round(r * 1000 + 1e-7) / 1000;
  const shown = band(rounded) === band(r) ? rounded : Math.trunc(r * 1000 + Math.sign(r) * 1e-7) / 1000;
  return shown.toFixed(3);
}
