import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureOidcDiscovery, resetOidcDiscoveryForTests } from "./oidc-discovery.js";

describe("ensureOidcDiscovery", () => {
  afterEach(() => {
    resetOidcDiscoveryForTests();
    vi.unstubAllGlobals();
  });

  it("loads Authelia-style discovery document", async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          issuer: "https://authelia.example.com",
          authorization_endpoint: "https://authelia.example.com/api/oidc/authorization",
          token_endpoint: "https://authelia.example.com/api/oidc/token",
          jwks_uri: "https://authelia.example.com/jwks.json",
          userinfo_endpoint: "https://authelia.example.com/api/oidc/userinfo",
        }),
      })),
    );

    let endpoints;
    try {
      endpoints = await ensureOidcDiscovery("https://authelia.example.com");
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
    expect(endpoints.authorizationEndpoint).toBe(
      "https://authelia.example.com/api/oidc/authorization",
    );
    expect(endpoints.tokenEndpoint).toBe("https://authelia.example.com/api/oidc/token");
    expect(endpoints.jwksUri).toBe("https://authelia.example.com/jwks.json");
    expect(endpoints.userinfoEndpoint).toBe("https://authelia.example.com/api/oidc/userinfo");
  });
});
