import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { EVENT_RULES, type EventType, type LoginRole, type OpEvent } from "@dhruv/shared";
import { openDb } from "../db/index.js";
import { buildApp, type AppOptions } from "../app.js";
import { resetToStart } from "../db/seedData.js";

export const API = "/api/v1";

/** In-memory server. With `options.seed` the DB starts from that seed, as after `pnpm seed`. */
export function makeApp(options: AppOptions = {}): { db: Database.Database; app: FastifyInstance } {
  const db = openDb(":memory:");
  if (options.seed) resetToStart(db, options.seed);
  return { db, app: buildApp(db, options) };
}

export interface Device {
  device_id: string;
  role: LoginRole;
  node_id: string;
  pin: string;
  token: string;
  seq: number;
}

const PINS: Record<string, string> = { HQ: "HQ-2027", MAITRI: "MAITRI-2027", BHARATI: "BHARATI-2027" };

export async function login(app: FastifyInstance, device_id: string, role: LoginRole, node_id: string): Promise<Device> {
  const pin = PINS[node_id];
  if (!pin) throw new Error(`no demo PIN for node ${node_id}`);
  const res = await app.inject({ method: "POST", url: `${API}/auth/login`, payload: { device_id, pin, role, node_id } });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.body}`);
  return { device_id, role, node_id, pin, token: res.json().token, seq: 0 };
}

export function auth(device: Device) {
  return { Authorization: `Bearer ${device.token}` };
}

export function makeEvent(
  device: Device,
  type: EventType,
  entity: { entity_type: string; entity_id: string },
  payload: Record<string, unknown>,
  observed_at: string,
  overrides: Partial<OpEvent> = {},
): OpEvent {
  device.seq += 1;
  return {
    event_id: randomUUID(),
    device_id: device.device_id,
    seq: device.seq,
    type,
    ...entity,
    node_id: device.node_id,
    payload,
    observed_at,
    created_at_client: new Date().toISOString(),
    priority: EVENT_RULES[type].defaultPriority,
    actor_role: device.role,
    schema_version: 1,
    ...overrides,
  };
}

export async function push(app: FastifyInstance, device: Device, events: OpEvent[]) {
  const res = await app.inject({ method: "POST", url: `${API}/sync/push`, headers: auth(device), payload: { device_id: device.device_id, events } });
  return res.json() as { accepted: string[]; duplicates: string[]; rejected: { event_id: string; code: string }[] };
}

export async function pull(app: FastifyInstance, device: Device, since = 0) {
  const res = await app.inject({ method: "GET", url: `${API}/sync/pull?since=${since}`, headers: auth(device) });
  return res.json() as { events: OpEvent[]; cursor: number; epoch?: string };
}

export const t = (day: number, hhmm: string) => `2027-01-${String(day).padStart(2, "0")}T${hhmm}:00.000Z`;
