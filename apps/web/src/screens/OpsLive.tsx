import * as React from "react";
import { Link } from "react-router-dom";
import { Network } from "lucide-react";
import { InventoryRow, MissionRow, RoleCoverage } from "../components/ops";
import { reduce } from "@dhruv/engine";
import type { OpEvent, Seed } from "@dhruv/shared";
import { Card, SectionHeader, Tag, cx } from "../components/primitives";
import { useDevice } from "../live/DeviceProvider";
import { useLiveOps } from "../live/ops";
import { useStationFocus } from "../live/stationFocus";
import { StockTransactionForm } from "../live/StockTransactionForm";
import { PersonnelActionForm, type LivePerson } from "../live/PersonnelActionForm";
import { formatAge } from "../live/format";
import { Frame } from "./Frame";

const Loading = ({ nav }: { nav: "inventory" | "personnel" }) => (
  <Frame moment="start" nav={nav}><div className="p-8 text-center text-xs text-fg-2">Loading this device's expedition state.</div></Frame>
);

/**
 * Inventory for this viewer's station (HQ: either station): every line is the engine's R01-R03 / R19
 * on this device's events, and the transaction card above it writes STOCK_* events.
 */
export function LiveInventoryScreen() {
  const device = useDevice();
  const [focus] = useStationFocus();
  const ops = useLiveOps(focus);
  if (!device || !ops) return <Loading nav="inventory" />;
  const { role } = device.session.identity;
  const node = ops.maitriStation.nodeId;
  const rows = ops.inventory;
  return (
    <Frame moment="start" nav="inventory">
      <div className="space-y-4 p-5">
        <div className="flex items-end gap-3">
          <div>
            <h1 className="text-title font-semibold text-fg">Inventory · {ops.maitriStation.name}</h1>
            <p className="mt-0.5 text-sm text-fg-2">Ratio = (stock + feasible inbound) / requirement to the next resupply with reserve. Evaluated on this device at its own clock.</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Link to={`/graph?station=${node}&focus=${rows[0]?.id ?? ""}`} className="flex items-center gap-1 text-xs text-fg-2 hover:text-fg"><Network size={13} aria-hidden />Connections</Link>
          </div>
        </div>
        <StockTransactionForm key={node} role={role} node={node} seed={ops.seed} rows={rows} events={ops.events} now={ops.now} evaluation={ops.evaluation} />
        <Card pad="none" className="overflow-hidden">
          <table className="w-full">
            <thead className="bg-elevated text-left text-xs text-fg-2">
              <tr>{["Item", "Stock", "Inbound (feasible)", "Required", "Ratio", "Days of cover", "Count freshness"].map((h, i) => <th key={h} className={cx("px-3 py-2 font-semibold", i === 1 || i === 3 ? "text-right" : "")}>{h}</th>)}</tr>
            </thead>
            <tbody className="[&_td:first-child]:pl-3">
              {rows.map((i) => <InventoryRow key={i.id} i={i} expanded={i.state !== "GREEN"} href={`/inventory/${i.id}`} />)}
            </tbody>
          </table>
          {rows.length === 0 && <p className="p-8 text-center text-sm text-fg-2">No inventory items for this station in the seed. Readiness for these dimensions shows unknown, not zero.</p>}
        </Card>
      </div>
    </Frame>
  );
}

/** Everyone the engine's reduce() places at `node` now, named from the seed roster. */
function peopleAt(seed: Seed, events: OpEvent[], node: string): LivePerson[] {
  const names = new Map(seed.personnel.map((p) => [p.id, p.name]));
  return [...reduce(seed, events).personnel.values()]
    .filter((p) => p.nodeId === node)
    .map((p) => ({ id: p.personId, name: names.get(p.personId) ?? p.personId, role: p.role, nodeId: p.nodeId, status: p.status, lastObservedAt: p.lastObservedAt }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const STATUS_TONE: Record<string, "neutral" | "accent" | "red" | "amber" | "green"> = { ON_STATION: "green", FIELD: "accent", UNAVAILABLE: "amber", INJURED: "red", EVACUATED: "red" };

/** Role coverage (R05) and mission impact (R07) from the engine; people with their live status and station from reduce(). */
export function LivePersonnelScreen() {
  const device = useDevice();
  const [focus] = useStationFocus();
  const ops = useLiveOps(focus);
  const node = ops?.maitriStation.nodeId;
  const people = React.useMemo(() => (ops && node ? peopleAt(ops.seed, ops.events, node) : []), [ops, node]);
  if (!device || !ops || !node) return <Loading nav="personnel" />;
  const { role } = device.session.identity;
  const canEdit = role !== "FIELD_LEAD";
  return (
    <Frame moment="start" nav="personnel">
      <div className="space-y-4 p-5">
        <div className="flex items-end gap-3">
          <div>
            <h1 className="text-title font-semibold text-fg">Personnel and Missions · {ops.maitriStation.name}</h1>
            <p className="mt-0.5 text-sm text-fg-2">{people.length} people at {ops.maitriStation.name} now. Role coverage: GREEN needs need + 1; AMBER at need; RED below need (R05).</p>
          </div>
        </div>
        <PersonnelActionForm key={node} role={role} node={node} people={people} now={ops.now} />
        <section><SectionHeader title="Critical role coverage" /><RoleCoverage roles={ops.roles} /></section>
        <div className="grid grid-cols-[1.6fr_1fr] gap-4">
          <Card pad="none" className="overflow-hidden">
            <div className="px-4 pt-3"><SectionHeader title="Missions" /></div>
            <table className="w-full"><tbody className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-4">
              {ops.maitriStation.missions.map((m) => <MissionRow key={m.id} m={m} canEdit={canEdit} reason="Field Leads set status only for their own team" />)}
            </tbody></table>
            {ops.maitriStation.missions.length === 0 && <p className="p-4 text-sm text-fg-2">No missions for this station in the seed.</p>}
          </Card>
          <Card pad="none" className="overflow-hidden">
            <div className="px-4 pt-3"><SectionHeader title="People (live)" meta={<span className="text-xs text-fg-2">status · last update</span>} /></div>
            <ul className="max-h-96 divide-y divide-line overflow-y-auto px-4 text-sm">
              {people.map((p) => (
                <li key={p.id} className="flex items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-fg"><Link to={`/personnel/${p.id}`} className="text-accent hover:underline">{p.name}</Link><span className="ml-1.5 text-xs text-fg-2">{p.role.replace(/_/g, " ").toLowerCase()}</span></span>
                  <Tag tone={STATUS_TONE[p.status] ?? "neutral"}>{p.status.replace("_", " ")}</Tag>
                  <span className="w-14 text-right font-mono text-xs text-fg-2">{formatAge(p.lastObservedAt, ops.now)}</span>
                </li>
              ))}
            </ul>
            {people.length === 0 && <p className="p-4 text-sm text-fg-2">No one is at this station now.</p>}
          </Card>
        </div>
      </div>
    </Frame>
  );
}
