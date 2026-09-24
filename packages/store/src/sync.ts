import { API_BASE, config, type ApiError, type PullResponse, type PushRequest, type PushResponse, type ScenarioRequest } from "@dhruv/shared";
import { clearDeviceStore, getMeta, setMeta, type DhruvDb } from "./db.js";
import { linkStatus } from "./controls.js";
import { drainOutbox, type DrainResult, type PushFn } from "./outbox.js";
import type { DeviceIdentity } from "./write.js";

export type PullFn = (since: number) => Promise<PullResponse>;

export interface SyncApi {
  push: PushFn;
  pull: PullFn;
}

/**
 * Section 9 step 3: pull other devices' events after the cursor into the local store. If the cursor
 * changed while the request was out (a Director reset cleared the store), the response belongs to
 * the old state and is dropped rather than written back into the cleared store.
 */
export async function pullOnce(db: DhruvDb, pull: PullFn): Promise<number> {
  const since = await getMeta<number>(db, "cursor", 0);
  const response = await pull(since);
  if (response.epoch && (await epochIsStale(db, response.epoch))) throw new ServerResetError();
  return db.transaction("rw", db.events, db.meta, async () => {
    if ((await getMeta<number>(db, "cursor", 0)) !== since) return 0;
    if (response.epoch) await setMeta(db, "epoch", response.epoch);
    await db.events.bulkPut(response.events);
    await setMeta(db, "cursor", response.cursor);
    return response.events.length;
  });
}

/** The server's log was reset to Start since this device loaded it. */
export class ServerResetError extends Error {
  constructor() {
    super("the server was reset to Start since this device loaded");
  }
}

/**
 * True when this store belongs to an earlier run of the server log: it recorded another epoch, or
 * it was loaded before epochs existed (it has a seed but no epoch). A store that never loaded
 * (no seed) simply adopts the server's epoch.
 */
export async function epochIsStale(db: DhruvDb, serverEpoch: string): Promise<boolean> {
  const mine = await getMeta<string | null>(db, "epoch", null);
  if (mine) return mine !== serverEpoch;
  return (await db.cache.get("seed")) !== undefined;
}

export type SyncOutcome =
  | { ok: true; drain: DrainResult; pulled: number }
  | { ok: false; skipped: "offline" }
  /** The local store was from an earlier run of the server log and has been cleared: reload it. */
  | { ok: false; reset: true }
  | { ok: false; failures: number; retryInSeconds: number; stalled: boolean; error: string };

/**
 * One sync cycle: drain the outbox, then pull. Offline does nothing. On failure, retry with
 * exponential backoff (2, 4, 8, 16, 30 s cap) and mark stalled after 5 failures (section 9).
 */
export async function syncOnce(db: DhruvDb, identity: DeviceIdentity, api: SyncApi, { cycleSeconds = 1 } = {}): Promise<SyncOutcome> {
  if ((await linkStatus(db, identity.node_id)) === "OFFLINE") return { ok: false, skipped: "offline" };

  try {
    const drain = await drainOutbox(db, identity, api.push, { cycleSeconds });
    const pulled = await pullOnce(db, api.pull);
    await setMeta(db, "sync_failures", 0);
    return { ok: true, drain, pulled };
  } catch (err) {
    // A Reset to Start happened since this device loaded: its events belong to the previous run.
    if (err instanceof ServerResetError || (err as ApiRequestError).code === "RESET_TO_START") {
      await clearDeviceStore(db);
      return { ok: false, reset: true };
    }
    const failures = (await getMeta<number>(db, "sync_failures", 0)) + 1;
    await setMeta(db, "sync_failures", failures);
    const backoff = config.sync.backoffSeconds;
    return {
      ok: false,
      failures,
      retryInSeconds: backoff[Math.min(failures, backoff.length) - 1] ?? Math.max(...backoff),
      stalled: failures >= config.sync.stalledAfterFailures,
      error: (err as Error).message,
    };
  }
}

export interface SyncStatus {
  pending: number;
  rejected: number;
  oldestPendingAt: string | null;
  failures: number;
  stalled: boolean;
}

/** What the Sync drawer shows: pending count, oldest pending age, rejected items, stalled. */
export async function syncStatus(db: DhruvDb): Promise<SyncStatus> {
  const entries = await db.outbox.toArray();
  const pending = entries.filter((e) => e.status === "pending");
  const failures = await getMeta<number>(db, "sync_failures", 0);
  return {
    pending: pending.length,
    rejected: entries.length - pending.length,
    oldestPendingAt: pending.map((e) => e.event.observed_at).sort()[0] ?? null,
    failures,
    stalled: failures >= config.sync.stalledAfterFailures,
  };
}

export type ApiCall = <T>(path: string, init?: RequestInit) => Promise<T>;

/** A failed API call, with the section 15 error code when the server sent one. */
export class ApiRequestError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

/** Authenticated JSON call against /api/v1; throws with the section 15 error message on failure. */
export function createApiCall(baseUrl: string, getToken: () => string, fetchImpl: typeof fetch = fetch): ApiCall {
  return async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const res = await fetchImpl(`${baseUrl}${API_BASE}${path}`, {
      ...init,
      // Content-Type only with a body: Fastify rejects an empty body declared as JSON (Reset, Director beats).
      headers: { ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${getToken()}`, ...init.headers },
    });
    const body = await res.json();
    if (!res.ok) throw new ApiRequestError((body as ApiError).error?.message ?? `HTTP ${res.status}`, (body as ApiError).error?.code);
    return body as T;
  };
}

/** fetch-based SyncApi against the section 15 endpoints. */
export function createHttpApi(baseUrl: string, getToken: () => string, fetchImpl: typeof fetch = fetch): SyncApi {
  const call = createApiCall(baseUrl, getToken, fetchImpl);
  return {
    push: (request: PushRequest) => call<PushResponse>("/sync/push", { method: "POST", body: JSON.stringify(request) }),
    pull: (since: number) => call<PullResponse>(`/sync/pull?since=${since}&limit=${config.sync.pullLimit}`),
  };
}

/** What-if drawer (section 11): evaluate hypothetical events server-side with the same engine. */
export function runScenario<T = unknown>(call: ApiCall, request: ScenarioRequest): Promise<T> {
  return call<T>("/scenarios/run", { method: "POST", body: JSON.stringify(request) });
}
