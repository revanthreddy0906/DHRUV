import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { z } from "zod";
import type { ApproveResponse } from "@dhruv/shared";
import { sendError } from "../errors.js";
import { approveDecision, rejectDecision } from "../sync/decisions.js";

const approveSchema = z.object({
  chosen_option_id: z.string().min(1),
  verify_ack: z.boolean(),
  observed_at: z.string().datetime().optional(),
});

const rejectSchema = z.object({
  reason: z.string().min(1),
  observed_at: z.string().datetime().optional(),
});

/** Section 15: POST /decisions/:id/approve and /reject. */
export function registerDecisionRoutes(app: FastifyInstance, db: Database.Database): void {
  app.post("/decisions/:id/approve", { preHandler: app.requireAuth }, async (request, reply) => {
    const parsed = approveSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "INVALID_EVENT", "invalid approval", parsed.error.issues);

    const { id } = request.params as { id: string };
    const outcome = approveDecision(db, request.identity, { decision_id: id, ...parsed.data });
    if (!outcome.ok) return sendError(reply, outcome.status, outcome.code, outcome.message);

    const response: ApproveResponse = { event_id: outcome.event.event_id, follow_up_event_ids: outcome.followUps.map((e) => e.event_id) };
    return response;
  });

  app.post("/decisions/:id/reject", { preHandler: app.requireAuth }, async (request, reply) => {
    const parsed = rejectSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "INVALID_EVENT", "invalid rejection", parsed.error.issues);

    const { id } = request.params as { id: string };
    const outcome = rejectDecision(db, request.identity, id, parsed.data.reason, parsed.data.observed_at);
    if (!outcome.ok) return sendError(reply, outcome.status, outcome.code, outcome.message);
    return { event_id: outcome.event.event_id };
  });
}
