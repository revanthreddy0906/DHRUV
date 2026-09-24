import * as React from "react";
import { MapPinCheck, Siren, CloudOff, CloudUpload, Info, Mountain, Lock, Clock3 } from "lucide-react";
import { SYNTHETIC_BANNER } from "../data/demo";
import { cx, FreshnessChip } from "./primitives";

export function CheckInButton({ onClick, lastAt }: { onClick?: () => void; lastAt: string }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full flex-col items-center justify-center gap-1 rounded-2xl bg-accent py-7 text-on-accent active:scale-[.99]">
      <MapPinCheck size={34} aria-hidden />
      <span className="text-2xl font-bold">Check in</span>
      <span className="font-mono text-xs font-medium opacity-80">last {lastAt}</span>
    </button>
  );
}

export function GoNoGo({ value, onChange }: { value: "GO" | "NO_GO" | null; onChange?: (v: "GO" | "NO_GO") => void }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-2">Go / no-go · own team FT-3</div>
      <div role="radiogroup" className="grid grid-cols-2 gap-2">
        {(["GO", "NO_GO"] as const).map((v) => (
          <button key={v} role="radio" aria-checked={value === v} type="button" onClick={() => onChange?.(v)}
            className={cx("h-14 rounded-xl border text-lg font-bold", value === v ? (v === "GO" ? "border-ok bg-ok-tint text-ok" : "border-bad bg-bad-tint text-bad") : "border-line-strong bg-surface text-fg")}>
            {v === "GO" ? "GO" : "NO-GO"}
          </button>
        ))}
      </div>
    </div>
  );
}

export function RaiseIncident({ onClick }: { onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-bad bg-bad-tint text-lg font-bold text-bad">
      <Siren size={20} aria-hidden />Raise incident
    </button>
  );
}

/** Field Lead mobile PWA home. Recomposed, not a shrunk desktop. */
export function FieldHome({ offline = false, pending = 0, oldest, clock = "25 JAN 2027 07:00" }: { offline?: boolean; pending?: number; oldest?: string; clock?: string }) {
  const [go, setGo] = React.useState<"GO" | "NO_GO" | null>(null);
  return (
    <div className="flex h-[844px] w-[390px] flex-col overflow-hidden rounded-[28px] border border-line-strong bg-bg text-fg">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 pb-2 pt-4">
        <div><div className="font-mono text-sm font-bold tracking-[0.2em]">DHRUV</div><div className="font-mono text-[10px] text-fg-2">FT3-TAB-01 · Field Lead · FT-3</div></div>
        <div className="text-right font-mono text-[11px]"><div className="font-semibold">{clock}</div>
          <div className={cx("flex items-center justify-end gap-1", offline ? "text-bad" : "text-fg-2")}>{offline ? <CloudOff size={11} /> : <CloudUpload size={11} />}{offline ? "OFFLINE" : "via Maitri"} · SYNC {pending}{oldest && ` · ${oldest}`}</div>
          <div className="text-[9px] uppercase tracking-wider text-fg-2">simulated link</div></div>
      </header>
      <div className="flex items-center gap-1.5 bg-elevated px-4 py-1 text-[10.5px] text-fg-2"><Info size={11} className="shrink-0 text-accent" aria-hidden />{SYNTHETIC_BANNER}</div>
      {offline && <div role="status" className="border-b border-warn/40 bg-warn-tint px-4 py-2 font-mono text-[11px]"><b className="text-warn">⚠ OFFLINE</b> · check-ins and incidents queue locally · {pending} pending</div>}
      <main className="flex-1 space-y-4 overflow-auto p-4">
        <section className="rounded-xl border border-line bg-surface p-3.5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-fg-2"><Mountain size={13} aria-hidden />Own mission</div>
          <div className="mt-1 text-lg font-semibold">F-27 support · with SK-4</div>
          <div className="text-[13px] text-fg-2">Dr A. Verma · R. Nair</div>
        </section>
        <CheckInButton lastAt="25 Jan 07:00" />
        <section className="rounded-xl border border-line bg-surface p-3.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-2">Position</div>
          <div className="mt-1 font-mono text-base">−70.62, 12.10</div>
          <div className="mt-1 flex flex-wrap items-center gap-2"><FreshnessChip cls="FRESH" label="confirmed 25 Jan 07:00 · 0 min" /></div>
          <div className="mt-2 flex items-center gap-1.5 text-[12px] text-fg-2"><Clock3 size={12} aria-hidden />Next check-in due 11:00 · overdue at 14:00 (3 h grace)</div>
        </section>
        <GoNoGo value={go} onChange={setGo} />
        <RaiseIncident />
        <p className="flex items-start gap-1.5 text-[11px] leading-4 text-fg-2"><Lock size={12} className="mt-0.5 shrink-0" aria-hidden />Decisions are approved by HQ Ops or the Station Leader. Field Leads check in, raise incidents and set go/no-go for their own team.</p>
      </main>
    </div>
  );
}
