import * as React from "react";
import { Link } from "react-router-dom";
import { Clapperboard, RotateCcw, Radio, Clock } from "lucide-react";
import type { LinkStatus } from "@dhruv/shared";
import { DIRECTOR_BEATS, NODES } from "@dhruv/seed";
import { createDirector, createDirectorHttpApi, type Director, type OpenDevice } from "@dhruv/store";
import { cx } from "../components/primitives";
import { LinkSwitch } from "../components/shell";
import { useDevice } from "../live/DeviceProvider";
import { nodeLabel } from "../live/chrome";

type BeatState = { status: "running" | "done" | "error"; text: string };

const CLOCK_JUMPS = [
  { label: "24 Jan 08:00", iso: "2027-01-24T08:00:00.000Z" },
  { label: "25 Jan 16:00", iso: "2027-01-25T16:00:00.000Z" },
  { label: "26 Jan 09:00", iso: "2027-01-26T09:00:00.000Z" },
];

/** Devices a client beat writes on, so the panel can say which tab must be open. */
const beatDevices = (beat: (typeof DIRECTOR_BEATS)[number]) => [...new Set(beat.events.map((e) => e.device_id))];

/**
 * Scenario Director (hidden, ?director=1, section 17): runs the section 13 beats against the real
 * server and the open device tabs. Server beats use the admin API (HQ Ops token of this tab);
 * client beats, clock jumps and link switches reach the device tabs over the Director channel.
 * A missing tab or a device-side refusal is shown, never skipped. Utilitarian on purpose.
 */
export function LiveDirector() {
  const device = useDevice();
  const token = device?.session.token;
  const isHq = device?.session.identity.role === "HQ_OPS";
  // Created in an effect, not a memo: StrictMode runs cleanups once on mount in development, and a
  // closed Director channel never answers again.
  const [director, setDirector] = React.useState<Director | null>(null);
  React.useEffect(() => {
    if (!token || !isHq) return;
    const d = createDirector({ admin: createDirectorHttpApi("", () => token), timeoutMs: 1500 });
    setDirector(d);
    return () => {
      d.close();
      setDirector(null);
    };
  }, [token, isHq]);

  const [devices, setDevices] = React.useState<OpenDevice[]>([]);
  const [beats, setBeats] = React.useState<Record<string, BeatState>>({});
  const [links, setLinks] = React.useState<Record<string, LinkStatus>>({ [NODES.MAITRI]: "ONLINE", [NODES.BHARATI]: "ONLINE" });
  const [note, setNote] = React.useState<string>("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!director) return;
    let stopped = false;
    const poll = async () => {
      const found = await director.devices();
      if (!stopped) setDevices(found);
    };
    void poll();
    const t = setInterval(() => void poll(), 3000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [director]);

  if (!device || !isHq || !director) {
    return (
      <div className="min-h-screen bg-bg p-8 font-mono text-[12px] text-fg">
        <div className="max-w-xl border-2 border-dashed border-warn p-4">
          <p className="font-bold tracking-[0.2em] text-warn">DEMO CONTROL</p>
          <p className="mt-2">The Director needs an HQ Ops session in this tab (the admin endpoints are HQ Ops only).</p>
          <Link to="/login?role=HQ_OPS" className="mt-3 inline-block text-accent underline">Sign in as HQ Ops</Link>
        </div>
      </div>
    );
  }

  const run = async (label: string, action: () => Promise<string>) => {
    setBusy(true);
    try {
      setNote(`${label}: ${await action()}`);
    } catch (err) {
      setNote(`${label} failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const runBeat = (beat: string) =>
    void run(`Beat ${beat}`, async () => {
      setBeats((b) => ({ ...b, [beat]: { status: "running", text: "running" } }));
      try {
        const r = await director.runBeat(beat);
        const text = r.where === "emergent" ? "happens on sync" : `applied on ${r.appliedOn.join(", ")}`;
        setBeats((b) => ({ ...b, [beat]: { status: "done", text } }));
        return text;
      } catch (err) {
        setBeats((b) => ({ ...b, [beat]: { status: "error", text: (err as Error).message } }));
        throw err;
      }
    });

  const open = new Set(devices.map((d) => d.device_id));

  return (
    <div className="min-h-screen bg-bg p-6">
      <div className="w-[760px] border-2 border-dashed border-warn bg-bg p-4 font-mono text-[12px] text-fg">
        <div className="mb-3 flex items-center gap-2 border-b border-line pb-2">
          <Clapperboard size={15} className="text-warn" aria-hidden />
          <span className="font-bold tracking-[0.2em] text-warn">DEMO CONTROL</span>
          <span className="text-fg-2">?director=1 · not part of the product · as {device.session.identity.device_id}</span>
          <button type="button" disabled={busy} onClick={() => void run("Reset to Start", async () => { const on = await director.reset(); setBeats({}); setLinks({ [NODES.MAITRI]: "ONLINE", [NODES.BHARATI]: "ONLINE" }); return `server and ${on.length} tab(s) cleared`; })}
            className="ml-auto flex items-center gap-1 border border-line-strong px-2 py-1 hover:border-warn disabled:opacity-50"><RotateCcw size={12} aria-hidden />Reset to Start</button>
        </div>

        <ol className="space-y-1">
          {DIRECTOR_BEATS.map((b) => {
            const state = beats[b.beat];
            const needs = beatDevices(b).filter((d) => b.where === "client" && !b.clockJump);
            const missing = needs.filter((d) => !open.has(d));
            return (
              <li key={b.beat} className={cx("flex items-center gap-2 border px-2 py-1", state?.status === "done" ? "border-line text-fg-2" : state?.status === "error" ? "border-bad/60" : "border-line-strong")}>
                <button type="button" disabled={busy} onClick={() => runBeat(b.beat)} className="w-16 shrink-0 border border-line-strong py-0.5 text-center font-bold hover:border-warn disabled:opacity-50">Beat {b.beat}</button>
                <span className="w-14 shrink-0 text-fg-2">{b.where}</span>
                <span className="flex-1">
                  {b.label}
                  {missing.length > 0 && <span className="ml-2 text-warn">needs {missing.join(", ")} open</span>}
                </span>
                {state && <span className={cx("max-w-[260px] truncate text-right", state.status === "done" ? "text-ok" : state.status === "error" ? "text-bad" : "text-fg-2")} title={state.text}>{state.status === "done" ? `done · ${state.text}` : state.text}</span>}
              </li>
            );
          })}
        </ol>

        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3">
          <div>
            <div className="mb-1 text-fg-2">Open device tabs</div>
            {devices.length === 0 ? <div className="text-warn">none answering</div> : devices.map((d) => <div key={d.device_id}>{d.device_id} · {nodeLabel(d.node_id)}</div>)}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1 text-fg-2"><Radio size={12} aria-hidden />Link per station (the tabs at that station)</div>
            {[NODES.MAITRI, NODES.BHARATI].map((node) => (
              <div key={node} className="flex items-center gap-2">
                <span className="w-16">{nodeLabel(node)}</span>
                <LinkSwitch value={links[node] ?? "ONLINE"} onChange={(v) => void run(`${nodeLabel(node)} link ${v}`, async () => {
                  const on = await director.setLink(node, v);
                  setLinks((l) => ({ ...l, [node]: v }));
                  return on.length ? `applied on ${on.join(", ")}` : "no tab at that station is open";
                })} />
              </div>
            ))}
            <div className="flex items-center gap-1 text-fg-2"><Clock size={12} aria-hidden />Clock jump (absolute, every tab)</div>
            <div className="flex gap-1">
              {CLOCK_JUMPS.map((c) => (
                <button key={c.iso} type="button" disabled={busy} onClick={() => void run(`Clock ${c.label}`, async () => `applied on ${(await director.jumpClock(c.iso)).join(", ")}`)}
                  className="border border-line-strong px-1.5 py-0.5 hover:border-warn disabled:opacity-50">{c.label}</button>
              ))}
            </div>
          </div>
        </div>
        {note && <p role="status" className="mt-3 border-t border-line pt-2 text-fg-2">{note}</p>}
      </div>
    </div>
  );
}
