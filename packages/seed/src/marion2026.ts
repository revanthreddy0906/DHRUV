import type { Seed } from "@dhruv/shared";
import type { BeatEvent, DirectorBeat } from "./director.js";
import { DEVICES, IDS, LEVERS, NODES } from "./ids.js";
import { season48 } from "./season48.js";

/**
 * Real-incident scenario: the Marion Island polar-diesel crisis, April to August 2026, replayed on
 * DHRUV's Maitri. South Africa's relief ship SA Agulhas II could not sail on 9 April because the
 * polar diesel the base needs was unavailable; on 14 May the minister ordered the 20-member team
 * evacuated; they were home on 27 May and the base was reactivated in August. Each beat carries what
 * really happened and its source; see docs/run-through-marion-2026.md.
 *
 * Adaptation, stated wherever the scenario is shown:
 * - Marion Island becomes Maitri; SA Agulhas II becomes MV Ice Star (its relief voyage) and
 *   "MV Ice Star (evacuation run)"; real days are kept, moved to 2027.
 * - All fuel volumes, burn rates, the reserve and the lever figures are illustrative. No public
 *   source gives Marion's tank volumes or burn rate. They are chosen so the engine's arithmetic on
 *   9 May brackets the real 14 May departure; it is not a prediction.
 *
 * Modelling (engine season override, Seed.season): the fuel requirement runs from now to the relief
 * vessel's current arrival, and the reserve-breach date is counted from now, so every slip of the
 * relief voyage moves the horizon. EVACUATE's cutoff is the reserve-breach date minus 3 days on base.
 */

const day = (d: string) => `${d}T00:00:00.000Z`;
const at = (d: string, hhmm: string) => `${d}T${hhmm}:00.000Z`;

export const MARION = {
  relief: "P-200",
  reliefFeeder: "L1-P200",
  reliefVesselLeg: "L2-P200",
  evacShipment: "E-01",
  evacLeg: "L1-E01",
  evacVessel: "V-EVAC",
  voyageNode: "VOYAGE",
  nextSupply: "P-210",
  decision: "DEC-MARION",
  decisionEvac: "DEC-MARION-EVAC",
  evacuate: "EVACUATE",
} as const;

/** The 20 winterers (REAL team size): season48's Maitri roster less four scientists and a technician, all on station. */
const DROPPED = new Set(["P-M10", "P-M11", "P-M12", "P-M17"]);
const team: Seed["personnel"] = season48.personnel
  .filter((p) => p.node_id === NODES.MAITRI && !DROPPED.has(p.id))
  .map((p) => ({ ...p, status: "ON_STATION", last_seen: at("2027-04-01", "06:00") }));
export const MARION_TEAM = team.map((p) => p.id);

const DIESEL_START = 32.4;

export const marion2026Seed: Seed = {
  ...season48,
  nodes: [
    ...season48.nodes,
    { id: MARION.voyageNode, name: "MV Ice Star (voyage)", type: "VESSEL", lat: -52.0, lon: 25.0 },
  ],
  vessels: [
    // The annual relief voyage, due to sail 9 Apr 14:00 with the polar diesel (5 days' transit).
    { id: IDS.vessel, name: "MV Ice Star (relief voyage)", departure: at("2027-04-09", "14:00"), load_cutoff: day("2027-04-08"), eta_station: day("2027-04-14"), station_closing_date: day("2028-03-31") },
    // The same ship sent without fuel to bring the team home; its dates are set when it sails.
    { id: MARION.evacVessel, name: "MV Ice Star (evacuation run)", departure: day("2027-06-30"), load_cutoff: day("2027-06-29"), eta_station: day("2027-07-05"), station_closing_date: day("2028-03-31") },
  ],
  shipments: [
    { id: MARION.relief, name: "Polar diesel (relief)", priority: "CRITICAL", dest_node_id: NODES.MAITRI },
    { id: MARION.evacShipment, name: "Evacuation run (people, no cargo)", priority: "CRITICAL", dest_node_id: NODES.MAITRI },
  ],
  legs: [
    { id: MARION.reliefFeeder, shipment_id: MARION.relief, seq: 1, from_node: NODES.CAPE_TOWN, to_node: NODES.CAPE_TOWN, etd: day("2027-04-01"), eta: day("2027-04-07"), vessel_id: null, status: "IN_TRANSIT" },
    { id: MARION.reliefVesselLeg, shipment_id: MARION.relief, seq: 2, from_node: NODES.CAPE_TOWN, to_node: NODES.MAITRI, etd: at("2027-04-09", "14:00"), eta: day("2027-04-14"), vessel_id: IDS.vessel, status: "PLANNED" },
    { id: MARION.evacLeg, shipment_id: MARION.evacShipment, seq: 1, from_node: NODES.CAPE_TOWN, to_node: NODES.MAITRI, etd: null, eta: day("2027-07-05"), vessel_id: MARION.evacVessel, status: "PLANNED" },
  ],
  inventory_items: season48.inventory_items.map((i) => {
    if (i.id === IDS.dieselMaitri) return { ...i, stock: DIESEL_START, reserve_pct: 0.2, last_counted: at("2027-04-01", "06:00") };
    // 20 people eat 20 person-days a day: 1,960 on 1 Apr leaves about two months on 9 May (REAL "about two more months").
    if (i.id === IDS.foodMaitri) return { ...i, stock: 1960, last_counted: at("2027-04-01", "06:00") };
    return { ...i, last_counted: at("2027-04-01", "06:00") };
  }),
  // One winter phase: Maitri diesel 0.60 kL/day (illustrative); the other items keep season48's winter rates.
  consumption_profiles: [
    ...season48.consumption_profiles.filter((p) => p.item_id !== IDS.dieselMaitri),
    { item_id: IDS.dieselMaitri, phase: "WINTER", rate_per_day: 0.6 },
  ],
  cargo_items: [{ id: "CG-P200-DSL", shipment_id: MARION.relief, inventory_item_id: IDS.dieselMaitri, qty: 60.0 }],
  personnel: [...season48.personnel.filter((p) => p.node_id !== NODES.MAITRI), ...team],
  missions: [],
  dependencies: [],
  levers: [
    {
      // Load-shedding: a quarter less diesel. Station-level, approved by the Station Leader.
      id: LEVERS.conserve, node_id: NODES.MAITRI, label: "Load-shedding (conserve diesel)",
      effect: JSON.stringify({ burn_rate_uplift: -0.25, item_id: IDS.dieselMaitri }),
      cutoff: day("2027-06-30"), lead_days: 0, cost_amount: null, cost_unit: "comfort and science impact", synthetic: 1,
    },
    {
      // Evacuate and shut the base: only frost protection keeps burning (70 % less). The ship must
      // arrive with 3 days on base before the reserve is breached, and the run takes 4 days.
      id: MARION.evacuate, node_id: NODES.MAITRI, label: "Evacuate the team and shut the base",
      effect: JSON.stringify({ burn_rate_uplift: -0.7, item_id: IDS.dieselMaitri, cutoff_before_breach_days: 3 }),
      cutoff: day("2027-06-30"), lead_days: 4, cost_amount: null, cost_unit: "overwintering season lost", synthetic: 1,
    },
  ],
  link_state: season48.link_state.map((l) => ({ ...l, last_contact: at("2027-04-01", "06:00") })),
  season: {
    phases: [{ phase: "WINTER", start: day("2027-04-01"), end: day("2028-04-01") }],
    resupply: { vesselId: IDS.vessel },
  },
};

const SRC = {
  dffe: "https://www.dffe.gov.za/mediarelease/sa.agulhasII%20eparture_marionislanddelayed",
  maverick: "https://www.dailymaverick.co.za/article/2026-05-09-iran-war-fuel-chaos-hits-sub-antarctic-as-remote-marion-relief-voyage-severely-delayed/",
  mg: "https://mg.co.za/the-green-guardian/2026-05-15-marion-island-team-to-be-evacuated-after-polar-diesel-shortage-delays-sa-agulhas-ii-voyage/",
  evacOrder: "https://www.sanews.gov.za/south-africa/government-orders-urgent-evacuation-overwintering-team-marion-island",
  knots: "https://x.com/Antarcticlegacy/status/2055574320026456347",
  shutDown: "https://www.sabcnews.com/sabcnews/marion-island-base-to-be-shut-down-over-fuel-shortage/",
  home: "https://www.dffe.gov.za/mediarelease/aucamp_ensuressafereturn_voyagedelays",
  reactivation: "https://www.sanews.gov.za/south-africa/sa-agulhas-ii-arrives-safely-marion-island",
  relief2025: "https://mousefreemarion.org/were-going-back-to-marion-island-the-team-embarks-on-another-relief-voyage-to-the-island/",
};

const server = (type: BeatEvent["type"], entity_type: string, entity_id: string, node_id: string, payload: Record<string, unknown>, observed_at: string, actor_role: BeatEvent["actor_role"] = "HQ_OPS"): BeatEvent =>
  ({ device_id: DEVICES.DIRECTOR, actor_role, node_id, type, entity_type, entity_id, payload, observed_at });
// Bharati is not part of the incident: its routine counts keep it current so HQ's attention list stays on Maitri.
const bharatiCounts = (observed_at: string): BeatEvent[] =>
  marion2026Seed.inventory_items.filter((i) => i.node_id === NODES.BHARATI)
    .map((i) => server("STOCK_COUNTED", "inventory_item", i.id, NODES.BHARATI, { item_id: i.id, qty: i.stock }, observed_at, "STATION_LEADER"));
// Maitri's other stores, counted with the diesel on 5, 9 and 13 May so only the diesel story needs attention.
const storesCount = (food: number, observed_at: string): BeatEvent[] =>
  marion2026Seed.inventory_items.filter((i) => i.node_id === NODES.MAITRI && i.id !== IDS.dieselMaitri)
    .map((i) => ({ device_id: DEVICES.MAITRI_TAB, actor_role: "STATION_LEADER", node_id: NODES.MAITRI, type: "STOCK_COUNTED", entity_type: "inventory_item", entity_id: i.id, payload: { item_id: i.id, qty: i.id === IDS.foodMaitri ? food : i.stock }, observed_at }));
const count = (qty: number, observed_at: string): BeatEvent =>
  ({ device_id: DEVICES.MAITRI_TAB, actor_role: "STATION_LEADER", node_id: NODES.MAITRI, type: "STOCK_COUNTED", entity_type: "inventory_item", entity_id: IDS.dieselMaitri, payload: { item_id: IDS.dieselMaitri, qty }, observed_at });
const link = (status: "ONLINE" | "DEGRADED" | "OFFLINE", observed_at: string): BeatEvent =>
  ({ device_id: DEVICES.MAITRI_TAB, actor_role: "SYSTEM", node_id: NODES.MAITRI, type: "LINK_STATE_SET", entity_type: "node", entity_id: NODES.MAITRI, payload: { node_id: NODES.MAITRI, status }, observed_at });
const vessel = (vessel_id: string, departure: string, load_cutoff: string, eta_station: string, observed_at: string): BeatEvent =>
  server("VESSEL_UPDATED", "vessel", vessel_id, NODES.HQ, { vessel_id, departure, load_cutoff, eta_station }, observed_at);
const moved = (device_id: string, actor_role: BeatEvent["actor_role"], node_id: string, from: string, to: string, when: string): BeatEvent[] =>
  MARION_TEAM.map((person_id) => ({ device_id, actor_role, node_id, type: "PERSON_MOVED", entity_type: "person", entity_id: person_id, payload: { person_id, from_node: from, to_node: to, depart: when, arrive: when }, observed_at: when }));

export const MARION_BEATS: DirectorBeat[] = [
  {
    beat: "M0", label: "Season clock to 1 Apr 2027: the team waits for the relief voyage", where: "client", events: [], clockJump: at("2027-04-01", "08:00"),
    real: { when: "Apr 2025 – Apr 2026", text: "The overwintering team has been on the island since the previous relief voyage (Cape Town, 18 Apr 2025). The annual relief brings the next team, fuel and food.", source: SRC.relief2025 },
  },
  {
    beat: "M1", label: "Polar diesel blend unavailable: relief fuel misses the load cut-off", where: "server", advanceClock: true,
    events: [server("LEG_DELAYED", "leg", MARION.reliefFeeder, NODES.HQ, { leg_id: MARION.reliefFeeder, new_eta: day("2027-04-25"), reason: "polar diesel blend unavailable" }, at("2027-04-07", "18:00"))],
    real: { when: "early Apr 2026", text: "The specialised polar diesel is not available: global fuel-product supply is disrupted by the Middle East war.", source: SRC.maverick },
  },
  {
    beat: "M2", label: "The relief voyage stays in port", where: "server", advanceClock: true,
    events: [vessel(IDS.vessel, day("2027-04-28"), day("2027-04-27"), day("2027-05-03"), at("2027-04-09", "14:00"))],
    real: { when: "9 Apr 2026, 14:00", text: "SA Agulhas II was due to sail for Marion Island at 14:00. It stays in port.", source: SRC.maverick },
  },
  {
    beat: "M3", label: "No other refinery has the product: relief moves to May", where: "server", advanceClock: true,
    events: [
      server("LEG_DELAYED", "leg", MARION.reliefFeeder, NODES.HQ, { leg_id: MARION.reliefFeeder, new_eta: day("2027-05-01"), reason: "no refinery has the product" }, at("2027-04-25", "12:00")),
      vessel(IDS.vessel, day("2027-05-07"), day("2027-05-06"), day("2027-05-12"), at("2027-04-25", "12:05")),
    ],
    real: { when: "Apr 2026", text: "The department also checks the refineries in East London, Port Elizabeth (Gqeberha) and Durban; none has the product.", source: SRC.dffe },
  },
  {
    beat: "M4", label: "Diesel reaches the refinery: blend and lab test before loading", where: "server", advanceClock: true,
    events: [...bharatiCounts(at("2027-05-01", "08:00")), server("LEG_UPDATED", "leg", MARION.reliefFeeder, NODES.HQ, { leg_id: MARION.reliefFeeder, eta: day("2027-05-05"), status: "IN_TRANSIT" }, at("2027-05-01", "10:00"))],
    real: { when: "1 May 2026", text: "A diesel shipment reaches the Cape Town refinery. It must be blended and laboratory-tested; delivery to the ship is expected within two days of lab confirmation.", source: SRC.dffe },
  },
  {
    beat: "M5", label: "Daily diesel counts at Maitri: 5, 6 and 7 May", where: "client", advanceClock: true,
    events: [...storesCount(1280, at("2027-05-05", "05:30")), count(12.0, at("2027-05-05", "06:00")), count(11.4, at("2027-05-06", "06:00")), count(10.8, at("2027-05-07", "06:00"))],
    real: { when: "May 2026", text: "Fuel levels on the island are checked every day.", source: SRC.mg },
  },
  {
    beat: "M5b", label: "8 May count, by hand", where: "operator", advanceClock: true,
    operator: {
      device_id: DEVICES.MAITRI_TAB,
      instruction: "Maitri tab → Demo dock: jump to 8 May 06:00 → Inventory → Count, Diesel, 10.2 → Submit",
      expect: { type: "STOCK_COUNTED", payload: { item_id: IDS.dieselMaitri, qty: 10.2 } },
    },
    events: [count(10.2, at("2027-05-08", "06:00"))],
    real: { when: "May 2026", text: "Fuel levels on the island are checked every day.", source: SRC.mg },
  },
  {
    beat: "M6", label: "9 May: count 9.6 kL; Maitri's VSAT slows (Degraded)", where: "client", advanceClock: true,
    events: [...storesCount(1200, at("2027-05-09", "05:30")), count(9.6, at("2027-05-09", "06:00")), link("DEGRADED", at("2027-05-09", "06:05"))],
    real: { when: "9 May 2026", text: "The VSAT line is in use but its bandwidth is low while it is reconfigured.", source: SRC.dffe },
  },
  {
    beat: "M6b", label: "Departure postponed until the fuel passes its lab test", where: "server", advanceClock: true,
    events: [...bharatiCounts(at("2027-05-09", "06:00")),
      server("LEG_DELAYED", "leg", MARION.reliefFeeder, NODES.HQ, { leg_id: MARION.reliefFeeder, new_eta: day("2027-06-01"), reason: "blend not yet confirmed by the laboratory (date to be confirmed)" }, at("2027-05-09", "06:30")),
      vessel(IDS.vessel, day("2027-05-30"), day("2027-05-29"), day("2027-06-03"), at("2027-05-09", "06:35")),
    ],
    real: { when: "9 May 2026", text: "Public statement: departure delayed by global fuel-product scarcity. Polar diesel lasts until about 20 May without fuel-saving measures; food about two more months. Contingencies: reserve fuel and food, backup petrol generators, 9 stocked huts.", source: SRC.dffe },
  },
  {
    beat: "M6c", label: "The engine proposes DEC-MARION: evacuate, conserve, or both", where: "server",
    resolveTrigger: { type: "VESSEL_UPDATED", entity_id: IDS.vessel },
    proposeFromEngine: { node_id: NODES.MAITRI },
    events: [server("DECISION_PROPOSED", "decision", MARION.decision, NODES.MAITRI, { decision_id: MARION.decision, trigger_event_id: "", options: [], trace: [] }, at("2027-05-09", "07:00"), "SYSTEM")],
    real: { when: "9 May 2026", text: "Fuel lasts to about 20 May without saving measures: the question becomes when a ship must leave to be back in time.", source: SRC.dffe },
  },
  {
    beat: "M7", label: "Maitri starts load-shedding (Station Leader approves Conserve)", where: "operator", advanceClock: true,
    operator: {
      device_id: DEVICES.MAITRI_TAB,
      instruction: "Maitri tab → Decisions → DEC-MARION → choose the Conserve option → Approve",
      expect: { type: "DECISION_APPROVED", payload: { decision_id: MARION.decision } },
    },
    events: [{
      device_id: DEVICES.MAITRI_TAB, actor_role: "STATION_LEADER", node_id: NODES.MAITRI, type: "DECISION_APPROVED", entity_type: "decision", entity_id: MARION.decision,
      payload: { decision_id: MARION.decision, chosen_option_id: "OPT-3", approver: DEVICES.MAITRI_TAB, verify_ack: false }, observed_at: at("2027-05-09", "10:00"),
    }],
    real: { when: "May 2026", text: "Reported by a team member's relative, not confirmed by the department: the station is load-shedding power to stretch its fuel.", source: SRC.maverick },
  },
  {
    beat: "M8", label: "Maitri's link drops out (adaptation)", where: "client", advanceClock: true,
    events: [link("OFFLINE", at("2027-05-10", "00:00"))],
    real: { when: "May 2026", text: "Adaptation: the real link stayed up at low bandwidth. An outage here makes HQ's view of the daily counts go stale.", source: SRC.dffe },
  },
  {
    beat: "M9", label: "Refinery cannot make polar diesel: relief fuel gone", where: "server", advanceClock: true,
    events: [...bharatiCounts(at("2027-05-12", "08:00")), server("LEG_DELAYED", "leg", MARION.reliefFeeder, NODES.HQ, { leg_id: MARION.reliefFeeder, new_eta: day("2027-12-31"), reason: "national kerosene shortage: refinery cannot produce the blend" }, at("2027-05-12", "12:00"))],
    real: { when: "by 15 May 2026", text: "The Cape Town refinery confirms it cannot produce the polar diesel because of a national kerosene shortage. Aviation fuel for the ship's helicopters has to come from Durban (not tracked here).", source: SRC.mg },
  },
  {
    beat: "M9b", label: "The engine proposes DEC-MARION-EVAC", where: "server",
    resolveTrigger: { type: "LEG_DELAYED", entity_id: MARION.reliefFeeder },
    proposeFromEngine: { node_id: NODES.MAITRI },
    events: [server("DECISION_PROPOSED", "decision", MARION.decisionEvac, NODES.MAITRI, { decision_id: MARION.decisionEvac, trigger_event_id: "", options: [], trace: [] }, at("2027-05-12", "12:30"), "SYSTEM")],
    real: { when: "12–14 May 2026", text: "With no fuel in sight, evacuation is the remaining option.", source: SRC.mg },
  },
  {
    beat: "M10", label: "Maitri keeps counting while offline (10–13 May)", where: "client", advanceClock: true,
    events: [...storesCount(1120, at("2027-05-13", "05:30")), count(9.15, at("2027-05-10", "06:00")), count(8.7, at("2027-05-11", "06:00")), count(8.25, at("2027-05-12", "06:00")), count(7.8, at("2027-05-13", "06:00"))],
    real: { when: "May 2026", text: "Fuel levels are monitored daily; food is enough though some items are running low.", source: SRC.mg },
  },
  {
    beat: "M11", label: "HQ orders the evacuation (verify first)", where: "operator",
    operator: {
      device_id: DEVICES.HQ_WEB,
      instruction: "HQ tab → Decisions → DEC-MARION-EVAC → tick 'verified' → Approve the Evacuate option",
      expect: { type: "DECISION_APPROVED", payload: { decision_id: MARION.decisionEvac } },
    },
    events: [],
    approve: { decision_id: MARION.decisionEvac, chosen_option_id: "OPT-1", verify_ack: true, observed_at: at("2027-05-14", "09:00") },
    real: { when: "14 May 2026", text: "Minister Willie Aucamp orders the urgent evacuation of the overwintering team.", source: SRC.evacOrder },
  },
  {
    beat: "M11b", label: "The ship sails for Maitri without fuel", where: "server", advanceClock: true,
    events: [...bharatiCounts(at("2027-05-14", "11:00")),
      vessel(MARION.evacVessel, at("2027-05-14", "12:00"), day("2027-05-14"), at("2027-05-18", "06:00"), at("2027-05-14", "12:00")),
      server("LEG_UPDATED", "leg", MARION.evacLeg, NODES.HQ, { leg_id: MARION.evacLeg, etd: at("2027-05-14", "12:00"), eta: at("2027-05-18", "06:00"), status: "IN_TRANSIT" }, at("2027-05-14", "12:05")),
    ],
    real: { when: "14 May 2026", text: "Weather in Cape Town clears, the helicopters land on the ship and it sails the same day. Plan: arrive Monday 18 May, 3 to 5 days at the base.", source: SRC.evacOrder },
  },
  {
    beat: "M12", label: "About 16 knots, on time for 18 May 06:00", where: "server", advanceClock: true,
    events: [server("LEG_UPDATED", "leg", MARION.evacLeg, NODES.HQ, { leg_id: MARION.evacLeg, eta: at("2027-05-18", "06:00"), status: "IN_TRANSIT" }, at("2027-05-16", "12:00"))],
    real: { when: "16 May 2026", text: "The ship is making about 16 knots and is due at Marion Island on 18 May at 06:00 (DFFE, via Antarctic Legacy of South Africa).", source: SRC.knots },
  },
  {
    beat: "M13", label: "The ship arrives", where: "server", advanceClock: true,
    events: [...bharatiCounts(at("2027-05-18", "05:00")), server("LEG_UPDATED", "leg", MARION.evacLeg, NODES.HQ, { leg_id: MARION.evacLeg, eta: at("2027-05-18", "06:00"), status: "DONE" }, at("2027-05-18", "06:00"))],
    real: { when: "18 May 2026", text: "Scheduled arrival at the island.", source: SRC.knots },
  },
  {
    beat: "M13b", label: "Maitri's link back: the outbox drains", where: "client",
    events: [link("ONLINE", at("2027-05-18", "06:30"))],
    real: { when: "18 May 2026", text: "Adaptation: everything Maitri recorded while offline reaches HQ in priority order.", source: SRC.knots },
  },
  {
    beat: "M14", label: "The 20 board the ship; the base is shut down", where: "client", advanceClock: true,
    events: moved(DEVICES.MAITRI_TAB, "STATION_LEADER", NODES.MAITRI, NODES.MAITRI, MARION.voyageNode, at("2027-05-21", "16:00")),
    real: { when: "18–21 May 2026", text: "The ship spends a few days at the base and leaves with the whole team; the base is shut down.", source: SRC.shutDown },
  },
  {
    beat: "M15", label: "Team home in Cape Town", where: "client", advanceClock: true,
    events: moved(DEVICES.HQ_WEB, "HQ_OPS", NODES.HQ, MARION.voyageNode, NODES.CAPE_TOWN, at("2027-05-27", "14:00")),
    real: { when: "27 May 2026", text: "Ship and team arrive in Cape Town (the plan had said about 28 May). The minister says an 18-month supply of polar diesel has been secured.", source: SRC.home },
  },
  {
    beat: "M15b", label: "Next relief voyage scheduled for August", where: "server", advanceClock: true,
    events: [...bharatiCounts(at("2027-05-27", "14:00")), vessel(IDS.vessel, day("2027-08-05"), day("2027-08-04"), day("2027-08-09"), at("2027-05-27", "15:00"))],
    real: { when: "5–9 Aug 2026", text: "The reactivation voyage sails on 5 August with a 32-member team (20 public-works staff) and the next team; it arrives on 9 August.", source: SRC.reactivation },
  },
  {
    beat: "M16", label: "HQ books the secured polar diesel for August", where: "operator", advanceClock: true,
    operator: {
      device_id: DEVICES.HQ_WEB,
      instruction: "HQ tab → Cargo → New shipment: 'Polar diesel (18-month supply)', to Maitri, feeder ETA 1 Aug, loads on MV Ice Star (relief voyage), cargo Diesel 60 → Create shipment",
      expect: { type: "SHIPMENT_CREATED", payload: { dest_node_id: NODES.MAITRI } },
    },
    events: [{
      device_id: DEVICES.HQ_WEB, actor_role: "HQ_OPS", node_id: NODES.HQ, type: "SHIPMENT_CREATED", entity_type: "shipment", entity_id: MARION.nextSupply,
      payload: {
        shipment_id: MARION.nextSupply, name: "Polar diesel (18-month supply)", priority: "CRITICAL", dest_node_id: NODES.MAITRI,
        legs: [
          { leg_id: "L2-P210", seq: 2, from_node: NODES.MUMBAI, to_node: NODES.CAPE_TOWN, etd: null, eta: day("2027-08-01"), vessel_id: null },
          { leg_id: "L3-P210", seq: 3, from_node: NODES.CAPE_TOWN, to_node: NODES.MAITRI, etd: day("2027-08-05"), eta: day("2027-08-09"), vessel_id: IDS.vessel },
        ],
        cargo: [{ inventory_item_id: IDS.dieselMaitri, qty: 60 }],
      },
      observed_at: at("2027-05-27", "16:00"),
    }],
    real: { when: "Aug 2026", text: "The reactivation voyage flies 494 t of cargo and 300 t of polar diesel ashore by helicopter; the base is handed to the next team on 25 August.", source: SRC.reactivation },
  },
];
