import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { compileWithSteps } from "./modifier-engine.js";
import {
  applySimpleAction,
  applySimpleEdit,
  deleteByPath,
  evaluateCondition,
  evaluateConditionGroups,
  getByPath,
  normalizeSimpleEdit,
  setByPath,
} from "./simple-modifier.js";

describe("simple modifier", () => {
  it("evaluates AND within a group", () => {
    const root = { mode: "rule", "allow-lan": true };
    expect(
      evaluateConditionGroups(root, [
        [{ path: "mode", op: "eq", value: "rule" as unknown as number }],
      ]),
    ).toBe(false);
    expect(
      evaluateConditionGroups(root, [
        [
          { path: "mode", op: "startsWith", value: "ru" },
          { path: "allow-lan", op: "isTrue" },
        ],
      ]),
    ).toBe(true);
  });

  it("evaluates OR across groups", () => {
    const root = { mode: "rule", port: 7890 };
    expect(
      evaluateConditionGroups(root, [
        [
          { path: "mode", op: "eq", value: "global" as unknown as number },
          { path: "port", op: "eq", value: 7890 },
        ],
        [{ path: "mode", op: "startsWith", value: "ru" }],
      ]),
    ).toBe(true);
    expect(
      evaluateConditionGroups(root, [
        [{ path: "mode", op: "eq", value: "global" as unknown as number }],
        [{ path: "port", op: "eq", value: 1 }],
      ]),
    ).toBe(false);
  });

  it("prependList and appendList accept multiple values", () => {
    const root: Record<string, unknown> = { rules: ["A"] };
    applySimpleAction(root, { path: "rules", op: "prependList", value: ["B", "C"] });
    expect(root.rules).toEqual(["B", "C", "A"]);
    applySimpleAction(root, { path: "rules", op: "appendList", value: ["D"] });
    expect(root.rules).toEqual(["B", "C", "A", "D"]);
  });

  it("applies conditional edit when matched", () => {
    const root: Record<string, unknown> = { "mixed-port": 7890, mode: "rule" };
    applySimpleAction(root, { path: "mixed-port", op: "add", value: 10 });
    expect(root["mixed-port"]).toBe(7900);
  });

  it("skips edit when enabled is false", () => {
    const root: Record<string, unknown> = { mode: "rule" };
    applySimpleEdit(root, {
      id: "off",
      enabled: false,
      conditionGroups: [[{ path: "", op: "alwaysTrue" }]],
      actions: [{ path: "mode", op: "setValue", value: "global" }],
    });
    expect(root.mode).toBe("rule");
  });

  it("alwaysTrue runs actions and alwaysFalse skips", () => {
    const root: Record<string, unknown> = { mode: "rule" };
    applySimpleEdit(root, {
      id: "1",
      conditionGroups: [[{ path: "", op: "alwaysFalse" }]],
      actions: [{ path: "mode", op: "setValue", value: "global" }],
    });
    expect(root.mode).toBe("rule");
    applySimpleEdit(root, {
      id: "2",
      conditionGroups: [[{ path: "", op: "alwaysTrue" }]],
      actions: [{ path: "mode", op: "setValue", value: "global" }],
    });
    expect(root.mode).toBe("global");
  });

  it("negated conditions pass when property is missing", () => {
    const root = { mode: "rule" };
    expect(
      evaluateConditionGroups(root, [[{ path: "allow-lan", op: "notIsTrue" }]]),
    ).toBe(true);
    expect(
      evaluateConditionGroups(root, [[{ path: "mixed-port", op: "notGt", value: 9000 }]]),
    ).toBe(true);
    expect(
      evaluateConditionGroups({ tags: ["a"] }, [[{ path: "tags", op: "notArrayLengthGt", value: 5 }]]),
    ).toBe(true);
  });

  it("negated conditions fail when positive holds", () => {
    const root = { "allow-lan": true, "mixed-port": 10000 };
    expect(
      evaluateConditionGroups(root, [[{ path: "allow-lan", op: "notIsTrue" }]]),
    ).toBe(false);
    expect(
      evaluateConditionGroups(root, [[{ path: "mixed-port", op: "notGt", value: 9000 }]]),
    ).toBe(false);
  });

  it("migrates legacy conditions array", () => {
    const root: Record<string, unknown> = { mode: "rule" };
    applySimpleEdit(root, {
      id: "legacy",
      conditions: [{ path: "mode", op: "startsWith", value: "ru" }],
      actions: [{ path: "mode", op: "setValue", value: "global" }],
    } as Parameters<typeof applySimpleEdit>[1]);
    expect(root.mode).toBe("global");
  });

  it("compile applies simpleEdits in modifier pipeline", () => {
    const source = YAML.stringify({ mode: "rule", "allow-lan": false });
    const steps = compileWithSteps(source, [
      {
        id: "m1",
        name: "simple",
        simpleEdits: [
          {
            id: "e1",
            conditionGroups: [
              [{ path: "", op: "alwaysTrue" }],
              [
                { path: "mode", op: "startsWith", value: "ru" },
                { path: "allow-lan", op: "isFalse" },
              ],
            ],
            actions: [{ path: "allow-lan", op: "setValue", value: true }],
          },
        ],
        codeEdits: [],
      },
    ]);
    const final = YAML.parse(steps[1].yaml);
    expect(final["allow-lan"]).toBe(true);
  });

  it("getByPath and setByPath handle nested paths", () => {
    const root: Record<string, unknown> = {};
    setByPath(root, "dns.enable", true);
    expect(getByPath(root, "dns.enable")).toBe(true);
    setByPath(root, "dns.nameserver", ["1.1.1.1"]);
    expect(getByPath(root, "dns.nameserver")).toEqual(["1.1.1.1"]);
  });

  it("deleteByPath removes nested values", () => {
    const root: Record<string, unknown> = { dns: { enable: true, ipv6: false } };
    deleteByPath(root, "dns.ipv6");
    expect(getByPath(root, "dns.ipv6")).toBeUndefined();
    expect(getByPath(root, "dns.enable")).toBe(true);
  });

  it("applySimpleAction supports regexReplace and subtract", () => {
    const root: Record<string, unknown> = { name: "hk-node", port: 7900 };
    applySimpleAction(root, { path: "name", op: "regexReplace", pattern: "hk", replace: "HK" });
    applySimpleAction(root, { path: "port", op: "subtract", value: 10 });
    expect(root.name).toBe("HK-node");
    expect(root.port).toBe(7890);
  });

  it("evaluateCondition covers exists and string length ops", () => {
    const root = { mode: "rule", tags: ["a", "b"] };
    expect(evaluateCondition(root, { path: "mode", op: "exists" })).toBe(true);
    expect(evaluateCondition(root, { path: "missing", op: "notExists" })).toBe(true);
    expect(evaluateCondition(root, { path: "mode", op: "endsWith", value: "le" })).toBe(true);
    expect(evaluateCondition(root, { path: "mode", op: "lengthGt", value: 2 })).toBe(true);
    expect(evaluateCondition(root, { path: "tags", op: "arrayLengthEq", value: 2 })).toBe(true);
    expect(evaluateCondition(root, { path: "mode", op: "regexMatch", value: "[invalid" })).toBe(false);
  });

  it("normalizeSimpleEdit defaults fixed edits to alwaysTrue", () => {
    const edit = normalizeSimpleEdit({
      id: "fixed",
      kind: "fixed",
      actions: [{ path: "mode", op: "setValue", value: "global" }],
    } as Parameters<typeof normalizeSimpleEdit>[0]);
    expect(edit.conditionGroups).toEqual([[{ path: "", op: "alwaysTrue" }]]);
  });
});
