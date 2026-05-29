import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { compileWithSteps } from "./modifier-engine.js";

describe("modifier engine", () => {
  it("applies rule and code layers in order", () => {
    const source = YAML.stringify({
      dns: { enable: false },
      rules: ["A"],
      name: "hk-node",
    });
    const steps = compileWithSteps(source, [
      {
        id: "m1",
        name: "rule-layer",
        simpleEdits: [],
        ruleEdits: [
          { path: "dns.enable", op: "replace", value: true },
          { path: "rules", op: "appendList", value: "B" },
          { path: "name", op: "regexReplace", pattern: "hk", replace: "HK" },
        ],
        codeEdits: [{ path: "rules", code: "output = [...(input ?? []), 'C'];" }],
      },
    ]);

    expect(steps).toHaveLength(2);
    const finalObj = YAML.parse(steps[1].yaml);
    expect(finalObj.dns.enable).toBe(true);
    expect(finalObj.rules).toEqual(["A", "B", "C"]);
    expect(finalObj.name).toBe("HK-node");
  });

  it("emits yaml with schema sibling key order", () => {
    const source = YAML.stringify({
      "allow-lan": true,
      "mixed-port": 7890,
      mode: "rule",
    });
    const steps = compileWithSteps(source, []);
    const keys = steps[0]!
      .yaml.trim()
      .split("\n")
      .map((line) => line.split(":")[0]!.trim());
    expect(keys.slice(0, 3)).toEqual(["mixed-port", "allow-lan", "mode"]);
  });
});
