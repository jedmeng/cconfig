import crypto from "node:crypto";
import { log } from "./logger.js";
import type { Modifier, PreviewStep, Scheme } from "./types.js";

interface CacheEntry {
  version: string;
  steps: PreviewStep[];
  cachedAt: string;
}

const schemeCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry>>();

function buildVersion(sourceYaml: string, modifiers: Modifier[]): string {
  const payload = JSON.stringify({
    sourceYaml,
    modifiers: modifiers.map((m) => ({
      id: m.id,
      simpleEdits: m.simpleEdits,
      ruleEdits: m.ruleEdits,
      codeEdits: m.codeEdits,
      classCode: m.classCode,
    })),
  });
  return crypto.createHash("sha1").update(payload).digest("hex");
}

export async function getOrCompileScheme(
  scheme: Scheme,
  sourceYaml: string,
  modifiers: Modifier[],
  compiler: () => PreviewStep[],
): Promise<{ entry: CacheEntry; hit: boolean }> {
  const version = buildVersion(sourceYaml, modifiers);
  const cached = schemeCache.get(scheme.id);
  if (cached && cached.version === version) {
    log.debug("compile cache hit", { schemeId: scheme.id, version });
    return { entry: cached, hit: true };
  }

  const lockKey = `${scheme.id}:${version}`;
  const pending = inflight.get(lockKey);
  if (pending) {
    log.debug("compile cache awaiting inflight", { schemeId: scheme.id, version });
    return { entry: await pending, hit: true };
  }

  const task = Promise.resolve().then(() => {
    const steps = compiler();
    const entry: CacheEntry = {
      version,
      steps,
      cachedAt: new Date().toISOString(),
    };
    schemeCache.set(scheme.id, entry);
    return entry;
  });

  inflight.set(lockKey, task);
  log.debug("compile cache miss, compiling", {
    schemeId: scheme.id,
    schemeName: scheme.name,
    modifierCount: modifiers.length,
    version,
  });
  try {
    return { entry: await task, hit: false };
  } finally {
    inflight.delete(lockKey);
  }
}

export function invalidateAllCompiledCache(): void {
  const size = schemeCache.size;
  if (size > 0 || inflight.size > 0) {
    log.debug("compile cache invalidated", { entries: size, inflight: inflight.size });
  }
  schemeCache.clear();
  inflight.clear();
}
