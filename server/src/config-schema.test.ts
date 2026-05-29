import { describe, expect, it } from "vitest";
import { loadConfigItemCatalog, loadConfigSchema } from "./config-catalog.js";
import { flattenConfigSchema, validateEnumValue, validateValueAgainstRules } from "./config-schema.js";
import { validateConfigYaml } from "./config-validator.js";
import type { ConfigPropertySchema } from "./types.js";

describe("config schema file", () => {
  it("loads explicit schema with enums and rules", () => {
    const schema = loadConfigSchema(process.cwd());
    expect(schema.version).toBe(1);
    expect(schema.properties.length).toBeGreaterThan(40);

    const items = loadConfigItemCatalog(process.cwd());
    const mode = items.find((i) => i.path === "mode");
    expect(mode?.enum).toEqual(["rule", "global", "direct"]);
    expect(mode?.description).toContain("运行模式");

    const mixedPort = items.find((i) => i.path === "mixed-port");
    expect(mixedPort?.rules?.some((r) => r.kind === "range")).toBe(true);
  });

  it("validates enum values", () => {
    const catalog = loadConfigItemCatalog(process.cwd());
    const bad = validateConfigYaml("mode: invalid-mode\n", catalog);
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.some((e) => e.path === "mode" && e.message.includes("rule"))).toBe(true);
    }
  });
});

describe("validateValueAgainstRules", () => {
  it("checks numeric range", () => {
    const rules = [{ kind: "range" as const, min: 1, max: 65535 }];
    expect(validateValueAgainstRules(0, rules, "port")).toContain("最小值");
    expect(validateValueAgainstRules(70000, rules, "port")).toContain("最大值");
    expect(validateValueAgainstRules(7890, rules, "port")).toBeNull();
  });

  it("checks string regex and length", () => {
    const rules = [
      { kind: "regex" as const, pattern: "^[a-z]+$" },
      { kind: "minLength" as const, value: 3 },
      { kind: "maxLength" as const, value: 10 },
    ];
    expect(validateValueAgainstRules("ab", rules, "name")).toContain("长度不能小于");
    expect(validateValueAgainstRules("abcdefghijk", rules, "name")).toContain("长度不能大于");
    expect(validateValueAgainstRules("ABC", rules, "name")).toContain("格式要求");
    expect(validateValueAgainstRules("valid", rules, "name")).toBeNull();
  });
});

describe("validateEnumValue", () => {
  it("accepts listed values and rejects others", () => {
    const enumValues = ["rule", "global", "direct"];
    expect(validateEnumValue("rule", enumValues)).toBeNull();
    expect(validateEnumValue("invalid", enumValues)).toContain("rule");
  });
});

describe("flattenConfigSchema", () => {
  it("flattens nested objects and array object items", () => {
    const properties: ConfigPropertySchema[] = [
      {
        key: "dns",
        type: "object",
        properties: [
          { key: "enable", type: "boolean", default: true },
          { key: "ipv6", type: "boolean", default: false },
        ],
      },
      {
        key: "proxies",
        type: "array",
        default: [],
        items: {
          type: "object",
          properties: [
            { key: "name", type: "string", default: "" },
            { key: "type", type: "string", default: "ss" },
          ],
        },
      },
      { key: "mode", type: "string", default: "rule" },
    ];

    const { items, pathOrder } = flattenConfigSchema(properties);
    expect(pathOrder).toEqual([
      "dns",
      "dns.enable",
      "dns.ipv6",
      "proxies",
      "proxies.name",
      "proxies.type",
      "mode",
    ]);
    expect(items.find((i) => i.path === "dns.enable")?.kind).toBe("boolean");
    expect(items.find((i) => i.path === "proxies.name")?.kind).toBe("string");
  });
});
