import * as React from "react";
import { liveQuery } from "dexie";
import { config, type LinkStatus, type OpEvent, type Seed } from "@dhruv/shared";
import {
  attachDirectorListener, bootstrap, cachedSeed, createApiCall, createHttpApi, jumpClock, linkStatus, now, openDeviceDb,
  setLinkStatus, setMeta, syncOnce, syncStatus, writeEvent, type ApiCall, type DhruvDb, type EventDraft, type OutboxEntry, type SyncOutcome, type SyncStatus,
} from "@dhruv/store";
import { STATION_NODES } from "@dhruv/seed";
import { addHours } from "./format";
import { loadSession, saveSession, type Session } from "./session";

/** Section 9: one sync cycle every 3 s; failures back off per syncOnce. */
export const SYNC_INTERVAL_MS = 3000;

export interface DeviceSnapshot {
  /** This device's demo clock (local CLOCK_ADVANCED, v2 C5). */
  now: string;
  /** This device's simulated link. */
  link: LinkStatus;
  sync: SyncStatus;
  events: OpEvent[];
  seed: Seed | null;
  /** Per station: when this device last received an event written at that station, if ever. */
  lastHeard: Record<string, string | null>;
  /** Event ids still in this device's outbox (not yet accepted by the server). */
  pendingIds: Set<string>;
  /** Event ids the server refused on sync, with its reason (or code). They are not facts. */
  rejected: Map<string, string>;
  /** This device's outbox: pending entries in drain order, then refused ones. */
  outbox: OutboxEntry[];
}

export interface LastSync {
  at: number;
  outcome: SyncOutcome;
}

export interface LiveDevice {
  session: Session;
  db: DhruvDb;
  snapshot: DeviceSnapshot | null;
  lastSync: LastSync | null;
  /** Authenticated JSON call to /api/v1 (online actions such as approve). */
  call: ApiCall;
  /** Writes an event through the only write path; it syncs on the next cycle. */
  write(draft: EventDraft): Promise<OpEvent>;
  /** Runs a sync cycle now instead of waiting for the next tick. */
  syncNow(): void;
  /** Clears the failure count (stalled) and syncs now. */
  retry(): Promise<void>;
  jump(hours: number): Promise<void>;
  resetClock(): Promise<void>;
  setLink(status: LinkStatus): Promise<void>;
  signOut(): void;
}

interface DeviceContextValue {
  device: LiveDevice | null;
  /** Another tab already acts as this tab's device: this tab must not sync or answer the Director. */
  duplicateOf: string | null;
  signIn(session: Session): Promise<void>;
  signOut(): void;
}

const DeviceContext = React.createContext<DeviceContextValue>({ device: null, duplicateOf: null, signIn: async () => {}, signOut: () => {} });

const lockName = (deviceId: string) => `dhruv-device-${deviceId}`;

/** True when some tab holds this device's lock (one tab is one device). */
async function deviceOpenElsewhere(deviceId: string): Promise<boolean> {
  if (!navigator.locks) return false;
  const state = await navigator.locks.query();
  return (state.held ?? []).some((l) => l.name === lockName(deviceId));
}

/**
 * Holds the device lock while this tab is signed in. Two tabs as the same device would both sync
 * and both write the Director's beats with clashing seq numbers, so the second one stands down.
 * Returns null while checking, true when this tab owns the device, false when another tab does.
 */
function useDeviceLock(deviceId: string | null): boolean | null {
  const [owned, setOwned] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    if (!deviceId) return;
    if (!navigator.locks) {
      setOwned(true);
      return;
    }
    setOwned(null);
    let release: (() => void) | undefined;
    let cancelled = false;
    // A few tries: StrictMode's remount asks again before the first release has landed.
    const attempt = (tries: number) =>
      navigator.locks.request(lockName(deviceId), { ifAvailable: true }, (lock) => {
        if (cancelled) return;
        if (!lock) {
          if (tries > 0) setTimeout(() => void attempt(tries - 1), 150);
          else setOwned(false);
          return;
        }
        setOwned(true);
        return new Promise<void>((resolve) => (release = resolve));
      });
    void attempt(3);
    return () => {
      cancelled = true;
      release?.();
    };
  }, [deviceId]);
  return owned;
}

/** The signed-in device of this tab, or null (not signed in: screens show their design fixtures). */
export function useDevice(): LiveDevice | null {
  return React.useContext(DeviceContext).device;
}

export function useSignIn(): (session: Session) => Promise<void> {
  return React.useContext(DeviceContext).signIn;
}

/** The device id when another tab already acts as this tab's device, else null. */
export function useDuplicateDevice(): { deviceId: string | null; signOut(): void } {
  const ctx = React.useContext(DeviceContext);
  return { deviceId: ctx.duplicateOf, signOut: ctx.signOut };
}

async function readSnapshot(db: DhruvDb, session: Session): Promise<DeviceSnapshot> {
  const { identity } = session;
  const [clock, link, sync, events, seed, outbox] = await Promise.all([
    now(db), linkStatus(db, identity.node_id), syncStatus(db), db.events.toArray(), cachedSeed(db), db.outbox.toArray(),
  ]);

  const lastHeard: Record<string, string | null> = {};
  for (const node of STATION_NODES) {
    const heard = events
      .filter((e) => e.node_id === node && e.device_id !== identity.device_id && (e.actor_role === "STATION_LEADER" || e.actor_role === "FIELD_LEAD"))
      .map((e) => e.observed_at)
      .sort();
    lastHeard[node] = heard.at(-1) ?? null;
  }
  return {
    now: clock, link, sync, events, seed, lastHeard,
    pendingIds: new Set(outbox.filter((o) => o.status === "pending").map((o) => o.event.event_id)),
    rejected: new Map(outbox.filter((o) => o.status === "rejected").map((o) => [o.event.event_id, o.rejected_message ?? o.rejected_code ?? "REJECTED"])),
    outbox: [...outbox].sort((a, b) => (a.status === b.status ? a.priority - b.priority || a.seq - b.seq : a.status === "pending" ? -1 : 1)),
  };
}

const isAuthError = (outcome: SyncOutcome) => !outcome.ok && "error" in outcome && /token/i.test(outcome.error);

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(() => loadSession());
  const owned = useDeviceLock(session?.identity.device_id ?? null);
  // No store, sync or Director listener until this tab owns the device.
  const db = React.useMemo(() => (session && owned ? openDeviceDb(session.identity.device_id) : null), [session, owned]);
  const [snapshot, setSnapshot] = React.useState<DeviceSnapshot | null>(null);
  const [lastSync, setLastSync] = React.useState<LastSync | null>(null);
  const kick = React.useRef<() => void>(() => {});

  const signOut = React.useCallback(() => {
    saveSession(null);
    setSession(null);
    setSnapshot(null);
    setLastSync(null);
  }, []);

  const signIn = React.useCallback(async (next: Session) => {
    if (await deviceOpenElsewhere(next.identity.device_id)) {
      throw new Error(`${next.identity.device_id} is already open in another tab. One tab is one device: use that tab, or another device id`);
    }
    const nextDb = openDeviceDb(next.identity.device_id);
    await bootstrap(nextDb, next.identity, createApiCall("", () => next.token));
    nextDb.close();
    saveSession(next);
    setSession(next);
  }, []);

  // Live view of the local store: re-reads whenever events, outbox or meta change.
  React.useEffect(() => {
    if (!db || !session) return;
    const subscription = liveQuery(() => readSnapshot(db, session)).subscribe({ next: setSnapshot, error: (err) => console.error(err) });
    return () => subscription.unsubscribe();
  }, [db, session]);

  // Scenario Director: this tab answers pings and applies the beats meant for this device.
  React.useEffect(() => {
    if (!db || !session) return;
    return attachDirectorListener(db, session.identity);
  }, [db, session]);

  // Sync loop (section 9): drain the outbox in priority order, then pull.
  React.useEffect(() => {
    if (!db || !session) return;
    const call = createApiCall("", () => session.token);
    const api = createHttpApi("", () => session.token);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let running = false;
    let again = false;

    const cycle = async () => {
      // One cycle at a time: a syncNow() during a cycle runs another right after it.
      if (running) {
        again = true;
        return;
      }
      running = true;
      let delay = SYNC_INTERVAL_MS;
      try {
        // A Director reset clears the local store, seed included: reload it while the link is up.
        if (!(await cachedSeed(db)) && (await linkStatus(db, session.identity.node_id)) !== "OFFLINE") {
          await bootstrap(db, session.identity, call);
        }
        const outcome = await syncOnce(db, session.identity, api, { cycleSeconds: SYNC_INTERVAL_MS / 1000 });
        if (stopped) return;
        setLastSync({ at: Date.now(), outcome });
        if (isAuthError(outcome)) return signOut();
        if (!outcome.ok && "retryInSeconds" in outcome) delay = outcome.retryInSeconds * 1000;
        // The server was reset to Start: the store was cleared, so reload it right away.
        if (!outcome.ok && "reset" in outcome) delay = 0;
      } catch (err) {
        console.error(err);
      } finally {
        running = false;
      }
      if (stopped) return;
      clearTimeout(timer);
      timer = setTimeout(cycle, again ? 0 : delay);
      again = false;
    };
    kick.current = () => {
      clearTimeout(timer);
      timer = setTimeout(cycle, 0);
    };
    void cycle();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [db, session, signOut]);

  // Keep auto-open: StrictMode runs this cleanup once on mount in development, and a plainly
  // closed Dexie instance stays closed for good.
  React.useEffect(() => () => db?.close({ disableAutoOpen: false }), [db]);

  const device = React.useMemo<LiveDevice | null>(() => {
    if (!session || !db) return null;
    return {
      session,
      db,
      snapshot,
      lastSync,
      call: createApiCall("", () => session.token),
      write: (draft) => writeEvent(db, session.identity, draft),
      syncNow: () => kick.current(),
      retry: async () => {
        await setMeta(db, "sync_failures", 0);
        kick.current();
      },
      jump: async (hours) => {
        await jumpClock(db, session.identity, addHours(await now(db), hours));
      },
      resetClock: async () => {
        await jumpClock(db, session.identity, config.demo.startAt);
      },
      setLink: async (status) => {
        await setLinkStatus(db, session.identity, status, await now(db));
      },
      signOut,
    };
  }, [session, db, snapshot, lastSync, signOut]);

  const duplicateOf = session && owned === false ? session.identity.device_id : null;
  const value = React.useMemo(() => ({ device, duplicateOf, signIn, signOut }), [device, duplicateOf, signIn, signOut]);
  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}
