import { describe, expect, it } from "vitest";
import { config, type Seed } from "@dhruv/shared";
import { IDS, NODES, season48 } from "@dhruv/seed";
import { openDb } from "./index.js";
import { loadSeed, resetToStart } from "./seedData.js";

/**
 * Checks the transcription of Build Bible section 13 against its own reference numbers. The ratio
 * arithmetic here is only a cross-check of the data; the real rules are A's engine.
 */
function seeded(): Seed {
  const db = openDb(":memory:");
  resetToStart(db, season48);
  return loadSeed(db);
}

const PHASE_DAYS = Object.fromEntries(config.season.phases.map((p) => [p.phase, p.days]));
const DAY_MS = 86_400_000;

function requirement(seed: Seed, itemId: string): number {
  const item = seed.inventory_items.find((i) => i.id === itemId)!;
  const base =
    item.requirement_mode === "FIXED"
      ? item.fixed_requirement!
      : seed.consumption_profiles.filter((p) => p.item_id === itemId).reduce((sum, p) => sum + p.rate_per_day * PHASE_DAYS[p.phase]!, 0);
  return base * (1 + item.reserve_pct / 100);
}

/** (stock + inbound cargo) / requirement, as section 13's reference ratios compute it. */
function ratio(seed: Seed, itemId: string): number {
  const item = seed.inventory_items.find((i) => i.id === itemId)!;
  const inbound = seed.cargo_items.filter((c) => c.inventory_item_id === itemId).reduce((sum, c) => sum + c.qty, 0);
  return (item.stock + inbound) / requirement(seed, itemId);
}

describe("season48 (Build Bible section 13)", () => {
  const seed = seeded();

  it("loads into the section 14 schema and round-trips unchanged", () => {
    expect(seed).toEqual(season48);
  });

  it("phases add up to the 300-day horizon ending 20 Nov", () => {
    expect(config.season.phases.reduce((sum, p) => sum + p.days, 0)).toBe(config.season.horizonDays);
    for (const p of config.season.phases) expect((Date.parse(p.end) - Date.parse(p.start)) / DAY_MS).toBe(p.days);
    expect(config.season.phases.at(-1)!.end).toBe(config.season.horizonAt);
  });

  it("reproduces Maitri's reference ratios at start", () => {
    expect(requirement(seed, IDS.dieselMaitri)).toBeCloseTo(132.0, 4);
    expect(ratio(seed, IDS.dieselMaitri)).toBeCloseTo(1.0606, 4);
    expect(requirement(seed, IDS.foodMaitri)).toBeCloseTo(8280, 4);
    expect(ratio(seed, IDS.foodMaitri)).toBeCloseTo(1.0749, 4);
    expect(ratio(seed, IDS.medKitsMaitri)).toBeCloseTo(1.3333, 4);
    expect(ratio(seed, IDS.oxygenMaitri)).toBeCloseTo(1.1111, 4);
    expect(Math.min(ratio(seed, IDS.medKitsMaitri), ratio(seed, IDS.oxygenMaitri))).toBeCloseTo(1.1111, 4);
    expect(ratio(seed, IDS.gensetKitsMaitri)).toBeCloseTo(1.6667, 4);
  });

  it("reproduces Bharati's diesel numbers and keeps its other dimensions between 1.09 and 1.30", () => {
    expect(requirement(seed, IDS.dieselBharati) / 1.1).toBeCloseTo(108.0, 4);
    expect(requirement(seed, IDS.dieselBharati)).toBeCloseTo(118.8, 4);
    expect(ratio(seed, IDS.dieselBharati)).toBeCloseTo(1.1364, 4);
    for (const id of [IDS.foodBharati, IDS.medKitsBharati, IDS.oxygenBharati, IDS.gensetKitsBharati]) {
      expect(ratio(seed, id)).toBeGreaterThanOrEqual(1.09);
      expect(ratio(seed, id)).toBeLessThanOrEqual(1.3);
    }
  });

  it("has 24 Maitri winterers with every critical role at need + 1, and Bharati at need + 1", () => {
    const at = (node: string) => seed.personnel.filter((p) => p.node_id === node);
    expect(at(NODES.MAITRI)).toHaveLength(24);
    for (const node of [NODES.MAITRI, NODES.BHARATI]) {
      for (const [role, need] of Object.entries(config.season.roleNeed)) {
        expect(at(node).filter((p) => p.role === role).length, `${node} ${role}`).toBeGreaterThanOrEqual(need + 1);
      }
    }
  });

  it("has three generators OK at each station against a need of two, and both comms links", () => {
    for (const node of [NODES.MAITRI, NODES.BHARATI]) {
      const ok = (type: string) => seed.assets.filter((a) => a.node_id === node && a.type === type && a.status === "OK").length;
      expect(ok("Generator")).toBe(config.season.generatorsNeeded + 1);
      expect(ok("VSAT")).toBe(1);
      expect(ok("Iridium")).toBe(1);
    }
  });

  it("sets each lever's deadline (cutoff minus lead time) to section 13's dates", () => {
    const deadline = (id: string) => {
      const lever = seed.levers.find((l) => l.id === id)!;
      return new Date(Date.parse(lever.cutoff) - lever.lead_days * DAY_MS).toISOString().slice(0, 10);
    };
    expect(deadline("HOLD_VESSEL")).toBe("2027-02-03");
    expect(deadline("AIRLIFT_PARTIAL")).toBe("2027-01-31");
    expect(deadline("DEFER_F27")).toBe("2027-02-02");
    expect(deadline("CONSERVE")).toBe("2027-02-27");
  });

  it("routes C-104 Goa to Mumbai to Cape Town to Maitri, with L3 on MV Ice Star", () => {
    const legs = seed.legs.filter((l) => l.shipment_id === IDS.shipmentC104).sort((a, b) => a.seq - b.seq);
    expect(legs.map((l) => [l.from_node, l.to_node, l.status])).toEqual([
      [NODES.HQ, NODES.MUMBAI, "DONE"],
      [NODES.MUMBAI, NODES.CAPE_TOWN, "IN_TRANSIT"],
      [NODES.CAPE_TOWN, NODES.MAITRI, "PLANNED"],
    ]);
    expect(legs[1]!.eta).toBe("2027-02-02T00:00:00.000Z");
    expect(legs[2]).toMatchObject({ vessel_id: IDS.vessel, eta: "2027-02-24T00:00:00.000Z" });
  });

  it("names every id the Director script and lever follow-ups rely on", () => {
    const has = (rows: { id: string }[], id: string) => rows.some((r) => r.id === id);
    expect(has(seed.inventory_items, IDS.dieselMaitri) && has(seed.inventory_items, IDS.medKitsMaitri)).toBe(true);
    expect(has(seed.assets, IDS.skidoo2) && has(seed.assets, IDS.helicopter)).toBe(true);
    expect(has(seed.missions, IDS.missionF27) && has(seed.vessels, IDS.vessel) && has(seed.legs, IDS.legC104Vessel)).toBe(true);
    expect(has(seed.personnel, IDS.personVerma) && has(seed.personnel, IDS.personNair)).toBe(true);
  });
});
