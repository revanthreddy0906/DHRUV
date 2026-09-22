import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { eventEnvelopeSchema } from "@dhruv/shared";
import { writeEvent, listEvents } from "../db/events.js";

export function registerEventRoutes(app: FastifyInstance, db: Database.Database): void {
  app.post("/events", { preHandler: app.requireAuth }, async (request, reply) => {
    const parsed = eventEnvelopeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid event envelope", issues: parsed.error.issues });
    }

    const result = writeEvent(db, parsed.data);
    return reply.code(result.applied ? 201 : 200).send(result);
  });

  // Raw ordered event list. Full reduced State (readiness, options, PNR,
  // freshness) is produced by A's engine — this endpoint is the input to
  // that, not a replacement for it.
  app.get("/state", { preHandler: app.requireAuth }, async () => {
    return { events: listEvents(db) };
  });
}
