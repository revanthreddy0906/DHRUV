/**
 * Display formatting for numbers and units (docs/ui-redesign/CLAUDE.md section 6). Pure and
 * display-only: nothing here decides a state, a threshold or a deadline.
 */

/** Unknown values render as this word, never as 0 and never as a bare dash. */
export const UNKNOWN = "unknown";

const grouped = (n: number, decimals: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** Decimals a unit is shown with: kL to one place; counted units whole unless the value is fractional. */
export function decimalsFor(unit: string, n: number): number {
  if (unit === "kL") return 1;
  return Number.isInteger(Math.round(n * 10) / 10) ? 0 : 1;
}

/** "92.0 kL", "8,900 person-days", "10 kits", "4.5 kits". The unit always follows a space. */
export function formatQty(n: number | null | undefined, unit: string): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return UNKNOWN;
  return `${grouped(n, decimalsFor(unit, n))} ${unit}`;
}
