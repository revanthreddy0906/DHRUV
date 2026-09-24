import type { GeneratedOption } from "./options.js";

export interface PnrResult {
  pnrDate: string | null;
  daysRemaining: number | null;
  bindingOptionId: string | null;
  trace: string;
}

function truncateToDate(iso: string): string {
  return iso.slice(0, 10) + "T00:00:00.000Z";
}

function daysBetween(a: string, b: string): number {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

/**
 * R11: Point of No Return.
 * PNR is the latest deadline among options that can reach the target state (GREEN).
 * Formula: max over options that reach target of ( min over levers in that option of deadline_L )
 * If no target-reaching option exists, returns null without fabricating a date.
 */
export function computePnr(options: GeneratedOption[], now: string): PnrResult {
  const targetOptions = options.filter((o) => o.reachesTarget);

  if (targetOptions.length === 0) {
    return {
      pnrDate: null,
      daysRemaining: null,
      bindingOptionId: null,
      trace: "[R11] No option reaches target state (GREEN) -> PNR is not defined",
    };
  }

  // Find option with latest deadline among target-reaching options
  let latestOption = targetOptions[0]!;
  for (const opt of targetOptions) {
    if (opt.deadline > latestOption.deadline) {
      latestOption = opt;
    }
  }

  const pnrDate = latestOption.deadline;
  const nowDate = truncateToDate(now);
  const pnrDateTruncated = truncateToDate(pnrDate);
  const daysRemaining = daysBetween(nowDate, pnrDateTruncated);

  const trace = `[R11] Point of no return: ${pnrDateTruncated.slice(0, 10)} (${daysRemaining} days left) via option ${
    latestOption.id
  }`;

  return {
    pnrDate,
    daysRemaining,
    bindingOptionId: latestOption.id,
    trace,
  };
}

