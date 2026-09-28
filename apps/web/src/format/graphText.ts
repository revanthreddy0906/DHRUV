import type { DimensionItem, GraphEdge, GraphNode, GraphNodeType, KnowledgeGraph, StationEval } from "@dhruv/engine";
import { formatHaveNeed } from "./margin";
import { formatQty } from "./number";
import { formatRatio } from "./ratio";
import { DIMENSION_LABEL, dimensionHeadline, dimensionReason, drivingDimension, stationReason } from "./status";
import { formatDate, formatDateTime } from "./time";

/**
 * Wording for Connections cards and the Selected record panel. It rephrases what knowledgeGraph()
 * and evaluate() already say (dates, ratios, quantities per section 6); it never decides a state.
 */

export const TYPE_LABEL: Record<GraphNodeType, string> = {
  station: "Station", dimension: "Dimension", item: "Inventory item", shipment: "Shipment", leg: "Cargo leg", vessel: "Vessel",
  role: "People by role", assets: "Assets by type", mission: "Mission", lever: "Lever", decision: "Decision", incident: "Incident",
};

const ISO = /\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z?)?/g;
const upperFirst = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** Engine dates to "3 Feb" (or "25 Jan 07:00" when a time of day is set). */
export function readableDates(text: string): string {
  return text.replace(ISO, (iso) => {
    const full = iso.length === 10 ? `${iso}T00:00:00.000Z` : iso;
    return /T00:00(:00(\.0+)?)?Z?$/.test(full) ? formatDate(full) : formatDateTime(full);
  });
}

/** A node's own short line ("delayed · ETA 2027-02-07", "2 / need 1") in display form. */
function cleanSub(sub: string): string {
  return upperFirst(readableDates(sub).replace(/(\d+) \/ (?:need )?(\d+)/, (_, a, b) => (/need/.test(sub) ? `${a} of need ${b}` : `${a} of ${b}`)).replace(/\bok\b/, "OK").replace(/cut-off/g, "cutoff"));
}

/**
 * A record's name with place names as the season data spells them ("L2-C104 Mumbai → Cape Town";
 * the engine writes node ids in lower case) and role names in sentence case.
 */
export function recordLabel(node: GraphNode, places: { id: string; name: string }[] = []): string {
  if (node.type === "leg") {
    const byWords = new Map(places.map((p) => [p.id.replace(/_/g, " ").toLowerCase(), p.name] as const));
    const [id, ...rest] = node.label.split(" ");
    return [id, rest.join(" ").split(" → ").map((w) => byWords.get(w) ?? w.replace(/\b\w/g, (c) => c.toUpperCase())).join(" → ")].join(" ");
  }
  if (node.type === "role") return upperFirst(node.label);
  if (node.type === "dimension") return DIMENSION_LABEL[node.id.split(".").at(-1)!] ?? node.label;
  return node.label;
}

function itemEval(station: StationEval | undefined, id: string): DimensionItem | undefined {
  for (const d of station?.dimensions ?? []) for (const i of d.items ?? []) if (i.id === id) return i;
  return undefined;
}
const dimensionOf = (station: StationEval | undefined, node: GraphNode) => station?.dimensions.find((d) => `${station.nodeId}.${d.key}` === node.id);

/** The one detail line on a card: "Ratio 0.697", "Delayed · ETA 7 Feb", "92.0 kL on hand". */
export function recordDetail(node: GraphNode, station?: StationEval): string {
  if (node.type === "station" && station) {
    const d = station.state === "GREEN" ? undefined : drivingDimension(station);
    return d ? `${DIMENSION_LABEL[d.key] ?? d.key} ${dimensionHeadline(d)}` : "Within thresholds";
  }
  if (node.type === "dimension") {
    const d = dimensionOf(station, node);
    if (d?.ratio !== null && d?.ratio !== undefined) return `Ratio ${formatRatio(d.ratio)}`;
    if (d) return d.state === "GREEN" ? "Within thresholds" : `${d.state}`;
  }
  if (node.type === "item") {
    const i = itemEval(station, node.id);
    if (i?.stock !== undefined) return i.inbound ? `${formatQty(i.stock, i.unit)} + ${formatQty(i.inbound, i.unit).replace(` ${i.unit}`, "")} inbound` : `${formatQty(i.stock, i.unit)} on hand`;
  }
  // A leg with a state word beside it keeps only its ETA, unless it is delayed, so the line fits.
  if (node.type === "leg" && node.state && node.state !== "GREEN" && !/^delayed/.test(node.sub ?? "")) {
    const eta = node.sub?.match(/ETA (\S+)/)?.[1];
    if (eta) return `ETA ${formatDate(`${eta}T00:00:00.000Z`)}`;
  }
  return node.sub ? cleanSub(node.sub) : TYPE_LABEL[node.type];
}

/** The shipment a leg belongs to, and the vessel's load cutoff for that route, from the graph. */
function routeFacts(graph: KnowledgeGraph, node: GraphNode) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const shipment = node.type === "shipment" ? node : byId.get(graph.edges.find((e) => e.from === node.id && byId.get(e.to)?.type === "shipment")?.to ?? "");
  const legs = shipment ? graph.edges.filter((e) => e.to === shipment.id && byId.get(e.from)?.type === "leg").map((e) => e.from) : [];
  const vessel = byId.get(graph.edges.find((e) => legs.includes(e.to) && byId.get(e.from)?.type === "vessel")?.from ?? "");
  const cutoff = vessel?.sub?.match(/cut-off (\S+)/)?.[1];
  const feederEdge = shipment ? graph.edges.find((e) => e.to === shipment.id && e.kind === "feeder of") : undefined;
  return { shipment, cutoff: cutoff ? formatDate(`${cutoff}T00:00:00.000Z`) : undefined, feeder: feederEdge?.from };
}

/** The engine's R02 line ("[R02] L2-C104: EXCLUDED - leg ETA … is after vessel load cutoff …") as a sentence. */
function feasibilitySentence(trace: string | undefined, forLeg: boolean): string | undefined {
  if (!trace) return undefined;
  const late = trace.match(/leg ETA (\S+) is after vessel load cutoff (\S+)/);
  if (late) {
    const [eta, cut] = [readableDates(late[1]!), readableDates(late[2]!)];
    return forLeg ? `Leg ETA ${eta} misses the ${cut} vessel cutoff.` : `Cargo excluded by vessel cutoff: the feeder leg arrives ${eta}, after the ${cut} cutoff.`;
  }
  const closing = trace.match(/vessel ETA (\S+) is after station closing date (\S+)/);
  if (closing) return `Vessel ETA ${readableDates(closing[1]!)} is after the station closing date ${readableDates(closing[2]!)}.`;
  if (/no vessel assigned/.test(trace)) return "No vessel assigned. Cargo excluded.";
  return undefined;
}

const stripRule = (s: string) => readableDates(s.replace(/^\[R\d+\]\s*/, ""));
const words = (s: string) => s.replace(/_/g, " ").toLowerCase();

/** One plain sentence for the focus line and the Selected record panel. */
export function recordReason(node: GraphNode, graph: KnowledgeGraph, station?: StationEval): string {
  switch (node.type) {
    case "station":
      return station ? `${stationReason(station)}${/[.]$/.test(stationReason(station)) ? "" : "."}` : "Not evaluated on this device.";
    case "dimension": {
      const d = dimensionOf(station, node);
      return d ? dimensionReason(d) : "Not evaluated on this device.";
    }
    case "item": {
      const i = itemEval(station, node.id);
      if (!i) return stripRule(node.detail[0] ?? node.label);
      const head = i.state === "RED" ? "Below requirement" : i.state === "AMBER" ? "Close to requirement" : "Within requirement";
      return `${head}: ${formatHaveNeed(i.have, i.need, i.unit)}.`;
    }
    case "shipment": {
      const said = feasibilitySentence(node.detail[0], false);
      if (said) return said;
      return node.state === "GREEN" ? "Counts as inbound: the feeder leg makes the vessel cutoff." : stripRule(node.detail[0] ?? "");
    }
    case "leg": {
      const { shipment, cutoff, feeder } = routeFacts(graph, node);
      const eta = node.sub?.match(/ETA (\S+)/)?.[1];
      const etaText = eta ? formatDate(`${eta}T00:00:00.000Z`) : undefined;
      if (feeder === node.id) {
        const said = feasibilitySentence(shipment?.detail[0], true);
        if (said) return said;
        if (etaText && cutoff) return node.state === "AMBER" ? `Leg ETA ${etaText} is close to the ${cutoff} vessel cutoff.` : `Leg ETA ${etaText}, before the ${cutoff} vessel cutoff.`;
      }
      return `${node.detail[0] ?? "Cargo leg."}${etaText ? ` ETA ${etaText}.` : ""}`;
    }
    case "vessel":
      return node.sub ? `${cleanSub(node.sub).replace(" · ", ". ")}.` : node.label;
    case "role":
      return node.state ? `${upperFirst(node.label)}: ${cleanSub(node.sub ?? "")}.` : `${node.sub ?? ""} on station.`.replace(/^1 people/, "1 person");
    case "assets":
      return `${cleanSub(node.sub ?? "")}.`;
    case "mission": {
      // The engine's R07 line names records by id ("depends on INV-DSL, which is RED"): use their names.
      const names = new Map(graph.nodes.map((n) => [n.id, n.type === "item" ? n.label : n.id] as const));
      const said = node.detail[0] ? stripRule(node.detail[0]).replace(/\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b/g, (id) => names.get(id) ?? id) : `${words(node.sub ?? "")}`;
      return `${upperFirst(said)}${/[.]$/.test(said) ? "" : "."}`;
    }
    case "incident":
      return `${upperFirst(node.sub ?? "open")} incident. ${readableDates(node.detail[1] ?? "")}`.trim();
    default:
      return stripRule(node.detail[0] ?? node.label);
  }
}

/** Where the focused record's links come from: "From season data, engine rule R02 and the event log." */
export function sourceNote(edges: GraphEdge[]): string {
  const parts: string[] = [];
  if (edges.some((e) => e.source === "seed")) parts.push("season data");
  const rules = [...new Set(edges.filter((e) => e.rule).map((e) => e.rule!))].sort();
  if (rules.length) parts.push(`engine ${rules.length === 1 ? "rule" : "rules"} ${rules.join(", ")}`);
  if (edges.some((e) => e.source === "event")) parts.push("the event log");
  if (!parts.length) return "";
  return `From ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0]}.`;
}

/** The screen where a record is managed, and the button that opens it. */
export function recordAction(node: GraphNode, graph: KnowledgeGraph): { label: string; path: string } | undefined {
  switch (node.type) {
    case "leg": case "shipment": case "vessel": return { label: "Open in Cargo", path: "/cargo" };
    case "item": return { label: "Open inventory", path: "/inventory" };
    case "decision": return { label: "Open decision", path: `/decisions/${node.id}` };
    case "station": case "dimension": return { label: "Open station", path: `/stations/${graph.nodeId}` };
    case "role": case "mission": return { label: "Open personnel", path: "/personnel" };
    case "assets": return { label: "Open map", path: "/map" };
    case "incident": return { label: "Open incident", path: "/incident" };
    case "lever": {
      const decision = graph.edges.find((e) => e.to === node.id && graph.nodes.find((n) => n.id === e.from)?.type === "decision");
      return decision ? { label: "Open decision", path: `/decisions/${decision.from}` } : { label: "Open station", path: `/stations/${graph.nodeId}` };
    }
  }
}

/** Splits text so numbers, ids and dates can be set in mono while the words stay in Inter. */
export function numberRuns(text: string): { text: string; mono: boolean }[] {
  const out: { text: string; mono: boolean }[] = [];
  const re = /[−-]?\d[\d,.]*/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index), mono: false });
    out.push({ text: m[0], mono: true });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), mono: false });
  return out;
}
