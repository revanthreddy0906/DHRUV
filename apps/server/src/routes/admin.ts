import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type Database from "better-sqlite3";
import { EVENT_RULES, type OpEvent, type Seed } from "@dhruv/shared";
import { DEFAULT_SCENARIO, DEVICES, findBeat, NODES, scenarioById } from "@dhruv/seed";
import { latestEventOf, nextSeq } from "../db/events.js";
import { activeScenario, resetToStart, setActiveScenario } from "../db/seedData.js";
import { env } from "../env.js";
import { sendError } from "../errors.js";
import { approveDecision } from "../sync/decisions.js";
import { ingest } from "../sync/ingest.js";
import { engineProposal } from "../sync/proposals.js";

/**
 * Section 15 demo-only endpoints: POST /admin/seed and POST /admin/director/:beat.
 * Only server-side beats run here; client beats (link, clock, Maitri's offline entries)
 * must be written on the device itself or the offline story breaks.
 *
 * Outside demo mode the routes are not registered at all. A URL-prefix check is not enough:
 * the router decodes the path (/api/v1/%61dmin/seed matches /admin/seed) but request.url does not.
 */
export function registerAdminRoutes(app: FastifyInstance, db: Database.Database, seed: Seed | undefined, demoMode: boolean): void {
  if (!demoMode) return;

  // Resetting everyone's data or injecting HQ events is an HQ Ops action.
  const requireHqOps = async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.identity.role !== "HQ_OPS") return sendError(reply, 403, "ROLE_FORBIDDEN", "admin endpoints require HQ_OPS");
  };
  const guards = { preHandler: [app.requireAuth, requireHqOps] };

  // Reset to Start, optionally to another Director scenario ({ "scenario": "aurora2016" }).
  app.post("/admin/seed", guards, async (request, reply) => {
    const wanted = (request.body as { scenario?: unknown } | undefined)?.scenario;
    if (wanted !== undefined) {
      const scenario = typeof wanted === "string" ? scenarioById(wanted) : undefined;
      if (!scenario) return sendError(reply, 404, "NOT_FOUND", `no scenario ${String(wanted)}`);
      resetToStart(db, scenario.seed);
      setActiveScenario(db, scenario.id);
      return { ok: true, scenario: scenario.id };
    }
    resetToStart(db, seed);
    setActiveScenario(db, DEFAULT_SCENARIO);
    return { ok: true, scenario: DEFAULT_SCENARIO };
  });

  app.get("/admin/scenario", guards, async () => {
    const id = activeScenario(db);
    return { scenario: id, title: scenarioById(id)?.title ?? id };
  });

  app.post("/admin/director/:beat", guards, async (request, reply) => {
    const { beat: beatId } = request.params as { beat: string };
    const scenario = activeScenario(db);
    const beat = findBeat(beatId, scenario);
    if (!beat) return sendError(reply, 404, "NOT_FOUND", `no Director beat ${beatId} in scenario ${scenario}`);
    // An operator step the server can do itself (an approval) may run here as "do it for me".
    if (beat.where !== "server" && !(beat.where === "operator" && beat.approve)) {
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

    // A proposal's options are the engine's (R08-R11) at the beat's time, not the script's.
    let proposed: ReturnType<typeof engineProposal> = null;
    if (beat.proposeFromEngine) {
      const at = beat.events[0]?.observed_at ?? new Date().toISOString();
      proposed = engineProposal(db, beat.proposeFromEngine.node_id, at);
      if (!proposed) return sendError(reply, 409, "INVALID_EVENT", `the engine proposes nothing for ${beat.proposeFromEngine.node_id}: it needs no decision at ${at}`);
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
      payload: {
        ...e.payload,
        ...(triggerId ? { trigger_event_id: triggerId } : {}),
        ...(proposed && e.type === "DECISION_PROPOSED" ? { options: proposed.options, trace: proposed.trace } : {}),
      },
      observed_at: e.observed_at,
      created_at_client: new Date().toISOString(),
      priority: e.priority ?? EVENT_RULES[e.type].defaultPriority,
      actor_role: e.actor_role,
      schema_version: 1,
    }));

    const result = ingest(db, events, { demoMode: env.demoMode });
    const [firstRejection] = result.rejected;
    if (firstRejection) return sendError(reply, 409, firstRejection.code, firstRejection.message, result.rejected);
    return { events_created: result.accepted.length + result.emitted.length };
  });
}
