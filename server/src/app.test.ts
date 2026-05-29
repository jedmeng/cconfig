import { beforeEach, describe, expect, it } from "vitest";
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

function enableOidcForApp(): void {
  store.oidcEnabled = true;
  store.oidc = testOidc;
}

describe("app auth and scheme endpoints", () => {
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

  it("returns 401 without session cookie", async () => {
    const app = createApp();
    enableOidcForApp();
    const res = await request(app).get("/api/sources");
    expect(res.status).toBe(401);
  });

  it("creates source/modifier/scheme and previews/outputs yaml", async () => {
    const app = createApp();
    enableOidcForApp();
    const sid = "test-session";
    store.sessions.set(sid, { username: "admin", expiresAt: Date.now() + 60_000 });
    const cookie = `cc_sid=${sid}`;

    const sourceResp = await request(app)
      .post("/api/sources")
      .set("Cookie", cookie)
      .send({
        name: "local",
        kind: "upload",
        filePath: "data/config-template.yaml",
        updateIntervalSeconds: 0,
      });
    expect(sourceResp.status).toBe(200);

    const modifierResp = await request(app)
      .post("/api/modifiers")
      .set("Cookie", cookie)
      .send({
        name: "m1",
        simpleEdits: [],
        ruleEdits: [{ path: "dns.enable", op: "replace", value: true }],
        codeEdits: [],
      });
    expect(modifierResp.status).toBe(200);

    const schemeResp = await request(app)
      .post("/api/schemes")
      .set("Cookie", cookie)
      .send({
        name: "s1",
        sourceId: sourceResp.body.id,
        modifierIds: [modifierResp.body.id],
      });
    expect(schemeResp.status).toBe(200);

    const previewResp = await request(app)
      .get(`/api/schemes/${schemeResp.body.id}/preview`)
      .set("Cookie", cookie);
    expect(previewResp.status).toBe(200);
    expect(previewResp.body.steps.length).toBeGreaterThan(1);
    expect(previewResp.headers["x-compile-cache"]).toBe("MISS");

    const previewResp2 = await request(app)
      .get(`/api/schemes/${schemeResp.body.id}/preview`)
      .set("Cookie", cookie);
    expect(previewResp2.status).toBe(200);
    expect(previewResp2.headers["x-compile-cache"]).toBe("HIT");

    const outputResp = await request(app).get(`/api/output/${schemeResp.body.id}.yaml`);
    expect(outputResp.status).toBe(200);
    expect(outputResp.text).toContain("dns:");
    expect(outputResp.headers["x-compile-cache"]).toBe("HIT");

    await request(app)
      .post("/api/modifiers")
      .set("Cookie", cookie)
      .send({
        name: "m2",
        simpleEdits: [],
        ruleEdits: [{ path: "mode", op: "replace", value: "rule" }],
        codeEdits: [],
      });
    const previewAfterInvalidate = await request(app)
      .get(`/api/schemes/${schemeResp.body.id}/preview`)
      .set("Cookie", cookie);
    expect(previewAfterInvalidate.headers["x-compile-cache"]).toBe("MISS");

    const modifierPreviewResp = await request(app)
      .post(`/api/modifiers/${modifierResp.body.id}/preview?sourceId=${sourceResp.body.id}`)
      .set("Cookie", cookie)
      .send({
        simpleEdits: [
          {
            id: "e1",
            conditionGroups: [[{ path: "", op: "alwaysTrue" }]],
            actions: [
              { path: "port", op: "setValue", value: 1234 },
              { path: "mixed-port", op: "delete" },
            ],
          },
        ],
        ruleEdits: [],
        codeEdits: [],
      });
    expect(modifierPreviewResp.status).toBe(200);
    expect(modifierPreviewResp.body.finalYaml).toContain("port: 1234");
    expect(modifierPreviewResp.body.finalYaml).not.toContain("mixed-port:");
  });
});
