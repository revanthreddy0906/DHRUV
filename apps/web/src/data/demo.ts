// Frozen demo fixtures — every value is from Bible §10/§13, the engine worked example, or the v2 golden tests.
// These stand in for evaluate() output behind the same interfaces (Bible §19 fixture fallback).
// SYNTHETIC. Not operational NCPOR data.

import type {
  Conflict, DimensionEval, Freshness, Health, Lever, LinkStatus, MissionEval, OpEventRow, OptionEval,
  Role, StationEval, Tier, TraceStep,
} from "./types";


export const THRESHOLDS = { green: 1.05, amberLow: 0.95 } as const;

export const CALENDAR = {
  start: "24 Jan 2027 08:00",
  nextResupply: "20 Nov 2027",
  vessel: { name: "MV Ice Star", loadCutoff: "4 Feb", departs: "6 Feb", eta: "24 Feb", closing: "28 Feb" },
  phases: [
    { key: "CLOSING", range: "24 Jan – 1 Mar", days: 36 },
    { key: "WINTER", range: "1 Mar – 16 Nov", days: 260 },
    { key: "MOBILISATION", range: "16 – 20 Nov", days: 4 },
  ],
} as const;

export const DEVICES = [
  { id: "HQ-WEB-01", role: "HQ_OPS" as Role, roleLabel: "HQ Ops", node: "Goa HQ", device: "Desktop" },
  { id: "MAITRI-TAB-01", role: "STATION_LEADER" as Role, roleLabel: "Station Leader", node: "Maitri", device: "Tablet" },
  { id: "FT3-TAB-01", role: "FIELD_LEAD" as Role, roleLabel: "Field Lead", node: "Team FT-3", device: "Mobile PWA" },
];

export const ROLE_LABEL: Record<Role, string> = { HQ_OPS: "HQ Ops", STATION_LEADER: "Station Leader", FIELD_LEAD: "Field Lead" };

export const TIERS: { tier: Tier; cls: string; examples: string }[] = [
  { tier: 0, cls: "Incident / SOS", examples: "INCIDENT_OPENED, INCIDENT_UPDATED" },
  { tier: 1, cls: "Personnel and medical status", examples: "PERSON_STATUS_SET, CHECKIN_RECORDED" },
  { tier: 2, cls: "Fuel and critical stock", examples: "STOCK_COUNTED / ISSUED / RECEIVED" },
  { tier: 3, cls: "Cargo", examples: "LEG_DELAYED, LEG_UPDATED" },
  { tier: 4, cls: "Routine", examples: "Notes, mission edits, non-critical stock" },
  { tier: 5, cls: "Attachments", examples: "Photos, reports" },
];

/* ---------------- Levers & options (worked example, T-ENG-03, v2 C4) ---------------- */

export const LEVERS: Lever[] = [
  { id: "HOLD_VESSEL", label: "Hold MV Ice Star 3 days", effect: "+48.0 kL feasible · vessel departs 9 Feb", cutoff: "6 Feb", leadDays: 3, deadline: "3 Feb", daysLeft: 10, cost: "19.5 lakh (3 d × 6.5 lakh)", sideEffects: ["Maitri ETA 27 Feb, closing date 28 Feb"] },
  { id: "AIRLIFT_PARTIAL", label: "Partial airlift", effect: "+12.0 kL", cutoff: "9 Feb", leadDays: 9, deadline: "31 Jan", daysLeft: 7, cost: "48 lakh", sideEffects: [] },
  { id: "DEFER_F27", label: "Defer mission F-27", effect: "saves 4.0 kL", cutoff: "3 Feb", leadDays: 1, deadline: "2 Feb", daysLeft: 9, cost: "research impact", sideEffects: ["Ice-core traverse support 3–10 Feb postponed"] },
  { id: "CONSERVE", label: "Winter conservation", effect: "saves 8.0 kL", cutoff: "1 Mar", leadDays: 2, deadline: "27 Feb", daysLeft: 34, cost: "comfort and ops impact", sideEffects: ["Winter burn about 8 % lower"] },
];

export const OPTIONS_AFTER_SLIP: OptionEval[] = [
  { id: "a", levers: ["HOLD_VESSEL"], resultingRatio: 1.0606, resultingState: "GREEN", deadline: "3 Feb", bindingLever: "HOLD_VESSEL", slack: "0 d on C-104", cost: "19.5 lakh", requiresVerify: [], reachesTarget: true },
  { id: "b", levers: ["HOLD_VESSEL", "CONSERVE", "DEFER_F27"], resultingRatio: 1.1785, resultingState: "GREEN", deadline: "2 Feb", bindingLever: "DEFER_F27", slack: "0 d on C-104", cost: "19.5 lakh + ops and research impact", requiresVerify: [], reachesTarget: true },
  { id: "c", levers: ["AIRLIFT_PARTIAL", "DEFER_F27", "CONSERVE"], resultingRatio: 0.8754, resultingState: "RED", residualGap: 14.8, deadline: "31 Jan", bindingLever: "AIRLIFT_PARTIAL", slack: "no inbound dependency", cost: "48 lakh + ops and research impact", requiresVerify: [], reachesTarget: false },
];

/** HQ view, 25 Jan 16:00, before sync (T-ENG-07 v2): option (a) straddles. */
export const OPTIONS_HQ_2501600: OptionEval[] = OPTIONS_AFTER_SLIP.map((o) =>
  o.id === "a"
    ? { ...o, band: { low: 1.0334, high: 1.0815, straddles: true, lowState: "AMBER" }, straddleText: "GREEN, could be AMBER (count 36 h old)",
        requiresVerify: ["Maitri fuel count 36 h old · AGING (straddles AMBER)", "Maitri link last contact 31 h ago · CRITICAL"] }
    : { ...o, requiresVerify: ["Maitri link last contact 31 h ago · CRITICAL"] },
);

/** HQ view, 25 Jan 16:20, after sync (T-SYNC-08): count FRESH, no straddle. */
export const OPTIONS_HQ_2501620: OptionEval[] = OPTIONS_AFTER_SLIP.map((o) =>
  o.id === "a" ? { ...o, band: { low: 1.0524, straddles: false } } : o,
); // v2 T-SYNC-08 states only the low side after sync.

/** State example only: an option whose lever deadline has passed. */
export const OPTION_EXPIRED_EXAMPLE: OptionEval = { ...OPTIONS_AFTER_SLIP[2], expired: "AIRLIFT_PARTIAL deadline 31 Jan has passed" };

/* ---------------- Traces (propagation order, Bible §7 text format) ---------------- */

const ref = (type: string, id: string) => ({ type, id });

export const HERO_TRACE: TraceStep[] = [
  { rule: "EVENT", title: "LEG_DELAYED C-104 L2 (Mumbai → Cape Town)", inputs: { device: "HQ-WEB-01", observed_at: "24 Jan 08:10", reason: "feeder vessel delayed" }, formula: "ETA 2 Feb + 5 d", result: "7 Feb", refs: [ref("leg", "L2-C104")] },
  { rule: "R02", title: "Inbound feasibility: leg ETA vs vessel load cutoff", inputs: { leg_eta: "7 Feb", load_cutoff: "4 Feb" }, formula: "7 Feb > 4 Feb", result: "C-104 excluded (window cliff) · slack −3 d", resultState: "RED", refs: [ref("shipment", "C-104"), ref("vessel", "MV Ice Star")] },
  { rule: "R01", title: "Diesel requirement to next resupply (20 Nov)", inputs: { closing: "36 d × 0.55", winter: "260 d × 0.38", mobilisation: "4 d × 0.35", reserve: "10 %" }, formula: "(19.8 + 98.8 + 1.4) × 1.10", result: "132.0 kL", refs: [ref("inventory_item", "INV-DSL")] },
  { rule: "R03", title: "Diesel availability", inputs: { stock: "92.0 kL", inbound_feasible: "0.0 kL" }, formula: "92.0 + 0.0", result: "A = 92.0 kL", refs: [ref("inventory_item", "INV-DSL")] },
  { rule: "R03", title: "Diesel availability vs requirement", inputs: { A: "92.0", R: "132.0" }, formula: "92.0 / 132.0 = 0.697", result: "RED · gap 40.0 kL", resultState: "RED", refs: [ref("inventory_item", "INV-DSL")] },
  { rule: "R04", title: "Fuel dimension = worst of its items", inputs: { diesel: "RED" }, formula: "worst(RED)", result: "Fuel RED", resultState: "RED", refs: [ref("dimension", "MAITRI.FUEL")] },
  { rule: "R15", title: "Station state = worst of six dimensions", inputs: { fuel: "RED", food: "GREEN", medical: "GREEN", spares_power: "GREEN", personnel: "GREEN", comms: "GREEN" }, formula: "worst(…)", result: "Maitri RED", resultState: "RED", refs: [ref("node", "MAITRI")] },
  { rule: "R07", title: "Mission impact", inputs: { "F-27 diesel draw": "4.0 kL", fuel: "RED" }, formula: "fuel-drawing mission ∧ Fuel RED", result: "F-27 AT_RISK · F-31 OK", resultState: "AMBER", refs: [ref("mission", "F-27"), ref("mission", "F-31")] },
  { rule: "R08", title: "Lever deadlines (cutoff − lead)", inputs: { HOLD_VESSEL: "6 Feb − 3 d", AIRLIFT_PARTIAL: "9 Feb − 9 d", DEFER_F27: "3 Feb − 1 d", CONSERVE: "1 Mar − 2 d" }, formula: "deadline = cutoff − lead", result: "3 Feb · 31 Jan · 2 Feb · 27 Feb", refs: [ref("lever", "HOLD_VESSEL"), ref("lever", "AIRLIFT_PARTIAL"), ref("lever", "DEFER_F27"), ref("lever", "CONSERVE")] },
  { rule: "R09", title: "Options (subsets of up to 3 levers, re-evaluated)", inputs: { "(a)": "140.0 / 132.0", "(b)": "140.0 / 118.8", "(c)": "104.0 / 118.8" }, formula: "A′ / R′", result: "(a) 1.0606 GREEN · (b) 1.1785 GREEN · (c) 0.8754 RED, gap 14.8 kL", refs: [ref("decision", "DEC-01")] },
  { rule: "R11", title: "Point of no return", inputs: { "(a) min deadline": "3 Feb", "(b) min deadline": "2 Feb" }, formula: "max over options reaching GREEN", result: "PNR 3 Feb 2027 · 10 days left", resultState: "RED", refs: [ref("decision", "DEC-01")] },
  { rule: "R16", title: "Slip tolerance (v2)", inputs: { A: "92.0 kL", reserve: "10 %" }, formula: "E < 0 → reserve breach date", result: "Reserve reached 6 Aug 2027 · 106 days before the 20 Nov ship", refs: [ref("inventory_item", "INV-DSL")] },
  { rule: "R18", title: "Baseline B0 (comparison only)", inputs: { on_hand: "92.0 kL", days_of_cover: "167 d at 0.55" }, formula: "stock < threshold ∨ cover < limit", result: "0 alerts. A stock-level alert would show nothing here: on-hand stock has not changed.", refs: [], muted: true },
];

/** Freshness step appended in the HQ view at 25 Jan 16:00 (R12, R13 v2, R14). */
export const FRESHNESS_TRACE_HQ_2501600: TraceStep[] = [
  { rule: "R12", title: "Freshness of Maitri diesel count (HQ view)", inputs: { observed_at: "24 Jan 04:00", now: "25 Jan 16:00" }, formula: "now − observed_at", result: "36 h · AGING · u = 3 %", resultState: "AMBER", refs: [ref("inventory_item", "INV-DSL")] },
  { rule: "R13", title: "Band for option (a), asymmetric", inputs: { stock: "92.0", u: "3 %", burn_since_count: "0.825 kL", inbound: "48.0", R: "132.0" }, formula: "low (92.0 × 0.97 − 0.825 + 48.0) / 132.0 · high (92.0 × 1.03 + 48.0) / 132.0", result: "1.0334 – 1.0815 · GREEN, could be AMBER", resultState: "AMBER", refs: [ref("decision", "DEC-01")] },
  { rule: "R13", title: "Band for current state", inputs: { stock: "92.0", u: "3 %", inbound: "0.0" }, formula: "same, without C-104", result: "0.6698 – 0.7179 · both RED, no straddle", resultState: "RED", refs: [ref("inventory_item", "INV-DSL")] },
  { rule: "R14", title: "Verify-first", inputs: { link_contact: "31 h · CRITICAL", fuel_count: "36 h · AGING" }, formula: "STALE/CRITICAL input or straddle", result: "Approve requires a ticked verification (verify_ack)", resultState: "AMBER", refs: [ref("decision", "DEC-01")] },
];

/* ---------------- Dimensions & stations per moment ---------------- */

const fresh = (cls: Freshness, label: string, age: string) => ({ cls, label, age });

function maitriDims(o: {
  fuel: Partial<DimensionEval>; food: DimensionEval["freshness"]; med: DimensionEval["freshness"]; spares: DimensionEval["freshness"];
}): DimensionEval[] {
  return [
    { key: "FUEL", state: "GREEN", ratio: 1.0606, drivers: [], ...o.fuel } as DimensionEval,
    { key: "FOOD", state: "GREEN", ratio: 1.0749, freshness: o.food, drivers: ["8900 / 8280 person-days"] },
    { key: "MEDICAL", state: "GREEN", ratio: 1.1111, freshness: o.med, drivers: ["min(kits 1.3333, oxygen 20 / 18 = 1.1111)"] },
    { key: "SPARES_POWER", state: "GREEN", ratio: 1.6667, freshness: o.spares, drivers: ["Genset kits 5 / 3 · 3 generators OK vs need 2"] },
    { key: "PERSONNEL", state: "GREEN", ratioText: "need + 1", drivers: ["Doctor, diesel mechanic, comms engineer, cook: 2 each vs need 1"] },
    { key: "COMMS", state: "GREEN", ratioText: "VSAT + IRD", drivers: ["VSAT-1 and IRD-1 OK"] },
  ];
}

const F27 = (status: "OK" | "AT_RISK", why: string): MissionEval => ({ id: "F-27", name: "Ice-core traverse support", dates: "3–10 Feb", status, why, fuel: "4.0 kL", people: ["Dr A. Verma", "R. Nair"], assets: ["SK-4"] });
const F31: MissionEval = { id: "F-31", name: "Weather mast service", dates: "12–13 Feb", status: "OK", why: "Needs met", fuel: "0.3 kL", people: [], assets: [] };

const BHARATI: StationEval = {
  nodeId: "BHARATI", name: "Bharati", state: "GREEN",
  dimensions: [
    { key: "FUEL", state: "GREEN", ratio: 1.1364, drivers: ["135.0 / 118.8 kL"] },
    { key: "FOOD", state: "GREEN", drivers: [] },
    { key: "MEDICAL", state: "GREEN", drivers: [] },
    { key: "SPARES_POWER", state: "GREEN", drivers: [] },
    { key: "PERSONNEL", state: "GREEN", ratioText: "need + 1", drivers: [] },
    { key: "COMMS", state: "GREEN", drivers: [] },
  ],
  slip: { kind: "tolerance", days: 40, text: "The November ship can be up to 40 days late before reserve is touched" },
  missions: [], gates: [], link: { status: "ONLINE", lastContact: "now", freshness: "FRESH" },
  footnote: "Other dimensions seeded between 1.09 and 1.30 (synthetic). Per-item values in Inventory.",
};

const SLIP_TOLERANCE_22 = { kind: "tolerance" as const, days: 22, text: "The November ship can be up to 22 days late before reserve is touched" };
const BREACH_6AUG = { kind: "breach" as const, date: "6 Aug 2027", daysShort: 106, text: "Reserve reached 6 Aug 2027 · 106 days before the 20 Nov ship" };

export type MomentId = "start" | "slip" | "hq-2501600" | "hq-2501610" | "maitri-2501600" | "hq-2501620" | "hq-2600900";

export interface Moment {
  id: MomentId;
  clock: string;
  phase: "CLOSING";
  daysToResupply: number;
  viewer: (typeof DEVICES)[number];
  link: LinkStatus;            // this device's simulated link
  pending: { count: number; oldest?: string };
  stations: StationEval[];
  decisions: { id: string; title: string; station: string; deadline: string; daysLeft: number; current: { state: Health; ratio: number }; best: { state: Health; ratio: number }; approveReason?: string; straddle?: string }[];
  risks: { text: string; state: Health | "INFO"; freshness?: Freshness; age?: string }[];
  incident?: { id: string; strip: string };
  label: string;
}

const START_MAITRI: StationEval = {
  nodeId: "MAITRI", name: "Maitri", state: "GREEN",
  dimensions: maitriDims({
    fuel: { freshness: fresh("FRESH", "Fuel count 4 h old", "4 h"), drivers: ["(92.0 + 48.0) / 132.0 kL · C-104 feasible"] },
    food: fresh("FRESH", "Food count 12 h old", "12 h"),
    med: fresh("AGING", "Medical count 46 h old", "46 h"),
    spares: fresh("STALE", "Genset kit count 3 d 22 h old", "3 d 22 h"),
  }),
  slip: SLIP_TOLERANCE_22,
  b0: { alerts: 0, text: "B0 stock alert: none · 167 days of cover" },
  missions: [F27("OK", "Needs met"), F31],
  gates: [], link: { status: "ONLINE", lastContact: "now", freshness: "FRESH" },
};

const SLIP_MAITRI: StationEval = {
  ...START_MAITRI, state: "RED",
  dimensions: maitriDims({
    fuel: { state: "RED", ratio: 0.697, freshness: fresh("FRESH", "Fuel count 4 h old", "4 h"), drivers: ["92.0 / 132.0 kL · C-104 misses vessel cutoff"] },
    food: fresh("FRESH", "Food count 12 h old", "12 h"),
    med: fresh("AGING", "Medical count 46 h old", "46 h"),
    spares: fresh("STALE", "Genset kit count 3 d 22 h old", "3 d 22 h"),
  }),
  driver: "Fuel: C-104 misses vessel cutoff",
  slip: BREACH_6AUG,
  b0: { alerts: 0, text: "B0 stock alert: 0 alerts · on-hand 92.0 kL unchanged" },
  pnr: { date: "3 Feb 2027", daysLeft: 10 },
  missions: [F27("AT_RISK", "Draws 4.0 kL diesel while Fuel is RED"), F31],
};

const HQ1600_MAITRI: StationEval = {
  ...SLIP_MAITRI,
  dimensions: maitriDims({
    fuel: { state: "RED", ratio: 0.697, band: { low: 0.6698, high: 0.7179, straddles: false }, freshness: fresh("AGING", "Fuel count 36 h old", "36 h"), drivers: ["92.0 / 132.0 kL · C-104 misses vessel cutoff"] },
    food: fresh("AGING", "Food count 44 h old", "44 h"),
    med: fresh("STALE", "Medical count 3 d 6 h old", "3 d 6 h"),
    spares: fresh("STALE", "Genset kit count 5 d 6 h old", "5 d 6 h"),
  }),
  pnr: { date: "3 Feb 2027", daysLeft: 9 },
  link: { status: "OFFLINE", lastContact: "31 h ago", freshness: "CRITICAL" },
};

const MAITRI1600_MAITRI: StationEval = {
  ...SLIP_MAITRI,
  dimensions: maitriDims({
    fuel: { state: "RED", ratio: 0.697, freshness: fresh("FRESH", "Fuel count 6 h 45 min old", "6 h 45 min"), drivers: ["92.0 / 132.0 kL · counted here 09:15"] },
    food: fresh("AGING", "Food count 44 h old", "44 h"),
    med: fresh("STALE", "Medical count 3 d 6 h old", "3 d 6 h"),
    spares: fresh("STALE", "Genset kit count 5 d 6 h old", "5 d 6 h"),
  }),
  pnr: { date: "3 Feb 2027", daysLeft: 9 },
  gates: ["Incident INC-01 open · FT-3 last confirmed 9 h ago"],
  link: { status: "OFFLINE", lastContact: "31 h ago", freshness: "CRITICAL" },
};

const HQ1620_MAITRI: StationEval = {
  ...START_MAITRI,
  dimensions: maitriDims({
    fuel: { freshness: fresh("FRESH", "Fuel count 7 h old", "7 h"), drivers: ["(92.0 + 48.0) / 132.0 kL · C-104 feasible after hold (cutoff 7 Feb)"] },
    food: fresh("AGING", "Food count 44 h old", "44 h"),
    med: fresh("STALE", "Medical count 3 d 6 h old", "3 d 6 h"),
    spares: fresh("STALE", "Genset kit count 5 d 6 h old", "5 d 6 h"),
  }),
  missions: [F27("OK", "Needs met"), F31],
  gates: ["Incident INC-01 open"],
};

const HQ0900_MAITRI: StationEval = {
  ...HQ1620_MAITRI,
  dimensions: HQ1620_MAITRI.dimensions.map((d) => d.key !== "FUEL" ? d : { ...d, band: { low: 0.697, straddles: true, lowState: "RED" as Health }, straddleText: "GREEN, could be RED",
    freshness: fresh("STALE", "C-104 ETA report 48 h 50 min old", "48 h 50 min"), drivers: ["C-104 UNCERTAIN · ETA report STALE, slack 0 d · verify before acting"] }),
};

export const MOMENTS: Record<MomentId, Moment> = {
  start: {
    id: "start", label: "Start · all GREEN", clock: "24 JAN 2027 08:00", phase: "CLOSING", daysToResupply: 300, viewer: DEVICES[0], link: "ONLINE", pending: { count: 0 },
    stations: [START_MAITRI, BHARATI], decisions: [],
    risks: [
      { text: "Maitri genset kit count 3 d 22 h old", state: "AMBER", freshness: "STALE", age: "3 d 22 h" },
      { text: "Maitri medical count 46 h old", state: "AMBER", freshness: "AGING", age: "46 h" },
      { text: "C-104 diesel 48.0 kL · L2 ETA 2 Feb vs cutoff 4 Feb · slack 2 d", state: "INFO" },
    ],
  },
  slip: {
    id: "slip", label: "After the slip · 24 Jan 08:11", clock: "24 JAN 2027 08:11", phase: "CLOSING", daysToResupply: 300, viewer: DEVICES[0], link: "ONLINE", pending: { count: 0 },
    stations: [SLIP_MAITRI, BHARATI],
    decisions: [{ id: "DEC-01", title: "Maitri fuel below required threshold", station: "Maitri", deadline: "3 Feb", daysLeft: 10, current: { state: "RED", ratio: 0.697 }, best: { state: "GREEN", ratio: 1.1785 } }],
    risks: [
      { text: "C-104 excluded by vessel cutoff (7 Feb > 4 Feb)", state: "RED" },
      { text: "F-27 AT_RISK · draws 4.0 kL diesel", state: "AMBER" },
      { text: "Maitri genset kit count 3 d 22 h old", state: "AMBER", freshness: "STALE", age: "3 d 22 h" },
      { text: "Maitri medical count 46 h old", state: "AMBER", freshness: "AGING", age: "46 h" },
    ],
  },
  "hq-2501600": {
    id: "hq-2501600", label: "HQ · 25 Jan 16:00 · before sync", clock: "25 JAN 2027 16:00", phase: "CLOSING", daysToResupply: 299, viewer: DEVICES[0], link: "ONLINE", pending: { count: 0 },
    stations: [HQ1600_MAITRI, BHARATI],
    decisions: [{ id: "DEC-01", title: "Maitri fuel below required threshold", station: "Maitri", deadline: "3 Feb", daysLeft: 9, current: { state: "RED", ratio: 0.697 }, best: { state: "GREEN", ratio: 1.1785 }, straddle: "(a) GREEN, could be AMBER" }],
    risks: [
      { text: "Maitri link OFFLINE · last contact 31 h ago", state: "RED", freshness: "CRITICAL", age: "31 h" },
      { text: "Maitri fuel count 36 h old", state: "AMBER", freshness: "AGING", age: "36 h" },
      { text: "SK-2 set OK here 24 Jan 11:00 from maintenance plan", state: "INFO" },
    ],
  },
  "hq-2501610": {
    id: "hq-2501610", label: "HQ · 25 Jan 16:10 · after sync, conflict flagged", clock: "25 JAN 2027 16:10", phase: "CLOSING", daysToResupply: 299, viewer: DEVICES[0], link: "ONLINE", pending: { count: 0 },
    stations: [{ ...HQ1600_MAITRI, dimensions: HQ1600_MAITRI.dimensions.map((d) => d.key !== "FUEL" ? d : { ...d, band: undefined, freshness: fresh("FRESH", "Fuel count 6 h 55 min old", "6 h 55 min") }), gates: ["Incident INC-01 open", "Unresolved safety conflict: SK-2 status"], link: { status: "ONLINE", lastContact: "now", freshness: "FRESH" } }, BHARATI],
    decisions: [{ id: "DEC-01", title: "Maitri fuel below required threshold", station: "Maitri", deadline: "3 Feb", daysLeft: 9, current: { state: "RED", ratio: 0.697 }, best: { state: "GREEN", ratio: 1.1785 } }],
    risks: [{ text: "SK-2 status conflict · DOWN kept until a human resolves it", state: "AMBER" }], incident: undefined,
  },
  "maitri-2501600": {
    id: "maitri-2501600", label: "Maitri tablet · 25 Jan 16:00 · offline · INC-01 open", clock: "25 JAN 2027 16:00", phase: "CLOSING", daysToResupply: 299, viewer: DEVICES[1], link: "OFFLINE", pending: { count: 5, oldest: "6 h 50 m" },
    stations: [MAITRI1600_MAITRI, BHARATI],
    decisions: [{ id: "DEC-01", title: "Maitri fuel below required threshold", station: "Maitri", deadline: "3 Feb", daysLeft: 9, current: { state: "RED", ratio: 0.697 }, best: { state: "GREEN", ratio: 1.1785 }, approveReason: "Only HQ Ops can approve decisions touching vessels" }],
    risks: [
      { text: "FT-3 last confirmed 9 h ago · circle 27 km", state: "RED", freshness: "STALE", age: "9 h" },
      { text: "SK-2 DOWN · track fault · not yet synced", state: "RED" },
      { text: "Link OFFLINE · local operations active", state: "AMBER", freshness: "CRITICAL", age: "31 h" },
    ],
    incident: { id: "INC-01", strip: "INC-01 · FT-3 overdue · last confirmed 9 h ago at −70.62, 12.10 · circle 27 km" },
  },
  "hq-2501620": {
    id: "hq-2501620", label: "HQ · 25 Jan 16:20 · approved", clock: "25 JAN 2027 16:20", phase: "CLOSING", daysToResupply: 299, viewer: DEVICES[0], link: "ONLINE", pending: { count: 0 },
    stations: [HQ1620_MAITRI, BHARATI], decisions: [], risks: [],
  },
  "hq-2600900": {
    id: "hq-2600900", label: "HQ · 26 Jan 09:00 · C-104 UNCERTAIN", clock: "26 JAN 2027 09:00", phase: "CLOSING", daysToResupply: 298, viewer: DEVICES[0], link: "ONLINE", pending: { count: 0 },
    stations: [HQ0900_MAITRI, BHARATI], decisions: [], risks: [{ text: "C-104 ETA report 48 h 50 min old · slack 0 d · UNCERTAIN", state: "AMBER", freshness: "STALE" }],
  },
};

/* ---------------- Events (seq per device from seed reset; sizes = JSON envelope bytes) ---------------- */

type Env = { device: string; seq: number; type: string; entity_type: string; entity_id: string; node_id: string; payload: Record<string, unknown>; observed_at: string; priority: Tier; actor_role: Role | "SYSTEM" };
const envBytes = (e: Env) => new TextEncoder().encode(JSON.stringify({ event_id: `${e.device}-${e.seq}`, device_id: e.device, seq: e.seq, type: e.type, entity_type: e.entity_type, entity_id: e.entity_id, node_id: e.node_id, payload: e.payload, observed_at: e.observed_at, created_at_client: e.observed_at, priority: e.priority, actor_role: e.actor_role, schema_version: 1 })).length;

function row(e: Env, summary: string, observed: string, extra: Partial<OpEventRow> = {}): OpEventRow {
  return { deviceSeq: `${e.device} · ${e.seq}`, device: e.device, seq: e.seq, type: e.type, entity: e.entity_id, node: e.node_id, actor: e.actor_role, observedAt: observed, tier: e.priority, summary, bytes: envBytes(e), ...extra };
}

export const EV = {
  legDelayed: row({ device: "HQ-WEB-01", seq: 1, type: "LEG_DELAYED", entity_type: "leg", entity_id: "L2-C104", node_id: "HQ", payload: { leg_id: "L2-C104", new_eta: "2027-02-07", reason: "feeder vessel delayed" }, observed_at: "2027-01-24T08:10:00Z", priority: 3, actor_role: "HQ_OPS" }, "C-104 L2 ETA 2 Feb → 7 Feb · feeder vessel delayed", "24 Jan 08:10", { recordedAtServer: "24 Jan 08:10" }),
  maitriIssue: row({ device: "MAITRI-TAB-01", seq: 1, type: "STOCK_ISSUED", entity_type: "inventory_item", entity_id: "INV-MEDKIT", node_id: "MAITRI", payload: { item_id: "INV-MEDKIT", qty: 1, reason: "issue" }, observed_at: "2027-01-24T09:10:00Z", priority: 2, actor_role: "STATION_LEADER" }, "Medical kit ×1 issued", "24 Jan 09:10"),
  maitriCount: row({ device: "MAITRI-TAB-01", seq: 2, type: "STOCK_COUNTED", entity_type: "inventory_item", entity_id: "INV-DSL", node_id: "MAITRI", payload: { item_id: "INV-DSL", qty: 92.0 }, observed_at: "2027-01-24T09:15:00Z", priority: 2, actor_role: "STATION_LEADER" }, "Diesel counted 92.0 kL", "24 Jan 09:15"),
  maitriSk2: row({ device: "MAITRI-TAB-01", seq: 3, type: "ASSET_STATUS_SET", entity_type: "asset", entity_id: "SK-2", node_id: "MAITRI", payload: { asset_id: "SK-2", status: "DOWN", note: "track fault" }, observed_at: "2027-01-24T09:20:00Z", priority: 1, actor_role: "STATION_LEADER" }, "SK-2 DOWN · track fault", "24 Jan 09:20"),
  maitriNote: row({ device: "MAITRI-TAB-01", seq: 4, type: "MISSION_UPDATED", entity_type: "mission", entity_id: "F-27", node_id: "MAITRI", payload: { mission_id: "F-27", fields: { note: "SK-2 unavailable, reassess traverse support" } }, observed_at: "2027-01-24T09:30:00Z", priority: 4, actor_role: "STATION_LEADER" }, "Mission note", "24 Jan 09:10–09:30"),
  hqSk2: row({ device: "HQ-WEB-01", seq: 2, type: "ASSET_STATUS_SET", entity_type: "asset", entity_id: "SK-2", node_id: "MAITRI", payload: { asset_id: "SK-2", status: "OK", note: "maintenance plan" }, observed_at: "2027-01-24T11:00:00Z", priority: 1, actor_role: "HQ_OPS" }, "SK-2 OK · maintenance plan (stale)", "24 Jan 11:00", { recordedAtServer: "24 Jan 11:00" }),
  checkin: row({ device: "FT3-TAB-01", seq: 1, type: "CHECKIN_RECORDED", entity_type: "team", entity_id: "FT-3", node_id: "MAITRI", payload: { person_or_team_id: "FT-3", lat: -70.62, lon: 12.1 }, observed_at: "2027-01-25T07:00:00Z", priority: 1, actor_role: "FIELD_LEAD" }, "FT-3 check-in at −70.62, 12.10", "25 Jan 07:00"),
  incident: row({ device: "MAITRI-TAB-01", seq: 5, type: "INCIDENT_OPENED", entity_type: "incident", entity_id: "INC-01", node_id: "MAITRI", payload: { incident_id: "INC-01", type: "OVERDUE_CHECKIN", person_ids: ["P-VERMA", "P-NAIR"], team_id: "FT-3", last_confirmed_at: "2027-01-25T07:00:00Z" }, observed_at: "2027-01-25T16:00:00Z", priority: 0, actor_role: "STATION_LEADER" }, "INC-01 opened · FT-3 overdue", "25 Jan 16:00"),
  approved: row({ device: "HQ-WEB-01", seq: 3, type: "DECISION_APPROVED", entity_type: "decision", entity_id: "DEC-01", node_id: "HQ", payload: { decision_id: "DEC-01", chosen_option_id: "a", verify_ack: true }, observed_at: "2027-01-25T16:20:00Z", priority: 3, actor_role: "HQ_OPS" }, "DEC-01 option (a) HOLD_VESSEL approved · verify_ack", "25 Jan 16:20", { recordedAtServer: "25 Jan 16:20" }),
};

export const SYSTEM_EVENTS: Record<string, OpEventRow> = {
  proposed: { deviceSeq: "SYSTEM", device: "SYSTEM", seq: 0, type: "DECISION_PROPOSED", entity: "DEC-01", node: "MAITRI", actor: "SYSTEM", observedAt: "24 Jan 08:11", tier: null, summary: "DEC-01 proposed with three options" },
  linkOff: { deviceSeq: "SYSTEM · simulated", device: "SYSTEM", seq: 0, type: "LINK_STATE_SET", entity: "MAITRI", node: "MAITRI", actor: "SYSTEM", observedAt: "24 Jan 09:00", tier: null, summary: "Maitri link OFFLINE (simulated, never synced)" },
  conflict: { deviceSeq: "SYSTEM", device: "SYSTEM", seq: 0, type: "CONFLICT_FLAGGED", entity: "SK-2", node: "MAITRI", actor: "SYSTEM", observedAt: "25 Jan 16:10", tier: null, summary: "SK-2 status: DOWN vs OK · DOWN kept" },
  vessel: { deviceSeq: "SYSTEM", device: "SYSTEM", seq: 0, type: "VESSEL_UPDATED", entity: "MV Ice Star", node: "CAPE_TOWN", actor: "SYSTEM", observedAt: "25 Jan 16:20", tier: null, summary: "Departure 9 Feb · load cutoff 7 Feb (from DEC-01)" },
  legUpd: { deviceSeq: "SYSTEM", device: "SYSTEM", seq: 0, type: "LEG_UPDATED", entity: "L3-C104", node: "CAPE_TOWN", actor: "SYSTEM", observedAt: "25 Jan 16:20", tier: null, summary: "L3 ETA 27 Feb (from DEC-01)" },
};

/** Timelines as each viewer knows them, newest first, with age at that moment. */
export const TIMELINES: Record<MomentId, (OpEventRow & { age: string })[]> = {
  start: [],
  slip: [
    { ...SYSTEM_EVENTS.proposed, age: "0 m" },
    { ...EV.legDelayed, age: "1 m" },
  ],
  "hq-2501600": [
    { ...EV.hqSk2, age: "29 h" },
    { ...SYSTEM_EVENTS.linkOff, age: "31 h" },
    { ...SYSTEM_EVENTS.proposed, age: "31 h 49 m" },
    { ...EV.legDelayed, age: "31 h 50 m" },
  ],
  "maitri-2501600": [
    { ...EV.incident, age: "0 m", pending: true },
    { ...EV.checkin, age: "9 h" },
    { ...EV.maitriNote, age: "30 h 30 m", pending: true },
    { ...EV.maitriSk2, age: "30 h 40 m", pending: true },
    { ...EV.maitriCount, age: "30 h 45 m", pending: true },
    { ...EV.maitriIssue, age: "30 h 50 m", pending: true },
    { ...SYSTEM_EVENTS.linkOff, age: "31 h" },
    { ...SYSTEM_EVENTS.proposed, age: "31 h 49 m" },
    { ...EV.legDelayed, age: "31 h 50 m" },
  ],
  "hq-2501620": [
    { ...SYSTEM_EVENTS.legUpd, age: "0 m" },
    { ...SYSTEM_EVENTS.vessel, age: "0 m" },
    { ...EV.approved, age: "0 m" },
    { ...SYSTEM_EVENTS.conflict, age: "10 m" },
    { ...EV.incident, age: "20 m", recordedAtServer: "25 Jan 16:10" },
    { ...EV.checkin, age: "9 h 20 m", recordedAtServer: "25 Jan 16:10" },
    { ...EV.hqSk2, age: "29 h 20 m" },
    { ...EV.maitriSk2, age: "31 h", recordedAtServer: "25 Jan 16:10" },
    { ...EV.maitriCount, age: "31 h 05 m", recordedAtServer: "25 Jan 16:10" },
    { ...EV.maitriIssue, age: "31 h 10 m", recordedAtServer: "25 Jan 16:10" },
  ],
  "hq-2600900": [],
  "hq-2501610": [],
};

/** Maitri outbox at beat 9 (25 Jan 16:10), in drain order (priority, seq). */
export const OUTBOX_BEAT9: OpEventRow[] = [EV.incident, EV.maitriSk2, EV.maitriIssue, EV.maitriCount, EV.maitriNote].map((e) => ({ ...e, pending: true }));

/* ---------------- Conflict (demo) ---------------- */

export const SK2_CONFLICT: Conflict = {
  id: "CONFLICT · SK-2", entity: "SK-2", entityKind: "asset, Maitri", field: "status", mergeClass: "C-S",
  contenders: [
    { device: "MAITRI-TAB-01", value: "DOWN", note: "track fault", at: "24 Jan 09:20" },
    { device: "HQ-WEB-01", value: "OK", note: "maintenance plan", at: "24 Jan 11:00" },
  ],
  kept: "DOWN", status: "OPEN",
  blocks: ["SK-2 excluded from nearest-asset lists", "Any approval touching SK-2 is blocked"],
};

/* ---------------- Cargo ---------------- */

export interface LegView { id: string; from: string; to: string; etd?: string; eta: string; status: "DONE" | "IN_TRANSIT" | "PLANNED" | "DELAYED"; vessel?: boolean; freshness?: { cls: Freshness; age: string } }
export interface ShipmentView { id: string; contents: string; priority: "CRITICAL" | "HIGH" | "NORMAL"; legs: LegView[]; cutoff: string; slack: string; slackState: Health; feasible: "FEASIBLE" | "EXCLUDED" | "UNCERTAIN"; note?: string }

export const CARGO_START: ShipmentView[] = [
  { id: "C-104", contents: "Diesel 48.0 kL (ISO tank)", priority: "CRITICAL", cutoff: "4 Feb", slack: "2 d", slackState: "GREEN", feasible: "FEASIBLE",
    legs: [
      { id: "L1", from: "Goa", to: "Mumbai", etd: "10 Jan", eta: "12 Jan", status: "DONE" },
      { id: "L2", from: "Mumbai", to: "Cape Town", etd: "12 Jan", eta: "2 Feb", status: "IN_TRANSIT" },
      { id: "L3", from: "Cape Town", to: "Maitri", etd: "6 Feb", eta: "24 Feb", status: "PLANNED", vessel: true },
    ] },
  { id: "C-107", contents: "Medical kits ×2, genset kit ×1", priority: "HIGH", cutoff: "4 Feb", slack: "5 d", slackState: "GREEN", feasible: "FEASIBLE",
    legs: [{ id: "L2", from: "Mumbai", to: "Cape Town", eta: "30 Jan", status: "IN_TRANSIT" }, { id: "L3", from: "Cape Town", to: "Maitri", etd: "6 Feb", eta: "24 Feb", status: "PLANNED", vessel: true }] },
  { id: "C-112", contents: "Science equipment", priority: "NORMAL", cutoff: "4 Feb", slack: "1 d", slackState: "AMBER", feasible: "FEASIBLE",
    legs: [{ id: "L2", from: "Mumbai", to: "Cape Town", eta: "3 Feb", status: "IN_TRANSIT" }, { id: "L3", from: "Cape Town", to: "Maitri", etd: "6 Feb", eta: "24 Feb", status: "PLANNED", vessel: true }] },
];

export const CARGO_SLIP: ShipmentView[] = CARGO_START.map((s) =>
  s.id !== "C-104" ? s : {
    ...s, slack: "−3 d", slackState: "RED", feasible: "EXCLUDED", note: "Cargo excluded by vessel cutoff (window cliff)",
    legs: s.legs.map((l) => (l.id === "L2" ? { ...l, eta: "7 Feb", status: "DELAYED" as const, freshness: { cls: "FRESH" as Freshness, age: "1 m" } } : l)),
  });

export const CARGO_2600900: ShipmentView[] = CARGO_START.map((s): ShipmentView =>
  s.id !== "C-104" ? { ...s, cutoff: "7 Feb" } as ShipmentView : {
    ...s, cutoff: "7 Feb", slack: "0 d", slackState: "AMBER", feasible: "UNCERTAIN", note: "ETA report STALE and slack ≤ 2 d (R17) · verify before acting",
    legs: s.legs.map((l) => (l.id === "L2" ? { ...l, eta: "7 Feb", status: "DELAYED" as const, freshness: { cls: "STALE" as Freshness, age: "48 h 50 min" } } : l.id === "L3" ? { ...l, etd: "9 Feb", eta: "27 Feb" } : l)),
  }).map((s) => s.id === "C-104" ? s : { ...s, slack: s.id === "C-107" ? "8 d" : "4 d", slackState: "GREEN" as Health,
    legs: s.legs.map((l) => (l.id === "L3" ? { ...l, etd: "9 Feb", eta: "27 Feb" } : l)) });

/* ---------------- Inventory (Maitri) ---------------- */

export interface InventoryView { id: string; name: string; unit: string; stock: string; inbound: string; requirement: string; reserve: string; ratio: number; state: Health; cover?: string; freshness: { cls: Freshness; age: string; counted: string }; band?: string; breakdown?: { phase: string; calc: string; value: string }[]; note?: string }

export const INVENTORY_START: InventoryView[] = [
  { id: "INV-DSL", name: "Diesel", unit: "kL", stock: "92.0", inbound: "48.0 (C-104)", requirement: "132.0", reserve: "10 %", ratio: 1.0606, state: "GREEN", cover: "167 d at 0.55", freshness: { cls: "FRESH", age: "4 h", counted: "24 Jan 04:00" },
    breakdown: [{ phase: "Closing", calc: "36 d × 0.55", value: "19.8" }, { phase: "Winter", calc: "260 d × 0.38", value: "98.8" }, { phase: "Mobilisation", calc: "4 d × 0.35", value: "1.4" }, { phase: "Base", calc: "sum", value: "120.0" }, { phase: "Reserve", calc: "× 1.10", value: "132.0" }] },
  { id: "INV-FOOD", name: "Food", unit: "person-days", stock: "8900", inbound: "—", requirement: "8280", reserve: "15 %", ratio: 1.0749, state: "GREEN", cover: "370 d at 24 people", freshness: { cls: "FRESH", age: "12 h", counted: "23 Jan 20:00" },
    breakdown: [{ phase: "Base", calc: "24 people × 300 d", value: "7200" }, { phase: "Reserve", calc: "× 1.15", value: "8280" }] },
  { id: "INV-MEDKIT", name: "Winter medical kits", unit: "kits", stock: "10", inbound: "2 (C-107)", requirement: "9", reserve: "50 %", ratio: 1.3333, state: "GREEN", freshness: { cls: "AGING", age: "46 h", counted: "22 Jan 10:00" }, breakdown: [{ phase: "Fixed", calc: "6 × 1.50", value: "9" }] },
  { id: "INV-O2", name: "Oxygen cylinders", unit: "cylinders", stock: "20", inbound: "—", requirement: "18", reserve: "50 %", ratio: 1.1111, state: "GREEN", freshness: { cls: "AGING", age: "46 h", counted: "22 Jan 10:00" }, breakdown: [{ phase: "Fixed", calc: "12 × 1.50", value: "18" }] },
  { id: "INV-GENKIT", name: "Genset overhaul kits", unit: "kits", stock: "4", inbound: "1 (C-107)", requirement: "3", reserve: "50 %", ratio: 1.6667, state: "GREEN", freshness: { cls: "STALE", age: "3 d 22 h", counted: "20 Jan 10:00" }, breakdown: [{ phase: "Fixed", calc: "2 × 1.50", value: "3" }] },
];

export const INVENTORY_SLIP: InventoryView[] = INVENTORY_START.map((i) =>
  i.id === "INV-DSL" ? { ...i, inbound: "0.0 (C-104 excluded)", ratio: 0.697, state: "RED", note: "B0 would show 0 alerts: on-hand 92.0 kL unchanged" } : i);

/* ---------------- Personnel & missions ---------------- */

export const ROLE_COVERAGE = [
  { role: "Doctor", have: 2, need: 1, state: "GREEN" as const, names: ["Dr K. Menon", "Dr P. Shah"] },
  { role: "Diesel mechanic", have: 2, need: 1, state: "GREEN" as const, names: [] },
  { role: "Comms engineer", have: 2, need: 1, state: "GREEN" as const, names: ["V. Iyer"] },
  { role: "Cook", have: 2, need: 1, state: "GREEN" as const, names: [] },
];

export const NAMED_PEOPLE = [
  { name: "Cdr A. Rao", role: "Station Leader" },
  { name: "Dr K. Menon", role: "Doctor" },
  { name: "Dr P. Shah", role: "Doctor" },
  { name: "V. Iyer", role: "Comms engineer" },
  { name: "Dr A. Verma", role: "Glaciologist · FT-3" },
  { name: "R. Nair", role: "Field guide · FT-3" },
  { name: "S. Kulkarni", role: "Logistics officer" },
];

export const MISSIONS = { start: [F27("OK", "Needs met"), F31], slip: [F27("AT_RISK", "Draws 4.0 kL diesel while Fuel is RED"), F31] };

/* ---------------- Assets (Maitri) ---------------- */

export const ASSETS = [
  { id: "GEN-1", type: "Generator", status: "OK" }, { id: "GEN-2", type: "Generator", status: "OK" }, { id: "GEN-3", type: "Generator", status: "OK" },
  { id: "VSAT-1", type: "Comms · VSAT", status: "OK" }, { id: "IRD-1", type: "Comms · Iridium", status: "OK" },
  { id: "SK-1", type: "Skidoo · 30 km/h", status: "OK" }, { id: "SK-2", type: "Skidoo · 30 km/h", status: "OK" }, { id: "SK-3", type: "Skidoo · 30 km/h", status: "OK" },
  { id: "SK-4", type: "Skidoo · 30 km/h", status: "OK" }, { id: "SK-5", type: "Skidoo · 30 km/h", status: "OK" },
  { id: "PB-1", type: "Snow tractor · 15 km/h", status: "OK" }, { id: "HX-1", type: "Helicopter · 120 km/h", status: "OK" },
];

/* ---------------- Map ---------------- */

export const NODES = [
  { id: "HQ", name: "Goa HQ", lat: 15.4, lon: 73.79 },
  { id: "MUMBAI", name: "Mumbai", lat: 18.95, lon: 72.84 },
  { id: "CAPE_TOWN", name: "Cape Town", lat: -33.92, lon: 18.42 },
  { id: "MAITRI", name: "Maitri", lat: -70.77, lon: 11.73 },
  { id: "BHARATI", name: "Bharati", lat: -69.41, lon: 76.19 },
];
/** Great-circle distances computed from the seed coordinates (approx.; sea routes are longer). */
export const ROUTE_DISTANCES = { "Goa–Mumbai": "≈ 410 km", "Mumbai–Cape Town": "≈ 8,230 km", "Cape Town–Maitri": "≈ 4,120 km", "Maitri–Bharati": "≈ 2,330 km" };

/* ---------------- Incident INC-01 ---------------- */

export const INCIDENT = {
  id: "INC-01", openedAt: "25 Jan 16:00", openedBy: "Station Leader · MAITRI-TAB-01", team: "FT-3", mission: "F-27 support with SK-4",
  people: [{ name: "Dr A. Verma", role: "Glaciologist", status: "last seen at check-in", age: "9 h" }, { name: "R. Nair", role: "Field guide", status: "last seen at check-in", age: "9 h" }],
  lastConfirmed: { at: "25 Jan 07:00", age: "9 h", lat: "−70.62", lon: "12.10", distance: "≈ 21 km from Maitri", circleKm: 27, freshness: "STALE" as Freshness },
  schedule: "Check-ins every 4 h · next due 11:00 · grace 3 h · overdue 14:00",
  medical: [
    { text: "Doctors at Maitri: Dr K. Menon, Dr P. Shah (2)", age: "status age unknown" },
    { text: "Winter medical kits: 9 on hand after 1 issued (+2 inbound C-107)", age: "count 3 d 6 h · STALE" },
    { text: "Oxygen cylinders: 20", age: "count 3 d 6 h · STALE" },
  ],
  responders: [
    { id: "HX-1", type: "Helicopter", distance: "≈ 21.5 km", eta: "≈ 11 min at 120 km/h", status: "OK", excluded: false, autonomy: "Aviation fuel is not tracked by DHRUV. Diesel autonomy unaffected; confirm aviation fuel separately." },
    { id: "SK-2", type: "Skidoo", distance: "at station", eta: "—", status: "DOWN", excluded: true, autonomy: "Excluded: status DOWN (track fault)." },
    { id: "PB-1", type: "Snow tractor (draws station diesel)", distance: "≈ 21.5 km", eta: "≈ 86 min at 15 km/h", status: "OK", excluded: false, autonomy: "Draws from the Maitri diesel pool. Autonomy cost is computed by the what-if engine on request." },
  ],
  comms: "Maitri link OFFLINE · last contact 31 h ago (simulated link) · local operations active",
  verify: ["Position confirmed by radio if possible", "HX-1 status confirmed", "Medical readiness confirmed (doctor, kits, oxygen)", "SK-2 status confirmed on the ground"],
  timeline: [
    { at: "25 Jan 16:00", text: "INC-01 opened by Station Leader", tier: 0 as Tier },
    { at: "25 Jan 14:00", text: "Check-in overdue (11:00 + 3 h grace) · incident proposed", tier: null },
    { at: "25 Jan 07:00", text: "FT-3 check-in at −70.62, 12.10", tier: 1 as Tier },
    { at: "24 Jan 09:20", text: "SK-2 DOWN · track fault", tier: 1 as Tier },
  ],
};

/* ---------------- What-if (after HOLD approved) ---------------- */

export const SCENARIOS = [
  { id: "delay", label: "Leg or vessel delay", input: "days 0–15", overlay: "LEG_DELAYED / VESSEL_UPDATED" },
  { id: "burn", label: "Burn rate change", input: "−20 % to +30 %", overlay: "BURN_RATE_CHANGED" },
  { id: "asset", label: "Asset unavailable", input: "asset", overlay: "ASSET_STATUS_SET DOWN" },
  { id: "person", label: "Person unavailable", input: "person", overlay: "PERSON_STATUS_SET" },
  { id: "comms", label: "Comms lost for N hours", input: "hours", overlay: "LINK_STATE_SET OFFLINE + clock offset" },
  { id: "missed", label: "Resupply window missed", input: "toggle", overlay: "VESSEL_UPDATED beyond closing" },
];

export const WHATIF_BURN15 = {
  assumption: "Diesel burn +15 % from today (overlay, not written to the log)",
  before: { state: "GREEN" as Health, ratio: 1.0606, R: "132.0", slip: "Slip tolerance 22 days" },
  after: { state: "RED" as Health, ratio: 0.9223, R: "151.8", formula: "140.0 / (120.0 × 1.15 × 1.10) = 140.0 / 151.8", slip: "Reserve reached 23 Oct 2027 · 28 days before the ship" },
  withLevers: { levers: ["CONSERVE", "DEFER_F27"], state: "AMBER" as Health, ratio: 1.0247, formula: "140.0 / ((120 − 12) × 1.15 × 1.10) = 140.0 / 136.62", deadline: "2 Feb (DEFER_F27 binding)" },
  missions: "F-27 AT_RISK while Fuel RED; deferred in the lever combination",
  pnr: "No option reaches GREEN under this assumption",
};

/* ---------------- Director beats ---------------- */

export const DIRECTOR_BEATS = [
  { n: 1, at: "24 Jan 08:10", actor: "HQ Ops · HQ-WEB-01", text: "LEG_DELAYED C-104 L2 → 7 Feb" },
  { n: 2, at: "24 Jan 08:11", actor: "SYSTEM", text: "DECISION_PROPOSED DEC-01 (three options)" },
  { n: 3, at: "24 Jan 09:00", actor: "SYSTEM", text: "LINK_STATE_SET Maitri OFFLINE" },
  { n: 4, at: "24 Jan 09:10–09:30", actor: "Station Leader · MAITRI-TAB-01", text: "Medical kit issue, SK-2 DOWN, mission note, diesel count 92.0 at 09:15" },
  { n: 5, at: "24 Jan 11:00", actor: "HQ Ops · HQ-WEB-01", text: "ASSET_STATUS_SET SK-2 OK (stale plan)" },
  { n: 6, at: "→ 25 Jan 16:00", actor: "Demo clock", text: "Absolute jump to 25 Jan 16:00" },
  { n: 7, at: "25 Jan 07:00", actor: "Field Lead · FT3-TAB-01", text: "CHECKIN_RECORDED FT-3 at −70.62, 12.10" },
  { n: 8, at: "25 Jan 16:00", actor: "Station Leader", text: "INCIDENT_OPENED INC-01 for FT-3" },
  { n: 9, at: "25 Jan 16:10", actor: "SYSTEM", text: "Maitri link DEGRADED then ONLINE · priority drain" },
  { n: 10, at: "on sync", actor: "SYSTEM", text: "CONFLICT_FLAGGED SK-2 (DOWN kept)" },
  { n: 11, at: "25 Jan 16:20", actor: "HQ Ops", text: "DECISION_APPROVED option (a) HOLD_VESSEL, verify_ack" },
];

export const DIM_LABEL: Record<string, string> = { FUEL: "Fuel", FOOD: "Food", MEDICAL: "Medical", SPARES_POWER: "Spares & power", PERSONNEL: "Personnel", COMMS: "Comms" };

/** Lever countdowns as seen at 25 Jan (demo clock one day later). */
export const LEVERS_25JAN: Lever[] = LEVERS.map((l) => ({ ...l, daysLeft: l.daysLeft - 1 }));

/** Trace at the start (24 Jan 08:00): everything GREEN, slip tolerance 22 d. */
export const START_TRACE: TraceStep[] = [
  { rule: "R02", title: "Inbound feasibility: leg ETA vs vessel load cutoff", inputs: { leg_eta: "2 Feb", load_cutoff: "4 Feb", vessel_eta: "24 Feb", closing: "28 Feb" }, formula: "2 Feb ≤ 4 Feb ∧ 24 Feb ≤ 28 Feb", result: "C-104 feasible · slack 2 d", resultState: "GREEN", refs: [ref("shipment", "C-104")] },
  HERO_TRACE[2],
  { rule: "R03", title: "Diesel availability vs requirement", inputs: { stock: "92.0", inbound_feasible: "48.0", R: "132.0" }, formula: "(92.0 + 48.0) / 132.0 = 1.0606", result: "GREEN", resultState: "GREEN", refs: [ref("inventory_item", "INV-DSL")] },
  { rule: "R15", title: "Station state = worst of six dimensions", inputs: { all: "GREEN" }, formula: "worst(…)", result: "Maitri GREEN", resultState: "GREEN", refs: [ref("node", "MAITRI")] },
  { rule: "R16", title: "Slip tolerance (v2)", inputs: { E: "8.0 kL", rate_post: "0.35 kL/d" }, formula: "floor(E / rate_post)", result: "22 days before reserve is touched", refs: [ref("inventory_item", "INV-DSL")] },
];

/** Trace after approval (25 Jan 16:20). */
export const APPROVED_TRACE: TraceStep[] = [
  { rule: "EVENT", title: "DECISION_APPROVED DEC-01 option (a)", inputs: { device: "HQ-WEB-01", observed_at: "25 Jan 16:20", verify_ack: "true" }, formula: "HOLD_VESSEL", result: "VESSEL_UPDATED departure 9 Feb, cutoff 7 Feb · L3 ETA 27 Feb", refs: [ref("decision", "DEC-01")] },
  { rule: "R02", title: "Inbound feasibility after the hold", inputs: { leg_eta: "7 Feb", load_cutoff: "7 Feb", vessel_eta: "27 Feb", closing: "28 Feb" }, formula: "7 Feb ≤ 7 Feb ∧ 27 Feb ≤ 28 Feb", result: "C-104 feasible · slack 0 d", resultState: "GREEN", refs: [ref("shipment", "C-104")] },
  { rule: "R03", title: "Diesel availability vs requirement", inputs: { stock: "92.0", inbound_feasible: "48.0", R: "132.0" }, formula: "(92.0 + 48.0) / 132.0 = 1.0606", result: "GREEN", resultState: "GREEN", refs: [ref("inventory_item", "INV-DSL")] },
  { rule: "R13", title: "Band after sync (count FRESH)", inputs: { count_age: "7 h" }, formula: "low side", result: "1.0524 · no straddle", resultState: "GREEN", refs: [ref("inventory_item", "INV-DSL")] },
  { rule: "R16", title: "Slip tolerance (v2)", inputs: { E: "8.0 kL" }, formula: "floor(E / rate_post)", result: "22 days before reserve is touched", refs: [ref("inventory_item", "INV-DSL")] },
];
