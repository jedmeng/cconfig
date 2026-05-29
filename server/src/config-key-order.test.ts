import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { comparePathsByOrder, sortConfigObjectDeep, stringifyConfigYaml } from "./config-key-order.js";

describe("config key order", () => {
  it("sorts top-level keys per SIBLING_KEY_ORDER", () => {
    const input = {
      "allow-lan": true,
      "mixed-port": 7890,
      port: 1234,
      mode: "rule",
    };
    const sorted = sortConfigObjectDeep(input) as Record<string, unknown>;
    expect(Object.keys(sorted)).toEqual(["port", "mixed-port", "allow-lan", "mode"]);
  });

  it("sorts nested dns keys", () => {
    const input = {
      dns: {
        ipv6: false,
        enable: true,
        nameserver: ["8.8.8.8"],
      },
    };
    const sorted = sortConfigObjectDeep(input) as { dns: Record<string, unknown> };
    expect(Object.keys(sorted.dns)).toEqual(["enable", "ipv6", "nameserver"]);
  });

  it("stringifyConfigYaml emits ordered keys", () => {
    const yaml = stringifyConfigYaml({ mode: "rule", port: 7890, "mixed-port": 7890 });
    const lines = yaml.trim().split("\n");
    expect(lines[0]).toMatch(/^port:/);
    expect(lines[1]).toMatch(/^mixed-port:/);
    expect(lines[2]).toMatch(/^mode:/);
  });

  it("preserves array contents", () => {
    const parsed = YAML.parse(stringifyConfigYaml({ rules: ["A", "B"], port: 7890 }));
    expect(parsed.rules).toEqual(["A", "B"]);
  });

  it("sorts keys from ARRAY_ITEM_EXTRA_PROPS when no explicit order", () => {
    const input = {
      "proxy-groups": [
        {
          proxies: ["a"],
          name: "g1",
          type: "select",
        },
      ],
    };
    const sorted = sortConfigObjectDeep(input) as typeof input;
    expect(Object.keys(sorted["proxy-groups"][0]!)).toEqual(["name", "type", "proxies"]);
  });

  it("comparePathsByOrder prefers schema path order", () => {
    const order = ["dns.enable", "dns.ipv6", "mode"];
    expect(comparePathsByOrder(order, "mode", "dns.enable")).toBeGreaterThan(0);
    expect(comparePathsByOrder(order, "dns.enable", "dns.ipv6")).toBeLessThan(0);
    expect(comparePathsByOrder(order, "unknown-a", "unknown-b")).not.toBe(0);
  });
});
