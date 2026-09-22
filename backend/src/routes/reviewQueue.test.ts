import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { openDb } from "../db/index.js";
import { buildApp } from "../app.js";
import { issueDemoToken } from "../auth.js";
import { flagConflict } from "../db/conflicts.js";

function authHeader() {
  return { Authorization: `Bearer ${issueDemoToken("hq")}` };
}

describe("review queue", () => {
  let db: Database.Database;
  let app: FastifyInstance;

  beforeEach(() => {
    db = openDb(":memory:");
    app = buildApp(db);
  });

  it("lists a flagged conflict as open", async () => {
    flagConflict(db, {
      device_id: "maitri-leader",
      seq: 4,
      reason: "class C-S: conflicting person status",
      kept_value: { status: "INJURED" },
      rejected_value: { status: "AVAILABLE" },
    });

    const res = await app.inject({ method: "GET", url: "/review-queue", headers: authHeader() });
    const { conflicts } = res.json();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].kept_value).toEqual({ status: "INJURED" });
    expect(conflicts[0].resolved_at).toBeNull();
  });

  it("resolving removes it from the open list", async () => {
    flagConflict(db, {
      device_id: "maitri-leader",
      seq: 4,
      reason: "class C-S: conflicting person status",
      kept_value: { status: "INJURED" },
      rejected_value: { status: "AVAILABLE" },
    });
    const listed = await app.inject({ method: "GET", url: "/review-queue", headers: authHeader() });
    const id = listed.json().conflicts[0].id;

    const resolve = await app.inject({ method: "POST", url: `/review-queue/${id}/resolve`, headers: authHeader() });
    expect(resolve.statusCode).toBe(200);
    expect(resolve.json().resolved_at).not.toBeNull();

    const after = await app.inject({ method: "GET", url: "/review-queue", headers: authHeader() });
    expect(after.json().conflicts).toHaveLength(0);
  });

  it("resolving an unknown or already-resolved id 404s", async () => {
    const res = await app.inject({ method: "POST", url: "/review-queue/999/resolve", headers: authHeader() });
    expect(res.statusCode).toBe(404);
  });
});
