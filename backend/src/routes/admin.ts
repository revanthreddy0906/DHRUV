import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { EVENT_RULES, type OpEvent, type Seed } from "@dhruv/shared";
import { DEVICES, findBeat, NODES } from "@dhruv/seed";
import { latestEventOf, nextSeq } from "../db/events.js";
import { resetToStart } from "../db/seedData.js";
import { env } from "../env.js";
import { sendError } from "../errors.js";
import { approveDecision } from "../sync/decisions.js";
import { ingest } from "../sync/ingest.js";

/**
 * Section 15 demo-only endpoints: POST /admin/seed and POST /admin/director/:beat.
 * Only server-side beats run here; client beats (link, clock, Maitri's offline entries)
 * must be written on the device itself or the offline story breaks.
 */
export function registerAdminRoutes(app: FastifyInstance, db: Database.Database, seed: Seed | undefined): void {
  app.addHook("onRequest", async (request, reply) => {
    if (request.url.startsWith("/api/v1/admin") && !env.demoMode) {
      return sendError(reply, 404, "NOT_FOUND", "admin endpoints are demo-only");
    }
  });

  app.post("/admin/seed", { preHandler: app.requireAuth }, async () => {
    resetToStart(db, seed);
    return { ok: true };
  });

  app.post("/admin/director/:beat", { preHandler: app.requireAuth }, async (request, reply) => {
    const { beat: beatId } = request.params as { beat: string };
    const beat = findBeat(beatId);
    if (!beat) return sendError(reply, 404, "NOT_FOUND", `no Director beat ${beatId}`);
    if (beat.where !== "server") {
      return sendError(reply, 400, "INVALID_EVENT", `beat ${beatId} is ${beat.where}; run it from the Director panel on the device`);
    }

    if (beat.approve) {
      const outcome = approveDecision(db, { device_id: DEVICES.DIRECTOR, role: "HQ_OPS", node_id: NODES.HQ }, beat.approve);
      if (!outcome.ok) return sendError(reply, outcome.status, outcome.code, outcome.message);
      return { events_created: 1 + outcome.followUps.length };
    }

    let triggerId: string | undefined;
    if (beat.resolveTrigger) {
      triggerId = latestEventOf(db, beat.resolveTrigger.type, beat.resolveTrigger.entity_id)?.event_id;
      if (!triggerId) return sendError(reply, 409, "NOT_FOUND", `run the beat that creates ${beat.resolveTrigger.type} ${beat.resolveTrigger.entity_id} first`);
    }

    const baseSeq = nextSeq(db, DEVICES.DIRECTOR);
    const events: OpEvent[] = beat.events.map((e, i) => ({
      event_id: randomUUID(),
      device_id: e.device_id,
      seq: baseSeq + i,
      type: e.type,
      entity_type: e.entity_type,
      entity_id: e.entity_id,
      node_id: e.node_id,
      payload: triggerId ? { ...e.payload, trigger_event_id: triggerId } : e.payload,
      observed_at: e.observed_at,
      created_at_client: new Date().toISOString(),
      priority: e.priority ?? EVENT_RULES[e.type].defaultPriority,
      actor_role: e.actor_role,
      schema_version: 1,
    }));

    const result = ingest(db, events, { demoMode: env.demoMode });
    if (result.rejected.length > 0) return sendError(reply, 409, result.rejected[0].code, result.rejected[0].message, result.rejected);
    return { events_created: result.accepted.length + result.emitted.length };
  });
}
