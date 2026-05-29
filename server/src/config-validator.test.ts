import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfigItemCatalog } from "./config-catalog.js";
import { validateConfigYaml } from "./config-validator.js";
import type { ConfigPathMeta } from "./types.js";

const miniCatalog: ConfigPathMeta[] = [
  {
    path: "port",
    kind: "number",
    sample: "7890",
    sampleRaw: "7890",
    rules: [{ kind: "range", min: 1, max: 65535 }],
  },
  {
    path: "mode",
    kind: "string",
    sample: "rule",
    sampleRaw: '"rule"',
    enum: ["rule", "global"],
  },
  {
    path: "rules",
    kind: "array",
    sample: "[]",
    sampleRaw: '["MATCH,DIRECT"]',
    items: { type: "string", key: "item" },
  },
  {
    path: "dns",
    kind: "object",
    sample: "{}",
    sampleRaw: "{}",
  },
  {
    path: "dns.enable",
    kind: "boolean",
    sample: "true",
    sampleRaw: "true",
  },
];

describe("validateConfigYaml", () => {
  const catalog = loadConfigItemCatalog(process.cwd());

  it("accepts config template yaml", () => {
    const yaml = fs.readFileSync(path.join(process.cwd(), "data/config-template.yaml"), "utf8");
    const result = validateConfigYaml(yaml, catalog);
    expect(result.ok).toBe(true);
  });

  it("reports unknown property names", () => {
    const result = validateConfigYaml("mixed-por: 7890\n", catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes("mixed-por"))).toBe(true);
    }
  });

  it("reports wrong value kind", () => {
    const result = validateConfigYaml("mixed-port: not-a-number\n", catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path === "mixed-port")).toBe(true);
    }
  });

  it("reports yaml syntax errors", () => {
    const result = validateConfigYaml("mode: [\n", miniCatalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.path).toBe("");
      expect(result.errors[0]?.message).toContain("YAML 语法错误");
    }
  });

  it("requires root object", () => {
    const scalar = validateConfigYaml("just-a-string\n", miniCatalog);
    expect(scalar.ok).toBe(false);
    if (!scalar.ok) {
      expect(scalar.errors[0]?.message).toContain("配置根节点应为 YAML 对象");
    }

    const arrayRoot = validateConfigYaml("- item\n", miniCatalog);
    expect(arrayRoot.ok).toBe(false);
  });

  it("reports range rule violations", () => {
    const result = validateConfigYaml("port: 0\n", miniCatalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path === "port" && e.message.includes("最小值"))).toBe(true);
    }
  });

  it("reports enum violations", () => {
    const result = validateConfigYaml("mode: invalid\n", miniCatalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path === "mode" && e.message.includes("rule"))).toBe(true);
    }
  });

  it("reports wrong array element types", () => {
    const result = validateConfigYaml("rules:\n  - 123\n", miniCatalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path === "rules[0]" && e.message.includes("字符串"))).toBe(
        true,
      );
    }
  });

  it("validates nested object fields", () => {
    const bad = validateConfigYaml("dns:\n  enable: yes\n", miniCatalog);
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.some((e) => e.path === "dns.enable")).toBe(true);
    }

    const good = validateConfigYaml("dns:\n  enable: true\n", miniCatalog);
    expect(good.ok).toBe(true);
  });

  it("reports out-of-range mixed-port from real catalog", () => {
    const result = validateConfigYaml("mixed-port: 70000\n", catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path === "mixed-port")).toBe(true);
    }
  });

  it("reports wrong number and boolean array element types", () => {
    const arrayCatalog: ConfigPathMeta[] = [
      {
        path: "ports",
        kind: "array",
        sample: "[]",
        sampleRaw: "[7890]",
        items: { type: "number", key: "item" },
      },
      {
        path: "flags",
        kind: "array",
        sample: "[]",
        sampleRaw: "[true]",
        items: { type: "boolean", key: "item" },
      },
    ];

    const badNumber = validateConfigYaml("ports:\n  - abc\n", arrayCatalog);
    expect(badNumber.ok).toBe(false);
    if (!badNumber.ok) {
      expect(badNumber.errors.some((e) => e.path === "ports[0]" && e.message.includes("数字"))).toBe(
        true,
      );
    }

    const badBoolean = validateConfigYaml("flags:\n  - 1\n", arrayCatalog);
    expect(badBoolean.ok).toBe(false);
    if (!badBoolean.ok) {
      expect(badBoolean.errors.some((e) => e.path === "flags[0]" && e.message.includes("布尔值"))).toBe(
        true,
      );
    }
  });

  it("validates object arrays inferred from sampleRaw", () => {
    const proxyCatalog: ConfigPathMeta[] = [
      {
        path: "proxies",
        kind: "array",
        sample: "[]",
        sampleRaw: '[{"name":"n1","type":"ss"}]',
      },
      {
        path: "proxies.name",
        kind: "string",
        sample: "n1",
        sampleRaw: '"n1"',
      },
      {
        path: "proxies.type",
        kind: "string",
        sample: "ss",
        sampleRaw: '"ss"',
      },
    ];

    const badItem = validateConfigYaml("proxies:\n  - not-an-object\n", proxyCatalog);
    expect(badItem.ok).toBe(false);
    if (!badItem.ok) {
      expect(badItem.errors.some((e) => e.path === "proxies[0]" && e.message.includes("对象"))).toBe(
        true,
      );
    }

    const unknownField = validateConfigYaml(
      "proxies:\n  - name: n1\n    typo-field: x\n",
      proxyCatalog,
    );
    expect(unknownField.ok).toBe(false);
    if (!unknownField.ok) {
      expect(
        unknownField.errors.some((e) => e.path === "proxies[0].typo-field" && e.message.includes("未知")),
      ).toBe(true);
    }
  });

  it("allows nested paths under known object prefixes", () => {
    const result = validateConfigYaml("dns:\n  enable: true\n  unknown-nested: 1\n", miniCatalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path === "dns.unknown-nested")).toBe(true);
    }
  });
});
