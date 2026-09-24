import * as React from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Eye } from "lucide-react";
import { DhruvShell, TopBar, Sidebar, OfflineBanner, type NavKey } from "../components/shell";
import { MOMENTS, type MomentId } from "../data/demo";
import { useLiveChrome, type LiveChrome } from "../live/chrome";
import { useLiveOps } from "../live/ops";
import { LiveSyncDrawer } from "../live/SyncLive";

export const NAV_PATH: Record<NavKey, string> = {
  command: "/command", decisions: "/decisions/DEC-01", cargo: "/cargo", inventory: "/inventory",
  personnel: "/personnel", map: "/map", incident: "/incident", audit: "/audit",
};

function LiveStatus({ live }: { live: LiveChrome }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-fg-2">
      {live.stalled ? <span className="font-semibold text-bad">SYNC STALLED</span> : live.lastSync && <span className="font-mono">synced {live.lastSync}</span>}
      <button type="button" onClick={live.signOut} className="flex h-7 items-center gap-1 rounded-md px-1.5 hover:text-fg" aria-label={`Sign out ${live.deviceId}`}>
        <LogOut size={13} aria-hidden />Sign out
      </button>
    </div>
  );
}

const PreviewTag = () => (
  <span className="flex items-center gap-1 rounded border border-line-strong px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fg-2" title="Not signed in: design fixtures, not live data">
    <Eye size={12} aria-hidden />Preview · not signed in
  </span>
);

/**
 * Persistent chrome for any screen. Signed in, the top bar, sidebar and offline banner come from
 * this tab's device (clock, link, outbox). Not signed in, they show the design fixture for `moment`.
 * Screen content still comes from the moment until F2.
 */
export function Frame({ moment, nav, children, drawer, strip, simulation, conflictCount = 0, banner }: {
  moment: MomentId; nav: NavKey; children: React.ReactNode; drawer?: React.ReactNode; strip?: React.ReactNode; simulation?: boolean; conflictCount?: number; banner?: React.ReactNode;
}) {
  const m = MOMENTS[moment];
  const live = useLiveChrome();
  const ops = useLiveOps();
  const [link, setLink] = React.useState(m.link);
  const [role, setRole] = React.useState(m.viewer.role);
  const navigate = useNavigate();
  const [syncOpen, setSyncOpen] = React.useState(false);
  const onNavigate = (k: NavKey) => navigate(live || k === "incident" ? NAV_PATH[k] : `${NAV_PATH[k]}?moment=${moment}`);

  const chrome = live
    ? { role: live.role, link: live.link, clock: live.clock, phase: live.phase, pending: live.pending, station: live.station, deviceId: live.deviceId }
    : { role, link, clock: m.clock, phase: m.phase, pending: m.pending, station: m.viewer.node, deviceId: m.viewer.id };
  const offline = chrome.link === "OFFLINE";
  const offlineBanner = live
    ? <OfflineBanner node={live.station} pending={live.pending.count} oldest={live.pending.oldest} dataAge={live.othersAsOf ? `newest from other devices ${live.othersAsOf}` : "nothing received from other devices yet"} />
    : <OfflineBanner node={m.viewer.node} pending={m.pending.count} oldest={m.pending.oldest} dataAge="HQ data as of 24 Jan 09:00" />;

  return (
    <DhruvShell
      simulation={simulation}
      top={<TopBar role={chrome.role} link={chrome.link} clock={chrome.clock} phase={chrome.phase} pending={chrome.pending}
        onRoleChange={live ? live.onRoleChange : setRole} onLinkChange={live ? live.onLinkChange : setLink}
        onJump={live?.onJump} onReset={live?.onReset} onOpenSync={live ? () => setSyncOpen(true) : undefined}
        status={live ? <LiveStatus live={live} /> : <PreviewTag />} />}
      banner={banner ?? (offline ? offlineBanner : undefined)}
      sidebar={<Sidebar active={nav}
        incidentOpen={ops ? ops.openIncidents.length > 0 : !!m.incident || moment === "hq-2501620" || moment === "hq-2501610"}
        decisionCount={ops ? ops.openDecisions.length : m.decisions.length} conflictCount={ops ? ops.openConflicts.length : conflictCount}
        role={chrome.role} station={chrome.station} deviceId={chrome.deviceId} link={chrome.link} onNavigate={onNavigate}
        onDirector={live?.role === "HQ_OPS" ? () => navigate("/director") : undefined} />}
      strip={strip}
      drawer={<>{drawer}{live && syncOpen && <LiveSyncDrawer onClose={() => setSyncOpen(false)} />}</>}
    >
      {children}
    </DhruvShell>
  );
}
