import * as React from "react";
import { KeyRound, Monitor, Tablet, Smartphone, TriangleAlert, Pencil, Plus, ClipboardCheck, ScanEye } from "lucide-react";
import {
  MOMENTS, HERO_TRACE, FRESHNESS_TRACE_HQ_2501600, LEVERS, LEVERS_25JAN, OPTIONS_AFTER_SLIP, OPTIONS_HQ_2501600, OPTIONS_HQ_2501620,
  CARGO_START, CARGO_SLIP, CARGO_2600900, INVENTORY_START, INVENTORY_SLIP, ROLE_COVERAGE, MISSIONS, NAMED_PEOPLE, ASSETS, SK2_CONFLICT,
  EV, SYSTEM_EVENTS, OUTBOX_BEAT9, SYNTHETIC_BANNER, DEVICES, ROUTE_DISTANCES, type MomentId,
} from "../data/demo";
import { Frame } from "./Frame";
import { DecisionDetail } from "../components/decisions";
import { LegTimeline } from "../components/ops";
import { InventoryRow, RoleCoverage, MissionRow } from "../components/ops";
import { MapPanel, SchematicMap, LocalAreaMap } from "../components/map";
import { IncidentPanel } from "../components/incident";
import { AuditTable } from "../components/audit";
import { ReviewQueue, ConflictResolver, SyncDrawer } from "../components/sync";
import { Button, Card, SectionHeader, Tag, cx, FreshnessChip, StateBadge } from "../components/primitives";
import { FieldHome } from "../components/field";
import { DirectorPanel } from "../components/director";
import { CommandCenter } from "./CommandCenter";

const Page = ({ title, sub, actions, children }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) => (
  <div className="space-y-4 p-5">
    <div className="flex items-end gap-3"><div><h1 className="text-xl font-semibold text-fg">{title}</h1>{sub && <p className="mt-0.5 text-sm text-fg-2">{sub}</p>}</div><div className="ml-auto flex gap-2">{actions}</div></div>
    {children}
  </div>
);

/* ---------- Decision Detail ---------- */

export function DecisionDetailScreen({ moment = "hq-2501600" }: { moment?: "slip" | "hq-2501600" | "hq-2501620" | "maitri-2501600" }) {
  const opts = moment === "hq-2501600" ? OPTIONS_HQ_2501600 : moment === "hq-2501620" ? OPTIONS_HQ_2501620 : OPTIONS_AFTER_SLIP;
  const at25 = moment !== "slip";
  const trace = moment === "hq-2501600" ? [...HERO_TRACE.slice(0, 7), ...FRESHNESS_TRACE_HQ_2501600, ...HERO_TRACE.slice(7)] : HERO_TRACE;
  return (
    <Frame moment={moment} nav="decisions">
      <DecisionDetail id="DEC-01" title="Maitri fuel below required threshold" station="Maitri"
        current={{ state: "RED", ratio: 0.697, text: "Fuel below required threshold" }}
        trigger="LEG_DELAYED C-104 L2 · ETA 2 Feb → 7 Feb · feeder vessel delayed · HQ-WEB-01 · 24 Jan 08:10"
        pnr={{ date: "3 Feb 2027", daysLeft: at25 ? 9 : 10 }} trace={trace} levers={at25 ? LEVERS_25JAN : LEVERS} options={opts}
        role={MOMENTS[moment].viewer.role} today={at25 ? "25 Jan" : "24 Jan"} />
    </Frame>
  );
}

/* ---------- Cargo ---------- */

export function CargoScreen({ state = "slip" }: { state?: "start" | "slip" | "uncertain" }) {
  const data = state === "start" ? CARGO_START : state === "slip" ? CARGO_SLIP : CARGO_2600900;
  const moment: MomentId = state === "start" ? "start" : state === "slip" ? "slip" : "hq-2600900";
  const [edit, setEdit] = React.useState(state === "start");
  return (
    <Frame moment={moment} nav="cargo">
      <Page title="Cargo" sub={<>Inbound to Maitri · MV Ice Star load cutoff <span className="font-mono">{state === "uncertain" ? "7 Feb (held)" : "4 Feb"}</span> · departs {state === "uncertain" ? "9 Feb" : "6 Feb"} · closing 28 Feb</>}
        actions={<Button icon={<Pencil size={14} />} onClick={() => setEdit(true)}>Edit ETA</Button>}>
        {edit && state === "start" && (
          <Card className="border-accent/60">
            <SectionHeader title="Edit ETA · C-104 L2 Mumbai → Cape Town · consequence preview" />
            <div className="flex flex-wrap items-center gap-4">
              <label className="text-xs text-fg-2">New ETA <input defaultValue="7 Feb" className="ml-2 h-8 w-24 rounded-md border border-line-ctrl bg-bg px-2 font-mono text-sm text-fg" /></label>
              <label className="text-xs text-fg-2">Reason <input defaultValue="feeder vessel delayed" className="ml-2 h-8 w-56 rounded-md border border-line-ctrl bg-bg px-2 text-sm text-fg" /></label>
              <div className="flex items-center gap-2 rounded-md border border-bad/50 bg-bad-tint px-3 py-1.5 text-[12px] text-fg">
                <TriangleAlert size={14} className="text-bad" aria-hidden />Preview: 7 Feb &gt; cutoff 4 Feb · C-104 excluded · Maitri Fuel 1.0606 → <b className="font-mono text-bad">0.697 RED</b> · PNR 3 Feb
              </div>
              <Button variant="primary">Record LEG_DELAYED</Button><Button variant="ghost" onClick={() => setEdit(false)}>Cancel</Button>
            </div>
          </Card>
        )}
        {data.map((s) => <LegTimeline key={s.id} s={s} today={state === "uncertain" ? "26 Jan" : "24 Jan"} originalEta={s.id === "C-104" ? "2 Feb" : undefined} />)}
        <p className="text-[11px] text-fg-2">Cargo-leg freshness is shown as a badge. When an ETA report is STALE or worse and slack ≤ 2 d, R17 marks the inbound UNCERTAIN and the band's low side excludes it.</p>
      </Page>
    </Frame>
  );
}

/* ---------- Inventory ---------- */

export function InventoryScreen({ state = "slip", role = "STATION_LEADER" }: { state?: "start" | "slip" | "empty"; role?: "STATION_LEADER" | "HQ_OPS" }) {
  const rows = state === "start" ? INVENTORY_START : state === "slip" ? INVENTORY_SLIP : [];
  const sl = role === "STATION_LEADER";
  return (
    <Frame moment={state === "start" ? "start" : "slip"} nav="inventory">
      <Page title="Inventory · Maitri" sub="Ratio = (stock + feasible inbound) / requirement to 20 Nov with reserve. Days of cover shown for burn items."
        actions={<>
          <Button icon={<ClipboardCheck size={14} />} disabledReason={sl ? undefined : "Stock counts are recorded by the Station Leader"}>Record count</Button>
          <Button icon={<Plus size={14} />} disabledReason={sl ? undefined : "Stock issues are recorded by the Station Leader"}>Record issue</Button>
        </>}>
        <Card pad="none" className="overflow-hidden">
          <table className="w-full">
            <thead className="bg-elevated text-left text-[10px] uppercase tracking-wider text-fg-2">
              <tr>{["Item", "Stock", "Inbound (feasible)", "Required", "Ratio", "Days of cover", "Count freshness"].map((h, i) => <th key={h} className={cx("px-3 py-2 font-semibold", i === 1 || i === 3 ? "text-right" : "")}>{h}</th>)}</tr>
            </thead>
            <tbody className="[&_td:first-child]:pl-3">
              {rows.map((i) => <InventoryRow key={i.id} i={i} expanded={i.id === "INV-DSL" || i.id === "INV-FOOD"} />)}
            </tbody>
          </table>
          {rows.length === 0 && <p className="p-8 text-center text-sm text-fg-2">No inventory items for this station in the seed. Nothing to evaluate; readiness for these dimensions shows unknown, not zero.</p>}
        </Card>
      </Page>
    </Frame>
  );
}

/* ---------- Personnel & missions ---------- */

export function PersonnelScreen({ state = "slip", role = "STATION_LEADER" }: { state?: "start" | "slip"; role?: "STATION_LEADER" | "FIELD_LEAD" | "HQ_OPS" }) {
  const canEdit = role !== "FIELD_LEAD";
  return (
    <Frame moment={state} nav="personnel">
      <Page title="Personnel and Missions · Maitri" sub="24 winterers. Role coverage: GREEN needs need + 1; AMBER at need; RED below need (R05).">
        <section><SectionHeader title="Critical role coverage" /><RoleCoverage roles={ROLE_COVERAGE} /></section>
        <div className="grid grid-cols-[1.6fr_1fr] gap-4">
          <Card pad="none" className="overflow-hidden">
            <div className="px-4 pt-3"><SectionHeader title="Missions" /></div>
            <table className="w-full"><tbody className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-4">
              {MISSIONS[state].map((m) => <MissionRow key={m.id} m={m} canEdit={canEdit} reason="Field Leads set status only for their own team" />)}
            </tbody></table>
          </Card>
          <Card>
            <SectionHeader title="Named people (seed)" />
            <ul className="divide-y divide-line text-[13px]">{NAMED_PEOPLE.map((p) => <li key={p.name} className="flex justify-between py-1.5"><span className="text-fg">{p.name}</span><span className="text-fg-2">{p.role}</span></li>)}</ul>
            <p className="mt-2 text-[11px] text-fg-2">Other winterers are generated in the seed and not named here.</p>
          </Card>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-fg-2"><Tag tone="amber">double-assigned</Tag>badge appears when a person is assigned to overlapping missions; dependent decisions are blocked until resolved in the Review queue.</div>
      </Page>
    </Frame>
  );
}

/* ---------- Map ---------- */

export function MapScreen({ moment = "maitri-2501600" }: { moment?: MomentId }) {
  const m = MOMENTS[moment];
  return (
    <Frame moment={moment} nav="map">
      <Page title="Map" sub="Positions are always last known with their age. Nothing here is live.">
        <div className="grid grid-cols-[1.3fr_1fr] gap-4">
          <MapPanel><SchematicMap width={640} height={470} maitriState={m.stations[0].state === "RED" ? "RED" : "GREEN"} /></MapPanel>
          <div className="space-y-4">
            <MapPanel><LocalAreaMap /></MapPanel>
            <Card>
              <SectionHeader title="Assets · Maitri" />
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px]">
                {ASSETS.map((a) => {
                  const down = a.id === "SK-2" && moment === "maitri-2501600";
                  return <li key={a.id} className="flex justify-between"><span className="text-fg">{a.id}</span><span className={down ? "font-bold text-bad" : "text-fg-2"}>{down ? "DOWN · track fault" : a.type}</span></li>;
                })}
              </ul>
            </Card>
            <Card><SectionHeader title="Route distances" /><ul className="font-mono text-[11px] text-fg-2">{Object.entries(ROUTE_DISTANCES).map(([k, v]) => <li key={k} className="flex justify-between"><span>{k}</span><span className="text-fg">{v}</span></li>)}</ul></Card>
          </div>
        </div>
      </Page>
    </Frame>
  );
}

/* ---------- Incident ---------- */

export function IncidentScreen({ conflictOpen = false }: { conflictOpen?: boolean }) {
  return (
    <Frame moment="maitri-2501600" nav="incident">
      <div className="p-5"><IncidentPanel conflictOpen={conflictOpen} /></div>
    </Frame>
  );
}

/* ---------- Audit ---------- */

export const AUDIT_ROWS_2501610 = [
  { ...SYSTEM_EVENTS.conflict, recordedAtServer: "25 Jan 16:10" },
  { ...EV.incident, recordedAtServer: "25 Jan 16:10" },
  { ...EV.checkin, recordedAtServer: "25 Jan 16:10" },
  { ...EV.hqSk2 },
  { ...EV.maitriNote, recordedAtServer: "25 Jan 16:10" },
  { ...EV.maitriSk2, recordedAtServer: "25 Jan 16:10" },
  { ...EV.maitriCount, recordedAtServer: "25 Jan 16:10" },
  { ...EV.maitriIssue, recordedAtServer: "25 Jan 16:10" },
  { ...SYSTEM_EVENTS.proposed, recordedAtServer: "24 Jan 08:11" },
  { ...EV.legDelayed },
];

export function AuditScreen({ emptyFilter = false }: { emptyFilter?: boolean }) {
  const [resolving, setResolving] = React.useState(true);
  return (
    <Frame moment="hq-2501610" nav="audit" conflictCount={1}>
      <Page title="Audit" sub="Append-only event log as known to HQ-WEB-01 after the 25 Jan 16:10 sync. Events are never edited; corrections are new events.">
        <div className="grid grid-cols-2 gap-4">
          <ReviewQueue conflicts={[SK2_CONFLICT]} onReview={() => setResolving(true)} />
          {resolving && <div className="pt-7"><ConflictResolver c={SK2_CONFLICT} onResolve={() => setResolving(false)} /></div>}
        </div>
        <AuditTable rows={AUDIT_ROWS_2501610} initialFilter={emptyFilter ? { device: "FT3-TAB-01", role: "HQ_OPS", type: "", entity: "", tier: "" } : undefined} />
      </Page>
    </Frame>
  );
}

/* ---------- Sync drawer at beat 9 ---------- */

/** Maitri tablet at 25 Jan 16:00: link OFFLINE, queue grows, nothing leaves. */
export function SyncScreen({ link = "OFFLINE", stalled }: { link?: "DEGRADED" | "OFFLINE" | "ONLINE"; stalled?: boolean }) {
  return (
    <div className="relative">
      <CommandCenter moment="maitri-2501600" />
      <div className="absolute inset-0 top-[84px]">
        <SyncDrawer link={link} device="MAITRI-TAB-01" queue={OUTBOX_BEAT9} oldest={link === "OFFLINE" ? "6 h 50 m" : "7 h 00 m"} autoDrain={link !== "OFFLINE"} stalled={stalled ? OUTBOX_BEAT9[4].deviceSeq : undefined} />
      </div>
    </div>
  );
}

/* ---------- Login ---------- */

export function LoginScreen({ error = false }: { error?: boolean }) {
  const [sel, setSel] = React.useState(1);
  const icons = [Monitor, Tablet, Smartphone];
  return (
    <div className="flex min-h-screen w-full flex-col bg-bg text-fg">
      <div role="note" className="flex h-7 items-center justify-center border-b border-line bg-elevated text-[12px] text-fg-2">{SYNTHETIC_BANNER}</div>
      <div className="flex flex-1 items-center justify-center">
        <div className="w-[760px]">
          <div className="mb-8">
            <div className="font-mono text-2xl font-bold tracking-[0.25em]">DHRUV</div>
            <p className="mt-2 text-sm text-fg-2">Know what a delay breaks, by when to act, and how far to trust the data.</p>
          </div>
          <div role="radiogroup" aria-label="Role" className="grid grid-cols-3 gap-3">
            {DEVICES.map((d, i) => {
              const Icon = icons[i];
              return (
                <button key={d.id} role="radio" aria-checked={sel === i} type="button" onClick={() => setSel(i)}
                  className={cx("rounded-xl border p-4 text-left", sel === i ? "border-accent bg-accent-tint ring-1 ring-accent/50" : "border-line bg-surface hover:border-line-strong")}>
                  <Icon size={20} className={sel === i ? "text-accent" : "text-fg-2"} aria-hidden />
                  <div className="mt-3 text-base font-semibold">{d.roleLabel}</div>
                  <div className="text-xs text-fg-2">{d.node} · {d.device}</div>
                  <div className="mt-2 font-mono text-[11px] text-fg-2">{d.id}</div>
                </button>
              );
            })}
          </div>
          <div className="mt-5 flex items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-fg-2">Device ID<input readOnly value={DEVICES[sel].id} className="h-10 w-48 rounded-lg border border-line-ctrl bg-surface px-3 font-mono text-sm text-fg" /></label>
            <label className="flex flex-col gap-1 text-xs text-fg-2">Station<input readOnly value={DEVICES[sel].node} className="h-10 w-40 rounded-lg border border-line-ctrl bg-surface px-3 text-sm text-fg" /></label>
            <label className="flex flex-col gap-1 text-xs text-fg-2">PIN<input type="password" defaultValue={error ? "••••••••" : ""} aria-invalid={error} className={cx("h-10 w-44 rounded-lg border bg-surface px-3 font-mono text-sm text-fg", error ? "border-bad" : "border-line-ctrl")} /></label>
            <Button variant="primary" size="md" icon={<KeyRound size={15} />} className="h-10">Enter</Button>
          </div>
          {error && <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-fg"><TriangleAlert size={15} className="text-bad" aria-hidden />Wrong PIN for {DEVICES[sel].id}. Nothing was changed. Check the PIN for this device and try again.</p>}
          <p className="mt-6 text-[11px] text-fg-2">Demo login: role, device ID and fixed PIN. Production would need real authentication.</p>
        </div>
      </div>
    </div>
  );
}

/* ---------- Field & Director ---------- */

export function FieldScreen({ offline = false }: { offline?: boolean }) {
  return <div className="flex gap-6 bg-bg p-6"><FieldHome offline={offline} pending={offline ? 1 : 0} oldest={offline ? "0 m" : undefined} /></div>;
}

export function DirectorScreen() {
  return <div className="bg-bg p-6"><DirectorPanel done={2} /></div>;
}

/* ---------- State gallery helpers ---------- */

export function FreshnessStates() {
  return (
    <div className="flex flex-wrap gap-2 bg-bg p-4">
      <FreshnessChip cls="FRESH" label="Fuel count 4 h old" />
      <FreshnessChip cls="AGING" label="Fuel count 36 h old" />
      <FreshnessChip cls="STALE" label="Medical count 3 d 6 h old" />
      <FreshnessChip cls="CRITICAL" label="Maitri link last contact 31 h ago" />
      <StateBadge state="RED" context="Fuel below required threshold" />
      <StateBadge state="AMBER" context="Could be AMBER" />
      <StateBadge state="GREEN" context="All dimensions within thresholds" />
      <span className="inline-flex items-center gap-1 text-xs text-fg-2"><ScanEye size={13} aria-hidden />Verify before acting.</span>
    </div>
  );
}
