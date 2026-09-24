import type { GeneratedOption } from "./options.js";

export interface RankedOption extends GeneratedOption {
  label: "(a)" | "(b)" | "(c)";
  category: "RECOMMENDED_TARGET" | "ALTERNATIVE_TARGET" | "PARTIAL_RECOVERY";
  rankingTrace: string;
}

/**
 * Comparator for target-reaching options:
 * 1. Cheapest monetary cost
 * 2. Fewer levers wins (T-ENG-04)
 * 3. Later deadline wins (T-ENG-04)
 * 4. Higher resulting ratio
 * 5. Deterministic tie-breaker on sorted lever IDs
 */
function compareTargetOptionsMinimal(a: GeneratedOption, b: GeneratedOption): number {
  if (a.cost !== b.cost) return a.cost - b.cost;
  if (a.leverIds.length !== b.leverIds.length) return a.leverIds.length - b.leverIds.length;
  if (a.deadline !== b.deadline) return b.deadline.localeCompare(a.deadline);
  if (a.ratio !== b.ratio) return b.ratio - a.ratio;
  return a.id.localeCompare(b.id);
}

/**
 * Comparator for alternative target-reaching options (maximum ratio/cushion):
 * 1. Cheapest monetary cost
 * 2. Higher resulting ratio (maximum margin/cushion)
 * 3. Fewer levers wins
 * 4. Later deadline wins
 * 5. Deterministic tie-breaker on sorted lever IDs
 */
function compareTargetOptionsMaxBuffer(a: GeneratedOption, b: GeneratedOption): number {
  if (a.cost !== b.cost) return a.cost - b.cost;
  if (a.ratio !== b.ratio) return b.ratio - a.ratio;
  if (a.leverIds.length !== b.leverIds.length) return a.leverIds.length - b.leverIds.length;
  if (a.deadline !== b.deadline) return b.deadline.localeCompare(a.deadline);
  return a.id.localeCompare(b.id);
}

/**
 * Comparator for partial options (options that do not reach target state):
 * 1. Smallest residual gap (highest recovery)
 * 2. Cheapest monetary cost
 * 3. Fewer levers wins
 * 4. Later deadline wins
 * 5. Deterministic tie-breaker on sorted lever IDs
 */
function comparePartialOptions(a: GeneratedOption, b: GeneratedOption): number {
  if (a.gap !== b.gap) return a.gap - b.gap;
  if (a.cost !== b.cost) return a.cost - b.cost;
  if (a.leverIds.length !== b.leverIds.length) return a.leverIds.length - b.leverIds.length;
  if (a.deadline !== b.deadline) return b.deadline.localeCompare(a.deadline);
  return a.id.localeCompare(b.id);
}

/**
 * R10: Option Ranking and Selection.
 * Ranks and selects up to 3 options to present to the operator:
 * - Option (a): Cheapest target-reaching option (with tie-break: fewer levers, then later deadline)
 * - Option (b): Alternative target-reaching option with highest ratio/buffer (if available)
 * - Option (c): Best partial recovery option that recovers the most gap without reaching target
 */
export function rankOptions(options: GeneratedOption[]): RankedOption[] {
  const targetOptions = options.filter((o) => o.reachesTarget);
  const partialOptions = options.filter((o) => !o.reachesTarget);

  const selected: { option: GeneratedOption; category: RankedOption["category"] }[] = [];

  if (targetOptions.length > 0) {
    // 1. Primary target-reaching option (minimal intervention / cheapest)
    const sortedTargetMinimal = [...targetOptions].sort(compareTargetOptionsMinimal);
    const optA = sortedTargetMinimal[0]!;
    selected.push({ option: optA, category: "RECOMMENDED_TARGET" });

    // 2. Alternative target-reaching option (maximum cushion / buffer)
    const remainingTarget = targetOptions.filter((o) => o.id !== optA.id);
    if (remainingTarget.length > 0) {
      const sortedTargetMaxBuffer = [...remainingTarget].sort(compareTargetOptionsMaxBuffer);
      const optB = sortedTargetMaxBuffer[0]!;
      selected.push({ option: optB, category: "ALTERNATIVE_TARGET" });
    }

    // 3. Best partial recovery option
    if (partialOptions.length > 0 && selected.length < 3) {
      const sortedPartial = [...partialOptions].sort(comparePartialOptions);
      const optC = sortedPartial[0]!;
      selected.push({ option: optC, category: "PARTIAL_RECOVERY" });
    } else if (remainingTarget.length > 1 && selected.length < 3) {
      // If no partial option exists, pick next target option
      const sortedTargetMaxBuffer = [...remainingTarget].sort(compareTargetOptionsMaxBuffer);
      const optC = sortedTargetMaxBuffer[1]!;
      selected.push({ option: optC, category: "ALTERNATIVE_TARGET" });
    }
  } else {
    // No target-reaching options exist: select top 3 partial options
    const sortedPartial = [...partialOptions].sort(comparePartialOptions);
    for (let i = 0; i < Math.min(3, sortedPartial.length); i++) {
      selected.push({ option: sortedPartial[i]!, category: "PARTIAL_RECOVERY" });
    }
  }

  const labels: ("(a)" | "(b)" | "(c)")[] = ["(a)", "(b)", "(c)"];

  return selected.slice(0, 3).map((item, index) => {
    const label = labels[index]!;
    const rankingTrace = `[R10] Option ${label}: {${item.option.leverIds.join(
      ", ",
    )}} [${item.category}, ratio ${item.option.ratio.toFixed(4)}, cost ${
      item.option.cost > 0 ? (item.option.cost / 100000).toFixed(1) + " lakh" : "none"
    }, deadline ${item.option.deadline.slice(0, 10)}]`;

    return {
      ...item.option,
      label,
      category: item.category,
      rankingTrace,
    };
  });
}

