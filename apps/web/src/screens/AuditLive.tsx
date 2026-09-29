import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { EVENT_RULES } from "@dhruv/shared";
import { conflictsView, reduceOrder, type ConflictView } from "@dhruv/store";
import { AuditTable } from "../components/audit";
import { ConflictResolver, ReviewQueue } from "../components/sync";
import type { Conflict, OpEventRow, Tier } from "../data/types";
import { useDevice } from "../live/DeviceProvider";
import { nodeLabel } from "../live/chrome";
import { describeEvent } from "../live/describe";
import { formatShort } from "../live/format";
import { useFactEvents } from "../live/incident";
import { useLiveOps } from "../live/ops";
import { PageHeader } from "../components/primitives";
import { Frame } from "./Frame";

/** What an open conflict holds up, in operator terms. */
function blocks(c: ConflictView): string[] {
  if (c.entity_type === "asset") return [`${c.entity_id} excluded from nearest-asset lists`, `Any approval touching ${c.entity_id} is blocked`];
  if (c.entity_type === "inventory_item") return [`${c.entity_id} shown as unverified stock until recounted`];
  if (c.entity_type === "person") return [`${c.entity_id} kept at the conservative status for readiness and incidents`];
  return ["Held at the conservative value until resolved"];
}

/** Section 4 mirrored from the API: Field Leads never resolve; a Station Leader only their station's. */
function resolveBlocked(c: ConflictView, role: string, nodeId: string): string | undefined {
  if (role === "FIELD_LEAD") return "Field Leads cannot resolve conflicts";
  if (role === "STATION_LEADER" && c.node_id !== nodeId) return `Only HQ Ops or ${nodeLabel(c.node_id)}'s Station Leader can resolve this`;
  return undefined;
}

/**
 * Audit for the signed-in device (F5): the Review queue from CONFLICT_FLAGGED / CONFLICT_RESOLVED,
 * resolution as a CONFLICT_RESOLVED event (it syncs like any other write, online or not), and the
 * append-only event log as this device holds it, including entries not yet received by the server.
 */
export function LiveAuditScreen() {
  const device = useDevice();
  const ops = useLiveOps();
  const events = useFactEvents();
  const [reviewing, setReviewing] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string>();
  if (!device?.snapshot || !ops || !events) return null;
  const { identity } = device.session;
  const byId = new Map(events.map((e) => [e.event_id, e]));

  const all = conflictsView(events);
  const toCard = (c: ConflictView): Conflict => ({
    id: c.id,
    entity: c.entity_id,
    entityKind: `${c.entity_type.replace("_", " ")}, ${nodeLabel(c.node_id)}`,
    field: c.field,
    mergeClass: c.field === "stock" ? "B" : "C-S",
    contenders: c.contenders.map((x) => {
      const e = byId.get(x.event_id);
      const note = (e?.payload as { note?: unknown } | undefined)?.note;
      return { device: x.device_id, value: String(x.value), note: typeof note === "string" ? note : e ? e.type : "event not on this device", at: e ? formatShort(e.observed_at) : "—" };
    }),
    kept: String(c.conservative_value),
    status: c.status,
    blocks: blocks(c),
  });
  const open = all.filter((c) => c.status === "OPEN");
  const resolved = all.filter((c) => c.status === "RESOLVED");
  const selected = open.find((c) => c.id === reviewing) ?? open[0];

  const resolve = async (c: ConflictView, value: string) => {
    setError(undefined);
    // The contender's own value (a status string or a stock number), not its display text.
    const chosen = c.contenders.find((x) => String(x.value) === value)?.value ?? value;
    try {
      await device.write({ type: "CONFLICT_RESOLVED", entity_type: "conflict", entity_id: c.id, node_id: c.node_id, payload: { conflict_id: c.id, chosen_value: chosen, resolver: identity.device_id } });
      device.syncNow();
      setReviewing(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const rows: OpEventRow[] = [...events]
    .sort(reduceOrder)
    .reverse()
    .filter((e) => e.type !== "CLOCK_ADVANCED")
    .map((e) => ({
      deviceSeq: `${e.device_id} · ${e.seq}`,
      device: e.device_id,
      seq: e.seq,
      type: e.type,
      entity: e.entity_id,
      node: e.node_id,
      actor: e.actor_role,
      observedAt: formatShort(e.observed_at),
      recordedAtServer: e.recorded_at_server ? formatShort(e.recorded_at_server) : EVENT_RULES[e.type].localOnly ? "local only · never synced" : undefined,
      tier: e.actor_role === "SYSTEM" || EVENT_RULES[e.type].localOnly ? null : (e.priority as Tier),
      summary: describeEvent(e),
      pending: device.snapshot?.pendingIds.has(e.event_id),
    }));

  return (
    <Frame moment="start" nav="audit">
      <div className="space-y-6 p-6">
        <PageHeader title="Audit" subtitle={`Append-only event log as held by ${identity.device_id}. Events are never edited; corrections are new events. Observed times are demo time; recorded-at-server times are the server's real clock.`} />
        <div className={selected ? "grid items-start gap-6 xl:grid-cols-2" : ""}>
          <div className="space-y-3">
            <ReviewQueue conflicts={open.map(toCard)} onReview={(id) => setReviewing(id)} />
            {resolved.length > 0 && (
              <ul className="space-y-1 text-xs text-fg-2">
                {resolved.map((c) => (
                  <li key={c.id} className="flex items-center gap-2"><CheckCircle2 size={13} className="text-ok" aria-hidden />
                    {c.entity_id} {c.field} resolved as <b className="font-mono text-fg">{String(c.resolved_value)}</b> by <span className="font-mono">{c.resolver}</span></li>
                ))}
              </ul>
            )}
          </div>
          {selected && (
            <div className="space-y-2 pt-7">
              <ConflictResolver key={selected.id} c={toCard(selected)} role={identity.role} disabledReason={resolveBlocked(selected, identity.role, identity.node_id)} onResolve={(v) => void resolve(selected, v)} />
              {error && <p role="alert" className="text-xs text-fg">{error}</p>}
            </div>
          )}
        </div>
        <AuditTable rows={rows} />
      </div>
    </Frame>
  );
}
