import * as React from "react";
import { useNavigate } from "react-router-dom";
import { DhruvShell, TopBar, Sidebar, OfflineBanner, type NavKey } from "../components/shell";
import { MOMENTS, type MomentId } from "../data/demo";

export const NAV_PATH: Record<NavKey, string> = {
  command: "/command", decisions: "/decisions/DEC-01", cargo: "/cargo", inventory: "/inventory",
  personnel: "/personnel", map: "/map", incident: "/incident", audit: "/audit",
};

/** Persistent chrome for any screen at a demo moment. */
export function Frame({ moment, nav, children, drawer, strip, simulation, conflictCount = 0, banner }: {
  moment: MomentId; nav: NavKey; children: React.ReactNode; drawer?: React.ReactNode; strip?: React.ReactNode; simulation?: boolean; conflictCount?: number; banner?: React.ReactNode;
}) {
  const m = MOMENTS[moment];
  const [link, setLink] = React.useState(m.link);
  const [role, setRole] = React.useState(m.viewer.role);
  const offline = m.link === "OFFLINE";
  const navigate = useNavigate();
  const onNavigate = (k: NavKey) => navigate(k === "incident" ? NAV_PATH[k] : `${NAV_PATH[k]}?moment=${moment}`);
  return (
    <DhruvShell
      simulation={simulation}
      top={<TopBar role={role} onRoleChange={setRole} link={link} onLinkChange={setLink} clock={m.clock} phase={m.phase} pending={m.pending} />}
      banner={banner ?? (offline ? <OfflineBanner node={m.viewer.node} pending={m.pending.count} oldest={m.pending.oldest} dataAge="HQ data as of 24 Jan 09:00" /> : undefined)}
      sidebar={<Sidebar active={nav} incidentOpen={!!m.incident || moment === "hq-2501620" || moment === "hq-2501610"} decisionCount={m.decisions.length} conflictCount={conflictCount}
        role={m.viewer.role} station={m.viewer.node} deviceId={m.viewer.id} link={m.link} onNavigate={onNavigate} />}
      strip={strip}
      drawer={drawer}
    >
      {children}
    </DhruvShell>
  );
}
