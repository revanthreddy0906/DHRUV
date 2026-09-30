import type { Evaluation, ShipmentMilestones } from "@dhruv/engine";
import type { ConflictView, DecisionView, IncidentView } from "@dhruv/store";
import { dayLabel } from "./describe";
import { DIMENSION_LABEL, dimensionReason } from "../format";

/**
 * The exception queue (the control-tower pattern): every rule breach becomes one line with a
 * severity, an owner, what happened, what to do, and where to do it. Derived from the engine and
 * the event log each time; nothing is stored, so it clears itself when the cause is fixed.
 */
export type Severity = "RED" | "AMBER";
export type OwnerRole = "HQ_OPS" | "STATION_LEADER" | "FIELD_LEAD";

export interface OpsException {
  id: string;
  severity: Severity;
  /** The station it concerns, or HQ for expedition-wide items. */
  node: string;
  owners: OwnerRole[];
  title: string;
  why: string;
  /** Steps in order, each short enough to act on. */
  playbook: string[];
  /** The screen where the first step is done; the label is the action ("Review decision"). */
  link: { to: string; label: string };
  /** When it must be acted on (point of no return, latest milestone date), as ISO. */
  deadline?: string;
}

export interface ExceptionInputs {
  evaluation: Evaluation;
  milestones: ShipmentMilestones[];
  decisions: DecisionView[];
  conflicts: ConflictView[];
  incidents: IncidentView[];
  refused: number;
  now: string;
}

const NODE_NAME: Record<string, string> = { MAITRI: "Maitri", BHARATI: "Bharati", HQ: "HQ" };
const name = (n: string) => NODE_NAME[n] ?? n;

const DIMENSION_PLAYBOOK: Record<string, { label: string; owners: OwnerRole[]; steps: string[]; link: { to: string; label: string } }> = {
  FUEL: {
    label: "Fuel", owners: ["STATION_LEADER", "HQ_OPS"], link: { to: "/inventory", label: "Inventory" },
    steps: ["Count the diesel tanks so the ratio rests on a fresh figure.", "Check the Γ robustness panel (Station page, Analysis) for how much margin is left.", "Open the proposed decision: hold the vessel, airlift, conserve or defer a mission."],
  },
  FOOD: {
    label: "Food", owners: ["STATION_LEADER", "HQ_OPS"], link: { to: "/personnel", label: "Personnel" },
    steps: ["Check people on station: extra people raise the requirement (R19).", "Count food stores.", "Plan who can leave, or add food to the next shipment."],
  },
  MEDICAL: {
    label: "Medical", owners: ["STATION_LEADER", "HQ_OPS"], link: { to: "/inventory", label: "Inventory" },
    steps: ["Count medical kits and oxygen.", "Add the shortfall to an inbound shipment before its cut-off."],
  },
  POWER: {
    label: "Spares & power", owners: ["STATION_LEADER"], link: { to: "/inventory", label: "Inventory" },
    steps: ["Check generator status and genset kits.", "Ask HQ to add spares to the next shipment."],
  },
  PERSONNEL: {
    label: "Personnel", owners: ["HQ_OPS", "STATION_LEADER"], link: { to: "/personnel", label: "Personnel" },
    steps: ["See which critical role is short.", "Move someone with that role from another station, or re-plan missions."],
  },
  COMMS: {
    label: "Comms", owners: ["STATION_LEADER"], link: { to: "/personnel", label: "Personnel" },
    steps: ["Switch to the backup link (Iridium).", "Report the fault to HQ with the next sync."],
  },
};

export function exceptionsOf(input: ExceptionInputs): OpsException[] {
  const out: OpsException[] = [];

  for (const st of input.evaluation.stations) {
    for (const d of st.dimensions) {
      if (d.state === "GREEN") continue;
      const p = DIMENSION_PLAYBOOK[d.key];
      if (!p) continue;
      const coverage = d.key === "PERSONNEL" || d.key === "COMMS";
      out.push({
        id: `dim:${st.nodeId}:${d.key}`, severity: d.state, node: st.nodeId, owners: p.owners,
        title: `${name(st.nodeId)} ${(DIMENSION_LABEL[d.key] ?? p.label).toLowerCase()} ${d.state === "RED" ? (coverage ? "below need" : "below requirement") : coverage ? "at need with no spare" : "close to requirement"}`,
        why: dimensionReason(d),
        playbook: p.steps, link: { to: `/stations/${st.nodeId}`, label: "Open station" },
        deadline: d.key === "FUEL" ? st.pnr?.pnrDate ?? undefined : undefined,
      });
    }
    for (const d of st.dimensions) {
      if (d.freshness !== "STALE" && d.freshness !== "CRITICAL") continue;
      out.push({
        id: `fresh:${st.nodeId}:${d.key}`, severity: d.freshness === "CRITICAL" ? "RED" : "AMBER", node: st.nodeId, owners: ["STATION_LEADER"],
        title: `${name(st.nodeId)} ${(DIMENSION_LABEL[d.key] ?? d.key).toLowerCase()} count ${d.freshness === "CRITICAL" ? "critically old" : "stale"}`,
        why: d.observedAt ? `Last counted ${dayLabel(d.observedAt)}, so the ratio rests on an old figure. Verify before acting.` : "No recent count. Verify before acting.",
        playbook: ["Count it: Inventory, action Count.", "The ratio and its confidence band update as soon as the count is recorded."],
        link: { to: `/inventory?station=${st.nodeId}`, label: "Record count" },
      });
    }
  }

  for (const s of input.milestones) {
    const bad = s.milestones.filter((m) => m.state === "MISSED" || m.state === "AT_RISK");
    for (const m of bad) {
      out.push({
        id: `ms:${s.shipmentId}:${m.key}`, severity: m.state === "MISSED" ? "RED" : "AMBER", node: s.destNodeId, owners: ["HQ_OPS"],
        title: `${s.shipmentId} ${m.label.charAt(0).toLowerCase()}${m.label.slice(1)}: ${m.state === "MISSED" ? "missed" : "at risk"}`,
        why: `${m.note}${m.latest ? ` · latest ${dayLabel(m.latest)}` : ""}${m.current ? ` · now ${dayLabel(m.current)}` : ""}.`,
        playbook: m.key === "ON_STATION"
          ? ["Confirm the vessel's schedule.", "Decide what can wait for next season and what must go by air."]
          : ["Confirm the leg's ETA with the forwarder (an old report is uncertain, R17).", "Record it on Cargo (Edit ETA) so every device sees it.", "If it misses the cut-off, weigh holding the vessel against an airlift."],
        link: { to: "/cargo", label: "Open cargo" },
        deadline: m.latest ?? undefined,
      });
    }
  }

  for (const d of input.decisions.filter((x) => x.status === "PROPOSED")) {
    const left = d.pnr ? Math.ceil((Date.parse(d.pnr) - Date.parse(input.now)) / 86_400_000) : undefined;
    out.push({
      id: `dec:${d.id}`, severity: left !== undefined && left <= 3 ? "RED" : "AMBER", node: d.node_id, owners: ["HQ_OPS", "STATION_LEADER"],
      title: `Decision required: ${name(d.node_id)} ${d.id}`,
      why: `${d.options.length} options proposed by the engine${left !== undefined ? `; ${left} ${left === 1 ? "day" : "days"} to the point of no return` : ""}.`,
      playbook: ["Open the decision and compare the options.", "Tick 'verified' for inputs that are uncertain, then approve one."],
      link: { to: `/decisions/${d.id}`, label: "Review decision" },
      deadline: d.pnr ?? undefined,
    });
  }

  for (const i of input.incidents.filter((x) => x.open)) {
    out.push({
      id: `inc:${i.id}`, severity: "RED", node: i.node_id, owners: ["STATION_LEADER", "HQ_OPS"],
      title: `${i.id} ${i.type.replace(/_/g, " ").toLowerCase()} open`,
      why: `Last confirmed ${dayLabel(i.last_confirmed_at)}. ${i.person_ids.length} ${i.person_ids.length === 1 ? "person" : "people"} involved.`,
      playbook: ["Open the Incident screen: last position and uncertainty circle.", "Send the nearest capable asset.", "Update or close the incident as news comes in."],
      link: { to: "/incident", label: "Open incident" },
    });
  }

  for (const c of input.conflicts.filter((x) => x.status === "OPEN")) {
    out.push({
      id: `conf:${c.id}`, severity: "AMBER", node: c.node_id, owners: ["STATION_LEADER", "HQ_OPS"],
      title: `Conflicting reports on ${c.entity_id} ${c.field}`,
      why: `Devices disagreed. The conservative value ${String(c.conservative_value)} is kept until someone decides.`,
      playbook: ["Open the Review queue on Audit.", "Pick the value that is true on the ground."],
      link: { to: "/audit", label: "Review conflict" },
    });
  }

  if (input.refused > 0) {
    out.push({
      id: "refused", severity: "AMBER", node: "HQ", owners: ["HQ_OPS", "STATION_LEADER", "FIELD_LEAD"],
      title: `${input.refused} event${input.refused === 1 ? "" : "s"} from this device refused by the server`,
      why: "They are not counted in any view.",
      playbook: ["Open the sync drawer to see the server's reason.", "Record the correct action again."],
      link: { to: "/command?sync=1", label: "See why" },
    });
  }

  const rank = { RED: 0, AMBER: 1 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || a.node.localeCompare(b.node) || a.id.localeCompare(b.id));
}

/**
 * Needs-attention order (section 8): pending decisions, open incidents and safety conflicts (every
 * unresolved flag is one: the engine gates on it, R15), RED states, CRITICAL data, AMBER states,
 * at-risk or missed milestones, events the server refused, then STALE data. Ties go by earliest
 * deadline; items without one follow, in their existing order.
 */
export function attentionGroup(e: OpsException): number {
  if (e.id.startsWith("dec:")) return 0;
  if (e.id.startsWith("inc:") || e.id.startsWith("conf:")) return 1;
  if (e.id.startsWith("dim:")) return e.severity === "RED" ? 2 : 4;
  if (e.id.startsWith("fresh:")) return e.severity === "RED" ? 3 : 7;
  if (e.id.startsWith("ms:")) return 5;
  if (e.id === "refused") return 6;
  return 4;
}

export function rankForAttention(list: OpsException[]): OpsException[] {
  const due = (e: OpsException) => (e.deadline ? Date.parse(e.deadline) : Infinity);
  return list
    .map((e, i) => ({ e, i }))
    .sort((a, b) => attentionGroup(a.e) - attentionGroup(b.e) || due(a.e) - due(b.e) || a.i - b.i)
    .map((x) => x.e);
}

/** Station roles see their station and expedition-wide items; HQ sees everything. Their own first. */
export function forViewer(list: OpsException[], role: OwnerRole, node: string): OpsException[] {
  const visible = role === "HQ_OPS" ? list : list.filter((e) => e.node === node || e.node === "HQ");
  return [...visible.filter((e) => e.owners.includes(role)), ...visible.filter((e) => !e.owners.includes(role))];
}
