import Fastify, { type FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { API_BASE, type Seed } from "@dhruv/shared";
import { registerAuth } from "./auth.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerDecisionRoutes } from "./routes/decisions.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerScenarioRoutes } from "./routes/scenarios.js";
import { registerSyncRoutes } from "./routes/sync.js";

export interface AppOptions {
  /** Reference data used by POST /admin/seed. A's season48 seed plugs in here. */
  seed?: Seed;
}

export function buildApp(db: Database.Database, options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: process.env.VITEST !== "true", bodyLimit: 1024 * 1024 });

  app.register(
    async (api) => {
      registerAuth(api);
      registerSyncRoutes(api, db);
      registerEventRoutes(api, db);
      registerDecisionRoutes(api, db);
      registerScenarioRoutes(api, db);
      registerAdminRoutes(api, db, options.seed);
    },
    { prefix: API_BASE },
  );

  app.get("/health", async () => ({ ok: true }));
  return app;
}
