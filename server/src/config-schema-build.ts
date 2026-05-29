import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { loadLegacyConfigItemCatalog } from "./config-catalog-legacy.js";
import { configSchemaPath } from "./config-schema.js";
import {
  ARRAY_ITEM_EXTRA_PROPS,
  KNOWN_ENUMS,
  rulesForPath,
  sortSiblingProperties,
} from "./config-schema-overrides.js";
import { applyWikiDescriptionsToTree } from "./config-schema-wiki.js";
import type { ConfigPathMeta, ConfigPropertySchema, ConfigSchemaFile, ConfigValueKind } from "./types.js";

function parseDefault(sampleRaw: string): unknown {
  try {
    return JSON.parse(sampleRaw);
  } catch {
    return undefined;
  }
}

function inferEnumFromDescription(description?: string): (string | number | boolean)[] | undefined {
  if (!description) return undefined;
  const slashMatch = description.match(/(?:：|:)\s*([a-z][a-z0-9_-]+(?:\s*\/\s*[a-z][a-z0-9_-]+)+)/i);
  if (slashMatch) {
    return slashMatch[1]!.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
  }
  return undefined;
}

function enumForPath(configPath: string, description?: string): (string | number | boolean)[] | undefined {
  return KNOWN_ENUMS[configPath] ?? inferEnumFromDescription(description);
}

function metaToProperty(meta: ConfigPathMeta, flatItems: ConfigPathMeta[]): ConfigPropertySchema {
  const hasChildren = flatItems.some((m) => m.path.startsWith(`${meta.path}.`));
  const resolvedType =
    (meta.kind === "null" || meta.kind === "unknown") && hasChildren ? "object" : meta.kind;
  const prop: ConfigPropertySchema = {
    key: meta.path.split(".").pop()!,
    type: resolvedType,
    description: meta.description,
    default: parseDefault(meta.sampleRaw),
  };
  const enumValues = enumForPath(meta.path, meta.description);
  if (enumValues?.length) prop.enum = enumValues;
  const rules = rulesForPath(meta.path);
  if (rules?.length) prop.rules = rules;
  if (resolvedType === "array") {
    prop.items = inferArrayItems(meta, flatItems);
  }
  if (resolvedType === "object") prop.properties = [];
  return prop;
}

function detectKind(input: unknown): ConfigValueKind {
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

function inferArrayItems(meta: ConfigPathMeta, flatItems: ConfigPathMeta[]): ConfigPropertySchema | undefined {
  const prefix = `${meta.path}.`;
  const childMetas = flatItems.filter((m) => m.path.startsWith(prefix));
  if (childMetas.length) {
    const topChildren = new Map<string, ConfigPathMeta>();
    for (const child of childMetas) {
      const rest = child.path.slice(prefix.length);
      const topKey = rest.split(".")[0]!;
      if (!topChildren.has(topKey)) topChildren.set(topKey, child);
    }
    return {
      type: "object",
      properties: [...topChildren.entries()].map(([key, childMeta]) => {
        const prop = metaToProperty({ ...childMeta, path: `${meta.path}.${key}` }, flatItems);
        prop.key = key;
        if (childMeta.kind === "object") prop.properties = [];
        return prop;
      }),
    };
  }

  const parsed = parseDefault(meta.sampleRaw);
  if (!Array.isArray(parsed) || parsed.length === 0) return { type: "string" };
  const objectElem = parsed.find((v) => v !== null && typeof v === "object" && !Array.isArray(v));
  if (objectElem) {
    return {
      type: "object",
      properties: Object.keys(objectElem as Record<string, unknown>).map((key) => ({
        key,
        type: detectKind((objectElem as Record<string, unknown>)[key]),
        default: (objectElem as Record<string, unknown>)[key],
      })),
    };
  }
  const first = parsed[0];
  if (first === null || typeof first !== "object" || Array.isArray(first)) {
    return { type: typeof first === "number" ? "number" : typeof first === "boolean" ? "boolean" : "string" };
  }
  return { type: "string" };
}

function findChildList(parent: ConfigPropertySchema): ConfigPropertySchema[] {
  if (parent.type === "array") {
    if (!parent.items) parent.items = { type: "object", properties: [] };
    const items = parent.items;
    if (items.type !== "object") return [];
    if (!items.properties) items.properties = [];
    return items.properties;
  }
  if (!parent.properties) parent.properties = [];
  return parent.properties;
}

function findOrCreateNode(
  list: ConfigPropertySchema[],
  key: string,
  type: ConfigValueKind,
): ConfigPropertySchema {
  let node = list.find((p) => p.key === key);
  if (!node) {
    node = { key, type, properties: type === "object" ? [] : undefined };
    if (type === "array") node.items = { type: "object", properties: [] };
    list.push(node);
  }
  return node;
}

function buildSchemaTree(flat: ConfigPathMeta[], pathOrder: string[]): ConfigPropertySchema[] {
  const byPath = new Map(flat.map((m) => [m.path, m]));
  const roots: ConfigPropertySchema[] = [];

  for (const configPath of pathOrder) {
    const meta = byPath.get(configPath);
    if (!meta) continue;

    const segments = configPath.split(".");
    let list = roots;

    for (let i = 0; i < segments.length; i += 1) {
      const key = segments[i]!;
      const isLeaf = i === segments.length - 1;
      const currentPath = segments.slice(0, i + 1).join(".");
      const currentMeta = byPath.get(currentPath);

      if (isLeaf) {
        const node = findOrCreateNode(list, key, meta.kind);
        const built = metaToProperty(meta, flat);
        node.type = built.type;
        node.description = built.description;
        node.default = built.default;
        node.enum = built.enum;
        node.rules = built.rules;
        if (built.items) node.items = built.items;
        if (built.type === "object" && !node.properties) node.properties = [];
        continue;
      }

      const hasChildPaths = [...byPath.keys()].some((p) => p.startsWith(`${currentPath}.`));
      const rawKind = currentMeta?.kind ?? "object";
      const nodeType =
        (rawKind === "null" || rawKind === "unknown") && hasChildPaths
          ? "object"
          : rawKind === "null" || rawKind === "unknown"
            ? "object"
            : rawKind;
      const node = findOrCreateNode(list, key, nodeType);
      list = findChildList(node);
    }
  }

  return roots;
}

function mergeArrayItemExtras(properties: ConfigPropertySchema[]): void {
  for (const node of properties) {
    if (!node.key) continue;
    const extras = ARRAY_ITEM_EXTRA_PROPS[node.key];
    if (node.type === "array" && extras?.length) {
      if (!node.items || node.items.type !== "object") {
        node.items = { type: "object", properties: [] };
      }
      const items = node.items;
      if (!items.properties) items.properties = [];
      for (const extra of extras) {
        const idx = items.properties.findIndex((p) => p.key === extra.key);
        if (idx >= 0) items.properties[idx] = { ...items.properties[idx], ...extra };
        else items.properties.push(extra);
      }
    }
    if (node.properties?.length) mergeArrayItemExtras(node.properties);
    if (node.items?.properties?.length) mergeArrayItemExtras(node.items.properties);
  }
}

function sortPropertyTree(properties: ConfigPropertySchema[], parentPath = ""): void {
  const sorted = sortSiblingProperties(parentPath, properties);
  properties.splice(0, properties.length, ...sorted);
  for (const prop of properties) {
    if (!prop.key) continue;
    const path = parentPath ? `${parentPath}.${prop.key}` : prop.key;
    if (prop.properties?.length) sortPropertyTree(prop.properties, path);
    if (prop.items?.properties?.length) sortPropertyTree(prop.items.properties, path);
  }
}

function applyOverridesToTree(properties: ConfigPropertySchema[], parentPath = ""): void {
  for (const prop of properties) {
    if (!prop.key) continue;
    const path = parentPath ? `${parentPath}.${prop.key}` : prop.key;
    const enumValues = enumForPath(path, prop.description);
    if (enumValues?.length) prop.enum = enumValues;
    const rules = rulesForPath(path);
    if (rules?.length) prop.rules = rules;
    if (prop.type === "object" && !prop.properties) prop.properties = [];
    if (prop.properties?.length) applyOverridesToTree(prop.properties, path);
    if (prop.items?.properties?.length) applyOverridesToTree(prop.items.properties, path);
  }
}

function stripEmptyProperties(nodes: ConfigPropertySchema[]): ConfigPropertySchema[] {
  return nodes.map((node) => {
    const next = { ...node };
    if (next.properties?.length) {
      next.properties = stripEmptyProperties(next.properties);
      if (!next.properties.length) delete next.properties;
    }
    if (next.items?.properties?.length) {
      next.items = { ...next.items, properties: stripEmptyProperties(next.items.properties!) };
    }
    if (next.default === undefined) delete next.default;
    if (!next.description) delete next.description;
    if (!next.enum?.length) delete next.enum;
    if (!next.rules?.length) delete next.rules;
    return next;
  });
}

/** 从参考 YAML + Wiki 元数据构建完整 schema 树 */
export function buildConfigSchemaProperties(workspaceRoot: string): ConfigPropertySchema[] {
  const flat = loadLegacyConfigItemCatalog(workspaceRoot);
  const pathOrder = flat.map((x) => x.path);
  let properties = stripEmptyProperties(buildSchemaTree(flat, pathOrder));
  mergeArrayItemExtras(properties);
  applyOverridesToTree(properties);
  sortPropertyTree(properties);
  applyWikiDescriptionsToTree(properties);
  return properties;
}

export function writeConfigSchemaFile(workspaceRoot: string): { flatCount: number; topLevel: number } {
  const properties = buildConfigSchemaProperties(workspaceRoot);
  const flat = loadLegacyConfigItemCatalog(workspaceRoot);
  const out: ConfigSchemaFile = { version: 1, properties };
  const outPath = configSchemaPath(workspaceRoot);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, YAML.stringify(out, { lineWidth: 0 }), "utf8");
  return { flatCount: flat.length, topLevel: properties.length };
}
