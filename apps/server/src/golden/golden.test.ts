import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { evaluate, reduce, type DimensionEval, type Evaluation, type StationEval } from "@dhruv/engine";
import { EVENT_RULES, type EventType, type OpEvent } from "@dhruv/shared";
import { DIRECTOR_BEATS, DEVICES, IDS, LEVER_ACTIONS, NODES, season48 } from "@dhruv/seed";

/**
 * Golden tests (Build Bible section 18, as amended by v2 section 5) run against the real
 * season48 seed and the real Director script. Each test builds the event log a given device holds
 * at a given demo moment, calls evaluate() at that moment, and checks the Bible's numbers.
 *
 * `known` marks a test the engine does not pass yet: it runs as it.fails, so CI stays green while
 * the gap exists and turns red the moment the engine is fixed (then drop the `known` note).
 */

const t = (day: number, hhmm: string) => `2027-01-${String(day).padStart(2, "0")}T${hhmm}:00.000Z`;
const FEB = (day: number) => `2027-02-${String(day).padStart(2, "0")}T00:00:00.000Z`;

// ---- Event log builders ------------------------------------------------------------------------

let counter = 0;
const seqs = new Map<string, number>();

function event(e: { device_id: string; type: EventType; entity_type: string; entity_id: string; node_id: string; payload: Record<string, unknown>; observed_at: string; actor_role?: OpEvent["actor_role"] }): OpEvent {
  counter += 1;
  const seq = (seqs.get(e.device_id) ?? 0) + 1;
  seqs.set(e.device_id, seq);
  return {
    event_id: `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`,
    device_id: e.device_id,
    seq,
    type: e.type,
    entity_type: e.entity_type,
    entity_id: e.entity_id,
    node_id: e.node_id,
    payload: e.payload,
    observed_at: e.observed_at,
    created_at_client: e.observed_at,
    priority: EVENT_RULES[e.type].defaultPriority,
    actor_role: e.actor_role ?? "SYSTEM",
    schema_version: 1,
  };
}

/** The Director's events for these beats, optionally only those written on some devices. */
function beats(ids: string[], devices?: string[]): OpEvent[] {
  return ids.flatMap((id) => {
    const beat = DIRECTOR_BEATS.find((b) => b.beat === id);
    if (!beat) throw new Error(`no beat ${id}`);
    return beat.events.filter((e) => !devices || devices.includes(e.device_id)).map((e) => event({ ...e }));
  });
}

/** Beat 11: HQ approves option (a) HOLD_VESSEL; the server writes the lever's follow-ups. */
function approveHold(at: string): OpEvent[] {
  const approval = event({
    device_id: DEVICES.SERVER, actor_role: "HQ_OPS", type: "DECISION_APPROVED", entity_type: "decision", entity_id: IDS.decision1, node_id: NODES.MAITRI,
    payload: { decision_id: IDS.decision1, chosen_option_id: "OPT-1", approver: DEVICES.HQ_WEB, verify_ack: true }, observed_at: at,
  });
  const followUps = LEVER_ACTIONS.HOLD_VESSEL!.followUps.map((f) => event({ ...f, device_id: DEVICES.SERVER, payload: { ...f.payload, decision_id: IDS.decision1 }, observed_at: at }));
  return [approval, ...followUps];
}

const burnUplift = (itemId: string, pct: number, at: string) =>
  event({ device_id: DEVICES.HQ_WEB, actor_role: "HQ_OPS", type: "BURN_RATE_CHANGED", entity_type: "inventory_item", entity_id: itemId, node_id: NODES.MAITRI, payload: { item_id: itemId, phase: "WINTER", uplift_pct: pct }, observed_at: at });

// ---- Result helpers -----------------------------------------------------------------------------

const station = (e: Evaluation, node: string): StationEval | undefined => e.stations.find((s) => s.nodeId === node);
const dim = (e: Evaluation, node: string, key: string): DimensionEval | undefined => station(e, node)?.dimensions.find((d) => d.key === key);
const option = (e: Evaluation, label: string) => station(e, NODES.MAITRI)?.options?.find((o) => o.label === label);
const leverSet = (ids: string[]) => [...ids].sort().join("+");
const day = (iso: string | null | undefined) => iso?.slice(0, 10);

type Case = (name: string, fn: () => void) => void;
/** GOLDEN_STRICT=1 runs the known gaps as ordinary tests, to see exactly why each one fails. */
const known = (gap: string): Case => (name, fn) =>
  (process.env.GOLDEN_STRICT ? it : it.fails)(`${name}  [known engine gap: ${gap}]`, fn);

// ---- The demo's event logs ------------------------------------------------------------------------

/** HQ after the slip and the proposal (beats 1-2). */
const slip = () => beats(["1", "2"]);
/** HQ before Maitri syncs at 25 Jan 16:00: its own and server beats only (1, 2, 5). */
const hqBeforeSync = () => beats(["1", "2", "5"]);
/** Maitri's tablet at 25 Jan 16:00, offline since beat 3: what it pulled before, plus its own writes. */
const maitriOffline = () => [...beats(["1", "2"]), ...beats(["3", "4", "7", "8"], [DEVICES.MAITRI_TAB])];
/** Everyone after beat 9 synced (25 Jan 16:10). */
const synced = () => beats(["1", "2", "3", "4", "5", "7", "8"]);

describe("T-ENG-01 to 06: seed, slip, options, approval", () => {
  it("T-ENG-01 seed at 24 Jan 08:00: Maitri fuel 1.0606 GREEN, food 1.0749, station GREEN", () => {
    const e = evaluate({ seed: season48, events: [] }, t(24, "08:00"));
    expect(dim(e, NODES.MAITRI, "FUEL")).toMatchObject({ state: "GREEN" });
    expect(dim(e, NODES.MAITRI, "FUEL")?.ratio).toBeCloseTo(1.0606, 4);
    expect(dim(e, NODES.MAITRI, "FOOD")?.ratio).toBeCloseTo(1.0749, 4);
    expect(station(e, NODES.MAITRI)?.state).toBe("GREEN");
  });

  it("T-ENG-01 medical 1.1111", () => {
    const e = evaluate({ seed: season48, events: [] }, t(24, "08:00"));
    expect(dim(e, NODES.MAITRI, "MEDICAL")?.ratio).toBeCloseTo(1.1111, 4);
  });

  it("T-ENG-01 Bharati fuel 1.1364 GREEN", () => {
    const e = evaluate({ seed: season48, events: [] }, t(24, "08:00"));
    expect(dim(e, NODES.BHARATI, "FUEL")?.ratio).toBeCloseTo(1.1364, 4);
    expect(station(e, NODES.BHARATI)?.state).toBe("GREEN");
  });

  it("T-ENG-02 LEG_DELAYED to 7 Feb: C-104 excluded, fuel 0.6970 RED, station RED", () => {
    const e = evaluate({ seed: season48, events: slip() }, t(24, "08:10"));
    const fuel = dim(e, NODES.MAITRI, "FUEL");
    expect(fuel?.state).toBe("RED");
    expect(fuel?.ratio).toBeCloseTo(0.697, 3);
    expect(station(e, NODES.MAITRI)?.state).toBe("RED");
    expect(fuel?.trace.find((s) => s.rule === "R02")?.text).toMatch(/2027-02-07|7 Feb/);
  });

  it("T-ENG-02 F-27 AT_RISK and F-31 OK", () => {
    const e = evaluate({ seed: season48, events: slip() }, t(24, "08:10"));
    const missions = (station(e, NODES.MAITRI) as StationEval & { missions?: { missionId: string; status: string }[] }).missions ?? [];
    expect(missions.find((m) => m.missionId === "F-27")?.status).toBe("AT_RISK");
    expect(missions.find((m) => m.missionId === "F-31")?.status).toBe("OK");
  });

  it("T-ENG-03 lever deadlines, options (a) (b) (c) and PNR 3 Feb with 10 days", () => {
    const e = evaluate({ seed: season48, events: slip() }, t(24, "08:10"));
    const levers = Object.fromEntries((station(e, NODES.MAITRI)?.levers ?? []).map((l) => [l.id, day(l.deadline)]));
    expect(levers).toEqual({ HOLD_VESSEL: "2027-02-03", AIRLIFT_PARTIAL: "2027-01-31", DEFER_F27: "2027-02-02", CONSERVE: "2027-02-27" });

    const a = option(e, "(a)");
    expect(leverSet(a!.leverIds)).toBe(leverSet(["HOLD_VESSEL"]));
    expect(a!.ratio).toBeCloseTo(1.0606, 4);
    expect(a!.state).toBe("GREEN");
    expect(day(a!.deadline)).toBe("2027-02-03");

    const b = option(e, "(b)");
    expect(leverSet(b!.leverIds)).toBe(leverSet(["HOLD_VESSEL", "CONSERVE", "DEFER_F27"]));
    expect(b!.ratio).toBeCloseTo(1.1785, 4);
    expect(day(b!.deadline)).toBe("2027-02-02");

    const c = option(e, "(c)");
    expect(leverSet(c!.leverIds)).toBe(leverSet(["AIRLIFT_PARTIAL", "DEFER_F27", "CONSERVE"]));
    expect(c!.ratio).toBeCloseTo(0.8754, 4);
    expect(c!.state).toBe("RED");
    expect(c!.gap).toBeCloseTo(14.8, 1);
    expect(day(c!.deadline)).toBe("2027-01-31");

    expect(day(station(e, NODES.MAITRI)?.pnr?.pnrDate)).toBe("2027-02-03");
    expect(station(e, NODES.MAITRI)?.pnr?.daysRemaining).toBe(10);
  });

  it("T-ENG-03 option (a) costs 19.5 lakh", () => {
    const e = evaluate({ seed: season48, events: slip() }, t(24, "08:10"));
    expect(option(e, "(a)")!.cost).toBeCloseTo(19.5, 4);
  });

  it("T-ENG-04 tie-break: (a) is {HOLD_VESSEL} alone", () => {
    const e = evaluate({ seed: season48, events: slip() }, t(24, "08:10"));
    expect(option(e, "(a)")!.leverIds).toEqual(["HOLD_VESSEL"]);
  });

  it("T-ENG-05 approve (a): C-104 feasible again, fuel 1.0606 GREEN", () => {
    const e = evaluate({ seed: season48, events: [...slip(), ...approveHold(t(24, "09:00"))] }, t(24, "09:00"));
    expect(dim(e, NODES.MAITRI, "FUEL")?.ratio).toBeCloseTo(1.0606, 4);
    expect(dim(e, NODES.MAITRI, "FUEL")?.state).toBe("GREEN");
  });

  it("T-ENG-06 boundary: leg ETA 8 Feb after the hold is excluded again, RED", () => {
    const later = event({ device_id: DEVICES.HQ_WEB, actor_role: "HQ_OPS", type: "LEG_DELAYED", entity_type: "leg", entity_id: IDS.legC104Feeder, node_id: NODES.HQ, payload: { leg_id: IDS.legC104Feeder, new_eta: FEB(8), reason: "further delay" }, observed_at: t(24, "10:00") });
    const e = evaluate({ seed: season48, events: [...slip(), ...approveHold(t(24, "09:00")), later] }, t(24, "10:00"));
    expect(dim(e, NODES.MAITRI, "FUEL")?.state).toBe("RED");
  });
});

describe("T-ENG-07 (v2), 08 to 12: freshness band, burn, food, people, power", () => {
  known("R01 counts days from today, as the Bible's formula says, but the golden numbers keep R = 132 kL (spec conflict, decision needed)")("T-ENG-07 HQ at 25 Jan 16:00: count 36 h AGING, option (a) band 1.0334-1.0815, GREEN could be AMBER", () => {
    const e = evaluate({ seed: season48, events: hqBeforeSync() }, t(25, "16:00"));
    expect(dim(e, NODES.MAITRI, "FUEL")?.freshness).toBe("AGING");
    const band = option(e, "(a)")!.confidenceBand!;
    expect(band.burnDepletion).toBeCloseTo(0.825, 3);
    expect(band.low).toBeCloseTo(1.0334, 4);
    expect(band.high).toBeCloseTo(1.0815, 4);
    expect(band.straddles).toBe(true);
    expect(band.text).toBe("GREEN, could be AMBER");
  });

  it("T-ENG-08 after the hold, burn +15%: R 151.8, ratio 0.9223 RED", () => {
    const e = evaluate({ seed: season48, events: [...slip(), ...approveHold(t(24, "09:00")), burnUplift(IDS.dieselMaitri, 15, t(24, "10:00"))] }, t(24, "10:00"));
    expect(dim(e, NODES.MAITRI, "FUEL")?.ratio).toBeCloseTo(0.9223, 4);
    expect(dim(e, NODES.MAITRI, "FUEL")?.state).toBe("RED");
  });

  it("T-ENG-09 as T-ENG-08 plus CONSERVE and DEFER_F27: 1.0247 AMBER", () => {
    const e = evaluate({ seed: season48, events: [...slip(), ...approveHold(t(24, "09:00")), burnUplift(IDS.dieselMaitri, 15, t(24, "10:00"))] }, t(24, "10:00"));
    const both = station(e, NODES.MAITRI)?.options?.find((o) => leverSet(o.leverIds) === leverSet(["CONSERVE", "DEFER_F27"]));
    expect(both?.ratio).toBeCloseTo(1.0247, 4);
    expect(both?.state).toBe("AMBER");
  });

  it("T-ENG-10 food burn +10%: R 9108, ratio 0.9772 AMBER", () => {
    const e = evaluate({ seed: season48, events: [burnUplift(IDS.foodMaitri, 10, t(24, "10:00"))] }, t(24, "10:00"));
    expect(dim(e, NODES.MAITRI, "FOOD")?.ratio).toBeCloseTo(0.9772, 4);
    expect(dim(e, NODES.MAITRI, "FOOD")?.state).toBe("AMBER");
  });

  it("T-ENG-11 Dr K. Menon UNAVAILABLE: personnel AMBER; both doctors: RED", () => {
    const status = (person: string, at: string) => event({ device_id: DEVICES.MAITRI_TAB, actor_role: "STATION_LEADER", type: "PERSON_STATUS_SET", entity_type: "person", entity_id: person, node_id: NODES.MAITRI, payload: { person_id: person, status: "UNAVAILABLE" }, observed_at: at });
    const one = evaluate({ seed: season48, events: [status("P-MENON", t(24, "10:00"))] }, t(24, "10:00"));
    expect(dim(one, NODES.MAITRI, "PERSONNEL")?.state).toBe("AMBER");
    const two = evaluate({ seed: season48, events: [status("P-MENON", t(24, "10:00")), status("P-SHAH", t(24, "10:05"))] }, t(24, "10:05"));
    expect(dim(two, NODES.MAITRI, "PERSONNEL")?.state).toBe("RED");
  });

  it("T-ENG-12 GEN-3 DOWN: power AMBER; two down: RED", () => {
    const down = (asset: string, at: string) => event({ device_id: DEVICES.MAITRI_TAB, actor_role: "STATION_LEADER", type: "ASSET_STATUS_SET", entity_type: "asset", entity_id: asset, node_id: NODES.MAITRI, payload: { asset_id: asset, status: "DOWN" }, observed_at: at });
    const powerOf = (e: Evaluation) => dim(e, NODES.MAITRI, "POWER") ?? dim(e, NODES.MAITRI, "SPARES_POWER");
    expect(powerOf(evaluate({ seed: season48, events: [down("GEN-3", t(24, "10:00"))] }, t(24, "10:00")))?.state).toBe("AMBER");
    expect(powerOf(evaluate({ seed: season48, events: [down("GEN-3", t(24, "10:00")), down("GEN-2", t(24, "10:05"))] }, t(24, "10:05")))?.state).toBe("RED");
  });
});

describe("T-ENG-13, 14: determinism and no wall clock", () => {
  it("T-ENG-13 same input twice gives deep-equal output; shuffled events give the same State", () => {
    const events = synced();
    expect(evaluate({ seed: season48, events }, t(25, "16:10"))).toEqual(evaluate({ seed: season48, events }, t(25, "16:10")));
    const shuffled = [...events].reverse();
    expect(reduce(season48, shuffled)).toEqual(reduce(season48, events));
  });

  it("T-ENG-14 packages/engine/src has no Date.now, argument-less new Date(), Math.random or fetch", () => {
    const root = join(__dirname, "../../../../packages/engine/src");
    const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
    for (const f of files(root)) {
      // Comments may name the forbidden calls ("No Date.now(), no Math.random()"); only code counts.
      const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(src, f).not.toMatch(/Date\.now\(|new Date\(\)|Math\.random\(|\bfetch\(/);
    }
  });
});

describe("v2 golden tests: slip tolerance, uncertainty, slack, food by POB, baseline", () => {
  it("T-ENG-15 seed at 24 Jan 08:00: Maitri diesel slip tolerance 22 days", () => {
    const e = evaluate({ seed: season48, events: [] }, t(24, "08:00"));
    expect(dim(e, NODES.MAITRI, "FUEL")?.slipTolerance?.slipToleranceDays).toBe(22);
  });

  it("T-ENG-15 Bharati slip tolerance 40 days", () => {
    const e = evaluate({ seed: season48, events: [] }, t(24, "08:00"));
    expect(dim(e, NODES.BHARATI, "FUEL")?.slipTolerance?.slipToleranceDays).toBe(40);
  });

  it("T-ENG-16 after the slip: reserve breach 6 Aug 2027, 106 days short of 20 Nov", () => {
    const e = evaluate({ seed: season48, events: slip() }, t(24, "08:10"));
    const slipTol = dim(e, NODES.MAITRI, "FUEL")?.slipTolerance;
    expect(day(slipTol?.reserveBreachDate)).toBe("2027-08-06");
    expect(slipTol?.daysShortOfWindow).toBe(106);
  });

  it("T-ENG-17 after the hold, burn +15%: breach 23 Oct 2027, 28 days short", () => {
    const e = evaluate({ seed: season48, events: [...slip(), ...approveHold(t(24, "09:00")), burnUplift(IDS.dieselMaitri, 15, t(24, "10:00"))] }, t(24, "10:00"));
    const slipTol = dim(e, NODES.MAITRI, "FUEL")?.slipTolerance;
    expect(day(slipTol?.reserveBreachDate)).toBe("2027-10-23");
    expect(slipTol?.daysShortOfWindow).toBe(28);
  });

  known("R01 counts days from today, as the Bible's formula says, but the golden numbers keep R = 132 kL (spec conflict, decision needed)")("T-ENG-18 hold approved, 26 Jan 09:00 (ETA report 48 h 50 min old, slack 0 d): C-104 UNCERTAIN, low 0.6970, GREEN could be RED", () => {
    const events = [...synced(), ...approveHold(t(25, "16:20"))];
    const e = evaluate({ seed: season48, events }, t(26, "09:00"));
    const fuel = dim(e, NODES.MAITRI, "FUEL")!;
    expect(fuel.cargoConfidence?.uncertain).toBe(true);
    expect(fuel.ratio).toBeCloseTo(1.0606, 4);
    expect(fuel.confidence?.low).toBeCloseTo(0.697, 3);
    expect(fuel.confidence?.text).toBe("GREEN, could be RED");
  });

  it("T-ENG-19 option slack: (a) 0 d, (b) 0 d, (c) no inbound dependency", () => {
    const e = evaluate({ seed: season48, events: slip() }, t(24, "08:10"));
    expect(option(e, "(a)")!.slackDays).toBe(0);
    expect(option(e, "(b)")!.slackDays).toBe(0);
    expect(option(e, "(c)")!.slackDays).toBeNull();
  });

  it("T-ENG-20 PERSON_MOVED one winterer Maitri to Cape Town: food R 7935, ratio 1.1216 GREEN", () => {
    const moved = event({ device_id: DEVICES.HQ_WEB, actor_role: "HQ_OPS", type: "PERSON_MOVED", entity_type: "person", entity_id: "P-M16", node_id: NODES.MAITRI, payload: { person_id: "P-M16", from_node: NODES.MAITRI, to_node: NODES.CAPE_TOWN, depart: FEB(20), arrive: "2027-03-10T00:00:00.000Z" }, observed_at: t(24, "10:00") });
    const e = evaluate({ seed: season48, events: [moved] }, t(24, "10:00"));
    const food = dim(e, NODES.MAITRI, "FOOD")!;
    expect(food.foodRequirement?.r).toBeCloseTo(7935, 0);
    expect(food.ratio).toBeCloseTo(1.1216, 4);
    expect(food.state).toBe("GREEN");
  });

  it("T-BASE-01 after the slip: baseline B0 raises no alert (on-hand 92.0 kL unchanged) while the engine says RED", () => {
    const e = evaluate({ seed: season48, events: slip() }, t(24, "08:10"));
    const fuel = dim(e, NODES.MAITRI, "FUEL")!;
    expect(fuel.baselineB0?.hasAlert).toBe(false);
    expect(fuel.state).toBe("RED");
  });
});

describe("Viewer-relative freshness and sync (T-FRESH-04, T-SYNC-08, T-WHATIF-01)", () => {
  it("T-FRESH-04 at 25 Jan 16:00: Maitri's own count FRESH (6 h 45 min), HQ before sync AGING (36 h)", () => {
    expect(dim(evaluate({ seed: season48, events: maitriOffline() }, t(25, "16:00")), NODES.MAITRI, "FUEL")?.freshness).toBe("FRESH");
    expect(dim(evaluate({ seed: season48, events: hqBeforeSync() }, t(25, "16:00")), NODES.MAITRI, "FUEL")?.freshness).toBe("AGING");
  });

  known("R01 counts days from today, as the Bible's formula says, but the golden numbers keep R = 132 kL (spec conflict, decision needed)")("T-SYNC-08 after beat 9 sync, 16:20: HQ count FRESH, option (a) low 1.0524, no straddle; GREEN after approval", () => {
    const before = evaluate({ seed: season48, events: synced() }, t(25, "16:20"));
    expect(dim(before, NODES.MAITRI, "FUEL")?.freshness).toBe("FRESH");
    const band = option(before, "(a)")!.confidenceBand!;
    expect(band.low).toBeCloseTo(1.0524, 4);
    expect(band.straddles).toBe(false);

    const after = evaluate({ seed: season48, events: [...synced(), ...approveHold(t(25, "16:20"))] }, t(25, "16:20"));
    expect(dim(after, NODES.MAITRI, "FUEL")?.state).toBe("GREEN");
  });

  it("T-WHATIF-01 a hypothetical LEG_DELAYED overlay evaluates exactly like the real event", () => {
    const [real] = beats(["1"]);
    const overlay = { ...real!, event_id: "overlay-1", device_id: "WHATIF" };
    const live = evaluate({ seed: season48, events: [real!] }, t(24, "08:10"));
    const whatIf = evaluate({ seed: season48, events: [overlay] }, t(24, "08:10"));
    expect(whatIf).toEqual(live);
  });
});
