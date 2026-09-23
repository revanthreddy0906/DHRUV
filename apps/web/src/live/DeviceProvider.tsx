import * as React from "react";
import { liveQuery } from "dexie";
import { config, type LinkStatus, type OpEvent, type Seed } from "@dhruv/shared";
import {
  attachDirectorListener, bootstrap, cachedSeed, createApiCall, createHttpApi, jumpClock, linkStatus, now, openDeviceDb,
  setLinkStatus, syncOnce, syncStatus, writeEvent, type ApiCall, type DhruvDb, type EventDraft, type SyncOutcome, type SyncStatus,
} from "@dhruv/store";
import { STATION_NODES } from "@dhruv/seed";
import { addHours } from "./format";
import { loadSession, saveSession, type Session } from "./session";

/** Section 9: one sync cycle every 3 s; failures back off per syncOnce. */
const SYNC_INTERVAL_MS = 3000;

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
  jump(hours: number): Promise<void>;
  resetClock(): Promise<void>;
  setLink(status: LinkStatus): Promise<void>;
  signOut(): void;
}

interface DeviceContextValue {
  device: LiveDevice | null;
  signIn(session: Session): Promise<void>;
}

const DeviceContext = React.createContext<DeviceContextValue>({ device: null, signIn: async () => {} });

/** The signed-in device of this tab, or null (not signed in: screens show their design fixtures). */
export function useDevice(): LiveDevice | null {
  return React.useContext(DeviceContext).device;
}

export function useSignIn(): (session: Session) => Promise<void> {
  return React.useContext(DeviceContext).signIn;
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
  };
}

const isAuthError = (outcome: SyncOutcome) => !outcome.ok && "error" in outcome && /token/i.test(outcome.error);

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(() => loadSession());
  const db = React.useMemo(() => (session ? openDeviceDb(session.identity.device_id) : null), [session]);
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

  const value = React.useMemo(() => ({ device, signIn }), [device, signIn]);
  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}
