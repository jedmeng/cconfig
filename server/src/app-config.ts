import fs from "node:fs";
import YAML from "yaml";
import { log } from "./logger.js";
import { getConfigFilePath } from "./runtime-config.js";
import type { OidcConfig } from "./types.js";

export interface AppConfig {
  oidcEnabled: boolean;
  oidc: OidcConfig | null;
}

export function isOidcEnabledEnv(): boolean {
  const raw = process.env.CCONFIG_OIDC_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

function readConfigFile(configPath: string): Partial<{ oidc?: OidcConfig }> | null {
  if (!fs.existsSync(configPath)) return null;
  try {
    const parsed = YAML.parse(fs.readFileSync(configPath, "utf8")) as Partial<{ oidc?: OidcConfig }>;
    log.info("loaded config file", { configPath });
    return parsed;
  } catch (err) {
    log.warn("failed to parse config file", { configPath });
    log.error("config parse error", err);
    return null;
  }
}

function isOidcConfigComplete(oidc: OidcConfig): boolean {
  return Boolean(
    oidc.issuer?.trim()
      && oidc.clientId?.trim()
      && oidc.clientSecret?.trim()
      && oidc.preferredUsernameWhitelist?.length,
  );
}

export function loadAppConfig(): AppConfig {
  const configPath = getConfigFilePath();

  if (!isOidcEnabledEnv()) {
    log.info("OIDC disabled (set CCONFIG_OIDC_ENABLED=true to enable)");
    return { oidcEnabled: false, oidc: null };
  }

  const fromFile = readConfigFile(configPath);
  if (fromFile === null) {
    log.warn("CCONFIG_OIDC_ENABLED is set but config file is missing or invalid; OIDC disabled", {
      configPath,
    });
    return { oidcEnabled: false, oidc: null };
  }

  const oidc = fromFile.oidc;
  if (!oidc) {
    log.warn("CCONFIG_OIDC_ENABLED is set but config.yaml has no oidc section; OIDC disabled", {
      configPath,
    });
    return { oidcEnabled: false, oidc: null };
  }

  if (!isOidcConfigComplete(oidc)) {
    log.warn("CCONFIG_OIDC_ENABLED is set but oidc config is incomplete; OIDC disabled", { configPath });
    return { oidcEnabled: false, oidc: null };
  }

  log.info("OIDC enabled", {
    issuer: oidc.issuer,
    clientId: oidc.clientId,
    whitelistSize: oidc.preferredUsernameWhitelist.length,
  });
  return { oidcEnabled: true, oidc };
}
