/**
 * Entity and device ids for season48, the Director script and lever follow-ups.
 * Section 16 naming convention: prefixed ids (INV-DSL, L2-C104, INC-01).
 * Change ids here only; everything else imports them.
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
  // Maitri inventory
  dieselMaitri: "INV-DSL",
  foodMaitri: "INV-FOOD",
  medKitsMaitri: "INV-MEDKIT",
  oxygenMaitri: "INV-O2",
  gensetKitsMaitri: "INV-GENKIT",
  // Bharati inventory
  dieselBharati: "INV-BH-DSL",
  foodBharati: "INV-BH-FOOD",
  medKitsBharati: "INV-BH-MEDKIT",
  oxygenBharati: "INV-BH-O2",
  gensetKitsBharati: "INV-BH-GENKIT",

  // Shipments and legs
  shipmentC104: "C-104",
  shipmentC107: "C-107",
  shipmentC112: "C-112",
  legC104Road: "L1-C104",
  legC104Feeder: "L2-C104",
  legC104Vessel: "L3-C104",
  legC107Feeder: "L2-C107",
  legC107Vessel: "L3-C107",
  legC112Feeder: "L2-C112",
  legC112Vessel: "L3-C112",
  vessel: "V-ICE-STAR",

  // Maitri assets
  skidoo2: "SK-2",
  skidoo4: "SK-4",
  helicopter: "HX-1",
  snowTractor: "PB-1",

  missionF27: "F-27",
  missionF31: "F-31",
  fieldTeam3: "FT-3",
  personVerma: "P-VERMA",
  personNair: "P-NAIR",
  incident1: "INC-01",
  decision1: "DEC-01",
} as const;

export const LEVERS = {
  holdVessel: "HOLD_VESSEL",
  airliftPartial: "AIRLIFT_PARTIAL",
  deferF27: "DEFER_F27",
  conserve: "CONSERVE",
} as const;
