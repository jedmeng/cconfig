type SchemaKind = "object" | "array" | "string" | "number" | "boolean" | "null" | "unknown";

export type SchemaItem = {
  path: string;
  kind: SchemaKind;
  sample: string;
  sampleRaw?: string;
};

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

function parseSample(item: SchemaItem): unknown {
  const raw = item.sampleRaw ?? item.sample;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isArrayOfObjects(item: SchemaItem): boolean {
  if (item.kind !== "array") return false;
  const parsed = parseSample(item);
  if (!Array.isArray(parsed) || parsed.length === 0) return false;
  const first = parsed[0];
  return first !== null && typeof first === "object" && !Array.isArray(first);
}

export function pathToMethodType(path: string, kind: SchemaKind, item?: SchemaItem): string {
  if (kind === "array" && item) {
    const parsed = parseSample(item);
    if (!Array.isArray(parsed) || parsed.length === 0) return "never[]";
    if (isArrayOfObjects(item)) return `Array<${pathToArrayItemName(path)}>`;
    const elemTypes = [...new Set(parsed.map((v) => typeof v))];
    const elem = elemTypes.length === 1 ? elemTypes[0] : elemTypes.join(" | ");
    return `Array<${elem}>`;
  }
  if (kind === "object" || kind === "unknown") return pathToTypeName(path);
  if (kind === "string") return "string";
  if (kind === "number") return "number";
  if (kind === "boolean") return "boolean";
  if (kind === "null") return "null";
  return "string";
}

function isLeafPath(item: SchemaItem, items: SchemaItem[]): boolean {
  if (item.kind !== "object") return true;
  return !items.some((x) => x.path.startsWith(`${item.path}.`));
}

function buildMethodComment(item: SchemaItem): string {
  const method = pathToMethodName(item.path);
  const param = methodParamName(method);
  const typeName = pathToMethodType(item.path, item.kind, item);
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

function sortedLeafItems(items: SchemaItem[]): SchemaItem[] {
  const pathIndex = new Map(items.map((item, index) => [item.path, index]));
  return items
    .filter((item) => isLeafPath(item, items))
    .sort((a, b) => (pathIndex.get(a.path) ?? 0) - (pathIndex.get(b.path) ?? 0));
}

function reorderEditorClassBody(classBody: string, items: SchemaItem[]): string {
  const blocks = parseMethodBlocks(classBody);
  if (blocks.size === 0) return classBody.trim();

  const used = new Set<string>();
  const ordered: string[] = [];
  for (const item of sortedLeafItems(items)) {
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

export function buildDefaultEditorClassCode(items: SchemaItem[]): string {
  const methods = sortedLeafItems(items).map((item) => buildMethodComment(item)).join("\n\n");

  return `export default class extends BaseModifier {
${methods}
}
`;
}

export function extractEditorClassCode(stored: string | undefined, items: SchemaItem[]): string {
  const fallback = buildDefaultEditorClassCode(items);
  if (!stored?.trim()) return fallback;

  let code = stored.trim();
  if (code.includes("class BaseModifier")) {
    const exportMatch = code.match(
      /export\s+default\s+class\s+(?:\w+\s+)?extends\s+BaseModifier\s*\{([\s\S]*)\}\s*(?:;)?\s*(?:module\.exports[\s\S]*)?$/m,
    );
    if (exportMatch) {
      const body = reorderEditorClassBody(exportMatch[1], items);
      return `export default class extends BaseModifier {\n${body}\n}\n`;
    }
    const namedMatch = code.match(/class\s+\w+\s+extends\s+BaseModifier\s*\{([\s\S]*)\}\s*/m);
    if (namedMatch) {
      const body = reorderEditorClassBody(namedMatch[1], items);
      return `export default class extends BaseModifier {\n${body}\n}\n`;
    }
  }

  if (!code.includes("export default")) {
    return fallback;
  }
  const bodyMatch = code.match(/export\s+default\s+class\s+extends\s+BaseModifier\s*\{([\s\S]*)\}/m);
  if (bodyMatch) {
    const body = reorderEditorClassBody(bodyMatch[1], items);
    return `export default class extends BaseModifier {\n${body}\n}\n`;
  }
  return code.endsWith("\n") ? code : `${code}\n`;
}
