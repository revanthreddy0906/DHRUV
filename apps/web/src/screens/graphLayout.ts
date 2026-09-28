import type { FocusView } from "../format";

/**
 * Geometry for Connections (SPEC A.2): cards in five columns, and right-angle lines that run only
 * through the gutters between columns and the gaps between rows, so a line never crosses a card.
 */

export const CARD_W = 200;
export const CARD_H = 84;
export const COL_GAP = 36;
export const ROW_GAP = 16;
/** Room for the column titles above the first row. */
export const TOP = 36;
/** Left margin: the first column's same-column lines run here. */
export const PAD_X = 16;
const COLUMNS = 5;
export const COLLAPSED_LINE = 20;

export interface Box { id: string; x: number; y: number; column: number; row: number }
export interface Layout {
  boxes: Map<string, Box>;
  width: number;
  height: number;
  /** Top of the quiet "+ n more" row under every column. */
  collapsedY: number;
}

export const columnX = (c: number) => PAD_X + c * (CARD_W + COL_GAP);
const rowY = (r: number) => TOP + r * (CARD_H + ROW_GAP);

const ROLE_RANK = { focus: 0, upstream: 1, downstream: 1, context: 2, remedy: 3, other: 4 } as const;

/**
 * Places each visible record. The focused chain comes first in every column (so it reads as one
 * row left to right), then context, then remedies, then records shown by expanding the column.
 */
export function layoutFocus(view: FocusView, graphOrder: string[]): Layout {
  const order = new Map(graphOrder.map((id, i) => [id, i] as const));
  const pathIndex = new Map([...view.upstream, ...view.downstream].map((id, i) => [id, i] as const));
  const cols: string[][] = Array.from({ length: COLUMNS }, () => []);
  for (const [id, c] of view.column) cols[c]!.push(id);
  const boxes = new Map<string, Box>();
  let rows = 0;
  cols.forEach((ids, c) => {
    ids.sort((a, b) =>
      ROLE_RANK[view.roles.get(a)!] - ROLE_RANK[view.roles.get(b)!] ||
      (pathIndex.get(a) ?? 0) - (pathIndex.get(b) ?? 0) ||
      (order.get(a) ?? 0) - (order.get(b) ?? 0));
    ids.forEach((id, r) => boxes.set(id, { id, x: columnX(c), y: rowY(r), column: c, row: r }));
    rows = Math.max(rows, ids.length);
  });
  const collapsedY = rowY(rows) - ROW_GAP + 12;
  const collapsedLines = Math.max(0, ...view.collapsed.map((c) => c.labels.length));
  return {
    boxes,
    width: columnX(COLUMNS - 1) + CARD_W + 4,
    height: collapsedY + collapsedLines * COLLAPSED_LINE + 8,
    collapsedY,
  };
}

type Pt = [number, number];

/** Does a horizontal segment at `y` from x1 to x2 pass through any card (endpoints excluded)? */
function blocked(boxes: Iterable<Box>, y: number, x1: number, x2: number, except: string[]): boolean {
  const [lo, hi] = x1 < x2 ? [x1, x2] : [x2, x1];
  for (const b of boxes) {
    if (except.includes(b.id)) continue;
    if (y > b.y - 2 && y < b.y + CARD_H + 2 && hi > b.x && lo < b.x + CARD_W) return true;
  }
  return false;
}

/**
 * The corner points of a line from card `a` to card `b`. Lines leave and enter on the facing
 * sides; a line between cards in the same column bows out into the gutter on its left.
 */
export function routePoints(a: Box, b: Box, layout: Layout): Pt[] {
  const boxes = [...layout.boxes.values()];
  const ya = a.y + CARD_H / 2, yb = b.y + CARD_H / 2;
  const ends = [a.id, b.id];

  if (a.column === b.column) {
    const gx = a.x - 10;
    return [[a.x, ya], [gx, ya], [gx, yb], [b.x, yb]];
  }

  const forward = b.column > a.column;
  const x1 = forward ? a.x + CARD_W : a.x;
  const x2 = forward ? b.x : b.x + CARD_W;
  // The gutters right after the source column and right before the target column.
  const g1 = forward ? x1 + COL_GAP / 2 : x1 - COL_GAP / 2;
  const g2 = forward ? x2 - COL_GAP / 2 : x2 + COL_GAP / 2;

  if (ya === yb && !blocked(boxes, ya, x1, x2, ends)) return [[x1, ya], [x2, yb]];
  if (!blocked(boxes, ya, x1, g2, ends)) return [[x1, ya], [g2, ya], [g2, yb], [x2, yb]];
  if (!blocked(boxes, yb, g1, x2, ends)) return [[x1, ya], [g1, ya], [g1, yb], [x2, yb]];

  // Otherwise run along the gap between rows closest to both ends; row gaps are always free.
  const rows = Math.max(0, ...boxes.map((x) => x.row)) + 1;
  const lanes = Array.from({ length: rows + 1 }, (_, r) => rowY(r) - ROW_GAP / 2);
  const lane = lanes.reduce((best, y) => (Math.abs(y - ya) + Math.abs(y - yb) < Math.abs(best - ya) + Math.abs(best - yb) ? y : best));
  return [[x1, ya], [g1, ya], [g1, lane], [g2, lane], [g2, yb], [x2, yb]];
}

/** An SVG path through the points with small rounded corners. */
export function roundedPath(points: Pt[], radius = 6): string {
  const clean = points.filter((p, i) => i === 0 || p[0] !== points[i - 1]![0] || p[1] !== points[i - 1]![1]);
  if (clean.length < 3) return `M ${clean.map((p) => p.join(" ")).join(" L ")}`;
  let d = `M ${clean[0]![0]} ${clean[0]![1]}`;
  for (let i = 1; i < clean.length - 1; i++) {
    const [px, py] = clean[i - 1]!, [cx, cy] = clean[i]!, [nx, ny] = clean[i + 1]!;
    const r = Math.min(radius, Math.hypot(cx - px, cy - py) / 2, Math.hypot(nx - cx, ny - cy) / 2);
    const inX = cx - Math.sign(cx - px) * r, inY = cy - Math.sign(cy - py) * r;
    const outX = cx + Math.sign(nx - cx) * r, outY = cy + Math.sign(ny - cy) * r;
    d += ` L ${inX} ${inY} Q ${cx} ${cy} ${outX} ${outY}`;
  }
  const last = clean.at(-1)!;
  return `${d} L ${last[0]} ${last[1]}`;
}
