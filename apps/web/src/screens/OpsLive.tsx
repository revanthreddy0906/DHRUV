import * as React from "react";
import { InventoryRow, MissionRow, RoleCoverage } from "../components/ops";
import { Card, SectionHeader, cx } from "../components/primitives";
import { useDevice } from "../live/DeviceProvider";
import { useLiveOps } from "../live/ops";
import { StationContext } from "../live/StationContext";
import { StockTransactionForm } from "../live/StockTransactionForm";
import { Frame } from "./Frame";

const Loading = ({ nav }: { nav: "inventory" | "personnel" }) => (
  <Frame moment="start" nav={nav}><div className="p-8 text-center font-mono text-xs tracking-wider text-fg-2">HYDRATING EXPEDITION STATE...</div></Frame>
);

/**
 * Inventory for this viewer's station (HQ: either station): every line is the engine's R01-R03 / R19
 * on this device's events, and the transaction card above it writes STOCK_* events.
 */
export function LiveInventoryScreen() {
  const device = useDevice();
  const [focus, setFocus] = React.useState<string>();
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
            <h1 className="text-xl font-semibold text-fg">Inventory · {ops.maitriStation.name}</h1>
            <p className="mt-0.5 text-sm text-fg-2">Ratio = (stock + feasible inbound) / requirement to the next resupply with reserve. Evaluated on this device at its own clock.</p>
          </div>
          <div className="ml-auto"><StationContext role={role} node={node} onChange={setFocus} /></div>
        </div>
        <StockTransactionForm key={node} role={role} node={node} seed={ops.seed} rows={rows} />
        <Card pad="none" className="overflow-hidden">
          <table className="w-full">
            <thead className="bg-elevated text-left text-[10px] uppercase tracking-wider text-fg-2">
              <tr>{["Item", "Stock", "Inbound (feasible)", "Required", "Ratio", "Days of cover", "Count freshness"].map((h, i) => <th key={h} className={cx("px-3 py-2 font-semibold", i === 1 || i === 3 ? "text-right" : "")}>{h}</th>)}</tr>
            </thead>
            <tbody className="[&_td:first-child]:pl-3">
              {rows.map((i) => <InventoryRow key={i.id} i={i} expanded={i.state !== "GREEN"} />)}
            </tbody>
          </table>
          {rows.length === 0 && <p className="p-8 text-center text-sm text-fg-2">No inventory items for this station in the seed. Readiness for these dimensions shows unknown, not zero.</p>}
        </Card>
      </div>
    </Frame>
  );
}

/** Role coverage (R05) and mission impact (R07) from the engine; people from the seed with their live station. */
export function LivePersonnelScreen() {
  const device = useDevice();
  const ops = useLiveOps();
  if (!device || !ops) return <Loading nav="personnel" />;
  const canEdit = device.session.identity.role !== "FIELD_LEAD";
  const node = ops.maitriStation.nodeId;
  const people = ops.seed.personnel.filter((p) => p.node_id === node);
  const named = people.filter((p) => !/^P-[MB]\d+$/.test(p.id));
  return (
    <Frame moment="start" nav="personnel">
      <div className="space-y-4 p-5">
        <div>
          <h1 className="text-xl font-semibold text-fg">Personnel and Missions · {ops.maitriStation.name}</h1>
          <p className="mt-0.5 text-sm text-fg-2">{people.length} winterers in the seed. Role coverage: GREEN needs need + 1; AMBER at need; RED below need (R05).</p>
        </div>
        <section><SectionHeader title="Critical role coverage" /><RoleCoverage roles={ops.roles} /></section>
        <div className="grid grid-cols-[1.6fr_1fr] gap-4">
          <Card pad="none" className="overflow-hidden">
            <div className="px-4 pt-3"><SectionHeader title="Missions" /></div>
            <table className="w-full"><tbody className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-4">
              {ops.maitriStation.missions.map((m) => <MissionRow key={m.id} m={m} canEdit={canEdit} reason="Field Leads set status only for their own team" />)}
            </tbody></table>
            {ops.maitriStation.missions.length === 0 && <p className="p-4 text-sm text-fg-2">No missions for this station in the seed.</p>}
          </Card>
          <Card>
            <SectionHeader title="Named people (seed)" />
            <ul className="divide-y divide-line text-[13px]">{named.map((p) => <li key={p.id} className="flex justify-between py-1.5"><span className="text-fg">{p.name}</span><span className="text-fg-2">{p.role.replace(/_/g, " ").toLowerCase()}</span></li>)}</ul>
            <p className="mt-2 text-[11px] text-fg-2">Other winterers are generated in the seed and not named here.</p>
          </Card>
        </div>
      </div>
    </Frame>
  );
}
