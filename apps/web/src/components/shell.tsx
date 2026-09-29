import * as React from "react";
import { Link } from "react-router-dom";
import {
  Radar, Scale, Ship, Package, Users, Map as MapIcon, Siren, ScrollText, Wifi, WifiOff, Signal,
  FlaskConical, TabletSmartphone, RadioTower, Network, LogOut, Building2, Database, Clock3,
} from "lucide-react";
import { cx } from "./primitives";
import type { LinkStatus, Role } from "../data/types";
import { ROLE_LABEL, SYNTHETIC_BANNER } from "../data/demo";

/* ---------- Banner ---------- */

export function SyntheticDataBanner() {
  return (
    <div role="note" className="flex h-7 shrink-0 items-center justify-center border-b border-line bg-elevated text-xs text-fg-2">
      {SYNTHETIC_BANNER}
    </div>
  );
}

/* ---------- Link switch ---------- */

const LINK_META: Record<LinkStatus, { Icon: typeof Wifi; label: string; cls: string }> = {
  ONLINE: { Icon: Wifi, label: "Online", cls: "text-ok" },
  DEGRADED: { Icon: Signal, label: "Degraded", cls: "text-warn" },
  OFFLINE: { Icon: WifiOff, label: "Offline", cls: "text-bad" },
};

/** Demo control: the simulated link of one device or station. Lives in the Demo dock and the Director. */
export function LinkSwitch({ value, onChange, caption = true }: { value: LinkStatus; onChange?: (v: LinkStatus) => void; caption?: boolean }) {
  return (
    <div className="flex flex-col items-start">
      <div role="radiogroup" aria-label="Simulated link" className="flex rounded-md border border-line-ctrl bg-surface p-0.5">
        {(["ONLINE", "DEGRADED", "OFFLINE"] as LinkStatus[]).map((s) => {
          const m = LINK_META[s]; const on = s === value;
          return (
            <button key={s} role="radio" aria-checked={on} type="button" onClick={() => onChange?.(s)}
              className={cx("flex h-7 items-center gap-1 rounded-sm px-2 text-xs font-medium", on ? "bg-accent-tint text-accent" : "text-fg-2 hover:text-fg")}>
              <m.Icon size={14} aria-hidden />{m.label}
            </button>
          );
        })}
      </div>
      {caption && <span className="mt-0.5 text-xs text-fg-2">Simulated link</span>}
    </div>
  );
}

/** This device's link as a word and icon: plain when Online, amber otherwise (never colour alone). */
export function LinkStatusText({ status, className }: { status: LinkStatus; className?: string }) {
  const m = LINK_META[status];
  return <span className={cx("inline-flex items-center gap-1.5", status === "ONLINE" ? "text-fg" : "text-warn", className)}><m.Icon size={16} strokeWidth={1.75} aria-hidden />{m.label}</span>;
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

/* ---------- Sync indicator ---------- */

/**
 * This device's link and outbox in one button (section 7.1): "Online · synced 20:35",
 * "Offline · 5 pending", "Degraded · 2 pending". Amber whenever the link is down or sync stalled.
 */
export function SyncIndicator({ link, pending, stalled, syncedAt, onOpen }: { link: LinkStatus; pending: number; stalled?: boolean; syncedAt?: string; onOpen?: () => void }) {
  const m = LINK_META[link];
  const warn = link !== "ONLINE" || !!stalled;
  const text = stalled ? `Sync stalled · ${pending} pending`
    : link !== "ONLINE" || pending > 0 ? `${m.label} · ${pending} pending`
    : syncedAt ? `Online · synced ${syncedAt}` : "Online";
  return (
    <button type="button" onClick={onOpen} disabled={!onOpen} aria-live="polite" aria-label={`${text}. Open the sync drawer`}
      className={cx("flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-sm tabular-nums disabled:cursor-default",
        warn ? "border-transparent bg-warn-tint text-warn" : "border-line text-fg hover:bg-elevated")}>
      <m.Icon size={16} strokeWidth={1.75} aria-hidden />{text}
    </button>
  );
}

/* ---------- User menu ---------- */

const INITIALS: Record<Role, string> = { HQ_OPS: "HQ", STATION_LEADER: "SL", FIELD_LEAD: "FL" };

/** Role, station, device and Sign out: the one home for who this tab is (section 7.1). */
export function UserMenu({ role, station, deviceId, onSignOut }: { role: Role; station: string; deviceId: string; onSignOut: () => void }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={`User menu: ${ROLE_LABEL[role]}, ${station}`}
        className="flex size-8 items-center justify-center rounded-md border border-line-strong bg-elevated text-xs font-semibold text-fg hover:border-accent/60">
        {INITIALS[role]}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-50 w-60 rounded-lg border border-line bg-surface p-3 shadow-drawer">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-fg-2">Role</dt><dd className="text-fg">{ROLE_LABEL[role]}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-fg-2">Station</dt><dd className="text-fg">{station}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-fg-2">Device</dt><dd className="font-mono text-fg">{deviceId}</dd></div>
          </dl>
          <button type="button" role="menuitem" onClick={onSignOut}
            className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-line-strong bg-elevated text-sm font-semibold text-fg hover:border-accent/60">
            <LogOut size={16} aria-hidden />Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- Top bar ---------- */

export type StationScope =
  | { kind: "select"; value?: string; options: { id: string; label: string }[]; onChange: (node: string | undefined) => void }
  | { kind: "fixed"; label: string };

/** The brand block: a copper monogram, the wordmark and what the product is. Sized to sit over the sidebar. */
export function Brand() {
  return (
    <div className="flex w-[216px] shrink-0 items-center gap-3 self-stretch border-r border-line pr-4">
      <span aria-hidden className="flex size-7 items-center justify-center rounded-sm border border-accent font-mono text-xs font-semibold text-accent">D</span>
      <span className="leading-tight">
        <span className="block font-mono text-heading font-semibold tracking-[0.24em] text-fg">DHRUV</span>
        <span className="block text-xs text-fg-2">Polar operations</span>
      </span>
    </div>
  );
}

/**
 * One row, 64 px (section 7.1): the brand block over the sidebar, station context and the season,
 * then on the right the PNR pill (only when a point of no return exists), this device's sync, the
 * read-only sim time and the user menu.
 */
export function TopBar({ scope, season, pnr, sync, clock, user }: {
  scope: StationScope;
  /** "Closing phase": the season phase this device's scenario is in (the resupply date sits on the Command Season card). */
  season?: string;
  pnr?: { date: string; daysLeft: number; href: string };
  sync: React.ComponentProps<typeof SyncIndicator>;
  clock: string;
  /** Who this tab is; a preview tag instead when the tab is not signed in. */
  user?: React.ComponentProps<typeof UserMenu>;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-line bg-chrome px-4">
      <Brand />
      {scope.kind === "select" ? (
        <select aria-label="Station" value={scope.value ?? ""} onChange={(e) => scope.onChange(e.target.value || undefined)}
          className="h-8 rounded-md border border-line-ctrl bg-surface px-2 text-sm text-fg">
          <option value="">All stations</option>
          {scope.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      ) : (
        <span className="text-sm font-semibold text-fg">{scope.label}</span>
      )}
      {/* The season also sits on the Command Season card; on narrower screens the top bar drops it rather than truncate it. */}
      <div className="min-w-0 flex-1">{season && <span className="hidden truncate text-sm text-fg-2 min-[1360px]:block" title={season}>{season}</span>}</div>
      <div aria-live="polite" className="shrink-0">
        {pnr && (
          <Link to={pnr.href} className="flex h-8 items-center whitespace-nowrap rounded-md bg-bad-tint px-2.5 text-sm font-semibold text-bad hover:underline">
            Point of no return {pnr.date} · {pnr.daysLeft} {pnr.daysLeft === 1 ? "day" : "days"}
          </Link>
        )}
      </div>
      <SyncIndicator {...sync} />
      <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm text-fg-2">
        <Clock3 size={16} strokeWidth={1.75} aria-hidden />Sim time <span className="font-mono tabular-nums text-fg">{clock}</span>
      </span>
      {user ? <UserMenu {...user} /> : (
        <Link to="/login" className="flex h-8 items-center rounded-md border border-line-strong px-2.5 text-sm text-fg-2 hover:text-fg" title="Not signed in: design fixtures, not live data">
          Preview · Sign in
        </Link>
      )}
    </header>
  );
}

/* ---------- Sidebar ---------- */

export type NavKey = "command" | "decisions" | "stations" | "cargo" | "inventory" | "personnel" | "map" | "incident" | "audit" | "data" | "graph";
const NAV: { key: NavKey; label: string; Icon: typeof Radar }[] = [
  { key: "command", label: "Command", Icon: Radar },
  { key: "incident", label: "Incident", Icon: Siren },
  { key: "decisions", label: "Decisions", Icon: Scale },
  { key: "stations", label: "Stations", Icon: Building2 },
  { key: "cargo", label: "Cargo", Icon: Ship },
  { key: "inventory", label: "Inventory", Icon: Package },
  { key: "personnel", label: "Personnel", Icon: Users },
  { key: "map", label: "Map", Icon: MapIcon },
  { key: "audit", label: "Audit", Icon: ScrollText },
];
const ANALYSIS: { key: NavKey; label: string; Icon: typeof Radar }[] = [
  { key: "graph", label: "Connections", Icon: Network },
  { key: "data", label: "Where data lives", Icon: Database },
];

/**
 * 232 px on the chrome ground, in two groups, no footer (section 7.4): who this tab is lives in the user menu, its link in the sync
 * indicator. Badges only for what needs action. The Incident item shows only while one is open.
 */
export function Sidebar({ active, incidentOpen, decisionCount = 0, conflictCount = 0, onNavigate }: {
  active: NavKey; incidentOpen?: boolean; decisionCount?: number; conflictCount?: number; onNavigate?: (k: NavKey) => void;
}) {
  const item = (n: (typeof NAV)[number]) => {
    const on = n.key === active; const inc = n.key === "incident";
    const badge = n.key === "decisions" ? decisionCount : n.key === "audit" ? conflictCount : 0;
    return (
      <li key={n.key}>
        <button type="button" aria-current={on ? "page" : undefined} onClick={() => onNavigate?.(n.key)}
          className={cx("flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm",
            on ? "bg-accent-tint font-semibold text-accent" : inc ? "font-semibold text-bad hover:bg-surface" : "text-fg hover:bg-surface")}>
          <n.Icon size={16} strokeWidth={1.75} aria-hidden />
          <span className="flex-1">{n.label}</span>
          {badge > 0 && <span className="text-xs font-semibold tabular-nums text-fg" aria-label={n.key === "decisions" ? `${badge} pending` : `${badge} open conflicts`}>{badge}</span>}
        </button>
      </li>
    );
  };
  return (
    <nav aria-label="Primary" className="flex w-[232px] shrink-0 flex-col overflow-y-auto border-r border-line bg-chrome px-3 py-4">
      <p className="px-2.5 pb-1.5 text-xs text-fg-2">Operations</p>
      <ul className="space-y-0.5">{NAV.filter((n) => n.key !== "incident" || incidentOpen).map(item)}</ul>
      <div className="mx-2.5 my-4 border-t border-line" />
      <p className="px-2.5 pb-1.5 text-xs text-fg-2">Analysis</p>
      <ul className="space-y-0.5">{ANALYSIS.map(item)}</ul>
    </nav>
  );
}

/* ---------- Offline banner ---------- */

/**
 * One amber line when this device is Offline (section 7.5): "Offline. Local operations active.
 * 5 events pending, oldest 6 h 50 m." How current other devices' data is sits at the right.
 */
export function OfflineBanner({ pending, oldest, dataAge }: { node?: string; pending: number; oldest?: string; dataAge?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex h-8 shrink-0 items-center gap-2 border-b border-warn/40 bg-warn-tint px-4 text-sm text-fg">
      <WifiOff size={16} strokeWidth={1.75} className="text-warn" aria-hidden />
      <span>
        <span className="font-semibold text-warn">Offline.</span> Local operations active.
        {pending > 0 && <> {pending} {pending === 1 ? "event" : "events"} pending{oldest && <>, oldest <span className="tabular-nums">{oldest}</span></>}.</>}
      </span>
      {dataAge && <span className="ml-auto text-xs text-fg-2">Other devices' data: {dataAge}</span>}
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
          <div className="absolute bottom-12 left-4 rounded-md border border-accent/70 bg-surface px-3 py-1 text-sm font-semibold text-accent">
            <FlaskConical size={13} className="-mt-0.5 mr-1.5 inline" />Simulation: hypothetical results
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
  return <span className="inline-flex items-center gap-1 font-mono text-xs text-fg-2"><TabletSmartphone size={12} aria-hidden />{id} · {kind}</span>;
}
