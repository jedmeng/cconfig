import { buildModifierTypeDeclaration } from "./modifier-codegen.js";
import { loadConfigSchemaCatalog, sortByPathOrder } from "./config-schema.js";
import type { ConfigPathMeta, ConfigSchemaFile } from "./types.js";

export { buildModifierTypeDeclaration };
export { sortConfigPathMeta } from "./config-path-order.js";

export function loadConfigItemCatalog(workspaceRoot: string): ConfigPathMeta[] {
  const { items, pathOrder } = loadConfigSchemaCatalog(workspaceRoot);
  return sortByPathOrder(items, pathOrder);
}

export function loadConfigSchema(workspaceRoot: string): ConfigSchemaFile {
  return loadConfigSchemaCatalog(workspaceRoot).schema;
}

export function loadConfigPathOrder(workspaceRoot: string): string[] {
  return loadConfigSchemaCatalog(workspaceRoot).pathOrder;
}
