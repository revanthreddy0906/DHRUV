/**
 * Horizontal positions (0–100 %) for dates on a mini timeline, display-only. The span covers every
 * point and `now`, with a day of padding at each end so no marker sits on the edge.
 */
export function timelinePositions<K extends string>(points: { key: K; at: string }[], now: string): { key: K | "now"; pct: number }[] {
  const all = [...points.map((p) => Date.parse(p.at)), Date.parse(now)];
  const pad = 86_400_000;
  const start = Math.min(...all) - pad;
  const end = Math.max(...all) + pad;
  const pct = (t: number) => ((t - start) / (end - start)) * 100;
  return [...points.map((p) => ({ key: p.key as K | "now", pct: pct(Date.parse(p.at)) })), { key: "now" as const, pct: pct(Date.parse(now)) }];
}
