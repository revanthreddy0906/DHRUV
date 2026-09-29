import { reduce, type Evaluation } from "@dhruv/engine";
import { config, type OpEvent, type Seed } from "@dhruv/shared";
import { lastCheckIn } from "@dhruv/store";
import type { Health } from "../data/types";
import { checkInStatus, drivingDimension, formatAgo, formatRatio } from "../format";
import { CHECKIN_DUE_SOON_MINUTES, FIELD_DEVICES } from "../ui-config";
import { nodeLabel } from "./chrome";

/**
 * The Command Center's network position (the v0 mock's schematic): HQ, the ports, the stations
 * and the field teams, and the supply legs between them. Every state is the engine's; positions
 * are a fixed schematic layout, not geography.
 */
export interface NetworkNode {
  id: string;
  label: string;
  kind: "hq" | "port" | "station" | "team";
  /** Percent of the panel's width and height. */
  x: number;
  y: number;
  /** Which side of the marker the label sits on. */
  side: "left" | "right";
  state?: Health;
  /** A second line: "RED · 0.697", "Checked in 3 h ago". */
  sub?: string;
  href?: string;
}

export interface NetworkLink {
  from: string;
  to: string;
  kind: "supply" | "team";
  /** Set only when something on the link is wrong: a delayed leg, an overdue team. */
  state?: "RED" | "AMBER";
  /** "L2-C104 Mumbai to Cape Town, delayed", for the tooltip and screen readers. */
  title: string;
}

export interface NetworkView { nodes: NetworkNode[]; links: NetworkLink[] }

/** Schematic positions: India at the top right, Cape Town at the left, the stations along the bottom. */
const LAYOUT: Record<string, { x: number; y: number; side: "left" | "right" }> = {
  HQ: { x: 86, y: 30, side: "left" },
  MUMBAI: { x: 60, y: 14, side: "left" },
  CAPE_TOWN: { x: 26, y: 42, side: "right" },
  MAITRI: { x: 18, y: 78, side: "right" },
  BHARATI: { x: 82, y: 78, side: "left" },
};
const KIND: Record<string, NetworkNode["kind"]> = { HQ: "hq", MUMBAI: "port", CAPE_TOWN: "port" };

const worse = (a?: "RED" | "AMBER", b?: "RED" | "AMBER") => (a === "RED" || b === "RED" ? "RED" : a ?? b);

export function networkView(seed: Seed, events: OpEvent[], evaluation: Evaluation, now: string): NetworkView {
  const state = reduce(seed, events);
  const stations = new Map(evaluation.stations.map((s) => [s.nodeId, s]));
  const links = new Map<string, NetworkLink>();

  // Supply legs of every shipment to an evaluated station; a delayed leg takes the station's state
  // when the station is not GREEN (the delay is why), else AMBER.
  for (const shipment of seed.shipments) {
    const st = stations.get(shipment.dest_node_id);
    if (!st) continue;
    for (const leg of seed.legs.filter((l) => l.shipment_id === shipment.id).sort((a, b) => a.seq - b.seq)) {
      if (leg.from_node === leg.to_node || !LAYOUT[leg.from_node] || !LAYOUT[leg.to_node]) continue;
      const delayed = (state.legs.get(leg.id)?.status ?? leg.status) === "DELAYED";
      const legState = delayed ? (st.state === "GREEN" ? "AMBER" : st.state) as "RED" | "AMBER" : undefined;
      const key = `${leg.from_node}>${leg.to_node}`;
      const prev = links.get(key);
      const title = `${leg.id} ${nodeLabel(leg.from_node)} to ${nodeLabel(leg.to_node)}${delayed ? ", delayed" : ""}`;
      links.set(key, { from: leg.from_node, to: leg.to_node, kind: "supply", state: worse(prev?.state, legState), title: prev && !delayed ? prev.title : title });
    }
  }

  const nodes: NetworkNode[] = [];
  const used = new Set([...links.values()].flatMap((l) => [l.from, l.to]).concat(["HQ", ...stations.keys()]));
  for (const id of Object.keys(LAYOUT)) {
    if (!used.has(id)) continue;
    const st = stations.get(id);
    const d = st && drivingDimension(st);
    nodes.push({
      id, label: nodeLabel(id), kind: st ? "station" : KIND[id] ?? "port", ...LAYOUT[id]!,
      state: st?.state,
      sub: st ? `${st.state}${d?.ratio != null ? ` · ${formatRatio(d.ratio)}` : ""}` : undefined,
      href: st ? `/stations/${id}?station=${id}` : undefined,
    });
  }

  // Field teams, placed beside their mission's station, with their check-in status.
  for (const { team, mission } of Object.values(FIELD_DEVICES)) {
    const m = seed.missions.find((x) => x.id === mission);
    const at = m && LAYOUT[m.node_id];
    if (!m || !at || !stations.has(m.node_id)) continue;
    const last = lastCheckIn(events, team);
    const status = checkInStatus(last?.observed_at, now, { intervalHours: config.season.checkInIntervalHours, graceHours: config.season.checkInGraceHours, dueSoonMinutes: CHECKIN_DUE_SOON_MINUTES });
    const tState: "RED" | "AMBER" | undefined = status.state === "OVERDUE" ? "RED" : status.state === "DUE_SOON" ? "AMBER" : undefined;
    nodes.push({
      id: team, label: team, kind: "team", x: at.x + 16, y: at.y - 16, side: "right", state: tState,
      sub: last ? (status.state === "ON_SCHEDULE" ? `Checked in ${formatAgo(last.observed_at, now)}` : `${status.headline} · last ${formatAgo(last.observed_at, now)}`) : "No check-in yet",
      href: "/map",
    });
    links.set(`${team}>${m.node_id}`, { from: team, to: m.node_id, kind: "team", state: tState as "RED" | "AMBER" | undefined, title: `${team} on ${m.id}, ${status.headline.toLowerCase()}` });
  }

  return { nodes, links: [...links.values()] };
}
