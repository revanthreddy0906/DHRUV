import * as React from "react";
import { Siren, MapPin, Plane, Truck, Ban, RadioTower, GitMerge, Printer, ArrowUpRight, ListChecks } from "lucide-react";
import { INCIDENT, SK2_CONFLICT } from "../data/demo";
import { cx, Button, Checkbox, FreshnessChip, SectionHeader, Tag, PriorityTierBadge, Card } from "./primitives";
import { LocalAreaMap, MapPanel } from "./map";

export type Inc = Omit<typeof INCIDENT, "lastConfirmed"> & { lastConfirmed: (typeof INCIDENT)["lastConfirmed"] & { ageHours?: number }; /** Incidents that track no people (a ship aground) say what they are instead of "overdue". */ headline?: string };
export interface SnapshotRow { k: string; v: React.ReactNode; age: string; tone?: "red" | "amber" }

export function PositionCard({ inc }: { inc: Inc }) {
  const p = inc.lastConfirmed;
  return (
    <div className="rounded-lg border border-warn/50 bg-surface p-4">
      <div className="flex items-center gap-2"><MapPin size={15} className="text-warn" aria-hidden /><span className="text-xs font-semibold text-fg-2">Last confirmed position</span></div>
      <p className="mt-2 text-title font-semibold text-fg">Last confirmed {p.age} ago</p>
      <p className="mt-1 font-mono text-sm text-fg">{p.lat}, {p.lon} · {p.at} · {p.distance}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <FreshnessChip cls={p.freshness} label={`Position ${p.age} old`} />
        {p.circleKm > 0 && <Tag tone="amber">Uncertainty circle {p.circleKm} km = min({p.ageHours !== undefined ? p.ageHours.toFixed(1) : p.age.replace(" h", "")} h × 3 km/h, 30 km)</Tag>}
      </div>
      <p className="mt-2 text-xs text-fg-2">{inc.schedule}</p>
    </div>
  );
}

export function ResponderRow({ r, conflictOpen }: { r: Inc["responders"][number]; conflictOpen?: boolean }) {
  const Icon = r.id === "HX-1" ? Plane : Truck;
  const excluded = r.excluded;
  return (
    <li className={cx("rounded-lg border p-3", excluded ? "border-dashed border-line opacity-70" : "border-line bg-surface")}>
      <div className="flex items-center gap-2">
        <Icon size={15} className={excluded ? "text-fg-2" : "text-accent"} aria-hidden />
        <span className="font-mono text-sm font-bold text-fg">{r.id}</span>
        <span className="text-xs text-fg-2">{r.type}</span>
        {excluded ? (
          <Tag tone="red" className="ml-auto"><Ban size={11} aria-hidden />{conflictOpen ? "CONFLICT · kept DOWN · excluded" : `${r.status} · excluded`}</Tag>
        ) : <span className="ml-auto font-mono text-xs text-fg">{r.distance} · {r.eta}</span>}
      </div>
      <p className="mt-1.5 text-xs text-fg-2">{conflictOpen && excluded ? `Excluded while the ${r.id} status conflict is open (conservative value kept). Resolve in the Review queue.` : r.autonomy}</p>
      {!excluded && <p className="mt-0.5 text-xs text-fg-2">Asset status age unknown until verified. Verify before dispatch.</p>}
    </li>
  );
}

export function VerifyChecklist({ items, onChange }: { items: string[]; onChange?: (done: boolean[]) => void }) {
  const [done, setDone] = React.useState(items.map(() => false));
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <SectionHeader title="Verify before dispatch" meta={<span className="text-xs tabular-nums text-fg-2">{done.filter(Boolean).length} of {items.length} checked on this device</span>} />
      <div className="space-y-2">
        {items.map((it, i) => <Checkbox key={it} checked={done[i]} label={it} onChange={(v) => { const n = [...done]; n[i] = v; setDone(n); onChange?.(n); }} />)}
      </div>
    </div>
  );
}

export function SnapshotTable({ inc, conflictOpen, rows: liveRows }: { inc: Inc; conflictOpen?: boolean; rows?: SnapshotRow[] }) {
  const rows: SnapshotRow[] = liveRows ?? [
    { k: "People involved", v: inc.people.map((p) => `${p.name} (${p.role})`).join(", "), age: "status 9 h", tone: "amber" },
    { k: "Mission", v: `${inc.team} · ${inc.mission}`, age: "plan · seed" },
    { k: "Last confirmed position", v: `${inc.lastConfirmed.lat}, ${inc.lastConfirmed.lon} · circle ${inc.lastConfirmed.circleKm} km`, age: `${inc.lastConfirmed.age} · STALE`, tone: "amber" },
    ...inc.medical.map((m) => ({ k: "Medical", v: m.text, age: m.age, tone: m.age.includes("STALE") ? ("amber" as const) : undefined })),
    { k: "Nearest capable", v: "HX-1 helicopter · ≈ 21.5 km · ≈ 11 min at 120 km/h", age: "status age unknown" },
    { k: "Excluded", v: conflictOpen ? "SK-2 · conflict open, DOWN kept" : "SK-2 · DOWN, track fault (this device, not yet synced)", age: "24 Jan 09:20 · 30 h 40 m", tone: "red" },
    { k: "Comms", v: inc.comms, age: "31 h · CRITICAL", tone: "red" },
    { k: "Mission state", v: "F-27 AT_RISK (Fuel RED)", age: "engine · now" },
  ];
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Incident snapshot. Every line shows its age.</caption>
      <thead><tr className="text-left text-xs text-fg-2"><th className="pb-1.5 font-semibold">Element</th><th className="pb-1.5 font-semibold">Value</th><th className="pb-1.5 text-right font-semibold">Age</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={cx("border-t border-line align-top", r.tone === "amber" && "dh-stale not-italic", r.tone === "red" && "bg-bad-tint/60")}>
            <td className="w-36 py-1.5 pr-3 text-fg-2">{r.k}</td>
            <td className="py-1.5 pr-3 text-fg" style={{ fontStyle: "normal" }}>{r.v}</td>
            <td className={cx("whitespace-nowrap py-1.5 text-right font-mono text-xs", r.tone === "red" ? "text-bad" : r.tone === "amber" ? "text-warn" : "text-fg-2")} style={{ fontStyle: "normal" }}>{r.age}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Emergency mode centre panel (also the full Incident screen body). */
export function IncidentPanel({ inc = INCIDENT, conflictOpen, compact, onEscalate, onPrint, canEscalate = true, rows, map, conflicts, status, escalated }: {
  inc?: Inc; conflictOpen?: boolean; compact?: boolean; onEscalate?: () => void; onPrint?: () => void; canEscalate?: boolean;
  /** Live snapshot rows; without them the design fixture rows are shown. */
  rows?: SnapshotRow[];
  /** Live map; without it the design's local-area drawing is shown. */
  map?: React.ReactNode;
  /** Live conflict lines ("SK-2 status DOWN (MAITRI-TAB-01) vs OK (DIRECTOR) · DOWN kept"). */
  conflicts?: string[];
  status?: string;
  escalated?: boolean;
}) {
  const conflictLines = conflicts ?? (conflictOpen ? [`${SK2_CONFLICT.entity} status ${SK2_CONFLICT.contenders.map((c) => `${c.value} (${c.device})`).join(" vs ")} · ${SK2_CONFLICT.kept} kept`] : []);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-bad/60 bg-bad-tint px-4 py-3" role="alert">
        <Siren size={20} className="text-bad" aria-hidden />
        <div>
          <div className="font-mono text-sm font-bold text-fg">{inc.id} · {status ?? "OPEN"} · {inc.headline ?? `${inc.team} overdue`}</div>
          <div className="text-xs text-fg-2">Opened {inc.openedAt} by {inc.openedBy}. DHRUV does not send distress signals; it assembles the operational picture.</div>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="danger" icon={<ArrowUpRight size={15} />} onClick={onEscalate} disabled={escalated} disabledReason={canEscalate ? undefined : "Only HQ Ops or the Station Leader can escalate"}>{escalated ? "Escalated" : "Escalate"}</Button>
          <Button icon={<Printer size={15} />} onClick={onPrint}>Print brief</Button>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-bad/40 px-3 py-2 text-xs text-fg"><RadioTower size={14} className="text-bad" aria-hidden />{inc.comms}</div>
      {conflictLines.map((line) => (
        <div key={line} className="flex items-center gap-2 rounded-lg border border-warn/50 bg-warn-tint px-3 py-2 text-xs text-fg"><GitMerge size={14} className="text-warn" aria-hidden />
          Conflict flag: {line}</div>
      ))}
      <div className={cx("grid gap-4", compact ? "grid-cols-1" : "grid-cols-[1.1fr_1fr]")}>
        <div className="space-y-4">
          <PositionCard inc={inc} />
          <Card><SectionHeader title="Snapshot" meta={<span className="text-xs text-fg-2">Every line shows its age</span>} /><SnapshotTable inc={inc} conflictOpen={conflictOpen} rows={rows} /></Card>
        </div>
        <div className="space-y-4">
          {!compact && (map ?? <MapPanel><LocalAreaMap /></MapPanel>)}
          <div>
            <SectionHeader title="Candidate responders" meta={<span className="text-xs text-fg-2">Autonomy cost from the what-if engine</span>} />
            <ul className="space-y-2">{inc.responders.map((r) => <ResponderRow key={r.id} r={r} conflictOpen={r.status === "CONFLICT" || (conflictOpen && r.excluded)} />)}</ul>
            {inc.responders.length === 0 && <p className="text-xs text-fg-2">No capable asset with a known position on this device.</p>}
          </div>
          <VerifyChecklist items={inc.verify} />
          {!compact && (
            <Card>
              <SectionHeader title="Incident timeline" meta={<ListChecks size={13} className="text-fg-2" />} />
              <ul className="space-y-1.5">{inc.timeline.map((t) => (
                <li key={t.at + t.text} className="flex items-center gap-2 text-xs"><PriorityTierBadge tier={t.tier} /><span className="font-mono text-fg-2">{t.at}</span><span className="text-fg">{t.text}</span></li>
              ))}</ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
