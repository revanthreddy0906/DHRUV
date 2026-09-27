import type { Seed } from "@dhruv/shared";
import type { BeatEvent, DirectorBeat } from "./director.js";
import { DEVICES, IDS, LEVERS, NODES } from "./ids.js";
import { season48 } from "./season48.js";

/**
 * Real-incident scenario: the icebreaker Aurora Australis grounding at Mawson station, February
 * to March 2016, replayed on DHRUV's Maitri. What happened is summarised on each beat (`real`) with
 * its source; see docs/run-through-aurora-2016.md.
 *
 * Adaptation, stated wherever the scenario is shown:
 * - Mawson becomes Maitri; MV Ice Star plays Aurora Australis; Japan's Shirase (which carried the
 *   stranded expeditioners on to Casey) becomes "Partner icebreaker".
 * - The real calendar days are kept, shifted to the demo year 2027.
 * - Cargo quantities, the diesel already offloaded, and the levers' figures are illustrative.
 */

const day = (d: string) => `${d}T00:00:00.000Z`;
const at = (d: string, hhmm: string) => `${d}T${hhmm}:00.000Z`;

export const AURORA = {
  shipNode: "ICE_STAR",
  partnerNode: "PARTNER_SHIP",
  partnerVessel: "V-PARTNER",
  incident: "INC-AGROUND",
  decision: "DEC-AGROUND",
  shipmentPartner: "C-120",
} as const;

/** The 37 expeditioners who came ashore at Mawson (ABC, 27 Feb 2016); names are generated. */
const voyagers: Seed["personnel"] = Array.from({ length: 37 }, (_, i) => ({
  id: `P-V${String(i + 1).padStart(2, "0")}`,
  name: `Voyage member ${String(i + 1).padStart(2, "0")}`,
  role: "EXPEDITIONER",
  node_id: AURORA.shipNode,
  status: "ON_STATION",
  last_seen: at("2027-02-19", "18:00"),
}));

/** 20 Feb: the resupply voyage is at the station; the feeders reached Cape Town in time. */
const legs: Seed["legs"] = season48.legs.map((l) =>
  l.vessel_id
    ? { ...l, etd: day("2027-02-06"), eta: day("2027-02-20"), status: "IN_TRANSIT" }
    : { ...l, status: "DONE" },
);

export const aurora2016Seed: Seed = {
  ...season48,
  nodes: [
    ...season48.nodes,
    { id: AURORA.shipNode, name: "MV Ice Star (in harbour)", type: "VESSEL", lat: -70.76, lon: 11.62 },
    { id: AURORA.partnerNode, name: "Partner icebreaker", type: "VESSEL", lat: -69.5, lon: 12.5 },
  ],
  vessels: [
    // Arrives 20 Feb; the station stays open for ship operations until 15 Mar.
    { ...season48.vessels[0]!, departure: day("2027-02-06"), load_cutoff: day("2027-02-04"), eta_station: day("2027-02-20"), station_closing_date: day("2027-03-15") },
    { id: AURORA.partnerVessel, name: "Partner icebreaker (Shirase's role)", departure: day("2027-03-05"), load_cutoff: day("2027-03-04"), eta_station: day("2027-03-12"), station_closing_date: day("2027-03-15") },
  ],
  legs,
  // Counts are recent at arrival.
  inventory_items: season48.inventory_items.map((i) => ({ ...i, last_counted: at("2027-02-19", "18:00") })),
  personnel: [...season48.personnel, ...voyagers],
  // The summer missions are over by late February.
  missions: [],
  dependencies: [],
  // Only the late-season options are open: the air option (as Davis's crew went out by air) and conserving.
  levers: [
    {
      id: LEVERS.airliftPartial, node_id: NODES.MAITRI, label: "Diesel by air (partial)",
      effect: JSON.stringify({ adds_kl: 12.0, item_id: IDS.dieselMaitri }),
      cutoff: day("2027-03-06"), lead_days: 4, cost_amount: 48, cost_unit: "lakh INR", synthetic: 1,
    },
    {
      id: LEVERS.conserve, node_id: NODES.MAITRI, label: "Conserve diesel",
      effect: JSON.stringify({ saves_kl: 8.0, item_id: IDS.dieselMaitri }),
      cutoff: day("2027-03-10"), lead_days: 2, cost_amount: null, cost_unit: "comfort and ops impact", synthetic: 1,
    },
  ],
};

const move = (device_id: string, ids: string[], from: string, to: string, when: string): BeatEvent[] =>
  ids.map((person_id) => ({
    device_id, actor_role: "STATION_LEADER", node_id: NODES.MAITRI, type: "PERSON_MOVED", entity_type: "person", entity_id: person_id,
    payload: { person_id, from_node: from, to_node: to, depart: when, arrive: when }, observed_at: when,
  }));
const voyagerIds = voyagers.map((p) => p.id);

const SRC = {
  aground: "https://www.antarctica.gov.au/news/2016/aurora-australis-aground-at-mawson/",
  salvage: "https://www.abc.net.au/news/2016-02-25/aurora-australis-salvage-plans-revealed-by-aad/7198392",
  ashore: "https://www.abc.net.au/news/2016-02-27/stranded-passengers-to-be-taken-off-icebreaker/7203004",
  cleared: "https://www.abc.net.au/news/2016-03-02/damaged-antarctic-ship-cleared-for-sailing/7213370",
  shirase: "https://www.antarctica.gov.au/news/2016/mawson-expeditioners-on-board-shirase/",
  japan: "https://www.abc.net.au/news/2016-03-04/aurora-australis-japanese-iceabreaker-to-pick-up-expeditioners/7222008",
};

export const AURORA_BEATS: DirectorBeat[] = [
  {
    beat: "A0", label: "Season clock to 20 Feb 2027", where: "client", events: [], clockJump: at("2027-02-20", "06:00"),
    real: { when: "20 Feb 2016", text: "Aurora Australis arrives at Mawson for the station's annual resupply.", source: SRC.aground },
  },
  {
    beat: "A1", label: "MV Ice Star in harbour: offload begins", where: "server", advanceClock: true,
    events: [IDS.legC104Vessel, IDS.legC107Vessel, IDS.legC112Vessel].map((leg_id) => ({
      device_id: DEVICES.DIRECTOR, actor_role: "HQ_OPS", node_id: NODES.HQ, type: "LEG_UPDATED", entity_type: "leg", entity_id: leg_id,
      payload: { leg_id, eta: day("2027-02-20"), status: "DONE" }, observed_at: at("2027-02-20", "07:30"),
    })),
    real: { when: "20–23 Feb 2016", text: "Cargo and fuel are transferred ashore over several days.", source: SRC.aground },
  },
  {
    beat: "A2", label: "Maitri receives the first 20 kL of diesel from C-104", where: "operator", advanceClock: true,
    operator: {
      device_id: DEVICES.MAITRI_TAB,
      instruction: "Maitri tab → Inventory → Receive, Diesel, 20, shipment C-104 → Submit",
      expect: { type: "STOCK_RECEIVED", payload: { item_id: IDS.dieselMaitri, shipment_id: IDS.shipmentC104 } },
    },
    events: [{ device_id: DEVICES.MAITRI_TAB, actor_role: "STATION_LEADER", node_id: NODES.MAITRI, type: "STOCK_RECEIVED", entity_type: "inventory_item", entity_id: IDS.dieselMaitri, payload: { item_id: IDS.dieselMaitri, qty: 20, shipment_id: IDS.shipmentC104 }, observed_at: at("2027-02-23", "17:00") }],
    real: { when: "23 Feb 2016", text: "Part of the resupply is ashore; the rest is still on board (the quantities here are illustrative).", source: SRC.salvage },
  },
  {
    beat: "A3", label: "Blizzard: MV Ice Star breaks its moorings and runs aground", where: "server", advanceClock: true,
    events: [
      {
        device_id: DEVICES.DIRECTOR, actor_role: "HQ_OPS", node_id: NODES.MAITRI, type: "INCIDENT_OPENED", entity_type: "incident", entity_id: AURORA.incident,
        payload: { incident_id: AURORA.incident, type: "VESSEL_AGROUND", person_ids: [], last_confirmed_at: at("2027-02-24", "09:15"), note: "Moorings parted in a blizzard (winds over 130 km/h); ship aground in the harbour, hull breached, fuel being monitored. 67 aboard." },
        observed_at: at("2027-02-24", "09:15"),
      },
      {
        // The rest of the cargo cannot be landed before the station closes.
        device_id: DEVICES.DIRECTOR, actor_role: "HQ_OPS", node_id: NODES.HQ, type: "VESSEL_UPDATED", entity_type: "vessel", entity_id: IDS.vessel,
        payload: { vessel_id: IDS.vessel, eta_station: day("2027-04-15") }, observed_at: at("2027-02-24", "09:20"),
      },
    ],
    real: { when: "24 Feb 2016, 09:15", text: "In a blizzard with winds over 130 km/h the ship breaks its mooring lines and runs aground in Horseshoe Harbour. 67 people are on board; the hull is breached and fuel is monitored.", source: SRC.aground },
  },
  {
    beat: "A4", label: "Maitri's link degrades in the blizzard", where: "client",
    events: [{ device_id: DEVICES.MAITRI_TAB, actor_role: "SYSTEM", node_id: NODES.MAITRI, type: "LINK_STATE_SET", entity_type: "node", entity_id: NODES.MAITRI, payload: { node_id: NODES.MAITRI, status: "DEGRADED" }, observed_at: at("2027-02-24", "09:25") }],
    real: { when: "24 Feb 2016", text: "Adaptation: communications during the storm are not documented; DHRUV shows how the station keeps working on a degraded link.", source: SRC.aground },
  },
  {
    beat: "A5", label: "Engine proposes a fuel decision for Maitri", where: "server", advanceClock: true,
    resolveTrigger: { type: "VESSEL_UPDATED", entity_id: IDS.vessel },
    proposeFromEngine: { node_id: NODES.MAITRI },
    events: [{
      device_id: DEVICES.DIRECTOR, actor_role: "SYSTEM", node_id: NODES.MAITRI, type: "DECISION_PROPOSED", entity_type: "decision", entity_id: AURORA.decision,
      payload: { decision_id: AURORA.decision, trigger_event_id: "", options: [], trace: [] }, observed_at: at("2027-02-24", "09:30"),
    }],
    real: { when: "24–25 Feb 2016", text: "The Antarctic Division plans how to recover: salvage, moving people, and replacement shipping.", source: SRC.salvage },
  },
  {
    beat: "A6", label: "37 expeditioners come ashore at Maitri", where: "client", advanceClock: true,
    events: move(DEVICES.MAITRI_TAB, voyagerIds, AURORA.shipNode, NODES.MAITRI, at("2027-02-26", "10:00")),
    real: { when: "26 Feb 2016", text: "When the weather clears, 37 expeditioners are taken ashore to Mawson by barge; the station must feed and house them.", source: SRC.ashore },
  },
  {
    beat: "A7", label: "Fuel watch: Maitri counts its diesel", where: "operator", advanceClock: true,
    operator: {
      device_id: DEVICES.MAITRI_TAB,
      instruction: "Maitri tab → Inventory → Count, Diesel, 111.5 → Submit",
      expect: { type: "STOCK_COUNTED", payload: { item_id: IDS.dieselMaitri } },
    },
    events: [{ device_id: DEVICES.MAITRI_TAB, actor_role: "STATION_LEADER", node_id: NODES.MAITRI, type: "STOCK_COUNTED", entity_type: "inventory_item", entity_id: IDS.dieselMaitri, payload: { item_id: IDS.dieselMaitri, qty: 111.5 }, observed_at: at("2027-02-26", "15:00") }],
    real: { when: "late Feb 2016", text: "Fuel levels on board and ashore are monitored after the breach.", source: SRC.aground },
  },
  {
    beat: "A8", label: "HQ approves the fuel decision", where: "operator",
    operator: {
      device_id: DEVICES.HQ_WEB,
      instruction: "HQ tab → Decisions → DEC-AGROUND → approve the top option (check the Γ panel on Inventory first)",
      expect: { type: "DECISION_APPROVED", payload: { decision_id: AURORA.decision } },
    },
    events: [],
    approve: { decision_id: AURORA.decision, chosen_option_id: "OPT-1", verify_ack: true, observed_at: at("2027-02-27", "09:00") },
    real: { when: "late Feb 2016", text: "The returning Davis crew are flown out instead of waiting for the ship: the air option.", source: SRC.japan },
  },
  {
    beat: "A9", label: "Ship refloated and cleared to sail, without passengers", where: "server", advanceClock: true,
    events: [{
      device_id: DEVICES.DIRECTOR, actor_role: "HQ_OPS", node_id: NODES.MAITRI, type: "INCIDENT_UPDATED", entity_type: "incident", entity_id: AURORA.incident,
      payload: { incident_id: AURORA.incident, status: "RESOLVED", note: "Refloated, inspected, cleared to sail to port for repairs without passengers." }, observed_at: at("2027-03-02", "12:00"),
    }],
    real: { when: "2 Mar 2016", text: "Aurora Australis is refloated, inspected and cleared to sail to Fremantle for repairs, without expeditioners.", source: SRC.cleared },
  },
  {
    beat: "A10", label: "HQ ships the rest of the diesel on the partner icebreaker", where: "operator", advanceClock: true,
    operator: {
      device_id: DEVICES.HQ_WEB,
      instruction: "HQ tab → Cargo → New shipment: 'Diesel 28 kL (replacement)', to Maitri, feeder ETA 3 Mar, loads on the Partner icebreaker, cargo Diesel 28 → Create shipment",
      expect: { type: "SHIPMENT_CREATED", payload: { dest_node_id: NODES.MAITRI } },
    },
    events: [{
      device_id: DEVICES.HQ_WEB, actor_role: "HQ_OPS", node_id: NODES.HQ, type: "SHIPMENT_CREATED", entity_type: "shipment", entity_id: AURORA.shipmentPartner,
      payload: {
        shipment_id: AURORA.shipmentPartner, name: "Diesel 28 kL (replacement)", priority: "CRITICAL", dest_node_id: NODES.MAITRI,
        legs: [
          { leg_id: "L2-C120", seq: 2, from_node: NODES.MUMBAI, to_node: NODES.CAPE_TOWN, etd: null, eta: day("2027-03-03"), vessel_id: null },
          { leg_id: "L3-C120", seq: 3, from_node: NODES.CAPE_TOWN, to_node: NODES.MAITRI, etd: day("2027-03-05"), eta: day("2027-03-12"), vessel_id: AURORA.partnerVessel },
        ],
        cargo: [{ inventory_item_id: IDS.dieselMaitri, qty: 28 }],
      },
      observed_at: at("2027-03-02", "15:00"),
    }],
    real: { when: "Mar 2016", text: "Replacement shipping is arranged: Japan's Shirase carries the stranded expeditioners and France's L'Astrolabe is chartered for the next resupply.", source: SRC.japan },
  },
  {
    beat: "A11", label: "The 37 leave on the partner icebreaker", where: "client", advanceClock: true,
    events: move(DEVICES.MAITRI_TAB, voyagerIds, NODES.MAITRI, AURORA.partnerNode, at("2027-03-12", "08:00")),
    real: { when: "12 Mar 2016", text: "The stranded expeditioners reach Casey aboard Shirase and fly home.", source: SRC.shirase },
  },
  {
    beat: "A12", label: "Maitri's link back: the outbox drains", where: "client",
    events: [{ device_id: DEVICES.MAITRI_TAB, actor_role: "SYSTEM", node_id: NODES.MAITRI, type: "LINK_STATE_SET", entity_type: "node", entity_id: NODES.MAITRI, payload: { node_id: NODES.MAITRI, status: "ONLINE" }, observed_at: at("2027-03-12", "08:05") }],
    real: { when: "after", text: "Adaptation: everything Maitri recorded on the degraded link reaches HQ in priority order.", source: SRC.shirase },
  },
];
