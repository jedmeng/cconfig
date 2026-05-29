import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import { ensureOidcDiscovery, resetOidcDiscoveryForTests } from "./oidc-discovery.js";
import { store } from "./store.js";

const testOidc = {
  issuer: "https://example-issuer.com",
  clientId: "test-client",
  clientSecret: "test-secret",
  redirectUri: "",
  preferredUsernameWhitelist: ["admin"],
};

function disableOidcForApp(): void {
  store.oidcEnabled = false;
  store.oidc = null;
}

function enableOidcForApp(): void {
  store.oidcEnabled = true;
  store.oidc = testOidc;
}

describe("API auth when OIDC disabled", () => {
  beforeEach(() => {
    delete process.env.CCONFIG_OIDC_ENABLED;
    store.sources = [];
    store.modifiers = [];
    store.schemes = [];
    store.sessions.clear();
  });

  afterEach(() => {
    delete process.env.CCONFIG_OIDC_ENABLED;
  });

  it("GET /api/auth/me returns only oidcEnabled false", async () => {
    const app = createApp();
    disableOidcForApp();
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ oidcEnabled: false });
    expect(res.body.username).toBeUndefined();
    expect(res.body.avatarUrl).toBeUndefined();
  });

  it("allows protected API without session cookie", async () => {
    const app = createApp();
    disableOidcForApp();
    const res = await request(app).get("/api/sources");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("POST /api/auth/logout succeeds without clearing requirement", async () => {
    const app = createApp();
    disableOidcForApp();
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("GET /api/auth/oidc/start returns 503", async () => {
    const app = createApp();
    disableOidcForApp();
    const res = await request(app).get("/api/auth/oidc/start");
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("oidc disabled");
  });
});

describe("API auth when OIDC enabled", () => {
  beforeEach(async () => {
    resetOidcDiscoveryForTests();
    process.env.CCONFIG_OIDC_ENABLED = "true";
    enableOidcForApp();
    await ensureOidcDiscovery(testOidc.issuer);
    store.sources = [];
    store.modifiers = [];
    store.schemes = [];
    store.sessions.clear();
  });

  afterEach(() => {
    delete process.env.CCONFIG_OIDC_ENABLED;
  });

  it("GET /api/auth/me returns 401 without session", async () => {
    const app = createApp();
    enableOidcForApp();
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("GET /api/auth/me returns user profile when session exists", async () => {
    const app = createApp();
    enableOidcForApp();
    store.sessions.set("sid-admin", {
      username: "admin",
      email: "admin@example.com",
      expiresAt: Date.now() + 60_000,
    });
    const res = await request(app).get("/api/auth/me").set("Cookie", "cc_sid=sid-admin");
    expect(res.status).toBe(200);
    expect(res.body.oidcEnabled).toBe(true);
    expect(res.body.username).toBe("admin");
    expect(res.body.email).toBe("admin@example.com");
    expect(typeof res.body.avatarUrl).toBe("string");
    expect(res.body.avatarUrl.length).toBeGreaterThan(0);
  });

  it("GET /api/auth/oidc/start redirects to authorization endpoint", async () => {
    const app = createApp();
    enableOidcForApp();
    const res = await request(app).get("/api/auth/oidc/start");
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("example-issuer.com");
    expect(res.headers.location).toContain("authorize");
  });

  it("GET / redirects to OIDC when unauthenticated and dist exists", async () => {
    const app = createApp();
    enableOidcForApp();
    const res = await request(app).get("/");
    if (res.status === 404) return;
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("example-issuer.com");
  });

  it("GET / serves web when session exists", async () => {
    const app = createApp();
    enableOidcForApp();
    store.sessions.set("sid-admin", {
      username: "admin",
      expiresAt: Date.now() + 60_000,
    });
    const res = await request(app).get("/").set("Cookie", "cc_sid=sid-admin");
    if (res.status === 404) return;
    expect(res.status).toBe(200);
    expect(res.text).toContain("<!doctype html");
  });
});
