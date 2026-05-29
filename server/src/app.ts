import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  buildModifierTypeDeclaration,
  loadConfigItemCatalog,
  loadConfigPathOrder,
} from "./config-catalog.js";
import { loadConfigTemplateYaml } from "./config-template.js";
import { validateConfigYaml } from "./config-validator.js";
import { avatarUrlForUser } from "./avatar.js";
import {
  authRequired,
  getOidcStartUrl,
  handleOidcCallbackWithIdToken,
  handleOidcCodeCallback,
  oidcApiGate,
  requireAuthForPage,
} from "./auth.js";
import {
  getConfiguredBasePath,
  getSessionCookieOptions,
  isApiPath,
  resolveTrustProxy,
} from "./public-url.js";
import { log } from "./logger.js";
import { getWebDistPath } from "./runtime-config.js";
import { loadConfig, loadStoreFromDisk, persistStoreToDisk, store } from "./store.js";
import { compileWithSteps } from "./modifier-engine.js";
import { refreshHttpDraft, refreshSource, upsertSourceContent } from "./source-service.js";
import { getOrCompileScheme, invalidateAllCompiledCache } from "./compile-cache.js";
import { sendOutputYaml } from "./output-response.js";
import type { ConfigSource, Modifier, Scheme } from "./types.js";

function setupCors(app: express.Application): void {
  const explicit = process.env.CORS_ORIGIN;
  if (explicit) {
    const origins = explicit.split(",").map((s) => s.trim()).filter(Boolean);
    log.info("CORS enabled (explicit origins)", { origins });
    app.use(
      cors({
        origin: origins.length === 1 ? origins[0]! : origins,
        credentials: true,
      }),
    );
    return;
  }
  if (process.env.NODE_ENV !== "production") {
    log.info("CORS enabled (dev localhost)");
    app.use(
      cors({
        origin(origin, callback) {
          if (!origin) return callback(null, true);
          if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
            return callback(null, true);
          }
          log.warn("CORS rejected origin", { origin });
          callback(new Error("CORS not allowed"));
        },
        credentials: true,
      }),
    );
  } else {
    log.info("CORS disabled (production, no CORS_ORIGIN)");
  }
}

function apiRequestLogger(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const started = Date.now();
  res.on("finish", () => {
    if (!req.path.startsWith("/api")) return;
    const username = (req as express.Request & { username?: string }).username;
    const meta: Record<string, unknown> = {
      method: req.method,
      path: req.originalUrl || req.path,
      status: res.statusCode,
      ms: Date.now() - started,
    };
    if (username) meta.username = username;
    if (res.statusCode >= 500) log.error("API request", undefined, meta);
    else if (res.statusCode >= 400) log.warn("API request", meta);
    else log.info("API request", meta);
  });
  next();
}

export function createApp() {
  loadConfig();
  loadStoreFromDisk();
  const app = express();
  app.set("trust proxy", resolveTrustProxy());
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  setupCors(app);

  const routes = express.Router();
  const basePath = getConfiguredBasePath();

  const catalog = loadConfigItemCatalog(process.cwd());
  const configPathOrder = loadConfigPathOrder(process.cwd());
  const modifierTypeDeclaration = buildModifierTypeDeclaration(catalog);
  const sourceTimers = new Map<string, NodeJS.Timeout>();

  const setupAutoRefresh = (source: ConfigSource): void => {
    const prev = sourceTimers.get(source.id);
    if (prev) clearInterval(prev);
    sourceTimers.delete(source.id);
    if (source.kind !== "http" || source.updateIntervalSeconds <= 0) return;
    log.info("scheduled http source auto-refresh", {
      sourceId: source.id,
      sourceName: source.name,
      intervalSeconds: source.updateIntervalSeconds,
    });
    const timer = setInterval(async () => {
      const idx = store.sources.findIndex((s) => s.id === source.id);
      if (idx < 0) return;
      try {
        store.sources[idx] = await refreshSource(store.sources[idx]);
        persistStoreToDisk();
        invalidateAllCompiledCache();
        log.info("auto-refresh succeeded", {
          sourceId: source.id,
          sourceName: source.name,
        });
      } catch (err) {
        log.error("auto-refresh failed", err, {
          sourceId: source.id,
          sourceName: source.name,
        });
      }
    }, source.updateIntervalSeconds * 1000);
    sourceTimers.set(source.id, timer);
  };

  for (const source of store.sources) setupAutoRefresh(source);

  log.info("application initialized", {
    basePath: basePath || "/",
    catalogPaths: configPathOrder.length,
    sources: store.sources.length,
    modifiers: store.modifiers.length,
    schemes: store.schemes.length,
    trustProxy: app.get("trust proxy"),
  });

  routes.use(apiRequestLogger);
  routes.use(oidcApiGate);

  routes.get("/api/health", (_req, res) => res.json({ ok: true }));
  routes.get("/api/auth/oidc/start", (req, res) => {
    if (!store.oidcEnabled) {
      res.status(503).json({ error: "oidc disabled" });
      return;
    }
    const returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : undefined;
    res.redirect(getOidcStartUrl(req, returnTo));
  });
  routes.get("/api/auth/oidc/callback", (req, res, next) => {
    handleOidcCodeCallback(req, res).catch(next);
  });
  routes.post("/api/auth/oidc/token-login", (req, res, next) => {
    handleOidcCallbackWithIdToken(req, res).catch(next);
  });
  routes.get("/api/auth/me", authRequired, (req, res) => {
    if (!store.oidcEnabled) {
      res.json({ oidcEnabled: false });
      return;
    }
    const sid = String(req.cookies?.cc_sid ?? "");
    const session = sid ? store.sessions.get(sid) : undefined;
    const username = (req as express.Request & { username?: string }).username ?? session?.username ?? "";
    res.json({
      oidcEnabled: true,
      username,
      email: session?.email,
      avatarUrl: avatarUrlForUser(session?.email, username),
    });
  });
  routes.post("/api/auth/logout", (req, res) => {
    if (!store.oidcEnabled) {
      res.json({ ok: true });
      return;
    }
    const sid = String(req.cookies?.cc_sid ?? "");
    const session = sid ? store.sessions.get(sid) : undefined;
    if (sid) store.sessions.delete(sid);
    log.info("user logged out", { username: session?.username });
    res.clearCookie("cc_sid", getSessionCookieOptions(req));
    res.json({ ok: true });
  });

  routes.get("/api/config/schema", authRequired, (_req, res) => {
    res.json({ paths: configPathOrder, pathOrder: configPathOrder, items: catalog });
  });
  routes.get("/api/config/template", authRequired, (_req, res) => {
    try {
      res.json({ yaml: loadConfigTemplateYaml(process.cwd()) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "template unavailable";
      res.status(500).json({ error: msg });
    }
  });
  routes.post("/api/config/validate", authRequired, (req, res) => {
    const yaml = typeof req.body?.yaml === "string" ? req.body.yaml : "";
    const result = validateConfigYaml(yaml, catalog);
    if (result.ok) return res.json({ ok: true });
    log.debug("config validation failed", { errorCount: result.errors.length });
    return res.status(400).json({ ok: false, errors: result.errors });
  });
  routes.get("/api/config/modifier-types.d.ts", authRequired, (_req, res) => {
    res.type("text/plain").send(modifierTypeDeclaration);
  });

  routes.get("/api/sources", authRequired, (_req, res) => res.json(store.sources));
  routes.post("/api/sources", authRequired, async (req, res, next) => {
    try {
      const source: ConfigSource = {
        id: crypto.randomUUID(),
        updateIntervalSeconds: 0,
        ...req.body,
      };
      if (source.kind === "template" && typeof source.cachedYaml === "string") {
        const validation = validateConfigYaml(source.cachedYaml, catalog);
        if (!validation.ok) {
          return res.status(400).json({ error: "config validation failed", errors: validation.errors });
        }
      }
      const refreshed = await refreshSource(source);
      store.sources.push(refreshed);
      setupAutoRefresh(refreshed);
      persistStoreToDisk();
      invalidateAllCompiledCache();
      log.info("source created", {
        sourceId: refreshed.id,
        sourceName: refreshed.name,
        kind: refreshed.kind,
      });
      res.json(refreshed);
    } catch (e) {
      next(e);
    }
  });
  routes.put("/api/sources/:id", authRequired, async (req, res, next) => {
    try {
      const idx = store.sources.findIndex((s) => s.id === req.params.id);
      if (idx < 0) return res.status(404).json({ error: "source not found" });
      const prev = store.sources[idx];
      const payload = req.body ?? {};
      const nextSource: ConfigSource = {
        ...prev,
        name: typeof payload.name === "string" ? payload.name : prev.name,
        kind: payload.kind ?? prev.kind,
        url: (payload.kind ?? prev.kind) === "http" ? payload.url ?? prev.url : undefined,
        updateIntervalSeconds: (payload.kind ?? prev.kind) === "http"
          ? typeof payload.updateIntervalSeconds === "number"
            ? payload.updateIntervalSeconds
            : prev.updateIntervalSeconds
          : 0,
        cachedYaml:
          typeof payload.cachedYaml === "string" ? payload.cachedYaml : prev.cachedYaml,
      };
      if (nextSource.kind === "template" && typeof nextSource.cachedYaml === "string") {
        const validation = validateConfigYaml(nextSource.cachedYaml, catalog);
        if (!validation.ok) {
          return res.status(400).json({ error: "config validation failed", errors: validation.errors });
        }
      }
      const refreshed = await refreshSource(nextSource);
      store.sources[idx] = refreshed;
      setupAutoRefresh(refreshed);
      persistStoreToDisk();
      invalidateAllCompiledCache();
      log.info("source updated", {
        sourceId: refreshed.id,
        sourceName: refreshed.name,
        kind: refreshed.kind,
      });
      return res.json(refreshed);
    } catch (e) {
      next(e);
    }
  });
  routes.delete("/api/sources/:id", authRequired, (req, res) => {
    const idx = store.sources.findIndex((s) => s.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: "source not found" });
    const sourceId = store.sources[idx].id;
    store.sources.splice(idx, 1);
    const timer = sourceTimers.get(sourceId);
    if (timer) {
      clearInterval(timer);
      sourceTimers.delete(sourceId);
    }
    store.schemes = store.schemes.filter((scheme) => scheme.sourceId !== sourceId);
    persistStoreToDisk();
    invalidateAllCompiledCache();
    log.info("source deleted", { sourceId, removedSchemes: true });
    return res.json({ ok: true });
  });
  routes.post("/api/sources/:id/refresh", authRequired, async (req, res, next) => {
    try {
      const idx = store.sources.findIndex((s) => s.id === req.params.id);
      if (idx < 0) return res.status(404).json({ error: "source not found" });
      const refreshed = await refreshSource(store.sources[idx]);
      store.sources[idx] = refreshed;
      setupAutoRefresh(refreshed);
      persistStoreToDisk();
      invalidateAllCompiledCache();
      log.info("source manually refreshed", {
        sourceId: refreshed.id,
        sourceName: refreshed.name,
      });
      res.json(refreshed);
    } catch (e) {
      next(e);
    }
  });
  routes.post("/api/sources/preview-refresh", authRequired, async (req, res, next) => {
    try {
      const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
      if (!url) return res.status(400).json({ error: "url is required" });
      const refreshed = await refreshHttpDraft(url);
      return res.json(refreshed);
    } catch (e) {
      next(e);
    }
  });
  routes.put("/api/sources/:id/content", authRequired, (req, res) => {
    const idx = store.sources.findIndex((s) => s.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: "source not found" });
    const source = store.sources[idx];
    if (source.kind === "http") return res.status(400).json({ error: "http source is read only" });
    const yaml = typeof req.body?.yaml === "string" ? req.body.yaml : "";
    if (source.kind === "template") {
      const validation = validateConfigYaml(yaml, catalog);
      if (!validation.ok) {
        return res.status(400).json({ error: "config validation failed", errors: validation.errors });
      }
    }
    const updated = upsertSourceContent(source, yaml);
    store.sources[idx] = updated;
    persistStoreToDisk();
    invalidateAllCompiledCache();
    return res.json(updated);
  });

  routes.get("/api/modifiers", authRequired, (_req, res) => res.json(store.modifiers));
  routes.post("/api/modifiers", authRequired, (req, res) => {
    const modifier: Modifier = { id: crypto.randomUUID(), ...req.body };
    store.modifiers.push(modifier);
    persistStoreToDisk();
    invalidateAllCompiledCache();
    log.info("modifier created", { modifierId: modifier.id, modifierName: modifier.name });
    res.json(modifier);
  });
  routes.put("/api/modifiers/:id", authRequired, (req, res) => {
    const idx = store.modifiers.findIndex((m) => m.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: "modifier not found" });
    store.modifiers[idx] = { ...store.modifiers[idx], ...req.body, id: store.modifiers[idx].id };
    persistStoreToDisk();
    invalidateAllCompiledCache();
    log.info("modifier updated", {
      modifierId: store.modifiers[idx].id,
      modifierName: store.modifiers[idx].name,
    });
    return res.json(store.modifiers[idx]);
  });
  routes.delete("/api/modifiers/:id", authRequired, (req, res) => {
    const idx = store.modifiers.findIndex((m) => m.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: "modifier not found" });
    const targetId = store.modifiers[idx].id;
    store.modifiers.splice(idx, 1);
    store.schemes = store.schemes.map((scheme) => ({
      ...scheme,
      modifierIds: scheme.modifierIds.filter((id) => id !== targetId),
    }));
    persistStoreToDisk();
    invalidateAllCompiledCache();
    log.info("modifier deleted", { modifierId: targetId });
    return res.json({ ok: true });
  });
  type ModifierPreviewDraft = Partial<
    Pick<Modifier, "simpleEdits" | "ruleEdits" | "codeEdits" | "classCode" | "classCodeEnabled">
  >;

  const compileModifierPreview = (
    modifier: Modifier,
    sourceId: string,
    draft?: ModifierPreviewDraft,
  ) => {
    const source = store.sources.find((s) => s.id === sourceId);
    if (!source?.cachedYaml) throw new Error("source not ready");
    const effective: Modifier = {
      ...modifier,
      simpleEdits: draft?.simpleEdits ?? modifier.simpleEdits,
      ruleEdits: draft?.ruleEdits ?? modifier.ruleEdits ?? [],
      codeEdits: draft?.codeEdits ?? modifier.codeEdits ?? [],
      classCode: draft?.classCode !== undefined ? draft.classCode : modifier.classCode,
      classCodeEnabled:
        draft?.classCodeEnabled !== undefined ? draft.classCodeEnabled : modifier.classCodeEnabled,
    };
    const steps = compileWithSteps(source.cachedYaml, [effective]);
    return { steps, finalYaml: steps[steps.length - 1]?.yaml ?? source.cachedYaml };
  };

  routes.get("/api/modifiers/:id/preview", authRequired, (req, res) => {
    const modifier = store.modifiers.find((m) => m.id === req.params.id);
    if (!modifier) return res.status(404).json({ error: "modifier not found" });
    const sourceId = typeof req.query.sourceId === "string" ? req.query.sourceId : "";
    try {
      return res.json(compileModifierPreview(modifier, sourceId));
    } catch (e) {
      return res.status(400).json({ error: String(e) });
    }
  });

  routes.post("/api/modifiers/:id/preview", authRequired, (req, res) => {
    const modifier = store.modifiers.find((m) => m.id === req.params.id);
    if (!modifier) return res.status(404).json({ error: "modifier not found" });
    const sourceId =
      typeof req.query.sourceId === "string"
        ? req.query.sourceId
        : typeof req.body?.sourceId === "string"
          ? req.body.sourceId
          : "";
    const draft = req.body as ModifierPreviewDraft;
    try {
      return res.json(compileModifierPreview(modifier, sourceId, draft));
    } catch (e) {
      return res.status(400).json({ error: String(e) });
    }
  });

  routes.get("/api/schemes", authRequired, (_req, res) => res.json(store.schemes));
  routes.post("/api/schemes", authRequired, (req, res) => {
    const scheme: Scheme = { id: crypto.randomUUID(), ...req.body };
    store.schemes.push(scheme);
    persistStoreToDisk();
    invalidateAllCompiledCache();
    log.info("scheme created", { schemeId: scheme.id, schemeName: scheme.name });
    res.json(scheme);
  });
  routes.put("/api/schemes/:id", authRequired, (req, res) => {
    const idx = store.schemes.findIndex((s) => s.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: "scheme not found" });
    store.schemes[idx] = { ...store.schemes[idx], ...req.body, id: store.schemes[idx].id };
    persistStoreToDisk();
    invalidateAllCompiledCache();
    log.info("scheme updated", {
      schemeId: store.schemes[idx].id,
      schemeName: store.schemes[idx].name,
    });
    return res.json(store.schemes[idx]);
  });
  routes.delete("/api/schemes/:id", authRequired, (req, res) => {
    const idx = store.schemes.findIndex((s) => s.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: "scheme not found" });
    const removed = store.schemes[idx];
    store.schemes.splice(idx, 1);
    persistStoreToDisk();
    invalidateAllCompiledCache();
    log.info("scheme deleted", { schemeId: removed.id, schemeName: removed.name });
    return res.json({ ok: true });
  });

  const previewSchemeSteps = (sourceId: string, modifierIds: string[]) => {
    const source = store.sources.find((s) => s.id === sourceId);
    if (!source?.cachedYaml) throw new Error("source not ready");
    const modifiers = modifierIds
      .map((id) => store.modifiers.find((m) => m.id === id))
      .filter(Boolean) as Modifier[];
    return compileWithSteps(source.cachedYaml, modifiers);
  };

  routes.post("/api/schemes/preview", authRequired, (req, res) => {
    const body = req.body as { sourceId?: string; modifierIds?: string[] };
    if (!body.sourceId) return res.status(400).json({ error: "sourceId required" });
    try {
      const steps = previewSchemeSteps(body.sourceId, body.modifierIds ?? []);
      return res.json({ steps });
    } catch (e) {
      return res.status(400).json({ error: String(e) });
    }
  });

  routes.get("/api/schemes/:id/preview", authRequired, (req, res) => {
    const scheme = store.schemes.find((s) => s.id === req.params.id);
    if (!scheme) return res.status(404).json({ error: "scheme not found" });
    const source = store.sources.find((s) => s.id === scheme.sourceId);
    if (!source?.cachedYaml) return res.status(400).json({ error: "source not ready" });
    const modifiers = scheme.modifierIds
      .map((id) => store.modifiers.find((m) => m.id === id))
      .filter(Boolean) as Modifier[];
    const compiled = getOrCompileScheme(
      scheme,
      source.cachedYaml,
      modifiers,
      () => compileWithSteps(source.cachedYaml!, modifiers),
    );
    return compiled.then(({ entry, hit }) => {
      res.setHeader("X-Compile-Cache", hit ? "HIT" : "MISS");
      res.json({ steps: entry.steps });
    });
  });

  routes.get("/api/output/:schemeId.yaml", (req, res) => {
    const scheme = store.schemes.find((s) => s.id === req.params.schemeId);
    if (!scheme) return res.status(404).send("scheme not found");
    const source = store.sources.find((s) => s.id === scheme.sourceId);
    if (!source?.cachedYaml) return res.status(400).send("source unavailable");
    const modifiers = scheme.modifierIds
      .map((id) => store.modifiers.find((m) => m.id === id))
      .filter(Boolean) as Modifier[];
    return getOrCompileScheme(scheme, source.cachedYaml, modifiers, () =>
      compileWithSteps(source.cachedYaml!, modifiers),
    ).then(({ entry, hit }) => {
      res.setHeader("X-Compile-Cache", hit ? "HIT" : "MISS");
      const finalYaml = entry.steps[entry.steps.length - 1].yaml;
      sendOutputYaml(res, req, finalYaml);
    });
  });

  if (basePath) app.use(basePath, routes);
  else app.use(routes);

  const webDist = getWebDistPath();
  if (fs.existsSync(webDist)) {
    log.info("serving web static assets", { webDist, basePath: basePath || "/" });
    const staticRoot = express.static(webDist);
    const spaFallback = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (isApiPath(req.path, basePath)) return next();
      res.sendFile(path.join(webDist, "index.html"));
    };
    const guardPage = (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (isApiPath(req.path, basePath)) return next();
      return requireAuthForPage(req, res, next);
    };
    if (basePath) {
      app.use(basePath, guardPage);
      app.use(basePath, staticRoot);
      app.get(`${basePath}/*`, guardPage, spaFallback);
    } else {
      app.use(guardPage);
      app.use(staticRoot);
      app.get(/^(?!\/api\/).*/, guardPage, spaFallback);
    }
  } else {
    log.warn("web dist not found, API-only mode", { webDist });
  }

  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const msg = err instanceof Error ? err.message : "internal error";
    const statusCode =
      err instanceof Error && typeof (err as Error & { statusCode?: number }).statusCode === "number"
        ? (err as Error & { statusCode: number }).statusCode
        : 500;
    const debug =
      err instanceof Error && "debug" in err ? (err as Error & { debug?: unknown }).debug : undefined;
    log.error("unhandled request error", err, {
      method: req.method,
      path: req.originalUrl || req.path,
      statusCode,
    });
    res.status(statusCode).json({ error: msg, ...(debug ? { debug } : {}) });
  });

  return app;
}
