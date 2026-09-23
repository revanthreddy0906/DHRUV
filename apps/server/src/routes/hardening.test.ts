import { describe, expect, it } from "vitest";
import { API, auth, login, makeApp, makeEvent, push, t } from "../test/helpers.js";

describe("CORS for the web app's origin", () => {
  it("allows the Vite dev server origin with the Authorization header", async () => {
    const { app } = makeApp();
    const res = await app.inject({
      method: "OPTIONS",
      url: `${API}/sync/pull`,
      headers: { origin: "http://localhost:5173", "access-control-request-method": "GET", "access-control-request-headers": "authorization" },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(String(res.headers["access-control-allow-headers"]).toLowerCase()).toContain("authorization");
  });

  it("does not allow other origins", async () => {
    const { app } = makeApp();
    const res = await app.inject({ method: "OPTIONS", url: `${API}/sync/pull`, headers: { origin: "https://evil.example", "access-control-request-method": "GET" } });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("every error uses the section 15 shape", () => {
  it("malformed JSON", async () => {
    const { app } = makeApp();
    const res = await app.inject({ method: "POST", url: `${API}/auth/login`, headers: { "content-type": "application/json" }, payload: "{not json" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "INVALID_EVENT" } });
  });

  it("unknown route", async () => {
    const { app } = makeApp();
    const res = await app.inject({ method: "GET", url: `${API}/nope` });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("body over 1 MB", async () => {
    const { app } = makeApp();
    const res = await app.inject({ method: "POST", url: `${API}/auth/login`, headers: { "content-type": "application/json" }, payload: JSON.stringify({ pad: "x".repeat(1_100_000) }) });
    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({ error: { code: "INVALID_EVENT" } });
  });
});

describe("performance budget (section 16)", () => {
  it("a push of 100 events takes under 1 s, even with 1,000 events already in the log", async () => {
    const { app } = makeApp();
    const maitri = await login(app, "MAITRI-TAB-01", "STATION_LEADER", "MAITRI");
    const hq = await login(app, "HQ-WEB-01", "HQ_OPS", "HQ");

    const minute = (i: number) => `2027-01-24T${String(8 + Math.floor(i / 60) % 12).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00.000Z`;
    for (let batch = 0; batch < 10; batch++) {
      const events = Array.from({ length: 100 }, (_, i) =>
        makeEvent(hq, "MISSION_UPDATED", { entity_type: "mission", entity_id: `M-${i % 7}` }, { mission_id: `M-${i % 7}`, fields: { i } }, minute(batch * 100 + i), { node_id: "MAITRI" }),
      );
      await push(app, hq, events);
    }

    // A realistic station batch: stock movements and safety-critical status changes, which trigger conflict checks.
    const batch = Array.from({ length: 100 }, (_, i) =>
      i % 2 === 0
        ? makeEvent(maitri, "STOCK_ISSUED", { entity_type: "inventory_item", entity_id: "INV-DSL" }, { item_id: "INV-DSL", qty: 0.1, reason: "burn" }, t(25, "09:00"))
        : makeEvent(maitri, "ASSET_STATUS_SET", { entity_type: "asset", entity_id: `SK-${i % 5}` }, { asset_id: `SK-${i % 5}`, status: "OK" }, t(25, "09:30")),
    );

    const started = performance.now();
    const res = await app.inject({ method: "POST", url: `${API}/sync/push`, headers: auth(maitri), payload: { device_id: maitri.device_id, events: batch } });
    const elapsed = performance.now() - started;

    expect(res.json().accepted).toHaveLength(100);
    expect(elapsed).toBeLessThan(1000);
  });
});
