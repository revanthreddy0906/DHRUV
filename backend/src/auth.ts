import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";

/**
 * JWT demo auth (section 2.3, LOCKED stack: "Fastify, better-sqlite3, JWT demo auth").
 * This is explicitly a demo mechanism, not production auth — single shared
 * secret, no refresh tokens, no password hashing beyond a fixed demo roster.
 */
const DEMO_SECRET = process.env.DHRUV_JWT_SECRET ?? "dhruv-demo-secret-change-me";

const DEMO_USERS: Record<string, { device_id: string; role: string }> = {
  hq: { device_id: "hq-ops", role: "hq" },
  maitri: { device_id: "maitri-leader", role: "station_leader" },
  bharati: { device_id: "bharati-leader", role: "station_leader" },
};

export interface DemoTokenPayload {
  device_id: string;
  role: string;
}

export function issueDemoToken(username: string): string | null {
  const user = DEMO_USERS[username];
  if (!user) return null;
  return jwt.sign(user, DEMO_SECRET, { expiresIn: "12h" });
}

export function registerAuth(app: FastifyInstance): void {
  app.post("/auth/login", async (request, reply) => {
    const body = request.body as { username?: string };
    const token = body.username ? issueDemoToken(body.username) : null;
    if (!token) {
      return reply.code(401).send({ error: "unknown demo user" });
    }
    return { token };
  });

  app.decorate("requireAuth", async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
    if (!token) {
      return reply.code(401).send({ error: "missing bearer token" });
    }
    try {
      request.demoUser = jwt.verify(token, DEMO_SECRET) as DemoTokenPayload;
    } catch {
      return reply.code(401).send({ error: "invalid or expired token" });
    }
  });
}

declare module "fastify" {
  interface FastifyRequest {
    demoUser?: DemoTokenPayload;
  }
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
