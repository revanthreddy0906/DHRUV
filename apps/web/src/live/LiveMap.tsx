import * as React from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPinOff, Layers } from "lucide-react";
import { addMapLayers, createTileLayer, renderSchematicSvg, type MapModel } from "@dhruv/map";
import { cx } from "../components/primitives";

/** Tile errors before the map gives up on tiles and shows the schematic (section 16 fallback). */
const TILE_ERRORS_BEFORE_FALLBACK = 3;

/** Bounds to open on: around the incident (circle and top responders), or everything with the route. */
function initialBounds(model: MapModel, view: "incident" | "all"): L.LatLngBounds {
  const focus = model.incident;
  if (view === "incident" && focus?.position) {
    const reachKm = Math.max(focus.uncertaintyKm ?? 0, ...focus.nearest.capable.slice(0, 3).map((c) => c.distanceKm), 10) * 1.2;
    return L.latLng(focus.position.lat, focus.position.lon).toBounds(reachKm * 2000);
  }
  const points = [...model.features.map((f) => L.latLng(f.lat, f.lon)), ...model.routes.flatMap((r) => [L.latLng(r.from.lat, r.from.lon), L.latLng(r.to.lat, r.to.lon)])];
  return L.latLngBounds(points.length ? points : [L.latLng(-70.77, 11.73)]);
}

/**
 * Leaflet map of a MapModel (Blue Marble tiles, clustered stations, permanent labels), falling back
 * to the SVG schematic after repeated tile errors or on request. The fallback depends on real tile
 * failures only, never on the simulated link: Maitri going "offline" must not take its map away.
 */
export function LiveMap({ model, view = "all", height = 360, compact = false, className }: {
  model: MapModel; view?: "incident" | "all"; height?: number; compact?: boolean; className?: string;
}) {
  const el = React.useRef<HTMLDivElement>(null);
  const map = React.useRef<L.Map | null>(null);
  const layers = React.useRef<L.LayerGroup | null>(null);
  const [mode, setMode] = React.useState<"tiles" | "schematic">("tiles");
  const [tilesFailed, setTilesFailed] = React.useState(false);
  const firstModel = React.useRef(model);

  // One map per mount. StrictMode mounts twice in development, so the cleanup must remove it.
  React.useEffect(() => {
    if (mode !== "tiles" || !el.current) return;
    const m = L.map(el.current, { zoomControl: !compact, attributionControl: !compact, worldCopyJump: true });
    let errors = 0;
    const tiles = createTileLayer(L).addTo(m);
    tiles.on("tileerror", () => {
      errors += 1;
      if (errors >= TILE_ERRORS_BEFORE_FALLBACK) {
        setTilesFailed(true);
        setMode("schematic");
      }
    });
    // Fit before adding vector layers, or the map opens at world zoom.
    m.fitBounds(initialBounds(firstModel.current, view), { padding: [20, 20] });
    map.current = m;
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(el.current);
    return () => {
      resize.disconnect();
      layers.current = null;
      map.current = null;
      m.remove();
    };
  }, [mode, view, compact]);

  // On each model change only the vector layers are redrawn, so a presenter's pan and zoom stay.
  React.useEffect(() => {
    const m = map.current;
    if (!m || mode !== "tiles") return;
    layers.current?.remove();
    layers.current = addMapLayers(L, m, model);
  }, [model, mode]);

  const width = compact ? 320 : 720;
  return (
    // `isolate` keeps Leaflet's own z-indexes (400+) inside the map, under drawers and overlays.
    <div className={cx("relative isolate overflow-hidden rounded-lg border border-line bg-bg", className)} style={{ height }}>
      {mode === "tiles" ? (
        <div ref={el} className="dhruv-map h-full w-full" role="region" aria-label="Map" />
      ) : (
        <div className="dhruv-schematic flex h-full w-full flex-col">
          {tilesFailed && (
            <p role="status" className="flex items-center gap-1.5 border-b border-line px-3 py-1.5 text-[11px] text-fg-2">
              <MapPinOff size={12} aria-hidden />Map tiles unavailable. Operational state remains available. Using schematic map.
            </p>
          )}
          {/* The app's only innerHTML: renderSchematicSvg escapes every string that comes from events. */}
          <div className="min-h-0 flex-1 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: renderSchematicSvg(model, { width, height: height - (tilesFailed ? 28 : 0), view }) }} />
        </div>
      )}
      <button type="button" onClick={() => setMode(mode === "tiles" ? "schematic" : "tiles")}
        className="absolute bottom-2 right-2 z-[500] flex items-center gap-1 rounded-md border border-line-strong bg-bg/90 px-2 py-1 text-[11px] text-fg-2 hover:text-fg"
        aria-label={mode === "tiles" ? "Show schematic map" : "Show map tiles"}>
        <Layers size={12} aria-hidden />{mode === "tiles" ? "Schematic" : "Tiles"}
      </button>
    </div>
  );
}
