import fs from "node:fs";
import path from "node:path";
import { log } from "./logger.js";

/** Repo / deploy root (parent of `server/` when cwd is the server package). */
export function getProjectRoot(): string {
  return path.resolve(process.cwd(), "..");
}

/** Writable runtime data (state.json, sources/). Docker default: /config */
export function getDataDir(): string {
  return path.resolve(process.env.CCONFIG_DATA_DIR ?? path.resolve(getProjectRoot(), 'data'));
}

/** Deploy config directory; file name is always `config.yaml`. Docker default: /config */
export function getConfigDir(): string {
  return path.resolve(process.env.CCONFIG_CONFIG_DIR ?? path.resolve(getProjectRoot(), 'config'));
}

export function getConfigFilePath(): string {
  return path.join(getConfigDir(), "config.yaml");
}

export function getStateFilePath(): string {
  return path.join(getDataDir(), "state.json");
}

export function getSourcesDir(): string {
  return path.join(getDataDir(), "sources");
}

export function getWebDistPath(): string {
  return process.env.WEB_DIST
    ? path.resolve(process.env.WEB_DIST)
    : path.resolve(process.cwd(), "../web/dist");
}

export function ensureRuntimeDirs(): void {
  const dirs = {
    sources: getSourcesDir(),
    config: getConfigDir(),
    state: path.dirname(getStateFilePath()),
  };
  fs.mkdirSync(dirs.sources, { recursive: true });
  fs.mkdirSync(dirs.config, { recursive: true });
  fs.mkdirSync(dirs.state, { recursive: true });
  log.debug("runtime directories ensured", dirs);
}
