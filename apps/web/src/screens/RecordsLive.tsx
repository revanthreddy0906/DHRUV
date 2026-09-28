import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { compareEvents } from "@dhruv/shared";
import { derivePositions } from "@dhruv/map";
import { reduce } from "@dhruv/engine";
import { Card, SectionHeader, cx } from "../components/primitives";
import { HistoryTable, MaintainedBy } from "../components/records";
import { assetHistory, formatAgo, formatCoords, maintainedBy, personHistory } from "../format";
import { nodeLabel } from "../live/chrome";
import { useDevice } from "../live/DeviceProvider";
import { useLiveOps } from "../live/ops";
import { PersonnelActionForm } from "../live/PersonnelActionForm";
import { Frame, QuietLine, REFRESHING_AFTER_RESET } from "./Frame";

/** Asset statuses are domain words; only DEGRADED and DOWN get colour (section 3.1). */
const STATUS_TONE: Record<string, string> = { DEGRADED: "font-semibold text-warn", DOWN: "font-semibold text-bad", INJURED: "font-semibold text-bad", UNAVAILABLE: "font-semibold text-warn" };
const words = (s: string) => s.replace(/_/g, " ").toLowerCase();

function NotInRun({ what, back, nav }: { what: string; back: { to: string; label: string }; nav: "map" | "personnel" }) {
  return (
    <Frame moment="start" nav={nav}>
      <div className="p-8 text-sm text-fg-2">
        <p className="font-semibold text-fg">{what} is not in this run's season data.</p>
        <p className="mt-1"><Link to={back.to} className="text-accent hover:underline">{back.label}</Link></p>
      </div>
    </Frame>
  );
}

/** One open disagreement about this record, in plain words. */
function OpenDisagreement({ text }: { text: string }) {
  return <p role="status" className="rounded-md bg-warn-tint px-3 py-2 text-sm text-fg">{text}</p>;
}

/**
 * Asset record (/assets/:assetId): current status and last known position (the map's derivation,
 * which keeps the conservative value while a disagreement is open), and every status entry with who
 * recorded it on which device and where that entry is now.
 */
export function LiveAssetRecord() {
  const { assetId = "" } = useParams();
  const device = useDevice();
  const ops = useLiveOps();
  const snap = device?.snapshot;
  const positions = React.useMemo(() => (ops ? derivePositions(ops.seed, ops.events) : null), [ops]);
  if (device?.refreshing) return <Frame moment="start" nav="map"><QuietLine>{REFRESHING_AFTER_RESET}</QuietLine></Frame>;
  if (!device || !ops || !snap || !positions) return <Frame moment="start" nav="map"><QuietLine>Loading this device's data…</QuietLine></Frame>;

  const seedAsset = ops.seed.assets.find((a) => a.id === assetId);
  if (!seedAsset) return <NotInRun what={`Asset ${assetId}`} back={{ to: "/map", label: "Open the map" }} nav="map" />;
  const now = positions.assets.get(assetId);
  const station = nodeLabel(seedAsset.node_id);
  const conflict = ops.openConflicts.find((c) => c.entity_type === "asset" && c.entity_id === assetId);
  const outbox = { pendingIds: snap.pendingIds, rejected: snap.rejected };
  const rows = assetHistory([...snap.events].sort(compareEvents), seedAsset);
  const status = now?.status ?? seedAsset.status;

  return (
    <Frame moment="start" nav="map">
      <div className="space-y-6 p-6">
        <header className="space-y-1">
          <Link to="/map" className="text-sm text-accent hover:underline">Map</Link>
          <h1 className="text-title font-semibold text-fg"><span className="font-mono">{seedAsset.id}</span> {seedAsset.type}</h1>
          <p className="text-sm text-fg">
            Status <span className={cx(STATUS_TONE[status] ?? "text-fg")}>{status}</span>
            {now?.observedAt && <span className="text-fg-2">, reported {formatAgo(now.observedAt, ops.now)}</span>}
          </p>
          <p className="text-sm text-fg-2">
            {now?.lat != null && now.lon != null ? <>Last known position <span className="font-mono">{formatCoords(now.lat, now.lon)}</span></> : "No position reported on this device."}
            {seedAsset.speed_kmh ? ` Speed ${seedAsset.speed_kmh} km/h.` : ""}
          </p>
        </header>
        {conflict && (
          <OpenDisagreement text={`Disagreement open: ${conflict.contenders.map((c) => `${String(c.value)} from ${c.device_id}`).join(", ")}. ${String(conflict.conservative_value)} is kept until someone decides in the Review queue.`} />
        )}
        <section>
          <SectionHeader title="Maintained by" />
          <MaintainedBy owner={station} lines={maintainedBy(["ASSET_STATUS_SET"], station)} />
        </section>
        <section>
          <SectionHeader title="History" meta={<span className="text-xs text-fg-2">Every status entry, oldest first. Entries are never edited.</span>} />
          <Card pad="none" className="overflow-x-auto"><HistoryTable rows={rows} outbox={outbox} /></Card>
        </section>
      </div>
    </Frame>
  );
}

/**
 * Person record (/personnel/:personId): where they are and their status now (the engine's reduce),
 * and every status, move, assignment, check-in and incident entry with who and where.
 */
export function LivePersonRecord() {
  const { personId = "" } = useParams();
  const device = useDevice();
  const ops = useLiveOps();
  const snap = device?.snapshot;
  const state = React.useMemo(() => (ops ? reduce(ops.seed, ops.events).personnel.get(personId) : undefined), [ops, personId]);
  if (device?.refreshing) return <Frame moment="start" nav="personnel"><QuietLine>{REFRESHING_AFTER_RESET}</QuietLine></Frame>;
  if (!device || !ops || !snap) return <Frame moment="start" nav="personnel"><QuietLine>Loading this device's data…</QuietLine></Frame>;

  const person = ops.seed.personnel.find((p) => p.id === personId);
  if (!person) return <NotInRun what={`Person ${personId}`} back={{ to: "/personnel", label: "Open personnel" }} nav="personnel" />;
  const station = nodeLabel(person.node_id);
  const status = state?.status ?? person.status;
  const conflict = ops.openConflicts.find((c) => c.entity_type === "person" && c.entity_id === personId);
  const outbox = { pendingIds: snap.pendingIds, rejected: snap.rejected };
  const rows = personHistory([...snap.events].sort(compareEvents), person, nodeLabel);
  const { role } = device.session.identity;
  const here = state?.nodeId ?? person.node_id;

  return (
    <Frame moment="start" nav="personnel">
      <div className="space-y-6 p-6">
        <header className="space-y-1">
          <Link to="/personnel" className="text-sm text-accent hover:underline">Personnel</Link>
          <h1 className="text-title font-semibold text-fg">{person.name}</h1>
          <p className="text-sm text-fg-2">{words(person.role).replace(/^\w/, (c) => c.toUpperCase())}, on the {station} roster.</p>
          <p className="text-sm text-fg">
            <span className={cx(STATUS_TONE[status] ?? "text-fg")}>{words(status).replace(/^\w/, (c) => c.toUpperCase())}</span> at {nodeLabel(here)}
            {state?.lastObservedAt && <span className="text-fg-2">, last update {formatAgo(state.lastObservedAt, ops.now)}</span>}
          </p>
        </header>
        {conflict && (
          <OpenDisagreement text={`Disagreement open: ${conflict.contenders.map((c) => `${words(String(c.value))} from ${c.device_id}`).join(", ")}. ${words(String(conflict.conservative_value))} is kept until someone decides in the Review queue.`} />
        )}
        <section>
          <SectionHeader title="Maintained by" />
          <MaintainedBy owner={station} lines={maintainedBy(["PERSON_STATUS_SET", "PERSON_MOVED", "ASSIGNMENT_SET"], station)} />
        </section>
        <section>
          <SectionHeader title="History" meta={<span className="text-xs text-fg-2">Every entry about this person, oldest first. Entries are never edited.</span>} />
          <Card pad="none" className="overflow-x-auto"><HistoryTable rows={rows} outbox={outbox} /></Card>
        </section>
        <PersonnelActionForm key={personId} role={role} node={here} now={ops.now}
          people={[{ id: person.id, name: person.name, role: person.role, nodeId: here, status, lastObservedAt: state?.lastObservedAt ?? person.last_seen ?? ops.now }]} />
      </div>
    </Frame>
  );
}
