import fs from "node:fs";
import path from "node:path";
import type { ConfigSource, Modifier, OidcConfig, Scheme } from "./types.js";
import { loadAppConfig } from "./app-config.js";
import { log } from "./logger.js";
import { getStateFilePath } from "./runtime-config.js";

const stateFilePath = getStateFilePath();

const appConfig = loadAppConfig();

export const store: {
  sources: ConfigSource[];
  modifiers: Modifier[];
  schemes: Scheme[];
  sessions: Map<string, { username: string; email?: string; expiresAt: number }>;
  oidcEnabled: boolean;
  oidc: OidcConfig | null;
  oidcStates: Map<
    string,
    { expiresAt: number; returnTo?: string; codeVerifier: string; redirectUri: string }
  >;
} = {
  sources: [],
  modifiers: [],
  schemes: [],
  sessions: new Map(),
  oidcEnabled: appConfig.oidcEnabled,
  oidc: appConfig.oidc,
  oidcStates: new Map(),
};

export function loadConfig(): void {
  const cfg = loadAppConfig();
  store.oidcEnabled = cfg.oidcEnabled;
  store.oidc = cfg.oidc;
  log.debug("in-memory app config refreshed", { oidcEnabled: store.oidcEnabled });
}

export function loadStoreFromDisk(): void {
  if (process.env.NODE_ENV === "test") return;
  if (!fs.existsSync(stateFilePath)) {
    log.info("state file not found, starting with empty store", { stateFilePath });
    return;
  }
  try {
    const text = fs.readFileSync(stateFilePath, "utf8");
    const parsed = JSON.parse(text) as Partial<{
      sources: ConfigSource[];
      modifiers: Modifier[];
      schemes: Scheme[];
    }>;
    const migratedSources = (parsed.sources ?? []).map((source: any) => ({
      ...source,
      kind: source.kind === "file" ? "upload" : source.kind,
      updateIntervalSeconds:
        typeof source.updateIntervalSeconds === "number"
          ? source.updateIntervalSeconds
          : typeof source.updateIntervalMinutes === "number"
            ? source.updateIntervalMinutes * 60
            : 0,
    })) as ConfigSource[];
    store.sources = migratedSources;
    store.modifiers = parsed.modifiers ?? [];
    store.schemes = parsed.schemes ?? [];
    log.info("loaded state from disk", {
      stateFilePath,
      sources: store.sources.length,
      modifiers: store.modifiers.length,
      schemes: store.schemes.length,
    });
  } catch (err) {
    log.warn("corrupted state file, continuing with defaults", { stateFilePath });
    log.error("state load error", err);
  }
}

export function persistStoreToDisk(): void {
  if (process.env.NODE_ENV === "test") return;
  const payload = {
    sources: store.sources,
    modifiers: store.modifiers,
    schemes: store.schemes,
  };
  fs.mkdirSync(path.dirname(stateFilePath), { recursive: true });
  fs.writeFileSync(stateFilePath, JSON.stringify(payload, null, 2), "utf8");
  log.debug("persisted state to disk", {
    stateFilePath,
    sources: store.sources.length,
    modifiers: store.modifiers.length,
    schemes: store.schemes.length,
  });
}
