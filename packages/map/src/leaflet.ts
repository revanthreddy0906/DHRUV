import type * as Leaflet from "leaflet";
import { config } from "@dhruv/shared";
import type { MapFeature, MapModel } from "./model.js";

/** The Leaflet functions used here; accepts both `import L from "leaflet"` and `import * as L`. */
export type LeafletLib = Pick<typeof Leaflet, "tileLayer" | "layerGroup" | "polyline" | "circle" | "circleMarker">;

export interface LeafletLayerOptions {
  /** Vehicles older than FRESH also get a circle; off by default so a parked helicopter does not clutter. */
  showAssetCircles?: boolean;
}

const COLORS = { OK: "#2e7d32", DEGRADED: "#b26a00", DOWN: "#c62828", node: "#1f2d3a", team: "#1565c0", amber: "#f59e0b", route: "#9fb3c8", outline: "#ffffff" };
const SEVERITY: Record<string, number> = { OK: 0, DEGRADED: 1, DOWN: 2 };

function popupText(f: MapFeature): string {
  const parts = [f.label];
  if (f.status) parts.push(`status ${f.status}${f.conflict ? " (conflict, conservative value kept)" : ""}`);
  if (f.ageLabel) parts.push(`last confirmed ${f.ageLabel}`);
  if (f.uncertaintyKm !== null) parts.push(`uncertainty ${Math.round(f.uncertaintyKm)} km`);
  return parts.join(" · ");
}

/**
 * Features at the same coordinates (a station's node and its parked vehicles) as one group each,
 * in first-seen order. Leaflet draws a group as one marker; the schematic clusters on screen
 * distance, which always includes these.
 */
export function colocated(features: MapFeature[]): MapFeature[][] {
  const groups = new Map<string, MapFeature[]>();
  for (const f of features) {
    const key = `${f.lat.toFixed(4)},${f.lon.toFixed(4)}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  return [...groups.values()];
}

/** Plain-text element for tooltips: ids and notes come from events and must never become HTML. */
function textElement(lines: string[]): HTMLElement {
  const el = document.createElement("span");
  lines.forEach((line, i) => {
    if (i > 0) el.appendChild(document.createElement("br"));
    el.appendChild(document.createTextNode(line));
  });
  return el;
}

/** Tile layer with the configured free source (NASA Blue Marble); the PWA caches tiles, the schematic covers the rest. */
export function createTileLayer(L: LeafletLib, source: "default" | "alt" = "default"): Leaflet.TileLayer {
  const m = config.map;
  return source === "alt"
    ? L.tileLayer(m.altTileUrl, { attribution: m.altTileAttribution, maxZoom: m.tileMaxZoom })
    : L.tileLayer(m.tileUrl, { attribution: m.tileAttribution, maxNativeZoom: m.tileMaxNativeZoom, maxZoom: m.tileMaxZoom });
}

/** Short permanent label for a group: "Maitri · 12 assets · SK-2 DOWN (conflict)". */
function groupLabel(members: MapFeature[]): string {
  const node = members.find((f) => f.kind === "node");
  const assets = members.filter((f) => f.kind === "asset");
  const flagged = assets.filter((a) => a.conflict || (a.status && a.status !== "OK"));
  const parts = [node?.label ?? members[0]!.label];
  if (assets.length) parts.push(`${assets.length} asset${assets.length === 1 ? "" : "s"}`);
  for (const a of flagged) parts.push(`${a.id} ${a.status ?? ""}${a.conflict ? " (conflict)" : ""}`.trim());
  return parts.join(" · ");
}

/**
 * Draws the map model onto a Leaflet map: route legs (dashed when delayed), co-located features
 * as one marker (a station and its vehicles), teams, the growing uncertainty circles, and lines to
 * the nearest capable responders. Markers have a white outline so they read on dark imagery;
 * a conflicted asset keeps an amber ring. Stations, groups and teams carry permanent labels
 * ("FT-3 · last confirmed 9 h ago"); everything else shows on hover. All text is plain text.
 * Returns the layer group so the caller can remove it before redrawing.
 */
export function addMapLayers(L: LeafletLib, map: Leaflet.Map, model: MapModel, options: LeafletLayerOptions = {}): Leaflet.LayerGroup {
  const group = L.layerGroup();
  const hover = (layer: Leaflet.Layer, lines: string[]) => (layer as Leaflet.Path).bindTooltip(textElement(lines));
  const label = (layer: Leaflet.Layer, lines: string[]) =>
    (layer as Leaflet.Path).bindTooltip(textElement(lines), { permanent: true, direction: "right", offset: [8, 0], className: "dhruv-map-label" });

  for (const r of model.routes) {
    const line = L.polyline(
      [
        [r.from.lat, r.from.lon],
        [r.to.lat, r.to.lon],
      ],
      { color: r.status === "DELAYED" ? COLORS.amber : COLORS.route, weight: 2, dashArray: r.status === "DELAYED" ? "6 4" : undefined },
    );
    hover(line, [`${r.leg_id} ${r.status}, ETA ${r.eta.slice(0, 10)}`]);
    group.addLayer(line);
  }

  for (const f of model.features) {
    const drawCircle = f.uncertaintyKm !== null && (f.kind === "team" || (options.showAssetCircles ?? false));
    if (drawCircle) {
      group.addLayer(L.circle([f.lat, f.lon], { radius: f.uncertaintyKm! * 1000, color: COLORS.amber, weight: 1, dashArray: "5 4", fillOpacity: 0.12 }));
    }
  }

  for (const members of colocated(model.features)) {
    const first = members[0]!;
    const conflict = members.some((f) => f.conflict);
    const outline = { color: conflict ? COLORS.amber : COLORS.outline, weight: conflict ? 3 : 1.5 };

    if (members.length === 1) {
      const color = first.kind === "node" ? COLORS.node : first.kind === "team" ? COLORS.team : (COLORS[first.status as keyof typeof COLORS] ?? COLORS.route);
      const marker = L.circleMarker([first.lat, first.lon], { radius: first.kind === "node" ? 7 : 6, ...outline, fillColor: color, fillOpacity: 0.95 });
      if (first.kind === "team") label(marker, [`${first.label} · last confirmed ${first.ageLabel ?? "?"}`]);
      else hover(marker, [popupText(first)]);
      group.addLayer(marker);
      continue;
    }

    // A station (or any spot) with several features: one marker coloured by the worst asset status.
    const worst = members.filter((f) => f.status).sort((a, b) => (SEVERITY[b.status!] ?? 0) - (SEVERITY[a.status!] ?? 0))[0];
    const fill = worst && worst.status !== "OK" ? COLORS[worst.status as keyof typeof COLORS] : COLORS.node;
    const marker = L.circleMarker([first.lat, first.lon], { radius: 9, ...outline, fillColor: fill, fillOpacity: 0.95 });
    label(marker, [groupLabel(members)]);
    group.addLayer(marker);
    // Hover detail for every member, on a transparent target over the cluster.
    const detail = L.circleMarker([first.lat, first.lon], { radius: 12, opacity: 0, fillOpacity: 0 });
    hover(detail, members.map(popupText));
    group.addLayer(detail);
  }

  const focus = model.incident;
  if (focus?.position) {
    for (const c of focus.nearest.capable.slice(0, 3)) {
      const asset = model.features.find((f) => f.id === c.asset_id);
      if (!asset) continue;
      const reach = L.polyline(
        [
          [focus.position.lat, focus.position.lon],
          [asset.lat, asset.lon],
        ],
        { color: COLORS.route, weight: 1, dashArray: "2 3" },
      );
      hover(reach, [`${c.asset_id}: ${c.distanceKm.toFixed(1)} km, about ${Math.round(c.etaMinutes)} min`]);
      group.addLayer(reach);
    }
  }

  group.addTo(map);
  return group;
}
