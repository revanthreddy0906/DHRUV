import type { MilestoneState, ShipmentMilestones } from "@dhruv/engine";
import { cx } from "../components/primitives";
import { dayLabel } from "./describe";

const TONE: Record<MilestoneState, string> = {
  DONE: "border-line-strong text-fg-2",
  ON_TRACK: "border-ok/50 text-ok",
  AT_RISK: "border-warn/60 text-warn",
  MISSED: "border-bad/60 text-bad",
  UNKNOWN: "border-line text-fg-2",
};
const WORD: Record<MilestoneState, string> = { DONE: "done", ON_TRACK: "on track", AT_RISK: "at risk", MISSED: "missed", UNKNOWN: "unknown" };

/** Planned vs latest vs now, worked back from the date the cargo must be on station. */
export function MilestoneStrip({ m }: { m: ShipmentMilestones }) {
  if (m.milestones.length === 0) return null;
  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-2">Milestones · worked back from the date it must be on station</div>
      <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {m.milestones.map((x) => (
          <li key={x.key} className={cx("rounded-md border px-2.5 py-1.5", TONE[x.state])}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] font-medium text-fg">{x.label}</span>
              <span className="font-mono text-[10px] font-semibold uppercase">{WORD[x.state]}</span>
            </div>
            <div className="font-mono text-[10.5px] text-fg-2">
              {[x.latest && `latest ${dayLabel(x.latest)}`, x.planned && `plan ${dayLabel(x.planned)}`].filter(Boolean).join(" · ")}
              {x.current && x.current !== x.planned && <> · <b className="text-fg">now {dayLabel(x.current)}</b></>}
            </div>
            <div className="text-[11px] text-fg-2">{x.note}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}
