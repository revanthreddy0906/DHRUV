/**
 * UI-only constants (docs/ui-redesign/CLAUDE.md section 9.4). Not engine configuration: these only
 * decide when the interface asks the operator to confirm, never a state or a threshold.
 */

/** A stock count that differs from the current derived stock by more than this fraction asks for confirmation. */
export const COUNT_PLAUSIBILITY_MAX_CHANGE = 0.5;

/**
 * Field Lead devices (SPEC B, decision C): which team and mission a field tablet belongs to. The
 * seed has no team roster; FT-3's people and vehicle come from F-27's needs.
 */
export const FIELD_DEVICES: Record<string, { team: string; mission: string }> = {
  "FT3-TAB-01": { team: "FT-3", mission: "F-27" },
};

/**
 * Stands in for the tablet's GPS fix on a check-in (decision B); the demo has no GPS. The same
 * point as Director beat 7. Every place it is used says "Position from device (demo constant)".
 */
export const FIELD_DEMO_POSITION = { lat: -70.62, lon: 12.1 };

/** A check-in turns "Due soon" this many minutes before it is due (UI wording only). */
export const CHECKIN_DUE_SOON_MINUTES = 30;
