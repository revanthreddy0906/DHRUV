import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { ERROR_CODES, EVENT_TYPES } from "@dhruv/shared";
import { buildApp } from "../app.js";
import { openDb } from "../db/index.js";
import { API } from "../test/helpers.js";

const spec = parse(readFileSync(new URL("../../openapi.yaml", import.meta.url), "utf8"));

describe("openapi.yaml stays in step with the server", () => {
  it("documents exactly the routes the server registers", async () => {
    const app = buildApp(openDb(":memory:"));
    const registered = new Set<string>();
    app.addHook("onRoute", (route) => {
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      if (!route.url.startsWith(API)) return;
      for (const m of methods) if (m !== "HEAD" && m !== "OPTIONS") registered.add(`${m} ${route.url.slice(API.length).replace(/:(\w+)/g, "{$1}")}`);
    });
    await app.ready();

    const documented = new Set(
      Object.entries(spec.paths as Record<string, Record<string, unknown>>).flatMap(([path, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${path}`)),
    );
    expect([...documented].sort()).toEqual([...registered].sort());
  });

  it("lists the same event types and error codes as packages/shared", () => {
    expect([...spec.components.schemas.EventType.enum].sort()).toEqual([...EVENT_TYPES].sort());
    expect([...spec.components.schemas.ErrorCode.enum].sort()).toEqual([...ERROR_CODES].sort());
  });

  it("is served without auth", async () => {
    const app = buildApp(openDb(":memory:"));
    const res = await app.inject({ method: "GET", url: `${API}/openapi.yaml` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/yaml");
    expect(parse(res.body).info.title).toBe("DHRUV API");
  });
});
