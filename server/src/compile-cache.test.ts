import { beforeEach, describe, expect, it } from "vitest";
import { getOrCompileScheme, invalidateAllCompiledCache } from "./compile-cache.js";
import type { Modifier, Scheme } from "./types.js";

const scheme: Scheme = {
  id: "scheme-1",
  name: "test-scheme",
  sourceId: "source-1",
  modifierIds: [],
};

describe("compile-cache", () => {
  beforeEach(() => {
    invalidateAllCompiledCache();
  });

  it("returns miss on first compile and hit on repeat", async () => {
    let compileCount = 0;
    const compiler = () => {
      compileCount += 1;
      return [{ stepName: "final", yaml: "port: 7890\n" }];
    };

    const first = await getOrCompileScheme(scheme, "port: 7890\n", [], compiler);
    expect(first.hit).toBe(false);
    expect(first.entry.steps).toHaveLength(1);
    expect(compileCount).toBe(1);

    const second = await getOrCompileScheme(scheme, "port: 7890\n", [], compiler);
    expect(second.hit).toBe(true);
    expect(compileCount).toBe(1);
  });

  it("recompiles when source or modifiers change", async () => {
    let compileCount = 0;
    const compiler = () => {
      compileCount += 1;
      return [{ stepName: "final", yaml: "port: 7890\n" }];
    };

    await getOrCompileScheme(scheme, "port: 7890\n", [], compiler);
    const modifier: Modifier = {
      id: "m1",
      name: "m1",
      simpleEdits: [],
      ruleEdits: [{ path: "mode", op: "replace", value: "rule" }],
      codeEdits: [],
    };
    const afterChange = await getOrCompileScheme(scheme, "port: 7890\n", [modifier], compiler);
    expect(afterChange.hit).toBe(false);
    expect(compileCount).toBe(2);
  });

  it("deduplicates concurrent compiles for the same version", async () => {
    let compileCount = 0;
    const compiler = () => {
      compileCount += 1;
      return [{ stepName: "final", yaml: "mode: rule\n" }];
    };

    const [a, b] = await Promise.all([
      getOrCompileScheme(scheme, "mode: rule\n", [], compiler),
      getOrCompileScheme(scheme, "mode: rule\n", [], compiler),
    ]);
    expect(a.entry).toBe(b.entry);
    expect(compileCount).toBe(1);
  });

  it("invalidateAllCompiledCache forces next compile to miss", async () => {
    let compileCount = 0;
    const compiler = () => {
      compileCount += 1;
      return [{ stepName: "final", yaml: "mode: rule\n" }];
    };

    await getOrCompileScheme(scheme, "mode: rule\n", [], compiler);
    invalidateAllCompiledCache();
    const afterInvalidate = await getOrCompileScheme(scheme, "mode: rule\n", [], compiler);
    expect(afterInvalidate.hit).toBe(false);
    expect(compileCount).toBe(2);
  });
});
