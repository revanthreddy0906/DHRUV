// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import L from "leaflet";
import { addMapLayers, colocated, createTileLayer } from "./leaflet.js";
import { buildMapModel } from "./model.js";
import { ev, NOW, scenarioEvents, scenarioSeed } from "./test/fixture.js";

function makeMap() {
  const el = document.createElement("div");
  el.style.width = "800px";
  el.style.height = "600px";
  document.body.appendChild(el);
  return L.map(el).setView([-70.7, 11.9], 9);
}

const tooltip = (l: L.Layer) => (l as L.CircleMarker).getTooltip?.();
const tooltipText = (l: L.Layer) => ((tooltip(l)?.getContent() as HTMLElement | undefined)?.textContent ?? "");
const isPermanent = (l: L.Layer) => !!(tooltip(l)?.options as { permanent?: boolean } | undefined)?.permanent;
const markersOf = (group: L.LayerGroup) => group.getLayers().filter((l) => l instanceof L.CircleMarker && !(l instanceof L.Circle)) as L.CircleMarker[];

describe("Leaflet layers", () => {
  it("draws routes, one marker per spot, the team circle and reach lines to the top responders", () => {
    const map = makeMap();
    const model = buildMapModel({ seed: scenarioSeed(), events: scenarioEvents(), now: NOW, incidentId: "INC-01" });
    const group = addMapLayers(L, map, model);

    const layers = group.getLayers();
    const circles = layers.filter((l) => l instanceof L.Circle) as L.Circle[];
    expect(circles).toHaveLength(1);
    expect(circles[0]!.getRadius()).toBe(27_000);

    // HQ, Mumbai, Cape Town and FT-3 alone; Maitri's node and its five parked assets as one group
    // (a visible marker plus a transparent hover target).
    const spots = colocated(model.features);
    expect(spots).toHaveLength(5);
    expect(markersOf(group)).toHaveLength(spots.length + 1);

    const lines = layers.filter((l) => l instanceof L.Polyline) as L.Polyline[];
    expect(lines).toHaveLength(model.routes.length + 3);
    expect(map.hasLayer(group)).toBe(true);
  });

  it("labels the station group permanently and keeps SK-2's conflict visible in it", () => {
    const map = makeMap();
    const model = buildMapModel({ seed: scenarioSeed(), events: scenarioEvents(), now: NOW, incidentId: "INC-01" });
    const markers = markersOf(addMapLayers(L, map, model));

    const station = markers.find((m) => isPermanent(m) && tooltipText(m).startsWith("Maitri"))!;
    expect(tooltipText(station)).toBe("Maitri · 5 assets · SK-2 DOWN (conflict)");
    expect(station.options.color).toBe("#f59e0b");

    const hoverTarget = markers.find((m) => !isPermanent(m) && tooltipText(m).includes("HX-1"))!;
    expect(tooltipText(hoverTarget)).toContain("SK-2 (Skidoo) · status DOWN (conflict, conservative value kept)");
  });

  it("labels the team with its age and outlines single markers in white", () => {
    const map = makeMap();
    const markers = markersOf(addMapLayers(L, map, buildMapModel({ seed: scenarioSeed(), events: scenarioEvents(), now: NOW, incidentId: "INC-01" })));

    const team = markers.find((m) => tooltipText(m).startsWith("FT-3"))!;
    expect(isPermanent(team)).toBe(true);
    expect(tooltipText(team)).toBe("FT-3 · last confirmed 9 h ago");
    expect(team.options.color).toBe("#ffffff");

    const goa = markers.find((m) => tooltipText(m).startsWith("Goa HQ"))!;
    expect(isPermanent(goa)).toBe(false);
    expect(goa.options.color).toBe("#ffffff");
  });

  it("tooltips are plain text, so ids from events cannot inject HTML", () => {
    const map = makeMap();
    const model = buildMapModel({
      seed: scenarioSeed(),
      events: [ev("CHECKIN_RECORDED", "FT3-TAB-01", { person_or_team_id: '<img src=x onerror="alert(1)">', lat: -70.6, lon: 12 }, "2027-01-25T07:00:00.000Z")],
      now: NOW,
    });
    const group = addMapLayers(L, map, model);
    const team = group.getLayers().find((l) => tooltipText(l).includes("<img")) as L.CircleMarker;
    const content = team.getTooltip()!.getContent() as HTMLElement;
    expect(content.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(content.querySelector("img")).toBeNull();
  });

  it("uses NASA Blue Marble by default, capped at its native zoom, with OpenStreetMap as the alternative", () => {
    const blue = createTileLayer(L) as unknown as { _url: string; options: L.TileLayerOptions };
    expect(blue._url).toContain("gibs.earthdata.nasa.gov");
    expect(blue._url).toContain("{z}/{y}/{x}.jpeg");
    expect(blue.options.maxNativeZoom).toBe(8);
    expect((createTileLayer(L, "alt") as unknown as { _url: string })._url).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
  });
});
