import Fastify, { type FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { registerAuth } from "./auth.js";
import { registerEventRoutes } from "./routes/events.js";

export function buildApp(db: Database.Database): FastifyInstance {
  const app = Fastify({ logger: true });

  registerAuth(app);
  registerEventRoutes(app, db);

  app.get("/health", async () => ({ ok: true }));

  return app;
}
