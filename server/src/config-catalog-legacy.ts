/**
 * Legacy catalog builder — used only by sync-config-schema to bootstrap server/data/config-schema.yaml.
 */
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { loadConfigDescriptions } from "./config-descriptions.js";
import { sortConfigPathMeta } from "./config-path-order.js";
import { parseYamlSchemaPaths, supplementCatalogFromReferenceYaml, WIKI_SCHEMA_STUBS } from "./config-yaml-supplement.js";
import type { ConfigPathMeta } from "./types.js";

function loadLegacyConfigPathOrder(workspaceRoot: string): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const templatePath = path.join(workspaceRoot, "data/config-template.yaml");
  if (fs.existsSync(templatePath)) {
    for (const item of parseYamlSchemaPaths(fs.readFileSync(templatePath, "utf8"))) {
      if (!seen.has(item.path)) {
        seen.add(item.path);
        order.push(item.path);
      }
    }
  }
  for (const stubPath of Object.keys(WIKI_SCHEMA_STUBS)) {
    if (!seen.has(stubPath)) {
      seen.add(stubPath);
      order.push(stubPath);
    }
  }
  return order;
}

function detectKind(input: unknown): ConfigPathMeta["kind"] {
  if (Array.isArray(input)) return "array";
  if (input === null) return "null";
  switch (typeof input) {
    case "object":
      return "object";
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    default:
      return "unknown";
  }
}

function sampleRaw(input: unknown): string {
  if (input === undefined) return "undefined";
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

function sampleValue(input: unknown): string {
  const text = sampleRaw(input);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function flattenMeta(
  input: unknown,
  prefix = "",
  acc = new Map<string, ConfigPathMeta>(),
): Map<string, ConfigPathMeta> {
  if (Array.isArray(input)) {
    if (prefix) {
      acc.set(prefix, { path: prefix, kind: "array", sample: sampleValue(input), sampleRaw: sampleRaw(input) });
    }
    return acc;
  }
  if (input && typeof input === "object") {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      const next = prefix ? `${prefix}.${k}` : k;
      if (!acc.has(next)) {
        acc.set(next, { path: next, kind: detectKind(v), sample: sampleValue(v), sampleRaw: sampleRaw(v) });
      }
      flattenMeta(v, next, acc);
    }
  }
  return acc;
}

export function loadLegacyConfigItemCatalog(workspaceRoot: string): ConfigPathMeta[] {
  const templatePath = path.join(workspaceRoot, "data/config-template.yaml");
  const all = new Map<string, ConfigPathMeta>();
  const descriptions = loadConfigDescriptions(workspaceRoot);
  if (fs.existsSync(templatePath)) {
    const parsed = YAML.parse(fs.readFileSync(templatePath, "utf8"));
    flattenMeta(parsed).forEach((v, k) => all.set(k, v));
  }
  supplementCatalogFromReferenceYaml(all);
  for (const item of all.values()) {
    const desc = descriptions.get(item.path);
    if (desc) item.description = desc;
  }
  const pathOrder = loadLegacyConfigPathOrder(workspaceRoot);
  return sortConfigPathMeta(Array.from(all.values()), pathOrder);
}
