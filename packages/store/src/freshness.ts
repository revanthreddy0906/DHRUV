/**
 * Raw age computation only — not the FRESH/AGING/STALE/CRITICAL classification.
 * The class boundaries per source type (section 4) belong to A, in
 * packages/shared/src/config.ts, once thresholds are defined there. This
 * function is the "now - observed_at" half of freshness (N3) that C owns:
 * proving it's computable locally, offline, with no fetch.
 */
export function ageHours(now: Date, observedAt: string): number {
  return (now.getTime() - new Date(observedAt).getTime()) / (1000 * 60 * 60);
}
