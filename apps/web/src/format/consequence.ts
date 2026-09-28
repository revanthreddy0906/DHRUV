import { COUNT_PLAUSIBILITY_MAX_CHANGE } from "../ui-config";
import { formatQty } from "./number";
import { formatRatio } from "./ratio";

type Light = "GREEN" | "AMBER" | "RED";

/** Before and after one draft stock event, both straight from evaluate() (section 9.4). */
export interface ConsequenceInput {
  item: string;
  unit: string;
  dimension: string;
  stock: { before: number; after: number };
  ratio: { before: number | null; after: number | null };
  state: { before: Light; after: Light };
}

/**
 * "Diesel 92.0 → 89.5 kL · fuel ratio 1.061 → 1.041 · stays GREEN" (or "turns AMBER"). The tone is
 * the state it turns to when it changes for the worse; otherwise the line is plain.
 */
export function consequenceLine(c: ConsequenceInput): { text: string; tone?: "AMBER" | "RED" } {
  const before = formatQty(c.stock.before, c.unit).replace(` ${c.unit}`, "");
  const ratio = c.ratio.before !== null && c.ratio.after !== null ? ` · ${c.dimension.toLowerCase()} ratio ${formatRatio(c.ratio.before)} → ${formatRatio(c.ratio.after)}` : "";
  const same = c.state.before === c.state.after;
  const verdict = same ? `stays ${c.state.after}` : `turns ${c.state.after}`;
  const RANK: Record<Light, number> = { RED: 0, AMBER: 1, GREEN: 2 };
  const worse = RANK[c.state.after] < RANK[c.state.before];
  return { text: `${c.item} ${before} → ${formatQty(c.stock.after, c.unit)}${ratio} · ${verdict}`, tone: worse && c.state.after !== "GREEN" ? c.state.after : undefined };
}

/**
 * The count plausibility guard (section 9.4): a count that differs from the recorded stock by more
 * than COUNT_PLAUSIBILITY_MAX_CHANGE, or is 0 for an item with a requirement, asks to confirm.
 * UI only: the event contract accepts any non-negative count.
 */
export function countPlausibility(counted: number, recorded: number, required: number, unit: string): string | undefined {
  const zeroWithNeed = counted === 0 && required > 0;
  if (recorded <= 0) return zeroWithNeed ? `This count is 0 ${unit} for an item with a requirement of ${formatQty(required, unit)}. Record 0 ${unit} anyway?` : undefined;
  const change = Math.abs(counted - recorded) / recorded;
  if (change <= COUNT_PLAUSIBILITY_MAX_CHANGE && !zeroWithNeed) return undefined;
  const pct = Number((change * 100).toFixed(2));
  return `This count is ${pct} % ${counted < recorded ? "lower" : "higher"} than the recorded ${formatQty(recorded, unit)}. Record ${formatQty(counted, unit)} anyway?`;
}
