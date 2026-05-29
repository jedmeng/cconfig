import type { CookieOptions, Request } from "express";

/** 应用挂载前缀，如 /cconfig（勿带尾部斜杠） */
export function getConfiguredBasePath(): string {
  return normalizeBasePath(process.env.CCONFIG_BASE_PATH ?? "");
}

export function normalizeBasePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/+$/, "");
}

export function joinUrlPath(...segments: string[]): string {
  const parts = segments
    .flatMap((s) => s.split("/"))
    .filter(Boolean);
  return parts.length ? `/${parts.join("/")}` : "";
}

export function resolveTrustProxy(): boolean | number | string {
  const raw = process.env.TRUST_PROXY;
  if (raw === undefined || raw === "") {
    return process.env.NODE_ENV === "production" ? 1 : "loopback";
  }
  if (raw === "true") return true;
  if (raw === "false") return false;
  const hops = Number(raw);
  if (!Number.isNaN(hops)) return hops;
  return raw;
}

function forwardedHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (typeof value === "string" && value.trim()) return value.split(",")[0]?.trim();
  if (Array.isArray(value) && value[0]) return String(value[0]).split(",")[0]?.trim();
  return undefined;
}

/** 单次请求的有效挂载前缀：环境变量优先，其次 X-Forwarded-Prefix */
export function getRequestBasePath(req: Request): string {
  const configured = getConfiguredBasePath();
  if (configured) return configured;
  const prefix = forwardedHeader(req, "x-forwarded-prefix");
  return normalizeBasePath(prefix ?? "");
}

export function getPublicOrigin(req: Request): string {
  const proto = forwardedHeader(req, "x-forwarded-proto") ?? req.protocol;
  const host = forwardedHeader(req, "x-forwarded-host") ?? req.get("host") ?? "localhost";
  return `${proto}://${host}`;
}

export function absolutePublicUrl(req: Request, pathname: string): string {
  return `${getPublicOrigin(req)}${joinUrlPath(getRequestBasePath(req), pathname)}`;
}

export function isSecureRequest(req: Request): boolean {
  if (req.secure) return true;
  const proto = forwardedHeader(req, "x-forwarded-proto");
  return proto === "https";
}

export function getCookiePath(req: Request): string {
  const base = getRequestBasePath(req);
  return base ? `${base}/` : "/";
}

export function getSessionCookieOptions(req: Request): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    path: getCookiePath(req),
  };
}

export function resolveOidcRedirectUri(req: Request, storedRedirectUri?: string): string {
  if (storedRedirectUri?.trim()) return storedRedirectUri.trim();
  return absolutePublicUrl(req, "/api/auth/oidc/callback");
}

/** 登录后回跳地址：仅允许同源，防止开放重定向 */
export function resolveReturnTo(req: Request, returnTo?: string): string {
  const fallback = absolutePublicUrl(req, "/");
  if (!returnTo?.trim()) return fallback;
  try {
    const target = new URL(returnTo, getPublicOrigin(req));
    const origin = new URL(getPublicOrigin(req));
    if (target.origin !== origin.origin) return fallback;
    return target.toString();
  } catch {
    return fallback;
  }
}

export function isApiPath(reqPath: string, basePath: string): boolean {
  const apiRoot = joinUrlPath(basePath, "/api");
  return reqPath === apiRoot || reqPath.startsWith(`${apiRoot}/`);
}

/** 对外发布的 scheme YAML，OAuth 开启时也可匿名访问 */
export function isOutputApiPath(reqPath: string): boolean {
  return reqPath.startsWith("/api/output/") && reqPath.endsWith(".yaml");
}

/** OIDC 开启时无需会话即可访问的 API */
export function isAuthExemptApiPath(reqPath: string): boolean {
  if (isOutputApiPath(reqPath)) return true;
  return (
    reqPath === "/api/health" ||
    reqPath === "/api/auth/oidc/start" ||
    reqPath === "/api/auth/oidc/callback" ||
    reqPath === "/api/auth/oidc/token-login" ||
    reqPath === "/api/auth/logout"
  );
}
