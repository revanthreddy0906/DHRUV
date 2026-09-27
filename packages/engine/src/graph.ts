import { compareEvents, config, withCreatedShipments, type OpEvent, type PayloadOf } from "@dhruv/shared";
import { reduce } from "./reduce.js";
import { checkFeasibility } from "./rules/feasibility.js";
import type { EngineInput, Evaluation } from "./index.js";

/**
 * The knowledge graph (evaluator question 2): how a station's readiness is connected to the
 * records behind it. Most of these links are not stored anywhere as links: they are foreign keys
 * (cargo line → shipment → legs → vessel), JSON inside a record (a mission's needs, a lever's
 * effect) or the engine's own rules (R02 feasibility, R05 role coverage, R19 people on station).
 * This makes them explicit, one station at a time, from the same inputs evaluate() uses.
 */

export type GraphNodeType =
  | "station" | "dimension" | "item" | "shipment" | "leg" | "vessel"
  | "role" | "assets" | "mission" | "lever" | "decision" | "incident";

export type Light = "GREEN" | "AMBER" | "RED";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  /** Short second line: a quantity, a date, a status. */
  sub?: string;
  state?: Light;
  /** Facts shown when the node is selected. */
  detail: string[];
}

export type EdgeSource = "seed" | "rule" | "event";

export interface GraphEdge {
  from: string;
  to: string;
  /** What the link means, read from → to: "carries", "feeds", "needs", "acts on", ... */
  kind: string;
  /** The engine rule that uses this link, when there is one. */
  rule?: string;
  /** Where the link comes from: a seed foreign key or JSON field, an engine rule, or the event log. */
  source: EdgeSource;
  /** True when trouble at `from` travels to `to` (a delay, a shortage). Remedies (levers, decisions) are false. */
  impact: boolean;
  why: string;
}

export interface KnowledgeGraph {
  nodeId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const DIM_LABEL: Record<string, string> = { FUEL: "Fuel", FOOD: "Food", MEDICAL: "Medical", POWER: "Spares & power", PERSONNEL: "Personnel", COMMS: "Comms" };
const DIM_OF_ITEM: Record<string, string> = { FUEL: "FUEL", FOOD: "FOOD", MEDICAL: "MEDICAL", SPARES_POWER: "POWER" };
const day = (iso: string) => iso.slice(0, 10);
const words = (s: string) => s.replace(/_/g, " ").toLowerCase();
const parse = <T>(json: string | undefined, fallback: T): T => {
  try { return json ? (JSON.parse(json) as T) : fallback; } catch { return fallback; }
};

export function knowledgeGraph(raw: EngineInput, evaluation: Evaluation, nodeId: string): KnowledgeGraph {
  const seed = withCreatedShipments(raw.seed, raw.events);
  const events = [...raw.events].sort(compareEvents);
  const state = reduce(seed, events);
  const station = evaluation.stations.find((s) => s.nodeId === nodeId);
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const add = (n: GraphNode) => { if (!nodes.has(n.id)) nodes.set(n.id, n); return n.id; };
  const link = (e: GraphEdge) => { if (nodes.has(e.from) && nodes.has(e.to)) edges.push(e); };

  const stationName = seed.nodes.find((n) => n.id === nodeId)?.name ?? nodeId;
  add({ id: nodeId, type: "station", label: stationName, state: station?.state, sub: station ? `station ${station.state}` : "not evaluated", detail: [`Worst of its dimensions, gated by open incidents, safety conflicts and blocked missions (R15).`] });

  // Dimensions: every one the engine evaluated for this station.
  for (const d of station?.dimensions ?? []) {
    const id = `${nodeId}.${d.key}`;
    add({ id, type: "dimension", label: DIM_LABEL[d.key] ?? d.key, state: d.state, sub: d.ratio !== null ? `ratio ${d.ratio.toFixed(4)}` : d.state, detail: d.trace.slice(0, 6).map((t) => t.text) });
    link({ from: id, to: nodeId, kind: "rolls up into", rule: "R15", source: "rule", impact: true, why: "The station is the worst of its dimensions." });
  }

  // Inventory items → their dimension (R01-R03, FOOD by R19).
  const items = seed.inventory_items.filter((i) => i.node_id === nodeId).sort((a, b) => a.id.localeCompare(b.id));
  const itemEval = new Map((station?.dimensions ?? []).flatMap((d) => (d.items ?? []).map((it) => [it.id, it] as const)));
  for (const it of items) {
    const inv = state.inventory.get(it.id);
    const ev = itemEval.get(it.id);
    add({
      id: it.id, type: "item", label: it.name, state: ev?.state,
      sub: `${inv ? +inv.stock.toFixed(2) : it.stock} ${it.unit}${ev?.inbound ? ` + ${ev.inbound} inbound` : ""}`,
      detail: [
        `Stock ${inv?.stock ?? it.stock} ${it.unit}: last count plus receipts minus issues, from the event log.`,
        it.requirement_mode === "BURN" ? "Requirement from burn rate per phase to the next resupply (R01)." : `Fixed requirement ${it.fixed_requirement} ${it.unit} (R01).`,
        `Reserve ${(it.reserve_pct * 100).toFixed(0)} %.`,
      ],
    });
    const dim = `${nodeId}.${DIM_OF_ITEM[it.dimension] ?? it.dimension}`;
    link({ from: it.id, to: dim, kind: "feeds", rule: it.dimension === "FOOD" ? "R19" : "R03", source: "rule", impact: true, why: "Availability ÷ requirement for this item sets the dimension's ratio." });
  }

  // Cargo lines: item ← shipment ← legs ← vessel (R02, R16).
  const itemIds = new Set(items.map((i) => i.id));
  const lines = seed.cargo_items.filter((c) => itemIds.has(c.inventory_item_id));
  for (const shipment of seed.shipments.filter((s) => lines.some((c) => c.shipment_id === s.id)).sort((a, b) => a.id.localeCompare(b.id))) {
    const legs = seed.legs.filter((l) => l.shipment_id === shipment.id).sort((a, b) => a.seq - b.seq);
    const vesselLeg = legs.find((l) => l.vessel_id);
    const vessel = vesselLeg?.vessel_id ? state.vessels.get(vesselLeg.vessel_id) : undefined;
    const feeder = [...legs].reverse().find((l) => !l.vessel_id && (!vesselLeg || l.seq < vesselLeg.seq));
    const feederState = feeder ? state.legs.get(feeder.id) : undefined;
    const feas = feederState && vessel ? checkFeasibility(feederState, vessel) : undefined;
    const created = !raw.seed.shipments.some((s) => s.id === shipment.id);
    add({
      id: shipment.id, type: "shipment", label: `${shipment.id} ${shipment.name}`, state: feas ? (feas.feasible ? "GREEN" : "RED") : undefined,
      sub: `${words(shipment.priority)}${feas ? (feas.feasible ? " · counts as inbound" : " · excluded") : ""}`,
      detail: [feas ? feas.trace : "No feeder and vessel to check.", created ? "Created by a SHIPMENT_CREATED event." : "From the season's seed."],
    });
    for (const c of lines.filter((l) => l.shipment_id === shipment.id)) {
      link({ from: shipment.id, to: c.inventory_item_id, kind: `carries ${c.qty}`, rule: "R02", source: created ? "event" : "seed", impact: true, why: `Cargo line ${c.id}: counted as inbound only if the feeder reaches the vessel before load cut-off.` });
    }
    for (const l of legs) {
      const ls = state.legs.get(l.id);
      const isFeeder = l.id === feeder?.id;
      add({
        id: l.id, type: "leg", label: `${l.id} ${words(l.from_node)} → ${words(l.to_node)}`,
        state: isFeeder && feas ? (feas.feasible ? ((feas.slackDays ?? 99) <= 2 ? "AMBER" : "GREEN") : "RED") : undefined,
        sub: `${words(ls?.status ?? l.status)} · ETA ${day(ls?.eta ?? l.eta)}`,
        detail: [isFeeder ? "Feeder leg: its ETA is compared with the vessel's load cut-off (R02, slack R16)." : l.vessel_id ? "Vessel leg to the station." : "Earlier leg.", `ETA ${ls?.eta ?? l.eta} (${ls && ls.eta !== l.eta ? "changed by an event" : "as planned"}).`],
      });
      link({ from: l.id, to: shipment.id, kind: isFeeder ? "feeder of" : "leg of", rule: isFeeder ? "R02" : undefined, source: "seed", impact: isFeeder || !!l.vessel_id, why: isFeeder ? "If this leg is late for the cut-off, the whole shipment misses the vessel." : "Part of the shipment's route." });
      if (l.vessel_id) {
        const v = seed.vessels.find((x) => x.id === l.vessel_id);
        const vs = state.vessels.get(l.vessel_id);
        if (v && vs) {
          add({ id: v.id, type: "vessel", label: v.name, sub: `cut-off ${day(vs.loadCutoff)} · ETA ${day(vs.etaStation)}`, detail: [`Load cut-off ${vs.loadCutoff}.`, `Departs ${vs.departure}, at the station ${vs.etaStation}, station closes ${vs.stationClosingDate}.`] });
          link({ from: v.id, to: l.id, kind: "sails", rule: "R02", source: "seed", impact: true, why: "The vessel's cut-off, departure and arrival decide whether cargo makes it." });
        }
      }
    }
  }

  // People by role → Personnel (R05) and Food (R19: people on station).
  const people = [...state.personnel.values()].filter((p) => p.nodeId === nodeId);
  const roleNeed = config.season.roleNeed as Record<string, number>;
  const roles = [...new Set(people.map((p) => p.role))].sort();
  for (const role of roles) {
    const group = people.filter((p) => p.role === role);
    const need = roleNeed[role];
    // The engine's own R05 line for this role, so the graph never disagrees with the dashboard.
    const coverage = need ? station?.dimensions.find((d) => d.key === "PERSONNEL")?.items?.find((i) => i.id === role) : undefined;
    const id = `role:${nodeId}:${role}`;
    add({
      id, type: "role", label: words(role), sub: coverage ? `${coverage.have} / need ${coverage.need}` : `${group.length} people`,
      state: coverage?.state,
      detail: group.map((p) => `${seed.personnel.find((s) => s.id === p.personId)?.name ?? p.personId} · ${words(p.status)}`),
    });
    if (need) link({ from: id, to: `${nodeId}.PERSONNEL`, kind: "covers", rule: "R05", source: "rule", impact: true, why: `Critical role: need ${need}, GREEN at need + 1.` });
    const food = items.find((i) => i.dimension === "FOOD");
    if (food) link({ from: id, to: food.id, kind: "eats from", rule: "R19", source: "rule", impact: false, why: "Everyone on station and not evacuated counts in the food requirement." });
  }

  // Assets by type → Power (generators, R06) and Comms (VSAT, Iridium, R06).
  const assets = [...state.assets.values()].filter((a) => a.nodeId === nodeId);
  for (const type of [...new Set(assets.map((a) => a.type))].sort()) {
    const group = assets.filter((a) => a.type === type);
    const ok = group.filter((a) => a.status === "OK").length;
    const id = `assets:${nodeId}:${type}`;
    add({ id, type: "assets", label: type, sub: `${ok} / ${group.length} OK`, state: ok === group.length ? "GREEN" : ok > 0 ? "AMBER" : "RED", detail: group.map((a) => `${a.assetId} · ${a.status}`) });
    const dim = /^generator$/i.test(type) ? "POWER" : /^(vsat|iridium)$/i.test(type) ? "COMMS" : null;
    if (dim) link({ from: id, to: `${nodeId}.${dim}`, kind: "keeps up", rule: "R06", source: "rule", impact: true, why: "Redundancy: enough units must be running." });
  }

  // Missions (R07): need people and assets, draw fuel; a blocked mission gates the station.
  for (const m of seed.missions.filter((x) => x.node_id === nodeId).sort((a, b) => a.id.localeCompare(b.id))) {
    const impact = station?.missions?.find((x) => x.missionId === m.id);
    add({ id: m.id, type: "mission", label: `${m.id} ${m.name}`, state: impact ? (impact.status === "OK" ? "GREEN" : impact.status === "BLOCKED" ? "RED" : "AMBER") : undefined, sub: impact ? words(impact.status) : undefined, detail: [impact?.why ?? "", `${day(m.start_date)} → ${day(m.end_date)} · ${m.fuel_kl} kL`].filter(Boolean) });
    link({ from: m.id, to: nodeId, kind: "can gate", rule: "R15", source: "rule", impact: true, why: "A BLOCKED mission gates the station state." });
    const needs = parse<{ people?: string[]; assets?: string[] }>(m.needs, {});
    for (const pid of needs.people ?? []) {
      const p = state.personnel.get(pid);
      if (p) link({ from: `role:${p.nodeId}:${p.role}`, to: m.id, kind: `${seed.personnel.find((s) => s.id === pid)?.name ?? pid} needed`, rule: "R07", source: "seed", impact: true, why: "Named in the mission's needs: if unavailable, the mission is BLOCKED." });
    }
    for (const aid of needs.assets ?? []) {
      const a = state.assets.get(aid);
      if (a) link({ from: `assets:${a.nodeId}:${a.type}`, to: m.id, kind: `${aid} needed`, rule: "R07", source: "seed", impact: true, why: "Named in the mission's needs: if down, the mission is BLOCKED." });
    }
    const draws = seed.dependencies.find((d) => d.from_type === "mission" && d.from_id === m.id && d.kind === "DRAWS_FROM");
    if (draws) link({ from: draws.to_id, to: m.id, kind: `supplies ${m.fuel_kl} kL`, rule: "R07", source: "seed", impact: true, why: "DRAWS_FROM dependency: a RED fuel state puts the mission AT RISK." });
  }

  // Levers (R08): remedies, linked to what they act on.
  for (const l of seed.levers.filter((x) => x.node_id === nodeId).sort((a, b) => a.id.localeCompare(b.id))) {
    const effect = parse<Record<string, unknown>>(l.effect, {});
    const catalogued = station?.levers?.find((x) => x.id === l.id);
    add({ id: l.id, type: "lever", label: l.label, sub: catalogued ? (catalogued.available ? `until ${day(catalogued.deadline)}` : "deadline passed") : `cut-off ${day(l.cutoff)}`, detail: [catalogued?.trace ?? "", l.cost_amount !== null ? `Cost ${l.cost_amount} ${l.cost_unit}` : `Cost: ${l.cost_unit}`].filter(Boolean) });
    for (const [key, verb] of [["item_id", "adds to / saves"], ["shipment_id", "acts on"], ["mission_id", "defers"]] as const) {
      const target = effect[key];
      if (typeof target === "string") link({ from: l.id, to: target, kind: verb, rule: "R08", source: "seed", impact: false, why: "From the lever's effect: what it changes if chosen." });
    }
    if (typeof effect.vessel_departure === "string") {
      for (const v of seed.vessels) link({ from: l.id, to: v.id, kind: `holds to ${day(effect.vessel_departure)}`, rule: "R08", source: "seed", impact: false, why: "Holding the vessel moves its departure and load cut-off." });
    }
  }

  // Decisions (event log): proposed options and their levers; an approved one is applied.
  for (const d of [...state.decisions.values()].filter((x) => x.nodeId === nodeId).sort((a, b) => a.decisionId.localeCompare(b.decisionId))) {
    const chosen = d.options?.find((o) => o.id === d.chosenOptionId);
    add({ id: d.decisionId, type: "decision", label: d.decisionId, sub: words(d.status), state: d.status === "APPROVED" ? "GREEN" : d.status === "PROPOSED" ? "AMBER" : undefined, detail: [`${d.options?.length ?? 0} options proposed by the engine.`, chosen ? `Approved ${chosen.id} by ${d.approver}: ${chosen.levers.join(", ")} applied.` : "Waiting for approval."] });
    const levers = new Set((chosen ? chosen.levers : d.options?.flatMap((o) => o.levers)) ?? []);
    for (const lid of [...levers].sort()) link({ from: d.decisionId, to: lid, kind: chosen ? "applied" : "offers", source: "event", impact: false, why: chosen ? "The approved option's levers are folded into the requirement and availability." : "One of the options uses this lever." });
  }

  // Incidents (event log): open ones gate the station and involve people.
  const incidents = new Map<string, { p: PayloadOf<"INCIDENT_OPENED">; status: string }>();
  for (const e of events as OpEvent[]) {
    if (e.type === "INCIDENT_OPENED" && e.node_id === nodeId) incidents.set((e.payload as PayloadOf<"INCIDENT_OPENED">).incident_id, { p: e.payload as PayloadOf<"INCIDENT_OPENED">, status: "OPEN" });
    if (e.type === "INCIDENT_UPDATED") {
      const u = e.payload as PayloadOf<"INCIDENT_UPDATED">;
      const inc = incidents.get(u.incident_id);
      if (inc) inc.status = u.status;
    }
  }
  for (const [id, { p, status }] of [...incidents].sort(([a], [b]) => a.localeCompare(b))) {
    const open = !(config.conflicts.closedIncidentStatuses as readonly string[]).includes(status);
    add({ id, type: "incident", label: `${id} ${words(p.type)}`, sub: words(status), state: open ? "RED" : undefined, detail: [`People: ${p.person_ids.join(", ") || "none"}${p.team_id ? ` · team ${p.team_id}` : ""}`, `Last confirmed ${p.last_confirmed_at}.`] });
    if (open) link({ from: id, to: nodeId, kind: "gates", rule: "R15", source: "event", impact: true, why: "An open incident gates the station state." });
    for (const pid of p.person_ids) {
      const person = state.personnel.get(pid);
      if (person) link({ from: id, to: `role:${person.nodeId}:${person.role}`, kind: "involves", source: "event", impact: false, why: "Named in the incident." });
    }
  }

  return { nodeId, nodes: [...nodes.values()], edges };
}

/** Everything downstream of `id` along impact edges: what a delay or shortage there would reach. */
export function impactOf(graph: KnowledgeGraph, id: string): string[] {
  const out = new Map<string, GraphEdge[]>();
  for (const e of graph.edges) if (e.impact) out.set(e.from, [...(out.get(e.from) ?? []), e]);
  const seen = new Set<string>([id]);
  const queue = [id];
  while (queue.length) {
    for (const e of out.get(queue.shift()!) ?? []) if (!seen.has(e.to)) { seen.add(e.to); queue.push(e.to); }
  }
  seen.delete(id);
  return graph.nodes.map((n) => n.id).filter((n) => seen.has(n));
}
