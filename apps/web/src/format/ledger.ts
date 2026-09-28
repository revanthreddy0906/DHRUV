import { EVENT_RULES, stockBalance, type EventType, type OpEvent } from "@dhruv/shared";
import { formatQty } from "./number";
import { formatDate, formatDateTime, formatWallDateTime } from "./time";

/**
 * Record histories (stock card, asset and person records): what each entry was, who recorded it on
 * which device, and where that entry is now. The stock rule itself is stockBalance() from
 * @dhruv/shared, applied to each prefix of the ledger for the running balance; nothing here
 * re-implements it or decides a state.
 */

/* ---------- Where an entry is ---------- */

export interface DeviceOutboxView {
  /** Event ids still in this device's outbox. */
  pendingIds: ReadonlySet<string>;
  /** Event ids the server refused, with its reason. */
  rejected: ReadonlyMap<string, string>;
}

export type EntryPlace =
  | { kind: "waiting"; device: string }
  | { kind: "hq"; receivedAt?: string }
  | { kind: "refused"; reason: string };

/**
 * Where an entry is, from this device's outbox and the event itself: still only on the device that
 * wrote it (waiting for the link), accepted by HQ (recorded_at_server), or refused with the
 * server's reason. An entry from another device reached this one through HQ, so it is at HQ.
 */
export function entryPlace(e: OpEvent, device: DeviceOutboxView): EntryPlace {
  const refused = device.rejected.get(e.event_id);
  if (refused !== undefined) return { kind: "refused", reason: refused };
  if (device.pendingIds.has(e.event_id)) return { kind: "waiting", device: e.device_id };
  return { kind: "hq", receivedAt: e.recorded_at_server };
}

/**
 * "At HQ", "Waiting to send · on MAITRI-TAB-01", "Refused: …". HQ's receipt time is the server's
 * real clock, not sim time, so it goes in the tooltip only: "Received by HQ 28 Sep 14:35 (real time)".
 */
export function entryPlaceText(p: EntryPlace): { text: string; tooltip?: string; tone?: "warn" | "bad" } {
  switch (p.kind) {
    case "waiting": return { text: `Waiting to send · on ${p.device}`, tone: "warn" };
    case "refused": return { text: `Refused: ${p.reason}`, tone: "bad" };
    case "hq": return { text: "At HQ", tooltip: p.receivedAt ? `Received by HQ ${formatWallDateTime(p.receivedAt)} (real time)` : undefined };
  }
}

/* ---------- Who recorded it ---------- */

const ROLE_WORDS: Record<string, string> = { HQ_OPS: "HQ Ops", STATION_LEADER: "Station Leader", FIELD_LEAD: "Field Lead", SYSTEM: "HQ server" };

/** "Station Leader", "HQ Ops"; the device id goes beside it. */
export const roleWords = (role: string) => ROLE_WORDS[role] ?? role.replace(/_/g, " ").toLowerCase();

const TYPE_WORDS: Partial<Record<EventType, string>> = {
  STOCK_COUNTED: "counts", STOCK_ISSUED: "issues", STOCK_RECEIVED: "receipts",
  ASSET_STATUS_SET: "status changes", PERSON_STATUS_SET: "status changes", PERSON_MOVED: "moves",
  ASSIGNMENT_SET: "assignments", CHECKIN_RECORDED: "check-ins",
};
const joinWords = (xs: string[], word: string) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${word} ${xs.at(-1)}`);
const upperFirst = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/**
 * "Maintained by" in plain words, straight from EVENT_RULES: which roles may record each kind of
 * entry, for a record owned by `station`. Kinds with the same roles share a line:
 * "Counts: Maitri Station Leader or HQ Ops", "Issues and receipts: Maitri Station Leader".
 */
export function maintainedBy(types: EventType[], station: string): string[] {
  const who = (role: string) => (role === "STATION_LEADER" ? `${station} Station Leader` : role === "FIELD_LEAD" ? `${station} Field Lead` : role === "HQ_OPS" ? "HQ Ops" : null);
  const groups = new Map<string, { kinds: string[]; roles: string[] }>();
  for (const type of types) {
    const roles = EVENT_RULES[type].allowedRoles.map(who).filter((r): r is string => !!r);
    const key = roles.join("|");
    const g = groups.get(key) ?? { kinds: [], roles };
    g.kinds.push(TYPE_WORDS[type] ?? type.toLowerCase());
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => `${upperFirst(joinWords(g.kinds, "and"))}: ${joinWords(g.roles, "or")}`);
}

/* ---------- Stock ledger ---------- */

export interface StockItemRef {
  id: string;
  unit: string;
  /** Season data: the stock at the last season count, when it was counted and by whom. */
  stock: number;
  last_counted: string;
  count_source: string;
}

export interface Variance {
  /** counted − book, in the item's unit. */
  diff: number;
  /** diff ÷ book; null when the book balance is 0. */
  fraction: number | null;
  /** "−4.0 kL (−4.3 %)", "+2 kits (+20.0 %)", "no change". */
  text: string;
}

const signed = (n: number, unit: string) => (n > 0 ? `+${formatQty(n, unit)}` : n < 0 ? `−${formatQty(-n, unit)}` : formatQty(0, unit));

/** How far a count is from the book balance just before it. */
export function variance(counted: number, book: number, unit: string): Variance {
  const diff = counted - book;
  const fraction = book === 0 ? null : diff / book;
  if (Math.abs(diff) < 1e-9) return { diff: 0, fraction: 0, text: "no change" };
  const pct = fraction === null ? "" : ` (${fraction > 0 ? "+" : "−"}${(Math.abs(fraction) * 100).toFixed(1)} %)`;
  return { diff, fraction, text: `${signed(diff, unit)}${pct}` };
}

export interface LedgerRow {
  /** event_id, or "season" for the opening row. */
  id: string;
  /** Sim time of the entry (observed_at), or the season count date. */
  at: string;
  kind: "OPENING" | "COUNT" | "RECEIPT" | "ISSUE";
  entry: string;
  /** "92.0 kL" for a count, "+48.0 kL" / "−2.5 kL" for a move. */
  qty: string;
  /** Balance after this entry, by the stock rule. */
  balance: number;
  /** False for an entry the server refused: it is listed, but it is not a fact and moves nothing. */
  counted: boolean;
  reason?: string;
  /** Counts only: how far the count was from the book balance before it. */
  variance?: Variance;
  event?: OpEvent;
}

const isStockEntry = (e: OpEvent, itemId: string) =>
  (e.type === "STOCK_COUNTED" || e.type === "STOCK_ISSUED" || e.type === "STOCK_RECEIVED") && (e.payload as { item_id: string }).item_id === itemId;

/** "station count" from the seed's count_source ("STATION_COUNT"). */
const words = (s: string) => s.replace(/_/g, " ").toLowerCase();

/**
 * Every count, receipt and issue for one item, oldest first, opened by the season count, each with
 * the balance after it. `sorted` must be in reduce order. The balance after an entry is
 * stockBalance() of the counted entries up to it: the same rule as everywhere else, never a second
 * copy of it. Entries in `refused` are listed but not counted (the server refused them).
 */
export function stockLedger(sorted: OpEvent[], item: StockItemRef, refused: ReadonlySet<string> = new Set()): LedgerRow[] {
  const entries = sorted.filter((e) => isStockEntry(e, item.id));
  const rows: LedgerRow[] = [{
    id: "season", at: item.last_counted, kind: "OPENING", entry: "Opening count (season data)",
    qty: formatQty(item.stock, item.unit), balance: item.stock, counted: true, reason: words(item.count_source),
  }];
  entries.forEach((e, i) => {
    const p = e.payload as { qty: number; reason?: string; shipment_id?: string; mission_id?: string };
    const before = entries.slice(0, i).filter((x) => !refused.has(x.event_id));
    const counted = !refused.has(e.event_id);
    const book = stockBalance(before, item.id, item.stock)?.balance ?? item.stock;
    const balance = counted ? stockBalance([...before, e], item.id, item.stock)?.balance ?? item.stock : book;
    const base = { id: e.event_id, at: e.observed_at, balance, counted, event: e };
    if (e.type === "STOCK_COUNTED") {
      rows.push({ ...base, kind: "COUNT", entry: "Count", qty: formatQty(p.qty, item.unit), reason: p.reason?.trim() || undefined, variance: variance(p.qty, book, item.unit) });
    } else if (e.type === "STOCK_RECEIVED") {
      rows.push({ ...base, kind: "RECEIPT", entry: "Receipt", qty: signed(p.qty, item.unit), reason: p.shipment_id ? `from shipment ${p.shipment_id}` : undefined });
    } else {
      rows.push({ ...base, kind: "ISSUE", entry: "Issue", qty: signed(-p.qty, item.unit), reason: [p.reason, p.mission_id && `for ${p.mission_id}`].filter(Boolean).join(", ") || undefined });
    }
  });
  return rows;
}

/** "Last count 92.0 kL on 24 Jan 04:00, minus 2.5 kL issued since." */
export function stockDerivation(sorted: OpEvent[], item: StockItemRef): string {
  const b = stockBalance(sorted.filter((e) => isStockEntry(e, item.id)), item.id, item.stock);
  if (!b) return "unknown";
  const since = b.countedAt ?? item.last_counted;
  const sum = (type: string) => b.deltas.filter((e) => e.type === type).reduce((s, e) => s + (e.payload as { qty: number }).qty, 0);
  const received = sum("STOCK_RECEIVED"), issued = sum("STOCK_ISSUED");
  const moves = [received > 0 && `plus ${formatQty(received, item.unit)} received`, issued > 0 && `minus ${formatQty(issued, item.unit)} issued`].filter(Boolean);
  const head = `Last count ${formatQty(b.base, item.unit)} on ${formatDateTime(since)}`;
  return moves.length ? `${head}, ${moves.join(" and ")} since.` : `${head}, nothing issued or received since.`;
}

/* ---------- Asset and person histories ---------- */

export interface HistoryRow {
  id: string;
  /** Sim time of the entry, when there is one. */
  at?: string;
  entry: string;
  detail?: string;
  event?: OpEvent;
}

/** "−70.62, 12.10" */
export function formatCoords(lat: number, lon: number): string {
  const f = (v: number) => (v < 0 ? `−${Math.abs(v).toFixed(2)}` : v.toFixed(2));
  return `${f(lat)}, ${f(lon)}`;
}

type Contender = { event_id: string; device_id: string; value: unknown };

/** Conflict flags and resolutions about one record (asset or person), in log order. */
function conflictRows(sorted: OpEvent[], entityType: string, entityId: string): HistoryRow[] {
  const flagged = new Map<string, string>();
  const rows: HistoryRow[] = [];
  for (const e of sorted) {
    const p = e.payload as Record<string, unknown>;
    if (e.type === "CONFLICT_FLAGGED" && p.entity_type === entityType && p.entity_id === entityId) {
      flagged.set(p.conflict_id as string, entityId);
      const contenders = (p.contenders as Contender[]).map((c) => `${String(c.value)} from ${c.device_id}`).join(", ");
      rows.push({ id: e.event_id, at: e.observed_at, entry: "Disagreement flagged", detail: `${contenders}. ${String(p.conservative_value)} kept until someone decides.`, event: e });
    }
    if (e.type === "CONFLICT_RESOLVED" && flagged.has(p.conflict_id as string)) {
      rows.push({ id: e.event_id, at: e.observed_at, entry: `Disagreement resolved: ${String(p.chosen_value)}`, detail: `Chosen by ${String(p.resolver)}`, event: e });
    }
  }
  return rows;
}

/** Status history of one asset: the season value, every ASSET_STATUS_SET, and any disagreement. */
export function assetHistory(sorted: OpEvent[], asset: { id: string; status: string; last_seen: string | null }): HistoryRow[] {
  const rows: HistoryRow[] = [{ id: "season", at: asset.last_seen ?? undefined, entry: `Status ${asset.status} (season data)` }];
  for (const e of sorted) {
    if (e.type !== "ASSET_STATUS_SET") continue;
    const p = e.payload as { asset_id: string; status: string; lat?: number; lon?: number; note?: string };
    if (p.asset_id !== asset.id) continue;
    const where = p.lat !== undefined && p.lon !== undefined ? `at ${formatCoords(p.lat, p.lon)}` : undefined;
    rows.push({ id: e.event_id, at: e.observed_at, entry: `Status ${p.status}`, detail: [p.note, where].filter(Boolean).join(", ") || undefined, event: e });
  }
  return mergeByTime(rows, conflictRows(sorted, "asset", asset.id));
}

/** Status, moves, assignments, check-ins and incidents for one person. */
export function personHistory(sorted: OpEvent[], person: { id: string; status: string; node_id: string; last_seen: string | null }, place: (node: string) => string): HistoryRow[] {
  const rows: HistoryRow[] = [{ id: "season", at: person.last_seen ?? undefined, entry: `${upperFirst(words(person.status))} at ${place(person.node_id)} (season data)` }];
  for (const e of sorted) {
    const p = e.payload as Record<string, unknown>;
    if (e.type === "PERSON_STATUS_SET" && p.person_id === person.id) rows.push({ id: e.event_id, at: e.observed_at, entry: `Status ${words(p.status as string)}`, event: e });
    if (e.type === "PERSON_MOVED" && p.person_id === person.id) {
      rows.push({ id: e.event_id, at: e.observed_at, entry: `Moved ${place(p.from_node as string)} to ${place(p.to_node as string)}`, detail: `Departs ${formatDate(p.depart as string)}, arrives ${formatDate(p.arrive as string)}`, event: e });
    }
    if (e.type === "ASSIGNMENT_SET" && p.person_id === person.id) {
      rows.push({ id: e.event_id, at: e.observed_at, entry: `Assigned to ${(p.mission_id as string | undefined) ?? (p.task as string | undefined) ?? "a task"}`, detail: `${formatDate(p.start as string)} to ${formatDate(p.end as string)}`, event: e });
    }
    if (e.type === "CHECKIN_RECORDED" && p.person_or_team_id === person.id) rows.push({ id: e.event_id, at: e.observed_at, entry: "Checked in", detail: `at ${formatCoords(p.lat as number, p.lon as number)}`, event: e });
    if (e.type === "INCIDENT_OPENED" && (p.person_ids as string[]).includes(person.id)) {
      rows.push({ id: e.event_id, at: e.observed_at, entry: `Named in incident ${p.incident_id as string}`, detail: `Last confirmed ${formatDateTime(p.last_confirmed_at as string)}`, event: e });
    }
  }
  return mergeByTime(rows, conflictRows(sorted, "person", person.id));
}

/** The season row first, then entries by sim time (a stable merge of two log-ordered lists). */
function mergeByTime(a: HistoryRow[], b: HistoryRow[]): HistoryRow[] {
  const [season, ...rest] = a;
  return [season!, ...[...rest, ...b].sort((x, y) => (x.at ?? "").localeCompare(y.at ?? ""))];
}
