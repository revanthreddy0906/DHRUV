import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { listOpenConflicts, resolveConflict } from "../db/conflicts.js";

/**
 * Human-facing Review queue (section 2.6). Conflicts land here via
 * flagConflict() — called by whatever caller detects a class C-S disagreement
 * or a class B negative-stock result (not yet wired up pending A's event
 * catalog, see Phase 2/3 notes in the plan). No auto-merge; resolve is the
 * only way an entry leaves "open".
 */
export function registerReviewQueueRoutes(app: FastifyInstance, db: Database.Database): void {
  app.get("/review-queue", { preHandler: app.requireAuth }, async () => {
    return { conflicts: listOpenConflicts(db) };
  });

  app.post("/review-queue/:id/resolve", { preHandler: app.requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const resolved = resolveConflict(db, Number(id));
    if (!resolved) {
      return reply.code(404).send({ error: "no open conflict with that id" });
    }
    return resolved;
  });
}
