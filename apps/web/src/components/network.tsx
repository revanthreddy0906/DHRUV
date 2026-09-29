import { Link } from "react-router-dom";
import { Radio } from "lucide-react";
import type { NetworkNode, NetworkView } from "../live/network";
import { STATE_META, StateBadge, cx } from "./primitives";

/**
 * Network position (Command, from the v0 mock): HQ, ports, stations and field teams on a quiet
 * grid, with the supply legs between them. Lines are SVG in percent space; markers and labels are
 * HTML so text stays at its real size. Nothing loops or pulses: a delayed leg is dashed in its state
 * colour and a station carries its state word, so the picture reads without motion or colour alone.
 */
export function NetworkSchematic({ view, height = 300 }: { view: NetworkView; height?: number }) {
  const at = new Map(view.nodes.map((n) => [n.id, n]));
  return (
    <div className="dh-grid relative w-full overflow-hidden bg-surface" style={{ height }}
      role="img" aria-label={`Network position: ${view.nodes.map((n) => `${n.label}${n.sub ? ` ${n.sub}` : ""}`).join("; ")}`}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {view.links.map((l) => {
          const a = at.get(l.from), b = at.get(l.to);
          if (!a || !b) return null;
          const colour = l.state ? STATE_META[l.state].stroke : l.kind === "team" ? "var(--text-muted)" : "var(--border-strong)";
          return (
            <line key={`${l.from}>${l.to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={colour} vectorEffect="non-scaling-stroke"
              strokeWidth={l.state ? 2.5 : 1.5} strokeDasharray={l.state || l.kind === "team" ? "6 5" : undefined}>
              <title>{l.title}</title>
            </line>
          );
        })}
      </svg>
      {view.nodes.map((n) => <Marker key={n.id} n={n} />)}
    </div>
  );
}

function Marker({ n }: { n: NetworkNode }) {
  const tone = n.state && n.state !== "GREEN" ? STATE_META[n.state].text : "text-fg";
  const shape = n.kind === "station"
    ? <span className={cx("block size-4 rounded-full border-2 bg-surface", n.state === "RED" ? "border-bad" : n.state === "AMBER" ? "border-warn" : "border-fg")} />
    : n.kind === "hq" ? <span className="block size-3 rotate-45 border-2 border-fg bg-surface" />
    : n.kind === "team" ? <Radio size={16} strokeWidth={1.75} className={tone} aria-hidden />
    : <span className="block size-2.5 rounded-full border-2 border-fg-2 bg-surface" />;
  const label = (
    <span className={cx("absolute top-1/2 -translate-y-1/2 whitespace-nowrap", n.side === "left" ? "right-6 text-right" : "left-6")}>
      <span className={cx("block font-semibold text-fg", n.kind === "station" ? "text-sm" : "text-xs")}>{n.label}</span>
      {n.sub && (n.kind === "station" && n.state
        ? <span className="mt-0.5 flex items-center gap-1.5"><StateBadge state={n.state} size="sm" /><span className="font-mono text-xs tabular-nums text-fg-2">{n.sub.split(" · ")[1] ?? ""}</span></span>
        : <span className={cx("block text-xs", n.state && n.state !== "GREEN" ? cx("font-semibold", tone) : "text-fg-2")}>{n.sub}</span>)}
    </span>
  );
  const box = "absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center";
  const style = { left: `${n.x}%`, top: `${n.y}%` };
  return n.href ? (
    <Link to={n.href} className={cx(box, "rounded-full hover:bg-elevated")} style={style} aria-label={`${n.label}${n.sub ? `, ${n.sub}` : ""}`}>{shape}{label}</Link>
  ) : (
    <span className={box} style={style}>{shape}{label}</span>
  );
}
