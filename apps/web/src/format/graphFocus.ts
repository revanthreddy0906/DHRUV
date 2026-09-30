import { impactOf, type GraphEdge, type GraphNode, type GraphNodeType, type KnowledgeGraph } from "@dhruv/engine";

/**
 * Connections focus mode (docs/ui-redesign/SPEC-connections-and-field.md A.2): which records of the
 * engine's knowledge graph are on screen for one focused record, and how the rest collapse. This is
 * graph navigation over knowledgeGraph()'s own nodes and edges. It never decides a state: every
 * state here is the node's own, from the engine.
 */

type Light = "GREEN" | "AMBER" | "RED";
const SEVERITY: Record<Light, number> = { GREEN: 0, AMBER: 1, RED: 2 };
const severity = (s?: Light) => (s ? SEVERITY[s] : 0);
export const isAbnormal = (s?: Light) => s === "AMBER" || s === "RED";

/** Five columns, supply chain left to right (the vessel shares the legs column). */
export const GRAPH_COLUMNS = ["Vessel and legs", "Shipments and incidents", "Items, people and assets", "Dimensions and missions", "Station"] as const;
export const TYPE_COLUMN: Record<GraphNodeType, number> = {
  vessel: 0, leg: 0, lever: 0, decision: 0,
  shipment: 1, incident: 1,
  item: 2, role: 2, assets: 2,
  dimension: 3, mission: 3,
  station: 4,
};
const REMEDY_TYPES = new Set<GraphNodeType>(["lever", "decision"]);

/** Why a record is on screen. "other" is a record shown only because its column was expanded. */
export type FocusRole = "focus" | "upstream" | "downstream" | "context" | "remedy" | "other";

export interface FocusEdge {
  edge: GraphEdge;
  /** Solid for impact links on the focused path; dashed for remedies and context. */
  style: "impact" | "dashed";
  /** Set when both ends are AMBER or RED: the milder of the two, the trouble this link carries. */
  trouble?: Light;
}

export interface Collapsed {
  column: number;
  /** "+ 17 more", "11 roles, all covered", "16 assets OK", "+ 4 more, 1 RED". */
  labels: string[];
  count: number;
}

export interface FocusView {
  focus: string;
  /** Visible records and why each is shown. */
  roles: Map<string, FocusRole>;
  /** Nearest first. */
  upstream: string[];
  /** Nearest first (impactOf's set). */
  downstream: string[];
  remedies: string[];
  context: string[];
  /** Column of each visible record; remedies sit beside the first record they act on. */
  column: Map<string, number>;
  edges: FocusEdge[];
  /** One entry per column that has hidden records. */
  collapsed: Collapsed[];
  /** True when no record on the focused path (focus, upstream, downstream) is AMBER or RED. */
  pathClear: boolean;
}

function index(graph: KnowledgeGraph) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const order = new Map(graph.nodes.map((n, i) => [n.id, i] as const));
  return { byId, order };
}

/** Breadth-first over one direction of the impact edges; returns ids nearest first, without `id`. */
function walk(graph: KnowledgeGraph, id: string, direction: "up" | "down"): string[] {
  const next = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!e.impact) continue;
    const [a, b] = direction === "up" ? [e.to, e.from] : [e.from, e.to];
    next.set(a, [...(next.get(a) ?? []), b]);
  }
  const seen = new Set([id]);
  const out: string[] = [];
  const queue = [id];
  while (queue.length) {
    for (const n of next.get(queue.shift()!) ?? []) {
      if (!seen.has(n)) { seen.add(n); out.push(n); queue.push(n); }
    }
  }
  return out;
}

/** What `id` depends on: a reverse walk over the impact edges, nearest first. */
export function upstreamOf(graph: KnowledgeGraph, id: string): string[] {
  return walk(graph, id, "up");
}

/** What a problem at `id` would reach: impactOf()'s set, nearest first. */
export function downstreamOf(graph: KnowledgeGraph, id: string): string[] {
  const reach = new Set(impactOf(graph, id));
  return walk(graph, id, "down").filter((n) => reach.has(n));
}

/**
 * The record to open on (A.2 "Default focus"): when the station is not GREEN, the record furthest
 * upstream that has the station's state (after the slip, the feeder leg L2-C104); when it is GREEN,
 * its Fuel dimension. Ties go left to right, then in the engine's node order.
 */
export function defaultFocus(graph: KnowledgeGraph): string {
  const { byId, order } = index(graph);
  const station = byId.get(graph.nodeId);
  const fuel = `${graph.nodeId}.FUEL`;
  if (!station?.state || station.state === "GREEN") return byId.has(fuel) ? fuel : graph.nodeId;
  const worst = station.state;
  const candidates = [graph.nodeId, ...upstreamOf(graph, graph.nodeId)].filter((id) => byId.get(id)?.state === worst);
  const roots = candidates.filter((id) => !upstreamOf(graph, id).some((u) => byId.get(u)?.state === worst));
  const pick = (roots.length ? roots : candidates).sort((a, b) => TYPE_COLUMN[byId.get(a)!.type] - TYPE_COLUMN[byId.get(b)!.type] || order.get(a)! - order.get(b)!);
  return pick[0] ?? graph.nodeId;
}

/** A leg or shipment's whole route: the shipment, all its legs and the vessel that sails them. */
function routeOf(graph: KnowledgeGraph, node: GraphNode): string[] {
  const { byId } = index(graph);
  const shipment = node.type === "shipment" ? node.id : graph.edges.find((e) => e.from === node.id && byId.get(e.to)?.type === "shipment")?.to;
  if (!shipment) return [];
  const legs = graph.edges.filter((e) => e.to === shipment && byId.get(e.from)?.type === "leg").map((e) => e.from);
  const vessels = graph.edges.filter((e) => legs.includes(e.to) && byId.get(e.from)?.type === "vessel").map((e) => e.from);
  return [shipment, ...legs, ...vessels];
}

function collapsedLabels(hidden: GraphNode[]): string[] {
  const abnormal = (ns: GraphNode[]) => {
    const red = ns.filter((n) => n.state === "RED").length;
    const amber = ns.filter((n) => n.state === "AMBER").length;
    return [red && `${red} RED`, amber && `${amber} AMBER`].filter(Boolean).join(", ");
  };
  const roles = hidden.filter((n) => n.type === "role");
  const assets = hidden.filter((n) => n.type === "assets");
  const rest = hidden.filter((n) => n.type !== "role" && n.type !== "assets");
  const out: string[] = [];
  if (rest.length) out.push(`+ ${rest.length} more${abnormal(rest) ? `, ${abnormal(rest)}` : ""}`);
  if (roles.length) out.push(abnormal(roles) ? `${roles.length} roles, ${abnormal(roles)}` : `${roles.length} ${roles.length === 1 ? "role" : "roles"}, all covered`);
  if (assets.length) {
    // An asset group's detail has one line per asset (knowledgeGraph), so this counts assets, not types.
    const units = assets.reduce((n, a) => n + a.detail.length, 0);
    out.push(abnormal(assets) ? `${assets.length} asset types, ${abnormal(assets)}` : `${units} assets OK`);
  }
  return out;
}

/**
 * What is on screen for `focus`: the record, what it depends on, what it reaches, the remedies
 * touching that path and (for a leg or shipment) the rest of its route. Everything else collapses
 * into a count per column unless the column is expanded or `showAll` is set.
 */
export function focusView(graph: KnowledgeGraph, focus: string, opts: { showAll?: boolean; expanded?: ReadonlySet<number> } = {}): FocusView {
  const { byId, order } = index(graph);
  const node = byId.get(focus);
  const roles = new Map<string, FocusRole>();
  if (!node) return { focus, roles, upstream: [], downstream: [], remedies: [], context: [], column: new Map(), edges: [], collapsed: [], pathClear: true };

  const upstream = upstreamOf(graph, focus);
  const downstream = downstreamOf(graph, focus);
  const path = new Set([focus, ...upstream, ...downstream]);

  // Context: where the focus points without carrying trouble (a lever's targets, an incident's
  // people, a leg's shipment), and for a leg or shipment its whole route.
  const context: string[] = [];
  const addContext = (id: string) => { if (!path.has(id) && !context.includes(id) && byId.has(id)) context.push(id); };
  for (const e of graph.edges) if (e.from === focus && !e.impact) addContext(e.to);
  if (node.type === "leg" || node.type === "shipment") routeOf(graph, node).forEach(addContext);

  // Remedies: levers and decisions acting on anything shown, and decisions offering those levers.
  const shown = new Set([...path, ...context]);
  const remedies: string[] = [];
  const addRemedy = (id: string) => { if (!shown.has(id) && !remedies.includes(id)) remedies.push(id); };
  for (const e of graph.edges) if (!e.impact && shown.has(e.to) && REMEDY_TYPES.has(byId.get(e.from)!.type)) addRemedy(e.from);
  for (const e of graph.edges) if (!e.impact && remedies.includes(e.to) && byId.get(e.from)!.type === "decision") addRemedy(e.from);
  remedies.sort((a, b) => order.get(a)! - order.get(b)!);

  roles.set(focus, "focus");
  upstream.forEach((id) => roles.set(id, "upstream"));
  downstream.forEach((id) => roles.set(id, "downstream"));
  context.forEach((id) => roles.set(id, "context"));
  remedies.forEach((id) => roles.set(id, "remedy"));

  const column = new Map<string, number>();
  for (const id of roles.keys()) column.set(id, TYPE_COLUMN[byId.get(id)!.type]);
  // A remedy sits beside the first path record it acts on (else the first context record), so its
  // dashed line stays short.
  for (const id of remedies) {
    const acts = graph.edges.filter((e) => e.from === id && !e.impact && column.has(e.to));
    const onPath = acts.filter((e) => path.has(e.to));
    const targets = (onPath.length ? onPath : acts.filter((e) => roles.get(e.to) === "context")).map((e) => column.get(e.to)!);
    if (targets.length) column.set(id, Math.min(...targets));
  }
  for (const id of remedies) {
    if (byId.get(id)!.type !== "decision") continue;
    const levers = graph.edges.filter((e) => e.from === id && column.has(e.to)).map((e) => column.get(e.to)!);
    if (levers.length) column.set(id, Math.min(...levers));
  }

  const hidden = graph.nodes.filter((n) => !roles.has(n.id));
  const collapsed: Collapsed[] = [];
  GRAPH_COLUMNS.forEach((_, c) => {
    const inColumn = hidden.filter((n) => TYPE_COLUMN[n.type] === c);
    if (!inColumn.length) return;
    if (opts.showAll || opts.expanded?.has(c)) {
      for (const n of inColumn) { roles.set(n.id, "other"); column.set(n.id, c); }
    } else {
      collapsed.push({ column: c, labels: collapsedLabels(inColumn), count: inColumn.length });
    }
  });

  const onPath = (e: GraphEdge) =>
    e.impact && (((e.from === focus || upstream.includes(e.from)) && (e.to === focus || upstream.includes(e.to))) || ((e.from === focus || downstream.includes(e.from)) && downstream.includes(e.to)));
  const edges: FocusEdge[] = [];
  for (const e of graph.edges) {
    if (!roles.has(e.from) || !roles.has(e.to)) continue;
    const solid = opts.showAll ? e.impact : onPath(e);
    const a = byId.get(e.from)!.state, b = byId.get(e.to)!.state;
    const trouble = solid && isAbnormal(a) && isAbnormal(b) ? (severity(a) <= severity(b) ? a : b) : undefined;
    edges.push({ edge: e, style: solid ? "impact" : "dashed", trouble });
  }

  const pathClear = [...path].every((id) => !isAbnormal(byId.get(id)?.state));
  return { focus, roles, upstream, downstream, remedies, context, column, edges, collapsed, pathClear };
}

/** The link that puts `id` on the focused path, for its one-line "why" in the side panel. */
export function linkToPath(view: FocusView, graph: KnowledgeGraph, id: string): GraphEdge | undefined {
  const role = view.roles.get(id);
  const inPath = (x: string) => x === view.focus || view.roles.get(x) === role;
  if (role === "upstream") return graph.edges.find((e) => e.impact && e.from === id && inPath(e.to));
  if (role === "downstream") return graph.edges.find((e) => e.impact && e.to === id && (e.from === view.focus || view.roles.get(e.from) === "downstream"));
  return graph.edges.find((e) => (e.from === id && view.roles.has(e.to)) || (e.to === id && view.roles.has(e.from)));
}
