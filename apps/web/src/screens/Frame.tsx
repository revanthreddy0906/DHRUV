import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { STATION_NODES } from "@dhruv/seed";
import { DhruvShell, TopBar, Sidebar, OfflineBanner, type NavKey, type StationScope } from "../components/shell";
import { DemoDock } from "../components/DemoDock";
import { MOMENTS, type MomentId } from "../data/demo";
import { formatDate } from "../format";
import { nodeLabel, useLiveChrome } from "../live/chrome";
import { useLiveOps, type LiveOps } from "../live/ops";
import { useDevice } from "../live/DeviceProvider";
import { useStationFocus } from "../live/stationFocus";
import { LiveSyncDrawer } from "../live/SyncLive";

export const NAV_PATH: Record<NavKey, string> = {
  command: "/command", decisions: "/decisions", stations: "/stations", cargo: "/cargo", inventory: "/inventory",
  personnel: "/personnel", map: "/map", incident: "/incident", audit: "/audit", data: "/data", graph: "/graph",
};

/**
 * The one global alarm (section 7.1): the earliest point of no return the engine reports for the
 * stations this viewer watches, linked to that station's open decision. Nothing when none exists.
 */
function pnrPill(ops: LiveOps, role: string, node: string): { date: string; daysLeft: number; href: string } | undefined {
  const watched = ops.evaluation.stations.filter((s) => role === "HQ_OPS" || s.nodeId === node);
  const fromEngine = watched
    .flatMap((s) => (s.pnr?.pnrDate ? [{ node: s.nodeId, at: s.pnr.pnrDate, daysLeft: s.pnr.daysRemaining ?? 0 }] : []))
    .sort((a, b) => a.at.localeCompare(b.at))[0];
  const decision = ops.openDecisions.find((d) => (fromEngine ? d.node_id === fromEngine.node : !!d.pnr && (role === "HQ_OPS" || d.node_id === node)));
  const href = decision ? `/decisions/${decision.id}` : "/decisions";
  if (fromEngine) return { date: formatDate(fromEngine.at), daysLeft: fromEngine.daysLeft, href };
  // A recorded proposal can carry a PNR the live evaluation no longer shows (levers applied).
  if (ops.pnr) return { date: ops.pnr.date.replace(/ \d{4}$/, ""), daysLeft: ops.pnr.daysLeft, href };
  return undefined;
}

/** One quiet status line in place of a screen's content (no spinner, no skeleton). */
export function QuietLine({ children }: { children: React.ReactNode }) {
  return <p role="status" className="p-8 text-sm text-fg-2">{children}</p>;
}

/** Shown where a record is looked up while a server reset's reload has not landed yet. */
export const REFRESHING_AFTER_RESET = "Refreshing after a server reset…";

/**
 * Persistent chrome for any screen. Signed in, the top bar, sidebar and offline banner come from
 * this tab's device (clock, link, outbox). Not signed in, they show the design fixture for `moment`.
 * Demo controls live in the Demo dock, never in the chrome.
 */
export function Frame({ moment, nav, children, drawer, strip, simulation, conflictCount = 0, banner }: {
  moment: MomentId; nav: NavKey; children: React.ReactNode; drawer?: React.ReactNode; strip?: React.ReactNode; simulation?: boolean; conflictCount?: number; banner?: React.ReactNode;
}) {
  const m = MOMENTS[moment];
  const live = useLiveChrome();
  const device = useDevice();
  const [focus, setFocus] = useStationFocus();
  // Until this device's data is confirmed as the server's current run, nothing from it is shown:
  // not the screen, not the PNR pill, not the sidebar counts (they could be from a previous run).
  const checking = !!device && !device.dataConfirmed;
  const liveOps = useLiveOps(focus);
  const ops = checking ? null : liveOps;
  const [link, setLink] = React.useState(m.link);
  const [role, setRole] = React.useState(m.viewer.role);
  const navigate = useNavigate();
  // ?sync=1 opens the sync drawer (the "See why" link on refused entries).
  const [params] = useSearchParams();
  const [syncOpen, setSyncOpen] = React.useState(() => params.get("sync") === "1");

  const chrome = live
    ? { role: live.role, link: live.link, clock: live.clock, pending: live.pending, station: live.station, deviceId: live.deviceId }
    : { role, link, clock: m.clock, pending: m.pending, station: m.viewer.node, deviceId: m.viewer.id };

  // HQ keeps its station choice as it moves between screens; signed out, the fixture moment too.
  const onNavigate = (k: NavKey) => {
    const q = new URLSearchParams();
    if (!live && k !== "incident") q.set("moment", moment);
    if (focus && chrome.role === "HQ_OPS") q.set("station", focus);
    navigate(q.size ? `${NAV_PATH[k]}?${q}` : NAV_PATH[k]);
  };

  const scope: StationScope = chrome.role === "HQ_OPS"
    ? { kind: "select", value: focus, options: STATION_NODES.map((n) => ({ id: n, label: nodeLabel(n) })), onChange: setFocus }
    : { kind: "fixed", label: chrome.station };

  const pnr = live
    ? ops ? pnrPill(ops, live.role, ops.maitriStation.nodeId) : undefined
    : m.stations[0]?.pnr && { date: m.stations[0].pnr.date.replace(/ \d{4}$/, ""), daysLeft: m.stations[0].pnr.daysLeft, href: `/decisions/${m.decisions[0]?.id ?? "DEC-01"}?moment=${moment}` };

  const offline = chrome.link === "OFFLINE";
  const offlineBanner = live
    ? <OfflineBanner node={live.station} pending={live.pending.count} oldest={live.pending.oldest} dataAge={live.othersAsOf ? `as of ${live.othersAsOf}` : "nothing received yet"} />
    : <OfflineBanner node={m.viewer.node} pending={m.pending.count} oldest={m.pending.oldest} dataAge="as of 24 Jan 09:00" />;

  return (
    <>
      <DhruvShell
        simulation={simulation}
        top={<TopBar scope={scope} pnr={pnr || undefined} clock={chrome.clock}
          sync={{ link: chrome.link, pending: chrome.pending.count, stalled: live?.stalled, syncedAt: live?.lastSync, onOpen: live ? () => setSyncOpen(true) : undefined }}
          user={live ? { role: live.role, station: live.station, deviceId: live.deviceId, onSignOut: live.signOut } : undefined} />}
        banner={banner ?? (offline ? offlineBanner : undefined)}
        sidebar={<Sidebar active={nav}
          incidentOpen={ops ? ops.openIncidents.length > 0 : live ? false : !!m.incident || moment === "hq-2501620" || moment === "hq-2501610"}
          decisionCount={ops ? ops.openDecisions.length : live ? 0 : m.decisions.length} conflictCount={ops ? ops.openConflicts.length : live ? 0 : conflictCount}
          onNavigate={onNavigate} />}
        strip={strip}
        drawer={<>{drawer}{live && syncOpen && <LiveSyncDrawer onClose={() => setSyncOpen(false)} />}</>}
      >
        {checking ? <QuietLine>Checking this device's data…</QuietLine> : children}
      </DhruvShell>
      <DemoDock role={chrome.role} link={chrome.link}
        onRoleChange={live ? live.onRoleChange : setRole} onLinkChange={live ? live.onLinkChange : setLink}
        onJump={live?.onJump} onJumpTo={live?.onJumpTo} onReset={live?.onReset} clockJumps={live?.clockJumps}
        director={live?.role === "HQ_OPS"} />
    </>
  );
}
