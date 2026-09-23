// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import L from "leaflet";
import { addMapLayers, createTileLayer } from "./leaflet.js";
import { buildMapModel } from "./model.js";
import { ev, NOW, scenarioEvents, scenarioSeed } from "./test/fixture.js";

function makeMap() {
  const el = document.createElement("div");
  el.style.width = "800px";
  el.style.height = "600px";
  document.body.appendChild(el);
  return L.map(el).setView([-70.7, 11.9], 9);
}

describe("Leaflet layers", () => {
  it("draws routes, features, the team circle and reach lines to the top responders", () => {
    const map = makeMap();
    const model = buildMapModel({ seed: scenarioSeed(), events: scenarioEvents(), now: NOW, incidentId: "INC-01" });
    const group = addMapLayers(L, map, model);

    const layers = group.getLayers();
    const circles = layers.filter((l) => l instanceof L.Circle) as L.Circle[];
    expect(circles).toHaveLength(1);
    expect(circles[0]!.getRadius()).toBe(27_000);

    const markers = layers.filter((l) => l instanceof L.CircleMarker && !(l instanceof L.Circle));
    expect(markers).toHaveLength(model.features.length);

    const lines = layers.filter((l) => l instanceof L.Polyline) as L.Polyline[];
    expect(lines).toHaveLength(model.routes.length + 3);
    expect(map.hasLayer(group)).toBe(true);
  });

  it("tooltips are plain text, so ids from events cannot inject HTML", () => {
    const map = makeMap();
    const model = buildMapModel({
      seed: scenarioSeed(),
      events: [ev("CHECKIN_RECORDED", "FT3-TAB-01", { person_or_team_id: '<img src=x onerror="alert(1)">', lat: -70.6, lon: 12 }, "2027-01-25T07:00:00.000Z")],
      now: NOW,
    });
    const group = addMapLayers(L, map, model);
    const tooltipText = (l: L.Layer) => ((l as L.CircleMarker).getTooltip?.()?.getContent() as HTMLElement | undefined)?.textContent ?? "";
    const team = group.getLayers().find((l) => tooltipText(l).includes("<img")) as L.CircleMarker;
    const content = team.getTooltip()!.getContent() as HTMLElement;
    expect(content.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(content.querySelector("img")).toBeNull();
  });

  it("uses the configured free tile source", () => {
    expect((createTileLayer(L) as unknown as { _url: string })._url).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
  });
});
