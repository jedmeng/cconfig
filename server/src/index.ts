import { createApp } from "./app.js";
import { log } from "./logger.js";
import { ensureOidcDiscovery } from "./oidc-discovery.js";
import {
  ensureRuntimeDirs,
  getConfigDir,
  getDataDir,
  getWebDistPath,
} from "./runtime-config.js";
import { getConfiguredBasePath } from "./public-url.js";
import { store } from "./store.js";

const port = Number(process.env.PORT ?? 8787);

async function main(): Promise<void> {
  log.info("starting server", {
    port,
    nodeEnv: process.env.NODE_ENV ?? "development",
    basePath: getConfiguredBasePath() || "/",
    dataDir: getDataDir(),
    configDir: getConfigDir(),
    webDist: getWebDistPath(),
  });
  const app = createApp();
  if (store.oidcEnabled && store.oidc) {
    const endpoints = await ensureOidcDiscovery(store.oidc.issuer);
    log.info("OIDC discovery ready", { issuer: endpoints.issuer });
  } else {
    log.info("OIDC disabled, skipping discovery");
  }
  ensureRuntimeDirs();
  app.listen(port, () => {
    log.info("server listening", { port });
  });
}

main().catch((err) => {
  log.error("fatal startup error", err);
  process.exit(1);
});
