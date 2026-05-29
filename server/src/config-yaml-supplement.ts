import YAML from "yaml";
import type { ConfigPathMeta } from "./types.js";

/** Wiki-documented paths with default samples when absent from parsed YAML. */
export const WIKI_SCHEMA_STUBS: Record<string, { kind: ConfigPathMeta["kind"]; value: unknown }> = {
  port: { kind: "number", value: 7890 },
  "socks-port": { kind: "number", value: 7891 },
  "redir-port": { kind: "number", value: 7892 },
  "tproxy-port": { kind: "number", value: 7893 },
  "mixed-port": { kind: "number", value: 7890 },
  "allow-lan": { kind: "boolean", value: false },
  "bind-address": { kind: "string", value: "*" },
  secret: { kind: "string", value: "" },
  "tcp-concurrent": { kind: "boolean", value: false },
  "geodata-mode": { kind: "boolean", value: false },
  "geo-auto-update": { kind: "boolean", value: false },
  "geo-update-interval": { kind: "number", value: 24 },
  "unified-delay": { kind: "boolean", value: false },
  "global-client-fingerprint": { kind: "string", value: "chrome" },
  "interface-name": { kind: "string", value: "" },
  "routing-mark": { kind: "number", value: 0 },
  ntp: {
    kind: "object",
    value: {
      enable: true,
      "write-to-system": true,
      server: "time.apple.com",
      port: 123,
      interval: 30,
    },
  },
  "geosite-matcher": { kind: "string", value: "succinct" },
};

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

function isValidConfigPath(configPath: string): boolean {
  return configPath.split(".").every((seg) => /^[A-Za-z][A-Za-z0-9_-]*$/.test(seg));
}

function inferKindFromText(raw: string): ConfigPathMeta["kind"] {
  const value = raw.trim();
  if (!value) return "string";
  if (value === "true" || value === "false") return "boolean";
  if (value === "null") return "null";
  if (/^-?\d+(\.\d+)?$/.test(value)) return "number";
  if (value.startsWith("[") || value.startsWith("- ")) return "array";
  if (value.startsWith("{")) return "object";
  try {
    const parsed = YAML.parse(value);
    return detectKind(parsed);
  } catch {
    return "string";
  }
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

function parseScalarValue(raw: string): unknown {
  const value = raw.trim();
  if (!value) return "";
  try {
    return YAML.parse(value);
  } catch {
    return value.replace(/^["']|["']$/g, "");
  }
}

function toMeta(path: string, value: unknown, kind?: ConfigPathMeta["kind"]): ConfigPathMeta {
  const resolvedKind = kind ?? detectKind(value);
  return {
    path,
    kind: resolvedKind,
    sample: sampleValue(value),
    sampleRaw: sampleRaw(value),
  };
}

/** Parse `# key: value` and active keys from reference YAML (wiki-aligned). */
export function parseYamlSchemaPaths(yamlText: string): ConfigPathMeta[] {
  const items = new Map<string, ConfigPathMeta>();
  const stack: Array<{ indent: number; key: string }> = [];

  const addPath = (configPath: string, value: unknown, kind?: ConfigPathMeta["kind"]) => {
    if (!isValidConfigPath(configPath)) return;
    if (!items.has(configPath)) items.set(configPath, toMeta(configPath, value, kind));
  };

  for (const rawLine of yamlText.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    const trimmed = line.trim();
    if (!trimmed) continue;

    const indent = line.length - line.trimStart().length;
    const isComment = trimmed.startsWith("#");
    const body = isComment ? trimmed.replace(/^#\s*/, "") : trimmed;
    if (!body || body.startsWith("---")) continue;

    const keyMatch = body.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:/);
    if (!keyMatch) continue;

    const key = keyMatch[1]!;
    while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) stack.pop();

    const configPath = stack.length ? `${stack.map((s) => s.key).join(".")}.${key}` : key;
    const valuePart = body.slice(body.indexOf(":") + 1).replace(/#.*$/, "").trim();

    if (valuePart) {
      const kind = inferKindFromText(valuePart);
      addPath(configPath, parseScalarValue(valuePart), kind);
    } else if (!isComment) {
      addPath(configPath, {}, "object");
    }

    const opensNested =
      !valuePart || valuePart.startsWith("|") || valuePart.startsWith(">") || valuePart === "{}";
    if (opensNested && !isComment) stack.push({ indent, key });
  }

  return Array.from(items.values());
}

export function loadWikiSchemaStubs(): ConfigPathMeta[] {
  return Object.entries(WIKI_SCHEMA_STUBS).map(([path, stub]) => toMeta(path, stub.value, stub.kind));
}

export function supplementCatalogFromReferenceYaml(catalog: Map<string, ConfigPathMeta>): void {
  for (const item of loadWikiSchemaStubs()) {
    if (!catalog.has(item.path)) catalog.set(item.path, item);
  }
}
