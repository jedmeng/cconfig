import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import {
  absolutePublicUrl,
  getConfiguredBasePath,
  getCookiePath,
  getRequestBasePath,
  getSessionCookieOptions,
  isApiPath,
  isAuthExemptApiPath,
  isOutputApiPath,
  isSecureRequest,
  joinUrlPath,
  normalizeBasePath,
  resolveOidcRedirectUri,
  resolveReturnTo,
  resolveTrustProxy,
} from "./public-url.js";

describe("public-url", () => {
  afterEach(() => {
    delete process.env.CCONFIG_BASE_PATH;
    delete process.env.TRUST_PROXY;
    delete process.env.NODE_ENV;
  });

  it("normalizeBasePath handles empty and trailing slashes", () => {
    expect(normalizeBasePath("")).toBe("");
    expect(normalizeBasePath("/")).toBe("");
    expect(normalizeBasePath("cconfig/")).toBe("/cconfig");
    expect(normalizeBasePath("/cconfig///")).toBe("/cconfig");
  });

  it("resolveTrustProxy reads TRUST_PROXY env", () => {
    process.env.TRUST_PROXY = "true";
    expect(resolveTrustProxy()).toBe(true);
    process.env.TRUST_PROXY = "false";
    expect(resolveTrustProxy()).toBe(false);
    process.env.TRUST_PROXY = "2";
    expect(resolveTrustProxy()).toBe(2);
    process.env.TRUST_PROXY = "custom";
    expect(resolveTrustProxy()).toBe("custom");
  });

  it("resolveTrustProxy defaults by NODE_ENV", () => {
    process.env.NODE_ENV = "production";
    expect(resolveTrustProxy()).toBe(1);
    process.env.NODE_ENV = "development";
    expect(resolveTrustProxy()).toBe("loopback");
  });
  it("joinUrlPath merges segments", () => {
    expect(joinUrlPath("/cconfig", "api", "health")).toBe("/cconfig/api/health");
  });

  it("resolveOidcRedirectUri uses forwarded headers", async () => {
    const app = express();
    app.set("trust proxy", 1);
    app.get("/probe", (req, res) => {
      res.json({ redirectUri: resolveOidcRedirectUri(req) });
    });
    const res = await request(app)
      .get("/probe")
      .set("X-Forwarded-Proto", "https")
      .set("X-Forwarded-Host", "proxy.example.com")
      .set("X-Forwarded-Prefix", "/cconfig");
    expect(res.body.redirectUri).toBe("https://proxy.example.com/cconfig/api/auth/oidc/callback");
  });

  it("resolveReturnTo rejects foreign origins", () => {
    const req = {
      protocol: "https",
      secure: true,
      get: (name: string) => (name.toLowerCase() === "host" ? "app.example.com" : undefined),
      headers: {},
    } as express.Request;
    expect(resolveReturnTo(req, "https://evil.example/phishing")).toBe("https://app.example.com");
    expect(resolveReturnTo(req, "https://app.example.com/#/sources")).toBe(
      "https://app.example.com/#/sources",
    );
  });

  it("isApiPath respects base path", () => {
    expect(isApiPath("/cconfig/api/health", "/cconfig")).toBe(true);
    expect(isApiPath("/cconfig/assets/x.js", "/cconfig")).toBe(false);
  });

  it("getConfiguredBasePath reads env", () => {
    const prev = process.env.CCONFIG_BASE_PATH;
    process.env.CCONFIG_BASE_PATH = "/app/";
    expect(getConfiguredBasePath()).toBe("/app");
    if (prev === undefined) delete process.env.CCONFIG_BASE_PATH;
    else process.env.CCONFIG_BASE_PATH = prev;
  });

  it("absolutePublicUrl without base path", () => {
    const req = {
      protocol: "http",
      secure: false,
      get: (name: string) => (name.toLowerCase() === "host" ? "localhost:8787" : undefined),
      headers: {},
    } as express.Request;
    expect(absolutePublicUrl(req, "/api/health")).toBe("http://localhost:8787/api/health");
  });

  it("getRequestBasePath uses X-Forwarded-Prefix when env unset", () => {
    const req = {
      protocol: "https",
      secure: true,
      get: (_name: string): string | undefined => undefined,
      headers: { "x-forwarded-prefix": "/cconfig/" },
    } as unknown as express.Request;
    expect(getRequestBasePath(req)).toBe("/cconfig");
    expect(getCookiePath(req)).toBe("/cconfig/");
  });

  it("isSecureRequest respects forwarded proto", () => {
    const req = {
      protocol: "http",
      secure: false,
      get: (_name: string): string | undefined => undefined,
      headers: { "x-forwarded-proto": "https" },
    } as unknown as express.Request;
    expect(isSecureRequest(req)).toBe(true);
    expect(getSessionCookieOptions(req)).toMatchObject({ secure: true, httpOnly: true, sameSite: "lax" });
  });

  it("resolveReturnTo falls back on malformed url", () => {
    const req = {
      protocol: "https",
      secure: true,
      get: (name: string) => (name.toLowerCase() === "host" ? "app.example.com" : undefined),
      headers: {},
    } as express.Request;
    expect(resolveReturnTo(req, "http://%zz")).toBe("https://app.example.com");
  });

  it("isOutputApiPath and isAuthExemptApiPath", () => {
    expect(isOutputApiPath("/api/output/s1.yaml")).toBe(true);
    expect(isOutputApiPath("/api/output/s1.json")).toBe(false);
    expect(isAuthExemptApiPath("/api/health")).toBe(true);
    expect(isAuthExemptApiPath("/api/auth/oidc/start")).toBe(true);
    expect(isAuthExemptApiPath("/api/output/s1.yaml")).toBe(true);
    expect(isAuthExemptApiPath("/api/sources")).toBe(false);
  });

  it("resolveOidcRedirectUri prefers stored redirect uri", () => {
    const req = {
      protocol: "http",
      secure: false,
      get: (name: string) => (name.toLowerCase() === "host" ? "localhost" : undefined),
      headers: {},
    } as express.Request;
    expect(resolveOidcRedirectUri(req, " https://custom/callback ")).toBe("https://custom/callback");
  });
});
