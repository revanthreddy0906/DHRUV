import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { addMapLayers, buildMapModel, createTileLayer, renderSchematicSvg, type MapModel } from "../src/index.js";
import { ev, scenarioEvents, scenarioSeed } from "../src/test/fixture.js";

// Dev-only preview of packages/map on the section 10 scenario. Not part of the app.

const TIMES: [string, string][] = [
  ["07:30 (fresh)", "2027-01-25T07:30:00.000Z"],
  ["12:00", "2027-01-25T12:00:00.000Z"],
  ["16:00 (incident)", "2027-01-25T16:00:00.000Z"],
  ["26 Jan 04:00", "2027-01-26T04:00:00.000Z"],
];

const state = { now: TIMES[2][1], view: "incident" as "incident" | "all", resolved: false };

const map = L.map("map", { worldCopyJump: true });
const osm = createTileLayer(L);
// NASA GIBS Blue Marble in web mercator: free, shows Antarctic ice and terrain where OSM is mostly blank.
const blueMarble = L.tileLayer(
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-08-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg",
  { maxNativeZoom: 8, maxZoom: 12, attribution: "NASA GIBS Blue Marble" },
);
osm.addTo(map);
L.control.layers({ "OpenStreetMap": osm, "NASA Blue Marble": blueMarble }).addTo(map);
L.control.scale({ imperial: false }).addTo(map);

let layers: L.LayerGroup | null = null;

function model(): MapModel {
  const events = scenarioEvents();
  if (state.resolved) {
    events.push(ev("CONFLICT_RESOLVED", "HQ-WEB-01", { conflict_id: "CF-1", chosen_value: "OK", resolver: "HQ-WEB-01" }, "2027-01-25T07:10:00.000Z"));
  }
  // Only include events that have happened by the chosen demo time.
  return buildMapModel({ seed: scenarioSeed(), events: events.filter((e) => e.observed_at <= state.now), now: state.now, incidentId: "INC-01" });
}

function fit(m: MapModel) {
  if (state.view === "incident" && m.incident?.position) {
    const radiusKm = Math.max(m.incident.uncertaintyKm ?? 0, 25);
    map.fitBounds(L.latLng(m.incident.position.lat, m.incident.position.lon).toBounds(radiusKm * 2600));
  } else {
    map.fitBounds(L.latLngBounds(m.features.map((f) => [f.lat, f.lon] as [number, number])), { padding: [30, 30] });
  }
}

function render(refit: boolean) {
  const m = model();
  // Leaflet needs a centre and zoom before vector layers are added.
  if (refit) fit(m);
  layers?.remove();
  layers = addMapLayers(L, map, m);

  // Safe to inline: renderSchematicSvg escapes every string from events (see the escaping test in map.test.ts).
  document.getElementById("schematic")!.innerHTML = renderSchematicSvg(m, { view: state.view === "incident" && m.incident?.position ? "incident" : "all" });

  const facts = document.getElementById("facts")!;
  facts.replaceChildren();
  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    facts.appendChild(li);
  };
  if (!m.incident) {
    add("INC-01 not opened yet at this time (opened 25 Jan 16:00).");
  } else {
    add(`${m.incident.incident_id}: ${m.incident.ageLabel}; circle ${m.incident.uncertaintyKm === null ? "none (FRESH)" : `${Math.round(m.incident.uncertaintyKm)} km`}`);
    for (const c of m.incident.nearest.capable) add(`${c.asset_id}: ${c.distanceKm.toFixed(1)} km, about ${Math.round(c.etaMinutes)} min`);
    for (const x of m.incident.nearest.excluded) add(`${x.asset_id} excluded: ${x.reason}`);
  }

  for (const b of document.querySelectorAll<HTMLButtonElement>("#times button")) b.setAttribute("aria-pressed", String(b.dataset.value === state.now));
  for (const b of document.querySelectorAll<HTMLButtonElement>("#views button")) b.setAttribute("aria-pressed", String(b.dataset.value === state.view));
  document.getElementById("resolve")!.setAttribute("aria-pressed", String(state.resolved));
}

function button(parent: string, label: string, value: string, onClick: () => void) {
  const b = document.createElement("button");
  b.textContent = label;
  b.dataset.value = value;
  b.addEventListener("click", onClick);
  document.getElementById(parent)!.appendChild(b);
}

for (const [label, iso] of TIMES) button("times", label, iso, () => ((state.now = iso), render(false)));
button("views", "Incident", "incident", () => ((state.view = "incident"), render(true)));
button("views", "Route Goa → Maitri", "all", () => ((state.view = "all"), render(true)));
document.getElementById("resolve")!.addEventListener("click", () => ((state.resolved = !state.resolved), render(false)));

render(true);
