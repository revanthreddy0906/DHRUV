import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { z } from "zod";
import { evaluate } from "@dhruv/engine";
import { opEventSchema } from "@dhruv/shared";
import { latestObservedAt, listAllEvents } from "../db/events.js";
import { loadSeed } from "../db/seedData.js";
import { sendError } from "../errors.js";

const scenarioSchema = z.object({
  overlay: z.array(opEventSchema),
  /** Demo-clock time to evaluate at; the server has no demo clock (section 8). */
  now: z.string().datetime().optional(),
});

/** Section 15/11: POST /scenarios/run evaluates hypothetical events with the same engine. Nothing is stored. */
export function registerScenarioRoutes(app: FastifyInstance, db: Database.Database): void {
  app.post("/scenarios/run", { preHandler: app.requireAuth }, async (request, reply) => {
    const parsed = scenarioSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "INVALID_EVENT", "invalid scenario", parsed.error.issues);

    const now = parsed.data.now ?? latestObservedAt(db) ?? new Date().toISOString();
    try {
      return evaluate({ seed: loadSeed(db), events: [...listAllEvents(db), ...parsed.data.overlay] }, now);
    } catch (err) {
      return sendError(reply, 501, "NOT_IMPLEMENTED", (err as Error).message);
    }
  });
}
