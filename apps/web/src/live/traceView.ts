import type { StationEval } from "@dhruv/engine";
import { DIMENSION_LABEL, b0Line, dimensionReason, formatDate } from "../format";

/**
 * Props for the trace drawer on one dimension of one station (section 9.2), shared by Command and
 * the Station page so both open the same math: the engine's own steps, the item units, the B0
 * footer and the template explanation.
 */
export function traceDrawerProps(st: StationEval, key: string, stationName: string, deviceId: string, clock: string) {
  const d = st.dimensions.find((x) => x.key === key);
  if (!d) return undefined;
  return {
    title: `${stationName} · ${DIMENSION_LABEL[d.key] ?? d.key}`,
    state: d.state,
    subtitle: `As seen by ${deviceId} at ${clock}`,
    steps: d.trace,
    units: Object.fromEntries((d.items ?? []).map((i) => [i.id, i.unit])),
    b0: d.baselineB0 ? b0Line(d.baselineB0) : undefined,
    explanation: d.state === "GREEN" ? undefined : {
      source: "template" as const,
      text: `${dimensionReason(d)}${d.key === "FUEL" && st.pnr?.pnrDate ? ` Point of no return: ${formatDate(st.pnr.pnrDate)}, ${st.pnr.daysRemaining ?? 0} days left.` : ""}`,
    },
  };
}
