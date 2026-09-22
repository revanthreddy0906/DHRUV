import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { z } from "zod";
import { eventEnvelopeSchema } from "@dhruv/shared";
import { writeEventBatch, listEventsAfter } from "../db/events.js";

const pushBodySchema = z.object({
  events: z.array(eventEnvelopeSchema).min(1),
});

const pullQuerySchema = z.object({
  after_observed_at: z.string().datetime().optional(),
  after_device_id: z.string().optional(),
  after_seq: z.coerce.number().int().nonnegative().optional(),
});

/**
 * Phase 2 sync core (section 8.1 C row: "sync push/pull"). Idempotency and
 * ordering ride entirely on the events table's PK and index from Phase 1 —
 * this layer is just batching and a resumable cursor on top of it.
 *
 * Priority drain (draining the outbox tier-0-first) and link simulation
 * (Online/Degraded/Offline) are Phase 3, not here.
 */
export function registerSyncRoutes(app: FastifyInstance, db: Database.Database): void {
  app.post("/sync/push", { preHandler: app.requireAuth }, async (request, reply) => {
    const parsed = pushBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid push batch", issues: parsed.error.issues });
    }

    // Re-pushing an already-applied batch must be a no-op, not an error —
    // writeEventBatch reports per-event applied:false for anything already known.
    const results = writeEventBatch(db, parsed.data.events);
    return reply.code(200).send({ results });
  });

  app.get("/sync/pull", { preHandler: app.requireAuth }, async (request, reply) => {
    const parsed = pullQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid pull cursor", issues: parsed.error.issues });
    }

    const { after_observed_at, after_device_id, after_seq } = parsed.data;
    const hasCursor = after_observed_at !== undefined && after_device_id !== undefined && after_seq !== undefined;

    // Partial cursor (e.g. only one of the three fields) is a client bug —
    // a resumable pull needs the whole watermark or none of it.
    if (!hasCursor && (after_observed_at !== undefined || after_device_id !== undefined || after_seq !== undefined)) {
      return reply.code(400).send({ error: "cursor requires all of after_observed_at, after_device_id, after_seq" });
    }

    const events = hasCursor
      ? listEventsAfter(db, { observed_at: after_observed_at!, device_id: after_device_id!, seq: after_seq! })
      : listEventsAfter(db);

    const cursor =
      events.length > 0
        ? { observed_at: events.at(-1)!.observed_at, device_id: events.at(-1)!.device_id, seq: events.at(-1)!.seq }
        : hasCursor
          ? { observed_at: after_observed_at!, device_id: after_device_id!, seq: after_seq! }
          : null;

    return reply.code(200).send({ events, cursor });
  });
}
