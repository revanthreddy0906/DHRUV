import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { openDb } from "../db/index.js";
import { buildApp } from "../app.js";
import { issueDemoToken } from "../auth.js";

function authHeader() {
  return { Authorization: `Bearer ${issueDemoToken("hq")}` };
}

describe("demo clock", () => {
  let db: Database.Database;
  let app: FastifyInstance;

  beforeEach(() => {
    db = openDb(":memory:");
    app = buildApp(db);
  });

  it("has no value before the Director sets one", async () => {
    const res = await app.inject({ method: "GET", url: "/clock", headers: authHeader() });
    expect(res.json()).toEqual({ now: null, set_at: null });
  });

  it("accepts an absolute jump and immediately reflects it", async () => {
    const jump = await app.inject({
      method: "POST",
      url: "/clock",
      headers: authHeader(),
      payload: { now: "2027-01-25T16:00:00.000Z" },
    });
    expect(jump.statusCode).toBe(200);
    expect(jump.json().now).toBe("2027-01-25T16:00:00.000Z");

    const read = await app.inject({ method: "GET", url: "/clock", headers: authHeader() });
    expect(read.json().now).toBe("2027-01-25T16:00:00.000Z");
  });

  it("a second jump replaces the first (single current value, no history)", async () => {
    await app.inject({ method: "POST", url: "/clock", headers: authHeader(), payload: { now: "2027-01-24T08:00:00.000Z" } });
    await app.inject({ method: "POST", url: "/clock", headers: authHeader(), payload: { now: "2027-01-25T16:00:00.000Z" } });

    const read = await app.inject({ method: "GET", url: "/clock", headers: authHeader() });
    expect(read.json().now).toBe("2027-01-25T16:00:00.000Z");
  });

  it("rejects a non-ISO value", async () => {
    const res = await app.inject({ method: "POST", url: "/clock", headers: authHeader(), payload: { now: "+30h" } });
    expect(res.statusCode).toBe(400);
  });
});
