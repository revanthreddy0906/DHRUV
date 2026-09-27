import * as React from "react";
import { Link } from "react-router-dom";
import { Clapperboard, RotateCcw, Radio, Clock, Hand, ExternalLink } from "lucide-react";
import type { LinkStatus, OpEvent } from "@dhruv/shared";
import { DEFAULT_SCENARIO, NODES, SCENARIOS, scenarioById, type DirectorBeat } from "@dhruv/seed";
import { createDirector, createDirectorHttpApi, type Director, type OpenDevice } from "@dhruv/store";
import { cx } from "../components/primitives";
import { LinkSwitch } from "../components/shell";
import { useDevice } from "../live/DeviceProvider";
import { nodeLabel } from "../live/chrome";

type BeatState = { status: "running" | "done" | "error"; text: string };

/** Devices a client beat writes on, so the panel can say which tab must be open. */
const beatDevices = (beat: DirectorBeat) => [...new Set(beat.events.map((e) => e.device_id))];

/** An operator step is done once an event of its type (with its payload fields) is in this tab's log. */
function operatorDone(beat: DirectorBeat, events: OpEvent[] | undefined): boolean {
  const expect = beat.operator?.expect;
  if (!expect || !events) return false;
  return events.some((e) => e.type === expect.type && Object.entries(expect.payload ?? {}).every(([k, v]) => (e.payload as Record<string, unknown>)[k] === v));
}

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
    const admin = createDirectorHttpApi("", () => token);
    const d = createDirector({ admin, timeoutMs: 1500 });
    setDirector(d);
    void admin.activeScenario?.().then((id) => { setActive(id); setScenarioId(id); }).catch(() => undefined);
    return () => {
      d.close();
      setDirector(null);
    };
  }, [token, isHq]);

  const [scenarioId, setScenarioId] = React.useState(DEFAULT_SCENARIO);
  /** The scenario the server was last reset to: beats run against it. */
  const [active, setActive] = React.useState<string>();
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
      <div className="min-h-screen bg-bg p-8 font-mono text-xs text-fg">
        <div className="max-w-xl border-2 border-dashed border-warn p-4">
          <p className="font-bold text-warn">Demo control</p>
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
        const r = await director.runBeat(beat, scenario.id);
        const text = r.where === "emergent" ? "happens on sync" : `applied on ${r.appliedOn.join(", ")}`;
        setBeats((b) => ({ ...b, [beat]: { status: "done", text } }));
        return text;
      } catch (err) {
        setBeats((b) => ({ ...b, [beat]: { status: "error", text: (err as Error).message } }));
        throw err;
      }
    });

  const scenario = scenarioById(scenarioId) ?? SCENARIOS[0]!;
  const stale = active !== undefined && active !== scenario.id;
  const open = new Set(devices.map((d) => d.device_id));
  // A device answering from two tabs would get each client beat twice: show it, don't hide it.
  const answers = new Map<string, { node_id: string; count: number }>();
  for (const d of devices) answers.set(d.device_id, { node_id: d.node_id, count: (answers.get(d.device_id)?.count ?? 0) + 1 });

  return (
    <div className="min-h-screen bg-bg p-6">
      <div className="w-[920px] max-w-full border-2 border-dashed border-warn bg-bg p-4 font-mono text-xs text-fg">
        <div className="mb-3 flex items-center gap-2 border-b border-line pb-2">
          <Clapperboard size={15} className="text-warn" aria-hidden />
          <span className="font-bold text-warn">Demo control</span>
          <span className="text-fg-2">not part of the product · as {device.session.identity.device_id}</span>
          <Link to="/command" className="border border-line-strong px-2 py-1 text-fg-2 hover:text-fg">← Command</Link>
          <button type="button" disabled={busy} onClick={() => void run("Reset to Start", async () => { const on = await director.reset(scenario.id); setActive(scenario.id); setBeats({}); setLinks({ [NODES.MAITRI]: "ONLINE", [NODES.BHARATI]: "ONLINE" }); return `server reset to ${scenario.id}, ${on.length} tab(s) cleared`; })}
            className="ml-auto flex items-center gap-1 border border-line-strong px-2 py-1 hover:border-warn disabled:opacity-50"><RotateCcw size={12} aria-hidden />Reset to Start</button>
        </div>

        <div className="mb-3 space-y-1 border-b border-line pb-3">
          <label className="flex items-center gap-2">
            <span className="text-fg-2">Scenario</span>
            <select aria-label="Scenario" value={scenario.id} onChange={(e) => { setScenarioId(e.target.value); setBeats({}); }} className="border border-line-strong bg-bg px-2 py-1 text-fg">
              {SCENARIOS.map((sc) => <option key={sc.id} value={sc.id}>{sc.title}</option>)}
            </select>
          </label>
          <p className="text-fg-2">{scenario.blurb}</p>
          {stale && <p className="text-warn">The server is on {active}. Press Reset to Start to switch it to {scenario.id} before running beats.</p>}
        </div>

        <ol className="space-y-1">
          {scenario.beats.map((b) => {
            const state = beats[b.beat];
            const needs = beatDevices(b).filter((d) => (b.where === "client" || b.where === "operator") && !b.clockJump);
            const missing = needs.filter((d) => !open.has(d));
            const byHand = b.where === "operator" && operatorDone(b, device.snapshot?.events);
            return (
              <li key={b.beat} className={cx("border px-2 py-1", state?.status === "done" || byHand ? "border-line text-fg-2" : state?.status === "error" ? "border-bad/60" : b.where === "operator" ? "border-accent/60" : "border-line-strong")}>
                <div className="flex items-center gap-2">
                  <button type="button" disabled={busy || stale} onClick={() => runBeat(b.beat)} title={b.where === "operator" ? "Do it for me" : undefined}
                    className="w-16 shrink-0 border border-line-strong py-0.5 text-center font-bold hover:border-warn disabled:opacity-50">Beat {b.beat}</button>
                  <span className={cx("w-16 shrink-0", b.where === "operator" ? "text-accent" : "text-fg-2")}>{b.where === "operator" ? "by hand" : b.where}</span>
                  <span className="flex-1">
                    {b.label}
                    {missing.length > 0 && <span className="ml-2 text-warn">needs {missing.join(", ")} open</span>}
                  </span>
                  {byHand && !state && <span className="text-ok">done in the app</span>}
                  {state && <span className={cx("max-w-[260px] truncate text-right", state.status === "done" ? "text-ok" : state.status === "error" ? "text-bad" : "text-fg-2")} title={state.text}>{state.status === "done" ? `done · ${state.text}` : state.text}</span>}
                </div>
                {b.operator && !byHand && (
                  <div className="ml-[8.5rem] mt-1 flex items-start gap-1.5 text-accent"><Hand size={12} className="mt-0.5 shrink-0" aria-hidden />{b.operator.instruction}<span className="text-fg-2"> · or press the beat to have it done</span></div>
                )}
                {b.real && (
                  <div className="ml-[8.5rem] mt-0.5 text-xs text-fg-2">
                    <span className="text-fg">What really happened, {b.real.when}:</span> {b.real.text}{" "}
                    <a href={b.real.source} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline hover:text-fg">source<ExternalLink size={10} aria-hidden /></a>
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3">
          <div>
            <div className="mb-1 text-fg-2">Open device tabs</div>
            {answers.size === 0 ? <div className="text-warn">none answering</div> : [...answers].map(([id, a]) => (
              <div key={id} className={cx(a.count > 1 && "text-bad")}>{id} · {nodeLabel(a.node_id)}{a.count > 1 && ` · answering from ${a.count} tabs, close the extras`}</div>
            ))}
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
              {scenario.clockJumps.map((c) => (
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
