import * as React from "react";
import { Filter, SearchX } from "lucide-react";
import type { OpEventRow } from "../data/types";
import { cx, PriorityTierBadge, Button } from "./primitives";

export interface AuditFilterState { device: string; role: string; type: string; entity: string; tier: string }
const EMPTY: AuditFilterState = { device: "", role: "", type: "", entity: "", tier: "" };

export function AuditFilters({ rows, value, onChange }: { rows: OpEventRow[]; value: AuditFilterState; onChange: (v: AuditFilterState) => void }) {
  const opts = (k: keyof OpEventRow) => Array.from(new Set(rows.map((r) => String(r[k])))).sort();
  const Sel = ({ k, label, src }: { k: keyof AuditFilterState; label: string; src: string[] }) => (
    <label className="flex flex-col gap-0.5 text-xs text-fg-2">{label}
      <select value={value[k]} onChange={(e) => onChange({ ...value, [k]: e.target.value })} className="h-8 min-w-32 rounded-md border border-line-ctrl bg-bg px-2 font-mono text-xs normal-case text-fg">
        <option value="">all</option>{src.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Filter size={15} className="mb-2 text-fg-2" aria-hidden />
      <Sel k="device" label="Device" src={opts("device")} />
      <Sel k="role" label="Actor role" src={opts("actor")} />
      <Sel k="type" label="Type" src={opts("type")} />
      <Sel k="entity" label="Entity" src={opts("entity")} />
      <Sel k="tier" label="Priority" src={["0", "1", "2", "3", "4", "5"]} />
      <Button size="sm" variant="ghost" onClick={() => onChange(EMPTY)}>Clear</Button>
    </div>
  );
}

export function AuditTable({ rows, initialFilter = EMPTY }: { rows: OpEventRow[]; initialFilter?: AuditFilterState }) {
  const [f, setF] = React.useState(initialFilter);
  const shown = rows.filter((r) => (!f.device || r.device === f.device) && (!f.role || r.actor === f.role) && (!f.type || r.type === f.type) && (!f.entity || r.entity === f.entity) && (!f.tier || String(r.tier) === f.tier));
  return (
    <div className="space-y-3">
      <AuditFilters rows={rows} value={f} onChange={setF} />
      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-xs">
          <thead className="bg-elevated text-left text-xs text-fg-2">
            <tr>{["Device · seq", "Type", "Entity", "Actor", "P", "observed_at", "recorded_at_server", "Summary"].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className={cx("border-t border-line", r.type === "CONFLICT_FLAGGED" && "bg-warn-tint/60")}>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-fg-2">{r.deviceSeq}</td>
                <td className="px-3 py-2 font-mono font-semibold text-fg">{r.type}</td>
                <td className="px-3 py-2 font-mono text-fg">{r.entity}</td>
                <td className="px-3 py-2 font-mono text-fg-2">{r.actor}</td>
                <td className="px-3 py-2"><PriorityTierBadge tier={r.tier} /></td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-fg">{r.observedAt}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-fg-2">{r.recordedAtServer ?? <span className="italic">not yet received</span>}</td>
                <td className="px-3 py-2 text-fg-2">{r.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-fg-2">
            <SearchX size={20} aria-hidden />No events match these filters. The event log is unchanged; clear a filter to see more.
            <Button size="sm" onClick={() => setF(EMPTY)}>Clear filters</Button>
          </div>
        )}
      </div>
    </div>
  );
}
