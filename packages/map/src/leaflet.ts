import type * as Leaflet from "leaflet";
import { config } from "@dhruv/shared";
import type { MapFeature, MapModel } from "./model.js";

/** The Leaflet functions used here; accepts both `import L from "leaflet"` and `import * as L`. */
export type LeafletLib = Pick<typeof Leaflet, "tileLayer" | "layerGroup" | "polyline" | "circle" | "circleMarker">;

export interface LeafletLayerOptions {
  /** Vehicles older than FRESH also get a circle; off by default so a parked helicopter does not clutter. */
  showAssetCircles?: boolean;
}

const COLORS = { OK: "#2e7d32", DEGRADED: "#b26a00", DOWN: "#c62828", node: "#1f2d3a", team: "#1565c0", amber: "#b26a00", route: "#5b6b7a" };

function popupText(f: MapFeature): string {
  const parts = [f.label];
  if (f.status) parts.push(`status ${f.status}${f.conflict ? " (conflict, conservative value kept)" : ""}`);
  if (f.ageLabel) parts.push(`last confirmed ${f.ageLabel}`);
  if (f.uncertaintyKm !== null) parts.push(`uncertainty ${Math.round(f.uncertaintyKm)} km`);
  return parts.join(" · ");
}

/** Tile layer with the configured free source; the PWA caches tiles, the schematic covers the rest. */
export function createTileLayer(L: LeafletLib): Leaflet.TileLayer {
  return L.tileLayer(config.map.tileUrl, { attribution: config.map.tileAttribution, maxZoom: 12 });
}

/**
 * Draws the map model onto a Leaflet map: route legs (dashed when delayed), nodes, assets
 * coloured by status with a ring for conflicts, teams, the growing uncertainty circles, and
 * lines to the nearest capable responders. Text is set as plain text, never as HTML.
 * Returns the layer group so the caller can remove it before redrawing.
 */
export function addMapLayers(L: LeafletLib, map: Leaflet.Map, model: MapModel, options: LeafletLayerOptions = {}): Leaflet.LayerGroup {
  const group = L.layerGroup();
  const tooltip = (layer: Leaflet.Layer, text: string) => {
    const el = document.createElement("span");
    el.textContent = text;
    (layer as Leaflet.Path).bindTooltip(el);
  };

  for (const r of model.routes) {
    const line = L.polyline(
      [
        [r.from.lat, r.from.lon],
        [r.to.lat, r.to.lon],
      ],
      { color: r.status === "DELAYED" ? COLORS.amber : COLORS.route, weight: 2, dashArray: r.status === "DELAYED" ? "6 4" : undefined },
    );
    tooltip(line, `${r.leg_id} ${r.status}, ETA ${r.eta.slice(0, 10)}`);
    group.addLayer(line);
  }

  for (const f of model.features) {
    const drawCircle = f.uncertaintyKm !== null && (f.kind === "team" || (options.showAssetCircles ?? false));
    if (drawCircle) {
      group.addLayer(L.circle([f.lat, f.lon], { radius: f.uncertaintyKm! * 1000, color: COLORS.amber, weight: 1, dashArray: "5 4", fillOpacity: 0.12 }));
    }

    const color = f.kind === "node" ? COLORS.node : f.kind === "team" ? COLORS.team : (COLORS[f.status as keyof typeof COLORS] ?? COLORS.route);
    const marker = L.circleMarker([f.lat, f.lon], { radius: f.kind === "node" ? 7 : 6, color: f.conflict ? COLORS.amber : color, weight: f.conflict ? 3 : 1, fillColor: color, fillOpacity: 0.9 });
    tooltip(marker, popupText(f));
    group.addLayer(marker);
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
      tooltip(reach, `${c.asset_id}: ${c.distanceKm.toFixed(1)} km, about ${Math.round(c.etaMinutes)} min`);
      group.addLayer(reach);
    }
  }

  group.addTo(map);
  return group;
}
