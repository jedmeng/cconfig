import YAML from "yaml";
import {
  validateEnumValue,
  validateValueAgainstRules,
} from "./config-schema.js";
import type { ConfigPathMeta, ConfigPropertySchema } from "./types.js";

export type ConfigValidationIssue = {
  path: string;
  message: string;
};

export type ConfigValidationResult =
  | { ok: true }
  | { ok: false; errors: ConfigValidationIssue[] };

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

function kindLabel(kind: ConfigPathMeta["kind"]): string {
  const map: Record<ConfigPathMeta["kind"], string> = {
    array: "数组",
    object: "对象",
    string: "字符串",
    number: "数字",
    boolean: "布尔值",
    null: "空值",
    unknown: "未知类型",
  };
  return map[kind];
}

function isKindCompatible(expected: ConfigPathMeta["kind"], actual: ConfigPathMeta["kind"]): boolean {
  if (expected === "unknown" || actual === "unknown") return true;
  if (expected === actual) return true;
  if (expected === "null" && actual === "object") return true;
  return false;
}

function itemShape(meta: ConfigPathMeta): ConfigPropertySchema | null {
  if (meta.items) return meta.items;
  try {
    const parsed = JSON.parse(meta.sampleRaw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const first = parsed[0];
    if (first !== null && typeof first === "object" && !Array.isArray(first)) {
      return {
        type: "object",
        key: "item",
        properties: Object.keys(first as Record<string, unknown>).map((key) => ({
          key,
          type: detectKind((first as Record<string, unknown>)[key]),
        })),
      };
    }
    return { type: detectKind(first), key: "item" };
  } catch {
    return null;
  }
}

export function validateConfigYaml(yaml: string, catalog: ConfigPathMeta[]): ConfigValidationResult {
  const errors: ConfigValidationIssue[] = [];
  const pathSet = new Set(catalog.map((x) => x.path));
  const metaByPath = new Map(catalog.map((x) => [x.path, x]));

  const isKnownPath = (path: string): boolean => {
    if (pathSet.has(path)) return true;
    for (const known of pathSet) {
      if (known.startsWith(`${path}.`)) return true;
    }
    return false;
  };

  const validateScalar = (value: unknown, path: string, meta: ConfigPathMeta) => {
    const enumErr = validateEnumValue(value, meta.enum);
    if (enumErr) errors.push({ path, message: enumErr });
    const ruleErr = validateValueAgainstRules(value, meta.rules, path);
    if (ruleErr) errors.push({ path, message: ruleErr });
  };

  const validateArray = (items: unknown[], path: string, meta: ConfigPathMeta) => {
    const shape = itemShape(meta);
    if (!shape) return;

    if (shape.type === "string") {
      items.forEach((item, index) => {
        if (typeof item !== "string") {
          errors.push({
            path: `${path}[${index}]`,
            message: `属性值格式不正确，期望字符串，实际为 ${kindLabel(detectKind(item))}`,
          });
        }
      });
      return;
    }
    if (shape.type === "number") {
      items.forEach((item, index) => {
        if (typeof item !== "number") {
          errors.push({
            path: `${path}[${index}]`,
            message: `属性值格式不正确，期望数字，实际为 ${kindLabel(detectKind(item))}`,
          });
        }
      });
      return;
    }
    if (shape.type === "boolean") {
      items.forEach((item, index) => {
        if (typeof item !== "boolean") {
          errors.push({
            path: `${path}[${index}]`,
            message: `属性值格式不正确，期望布尔值，实际为 ${kindLabel(detectKind(item))}`,
          });
        }
      });
      return;
    }
    if (shape.type !== "object" || !shape.properties?.length) return;

    const fieldMeta = new Map(
      shape.properties.map((p) => [`${path}.${p.key}`, { ...p, path: `${path}.${p.key}` }]),
    );
    const template = Object.fromEntries(shape.properties.map((p) => [p.key, p.default]));

    items.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        errors.push({ path: itemPath, message: "属性值格式不正确，期望对象" });
        return;
      }
      const record = item as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        const childPath = `${path}.${key}`;
        const shapeField = shape.properties?.find((p) => p.key === key);
        if (!shapeField && !metaByPath.has(childPath)) {
          errors.push({
            path: `${itemPath}.${key}`,
            message: `未知配置项「${key}」，请检查属性名是否拼写错误`,
          });
          continue;
        }
        const childMeta = metaByPath.get(childPath);
        if (childMeta) validateAtPath(record[key], childPath);
        else if (shapeField) validateAtPath(record[key], `${itemPath}.${key}`, shapeField.default);
      }
    });
  };

  const validateObject = (value: Record<string, unknown>, pathPrefix: string) => {
    for (const [key, child] of Object.entries(value)) {
      const path = pathPrefix ? `${pathPrefix}.${key}` : key;
      if (!isKnownPath(path)) {
        errors.push({
          path,
          message: `未知配置项「${key}」，请检查属性名是否拼写错误`,
        });
        continue;
      }
      validateAtPath(child, path);
    }
  };

  const validateAtPath = (value: unknown, path: string, shapeHint?: unknown) => {
    if (shapeHint !== undefined) {
      const expectedKind = detectKind(shapeHint);
      const actualKind = detectKind(value);
      if (!isKindCompatible(expectedKind, actualKind)) {
        errors.push({
          path,
          message: `属性值格式不正确，期望 ${kindLabel(expectedKind)}，实际为 ${kindLabel(actualKind)}`,
        });
        return;
      }
      if (expectedKind === "object" && value && typeof value === "object" && !Array.isArray(value)) {
        validateObject(value as Record<string, unknown>, path);
      }
      return;
    }

    const meta = metaByPath.get(path);
    if (!meta) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        validateObject(value as Record<string, unknown>, path);
        return;
      }
      errors.push({ path, message: "属性值格式不正确，期望对象" });
      return;
    }

    const actualKind = detectKind(value);
    if (!isKindCompatible(meta.kind, actualKind)) {
      errors.push({
        path,
        message: `属性值格式不正确，期望 ${kindLabel(meta.kind)}，实际为 ${kindLabel(actualKind)}`,
      });
      return;
    }

    if (meta.kind !== "object" && meta.kind !== "array") {
      validateScalar(value, path, meta);
    }

    if (meta.kind === "object" && value && typeof value === "object" && !Array.isArray(value)) {
      validateObject(value as Record<string, unknown>, path);
      return;
    }
    if (meta.kind === "array" && Array.isArray(value)) {
      validateArray(value, path, meta);
    }
  };

  let parsed: unknown;
  try {
    parsed = YAML.parse(yaml);
  } catch (e) {
    return {
      ok: false,
      errors: [{ path: "", message: `YAML 语法错误：${e instanceof Error ? e.message : String(e)}` }],
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, errors: [{ path: "", message: "配置根节点应为 YAML 对象" }] };
  }

  validateObject(parsed as Record<string, unknown>, "");
  return errors.length ? { ok: false, errors } : { ok: true };
}
