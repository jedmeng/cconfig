import { sortConfigPathMeta } from "./config-catalog.js";
import type { ConfigPathMeta, ConfigPropertySchema } from "./types.js";

export function segmentToPascal(segment: string): string {
  return segment
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** YAML / wiki key → camelCase property (code editor only). */
export function yamlKeyToCamel(key: string): string {
  if (/^[a-z][a-zA-Z0-9]*$/.test(key) && !/[-_]/.test(key)) return key;
  const parts = key.split(/[_-]+/).filter(Boolean);
  if (parts.length === 0) return key;
  return (
    parts[0].toLowerCase() +
    parts
      .slice(1)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join("")
  );
}

/** Deep-clone config object with camelCase keys for class modifier `config` / `transform`. */
export function toEditorConfig<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => toEditorConfig(item)) as T;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[yamlKeyToCamel(key)] = toEditorConfig(child);
  }
  return out as T;
}

function findYamlKey(parent: Record<string, unknown>, camelKey: string): string | undefined {
  for (const key of Object.keys(parent)) {
    if (yamlKeyToCamel(key) === camelKey) return key;
  }
  return undefined;
}

/** Merge camelCase editor object back onto YAML-shaped target. */
export function mergeEditorConfigToYaml(yamlRoot: Record<string, unknown>, editorRoot: Record<string, unknown>): void {
  for (const [camelKey, editorVal] of Object.entries(editorRoot)) {
    const yamlKey = findYamlKey(yamlRoot, camelKey);
    if (!yamlKey) continue;
    const current = yamlRoot[yamlKey];
    if (
      editorVal !== null &&
      typeof editorVal === "object" &&
      !Array.isArray(editorVal) &&
      current !== null &&
      typeof current === "object" &&
      !Array.isArray(current)
    ) {
      mergeEditorConfigToYaml(current as Record<string, unknown>, editorVal as Record<string, unknown>);
    } else {
      yamlRoot[yamlKey] = editorVal;
    }
  }
}

export function pathToMethodName(path: string): string {
  const parts = path
    .split(".")
    .map((segment) => segment.replace(/[^a-zA-Z0-9_$-]/g, "_"))
    .filter(Boolean)
    .map(segmentToPascal);
  return `get${parts.join("") || "Root"}`;
}

export function pathToTypeName(path: string): string {
  return `${pathToMethodName(path).slice(3)}Value`;
}

export function pathToArrayItemName(path: string): string {
  return `${pathToMethodName(path).slice(3)}Item`;
}

export function methodParamName(methodName: string): string {
  const raw = methodName.slice(3);
  return `raw${raw.charAt(0)}${raw.slice(1)}`;
}

function editorPropName(key: string): string {
  return yamlKeyToCamel(key);
}

function schemaKindToTs(kind: ConfigPropertySchema["type"]): string {
  switch (kind) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "object":
      return "Record<string, unknown>";
    case "array":
      return "unknown[]";
    case "unknown":
      return "string | number | boolean | null";
    default:
      return "string";
  }
}

function isArrayOfObjects(item: ConfigPathMeta): boolean {
  return item.kind === "array" && item.items?.type === "object";
}

function isLeafPath(item: ConfigPathMeta, items: ConfigPathMeta[]): boolean {
  if (item.kind !== "object") return true;
  return !items.some((x) => x.path.startsWith(`${item.path}.`));
}

/** 仅使用 catalog 中 parentPath 的直接子 path（来自 schema type 树，不看 default） */
function directChildMetas(parentPath: string, items: ConfigPathMeta[]): ConfigPathMeta[] {
  const prefix = `${parentPath}.`;
  const depth = parentPath.split(".").length;
  return items.filter((item) => {
    if (!item.path.startsWith(prefix)) return false;
    return item.path.split(".").length === depth + 1;
  });
}

function metaFromProperty(path: string, prop: ConfigPropertySchema): ConfigPathMeta {
  return {
    path,
    kind: prop.type,
    sample: "",
    sampleRaw: "",
    description: prop.description,
    enum: prop.enum,
    rules: prop.rules,
    items: prop.items,
  };
}

/** 从 schema items.properties 构建子字段（数组元素对象无 flatten 子 path 时的兜底） */
function childMetasFromItemProperties(
  parentPath: string,
  properties: ConfigPropertySchema[] | undefined,
  itemsByPath: Map<string, ConfigPathMeta>,
): ConfigPathMeta[] {
  if (!properties?.length) return [];
  return properties.map((prop) => {
    const path = `${parentPath}.${prop.key}`;
    return itemsByPath.get(path) ?? metaFromProperty(path, prop);
  });
}

export function pathToMethodType(
  path: string,
  kind: ConfigPathMeta["kind"],
  item?: ConfigPathMeta,
  allItems?: ConfigPathMeta[],
): string {
  if (kind === "array" && item) {
    if (item.items?.type === "object") return `Array<${pathToArrayItemName(path)}>`;
    if (item.items?.type) return `Array<${schemaKindToTs(item.items.type)}>`;
    return "unknown[]";
  }
  if (kind === "object") {
    if (allItems && directChildMetas(path, allItems).length === 0) {
      return "Record<string, unknown>";
    }
    return pathToTypeName(path);
  }
  if (kind === "unknown") return pathToTypeName(path);
  return schemaKindToTs(kind);
}

function buildSchemaObjectInterface(
  parentPath: string,
  interfaceName: string,
  items: ConfigPathMeta[],
  itemProperties?: ConfigPropertySchema[],
): string {
  const itemsByPath = new Map(items.map((i) => [i.path, i]));
  let children = directChildMetas(parentPath, items);
  if (!children.length && itemProperties?.length) {
    children = childMetasFromItemProperties(parentPath, itemProperties, itemsByPath);
  }
  if (!children.length) {
    return `interface ${interfaceName} {\n  [key: string]: string | number | boolean | null;\n}`;
  }
  const lines = children.map((child) => {
    const key = child.path.slice(parentPath.length + 1);
    const optional = child.kind === "null" ? "" : "?";
    return `  ${editorPropName(key)}${optional}: ${pathToMethodType(child.path, child.kind, child, items)};`;
  });
  return `interface ${interfaceName} {\n${lines.join("\n")}\n}`;
}

function inferNamedTypeDefinition(item: ConfigPathMeta, items: ConfigPathMeta[]): string | null {
  if (item.kind === "array" && item.items?.type === "object") {
    return buildSchemaObjectInterface(
      item.path,
      pathToArrayItemName(item.path),
      items,
      item.items.properties,
    );
  }
  if (item.kind === "object" && directChildMetas(item.path, items).length > 0) {
    return buildSchemaObjectInterface(item.path, pathToTypeName(item.path), items);
  }
  if (item.kind === "unknown") {
    return `interface ${pathToTypeName(item.path)} {\n  [key: string]: string | number | boolean | null;\n}`;
  }
  return null;
}

function buildConfigRootInterface(items: ConfigPathMeta[]): string {
  const topLevel = items.filter((item) => !item.path.includes("."));
  const lines = topLevel.map((item) => {
    const optional = item.kind === "null" ? "" : "?";
    return `  ${editorPropName(item.path)}${optional}: ${pathToMethodType(item.path, item.kind, item, items)};`;
  });
  return `interface ConfigRoot {\n${lines.join("\n")}\n}`;
}

function needsNamedDeclaration(item: ConfigPathMeta, items: ConfigPathMeta[]): boolean {
  if (isArrayOfObjects(item)) return true;
  if (item.kind === "object" && directChildMetas(item.path, items).length > 0) return true;
  return item.kind === "unknown";
}

export function buildModifierTypeDeclaration(items: ConfigPathMeta[]): string {
  const namedDeclarations = items
    .filter((item) => needsNamedDeclaration(item, items))
    .map((item) => inferNamedTypeDefinition(item, items))
    .filter((decl): decl is string => Boolean(decl));

  return [
    namedDeclarations.join("\n\n"),
    "",
    buildConfigRootInterface(items),
    "",
    "declare class BaseModifier {",
    "  transform(input: ConfigRoot): ConfigRoot;",
    "}",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

function toSingleLineType(typeName: string): string {
  return typeName.replace(/\s+/g, " ").trim();
}

/** Comment lines leaked from multiline TS types in `// ...` stubs (e.g. tunnels). */
export function repairLeakedCommentLines(code: string): string {
  const lines = code.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("//") && /^\s*[A-Za-z_$][\w$]*\s*:/.test(line)) {
      const prev = out[out.length - 1]?.trim() ?? "";
      const prevIsOpenComment =
        prev.startsWith("//") &&
        (prev.includes("| {") || prev.endsWith("{") || (prev.includes("(") && !prev.includes("}")));
      if (prevIsOpenComment) {
        out.push(line.replace(/^(\s*)/, "$1// "));
        continue;
      }
    }
    out.push(line);
  }
  return out.join("\n");
}

/** Strip TS annotations from active method lines before vm execution. */
export function stripTypeScriptForRuntime(code: string): string {
  return code
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//")) return line;
      if (!/^(get[A-Z]\w*|transform)\s*\(/.test(trimmed)) return line;
      let next = line.replace(/\)\s*:\s*[^{;]+(?=\s*\{)/, ")");
      for (let i = 0; i < 6; i++) {
        next = next.replace(/(\(|,)\s*([a-zA-Z_$][\w$]*)\s*:\s*(?:ConfigRoot|boolean|string|number|null|undefined|Array<[^>]*>|\w+)(?:\[\])?(?=[,)])/g, "$1$2");
      }
      return next;
    })
    .join("\n");
}

function buildMethodComment(item: ConfigPathMeta): string {
  const method = pathToMethodName(item.path);
  const param = methodParamName(method);
  const typeName = toSingleLineType(pathToMethodType(item.path, item.kind, item));
  return [
    `  // ${method}(${param}: ${typeName}, config: ConfigRoot): ${typeName} {`,
    `  //   return ${param};`,
    `  // }`,
  ].join("\n");
}

function parseMethodBlocks(classBody: string): Map<string, string> {
  const map = new Map<string, string>();
  const trimmed = classBody.trim();
  if (!trimmed) return map;

  for (const chunk of trimmed.split(/\n(?=  (?:\/\/ )?get[A-Za-z0-9]+\()/)) {
    const match = chunk.match(/^\s*(?:\/\/ )?(get[A-Za-z0-9]+)\(/m);
    if (!match) continue;
    const block = chunk.trimEnd();
    if (block) map.set(match[1], block);
  }
  return map;
}

function reorderEditorClassBody(
  classBody: string,
  items: ConfigPathMeta[],
  pathOrder?: string[],
): string {
  const blocks = parseMethodBlocks(classBody);
  if (blocks.size === 0) return classBody.trim();

  const order = pathOrder ?? items.map((item) => item.path);
  const leafItems = sortConfigPathMeta(
    items.filter((item) => isLeafPath(item, items)),
    order,
  );
  const used = new Set<string>();
  const ordered: string[] = [];

  for (const item of leafItems) {
    const name = pathToMethodName(item.path);
    if (blocks.has(name)) {
      ordered.push(blocks.get(name)!);
      used.add(name);
    } else {
      ordered.push(buildMethodComment(item));
    }
  }
  for (const [name, block] of blocks) {
    if (!used.has(name)) ordered.push(block);
  }

  return ordered.join("\n\n");
}

export function buildDefaultEditorClassCode(items: ConfigPathMeta[], pathOrder?: string[]): string {
  const order = pathOrder ?? items.map((item) => item.path);
  const leafItems = sortConfigPathMeta(
    items.filter((item) => isLeafPath(item, items)),
    order,
  );
  const methods = leafItems.map((item) => buildMethodComment(item)).join("\n\n");

  return `export default class extends BaseModifier {
${methods}
}
`;
}

export function extractEditorClassCode(stored: string | undefined, items: ConfigPathMeta[]): string {
  const pathOrder = items.map((item) => item.path);
  const fallback = buildDefaultEditorClassCode(items, pathOrder);
  if (!stored?.trim()) return fallback;

  let code = stored.trim();
  if (code.includes("class BaseModifier")) {
    const exportMatch = code.match(
      /export\s+default\s+class\s+(?:\w+\s+)?extends\s+BaseModifier\s*\{([\s\S]*)\}\s*(?:;)?\s*(?:module\.exports[\s\S]*)?$/m,
    );
    if (exportMatch) {
      const body = reorderEditorClassBody(exportMatch[1], items, pathOrder);
      return `export default class extends BaseModifier {\n${body}\n}\n`;
    }
    const namedMatch = code.match(/class\s+\w+\s+extends\s+BaseModifier\s*\{([\s\S]*)\}\s*/m);
    if (namedMatch) {
      const body = reorderEditorClassBody(namedMatch[1], items, pathOrder);
      return `export default class extends BaseModifier {\n${body}\n}\n`;
    }
  }

  if (!code.includes("export default")) {
    return fallback;
  }
  const bodyMatch = code.match(/export\s+default\s+class\s+extends\s+BaseModifier\s*\{([\s\S]*)\}/m);
  if (bodyMatch) {
    const body = reorderEditorClassBody(bodyMatch[1], items, pathOrder);
    return `export default class extends BaseModifier {\n${body}\n}\n`;
  }
  return code.endsWith("\n") ? code : `${code}\n`;
}

export function prepareClassCodeForRuntime(editorCode: string): string {
  const trimmed = editorCode.trim();
  const repaired = repairLeakedCommentLines(trimmed);
  const withoutTypes = stripTypeScriptForRuntime(repaired);
  return withoutTypes.replace(
    /export\s+default\s+class\s+(\w+\s+)?extends\s+BaseModifier/g,
    "module.exports.default = class $1extends BaseModifier",
  );
}

export const RUNTIME_CLASS_PRELUDE = `class BaseModifier {
  transform(_input) {
    return _input;
  }
}
`;
