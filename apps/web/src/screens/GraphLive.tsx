import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { knowledgeGraph, reduce, type GraphNode, type KnowledgeGraph, type StationEval } from "@dhruv/engine";
import { Card, StateBadge, cx } from "../components/primitives";
import {
  GRAPH_COLUMNS, TYPE_COLUMN, TYPE_LABEL, defaultFocus, focusView, isAbnormal, linkToPath, numberRuns, recordAction, recordDetail, recordLabel, recordReason, sourceNote,
} from "../format";
import { useDevice } from "../live/DeviceProvider";
import { useLiveOps } from "../live/ops";
import { useStationFocus } from "../live/stationFocus";
import { Frame } from "./Frame";
import { CARD_H, CARD_W, COLLAPSED_LINE, columnX, layoutFocus, roundedPath, routePoints } from "./graphLayout";

/** Words in Inter, numbers in mono (section 4). */
function Numbers({ text }: { text: string }) {
  return <>{numberRuns(text).map((r, i) => (r.mono ? <span key={i} className="font-mono tabular-nums">{r.text}</span> : r.text))}</>;
}

function RecordCard({ node, label, station, focused, remedy, style, onSelect }: {
  node: GraphNode; label: string; station?: StationEval; focused: boolean; remedy: boolean; style: React.CSSProperties; onSelect: () => void;
}) {
  const abnormal = isAbnormal(node.state);
  const detail = recordDetail(node, station);
  return (
    <button type="button" onClick={onSelect} aria-pressed={focused}
      aria-label={`${TYPE_LABEL[node.type]} ${label}${abnormal ? `, ${node.state}` : ""}`}
      style={style}
      className={cx(
        "absolute flex flex-col justify-between rounded-lg border px-3 py-2.5 text-left transition-colors duration-150",
        remedy ? "border-dashed border-line-strong" : "border-line",
        node.state === "RED" ? "bg-bad-tint" : node.state === "AMBER" ? "bg-warn-tint" : "bg-surface hover:bg-elevated",
        focused && "outline-2 outline-offset-0 outline-accent",
      )}>
      <span className="line-clamp-2 text-sm font-semibold text-fg">{label}</span>
      <span className="flex items-center justify-between gap-2 text-xs text-fg-2">
        <span className="truncate" title={detail}><Numbers text={detail} /></span>
        {abnormal && <StateBadge state={node.state!} size="sm" className="shrink-0 bg-transparent! p-0!" />}
      </span>
    </button>
  );
}

function RecordList({ title, ids, graph, label, why, onSelect }: {
  title: string; ids: string[]; graph: KnowledgeGraph; label: (n: GraphNode) => string; why: (id: string) => string | undefined; onSelect: (id: string) => void;
}) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
  if (!ids.length) return null;
  return (
    <div>
      <h3 className="mb-2 text-heading font-semibold text-fg">{title} ({ids.length})</h3>
      <ul className="space-y-2">
        {ids.map((id) => {
          const n = byId.get(id)!;
          const line = why(id);
          return (
            <li key={id} className="text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => onSelect(id)} className="text-left font-medium text-fg underline decoration-line-strong underline-offset-2 hover:decoration-accent">{label(n)}</button>
                {isAbnormal(n.state) && <StateBadge state={n.state!} size="sm" />}
              </div>
              {line && <div className="text-xs text-fg-2"><Numbers text={line} /></div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Connections (SPEC A): a focused impact explorer. One record is in focus; the screen shows what it
 * depends on, what a problem there would reach, and the remedies on that path. Everything else
 * collapses into counts. The URL carries the focus (?focus=L2-C104).
 */
export function LiveGraphScreen() {
  const device = useDevice();
  const [params, setParams] = useSearchParams();
  const [stationFocus] = useStationFocus();
  const ops = useLiveOps(stationFocus);
  const node = ops?.maitriStation.nodeId;
  const graph = React.useMemo(() => (ops && node ? knowledgeGraph({ seed: ops.seed, events: ops.events }, ops.evaluation, node) : null), [ops, node]);
  const [showAll, setShowAll] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Set<number>>(new Set());

  const requested = params.get("focus") ?? undefined;
  const focusId = graph ? (requested && graph.nodes.some((n) => n.id === requested) ? requested : defaultFocus(graph)) : undefined;
  React.useEffect(() => setExpanded(new Set()), [focusId]);

  const select = (id: string) => setParams((p) => { const next = new URLSearchParams(p); next.set("focus", id); return next; }, { replace: true });

  if (!device || !ops || !graph || !node || !focusId) {
    return <Frame moment="start" nav="graph"><div className="p-6 text-sm text-fg-2">Building the graph.</div></Frame>;
  }

  const station = ops.evaluation.stations.find((s) => s.nodeId === node);
  const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const view = focusView(graph, focusId, { showAll, expanded });
  const layout = layoutFocus(view, graph.nodes.map((n) => n.id));
  const focus = byId.get(focusId)!;
  const label = (n: GraphNode) => recordLabel(n, ops.seed.nodes);
  const action = recordAction(focus, graph);
  const touching = graph.edges.filter((e) => e.from === focusId || e.to === focusId);
  // An asset group or a role group opens onto its members' own records.
  const [, groupNode, groupKey] = focusId.split(":");
  const members: { id: string; label: string; to: string }[] =
    focus.type === "assets" ? ops.seed.assets.filter((a) => a.node_id === groupNode && a.type === groupKey).map((a) => ({ id: a.id, label: a.id, to: `/assets/${a.id}` }))
    : focus.type === "role" ? [...reduce(ops.seed, ops.events).personnel.values()].filter((p) => p.nodeId === groupNode && p.role === groupKey)
      .map((p) => ({ id: p.personId, label: ops.seed.personnel.find((x) => x.id === p.personId)?.name ?? p.personId, to: `/personnel/${p.personId}` }))
    : [];
  const why = (id: string) => linkToPath(view, graph, id)?.why;
  const remedyLine = (id: string) => recordDetail(byId.get(id)!, station);
  // Drawn in two passes so solid impact lines sit above the dashed ones.
  const edges = [...view.edges].sort((a, b) => (a.style === b.style ? 0 : a.style === "dashed" ? -1 : 1));

  return (
    <Frame moment="start" nav="graph">
      <div className="space-y-4 p-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-title font-semibold text-fg">Connections · {ops.maitriStation.name}</h1>
            <p className="mt-1 text-sm text-fg-2">Solid lines carry trouble forward. Dashed lines are remedies.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-fg-2">
              Find a record
              <select value={focusId} onChange={(e) => select(e.target.value)}
                className="h-9 max-w-70 rounded-md border border-line-ctrl bg-surface px-2 text-sm text-fg">
                {GRAPH_COLUMNS.map((title, c) => (
                  <optgroup key={title} label={title}>
                    {graph.nodes.filter((n) => TYPE_COLUMN[n.type] === c).map((n) => <option key={n.id} value={n.id}>{label(n)}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-fg-2">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="size-4 accent-accent" />
              Show all records
            </label>
          </div>
        </header>

        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg" aria-live="polite">
          <span className="text-fg-2">Focus:</span>
          <span className="font-semibold">{label(focus)}</span>
          {isAbnormal(focus.state) && <StateBadge state={focus.state!} size="sm" />}
          <span><Numbers text={recordReason(focus, graph, station)} /></span>
          {view.pathClear && <span className="text-fg-2">Nothing on this path is below threshold.</span>}
        </p>

        <div className="grid gap-4 min-[1680px]:grid-cols-[minmax(0,1fr)_360px]">
          <Card pad="none" className="overflow-x-auto">
            <div className="relative" style={{ width: layout.width, height: layout.height }}>
              {GRAPH_COLUMNS.map((title, c) => (
                <div key={title} className="absolute top-2.5 text-xs font-semibold text-fg-2" style={{ left: columnX(c), width: CARD_W }}>{title}</div>
              ))}
              <svg aria-hidden width={layout.width} height={layout.height} className="pointer-events-none absolute inset-0" fill="none">
                {edges.map(({ edge, style, trouble }, i) => {
                  const a = layout.boxes.get(edge.from), b = layout.boxes.get(edge.to);
                  if (!a || !b) return null;
                  return (
                    <path key={i} d={roundedPath(routePoints(a, b, layout))}
                      strokeWidth={style === "impact" ? 1.5 : 1.25}
                      strokeDasharray={style === "dashed" ? "4 4" : undefined}
                      className={style === "dashed" ? "stroke-line-strong" : trouble === "RED" ? "stroke-bad" : trouble === "AMBER" ? "stroke-warn" : "stroke-line-strong"} />
                  );
                })}
              </svg>
              {[...layout.boxes.values()].map((box) => (
                <RecordCard key={box.id} node={byId.get(box.id)!} label={label(byId.get(box.id)!)} station={station} focused={box.id === focusId} remedy={view.roles.get(box.id) === "remedy"}
                  style={{ left: box.x, top: box.y, width: CARD_W, height: CARD_H }} onSelect={() => select(box.id)} />
              ))}
              {view.collapsed.map((c) => (
                <button key={c.column} type="button" onClick={() => setExpanded((s) => new Set(s).add(c.column))}
                  aria-label={`Show ${c.count} more records in ${GRAPH_COLUMNS[c.column]}`}
                  className="absolute rounded-sm text-left text-xs text-fg-2 hover:text-fg hover:underline"
                  style={{ left: columnX(c.column), top: layout.collapsedY, width: CARD_W, lineHeight: `${COLLAPSED_LINE}px` }}>
                  {c.labels.map((l) => <span key={l} className="block">{l}</span>)}
                </button>
              ))}
            </div>
          </Card>

          <Card aria-label="Selected record" className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="text-xs text-fg-2">Selected record · {TYPE_LABEL[focus.type]}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-heading font-semibold text-fg">{label(focus)}</h2>
                  {focus.state && <StateBadge state={focus.state} size="sm" />}
                </div>
                <p className="text-sm text-fg"><Numbers text={recordReason(focus, graph, station)} /></p>
                <p className="text-xs text-fg-3">{sourceNote(touching)}</p>
                {members.length > 0 && (
                  <p className="text-sm text-fg-2">Records: {members.map((m, i) => <React.Fragment key={m.id}>{i ? ", " : ""}<Link to={m.to} className={cx("text-accent hover:underline", focus.type === "assets" && "font-mono")}>{m.label}</Link></React.Fragment>)}</p>
                )}
              </div>
              {action && <Link to={action.path} className="inline-flex h-9 items-center rounded-md border border-line-strong bg-elevated px-3.5 text-sm font-semibold text-fg hover:border-accent/60">{action.label}</Link>}
            </div>
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3 min-[1680px]:grid-cols-1">
              <RecordList title="Depends on" ids={view.upstream} graph={graph} label={label} why={why} onSelect={select} />
              <RecordList title="A problem here reaches" ids={view.downstream} graph={graph} label={label} why={why} onSelect={select} />
              <RecordList title="Remedies" ids={view.remedies} graph={graph} label={label} why={remedyLine} onSelect={select} />
            </div>
          </Card>
        </div>
      </div>
    </Frame>
  );
}
