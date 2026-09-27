import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { impactOf, knowledgeGraph, type GraphEdge, type GraphNode, type GraphNodeType } from "@dhruv/engine";
import { Card, SectionHeader, StateBadge, Tag, cx } from "../components/primitives";
import { useDevice } from "../live/DeviceProvider";
import { useLiveOps } from "../live/ops";
import { StationContext } from "../live/StationContext";
import { Frame } from "./Frame";

/** Column per node type: supply chain left to right, what it feeds on the right. */
const COLUMN: Record<GraphNodeType, number> = {
  vessel: 0, decision: 0,
  leg: 1, lever: 1,
  shipment: 2, incident: 2,
  item: 3, role: 3, assets: 3,
  dimension: 4, mission: 4,
  station: 5,
};
const COLUMN_TITLE = ["Vessel · decisions", "Legs · levers", "Shipments · incidents", "Items · people · assets", "Dimensions · missions", "Station"];
const TYPE_LABEL: Record<GraphNodeType, string> = {
  station: "station", dimension: "dimension", item: "inventory item", shipment: "shipment", leg: "cargo leg", vessel: "vessel",
  role: "people by role", assets: "assets by type", mission: "mission", lever: "lever", decision: "decision", incident: "incident",
};
const W = 196, H = 40, GAP = 10, COL = 236, TOP = 34, PAD = 12;

const stroke = (s?: string) => (s === "RED" ? "stroke-bad" : s === "AMBER" ? "stroke-warn" : s === "GREEN" ? "stroke-ok" : "stroke-line-strong");

interface Placed extends GraphNode { x: number; y: number }

function layout(nodes: GraphNode[]): { placed: Map<string, Placed>; width: number; height: number } {
  const cols: GraphNode[][] = [[], [], [], [], [], []];
  for (const n of nodes) cols[COLUMN[n.type]]!.push(n);
  const placed = new Map<string, Placed>();
  let height = 0;
  cols.forEach((col, c) => {
    // Primary type first in each column, then the secondary band, separated by a gap.
    let y = TOP;
    let prev: GraphNodeType | undefined;
    for (const n of col) {
      if (prev && prev !== n.type) y += 18;
      placed.set(n.id, { ...n, x: PAD + c * COL, y });
      y += H + GAP;
      prev = n.type;
    }
    height = Math.max(height, y);
  });
  return { placed, width: PAD * 2 + 5 * COL + W, height: height + PAD };
}

function edgePath(a: Placed, b: Placed): string {
  if (COLUMN[a.type] === COLUMN[b.type]) {
    // Same column: bow out to the left.
    const x = a.x, y1 = a.y + H / 2, y2 = b.y + H / 2;
    return `M ${x} ${y1} C ${x - 40} ${y1}, ${x - 40} ${y2}, ${x} ${y2}`;
  }
  const forward = a.x < b.x;
  const x1 = forward ? a.x + W : a.x, x2 = forward ? b.x : b.x + W;
  const y1 = a.y + H / 2, y2 = b.y + H / 2;
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

/**
 * Connections (evaluator question 2): what a station's readiness depends on, drawn from the same
 * seed and events the engine uses. Click anything to see why it is linked and what a problem there
 * would reach.
 */
export function LiveGraphScreen() {
  const device = useDevice();
  const [params, setParams] = useSearchParams();
  const [focus, setFocus] = React.useState<string | undefined>(params.get("station") ?? undefined);
  const ops = useLiveOps(focus);
  const node = ops?.maitriStation.nodeId;
  const graph = React.useMemo(() => (ops && node ? knowledgeGraph({ seed: ops.seed, events: ops.events }, ops.evaluation, node) : null), [ops, node]);
  const selectedId = params.get("focus") ?? undefined;
  const select = (id?: string) => setParams((p) => { const next = new URLSearchParams(p); if (id) next.set("focus", id); else next.delete("focus"); return next; }, { replace: true });

  if (!device || !ops || !graph || !node) {
    return <Frame moment="start" nav="graph"><div className="p-8 text-center text-xs text-fg-2">Building the graph.</div></Frame>;
  }

  const { placed, width, height } = layout(graph.nodes);
  const selected = selectedId ? placed.get(selectedId) : undefined;
  const reach = new Set(selected ? impactOf(graph, selected.id) : []);
  const touching = selected ? graph.edges.filter((e) => e.from === selected.id || e.to === selected.id) : [];
  const near = new Set(touching.flatMap((e) => [e.from, e.to]));
  const lit = (id: string) => !selected || id === selected.id || near.has(id) || reach.has(id);
  const edgeLit = (e: GraphEdge) => !selected || e.from === selected.id || e.to === selected.id || ((reach.has(e.to)) && (reach.has(e.from) || e.from === selected.id) && e.impact);

  const counts = { seed: graph.edges.filter((e) => e.source === "seed").length, rule: graph.edges.filter((e) => e.source === "rule").length, event: graph.edges.filter((e) => e.source === "event").length };

  return (
    <Frame moment="start" nav="graph">
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <h1 className="text-title font-semibold text-fg">Connections · {ops.maitriStation.name}</h1>
            <p className="mt-0.5 max-w-[95ch] text-sm text-fg-2">
              Everything the station's readiness depends on, and why. {graph.nodes.length} records, {graph.edges.length} links: {counts.seed} from the season's data, {counts.rule} from the engine's rules, {counts.event} from the event log.
              Click a record to see its links and what a delay or shortage there would reach.
            </p>
          </div>
          <div className="ml-auto"><StationContext role={device.session.identity.role} node={node} onChange={(n) => { setFocus(n); select(undefined); }} /></div>
        </div>

        <div className="grid gap-4 2xl:grid-cols-[1fr_380px]">
          <Card pad="none" className="overflow-x-auto">
            <svg role="img" aria-label={`Knowledge graph for ${ops.maitriStation.name}`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMinYMin meet" style={{ width: "100%", minWidth: 960, maxWidth: width }} className="block">
              {COLUMN_TITLE.map((t, c) => <text key={t} x={PAD + c * COL} y={20} className="fill-fg-2 text-xs font-semibold">{t}</text>)}
              <g fill="none">
                {graph.edges.map((e, i) => {
                  const a = placed.get(e.from), b = placed.get(e.to);
                  if (!a || !b) return null;
                  const on = edgeLit(e);
                  return (
                    <path key={i} d={edgePath(a, b)} strokeWidth={on && selected ? 1.8 : 1}
                      strokeDasharray={e.impact ? undefined : "4 3"}
                      className={cx(e.source === "event" ? "stroke-accent" : on && selected ? "stroke-fg-2" : "stroke-line-strong", "transition-opacity")}
                      opacity={on ? 1 : 0.12} />
                  );
                })}
              </g>
              {[...placed.values()].map((n) => (
                <g key={n.id} role="button" tabIndex={0} aria-label={`${TYPE_LABEL[n.type]} ${n.label}`} aria-pressed={n.id === selected?.id}
                  transform={`translate(${n.x} ${n.y})`} className="cursor-pointer outline-none" opacity={lit(n.id) ? 1 : 0.25}
                  onClick={() => select(n.id === selected?.id ? undefined : n.id)}
                  onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(n.id); } }}>
                  <rect width={W} height={H} rx={6} strokeWidth={n.id === selected?.id ? 2.5 : reach.has(n.id) ? 2 : 1.25}
                    className={cx(n.type === "station" ? "fill-elevated" : "fill-surface", n.id === selected?.id ? "stroke-accent" : stroke(n.state))} />
                  {n.state && <rect x={0} y={0} width={4} height={H} rx={2} className={n.state === "RED" ? "fill-bad" : n.state === "AMBER" ? "fill-warn" : "fill-ok"} />}
                  <text x={10} y={16} className="fill-fg text-xs font-medium">{n.label.length > 29 ? `${n.label.slice(0, 28)}…` : n.label}</text>
                  <text x={10} y={31} className="fill-fg-2 font-mono text-xs">{(n.sub ?? TYPE_LABEL[n.type]).slice(0, 34)}</text>
                </g>
              ))}
            </svg>
          </Card>

          <Card>
            {selected ? (
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-fg-2">{TYPE_LABEL[selected.type]}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-heading font-semibold text-fg">{selected.label}</h2>
                    {selected.state && <StateBadge state={selected.state} size="sm" />}
                  </div>
                  {selected.sub && <div className="font-mono text-xs text-fg-2">{selected.sub}</div>}
                </div>
                <ul className="space-y-1 text-xs text-fg-2">{selected.detail.map((d, i) => <li key={i}>{d}</li>)}</ul>
                <div>
                  <SectionHeader title="Links" />
                  <ul className="space-y-2">
                    {touching.map((e, i) => {
                      const other = placed.get(e.from === selected.id ? e.to : e.from);
                      return (
                        <li key={i} className="rounded-md border border-line px-2.5 py-2 text-xs">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-fg-2">{e.from === selected.id ? "→" : "←"}</span>
                            <button type="button" className="font-medium text-fg underline decoration-line-strong underline-offset-2 hover:decoration-accent" onClick={() => select(other?.id)}>{other?.label}</button>
                            <span className="text-fg-2">{e.kind}</span>
                            {e.rule && <Tag>{e.rule}</Tag>}
                            <Tag tone={e.source === "event" ? "accent" : "neutral"}>{e.source === "seed" ? "season data" : e.source === "rule" ? "engine rule" : "event log"}</Tag>
                          </div>
                          <div className="mt-1 text-fg-2">{e.why}</div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div>
                  <SectionHeader title="A delay or shortage here reaches" />
                  {reach.size ? (
                    <div className="flex flex-wrap gap-1.5">
                      {graph.nodes.filter((n) => reach.has(n.id)).map((n) => (
                        <button key={n.id} type="button" onClick={() => select(n.id)} className={cx("rounded border px-1.5 py-0.5 text-xs", n.state === "RED" ? "border-bad/50 text-bad" : n.state === "AMBER" ? "border-warn/50 text-warn" : "border-line text-fg")}>{n.label}</button>
                      ))}
                    </div>
                  ) : <p className="text-xs text-fg-2">Nothing downstream: this is a remedy or an end point.</p>}
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs text-fg-2">
                <SectionHeader title="How to read it" />
                <p>Left to right is the supply chain: the vessel carries legs, legs make up shipments, shipments bring items, items feed a dimension, dimensions make the station's state.</p>
                <p>Solid lines carry trouble forward: a late feeder leg reaches the shipment, the diesel, Fuel and the station. Dashed lines are remedies (levers, decisions) and context.</p>
                <p><span className="text-accent">Blue lines</span> come from the event log (created shipments, decisions, incidents); the rest from the season's data and the engine's rules.</p>
                <p>The coloured edge on each record is its live state from the engine, on this device's events.</p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {["INV-DSL", "L2-C104", "F-27", `${node}.FUEL`].filter((id) => placed.has(id)).map((id) => (
                    <button key={id} type="button" onClick={() => select(id)} className="rounded border border-line px-2 py-1 text-xs text-fg hover:border-accent">Try {placed.get(id)!.label}</button>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </Frame>
  );
}
