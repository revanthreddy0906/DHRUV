import { config } from "@dhruv/shared";

export interface BaselineB0Result {
  stock: number;
  unit: string;
  rate: number;
  daysOfCover: number;
  hasAlert: boolean;
  alert: "none" | "LOW_STOCK";
  trace: string;
}

export interface ComputeBaselineB0Params {
  stock: number;
  rate: number;
  unit?: string;
  minDaysOfCover?: number;
  minStockThreshold?: number;
}

/**
 * R18: Baseline B0.
 * Spec §7 line 271, line 296, §24 lines 715-724:
 * "What a plain stock-level alert would show: alert if on-hand stock is below
 * a fixed threshold, or if days-of-cover at today's burn rate drops below a limit.
 * Computed alongside the engine, never feeds into state.
 * Exposed in the trace drawer as a single greyed line for direct comparison."
 */
export function computeBaselineB0(params: ComputeBaselineB0Params): BaselineB0Result {
  const {
    stock,
    rate,
    unit = "kL",
    minDaysOfCover = config.baseline.minDaysOfCover,
    minStockThreshold = config.baseline.minStockThreshold,
  } = params;

  const daysOfCover = rate > 0 ? Math.round(stock / rate) : Infinity;
  const hasAlert = stock <= minStockThreshold || daysOfCover <= minDaysOfCover;
  const alert: "none" | "LOW_STOCK" = hasAlert ? "LOW_STOCK" : "none";

  const daysStr = daysOfCover === Infinity ? "inf" : `${daysOfCover} days`;
  const trace = `[R18] Baseline B0: on-hand ${stock.toFixed(1)} ${unit} at ${rate.toFixed(
    2,
  )} ${unit}/d = ${daysStr} of cover -> alert: ${alert} (${
    hasAlert ? "stock alert triggered" : "a stock alert would show nothing here"
  })`;

  return {
    stock,
    unit,
    rate,
    daysOfCover,
    hasAlert,
    alert,
    trace,
  };
}

