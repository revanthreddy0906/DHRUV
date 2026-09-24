import { readFileSync } from "node:fs";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type Database from "better-sqlite3";
import { API_BASE, type ErrorCode, type Seed } from "@dhruv/shared";
import { registerAuth } from "./auth.js";
import { env } from "./env.js";
import { sendError } from "./errors.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerDecisionRoutes } from "./routes/decisions.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerScenarioRoutes } from "./routes/scenarios.js";
import { registerSyncRoutes } from "./routes/sync.js";

const OPENAPI = readFileSync(new URL("../openapi.yaml", import.meta.url), "utf8");

export interface AppOptions {
  /** Reference data used by POST /admin/seed. A's season48 seed plugs in here. */
  seed?: Seed;
  /** Browser origins allowed to call the API; defaults to env.corsOrigins. */
  corsOrigins?: string[];
  /** Defaults to env.demoMode; tests override it to check production behaviour. */
  demoMode?: boolean;
}

export function buildApp(db: Database.Database, options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: process.env.VITEST !== "true", bodyLimit: 1024 * 1024 });

  // The web app runs on its own origin (Vite dev server), so the browser needs CORS to reach the API.
  app.register(cors, { origin: options.corsOrigins ?? env.corsOrigins, allowedHeaders: ["Content-Type", "Authorization"] });

  // Fastify's own errors (bad JSON, body too large, ...) use the section 15 error shape too.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      request.log.error(error);
      return sendError(reply, 500, "INTERNAL_ERROR", "internal error");
    }
    const code: ErrorCode = status === 429 ? "RATE_LIMITED" : status === 404 ? "NOT_FOUND" : "INVALID_EVENT";
    return sendError(reply, status, code, error.message);
  });
  app.setNotFoundHandler((request, reply) => sendError(reply, 404, "NOT_FOUND", `no route ${request.method} ${request.url}`));

  app.register(
    async (api) => {
      // Section 15: the backend publishes the contract the frontend codes against.
      api.get("/openapi.yaml", async (_request, reply) => reply.type("application/yaml").send(OPENAPI));
      registerAuth(api, db);
      registerSyncRoutes(api, db);
      registerEventRoutes(api, db);
      registerDecisionRoutes(api, db);
      registerScenarioRoutes(api, db);
      registerAdminRoutes(api, db, options.seed, options.demoMode ?? env.demoMode);
    },
    { prefix: API_BASE },
  );

  app.get("/health", async () => ({ ok: true }));
  return app;
}
