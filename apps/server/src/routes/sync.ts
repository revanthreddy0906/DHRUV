import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { z } from "zod";
import { config, type PullResponse, type PushResponse, type StateResponse } from "@dhruv/shared";
import { currentCursor, listAllEvents, logEpoch, pullSince } from "../db/events.js";
import { loadSeed } from "../db/seedData.js";
import { env } from "../env.js";
import { sendError } from "../errors.js";
import { ingest } from "../sync/ingest.js";

const pushSchema = z.object({
  device_id: z.string().min(1),
  events: z.array(z.unknown()).max(1000),
  epoch: z.string().optional(),
});

const pullSchema = z.object({
  since: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(config.sync.pullLimit).default(config.sync.pullLimit),
});

/** Section 15: GET /state, POST /sync/push, GET /sync/pull. */
export function registerSyncRoutes(app: FastifyInstance, db: Database.Database): void {
  app.get("/state", { preHandler: app.requireAuth }, async () => {
    const response: StateResponse = { seed: loadSeed(db), events: listAllEvents(db), cursor: currentCursor(db), epoch: logEpoch(db) };
    return response;
  });

  app.post("/sync/push", { preHandler: app.requireAuth }, async (request, reply) => {
    const parsed = pushSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "INVALID_EVENT", "invalid push body", parsed.error.issues);
    if (parsed.data.device_id !== request.identity.device_id) {
      return sendError(reply, 403, "ROLE_FORBIDDEN", "device_id does not match the authenticated device");
    }
    // Events from before a Reset to Start belong to the previous run; never mix them into this one.
    if (parsed.data.epoch !== undefined && parsed.data.epoch !== logEpoch(db)) {
      return sendError(reply, 409, "RESET_TO_START", "the server was reset to Start since this device loaded; reload before pushing");
    }

    const result = ingest(db, parsed.data.events, { identity: request.identity, demoMode: env.demoMode });
    const response: PushResponse = {
      accepted: result.accepted.map((e) => e.event_id),
      duplicates: result.duplicates,
      rejected: result.rejected,
      recorded_at_server: result.recorded_at_server,
    };
    return response;
  });

  app.get("/sync/pull", { preHandler: app.requireAuth }, async (request, reply) => {
    const parsed = pullSchema.safeParse(request.query);
    if (!parsed.success) return sendError(reply, 400, "INVALID_EVENT", "invalid pull query", parsed.error.issues);

    const response: PullResponse = { ...pullSince(db, parsed.data.since, request.identity.device_id, parsed.data.limit), epoch: logEpoch(db) };
    return response;
  });
}
