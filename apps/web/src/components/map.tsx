import * as React from "react";
import { MapPinOff } from "lucide-react";
import { cx } from "./primitives";

/* Projection for the schematic (equirectangular on seed coordinates). */
const proj = (lat: number, lon: number, w: number, h: number) => ({ x: 40 + ((lon - 5) / 80) * (w - 80), y: 24 + ((25 - lat) / 100) * (h - 48) });

export function NodeMarker({ x, y, label, kind = "node", state, left }: { x: number; y: number; label: string; kind?: "hq" | "port" | "station" | "node"; state?: "RED" | "GREEN"; left?: boolean }) {
  const fill = state === "RED" ? "var(--state-red)" : state === "GREEN" ? "var(--state-green)" : "var(--text-primary)";
  return (
    <g>
      {kind === "station" ? <rect x={x - 6} y={y - 6} width={12} height={12} rx={2} fill="var(--surface)" stroke={fill} strokeWidth={2} />
        : kind === "hq" ? <path d={`M${x} ${y - 7} L${x + 7} ${y} L${x} ${y + 7} L${x - 7} ${y} Z`} fill="var(--surface)" stroke={fill} strokeWidth={2} />
        : <circle cx={x} cy={y} r={5} fill="var(--surface)" stroke={fill} strokeWidth={2} />}
      {state && <text x={left ? x - 10 : x + 10} textAnchor={left ? "end" : "start"} y={y + 16} fontSize={9} fontFamily="JetBrains Mono, ui-monospace, monospace" fontWeight={700} fill={fill}>{state}</text>}
      <text x={left ? x - 10 : x + 10} textAnchor={left ? "end" : "start"} y={y + 4} fontSize={11} fontFamily="Inter, system-ui, sans-serif" fontWeight={600} fill="var(--text-primary)">{label}</text>
    </g>
  );
}

export function VesselMarker({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <g>
      <path d={`M${x - 8} ${y - 14} h16 l-3 6 h-10 Z`} fill="var(--accent)" />
      <text x={x - 8} y={y - 18} fontSize={10} fontFamily="Inter, system-ui, sans-serif" fill="var(--accent)">{label}</text>
    </g>
  );
}

export function RouteLine({ a, b, delayed, label }: { a: { x: number; y: number }; b: { x: number; y: number }; delayed?: boolean; label?: string }) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  return (
    <g>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={delayed ? "var(--state-red)" : "var(--border-strong)"} strokeWidth={delayed ? 2.5 : 2} strokeDasharray={delayed ? "6 4" : undefined} />
      {label && <text x={mx + 8} y={my} fontSize={10} fontFamily="JetBrains Mono, ui-monospace, monospace" fill={delayed ? "var(--state-red)" : "var(--text-secondary)"}>{label}</text>}
    </g>
  );
}

/** Radius = min(age_h × 3 km/h, 30 km). None while FRESH. Scale in px per km. */
export function UncertaintyCircle({ cx: x, cy: y, radiusKm, pxPerKm, label }: { cx: number; cy: number; radiusKm: number; pxPerKm: number; label?: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={radiusKm * pxPerKm} fill="rgba(245,158,11,.10)" stroke="var(--state-amber)" strokeWidth={1.5} strokeDasharray="4 3" />
      <circle cx={x} cy={y} r={4} fill="var(--state-amber)" />
      {label && <text x={x + 8} y={y - 8} fontSize={11} fontFamily="Inter, system-ui, sans-serif" fontWeight={600} fill="var(--text-primary)">{label}</text>}
    </g>
  );
}

export function SchematicMap({ width = 560, height = 420, delayedLeg = true, maitriState, compact }: { width?: number; height?: number; delayedLeg?: boolean; maitriState?: "RED" | "GREEN"; compact?: boolean }) {
  const P = {
    goa: proj(15.4, 73.79, width, height), mumbai: proj(18.95, 72.84, width, height), cape: proj(-33.92, 18.42, width, height),
    maitri: proj(-70.77, 11.73, width, height), bharati: proj(-69.41, 76.19, width, height),
  };
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Schematic route map: Goa HQ, Mumbai, Cape Town, Maitri; Bharati. Leg Mumbai to Cape Town delayed.">
      <rect width={width} height={height} fill="var(--bg)" />
      <text x={width - 12} textAnchor="end" y={14} fontSize={10} fontFamily="JetBrains Mono, ui-monospace, monospace" fill="var(--text-muted)">SCHEMATIC · great-circle distances, approx.</text>
      <RouteLine a={P.goa} b={P.mumbai} />
      <RouteLine a={P.mumbai} b={P.cape} delayed={delayedLeg} label={compact ? undefined : delayedLeg ? "L2 C-104 DELAYED · ≈ 8,230 km" : "≈ 8,230 km"} />
      <RouteLine a={P.cape} b={P.maitri} label={compact ? undefined : "MV Ice Star · ≈ 4,120 km"} />
      <line x1={P.maitri.x} y1={P.maitri.y} x2={P.bharati.x} y2={P.bharati.y} stroke="var(--border)" strokeDasharray="2 4" />
      {!compact && <text x={(P.maitri.x + P.bharati.x) / 2 - 20} y={P.maitri.y + 22} fontSize={10} fontFamily="JetBrains Mono, ui-monospace, monospace" fill="var(--text-muted)">≈ 2,330 km</text>}
      <NodeMarker {...P.goa} label="Goa HQ" kind="hq" left />
      <NodeMarker {...P.mumbai} label="Mumbai" kind="port" />
      <NodeMarker {...P.cape} label="Cape Town" kind="port" />
      <VesselMarker x={P.cape.x} y={P.cape.y} label="MV Ice Star" />
      <NodeMarker {...P.maitri} label="Maitri" kind="station" state={maitriState} />
      <NodeMarker {...P.bharati} label="Bharati" kind="station" state="GREEN" />
    </svg>
  );
}

/** Local Maitri area: FT-3 last-known position with the growing circle. 5 px per km. */
export function LocalAreaMap({ width = 420, height = 360, circleKm = 27, ageText = "9 h ago" }: { width?: number; height?: number; circleKm?: number; ageText?: string }) {
  const k = 5, m = { x: 150, y: 270 }, ft = { x: m.x + 13.6 * k, y: m.y - 16.7 * k };
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`Maitri area. FT-3 last known position ${ageText}, uncertainty circle ${circleKm} km. HX-1 at Maitri, about 21.5 km away.`}>
      <rect width={width} height={height} fill="var(--bg)" />
      {Array.from({ length: 9 }).map((_, i) => <line key={i} x1={i * 50} y1={0} x2={i * 50} y2={height} stroke="var(--border)" strokeWidth={0.5} />)}
      {Array.from({ length: 8 }).map((_, i) => <line key={i} x1={0} y1={i * 50} x2={width} y2={i * 50} stroke="var(--border)" strokeWidth={0.5} />)}
      <UncertaintyCircle cx={ft.x} cy={ft.y} radiusKm={circleKm} pxPerKm={k} label={`FT-3 · last known position · ${ageText}`} />
      <text x={ft.x + 8} y={ft.y + 8} fontSize={10} fontFamily="JetBrains Mono, ui-monospace, monospace" fill="var(--text-secondary)">−70.62, 12.10 · circle {circleKm} km</text>
      <line x1={m.x} y1={m.y} x2={ft.x} y2={ft.y} stroke="var(--accent)" strokeWidth={1.5} />
      <text x={(m.x + ft.x) / 2 + 6} y={(m.y + ft.y) / 2 + 14} fontSize={10} fontFamily="JetBrains Mono, ui-monospace, monospace" fill="var(--accent)">HX-1 ≈ 21.5 km · ≈ 11 min</text>
      <NodeMarker x={m.x} y={m.y} label="Maitri · HX-1, PB-1, SK-2" kind="station" />
      <g transform={`translate(${width - 130}, ${height - 22})`}>
        <line x1={0} y1={0} x2={50} y2={0} stroke="var(--text-secondary)" strokeWidth={2} />
        <text x={56} y={4} fontSize={10} fontFamily="JetBrains Mono, ui-monospace, monospace" fill="var(--text-secondary)">10 km</text>
      </g>
    </svg>
  );
}

export function MapPanel({ tiles = "unavailable", children, className }: { tiles?: "available" | "unavailable"; children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("overflow-hidden rounded-xl border border-line bg-surface", className)}>
      {tiles === "unavailable" && (
        <div role="status" className="flex items-center gap-2 border-b border-line bg-elevated px-3 py-1.5 text-[11px] text-fg-2">
          <MapPinOff size={13} aria-hidden className="text-warn" />Map tiles unavailable. Operational state remains available. Using schematic map.
        </div>
      )}
      {children}
    </div>
  );
}
