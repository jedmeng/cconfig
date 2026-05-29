import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { comparePathsByOrder } from "./config-key-order.js";
import type {
  ConfigPathMeta,
  ConfigPropertySchema,
  ConfigRule,
  ConfigSchemaFile,
  ConfigValueKind,
} from "./types.js";

export const CONFIG_SCHEMA_RELATIVE = "data/config-schema.yaml";

export function configSchemaPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, CONFIG_SCHEMA_RELATIVE);
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

function defaultForKind(kind: ConfigValueKind): unknown {
  switch (kind) {
    case "boolean":
      return false;
    case "number":
      return 0;
    case "string":
      return "";
    case "array":
      return [];
    case "object":
      return {};
    case "null":
      return null;
    default:
      return "";
  }
}

function propToMeta(path: string, prop: ConfigPropertySchema): ConfigPathMeta {
  const value = prop.default !== undefined ? prop.default : defaultForKind(prop.type);
  return {
    path,
    kind: prop.type,
    sample: sampleValue(value),
    sampleRaw: sampleRaw(value),
    description: prop.description,
    enum: prop.enum,
    rules: prop.rules,
    items: prop.items,
  };
}

function flattenPropertyBranch(
  prop: ConfigPropertySchema,
  configPath: string,
  items: ConfigPathMeta[],
  pathOrder: string[],
): void {
  pathOrder.push(configPath);
  items.push(propToMeta(configPath, prop));

  if (prop.properties?.length) {
    const nested = flattenConfigSchema(prop.properties, configPath);
    items.push(...nested.items);
    pathOrder.push(...nested.pathOrder);
    return;
  }

  if (prop.type === "array" && prop.items?.type === "object" && prop.items.properties?.length) {
    const nested = flattenConfigSchema(prop.items.properties, configPath);
    items.push(...nested.items);
    pathOrder.push(...nested.pathOrder);
  }
}

export function flattenConfigSchema(
  properties: ConfigPropertySchema[],
  prefix = "",
): { items: ConfigPathMeta[]; pathOrder: string[] } {
  const items: ConfigPathMeta[] = [];
  const pathOrder: string[] = [];

  for (const prop of properties) {
    if (!prop.key) continue;
    const configPath = prefix ? `${prefix}.${prop.key}` : prop.key;
    flattenPropertyBranch(prop, configPath, items, pathOrder);
  }

  return { items, pathOrder };
}

export function loadConfigSchemaFile(workspaceRoot: string): ConfigSchemaFile {
  const filePath = configSchemaPath(workspaceRoot);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing config schema file: ${filePath}`);
  }
  const parsed = YAML.parse(fs.readFileSync(filePath, "utf8")) as ConfigSchemaFile;
  if (!parsed?.properties?.length) {
    throw new Error(`Invalid config schema file: ${filePath}`);
  }
  return parsed;
}

export function loadConfigSchemaCatalog(workspaceRoot: string): {
  schema: ConfigSchemaFile;
  items: ConfigPathMeta[];
  pathOrder: string[];
} {
  const schema = loadConfigSchemaFile(workspaceRoot);
  const { items, pathOrder } = flattenConfigSchema(schema.properties);
  return { schema, items, pathOrder };
}

export function sortByPathOrder(items: ConfigPathMeta[], pathOrder: string[]): ConfigPathMeta[] {
  return [...items].sort((a, b) => comparePathsByOrder(pathOrder, a.path, b.path));
}

export function validateValueAgainstRules(
  value: unknown,
  rules: ConfigRule[] | undefined,
  path: string,
): string | null {
  if (!rules?.length) return null;
  for (const rule of rules) {
    if (rule.kind === "range" && typeof value === "number") {
      if (rule.min !== undefined && value < rule.min) {
        return `属性值 ${value} 小于最小值 ${rule.min}`;
      }
      if (rule.max !== undefined && value > rule.max) {
        return `属性值 ${value} 大于最大值 ${rule.max}`;
      }
    }
    if (rule.kind === "regex" && typeof value === "string") {
      if (!new RegExp(rule.pattern).test(value)) {
        return `属性值不符合格式要求`;
      }
    }
    if (rule.kind === "minLength" && typeof value === "string" && value.length < rule.value) {
      return `属性长度不能小于 ${rule.value}`;
    }
    if (rule.kind === "maxLength" && typeof value === "string" && value.length > rule.value) {
      return `属性长度不能大于 ${rule.value}`;
    }
  }
  return null;
}

export function validateEnumValue(
  value: unknown,
  enumValues: (string | number | boolean)[] | undefined,
): string | null {
  if (!enumValues?.length) return null;
  if (!enumValues.some((v) => Object.is(v, value) || String(v) === String(value))) {
    return `属性值必须是以下之一：${enumValues.join(" / ")}`;
  }
  return null;
}
