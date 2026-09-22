import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { z } from "zod";
import { getClock, setClock } from "../db/clock.js";

const setClockBodySchema = z.object({
  now: z.string().datetime(),
});

/**
 * Demo clock control (section 7). Deliberately outside /sync — any
 * authenticated client can poll GET /clock regardless of its simulated
 * link state, since this is Director control-plane state, not station
 * data. Role restriction to "Director only" for POST is Phase 4 (the
 * Director panel); for now any authenticated demo user can set it.
 */
export function registerClockRoutes(app: FastifyInstance, db: Database.Database): void {
  app.get("/clock", { preHandler: app.requireAuth }, async () => {
    return getClock(db) ?? { now: null, set_at: null };
  });

  app.post("/clock", { preHandler: app.requireAuth }, async (request, reply) => {
    const parsed = setClockBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid clock value", issues: parsed.error.issues });
    }
    return setClock(db, parsed.data.now);
  });
}
