import * as React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, OctagonAlert, TriangleAlert } from "lucide-react";
import { SectionHeader, Tag, cx } from "../components/primitives";
import type { OpsException, OwnerRole } from "./exceptions";

const OWNER: Record<OwnerRole, string> = { HQ_OPS: "HQ Ops", STATION_LEADER: "Station Leader", FIELD_LEAD: "Field Lead" };

/** Exceptions with owner and playbook; the first one open, the rest one click away. */
export function ExceptionQueue({ items, role }: { items: OpsException[]; role: OwnerRole }) {
  const [open, setOpen] = React.useState<string | undefined>(items[0]?.id);
  return (
    <section aria-label="Exceptions">
      <SectionHeader title="Exceptions" meta={<span className="font-mono text-xs text-fg-2">{items.length}</span>} />
      {items.length === 0 ? <p className="text-xs text-fg-2">Nothing needs action. Every station is within its thresholds and every shipment is on track.</p> : (
        <ul className="space-y-1.5">
          {items.map((e) => {
            const expanded = open === e.id;
            const mine = e.owners.includes(role);
            const Icon = e.severity === "RED" ? OctagonAlert : TriangleAlert;
            return (
              <li key={e.id} className={cx("rounded-lg border bg-surface", e.severity === "RED" ? "border-bad/50" : "border-warn/40")}>
                <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? undefined : e.id)} className="flex w-full items-start gap-2 px-3 py-2 text-left">
                  <Icon size={14} className={cx("mt-0.5 shrink-0", e.severity === "RED" ? "text-bad" : "text-warn")} aria-label={e.severity} />
                  <span className="flex-1 text-sm leading-5 text-fg">{e.title}</span>
                  <ChevronRight size={14} className={cx("mt-0.5 shrink-0 text-fg-2 transition-transform", expanded && "rotate-90")} aria-hidden />
                </button>
                {expanded && (
                  <div className="space-y-2 border-t border-line px-3 pb-3 pt-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-fg-2">Owner</span>
                      {e.owners.map((o) => <Tag key={o} tone={o === role ? "accent" : "neutral"}>{OWNER[o]}</Tag>)}
                      {!mine && <span className="text-fg-2">· for information</span>}
                    </div>
                    <p className="text-fg-2">{e.why}</p>
                    <ol className="list-decimal space-y-0.5 pl-4 text-fg">{e.playbook.map((s, i) => <li key={i}>{s}</li>)}</ol>
                    <Link to={e.link.to} className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">Open {e.link.label}<ChevronRight size={12} aria-hidden /></Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
