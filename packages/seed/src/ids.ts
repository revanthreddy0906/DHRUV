/**
 * Entity and device ids used by the Director script and lever follow-ups.
 * Section 16 naming convention: prefixed ids (INV-DSL, L2-C104, INC-01).
 * TODO(A): reconcile with season48.ts once the frozen seed lands; change ids here only.
 */
export const NODES = {
  HQ: "HQ",
  MUMBAI: "MUMBAI",
  CAPE_TOWN: "CAPE_TOWN",
  MAITRI: "MAITRI",
  BHARATI: "BHARATI",
} as const;

export const STATION_NODES: readonly string[] = [NODES.MAITRI, NODES.BHARATI];

export const DEVICES = {
  HQ_WEB: "HQ-WEB-01",
  MAITRI_TAB: "MAITRI-TAB-01",
  FT3_TAB: "FT3-TAB-01",
  /** Server-injected Director beats use their own seq space so they never collide with a real device. */
  DIRECTOR: "DIRECTOR",
  /** Server-emitted SYSTEM events (conflicts, decision follow-ups). */
  SERVER: "SERVER",
} as const;

export const IDS = {
  dieselMaitri: "INV-DSL",
  medKitsMaitri: "INV-MEDKIT",
  legC104Feeder: "L2-C104",
  legC104Vessel: "L3-C104",
  vessel: "V-ICE-STAR",
  skidoo2: "SK-2",
  missionF27: "F-27",
  fieldTeam3: "FT-3",
  personVerma: "P-VERMA",
  personNair: "P-NAIR",
  incident1: "INC-01",
  decision1: "DEC-01",
} as const;
