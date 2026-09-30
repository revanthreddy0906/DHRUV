import { useNavigate } from "react-router-dom";
import { config, type LinkStatus } from "@dhruv/shared";
import { DEFAULT_SCENARIO, SCENARIOS, STATION_NODES, scenarioById } from "@dhruv/seed";
import type { Freshness, Role } from "../data/types";
import { useDevice } from "./DeviceProvider";
import { formatAge, formatClock, formatShort, seasonAt } from "./format";
import { formatDate } from "../format";
import { formatWallTime } from "../format";

const NODE_LABEL: Record<string, string> = { HQ: "Goa HQ", MAITRI: "Maitri", BHARATI: "Bharati", MUMBAI: "Mumbai", CAPE_TOWN: "Cape Town" };
export const nodeLabel = (id: string) => NODE_LABEL[id] ?? id;

/** Section 8 link-contact freshness: < 1 h FRESH, < 6 h AGING, < 24 h STALE, otherwise CRITICAL. */
function contactFreshness(hours: number): Freshness {
  return hours < 1 ? "FRESH" : hours < 6 ? "AGING" : hours < 24 ? "STALE" : "CRITICAL";
}

/** The Director scenario this device's seed came from (the seed carries no id), for its clock jumps. */
function scenarioOf(seed: unknown) {
  const vessels = JSON.stringify((seed as { vessels?: unknown } | null)?.vessels);
  return SCENARIOS.find((s) => JSON.stringify(s.seed.vessels) === vessels) ?? scenarioById(DEFAULT_SCENARIO)!;
}

/**
 * A station's link as this device knows it. Its own link is known (the simulated switch). Another
 * station's link is not visible from here, so it carries only the age of the last event heard from
 * that station, with its section 8 link-contact freshness.
 */
export type StationLink =
  | { node: string; label: string; own: true; status: LinkStatus }
  | { node: string; label: string; own: false; age: string; freshness: Freshness };

export interface LiveChrome {
  role: Role;
  deviceId: string;
  station: string;
  link: LinkStatus;
  clock: string;
  phase: string;
  daysToResupply: number;
  /** "20 Nov 2027", or the scenario relief vessel's current ETA. */
  nextResupply: string;
  pending: { count: number; oldest?: string };
  stalled: boolean;
  lastSync?: string;
  /** Newest event from another device this tab holds: how current its view of other nodes is. */
  othersAsOf?: string;
  stations: StationLink[];
  /** The Director's absolute jumps for this device's scenario; applied to this device only. */
  clockJumps: { label: string; iso: string }[];
  onJump(hours: number): void;
  onJumpTo(iso: string): void;
  onReset(): void;
  onLinkChange(status: LinkStatus): void;
  onRoleChange(role: Role): void;
  signOut(): void;
}

/**
 * The persistent chrome (top bar, sidebar, comms strip) from this tab's device, or null when the
 * tab is not signed in. Everything is viewer-relative: this device's clock, link and outbox.
 */
export function useLiveChrome(): LiveChrome | null {
  const device = useDevice();
  const navigate = useNavigate();
  const snap = device?.snapshot;
  if (!device || !snap) return null;

  const { identity } = device.session;
  const oldest = snap.sync.oldestPendingAt;
  const lastOk = device.lastSync?.outcome.ok ? device.lastSync : null;

  const othersNewest = snap.events.filter((e) => e.device_id !== identity.device_id).map((e) => e.observed_at).sort().at(-1);
  const seedContact = Object.fromEntries((snap.seed?.link_state ?? []).map((l) => [l.node_id, l.last_contact]));
  const stations: StationLink[] = STATION_NODES.map((node) => {
    if (node === identity.node_id) return { node, label: nodeLabel(node), own: true, status: snap.link };
    const heard = [snap.lastHeard[node], seedContact[node], config.demo.startAt].filter((t): t is string => !!t).sort().at(-1)!;
    const hours = (Date.parse(snap.now) - Date.parse(heard)) / 3_600_000;
    return { node, label: nodeLabel(node), own: false, age: formatAge(heard, snap.now), freshness: contactFreshness(hours) };
  });

  const season = seasonAt(snap.seed, snap.events.filter((e) => !snap.rejected.has(e.event_id)), snap.now);

  return {
    role: identity.role as Role,
    deviceId: identity.device_id,
    station: nodeLabel(identity.node_id),
    link: snap.link,
    clock: formatClock(snap.now),
    phase: season.phase,
    daysToResupply: season.daysToResupply,
    nextResupply: `${formatDate(season.resupplyAt)} ${new Date(season.resupplyAt).getUTCFullYear()}`,
    pending: { count: snap.sync.pending, oldest: oldest ? formatAge(oldest, snap.now) : undefined },
    stalled: snap.sync.stalled,
    lastSync: lastOk ? formatWallTime(lastOk.at) : undefined,
    othersAsOf: othersNewest ? formatShort(othersNewest) : undefined,
    stations,
    clockJumps: scenarioOf(snap.seed).clockJumps,
    onJump: (h) => void device.jump(h),
    onJumpTo: (iso) => void device.jumpTo(iso),
    onReset: () => void device.resetClock(),
    onLinkChange: (s) => void device.setLink(s),
    // A tab is one device: switching role means signing in as another device.
    onRoleChange: (r) => {
      device.signOut();
      navigate(`/login?role=${r}`);
    },
    signOut: () => {
      device.signOut();
      navigate("/login");
    },
  };
}

