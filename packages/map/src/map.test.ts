import { describe, expect, it } from "vitest";
import { etaMinutes, formatAge, haversineKm, uncertaintyRadiusKm } from "./geo.js";
import { buildMapModel } from "./model.js";
import { renderSchematicSvg } from "./schematic.js";
import { ev, NOW, scenarioEvents, scenarioSeed } from "./test/fixture.js";

describe("geo (sections 8 and 10)", () => {
  it("FT-3's last check-in is about 21 km from Maitri", () => {
    expect(haversineKm({ lat: -70.62, lon: 12.1 }, { lat: -70.77, lon: 11.73 })).toBeCloseTo(21.5, 0);
  });

  it("circle radius is min(age_h x 3 km/h, 30 km), none while FRESH", () => {
    expect(uncertaintyRadiusKm(0.5)).toBeNull();
    expect(uncertaintyRadiusKm(9)).toBe(27);
    expect(uncertaintyRadiusKm(20)).toBe(30);
  });

  it("ETA is distance over speed", () => {
    expect(etaMinutes(30, 120)).toBe(15);
  });

  it("ages read like the design system, never 'live'", () => {
    expect([formatAge(0.25), formatAge(9), formatAge(35), formatAge(96)]).toEqual(["15 min ago", "9 h ago", "35 h ago", "4 d ago"]);
  });
});

describe("map model: section 10 emergency scenario at 25 Jan 16:00", () => {
  const model = buildMapModel({ seed: scenarioSeed(), events: scenarioEvents(), now: NOW, incidentId: "INC-01" });

  it("last confirmed 9 h ago with a 27 km circle", () => {
    expect(model.incident).toMatchObject({ team_id: "FT-3", ageLabel: "Last confirmed 9 h ago", uncertaintyKm: 27, position: { lat: -70.62, lon: 12.1 } });
  });

  it("HX-1 is the nearest capable asset at about 11 min; SK-2 is held back by its conflict", () => {
    const { capable, excluded } = model.incident!.nearest;
    expect(capable[0]).toMatchObject({ asset_id: "HX-1" });
    expect(Math.round(capable[0]!.etaMinutes)).toBe(11);
    expect(capable.map((c) => c.asset_id)).toEqual(["HX-1", "SK-1", "PB-1"]);
    expect(excluded).toEqual(
      expect.arrayContaining([
        { asset_id: "SK-2", reason: "status conflict, kept DOWN until a human resolves it" },
        { asset_id: "SK-4", reason: "no known position" },
      ]),
    );
  });

  it("every non-node feature carries its age; the team gets the circle", () => {
    const team = model.features.find((f) => f.id === "FT-3")!;
    expect(team).toMatchObject({ kind: "team", ageLabel: "9 h ago", uncertaintyKm: 27 });
    expect(model.features.find((f) => f.id === "HX-1")!.ageLabel).toBe("32 h ago");
    expect(model.features.filter((f) => f.kind !== "node").every((f) => f.ageLabel)).toBe(true);
    expect(model.features.find((f) => f.id === "SK-2")).toMatchObject({ status: "DOWN", conflict: true });
  });

  it("route line Goa to Maitri, with the slipped leg shown as delayed", () => {
    expect(model.routes.map((r) => `${r.from.node_id}->${r.to.node_id}:${r.status}`)).toEqual(["HQ->MUMBAI:DONE", "MUMBAI->CAPE_TOWN:DELAYED", "CAPE_TOWN->MAITRI:PLANNED"]);
    expect(model.routes[1]!.eta).toBe("2027-02-07T00:00:00.000Z");
  });

  it("once a human resolves SK-2 as OK, it becomes a candidate", () => {
    const resolved = buildMapModel({
      seed: scenarioSeed(),
      events: [...scenarioEvents(), ev("CONFLICT_RESOLVED", "HQ-WEB-01", { conflict_id: "CF-1", chosen_value: "OK", resolver: "HQ-WEB-01" }, "2027-01-25T16:05:00.000Z")],
      now: NOW,
      incidentId: "INC-01",
    });
    expect(resolved.incident!.nearest.capable.map((c) => c.asset_id)).toContain("SK-2");
  });

  it("freshness is viewer-relative: at 07:30 the same check-in is FRESH and has no circle", () => {
    const early = buildMapModel({ seed: scenarioSeed(), events: scenarioEvents(), now: "2027-01-25T07:30:00.000Z", incidentId: "INC-01" });
    expect(early.incident).toMatchObject({ ageLabel: "Last confirmed 30 min ago", uncertaintyKm: null });
  });

  it("an unknown incident has no focus", () => {
    expect(buildMapModel({ seed: scenarioSeed(), events: scenarioEvents(), now: NOW, incidentId: "INC-99" }).incident).toBeNull();
  });
});

describe("schematic fallback (no tiles)", () => {
  const model = buildMapModel({ seed: scenarioSeed(), events: scenarioEvents(), now: NOW, incidentId: "INC-01" });

  it("shows the circle, the age, distances with ETAs, the exclusion and the synthetic label", () => {
    const svg = renderSchematicSvg(model);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("INC-01 · Last confirmed 9 h ago · circle 27 km");
    expect(svg).toContain('class="circle"');
    expect(svg).toMatch(/21\.\d km/);
    expect(svg).toContain("HX-1 ~11 min");
    expect(svg).toContain("SK-2: status conflict, kept DOWN");
    expect(svg).toContain("SK-2 (Skidoo) · 29 h ago · conflict");
    expect(svg).toContain("Synthetic demonstration data");
    expect(svg).not.toMatch(/\blive\b/i);
  });

  it("the route view fits Goa to Maitri", () => {
    const svg = renderSchematicSvg(model, { view: "all" });
    expect((svg.match(/class="route /g) ?? []).length).toBe(3);
    expect(svg).toContain("route DELAYED");
    expect(svg).toContain("Goa HQ");
  });

  it("escapes text that came from events", () => {
    const hostile = buildMapModel({
      seed: scenarioSeed(),
      events: [ev("CHECKIN_RECORDED", "FT3-TAB-01", { person_or_team_id: '<img src=x onerror="alert(1)">', lat: -70.6, lon: 12 }, "2027-01-25T07:00:00.000Z")],
      now: NOW,
    });
    const svg = renderSchematicSvg(hostile, { view: "all" });
    expect(svg).not.toContain("<img");
    expect(svg).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
});
