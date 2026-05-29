import YAML from "yaml";
import { ARRAY_ITEM_EXTRA_PROPS, SIBLING_KEY_ORDER } from "./config-schema-overrides.js";

export function siblingKeyOrder(parentPath: string): string[] | undefined {
  const explicit = SIBLING_KEY_ORDER[parentPath];
  if (explicit?.length) return explicit;
  const arrayItemKeys = ARRAY_ITEM_EXTRA_PROPS[parentPath];
  if (arrayItemKeys?.length) {
    return arrayItemKeys.map((p) => p.key).filter((k): k is string => k !== undefined);
  }
  return undefined;
}

export function sortSiblingKeys(parentPath: string, keys: string[]): string[] {
  const order = siblingKeyOrder(parentPath);
  if (!order?.length) return [...keys].sort((a, b) => a.localeCompare(b));
  const index = new Map(order.map((k, i) => [k, i]));
  return [...keys].sort((a, b) => {
    const ia = index.get(a);
    const ib = index.get(b);
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    return a.localeCompare(b);
  });
}

/** 按 schema 同级键顺序递归排序配置对象（用于 YAML 输出） */
export function sortConfigObjectDeep(value: unknown, parentPath = ""): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item !== null && typeof item === "object" && !Array.isArray(item)) {
        return sortConfigObjectDeep(item, parentPath);
      }
      return item;
    });
  }
  const record = value as Record<string, unknown>;
  const sortedKeys = sortSiblingKeys(parentPath, Object.keys(record));
  const out: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    const childPath = parentPath ? `${parentPath}.${key}` : key;
    out[key] = sortConfigObjectDeep(record[key], childPath);
  }
  return out;
}

export function stringifyConfigYaml(value: unknown): string {
  return YAML.stringify(sortConfigObjectDeep(value));
}

export function comparePathsByOrder(pathOrder: string[], a: string, b: string): number {
  const index = new Map(pathOrder.map((p, i) => [p, i]));
  const ia = index.get(a);
  const ib = index.get(b);
  if (ia !== undefined && ib !== undefined) return ia - ib;
  if (ia !== undefined) return -1;
  if (ib !== undefined) return 1;
  return a.localeCompare(b);
}
