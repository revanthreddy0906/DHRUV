import * as React from "react";
import type { OpEvent } from "@dhruv/shared";
import { entryPlace, entryPlaceText, formatDateTime, roleWords, type DeviceOutboxView, type HistoryRow } from "../format";
import { cx } from "./primitives";

/**
 * Pieces shared by the record pages (stock card, asset record, person record): who recorded an
 * entry on which device, and where that entry is now. Plain words only: no seq, cursor or epoch.
 */

/** "At HQ" (HQ's real-clock receipt time in the tooltip), "Waiting to send · on …", "Refused: …". */
export function WhereCell({ event, outbox }: { event?: OpEvent; outbox: DeviceOutboxView }) {
  if (!event) return <span className="text-fg-2">Season data</span>;
  const p = entryPlaceText(entryPlace(event, outbox));
  return (
    <span title={p.tooltip} className={cx(p.tone === "warn" ? "font-semibold text-warn" : p.tone === "bad" ? "font-semibold text-bad" : "text-fg", p.tooltip && "cursor-help underline decoration-dotted decoration-line-strong underline-offset-2")}>
      {p.text}
    </span>
  );
}

/** Role on the first line, device id (mono) under it. */
export function RecordedBy({ event }: { event?: OpEvent }) {
  if (!event) return <span className="text-fg-2">Season data</span>;
  return (
    <span className="block leading-tight">
      <span className="block whitespace-nowrap text-fg">{roleWords(event.actor_role)}</span>
      <span className="block whitespace-nowrap font-mono text-xs text-fg-2">{event.device_id}</span>
    </span>
  );
}

export const TH = "px-3 py-2 text-left text-xs font-semibold text-fg-2";
export const TD = "px-3 py-2.5 align-top text-sm";

/** Status history of an asset or a person, oldest first, with who and where for every entry. */
export function HistoryTable({ rows, outbox }: { rows: HistoryRow[]; outbox: DeviceOutboxView }) {
  return (
    <table className="w-full">
      <thead className="bg-elevated">
        <tr>{["Date", "Entry", "Detail", "Recorded by", "Where this entry is"].map((h) => <th key={h} className={TH}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className={cx("border-t border-line", r.event && outbox.rejected.has(r.event.event_id) && "bg-bad-tint/50")}>
            <td className={cx(TD, "whitespace-nowrap font-mono text-fg-2")}>{r.at ? formatDateTime(r.at) : "season start"}</td>
            <td className={cx(TD, "text-fg")}>{r.entry}</td>
            <td className={cx(TD, "text-fg-2")}>{r.detail ?? ""}</td>
            <td className={TD}><RecordedBy event={r.event} /></td>
            <td className={TD}><WhereCell event={r.event} outbox={outbox} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** "Maintained by" lines from EVENT_RULES, as a small definition block. */
export function MaintainedBy({ lines, owner }: { lines: string[]; owner: string }) {
  return (
    <div className="space-y-1 text-sm">
      <p className="text-fg">Owned by {owner}. Every change is an entry below; entries are never edited.</p>
      <ul className="text-fg-2">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
    </div>
  );
}
