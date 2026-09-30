import { config, type Seed } from "@dhruv/shared";
import { IDS, LEVERS, NODES } from "./ids.js";

/**
 * season48: the frozen synthetic dataset (Build Bible section 13). Everything here is fictional;
 * only the node coordinates are approximate public values. Loaded by `pnpm seed` and by the
 * Director's Reset to Start.
 *
 * Where section 13 is silent, values are filled in and marked FILLED so A can check them:
 * generated names, Bharati beyond diesel, C-107/C-112 legs, and the food requirement mode.
 */

const START = config.demo.startAt;
const day = (d: string) => `${d}T00:00:00.000Z`;
const at = (d: string, hhmm: string) => `${d}T${hhmm}:00.000Z`;

type Person = Seed["personnel"][number];
type Asset = Seed["assets"][number];
type Item = Seed["inventory_items"][number];

const nodes: Seed["nodes"] = [
  { id: NODES.HQ, name: "Goa HQ", type: "HQ", lat: 15.4, lon: 73.79 },
  { id: NODES.MUMBAI, name: "Mumbai port", type: "PORT", lat: 18.95, lon: 72.84 },
  { id: NODES.CAPE_TOWN, name: "Cape Town", type: "CITY", lat: -33.92, lon: 18.42 },
  { id: NODES.MAITRI, name: "Maitri", type: "STATION", lat: -70.77, lon: 11.73 },
  { id: NODES.BHARATI, name: "Bharati", type: "STATION", lat: -69.41, lon: 76.19 },
];

const vessels: Seed["vessels"] = [
  { id: IDS.vessel, name: "MV Ice Star", departure: day("2027-02-06"), load_cutoff: day("2027-02-04"), eta_station: day("2027-02-24"), station_closing_date: day("2027-02-28") },
];

// ---- Personnel -------------------------------------------------------------------------------

const person = (id: string, name: string, role: string, node_id: string, status: Person["status"] = "ON_STATION"): Person => ({
  id,
  name,
  role,
  node_id,
  status,
  last_seen: START,
});

/** Maitri, 24 winterers. Named people are from section 13; the rest are generated (FILLED). */
const maitriPeople: Person[] = [
  person("P-RAO", "Cdr A. Rao", "STATION_LEADER", NODES.MAITRI),
  person("P-MENON", "Dr K. Menon", "DOCTOR", NODES.MAITRI),
  person("P-SHAH", "Dr P. Shah", "DOCTOR", NODES.MAITRI),
  person("P-M01", "D. Pillai", "DIESEL_MECHANIC", NODES.MAITRI),
  person("P-M02", "H. Gill", "DIESEL_MECHANIC", NODES.MAITRI),
  person("P-M03", "S. Das", "ELECTRICIAN", NODES.MAITRI),
  person("P-M04", "T. Bhat", "ELECTRICIAN", NODES.MAITRI),
  person("P-IYER", "V. Iyer", "COMMS_ENGINEER", NODES.MAITRI),
  person("P-M05", "N. Joshi", "COMMS_ENGINEER", NODES.MAITRI),
  person("P-M06", "L. Fernandes", "COOK", NODES.MAITRI),
  person("P-M07", "M. Thapa", "COOK", NODES.MAITRI),
  // FT-3 is out on F-27 support at the start (section 10).
  person(IDS.personVerma, "Dr A. Verma", "GLACIOLOGIST", NODES.MAITRI, "FIELD"),
  person("P-M08", "Dr R. Sen", "GLACIOLOGIST", NODES.MAITRI),
  person("P-M09", "Dr G. Kaur", "GLACIOLOGIST", NODES.MAITRI),
  person("P-M10", "Dr B. Reddy", "ATMOSPHERIC_SCIENTIST", NODES.MAITRI),
  person("P-M11", "Dr J. Paul", "ATMOSPHERIC_SCIENTIST", NODES.MAITRI),
  person("P-M12", "Dr C. Naidu", "ATMOSPHERIC_SCIENTIST", NODES.MAITRI),
  person(IDS.personNair, "R. Nair", "FIELD_GUIDE", NODES.MAITRI, "FIELD"),
  person("P-M13", "K. Negi", "FIELD_GUIDE", NODES.MAITRI),
  person("P-KULKARNI", "S. Kulkarni", "LOGISTICS_OFFICER", NODES.MAITRI),
  person("P-M14", "A. Khan", "TECHNICIAN", NODES.MAITRI),
  person("P-M15", "P. Mishra", "TECHNICIAN", NODES.MAITRI),
  person("P-M16", "E. D'Souza", "TECHNICIAN", NODES.MAITRI),
  person("P-M17", "Y. Chauhan", "TECHNICIAN", NODES.MAITRI),
];

/** Bharati (FILLED): section 13 only says "personnel at need + 1". */
const bharatiPeople: Person[] = [
  person("P-B01", "Cdr N. Menon", "STATION_LEADER", NODES.BHARATI),
  person("P-B02", "Dr S. Ghosh", "DOCTOR", NODES.BHARATI),
  person("P-B03", "Dr I. Rao", "DOCTOR", NODES.BHARATI),
  person("P-B04", "F. Ali", "DIESEL_MECHANIC", NODES.BHARATI),
  person("P-B05", "O. Singh", "DIESEL_MECHANIC", NODES.BHARATI),
  person("P-B06", "U. Varma", "COMMS_ENGINEER", NODES.BHARATI),
  person("P-B07", "W. Dutta", "COMMS_ENGINEER", NODES.BHARATI),
  person("P-B08", "Z. Kamath", "COOK", NODES.BHARATI),
  person("P-B09", "Q. Lobo", "COOK", NODES.BHARATI),
];

// ---- Inventory and burn profiles -------------------------------------------------------------

const item = (
  id: string,
  node_id: string,
  name: string,
  dimension: Item["dimension"],
  unit: string,
  stock: number,
  /** Reserve as a fraction of the requirement: 0.1 = 10 % (section 13). */
  reserve_pct: number,
  requirement: { mode: "BURN" } | { mode: "FIXED"; qty: number },
  last_counted: string,
): Item => ({
  id,
  node_id,
  name,
  category: dimension,
  unit,
  stock,
  reserve_pct,
  requirement_mode: requirement.mode,
  fixed_requirement: requirement.mode === "FIXED" ? requirement.qty : null,
  dimension,
  last_counted,
  count_source: "STATION_COUNT",
});

const inventory_items: Seed["inventory_items"] = [
  // Maitri (section 13 table)
  item(IDS.dieselMaitri, NODES.MAITRI, "Diesel", "FUEL", "kL", 92.0, 0.1, { mode: "BURN" }, at("2027-01-24", "04:00")),
  item(IDS.foodMaitri, NODES.MAITRI, "Food", "FOOD", "person-days", 8900, 0.15, { mode: "BURN" }, at("2027-01-23", "20:00")),
  item(IDS.medKitsMaitri, NODES.MAITRI, "Winter medical kits", "MEDICAL", "kits", 10, 0.5, { mode: "FIXED", qty: 6 }, at("2027-01-22", "10:00")),
  item(IDS.oxygenMaitri, NODES.MAITRI, "Oxygen cylinders", "MEDICAL", "cylinders", 20, 0.5, { mode: "FIXED", qty: 12 }, at("2027-01-22", "10:00")),
  item(IDS.gensetKitsMaitri, NODES.MAITRI, "Genset overhaul kits", "SPARES_POWER", "kits", 4, 0.5, { mode: "FIXED", qty: 2 }, at("2027-01-20", "10:00")),
  // Bharati: diesel from section 13; other lines FILLED to ratios between 1.09 and 1.30.
  item(IDS.dieselBharati, NODES.BHARATI, "Diesel", "FUEL", "kL", 135.0, 0.1, { mode: "BURN" }, at("2027-01-24", "06:00")),
  item(IDS.foodBharati, NODES.BHARATI, "Food", "FOOD", "person-days", 3700, 0.15, { mode: "BURN" }, at("2027-01-23", "20:00")),
  item(IDS.medKitsBharati, NODES.BHARATI, "Winter medical kits", "MEDICAL", "kits", 7, 0.5, { mode: "FIXED", qty: 4 }, at("2027-01-22", "10:00")),
  item(IDS.oxygenBharati, NODES.BHARATI, "Oxygen cylinders", "MEDICAL", "cylinders", 14, 0.5, { mode: "FIXED", qty: 8 }, at("2027-01-22", "10:00")),
  item(IDS.gensetKitsBharati, NODES.BHARATI, "Genset overhaul kits", "SPARES_POWER", "kits", 5, 0.5, { mode: "FIXED", qty: 3 }, at("2027-01-20", "10:00")),
];

const burn = (item_id: string, closing: number, winter: number, mobilisation: number): Seed["consumption_profiles"] => [
  { item_id, phase: "CLOSING", rate_per_day: closing },
  { item_id, phase: "WINTER", rate_per_day: winter },
  { item_id, phase: "MOBILISATION", rate_per_day: mobilisation },
];

/**
 * Food is one person-day per person per day, so R_base = headcount x 300 days (section 13: 24 x 300
 * = 7200). FILLED: the schema has no headcount-driven mode, so BURN at the seed headcount stands in.
 * TODO(A): under C9 the engine derives this from POB, so PERSON_MOVED changes it (T-ENG-20: 23 people -> 7935).
 */
const foodBurn = (item_id: string, headcount: number) => burn(item_id, headcount, headcount, headcount);

const consumption_profiles: Seed["consumption_profiles"] = [
  ...burn(IDS.dieselMaitri, 0.55, 0.38, 0.35),
  ...foodBurn(IDS.foodMaitri, maitriPeople.length),
  ...burn(IDS.dieselBharati, 0.5, 0.34, 0.4),
  ...foodBurn(IDS.foodBharati, bharatiPeople.length),
];

// ---- Inbound shipments -----------------------------------------------------------------------

const shipments: Seed["shipments"] = [
  { id: IDS.shipmentC104, name: "Diesel 48.0 kL (ISO tank)", priority: "CRITICAL", dest_node_id: NODES.MAITRI },
  { id: IDS.shipmentC107, name: "Medical kits x2, genset kits x1", priority: "HIGH", dest_node_id: NODES.MAITRI },
  { id: IDS.shipmentC112, name: "Science equipment", priority: "NORMAL", dest_node_id: NODES.MAITRI },
];

const vesselLeg = (id: string, shipment_id: string): Seed["legs"][number] => ({
  id,
  shipment_id,
  seq: 3,
  from_node: NODES.CAPE_TOWN,
  to_node: NODES.MAITRI,
  etd: day("2027-02-06"),
  eta: day("2027-02-24"),
  vessel_id: IDS.vessel,
  status: "PLANNED",
});

/** C-107 and C-112 list only their L2 ETA and "then on MV Ice Star"; L2 ETDs are unknown (FILLED: null). */
const legs: Seed["legs"] = [
  { id: IDS.legC104Road, shipment_id: IDS.shipmentC104, seq: 1, from_node: NODES.HQ, to_node: NODES.MUMBAI, etd: day("2027-01-10"), eta: day("2027-01-12"), vessel_id: null, status: "DONE" },
  { id: IDS.legC104Feeder, shipment_id: IDS.shipmentC104, seq: 2, from_node: NODES.MUMBAI, to_node: NODES.CAPE_TOWN, etd: day("2027-01-12"), eta: day("2027-02-02"), vessel_id: null, status: "IN_TRANSIT" },
  vesselLeg(IDS.legC104Vessel, IDS.shipmentC104),
  { id: IDS.legC107Feeder, shipment_id: IDS.shipmentC107, seq: 2, from_node: NODES.MUMBAI, to_node: NODES.CAPE_TOWN, etd: null, eta: day("2027-01-30"), vessel_id: null, status: "IN_TRANSIT" },
  vesselLeg(IDS.legC107Vessel, IDS.shipmentC107),
  { id: IDS.legC112Feeder, shipment_id: IDS.shipmentC112, seq: 2, from_node: NODES.MUMBAI, to_node: NODES.CAPE_TOWN, etd: null, eta: day("2027-02-03"), vessel_id: null, status: "IN_TRANSIT" },
  vesselLeg(IDS.legC112Vessel, IDS.shipmentC112),
];

/** C-112's science equipment is not a tracked inventory line, so it has no cargo row. */
const cargo_items: Seed["cargo_items"] = [
  { id: "CG-C104-DSL", shipment_id: IDS.shipmentC104, inventory_item_id: IDS.dieselMaitri, qty: 48.0 },
  { id: "CG-C107-MEDKIT", shipment_id: IDS.shipmentC107, inventory_item_id: IDS.medKitsMaitri, qty: 2 },
  { id: "CG-C107-GENKIT", shipment_id: IDS.shipmentC107, inventory_item_id: IDS.gensetKitsMaitri, qty: 1 },
];

// ---- Assets ----------------------------------------------------------------------------------

const MAITRI_POS = { lat: -70.77, lon: 11.73 };
const BHARATI_POS = { lat: -69.41, lon: 76.19 };

const asset = (id: string, node_id: string, type: string, speed_kmh: number | null, pos: { lat: number; lon: number } | null): Asset => ({
  id,
  node_id,
  type,
  status: "OK",
  lat: pos?.lat ?? null,
  lon: pos?.lon ?? null,
  last_seen: START,
  speed_kmh,
});

const assets: Seed["assets"] = [
  asset("GEN-1", NODES.MAITRI, "Generator", null, MAITRI_POS),
  asset("GEN-2", NODES.MAITRI, "Generator", null, MAITRI_POS),
  asset("GEN-3", NODES.MAITRI, "Generator", null, MAITRI_POS),
  asset("VSAT-1", NODES.MAITRI, "VSAT", null, MAITRI_POS),
  asset("IRD-1", NODES.MAITRI, "Iridium", null, MAITRI_POS),
  asset("SK-1", NODES.MAITRI, "Skidoo", 30, MAITRI_POS),
  asset(IDS.skidoo2, NODES.MAITRI, "Skidoo", 30, MAITRI_POS),
  asset("SK-3", NODES.MAITRI, "Skidoo", 30, MAITRI_POS),
  // Out with FT-3 on F-27 support; its position is the team's check-in, not a seed value.
  asset(IDS.skidoo4, NODES.MAITRI, "Skidoo", 30, null),
  asset("SK-5", NODES.MAITRI, "Skidoo", 30, MAITRI_POS),
  asset(IDS.snowTractor, NODES.MAITRI, "Snow tractor", 15, MAITRI_POS),
  asset(IDS.helicopter, NODES.MAITRI, "Helicopter", 120, MAITRI_POS),
  // Bharati (FILLED): generator redundancy and comms, all OK.
  asset("BH-GEN-1", NODES.BHARATI, "Generator", null, BHARATI_POS),
  asset("BH-GEN-2", NODES.BHARATI, "Generator", null, BHARATI_POS),
  asset("BH-GEN-3", NODES.BHARATI, "Generator", null, BHARATI_POS),
  asset("BH-VSAT-1", NODES.BHARATI, "VSAT", null, BHARATI_POS),
  asset("BH-IRD-1", NODES.BHARATI, "Iridium", null, BHARATI_POS),
];

// ---- Missions, levers, dependencies ----------------------------------------------------------

const needs = (people: string[], assetIds: string[]) => JSON.stringify({ people, assets: assetIds });

const missions: Seed["missions"] = [
  {
    id: IDS.missionF27,
    node_id: NODES.MAITRI,
    name: "Ice-core traverse support",
    start_date: day("2027-02-03"),
    end_date: day("2027-02-10"),
    fuel_kl: 4.0,
    needs: needs([IDS.personVerma, IDS.personNair], [IDS.skidoo4]),
    status: "PLANNED",
  },
  {
    id: IDS.missionF31,
    node_id: NODES.MAITRI,
    name: "Weather mast service",
    start_date: day("2027-02-12"),
    end_date: day("2027-02-13"),
    fuel_kl: 0.3,
    // Section 13 says "2 people" without names (FILLED).
    needs: needs(["P-M10", "P-M14"], []),
    status: "PLANNED",
  },
];

/** Deadline = cutoff - lead_days (section 13: 3 Feb, 31 Jan, 2 Feb, 27 Feb). Effect is JSON. */
const levers: Seed["levers"] = [
  {
    id: LEVERS.holdVessel,
    node_id: NODES.MAITRI,
    label: "Hold MV Ice Star for C-104",
    effect: JSON.stringify({ adds_kl: 48.0, item_id: IDS.dieselMaitri, shipment_id: IDS.shipmentC104, vessel_departure: day("2027-02-09") }),
    cutoff: day("2027-02-06"),
    lead_days: 3,
    // 6.5 lakh per day x 3 days
    cost_amount: 19.5,
    cost_unit: "lakh INR",
    synthetic: 1,
  },
  {
    id: LEVERS.airliftPartial,
    node_id: NODES.MAITRI,
    label: "Partial diesel airlift",
    effect: JSON.stringify({ adds_kl: 12.0, item_id: IDS.dieselMaitri }),
    cutoff: day("2027-02-09"),
    lead_days: 9,
    cost_amount: 48,
    cost_unit: "lakh INR",
    synthetic: 1,
  },
  {
    id: LEVERS.deferF27,
    node_id: NODES.MAITRI,
    label: "Defer F-27 ice-core traverse",
    effect: JSON.stringify({ saves_kl: 4.0, item_id: IDS.dieselMaitri, mission_id: IDS.missionF27 }),
    cutoff: day("2027-02-03"),
    lead_days: 1,
    cost_amount: null,
    cost_unit: "research impact",
    synthetic: 1,
  },
  {
    id: LEVERS.conserve,
    node_id: NODES.MAITRI,
    label: "Conserve diesel",
    effect: JSON.stringify({ saves_kl: 8.0, item_id: IDS.dieselMaitri }),
    cutoff: day("2027-03-01"),
    lead_days: 2,
    cost_amount: null,
    cost_unit: "comfort and ops impact",
    synthetic: 1,
  },
];

/** Only non-obvious edges are stored; the engine derives the rest from foreign keys (section 5). */
const dependencies: Seed["dependencies"] = missions.map((m) => ({ from_type: "mission", from_id: m.id, to_type: "inventory_item", to_id: IDS.dieselMaitri, kind: "DRAWS_FROM" }));

const link_state: Seed["link_state"] = [NODES.HQ, NODES.MAITRI, NODES.BHARATI].map((node_id) => ({ node_id, status: "ONLINE", last_contact: START }));

export const season48: Seed = {
  nodes,
  vessels,
  shipments,
  legs,
  inventory_items,
  consumption_profiles,
  cargo_items,
  personnel: [...maitriPeople, ...bharatiPeople],
  assets,
  missions,
  levers,
  dependencies,
  link_state,
};
