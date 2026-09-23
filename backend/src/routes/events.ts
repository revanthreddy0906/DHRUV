import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { z } from "zod";
import { getEvent, listAudit } from "../db/events.js";
import { env } from "../env.js";
import { sendError } from "../errors.js";
import { ingest } from "../sync/ingest.js";

const auditSchema = z.object({
  entity_id: z.string().optional(),
  type: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});

const STATUS_BY_CODE: Record<string, number> = { ROLE_FORBIDDEN: 403, NODE_FORBIDDEN: 403, DUPLICATE_SEQ_CONFLICT: 409 };

/** Section 15: POST /events (thin wrapper over push) and GET /events (audit list). */
export function registerEventRoutes(app: FastifyInstance, db: Database.Database): void {
  app.post("/events", { preHandler: app.requireAuth }, async (request, reply) => {
    const result = ingest(db, [request.body], { identity: request.identity, demoMode: env.demoMode });

    const rejection = result.rejected[0];
    if (rejection) return sendError(reply, STATUS_BY_CODE[rejection.code] ?? 400, rejection.code, rejection.message);

    const eventId = result.accepted[0]?.event_id ?? result.duplicates[0];
    const stored = getEvent(db, eventId);
    return reply.code(result.accepted.length ? 201 : 200).send({ event_id: eventId, recorded_at_server: stored?.recorded_at_server });
  });

  app.get("/events", { preHandler: app.requireAuth }, async (request, reply) => {
    const parsed = auditSchema.safeParse(request.query);
    if (!parsed.success) return sendError(reply, 400, "INVALID_EVENT", "invalid audit query", parsed.error.issues);
    return { events: listAudit(db, parsed.data) };
  });
}
