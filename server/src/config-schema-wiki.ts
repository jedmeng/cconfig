import {
  WIKI_DESCRIPTIONS_BY_KEY,
  WIKI_DESCRIPTIONS_BY_PATH,
} from "./config-wiki-descriptions.js";
import type { ConfigPropertySchema } from "./types.js";

const EXAMPLE_LINE = /^[a-z][a-z0-9-]*\s*:\s*.+$/i;
const MAX_LEN = 160;

export function sanitizeDescription(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  let text = raw.trim();
  if (EXAMPLE_LINE.test(text) && text.length < 80) return undefined;
  if (text.includes("-----BEGIN")) return undefined;

  const parts = text
    .split(/[；;]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const unique: string[] = [];
  for (const part of parts) {
    if (EXAMPLE_LINE.test(part)) continue;
    if (unique.some((u) => u === part || u.includes(part) || part.includes(u))) continue;
    unique.push(part);
  }
  text = unique[0] ?? text;
  text = text.replace(/！！！[^；;]*/g, "").trim();
  text = text.replace(/；+/g, "；").replace(/^；|；$/g, "");
  if (!text) return undefined;
  return text.length > MAX_LEN ? `${text.slice(0, MAX_LEN - 1)}…` : text;
}

export function resolveWikiDescription(
  configPath: string,
  key: string,
  existing?: string,
): string | undefined {
  if (WIKI_DESCRIPTIONS_BY_PATH[configPath]) return WIKI_DESCRIPTIONS_BY_PATH[configPath];
  if (WIKI_DESCRIPTIONS_BY_KEY[configPath]) return WIKI_DESCRIPTIONS_BY_KEY[configPath];
  if (WIKI_DESCRIPTIONS_BY_KEY[key]) return WIKI_DESCRIPTIONS_BY_KEY[key];
  return sanitizeDescription(existing);
}

export function applyWikiDescriptionsToTree(properties: ConfigPropertySchema[], prefix = ""): number {
  let count = 0;
  for (const prop of properties) {
    if (!prop.key) continue;
    const path = prefix ? `${prefix}.${prop.key}` : prop.key;
    const desc = resolveWikiDescription(path, prop.key, prop.description);
    if (desc) {
      prop.description = desc;
      count += 1;
    } else {
      delete prop.description;
    }
    if (prop.properties?.length) count += applyWikiDescriptionsToTree(prop.properties, path);
    if (prop.items?.properties?.length) count += applyWikiDescriptionsToTree(prop.items.properties, path);
  }
  return count;
}
