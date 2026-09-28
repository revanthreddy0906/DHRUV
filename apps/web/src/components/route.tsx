import { formatDate } from "../format";
import type { RouteView } from "../live/route";
import { cx } from "./primitives";

/**
 * The route as a simple horizontal diagram (section 9.7): Goa → Mumbai → Cape Town → Maitri, each
 * leg with its ETA, and the vessel load cutoff as a plain line at the stop where the vessel leaves.
 * Stops are evenly spaced: this is a route, not a time axis.
 */
export function RouteDiagram({ route }: { route: RouteView }) {
  const n = route.stops.length;
  const at = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 50);
  return (
    <div className="relative mx-16 mt-16 mb-16 h-px bg-line-strong" role="img"
      aria-label={`${route.shipmentId} route: ${route.stops.map((s) => s.label).join(" to ")}${route.cutoff ? `, vessel cutoff ${formatDate(route.cutoff.date)}` : ""}`}>
      {route.legs.map((l, i) => {
        const delayed = l.status === "DELAYED";
        return (
          <div key={l.id} className="absolute bottom-3 -translate-x-1/2 text-center" style={{ left: `${(at(i) + at(i + 1)) / 2}%` }}>
            <span className={cx("whitespace-nowrap text-sm tabular-nums", delayed ? "font-semibold text-bad" : "text-fg-2")}>
              {l.vessel ? "Vessel, " : ""}ETA {formatDate(l.eta)}
            </span>
            {delayed && l.plannedEta !== l.eta && <span className="block text-xs text-fg-2">was {formatDate(l.plannedEta)}</span>}
          </div>
        );
      })}
      {route.legs.map((l, i) => l.status === "DELAYED" && (
        <div key={`seg-${l.id}`} className="absolute -top-px h-0.5 bg-bad" style={{ left: `${at(i)}%`, width: `${at(i + 1) - at(i)}%` }} />
      ))}
      {route.stops.map((s, i) => (
        <div key={`${s.node}-${i}`} className="absolute -top-1.5 -translate-x-1/2" style={{ left: `${at(i)}%` }}>
          <div className="mx-auto size-3 rounded-full border-2 border-fg bg-surface" />
          <span className="absolute top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-sm font-semibold text-fg">{s.label}</span>
        </div>
      ))}
      {route.cutoff && (
        <div className="absolute -top-4 h-8 w-0.5 bg-fg" style={{ left: `calc(${at(route.cutoff.stopIndex)}% + 14px)` }}>
          <span className="absolute top-15 -left-px whitespace-nowrap border-l-2 border-fg pl-1.5 text-xs font-semibold tabular-nums text-fg">Vessel cutoff {formatDate(route.cutoff.date)}</span>
        </div>
      )}
    </div>
  );
}
