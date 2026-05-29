import { log } from "./logger.js";

export interface OidcEndpoints {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  userinfoEndpoint?: string;
}

let cached: OidcEndpoints | null = null;

function testFallbackEndpoints(issuer: string): OidcEndpoints {
  const base = issuer.replace(/\/+$/, "");
  return {
    issuer: base,
    authorizationEndpoint: `${base}/authorize`,
    tokenEndpoint: `${base}/token`,
    jwksUri: `${base}/.well-known/jwks.json`,
  };
}

export async function ensureOidcDiscovery(issuer: string): Promise<OidcEndpoints> {
  const normalizedIssuer = issuer.replace(/\/+$/, "");
  if (cached?.issuer === normalizedIssuer) {
    log.debug("OIDC discovery cache hit", { issuer: normalizedIssuer });
    return cached;
  }

  if (process.env.NODE_ENV === "test") {
    cached = testFallbackEndpoints(normalizedIssuer);
    log.debug("OIDC discovery using test fallback", { issuer: normalizedIssuer });
    return cached;
  }

  const discoveryUrl = new URL(
    ".well-known/openid-configuration",
    `${normalizedIssuer}/`,
  );
  log.info("fetching OIDC discovery document", { url: discoveryUrl.toString() });
  const resp = await fetch(discoveryUrl);
  if (!resp.ok) {
    log.error("OIDC discovery request failed", undefined, {
      status: resp.status,
      url: discoveryUrl.toString(),
    });
    throw new Error(`OIDC discovery failed (${resp.status}): ${discoveryUrl}`);
  }
  const doc = (await resp.json()) as {
    issuer?: string;
    authorization_endpoint?: string;
    token_endpoint?: string;
    jwks_uri?: string;
    userinfo_endpoint?: string;
  };
  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) {
    throw new Error("OIDC discovery document missing required endpoints");
  }

  cached = {
    issuer: doc.issuer ?? normalizedIssuer,
    authorizationEndpoint: doc.authorization_endpoint,
    tokenEndpoint: doc.token_endpoint,
    jwksUri: doc.jwks_uri,
    userinfoEndpoint: doc.userinfo_endpoint,
  };
  log.info("OIDC discovery document loaded", {
    issuer: cached.issuer,
    hasUserinfo: Boolean(cached.userinfoEndpoint),
  });
  return cached;
}

export function getOidcEndpoints(): OidcEndpoints {
  if (!cached) {
    throw new Error("OIDC discovery not initialized; call ensureOidcDiscovery() at startup");
  }
  return cached;
}

export function resetOidcDiscoveryForTests(): void {
  cached = null;
}
