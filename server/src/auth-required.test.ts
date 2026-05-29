import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { authRequired } from "./auth.js";
import { store } from "./store.js";

function runAuthRequired(cookie?: string): {
  req: Request & { username?: string };
  res: Response;
  next: NextFunction;
} {
  const req = {
    cookies: cookie ? { cc_sid: cookie } : {},
    path: "/api/test",
  } as Request & { username?: string };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  authRequired(req, res, next);
  return { req, res, next };
}

describe("authRequired", () => {
  beforeEach(() => {
    store.sessions.clear();
  });

  it("allows request when OIDC is disabled", () => {
    store.oidcEnabled = false;
    store.oidc = null;
    const { req, res, next } = runAuthRequired();
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.username).toBe("local");
  });

  it("returns 401 when OIDC enabled without session cookie", () => {
    store.oidcEnabled = true;
    store.oidc = {
      issuer: "https://idp.example.com",
      clientId: "c",
      clientSecret: "s",
      redirectUri: "",
      preferredUsernameWhitelist: ["admin"],
    };
    const { res, next } = runAuthRequired();
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "unauthorized" });
  });

  it("allows request when OIDC enabled with valid session", () => {
    store.oidcEnabled = true;
    store.oidc = {
      issuer: "https://idp.example.com",
      clientId: "c",
      clientSecret: "s",
      redirectUri: "",
      preferredUsernameWhitelist: ["admin"],
    };
    store.sessions.set("sid-1", { username: "admin", expiresAt: Date.now() + 60_000 });
    const { req, res, next } = runAuthRequired("sid-1");
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.username).toBe("admin");
  });
});
