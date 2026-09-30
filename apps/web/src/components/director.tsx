import * as React from "react";
import { Clapperboard, RotateCcw } from "lucide-react";
import { DIRECTOR_BEATS, DEVICES } from "../data/demo";
import { cx } from "./primitives";
import { LinkSwitch } from "./shell";
import type { LinkStatus } from "../data/types";

/** Hidden demo control (?director=1). Utilitarian on purpose. */
export function DirectorPanel({ done = 0, onBeat, onReset }: { done?: number; onBeat?: (n: number) => void; onReset?: () => void }) {
  const [links, setLinks] = React.useState<Record<string, LinkStatus>>({ Maitri: "ONLINE", Bharati: "ONLINE" });
  return (
    <div className="w-[560px] border-2 border-dashed border-warn bg-bg p-4 font-mono text-xs text-fg">
      <div className="mb-3 flex items-center gap-2 border-b border-line pb-2">
        <Clapperboard size={15} className="text-warn" aria-hidden />
        <span className="font-bold text-warn">DEMO CONTROL</span>
        <span className="text-fg-2">?director=1 · not part of the product</span>
        <button type="button" onClick={onReset} className="ml-auto flex items-center gap-1 border border-line-strong px-2 py-1 hover:border-warn"><RotateCcw size={12} />Reset to Start</button>
      </div>
      <ol className="space-y-1">
        {DIRECTOR_BEATS.map((b) => (
          <li key={b.n} className={cx("flex items-center gap-2 border px-2 py-1", b.n <= done ? "border-line text-fg-2" : "border-line-strong")}>
            <button type="button" onClick={() => onBeat?.(b.n)} className="w-14 shrink-0 border border-line-strong py-0.5 text-center font-bold hover:border-warn">Beat {b.n}</button>
            <span className="w-32 shrink-0 text-fg-2">{b.at}</span>
            <span className="flex-1">{b.text}</span>
            {b.n <= done && <span className="text-ok">done</span>}
          </li>
        ))}
      </ol>
      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3">
        <div>
          <div className="mb-1 text-fg-2">Devices</div>
          {DEVICES.map((d) => <div key={d.id}>{d.id} · {d.roleLabel} · {d.node}</div>)}
        </div>
        <div className="space-y-2">
          <div className="text-fg-2">Link per station</div>
          {Object.keys(links).map((k) => <div key={k} className="flex items-center gap-2"><span className="w-14">{k}</span><LinkSwitch value={links[k]} onChange={(v) => setLinks({ ...links, [k]: v })} /></div>)}
          <div className="text-fg-2">Clock jump</div>
          <div className="flex gap-1">{["24 Jan 08:00", "25 Jan 16:00", "26 Jan 09:00"].map((t) => <button key={t} type="button" className="border border-line-strong px-1.5 py-0.5 hover:border-warn">{t}</button>)}</div>
        </div>
      </div>
    </div>
  );
}
