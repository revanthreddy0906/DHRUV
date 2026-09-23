import type { LatLon } from "./geo.js";
import type { MapFeature, MapModel } from "./model.js";

const KM_PER_DEG = 111.32;
/** Features closer than this on screen are drawn as one cluster. */
const CLUSTER_PX = 14;
const LINE_PX = 16;
/** Rough glyph width for 12 px system-ui, used only to keep labels on the canvas. */
const CHAR_PX = 6.6;

export interface SchematicOptions {
  width?: number;
  height?: number;
  /** "incident" frames the incident's circle and responders; "all" fits every feature and the route. */
  view?: "incident" | "all";
  /** Vehicles older than FRESH also get a circle; off by default so a parked helicopter does not clutter. */
  showAssetCircles?: boolean;
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const fmt = (n: number) => Number(n.toFixed(1));

/** Local equirectangular projection in km around a centre; fine for a schematic, not for navigation. */
function projector(center: LatLon) {
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  return (p: LatLon) => ({ x: (p.lon - center.lon) * cosLat * KM_PER_DEG, y: -(p.lat - center.lat) * KM_PER_DEG });
}

const STYLE = `
  .bg { fill: var(--dhruv-map-bg, #eef3f7); }
  .route { stroke: var(--dhruv-map-route, #5b6b7a); stroke-width: 2; fill: none; }
  .route.DELAYED { stroke: var(--dhruv-amber, #b26a00); stroke-dasharray: 6 4; }
  .circle { fill: var(--dhruv-amber-fill, rgba(178,106,0,0.12)); stroke: var(--dhruv-amber, #b26a00); stroke-dasharray: 5 4; }
  .node { fill: var(--dhruv-map-node, #1f2d3a); }
  .asset.OK { fill: var(--dhruv-ok, #2e7d32); }
  .asset.DEGRADED { fill: var(--dhruv-amber, #b26a00); }
  .asset.DOWN { fill: var(--dhruv-red, #c62828); }
  .conflict { fill: none; stroke: var(--dhruv-amber, #b26a00); stroke-width: 2; }
  .team { fill: var(--dhruv-team, #1565c0); }
  .reach { stroke: var(--dhruv-map-route, #5b6b7a); stroke-dasharray: 2 3; }
  text { font: 12px system-ui, sans-serif; fill: var(--dhruv-text, #1f2d3a); }
  .muted { fill: var(--dhruv-muted, #5b6b7a); }
  .caption { font-size: 11px; }
`;

/**
 * Section 16/17 schematic fallback: used when map tiles are unavailable (offline, not cached).
 * Shows nodes, the route, last-known positions with their ages and growing circles, and
 * distances with ETAs to the nearest capable assets. Returns a self-contained SVG string.
 */
export function renderSchematicSvg(model: MapModel, options: SchematicOptions = {}): string {
  const width = options.width ?? 720;
  const height = options.height ?? 480;
  const view = options.view ?? (model.incident?.position ? "incident" : "all");
  const pad = 40;

  const focus = view === "incident" ? model.incident : null;
  const allPoints: LatLon[] = [...model.features, ...model.routes.flatMap((r) => [r.from, r.to])];
  const center: LatLon = focus?.position ?? {
    lat: allPoints.reduce((s, p) => s + p.lat, 0) / Math.max(allPoints.length, 1),
    lon: allPoints.reduce((s, p) => s + p.lon, 0) / Math.max(allPoints.length, 1),
  };
  const project = projector(center);

  // Extent in km: around the incident, cover the circle and the top responders; otherwise fit everything.
  let halfX: number;
  let halfY: number;
  if (focus?.position) {
    const reach = Math.max(focus.uncertaintyKm ?? 0, ...focus.nearest.capable.slice(0, 3).map((c) => c.distanceKm), 10) * 1.25;
    halfX = reach;
    halfY = reach;
  } else {
    const pts = allPoints.map(project);
    halfX = Math.max(10, ...pts.map((p) => Math.abs(p.x))) * 1.1;
    halfY = Math.max(10, ...pts.map((p) => Math.abs(p.y))) * 1.1;
  }
  const scale = Math.min((width - 2 * pad) / (2 * halfX), (height - 2 * pad) / (2 * halfY));
  const toPx = (p: LatLon) => {
    const km = project(p);
    return { x: fmt(width / 2 + km.x * scale), y: fmt(height / 2 + km.y * scale) };
  };
  const inView = (p: LatLon) => {
    const km = project(p);
    return Math.abs(km.x) <= halfX && Math.abs(km.y) <= halfY;
  };

  const parts: string[] = [];
  parts.push(`<rect class="bg" width="${width}" height="${height}"/>`);

  for (const r of view === "all" ? model.routes : []) {
    const a = toPx(r.from);
    const b = toPx(r.to);
    parts.push(`<line class="route ${esc(r.status)}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"><title>${esc(`${r.leg_id} ${r.status}, ETA ${r.eta.slice(0, 10)}`)}</title></line>`);
  }

  const circled = (f: MapFeature) => f.uncertaintyKm !== null && (f.kind === "team" || (options.showAssetCircles ?? false));
  for (const f of model.features.filter((f) => circled(f) && inView(f))) {
    const c = toPx(f);
    parts.push(`<circle class="circle" cx="${c.x}" cy="${c.y}" r="${fmt(f.uncertaintyKm! * scale)}"/>`);
  }

  if (focus?.position) {
    // Responders at the same spot (e.g. everything parked at the station) share one line and one label.
    const from = toPx(focus.position);
    const byPlace = new Map<string, { to: { x: number; y: number }; distanceKm: number; etas: string[] }>();
    for (const c of focus.nearest.capable.slice(0, 3)) {
      const asset = model.features.find((f) => f.id === c.asset_id);
      if (!asset) continue;
      const to = toPx(asset);
      const key = `${Math.round(to.x / CLUSTER_PX)}|${Math.round(to.y / CLUSTER_PX)}`;
      const place = byPlace.get(key) ?? { to, distanceKm: c.distanceKm, etas: [] };
      place.etas.push(`${c.asset_id} ~${Math.round(c.etaMinutes)} min`);
      byPlace.set(key, place);
    }
    for (const { to, distanceKm, etas } of byPlace.values()) {
      parts.push(`<line class="reach" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"/>`);
      // Place the label a third of the way from the incident, offset to the left of the line and
      // right-aligned, so it clears both the line and the responder's cluster labels (drawn to the right).
      const label = [`${distanceKm.toFixed(1)} km`, ...etas];
      const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      const d = { x: (to.x - from.x) / len, y: (to.y - from.y) / len };
      const n = d.y > 0 ? { x: -d.y, y: d.x } : { x: d.y, y: -d.x };
      const lx = fmt(from.x + d.x * len * 0.3 + n.x * 12);
      const ly = fmt(from.y + d.y * len * 0.3 + n.y * 12 - ((label.length - 1) * 14) / 2 + 4);
      parts.push(
        `<text x="${lx}" y="${ly}" class="muted" text-anchor="end">${label.map((line, i) => `<tspan x="${lx}" dy="${i === 0 ? 0 : 14}">${esc(line)}</tspan>`).join("")}</text>`,
      );
    }
  }

  // Features that land on the same pixel spot are drawn as one cluster with one label line each.
  const clusters = new Map<string, { at: { x: number; y: number }; members: MapFeature[] }>();
  for (const f of model.features.filter(inView)) {
    const p = toPx(f);
    const key = `${Math.round(p.x / CLUSTER_PX)}|${Math.round(p.y / CLUSTER_PX)}`;
    const cluster = clusters.get(key) ?? { at: p, members: [] };
    cluster.members.push(f);
    clusters.set(key, cluster);
  }

  const kindOrder = { node: 0, team: 1, asset: 2 } as const;
  for (const { at, members } of clusters.values()) {
    members.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.id.localeCompare(b.id));
    const [lead] = members;
    if (!lead) continue;
    if (lead.kind === "node") {
      parts.push(`<rect class="node" x="${at.x - 5}" y="${at.y - 5}" width="10" height="10"/>`);
    } else if (lead.kind === "team") {
      parts.push(`<path class="team" d="M ${at.x} ${at.y - 7} L ${at.x + 6} ${at.y + 5} L ${at.x - 6} ${at.y + 5} Z"/>`);
    } else {
      parts.push(`<circle class="asset ${esc(lead.status ?? "")}" cx="${at.x}" cy="${at.y}" r="5"/>`);
    }

    const labelOf = (f: MapFeature) => (f.ageLabel ? `${f.label} · ${f.ageLabel}` : f.label);
    const lines = members.map(labelOf);
    const longest = Math.max(...lines.map((l) => l.length)) * CHAR_PX + 16;
    const leftSide = at.x + 12 + longest > width;
    const tx = leftSide ? at.x - 12 : at.x + 12;
    const top = at.y + 4 - ((lines.length - 1) * LINE_PX) / 2;
    members.forEach((f, i) => {
      const y = fmt(top + i * LINE_PX);
      const text = esc(labelOf(f));
      if (f.kind === "asset" && (members.length > 1 || f.conflict)) {
        const dx = leftSide ? tx + 6 : tx + 4;
        parts.push(`<circle class="asset ${esc(f.status ?? "")}" cx="${dx}" cy="${y - 4}" r="4"/>`);
        if (f.conflict) parts.push(`<circle class="conflict" cx="${dx}" cy="${y - 4}" r="7"><title>status conflict</title></circle>`);
        parts.push(`<text x="${leftSide ? tx - 4 : tx + 14}" y="${y}"${leftSide ? ' text-anchor="end"' : ""}>${text}${f.conflict ? " · conflict" : ""}</text>`);
      } else {
        parts.push(`<text x="${tx}" y="${y}"${leftSide ? ' text-anchor="end"' : ""}>${text}</text>`);
      }
    });
  }

  const header = focus ? `${focus.incident_id} · ${focus.ageLabel}${focus.uncertaintyKm !== null ? ` · circle ${Math.round(focus.uncertaintyKm)} km` : ""}` : "Map";
  parts.push(`<text x="12" y="20">${esc(header)}</text>`);
  let y = height - 12;
  parts.push(`<text x="12" y="${y}" class="muted caption">Schematic (map tiles unavailable) · Synthetic demonstration data. Not operational NCPOR data.</text>`);
  for (const ex of focus?.nearest.excluded ?? []) {
    y -= 16;
    parts.push(`<text x="12" y="${y}" class="muted caption">${esc(`${ex.asset_id}: ${ex.reason}`)}</text>`);
  }

  const barKm = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000].find((k) => k * scale >= 60) ?? 5000;
  const barX = width - 12 - barKm * scale;
  parts.push(`<line class="route" x1="${fmt(barX)}" y1="${height - 20}" x2="${width - 12}" y2="${height - 20}"/>`);
  parts.push(`<text x="${fmt(barX)}" y="${height - 26}" class="muted caption">${barKm} km</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(header)}"><style>${STYLE}</style>${parts.join("")}</svg>`;
}
