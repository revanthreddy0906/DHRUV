import type { LinkStatus } from "@dhruv/shared";
import { findBeat, type BeatEvent } from "@dhruv/seed";
import { clearDeviceStore, type DhruvDb } from "./db.js";
import { now } from "./clock.js";
import { jumpClock, setLinkStatus } from "./controls.js";
import { createApiCall } from "./sync.js";
import { writeEvent, type DeviceIdentity } from "./write.js";

/**
 * Scenario Director (Build Bible sections 13 and 21, v2 section 8.1).
 *
 * Every simulated device (HQ, Maitri, FT-3) runs in its own tab with its own local store.
 * Client beats have to be written on the device that owns them, or HQ would see Maitri's
 * "offline" entries at once. So the Director sends them over a BroadcastChannel to the tab
 * that owns the device, and that tab writes them through writeEvent(). Server beats go to
 * POST /admin/director/:beat.
 */
export const DIRECTOR_CHANNEL = "dhruv-director";

export type DirectorMessage =
  | { kind: "ping"; id: string }
  | { kind: "pong"; id: string; device_id: string; node_id: string }
  | { kind: "run-events"; id: string; device_id: string; events: BeatEvent[] }
  | { kind: "clock"; id: string; now: string; forwardOnly?: boolean }
  | { kind: "link"; id: string; node_id: string; status: LinkStatus; observed_at?: string }
  | { kind: "reset"; id: string }
  | { kind: "ack"; id: string; device_id: string; ok: boolean; error?: string };

export interface DirectorEvent {
  data: DirectorMessage;
}

/** The subset of BroadcastChannel the Director uses; the real one works in browsers and Node. */
export interface DirectorChannel {
  postMessage(message: DirectorMessage): void;
  addEventListener(type: "message", listener: (event: DirectorEvent) => void): void;
  removeEventListener(type: "message", listener: (event: DirectorEvent) => void): void;
  close(): void;
}

export function openDirectorChannel(): DirectorChannel {
  return new BroadcastChannel(DIRECTOR_CHANNEL) as unknown as DirectorChannel;
}

async function applyOnDevice(db: DhruvDb, identity: DeviceIdentity, message: DirectorMessage): Promise<boolean> {
  switch (message.kind) {
    case "run-events":
      if (message.device_id !== identity.device_id) return false;
      for (const e of message.events) {
        await writeEvent(db, identity, {
          type: e.type,
          entity_type: e.entity_type,
          entity_id: e.entity_id,
          node_id: e.node_id,
          payload: e.payload,
          observed_at: e.observed_at,
          priority: e.priority,
          actor_role: e.actor_role,
        });
      }
      return true;
    case "clock":
      // forwardOnly: catch up to a server beat's time, never move a tab's clock backwards.
      if (message.forwardOnly && Date.parse(await now(db)) >= Date.parse(message.now)) return true;
      await jumpClock(db, identity, message.now);
      return true;
    case "link":
      if (message.node_id !== identity.node_id) return false;
      await setLinkStatus(db, identity, message.status, message.observed_at);
      return true;
    case "reset":
      await clearDeviceStore(db);
      return true;
    default:
      return false;
  }
}

/**
 * Run in every device tab. Answers the Director's pings and applies the messages meant for
 * this device, acknowledging each. Returns a function that detaches the listener.
 */
export function attachDirectorListener(db: DhruvDb, identity: DeviceIdentity, channel: DirectorChannel = openDirectorChannel()): () => void {
  const onMessage = async (event: DirectorEvent) => {
    const message = event.data;
    if (message.kind === "ping") {
      channel.postMessage({ kind: "pong", id: message.id, device_id: identity.device_id, node_id: identity.node_id });
      return;
    }
    if (message.kind === "pong" || message.kind === "ack") return;

    try {
      if (await applyOnDevice(db, identity, message)) {
        channel.postMessage({ kind: "ack", id: message.id, device_id: identity.device_id, ok: true });
      }
    } catch (err) {
      channel.postMessage({ kind: "ack", id: message.id, device_id: identity.device_id, ok: false, error: (err as Error).message });
    }
  };
  channel.addEventListener("message", onMessage);
  return () => channel.removeEventListener("message", onMessage);
}

export interface DirectorAdminApi {
  runServerBeat(beat: string): Promise<{ events_created: number }>;
  resetServer(): Promise<void>;
}

/** Admin calls need an authenticated session; the Director panel runs inside a logged-in tab. */
export function createDirectorHttpApi(baseUrl: string, getToken: () => string, fetchImpl: typeof fetch = fetch): DirectorAdminApi {
  const call = createApiCall(baseUrl, getToken, fetchImpl);
  return {
    runServerBeat: (beat) => call(`/admin/director/${encodeURIComponent(beat)}`, { method: "POST" }),
    resetServer: async () => {
      await call("/admin/seed", { method: "POST" });
    },
  };
}

export interface OpenDevice {
  device_id: string;
  node_id: string;
}

export interface BeatResult {
  beat: string;
  label: string;
  where: "server" | "client" | "emergent";
  /** Device ids that applied it, or "server". */
  appliedOn: string[];
  eventsCreated: number;
}

export interface DirectorOptions {
  channel?: DirectorChannel;
  admin: DirectorAdminApi;
  /** How long to wait for devices to answer. */
  timeoutMs?: number;
  /** Overrides a beat's stepDelayMs (tests use 0). */
  stepDelayMs?: number;
}

export interface Director {
  devices(): Promise<OpenDevice[]>;
  runBeat(beat: string): Promise<BeatResult>;
  jumpClock(now: string): Promise<string[]>;
  setLink(nodeId: string, status: LinkStatus, observedAt?: string): Promise<string[]>;
  /** Reset to Start: server state and every open device's local store. */
  reset(): Promise<string[]>;
  close(): void;
}

type Pong = Extract<DirectorMessage, { kind: "pong" }>;
type Ack = Extract<DirectorMessage, { kind: "ack" }>;
type Reply = Pong | Ack;

export function createDirector({ channel = openDirectorChannel(), admin, timeoutMs = 500, stepDelayMs }: DirectorOptions): Director {
  let counter = 0;
  const nextId = () => `dir-${Date.now()}-${++counter}`;

  /** Posts a message and collects replies of `replyKind` until `expected` have all answered or time runs out. */
  function exchange(message: DirectorMessage, replyKind: "pong", expected?: Set<string>): Promise<Pong[]>;
  function exchange(message: DirectorMessage, replyKind: "ack", expected?: Set<string>): Promise<Ack[]>;
  function exchange(message: DirectorMessage, replyKind: Reply["kind"], expected?: Set<string>): Promise<Reply[]> {
    return new Promise<Reply[]>((resolve) => {
      const replies: Reply[] = [];
      const finish = () => {
        clearTimeout(timer);
        channel.removeEventListener("message", onMessage);
        resolve(replies);
      };
      const onMessage = (event: DirectorEvent) => {
        const reply = event.data;
        if (reply.kind !== replyKind || reply.id !== message.id) return;
        replies.push(reply as Reply);
        if (expected && [...expected].every((d) => replies.some((r) => r.device_id === d))) finish();
      };
      const timer = setTimeout(finish, timeoutMs);
      channel.addEventListener("message", onMessage);
      channel.postMessage(message);
    });
  }

  async function devices(): Promise<OpenDevice[]> {
    const pongs = await exchange({ kind: "ping", id: nextId() }, "pong");
    return pongs.map(({ device_id, node_id }) => ({ device_id, node_id }));
  }

  /** Sends to the devices that should apply it and fails loudly if any is missing or errors. */
  async function command(message: DirectorMessage, targets: string[]): Promise<string[]> {
    if (targets.length === 0) throw new Error("no device tab is open for this command");
    const acks = await exchange(message, "ack", new Set(targets));
    const missing = targets.filter((d) => !acks.some((a) => a.device_id === d));
    if (missing.length > 0) throw new Error(`no response from ${missing.join(", ")}; open that device's tab`);
    const failed = acks.find((a) => !a.ok);
    if (failed) throw new Error(`${failed.device_id}: ${failed.error}`);
    return acks.map((a) => a.device_id);
  }

  const jump = async (now: string) => command({ kind: "clock", id: nextId(), now }, (await devices()).map((d) => d.device_id));

  const setLink = async (nodeId: string, status: LinkStatus, observedAt?: string) => {
    const targets = (await devices()).filter((d) => d.node_id === nodeId).map((d) => d.device_id);
    return command({ kind: "link", id: nextId(), node_id: nodeId, status, observed_at: observedAt }, targets);
  };

  async function runBeat(beatId: string): Promise<BeatResult> {
    const beat = findBeat(beatId);
    if (!beat) throw new Error(`no Director beat ${beatId}`);
    const base = { beat: beat.beat, label: beat.label, where: beat.where };

    if (beat.where === "server") {
      const { events_created } = await admin.runServerBeat(beat.beat);
      // Every open tab catches up to the beat's time, so what the beat recorded is not in their
      // future (an approval dated before the proposal it approves is refused by the server).
      const at = [...beat.events.map((e) => e.observed_at), ...(beat.approve ? [beat.approve.observed_at] : [])].sort().at(-1);
      const open = at ? (await devices()).map((d) => d.device_id) : [];
      if (at && open.length > 0) await command({ kind: "clock", id: nextId(), now: at, forwardOnly: true }, open);
      return { ...base, appliedOn: ["server"], eventsCreated: events_created };
    }
    if (beat.where === "emergent") return { ...base, appliedOn: [], eventsCreated: 0 };

    if (beat.clockJump) {
      const appliedOn = await jump(beat.clockJump);
      return { ...base, appliedOn, eventsCreated: appliedOn.length };
    }

    const delay = stepDelayMs ?? beat.stepDelayMs ?? 0;
    // With a pause, send one event at a time; otherwise one batch per device.
    const steps: BeatEvent[][] = [];
    if (delay > 0) {
      for (const e of beat.events) steps.push([e]);
    } else {
      const byDevice = new Map<string, BeatEvent[]>();
      for (const e of beat.events) byDevice.set(e.device_id, [...(byDevice.get(e.device_id) ?? []), e]);
      steps.push(...byDevice.values());
    }

    const appliedOn = new Set<string>();
    for (const [i, events] of steps.entries()) {
      if (i > 0 && delay > 0) await new Promise((r) => setTimeout(r, delay));
      const [firstEvent] = events;
      if (!firstEvent) continue;
      const deviceId = firstEvent.device_id;
      for (const d of await command({ kind: "run-events", id: nextId(), device_id: deviceId, events }, [deviceId])) appliedOn.add(d);
    }
    return { ...base, appliedOn: [...appliedOn], eventsCreated: beat.events.length };
  }

  async function reset(): Promise<string[]> {
    await admin.resetServer();
    const open = await devices();
    return open.length === 0 ? [] : command({ kind: "reset", id: nextId() }, open.map((d) => d.device_id));
  }

  return { devices, runBeat, jumpClock: jump, setLink, reset, close: () => channel.close() };
}
