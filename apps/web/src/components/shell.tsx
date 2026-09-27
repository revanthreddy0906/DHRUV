import * as React from "react";
import {
  Radar, Scale, Ship, Package, Users, Map as MapIcon, Siren, ScrollText, Info, Wifi, WifiOff, Signal, RotateCcw,
  CloudUpload, FlaskConical, UserCog, TabletSmartphone, RadioTower, Clapperboard,
  Database, Network,
} from "lucide-react";
import { cx } from "./primitives";
import type { LinkStatus, Role } from "../data/types";
import { ROLE_LABEL, SYNTHETIC_BANNER } from "../data/demo";

/* ---------- Banner ---------- */

export function SyntheticDataBanner() {
  return (
    <div role="note" className="flex h-7 items-center justify-center gap-2 border-b border-line bg-elevated text-[12px] text-fg-2">
      <Info size={13} aria-hidden className="text-accent" />
      <span>{SYNTHETIC_BANNER}</span>
    </div>
  );
}

/* ---------- Demo clock (absolute jumps, v2 C5) ---------- */

export function DemoClock({ time, onJump, onReset }: { time: string; onJump?: (h: 1 | 6 | 30) => void; onReset?: () => void }) {
  return (
    <div className="flex items-center gap-1.5" aria-label="Demo clock">
      <span className="rounded-md border border-line-strong bg-bg px-2 py-1 font-mono text-[13px] font-semibold tracking-wide text-fg" aria-live="polite">{time}</span>
      {([1, 6, 30] as const).map((h) => (
        <button key={h} type="button" onClick={() => onJump?.(h)}
          className="h-7 rounded-md border border-line-strong px-1.5 font-mono text-[11px] text-fg-2 hover:border-accent/60 hover:text-fg">+{h} h</button>
      ))}
      <button type="button" onClick={onReset} className="flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] text-fg-2 hover:text-fg" aria-label="Reset demo clock to 24 Jan 08:00">
        <RotateCcw size={12} aria-hidden />Reset
      </button>
    </div>
  );
}

/* ---------- Link switch ---------- */

const LINK_META: Record<LinkStatus, { Icon: typeof Wifi; label: string; cls: string }> = {
  ONLINE: { Icon: Wifi, label: "Online", cls: "text-ok" },
  DEGRADED: { Icon: Signal, label: "Degraded", cls: "text-warn" },
  OFFLINE: { Icon: WifiOff, label: "Offline", cls: "text-bad" },
};

export function LinkSwitch({ value, onChange }: { value: LinkStatus; onChange?: (v: LinkStatus) => void }) {
  return (
    <div className="flex flex-col items-start">
      <div role="radiogroup" aria-label="Simulated link" className="flex rounded-md border border-line-strong bg-bg p-0.5">
        {(["ONLINE", "DEGRADED", "OFFLINE"] as LinkStatus[]).map((s) => {
          const m = LINK_META[s]; const on = s === value;
          return (
            <button key={s} role="radio" aria-checked={on} type="button" onClick={() => onChange?.(s)}
              className={cx("flex h-6 items-center gap-1 rounded px-1.5 text-[11px] font-medium", on ? cx("bg-elevated", m.cls) : "text-fg-2 hover:text-fg")}>
              <m.Icon size={12} aria-hidden />{m.label}
            </button>
          );
        })}
      </div>
      <span className="mt-0.5 text-[10px] uppercase tracking-wider text-fg-2">simulated link</span>
    </div>
  );
}

/** A node's link. Without `status` (another node's link, which this device cannot see) it shows only the last-heard age. */
export function LinkChip({ node, status, age }: { node: string; status?: LinkStatus; age?: string }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs">
        <RadioTower size={13} className="text-fg-2" aria-hidden />
        <span className="font-medium text-fg">{node}</span>
        <span className="font-mono text-fg-2">last heard {age ?? "at seed"}</span>
      </span>
    );
  }
  const m = LINK_META[status];
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs", status === "ONLINE" ? "border-line" : status === "DEGRADED" ? "border-warn/50" : "border-bad/50 bg-bad-tint")}>
      <m.Icon size={13} className={m.cls} aria-hidden />
      <span className="font-medium text-fg">{node}</span>
      <span className={cx("font-semibold", m.cls)}>{status}</span>
      {age && <span className="font-mono text-fg-2">· {age}</span>}
    </span>
  );
}

/* ---------- Role switcher (demo) ---------- */

export function RoleSwitcher({ role, onChange }: { role: Role; onChange?: (r: Role) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-fg-2">
      <UserCog size={14} aria-hidden />
      <span className="sr-only">Role (demo)</span>
      <select value={role} onChange={(e) => onChange?.(e.target.value as Role)}
        className="h-7 rounded-md border border-line-strong bg-bg px-1.5 text-xs font-medium text-fg">
        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
      </select>
      <span className="text-[10px] uppercase tracking-wider text-fg-2">demo</span>
    </label>
  );
}

/* ---------- Sync indicator ---------- */

export function SyncIndicator({ count, oldest, onOpen }: { count: number; oldest?: string; onOpen?: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-label={`${count} events pending sync${oldest ? `, oldest ${oldest}` : ""}. Open sync drawer`}
      className={cx("flex h-8 items-center gap-1.5 rounded-md border px-2 font-mono text-[12px]", count ? "border-warn/50 bg-warn-tint text-fg" : "border-line text-fg-2")}>
      <CloudUpload size={14} className={count ? "text-warn" : "text-fg-2"} aria-hidden />
      <span className="font-semibold">SYNC {count}</span>
      {oldest && <span className="text-fg-2">· oldest {oldest}</span>}
    </button>
  );
}

/* ---------- Top bar ---------- */

export function TopBar({ phase = "CLOSING", role, link, clock, pending, onOpenSync, onLinkChange, onRoleChange, onJump, onReset, status }: {
  phase?: string; role: Role; link: LinkStatus; clock: string; pending: { count: number; oldest?: string };
  onOpenSync?: () => void; onLinkChange?: (l: LinkStatus) => void; onRoleChange?: (r: Role) => void; onJump?: (h: 1 | 6 | 30) => void; onReset?: () => void;
  /** Right-hand status: live sync state and sign-out, or a preview tag when not signed in. */
  status?: React.ReactNode;
}) {
  return (
    <header className="flex h-14 items-center gap-4 border-b border-line bg-surface px-4">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[17px] font-bold tracking-[0.2em] text-fg">DHRUV</span>
        <span className="font-mono text-[11px] font-medium tracking-wider text-fg-2">SEASON 48 · {phase}</span>
      </div>
      <div className="ml-2 h-6 w-px bg-line" />
      <RoleSwitcher role={role} onChange={onRoleChange} />
      <LinkSwitch value={link} onChange={onLinkChange} />
      <div className="ml-auto flex items-center gap-4">
        {status}
        <DemoClock time={clock} onJump={onJump} onReset={onReset} />
        <SyncIndicator count={pending.count} oldest={pending.oldest} onOpen={onOpenSync} />
      </div>
    </header>
  );
}

/* ---------- Sidebar ---------- */

export type NavKey = "command" | "decisions" | "cargo" | "inventory" | "personnel" | "map" | "incident" | "audit" | "data" | "graph";
const NAV: { key: NavKey; label: string; Icon: typeof Radar }[] = [
  { key: "command", label: "Command", Icon: Radar },
  { key: "decisions", label: "Decisions", Icon: Scale },
  { key: "cargo", label: "Cargo", Icon: Ship },
  { key: "inventory", label: "Inventory", Icon: Package },
  { key: "personnel", label: "Personnel and Missions", Icon: Users },
  { key: "map", label: "Map", Icon: MapIcon },
  { key: "incident", label: "Incident", Icon: Siren },
  { key: "audit", label: "Audit", Icon: ScrollText },
  { key: "graph", label: "Connections", Icon: Network },
  { key: "data", label: "Where data lives", Icon: Database },
];

export function Sidebar({ active, incidentOpen, decisionCount = 0, conflictCount = 0, role, station, deviceId, link, onNavigate, onDirector }: {
  active: NavKey; incidentOpen?: boolean; decisionCount?: number; conflictCount?: number; role: Role; station: string; deviceId: string; link: LinkStatus; onNavigate?: (k: NavKey) => void;
  /** Demo only: opens the Scenario Director in this tab. */
  onDirector?: () => void;
}) {
  const m = LINK_META[link];
  return (
    <nav aria-label="Primary" className="flex w-56 shrink-0 flex-col border-r border-line bg-surface">
      <ul className="flex-1 space-y-0.5 p-2">
        {NAV.filter((n) => n.key !== "incident" || incidentOpen).map((n) => {
          const on = n.key === active; const inc = n.key === "incident";
          return (
            <li key={n.key}>
              <button type="button" aria-current={on ? "page" : undefined} onClick={() => onNavigate?.(n.key)}
                className={cx("flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-medium",
                  on ? "bg-accent-tint text-fg ring-1 ring-accent/50" : "text-fg-2 hover:bg-elevated hover:text-fg",
                  inc && "text-bad")}>
                <n.Icon size={16} aria-hidden className={inc ? "text-bad" : on ? "text-accent" : ""} />
                <span className="flex-1">{n.label}</span>
                {n.key === "decisions" && decisionCount > 0 && <span className="rounded bg-bad-tint px-1.5 font-mono text-[11px] text-bad">{decisionCount}</span>}
                {n.key === "audit" && conflictCount > 0 && <span className="rounded bg-warn-tint px-1.5 font-mono text-[11px] text-warn" title="Open conflicts">{conflictCount}</span>}
                {inc && <span className="rounded border border-bad/60 px-1 text-[10px] font-bold">OPEN</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {onDirector && (
        <div className="p-2">
          <button type="button" onClick={onDirector} className="flex h-9 w-full items-center gap-2.5 rounded-lg border border-dashed border-warn/60 px-2.5 text-left text-[12px] font-medium text-warn hover:bg-warn-tint">
            <Clapperboard size={15} aria-hidden /><span className="flex-1">Demo Director</span><span className="text-[10px] uppercase tracking-wider">demo</span>
          </button>
        </div>
      )}
      <dl className="space-y-1 border-t border-line p-3 text-[11px]">
        <div className="flex justify-between"><dt className="text-fg-2">Role</dt><dd className="font-medium text-fg">{ROLE_LABEL[role]}</dd></div>
        <div className="flex justify-between"><dt className="text-fg-2">Station</dt><dd className="text-fg">{station}</dd></div>
        <div className="flex justify-between"><dt className="text-fg-2">Device</dt><dd className="font-mono text-fg">{deviceId}</dd></div>
        <div className="flex justify-between"><dt className="text-fg-2">Link</dt><dd className={cx("flex items-center gap-1 font-semibold", m.cls)}><m.Icon size={12} aria-hidden />{link}</dd></div>
      </dl>
    </nav>
  );
}

/* ---------- Offline banner ---------- */

export function OfflineBanner({ node, pending, oldest, dataAge }: { node: string; pending: number; oldest?: string; dataAge?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-4 border-b border-warn/40 bg-warn-tint px-4 py-2">
      <WifiOff size={18} className="text-warn" aria-hidden />
      <div className="font-mono text-[12px] leading-5">
        <div className="font-bold tracking-wider text-warn">⚠ OFFLINE · {node.toUpperCase()}</div>
        <div className="text-fg">LOCAL OPERATIONS ACTIVE</div>
      </div>
      <div className="font-mono text-[12px] text-fg">{pending} EVENTS PENDING{oldest && <> · OLDEST {oldest}</>}</div>
      {dataAge && <div className="ml-auto text-xs text-fg-2">Other nodes' data is as of last sync · {dataAge}</div>}
    </div>
  );
}

/* ---------- Simulation overlay (whole view, not a badge) ---------- */

export function SimulationOverlay({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div className="relative h-full">
      {children}
      {active && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-30 dh-sim-stripes ring-2 ring-inset ring-accent/60">
          <div className="absolute bottom-12 left-4 rounded-md border border-accent/70 bg-bg/90 px-3 py-1 font-mono text-[12px] font-bold tracking-[0.25em] text-accent">
            <FlaskConical size={13} className="-mt-0.5 mr-1.5 inline" />SIMULATION · HYPOTHETICAL RESULTS
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Shell ---------- */

export function DhruvShell({ top, sidebar, banner, strip, children, drawer, simulation = false, width = "100%", height = "100%" }: {
  top: React.ReactNode; sidebar: React.ReactNode; banner?: React.ReactNode; strip?: React.ReactNode; children: React.ReactNode; drawer?: React.ReactNode; simulation?: boolean; width?: number | "100%"; height?: number | "100%";
}) {
  return (
    <div className="relative flex flex-col overflow-hidden bg-bg text-fg" style={{ width, height }}>
      {top}
      <SyntheticDataBanner />
      {banner}
      <div className="flex min-h-0 flex-1">
        {sidebar}
        <main className="relative min-w-0 flex-1">
          <SimulationOverlay active={simulation}>
            <div className="flex h-full flex-col">
              {strip}
              <div className="min-h-0 flex-1 overflow-auto">{children}</div>
            </div>
          </SimulationOverlay>
          {drawer}
        </main>
      </div>
    </div>
  );
}

export function DeviceTag({ id, kind }: { id: string; kind: string }) {
  return <span className="inline-flex items-center gap-1 font-mono text-[11px] text-fg-2"><TabletSmartphone size={12} aria-hidden />{id} · {kind}</span>;
}
