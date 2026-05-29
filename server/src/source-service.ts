import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { log } from "./logger.js";
import { getSourcesDir } from "./runtime-config.js";
import type { ConfigSource } from "./types.js";

const CLASH_META_UA = "ClashX Meta/v1.4.35";

function resolveSourceFilePath(source: ConfigSource): string {
  if (source.filePath) return path.resolve(source.filePath);
  const randomName = crypto.randomBytes(10).toString("hex");
  return path.join(getSourcesDir(), `${randomName}.yaml`);
}

function writeSourceFile(source: ConfigSource, yaml: string): ConfigSource {
  const filePath = resolveSourceFilePath(source);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, yaml, "utf8");
  log.debug("source file written", {
    sourceId: source.id,
    sourceName: source.name,
    filePath,
    bytes: Buffer.byteLength(yaml, "utf8"),
  });
  return { ...source, filePath, cachedYaml: yaml };
}

function maybeDecodeBase64Payload(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return raw;

  // Supports "data:*;base64,xxxx" payloads directly.
  const dataUrlMatch = trimmed.match(/^data:[^,]*;base64,(.+)$/i);
  if (dataUrlMatch) {
    try {
      return Buffer.from(dataUrlMatch[1], "base64").toString("utf8");
    } catch {
      return raw;
    }
  }

  // Heuristic for plain base64 content.
  const normalized = trimmed.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(normalized) || normalized.length % 4 !== 0) return raw;
  try {
    const decoded = Buffer.from(normalized, "base64").toString("utf8");
    if (!decoded.trim()) return raw;
    const recoded = Buffer.from(decoded, "utf8").toString("base64").replace(/=+$/, "");
    const normalizedNoPad = normalized.replace(/=+$/, "");
    if (recoded !== normalizedNoPad) return raw;
    // Avoid accidentally decoding plain text; require likely YAML-like structure.
    if (!decoded.includes(":") && !decoded.includes("\n")) return raw;
    return decoded;
  } catch {
    return raw;
  }
}

export async function refreshSource(source: ConfigSource): Promise<ConfigSource> {
  if (source.kind !== "http") {
    if (source.cachedYaml != null) {
      log.debug("refreshing non-http source from cache", {
        sourceId: source.id,
        kind: source.kind,
      });
      return writeSourceFile({ ...source, lastFetchedAt: new Date().toISOString() }, source.cachedYaml);
    }
    const filePath = resolveSourceFilePath(source);
    const raw = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
    log.debug("refreshing non-http source from file", {
      sourceId: source.id,
      kind: source.kind,
      filePath,
      bytes: Buffer.byteLength(raw, "utf8"),
    });
    return { ...source, filePath, cachedYaml: raw, lastFetchedAt: new Date().toISOString() };
  }

  log.info("fetching http source", { sourceId: source.id, sourceName: source.name, url: source.url });
  const headers: Record<string, string> = {};
  headers["User-Agent"] = CLASH_META_UA;
  if (source.etag) headers["If-None-Match"] = source.etag;
  if (source.lastModified) headers["If-Modified-Since"] = source.lastModified;
  const resp = await fetch(source.url!, { headers });
  if (resp.status === 304 && source.cachedYaml) {
    log.info("http source not modified", { sourceId: source.id, status: 304 });
    return source;
  }
  if (!resp.ok) {
    log.error("http source fetch failed", undefined, {
      sourceId: source.id,
      url: source.url,
      status: resp.status,
    });
    throw new Error(`fetch source failed: ${resp.status}`);
  }
  const fetchedText = await resp.text();
  const normalizedText = maybeDecodeBase64Payload(fetchedText);
  const next = {
    ...source,
    cachedYaml: normalizedText,
    etag: resp.headers.get("etag") ?? source.etag,
    lastModified: resp.headers.get("last-modified") ?? source.lastModified,
    lastFetchedAt: new Date().toISOString(),
  };
  log.info("http source fetched", {
    sourceId: source.id,
    status: resp.status,
    bytes: Buffer.byteLength(normalizedText, "utf8"),
  });
  return writeSourceFile(next, next.cachedYaml);
}

export function upsertSourceContent(source: ConfigSource, yaml: string): ConfigSource {
  log.info("source content updated", {
    sourceId: source.id,
    sourceName: source.name,
    kind: source.kind,
    bytes: Buffer.byteLength(yaml, "utf8"),
  });
  return writeSourceFile({ ...source, cachedYaml: yaml, lastFetchedAt: new Date().toISOString() }, yaml);
}

export async function refreshHttpDraft(url: string): Promise<{ yaml: string; lastFetchedAt: string }> {
  log.info("preview-fetching http source", { url });
  const resp = await fetch(url, {
    headers: {
      "User-Agent": CLASH_META_UA,
    },
  });
  if (!resp.ok) {
    log.error("preview http fetch failed", undefined, { url, status: resp.status });
    throw new Error(`fetch source failed: ${resp.status}`);
  }
  const fetchedText = await resp.text();
  const yaml = maybeDecodeBase64Payload(fetchedText);
  log.info("preview http fetch succeeded", { url, status: resp.status, bytes: Buffer.byteLength(yaml, "utf8") });
  return {
    yaml,
    lastFetchedAt: new Date().toISOString(),
  };
}
