import * as React from "react";
import { ArrowRight, Check, Cloud, Database, HardDrive, Server } from "lucide-react";
import { compareEvents, EVENT_RULES, stockBalance, type OpEvent, type StorageResponse } from "@dhruv/shared";
import { getMeta } from "@dhruv/store";
import { Card, SectionHeader, Tag, cx } from "../components/primitives";
import { useDevice } from "../live/DeviceProvider";
import { useLiveOps } from "../live/ops";
import { nodeLabel } from "../live/chrome";
import { describeEvent } from "../live/describe";
import { Frame } from "./Frame";

const MERGE: Record<string, string> = {
  A: "A · immutable: recorded once, never merged",
  B: "B · quantity: last count + receipts − issues, in reduce order",
  C: "C · last write wins by observed_at",
  CS: "CS · safety-critical: the most conservative report wins, conflicts flagged",
};

const mono = "font-mono text-[12px]";

/** Server figures from GET /storage, refreshed while the screen is open. Offline, the last answer stays with its age. */
function useServerStorage() {
  const device = useDevice();
  const [data, setData] = React.useState<{ at: number; storage: StorageResponse }>();
  const [error, setError] = React.useState<string>();
  const link = device?.snapshot?.link;
  React.useEffect(() => {
    if (!device) return;
    let alive = true;
    const load = async () => {
      if (link === "OFFLINE") return setError("This device is offline, so the server cannot be asked. Figures below are from the last answer.");
      try {
        const storage = await device.call<StorageResponse>("/storage");
        if (alive) { setData({ at: Date.now(), storage }); setError(undefined); }
      } catch (err) {
        if (alive) setError((err as Error).message);
      }
    };
    void load();
    const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [device, link]);
  return { data, error };
}

/** This device's sync bookkeeping in IndexedDB `meta`. */
function useDeviceMeta() {
  const device = useDevice();
  const [meta, setMeta] = React.useState<{ seq: number; cursor: number; epoch: string | null }>();
  const snap = device?.snapshot;
  React.useEffect(() => {
    if (!device) return;
    void (async () => setMeta({
      seq: await getMeta(device.db, "seq", 0),
      cursor: await getMeta(device.db, "cursor", 0),
      epoch: await getMeta<string | null>(device.db, "epoch", null),
    }))();
  }, [device, snap]);
  return meta;
}

function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-0">
      <span className="text-[12px] text-fg-2">{label}{note && <span className="block text-[11px] text-fg-2/80">{note}</span>}</span>
      <span className={cx(mono, "text-fg tabular-nums")}>{value}</span>
    </div>
  );
}

function Step({ done, title, detail }: { done: boolean; title: string; detail: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className={cx("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border", done ? "border-ok bg-ok-tint text-ok" : "border-line-ctrl text-fg-2")}>
        {done ? <Check size={12} aria-hidden /> : <span className="size-1.5 rounded-full bg-fg-2" />}
      </span>
      <div className="min-w-0">
        <div className={cx("text-[13px]", done ? "text-fg" : "text-fg-2")}>{title}</div>
        <div className="text-[12px] text-fg-2">{detail}</div>
      </div>
    </li>
  );
}

/**
 * Where data lives (evaluator question 5): the same event seen in this device's IndexedDB, in its
 * outbox, and in the server's SQLite log; and a stock figure shown as what it really is, a value
 * computed from events rather than a stored number.
 */
export function LiveDataScreen() {
  const device = useDevice();
  const ops = useLiveOps();
  const meta = useDeviceMeta();
  const server = useServerStorage();
  const snap = device?.snapshot;

  const events = React.useMemo(() => (snap ? [...snap.events].sort(compareEvents).reverse() : []), [snap]);
  const [picked, setPicked] = React.useState<string>();
  const node = ops?.maitriStation.nodeId;
  const items = ops && node ? ops.seed.inventory_items.filter((i) => i.node_id === node) : [];
  const [itemId, setItemId] = React.useState<string>();

  if (!device || !snap || !ops) {
    return <Frame moment="start" nav="data"><div className="p-8 text-center font-mono text-xs tracking-wider text-fg-2">OPENING THIS DEVICE'S STORE...</div></Frame>;
  }

  const { identity } = device.session;
  const synced = events.filter((e) => !EVENT_RULES[e.type].localOnly);
  const event = events.find((e) => e.event_id === picked) ?? synced[0] ?? events[0];
  const pending = snap.outbox.filter((o) => o.status === "pending");
  const refused = snap.outbox.filter((o) => o.status === "rejected");
  const localOnly = events.filter((e) => EVENT_RULES[e.type].localOnly).length;
  const tiers = [0, 1, 2, 3, 4, 5].map((p) => ({ p, n: pending.filter((o) => o.priority === p).length }));

  const item = items.find((i) => i.id === itemId) ?? items[0];
  const balance = item ? stockBalance([...ops.events].sort(compareEvents), item.id, item.stock) : null;
  const storage = server.data?.storage;

  return (
    <Frame moment="start" nav="data">
      <div className="space-y-4 p-5">
        <div>
          <h1 className="text-xl font-semibold text-fg">Where data lives</h1>
          <p className="mt-0.5 max-w-[90ch] text-sm text-fg-2">
            Every change is one event. It is written to this device first, queued in its outbox, and appended to the server's log when the link allows.
            Stock levels, decisions and readiness are not stored anywhere: they are computed from the events each time.
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_1.35fr_1fr]">
          <Card>
            <SectionHeader title="This device" meta={<HardDrive size={14} className="text-fg-2" aria-hidden />} />
            <p className="mb-2 text-[12px] text-fg-2">Browser IndexedDB database <span className={cx(mono, "text-fg")}>dhruv-{identity.device_id}</span>. It works with no network at all.</p>
            <Stat label="events" note="every event this device holds, its own and pulled" value={events.length} />
            <Stat label="  of which local only" note="clock and link switches, never synced" value={localOnly} />
            <Stat label="outbox · pending" note="written here, not yet accepted by the server" value={pending.length} />
            <Stat label="outbox · refused" note="the server said no; not counted anywhere" value={refused.length} />
            <Stat label="meta · seq" note="this device's last sequence number" value={meta?.seq ?? "…"} />
            <Stat label="meta · cursor" note="how far it has pulled other devices' events" value={meta?.cursor ?? "…"} />
            <Stat label="meta · epoch" note="which run of the server log it belongs to" value={meta?.epoch ? `${meta.epoch.slice(0, 8)}…` : "…"} />
            <Stat label="cache · seed" note="the season's reference data, kept for offline use" value={`${ops.seed.inventory_items.length} items · ${ops.seed.personnel.length} people`} />
            <div className="mt-3 text-[11px] text-fg-2">Outbox by priority tier (drains P0 first):</div>
            <div className="mt-1 flex gap-1.5">
              {tiers.map((t) => (
                <span key={t.p} className={cx("rounded border px-1.5 py-0.5 font-mono text-[11px]", t.n ? "border-accent/60 text-fg" : "border-line text-fg-2")}>P{t.p} {t.n}</span>
              ))}
            </div>
          </Card>

          <Card>
            <SectionHeader title="Follow one event" meta={<Database size={14} className="text-fg-2" aria-hidden />} />
            <label className="text-xs text-fg-2">Event
              <select aria-label="Event" value={event?.event_id ?? ""} onChange={(e) => setPicked(e.target.value)} className="mt-1 block h-8 w-full rounded-md border border-line-ctrl bg-bg px-2 text-sm text-fg">
                {events.slice(0, 60).map((e) => <option key={e.event_id} value={e.event_id}>{e.device_id} · {e.seq} · {e.type} · {describeEvent(e).slice(0, 60)}</option>)}
              </select>
            </label>
            {event ? <EventJourney event={event} pending={snap.pendingIds.has(event.event_id)} refused={snap.rejected.get(event.event_id)} own={event.device_id === identity.device_id} /> : <p className="mt-3 text-sm text-fg-2">No events yet. Record a stock count or any other action, then come back.</p>}
          </Card>

          <Card>
            <SectionHeader title="Server" meta={<Server size={14} className="text-fg-2" aria-hidden />} />
            {storage ? (
              <>
                <p className="mb-2 text-[12px] text-fg-2">{storage.engine} file <span className={cx(mono, "text-fg")}>{storage.file.split("/").pop()}</span> · journal {storage.journal_mode}</p>
                <Stat label="events" note="append-only log: the source of truth" value={storage.log.rows} />
                <Stat label="cursor" note="position of the newest event" value={storage.cursor} />
                <Stat label="epoch" note="renewed on Reset to Start" value={`${storage.epoch.slice(0, 8)}…`} />
                {storage.derived.map((d) => <Stat key={d.table} label={d.table} note="rebuilt from events after each batch" value={d.rows} />)}
                <div className="mt-3 text-[11px] uppercase tracking-wider text-fg-2">Reference data (seed, read-only)</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {storage.reference.map((r) => <span key={r.table} className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-fg-2">{r.table} {r.rows}</span>)}
                </div>
                <div className="mt-3 text-[11px] uppercase tracking-wider text-fg-2">Events by device</div>
                <div className="mt-1 space-y-0.5">
                  {storage.log.by_device.map((d) => <div key={d.device_id} className="flex justify-between font-mono text-[11px] text-fg-2"><span>{d.device_id}</span><span>{d.n} · seq ≤ {d.last_seq}</span></div>)}
                  {storage.log.by_device.length === 0 && <div className="text-[12px] text-fg-2">No events since Reset to Start.</div>}
                </div>
              </>
            ) : <p className="text-sm text-fg-2">{server.error ?? "Asking the server…"}</p>}
            {storage && server.error && <p className="mt-2 text-[11px] text-warn">{server.error}</p>}
          </Card>
        </div>

        <Card>
          <SectionHeader title={`State is computed, not stored · ${nodeLabel(node ?? "")}`} meta={<Cloud size={14} className="text-fg-2" aria-hidden />} />
          <div className="flex flex-wrap items-start gap-6">
            <label className="text-xs text-fg-2">Item
              <select aria-label="Computed item" value={item?.id ?? ""} onChange={(e) => setItemId(e.target.value)} className="mt-1 block h-8 w-60 rounded-md border border-line-ctrl bg-bg px-2 text-sm text-fg">
                {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.id})</option>)}
              </select>
            </label>
            {item && balance && (
              <div className="min-w-0 flex-1 space-y-2 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <Tag>{balance.countedAt ? `last count ${balance.base} ${item.unit}` : `seed stock ${balance.base} ${item.unit}`}</Tag>
                  {balance.deltas.map((d) => (
                    <React.Fragment key={d.event_id}>
                      <ArrowRight size={12} className="text-fg-2" aria-hidden />
                      <Tag tone={d.type === "STOCK_RECEIVED" ? "green" : "amber"}>{d.type === "STOCK_RECEIVED" ? "+" : "−"}{(d.payload as { qty: number }).qty} {d.type === "STOCK_RECEIVED" ? "received" : "issued"}</Tag>
                    </React.Fragment>
                  ))}
                  <ArrowRight size={12} className="text-fg-2" aria-hidden />
                  <span className="font-mono text-base font-semibold text-fg">{balance.balance} {item.unit}</span>
                </div>
                <p className="text-[12px] text-fg-2">
                  The server's <span className={mono}>inventory_items</span> row still says {item.stock} {item.unit}: that is the season's starting figure and it is never updated.
                  What every screen shows is the last STOCK_COUNTED plus the receipts minus the issues recorded after it, recomputed from the log (merge class B).
                  Two devices that saw the same events always get the same number.
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </Frame>
  );
}

function EventJourney({ event, pending, refused, own }: { event: OpEvent; pending: boolean; refused?: string; own: boolean }) {
  const rule = EVENT_RULES[event.type];
  const local = !!rule.localOnly;
  return (
    <div className="mt-3 space-y-3">
      <ol className="space-y-2.5">
        <Step done title={own ? "Written on this device" : `Written on ${event.device_id}`} detail={<>seq <span className={mono}>{event.seq}</span> · created {event.created_at_client.slice(0, 19).replace("T", " ")} (device clock) · observed {event.observed_at.slice(0, 16).replace("T", " ")} (demo time)</>} />
        {local ? (
          <Step done title="Kept on this device only" detail={`${event.type} is a demo control; it never leaves the device.`} />
        ) : (
          <>
            <Step done={!own || !pending || !!refused} title={own ? "Queued in the outbox" : "Queued in its device's outbox"} detail={own ? (pending ? `waiting to sync · priority P${event.priority}` : `priority P${event.priority} · left the outbox`) : `priority P${event.priority}`} />
            {refused
              ? <Step done={false} title="Refused by the server" detail={refused} />
              : <Step done={!!event.recorded_at_server} title="Appended to the server log" detail={event.recorded_at_server ? <>recorded_at_server {event.recorded_at_server.slice(0, 19).replace("T", " ")} · unique on (device_id, seq), so a resend is a no-op</> : "not yet received"} />}
            <Step done={!own || !!event.recorded_at_server} title={own ? "Pulled by other devices" : "Pulled by this device"} detail={own ? "they fetch everything after their cursor on their next sync" : "arrived with this device's last pull"} />
          </>
        )}
      </ol>
      <div className="text-[11px] text-fg-2">Merge rule: {MERGE[rule.mergeClass]}</div>
      <pre className="max-h-64 overflow-auto rounded-md border border-line bg-bg p-2 font-mono text-[11px] leading-4 text-fg">{JSON.stringify(event, null, 2)}</pre>
    </div>
  );
}
