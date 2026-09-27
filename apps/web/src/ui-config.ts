/**
 * UI-only constants (docs/ui-redesign/CLAUDE.md section 9.4). Not engine configuration: these only
 * decide when the interface asks the operator to confirm, never a state or a threshold.
 */

/** A stock count that differs from the current derived stock by more than this fraction asks for confirmation. */
export const COUNT_PLAUSIBILITY_MAX_CHANGE = 0.5;
