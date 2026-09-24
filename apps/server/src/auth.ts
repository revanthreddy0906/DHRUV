import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { LOGIN_ROLES, type LoginResponse } from "@dhruv/shared";
import { DEVICES } from "@dhruv/seed";
import { DEMO_PINS, env, roleAllowedAtNode } from "./env.js";
import { sendError } from "./errors.js";
import type { Identity } from "./sync/ingest.js";

/** Device ids the server writes under; no client may log in as them and forge server events. */
const RESERVED_DEVICE_IDS: ReadonlySet<string> = new Set([DEVICES.SERVER, DEVICES.DIRECTOR]);

const loginSchema = z.object({
  device_id: z.string().min(1),
  pin: z.string().min(1),
  role: z.enum(LOGIN_ROLES),
  node_id: z.string().min(1),
});

export function issueToken(identity: Identity): string {
  return jwt.sign(identity, env.jwtSecret, { expiresIn: "12h" });
}

/**
 * A device id belongs to the node it first signed in at (kept in server_meta). Without this, anyone
 * with Maitri's PIN could sign in as HQ-WEB-01 and write into that device's seq space and audit trail.
 */
function claimDevice(db: Database.Database, deviceId: string, nodeId: string): string | null {
  const key = `device:${deviceId}`;
  const row = db.prepare(`SELECT value FROM server_meta WHERE key = ?`).get(key) as { value: string } | undefined;
  if (row) return row.value === nodeId ? null : row.value;
  db.prepare(`INSERT INTO server_meta (key, value) VALUES (?, ?)`).run(key, nodeId);
  return null;
}

/**
 * Demo login (sections 4 and 15): a role switcher with a device id and a fixed PIN per node.
 * The token carries device, role and node; every write is checked against them.
 */
export function registerAuth(app: FastifyInstance, db: Database.Database): void {
  app.post("/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "INVALID_EVENT", "invalid login request", parsed.error.issues);

    const { device_id, pin, role, node_id } = parsed.data;
    if (DEMO_PINS[node_id] === undefined || DEMO_PINS[node_id] !== pin) {
      return sendError(reply, 401, "UNAUTHORIZED", "wrong PIN for this node");
    }
    if (RESERVED_DEVICE_IDS.has(device_id)) {
      return sendError(reply, 403, "ROLE_FORBIDDEN", `device id ${device_id} is reserved for the server`);
    }
    if (!roleAllowedAtNode(role, node_id)) {
      return sendError(reply, 403, "NODE_FORBIDDEN", `${role} cannot log in at ${node_id}`);
    }

    const boundTo = claimDevice(db, device_id, node_id);
    if (boundTo) {
      return sendError(reply, 403, "NODE_FORBIDDEN", `device ${device_id} belongs to ${boundTo}`);
    }

    const response: LoginResponse = { token: issueToken({ device_id, role, node_id }), role, node_id };
    return response;
  });

  app.decorate("requireAuth", async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
    if (!token) return sendError(reply, 401, "UNAUTHORIZED", "missing bearer token");
    try {
      const { device_id, role, node_id } = jwt.verify(token, env.jwtSecret) as Identity;
      request.identity = { device_id, role, node_id };
    } catch {
      return sendError(reply, 401, "UNAUTHORIZED", "invalid or expired token");
    }
  });
}

declare module "fastify" {
  interface FastifyRequest {
    identity: Identity;
  }
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  }
}
