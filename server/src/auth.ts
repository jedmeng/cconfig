import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { log } from "./logger.js";
import { getOidcEndpoints } from "./oidc-discovery.js";
import {
  absolutePublicUrl,
  getSessionCookieOptions,
  isApiPath,
  isAuthExemptApiPath,
  resolveOidcRedirectUri,
  resolveReturnTo,
} from "./public-url.js";
import { store } from "./store.js";

function createSession(
  username: string,
  claims: Record<string, unknown>,
  req: Request,
  res: Response,
): void {
  const sid = crypto.randomUUID();
  const email = String(claims.email ?? "").trim() || undefined;
  store.sessions.set(sid, {
    username,
    email,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24,
  });
  res.cookie("cc_sid", sid, getSessionCookieOptions(req));
  log.info("session created", { username, hasEmail: Boolean(email) });
}

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function extractOidcUserClaims(payload: Record<string, unknown>) {
  return {
    preferred_username: payload.preferred_username,
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
  };
}

function whitelistCandidates(payload: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const add = (value: unknown) => {
    const text = String(value ?? "").trim();
    if (text) out.add(text);
  };
  add(payload.preferred_username);
  add(payload.email);
  add(payload.sub);
  add(payload.name);
  const email = String(payload.email ?? "").trim();
  if (email.includes("@")) add(email.split("@")[0]);
  return [...out];
}

function resolveSessionUsername(payload: Record<string, unknown>): string {
  const preferred = String(payload.preferred_username ?? "").trim();
  if (preferred) return preferred;
  const email = String(payload.email ?? "").trim();
  if (email) return email.includes("@") ? email.split("@")[0]! : email;
  const name = String(payload.name ?? "").trim();
  if (name) return name;
  return String(payload.sub ?? "").trim();
}

async function enrichPayloadFromUserinfo(
  payload: Record<string, unknown>,
  accessToken?: string,
): Promise<Record<string, unknown>> {
  if (!accessToken || payload.preferred_username) return payload;
  const { userinfoEndpoint } = getOidcEndpoints();
  if (!userinfoEndpoint) return payload;
  const resp = await fetch(userinfoEndpoint, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) return payload;
  const userinfo = (await resp.json()) as Record<string, unknown>;
  return { ...userinfo, ...payload };
}

function requireWhitelistedUsername(payload: Record<string, unknown>): string {
  if (!store.oidc) throw new Error("OIDC is not enabled");
  const whitelist = [...store.oidc.preferredUsernameWhitelist];
  const candidates = whitelistCandidates(payload);
  const matched = candidates.find((c) => whitelist.includes(c));
  if (!matched) {
    log.warn("OIDC user rejected by whitelist", {
      candidates,
      whitelistSize: whitelist.length,
    });
    const err = new Error("user not in whitelist") as Error & {
      statusCode?: number;
      debug?: {
        whitelist: string[];
        oidcUser: ReturnType<typeof extractOidcUserClaims>;
        candidates: string[];
      };
    };
    err.statusCode = 403;
    err.debug = { whitelist, oidcUser: extractOidcUserClaims(payload), candidates };
    throw err;
  }
  return resolveSessionUsername(payload) || matched;
}

export function getOidcStartUrl(req: Request, returnTo?: string): string {
  if (!store.oidcEnabled || !store.oidc) {
    throw new Error("OIDC is not enabled");
  }
  const oidc = store.oidc;
  const state = crypto.randomUUID();
  const codeVerifier = generateCodeVerifier();
  const redirectUri = resolveOidcRedirectUri(req, oidc.redirectUri);
  store.oidcStates.set(state, {
    expiresAt: Date.now() + 5 * 60 * 1000,
    returnTo,
    codeVerifier,
    redirectUri,
  });
  const { authorizationEndpoint } = getOidcEndpoints();
  const authUrl = new URL(authorizationEndpoint);
  authUrl.searchParams.set("client_id", oidc.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", oidc.scope ?? "openid profile email");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", generateCodeChallenge(codeVerifier));
  authUrl.searchParams.set("code_challenge_method", "S256");
  log.debug("OIDC authorization redirect prepared", { redirectUri });
  return authUrl.toString();
}

export async function handleOidcCodeCallback(req: Request, res: Response): Promise<void> {
  if (!store.oidcEnabled || !store.oidc) {
    res.status(503).json({ error: "oidc disabled" });
    return;
  }
  const oidc = store.oidc;
  const oauthError = String(req.query.error ?? "");
  if (oauthError) {
    log.warn("OIDC callback returned error", {
      error: oauthError,
      description: String(req.query.error_description ?? ""),
    });
    res.status(400).json({
      error: oauthError,
      description: String(req.query.error_description ?? ""),
    });
    return;
  }

  const code = String(req.query.code ?? "");
  const state = String(req.query.state ?? "");
  if (!code || !state) {
    log.warn("OIDC callback missing code or state");
    res.status(400).json({ error: "code/state missing" });
    return;
  }
  const stateObj = store.oidcStates.get(state);
  if (!stateObj || stateObj.expiresAt < Date.now()) {
    log.warn("OIDC callback invalid or expired state");
    res.status(400).json({ error: "invalid state" });
    return;
  }
  store.oidcStates.delete(state);

  const { tokenEndpoint, jwksUri, issuer } = getOidcEndpoints();
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: stateObj.redirectUri,
    code_verifier: stateObj.codeVerifier,
  });
  const clientAuth = Buffer.from(`${oidc.clientId}:${oidc.clientSecret}`).toString("base64");
  const tokenResp = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${clientAuth}`,
    },
    body: tokenBody,
  });
  if (!tokenResp.ok) {
    const detail = await tokenResp.text();
    log.warn("OIDC token exchange failed", { status: tokenResp.status });
    res.status(400).json({
      error: `token exchange failed: ${tokenResp.status}`,
      detail: detail || undefined,
    });
    return;
  }
  const tokenData = (await tokenResp.json()) as { id_token?: string; access_token?: string };
  if (!tokenData.id_token) {
    log.warn("OIDC token response missing id_token");
    res.status(400).json({ error: "id_token missing in token response" });
    return;
  }

  const jwks = createRemoteJWKSet(new URL(jwksUri));
  const { payload } = await jwtVerify(tokenData.id_token, jwks, {
    issuer,
    audience: oidc.clientId,
  });
  const claims = await enrichPayloadFromUserinfo(
    payload as Record<string, unknown>,
    tokenData.access_token,
  );
  const username = requireWhitelistedUsername(claims);
  createSession(username, claims, req, res);
  log.info("OIDC code login succeeded", { username });
  res.redirect(resolveReturnTo(req, stateObj.returnTo));
}

export async function handleOidcCallbackWithIdToken(req: Request, res: Response): Promise<void> {
  if (!store.oidcEnabled || !store.oidc) {
    res.status(503).json({ error: "oidc disabled" });
    return;
  }
  const oidc = store.oidc;
  const idToken = String(req.body?.idToken ?? "");
  if (!idToken) {
    log.warn("token-login missing idToken");
    res.status(400).json({ error: "idToken is required" });
    return;
  }
  const { jwksUri, issuer } = getOidcEndpoints();
  const jwks = createRemoteJWKSet(new URL(jwksUri));
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer,
    audience: oidc.clientId,
  });
  const claims = payload as Record<string, unknown>;
  const username = requireWhitelistedUsername(claims);
  createSession(username, claims, req, res);
  log.info("OIDC token-login succeeded", { username });
  res.json({ ok: true, username });
}

type AuthedRequest = Request & { username?: string };

export function tryAttachSession(req: Request): boolean {
  if (!store.oidcEnabled) {
    (req as AuthedRequest).username = "local";
    return true;
  }
  const sid = String(req.cookies?.cc_sid ?? "");
  if (!sid) return false;
  const session = store.sessions.get(sid);
  if (!session || session.expiresAt < Date.now()) {
    if (session) {
      store.sessions.delete(sid);
      log.debug("auth rejected: session expired", { username: session.username, path: req.path });
    } else {
      log.debug("auth rejected: unknown session", { path: req.path });
    }
    return false;
  }
  (req as AuthedRequest).username = session.username;
  return true;
}

/** 拦截所有非豁免 API：未登录返回 401 */
export function oidcApiGate(req: Request, res: Response, next: NextFunction): void {
  const path = req.path || "/";
  if (!isApiPath(path, "")) return next();
  if (!store.oidcEnabled) {
    tryAttachSession(req);
    return next();
  }
  if (isAuthExemptApiPath(path)) return next();
  if (tryAttachSession(req)) return next();
  log.debug("auth rejected: no session cookie", { path });
  res.status(401).json({ error: "unauthorized" });
}

/** 拦截 SPA / 静态资源：未登录重定向到 OIDC */
export function requireAuthForPage(req: Request, res: Response, next: NextFunction): void {
  if (!store.oidcEnabled) return next();
  if (tryAttachSession(req)) return next();
  const returnTo = absolutePublicUrl(req, req.originalUrl || "/");
  try {
    res.redirect(getOidcStartUrl(req, returnTo));
  } catch (err) {
    log.error("OIDC redirect unavailable", err);
    res.status(503).send("oidc unavailable");
  }
}

export function authRequired(req: Request, res: Response, next: NextFunction): void {
  if (tryAttachSession(req)) {
    next();
    return;
  }
  log.debug("auth rejected: no session cookie", { path: req.path });
  res.status(401).json({ error: "unauthorized" });
}
