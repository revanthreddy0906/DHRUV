import Fastify, { type FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { registerAuth } from "./auth.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerSyncRoutes } from "./routes/sync.js";
import { registerClockRoutes } from "./routes/clock.js";
import { registerReviewQueueRoutes } from "./routes/reviewQueue.js";

export function buildApp(db: Database.Database): FastifyInstance {
  const app = Fastify({ logger: process.env.VITEST !== "true" });

  registerAuth(app);
  registerEventRoutes(app, db);
  registerSyncRoutes(app, db);
  registerClockRoutes(app, db);
  registerReviewQueueRoutes(app, db);

  app.get("/health", async () => ({ ok: true }));

  return app;
}
