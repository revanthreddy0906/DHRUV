import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { LOGIN_ROLES, type LoginResponse } from "@dhruv/shared";
import { DEMO_PINS, env, roleAllowedAtNode } from "./env.js";
import { sendError } from "./errors.js";
import type { Identity } from "./sync/ingest.js";

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
 * Demo login (sections 4 and 15): a role switcher with a device id and a fixed PIN per node.
 * The token carries device, role and node; every write is checked against them.
 */
export function registerAuth(app: FastifyInstance): void {
  app.post("/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "INVALID_EVENT", "invalid login request", parsed.error.issues);

    const { device_id, pin, role, node_id } = parsed.data;
    if (DEMO_PINS[node_id] === undefined || DEMO_PINS[node_id] !== pin) {
      return sendError(reply, 401, "UNAUTHORIZED", "wrong PIN for this node");
    }
    if (!roleAllowedAtNode(role, node_id)) {
      return sendError(reply, 403, "NODE_FORBIDDEN", `${role} cannot log in at ${node_id}`);
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
