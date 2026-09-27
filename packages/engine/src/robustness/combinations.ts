/**
 * Deterministic combination generator.
 * Produces all C(n, k) combinations of size k from an array of n items.
 *
 * @param items Array of elements to choose from.
 * @param k Number of elements in each combination.
 * @returns Array of unique combinations in deterministic lexicographical order.
 */
export function generateCombinations<T>(items: readonly T[], k: number): T[][] {
  if (!Number.isInteger(k) || k < 0 || k > items.length) {
    throw new Error(
      `Invalid combination size: ${k}. k must be an integer between 0 and ${items.length}.`,
    );
  }

  if (k === 0) {
    return [[]];
  }

  if (k === items.length) {
    return [[...items]];
  }

  const result: T[][] = [];

  function backtrack(start: number, currentCombo: T[]): void {
    if (currentCombo.length === k) {
      result.push([...currentCombo]);
      return;
    }

    const needed = k - currentCombo.length;
    const remaining = items.length - start;
    if (remaining < needed) {
      return;
    }

    for (let i = start; i < items.length; i++) {
      currentCombo.push(items[i]!);
      backtrack(i + 1, currentCombo);
      currentCombo.pop();
    }
  }

  backtrack(0, []);
  return result;
}
