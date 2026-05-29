import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { compileWithSteps } from "./modifier-engine.js";
import { loadConfigItemCatalog } from "./config-catalog.js";
import { loadConfigPathOrder } from "./config-catalog.js";
import {
  buildDefaultEditorClassCode,
  buildModifierTypeDeclaration,
  extractEditorClassCode,
  pathToMethodName,
  pathToMethodType,
  prepareClassCodeForRuntime,
  yamlKeyToCamel,
} from "./modifier-codegen.js";

describe("modifier codegen", () => {
  it("maps underscore segments to camelCase method names", () => {
    expect(pathToMethodName("allow-lan")).toBe("getAllowLan");
    expect(pathToMethodName("allow_lan")).toBe("getAllowLan");
    expect(pathToMethodName("dns.enable")).toBe("getDnsEnable");
  });

  it("maps yaml keys to camelCase editor properties", () => {
    expect(yamlKeyToCamel("mixed-port")).toBe("mixedPort");
    expect(yamlKeyToCamel("allow-lan")).toBe("allowLan");
    expect(yamlKeyToCamel("bind-address")).toBe("bindAddress");
    expect(yamlKeyToCamel("mode")).toBe("mode");
  });

  it("uses primitive types for simple kinds and named types for complex kinds", () => {
    expect(pathToMethodType("allow-lan", "boolean")).toBe("boolean");
    expect(pathToMethodType("port", "number")).toBe("number");
    expect(pathToMethodType("mode", "string")).toBe("string");
    const items = loadConfigItemCatalog(process.cwd());
    expect(pathToMethodType("dns", "object", undefined, items)).toBe("DnsValue");
    const rulesItem = {
      path: "rules",
      kind: "array" as const,
      sample: "",
      sampleRaw: "",
      items: { type: "string" as const },
    };
    expect(pathToMethodType("rules", "array", rulesItem)).toBe("Array<string>");
    const emptyStringArrayItem = {
      path: "proxy-groups.proxies",
      kind: "array" as const,
      sample: "",
      sampleRaw: "",
      items: { type: "string" as const },
    };
    expect(pathToMethodType("proxy-groups.proxies", "array", emptyStringArrayItem)).toBe(
      "Array<string>",
    );
    const proxiesItem = {
      path: "proxies",
      kind: "array" as const,
      sample: "",
      sampleRaw: "",
      items: { type: "object" as const, properties: [{ key: "name", type: "string" as const }] },
    };
    expect(pathToMethodType("proxies", "array", proxiesItem)).toBe("Array<ProxiesItem>");
  });

  it("generates per-path interfaces without JsonValue", () => {
    const items = loadConfigItemCatalog(process.cwd());
    const decl = buildModifierTypeDeclaration(items);
    expect(decl).not.toContain("JsonValue");
    expect(decl).not.toContain("JsonObject");
    expect(decl).not.toContain("declare global");
    expect(decl).not.toContain("export {}");
    expect(decl).toContain("class BaseModifier");
    expect(decl).toContain("interface DnsValue");
    expect(decl).toContain("interface ProxiesItem");
    expect(decl).toContain("interface ProxyGroupsItem");
    expect(decl).toContain("proxies?: Array<string>");
    expect(decl).not.toMatch(/never\[\]/);
    expect(decl).not.toMatch(/proxies: \{/);
    expect(decl).not.toContain("interface ProxiesValue");
    expect(decl).toContain("proxies?: Array<ProxiesItem>");
    expect(decl).toContain("interface ConfigRoot");
    expect(decl).toContain("mixedPort?: number");
    expect(decl).toContain("allowLan?: boolean");
    expect(decl).not.toMatch(/"mixed-port"/);
    expect(decl).not.toMatch(/"allow-lan"/);
  });

  it("includes config parameter in default method signatures", () => {
    const items = loadConfigItemCatalog(process.cwd());
    const code = buildDefaultEditorClassCode(items);
    expect(code).toContain("config: ConfigRoot");
    expect(code).toMatch(/getAllowLan\(rawAllowLan: boolean, config: ConfigRoot\)/);
  });

  it("prepares export default class for runtime", () => {
    const prepared = prepareClassCodeForRuntime(`export default class extends BaseModifier {
  getAllowLan(rawAllowLan) { return false; }
}`);
    expect(prepared).toContain("module.exports.default = class extends BaseModifier");
  });

  it("keeps default editor stubs on one commented line per method", () => {
    const items = loadConfigItemCatalog(process.cwd());
    const code = buildDefaultEditorClassCode(items);
    expect(code).toContain("getTunnels(");
    expect(code).not.toMatch(/\n\s+network:/);
  });

  it("reorders stored class methods to catalog order on extract", () => {
    const order = loadConfigPathOrder(process.cwd());
    const items = loadConfigItemCatalog(process.cwd());
    const shuffled = `export default class extends BaseModifier {
  // getRules(rawRules: Array<string>, config: ConfigRoot): Array<string> {
  //   return rawRules;
  // }

  // getPort(rawPort: number, config: ConfigRoot): number {
  //   return rawPort;
  // }

  // getAllowLan(rawAllowLan: boolean, config: ConfigRoot): boolean {
  //   return rawAllowLan;
  // }
}
`;
    const extracted = extractEditorClassCode(shuffled, items);
    const methodOrder = [...extracted.matchAll(/\/\/ (get[A-Za-z0-9]+)\(/g)].map((m) => m[1]);
    expect(methodOrder.indexOf("getPort")).toBe(0);
    expect(methodOrder.indexOf("getPort")).toBeLessThan(methodOrder.indexOf("getAllowLan"));
    expect(methodOrder.indexOf("getAllowLan")).toBeLessThan(methodOrder.indexOf("getRules"));
    const canonical = buildDefaultEditorClassCode(items, order);
    const canonicalOrder = [...canonical.matchAll(/\/\/ (get[A-Za-z0-9]+)\(/g)].map((m) => m[1]);
    expect(methodOrder.slice(0, 3)).toEqual(canonicalOrder.slice(0, 3));
  });
});

describe("class modifier runtime", () => {
  it("applies getter methods from editor class code", () => {
    const source = YAML.stringify({ "allow-lan": true, dns: { enable: true } });
    const steps = compileWithSteps(source, [
      {
        id: "m1",
        name: "class-layer",
        simpleEdits: [],
        ruleEdits: [],
        codeEdits: [],
        classCode: `export default class extends BaseModifier {
  getAllowLan(rawAllowLan) {
    return false;
  }
}`,
      },
    ]);
    const finalObj = YAML.parse(steps[1].yaml);
    expect(finalObj["allow-lan"]).toBe(false);
  });

  it("skips class code when classCodeEnabled is false", () => {
    const source = YAML.stringify({ "allow-lan": true });
    const steps = compileWithSteps(source, [
      {
        id: "m1",
        name: "class-layer",
        simpleEdits: [],
        ruleEdits: [],
        codeEdits: [],
        classCodeEnabled: false,
        classCode: `export default class extends BaseModifier {
  getAllowLan() {
    return false;
  }
}`,
      },
    ]);
    const finalObj = YAML.parse(steps[1].yaml);
    expect(finalObj["allow-lan"]).toBe(true);
  });

  it("passes camelCase config as second argument to getter methods", () => {
    const source = YAML.stringify({ "allow-lan": true, mode: "rule" });
    const steps = compileWithSteps(source, [
      {
        id: "m1",
        name: "class-layer",
        simpleEdits: [],
        ruleEdits: [],
        codeEdits: [],
        classCode: `export default class extends BaseModifier {
  getAllowLan(rawAllowLan, config) {
    return config.mode === "rule" ? false : rawAllowLan;
  }
}`,
      },
    ]);
    const finalObj = YAML.parse(steps[1].yaml);
    expect(finalObj["allow-lan"]).toBe(false);
    expect(finalObj.mode).toBe("rule");
  });

  it("reads camelCase config properties in getter methods", () => {
    const source = YAML.stringify({ "mixed-port": 7890, "allow-lan": true });
    const steps = compileWithSteps(source, [
      {
        id: "m1",
        name: "class-layer",
        simpleEdits: [],
        ruleEdits: [],
        codeEdits: [],
        classCode: `export default class extends BaseModifier {
  getMixedPort(rawMixedPort, config) {
    return config.allowLan ? rawMixedPort : 0;
  }
}`,
      },
    ]);
    const finalObj = YAML.parse(steps[1].yaml);
    expect(finalObj["mixed-port"]).toBe(7890);
  });

  it("previews with default commented class template", () => {
    const items = loadConfigItemCatalog(process.cwd());
    const source = YAML.stringify({ "allow-lan": true, mode: "rule" });
    const steps = compileWithSteps(source, [
      {
        id: "m1",
        name: "class-layer",
        simpleEdits: [],
        ruleEdits: [],
        codeEdits: [],
        classCode: buildDefaultEditorClassCode(items),
      },
    ]);
    expect(steps).toHaveLength(2);
  });

  it("previews with uncommented TS-annotated methods", () => {
    const source = YAML.stringify({ "allow-lan": true, mode: "rule" });
    const steps = compileWithSteps(source, [
      {
        id: "m1",
        name: "class-layer",
        simpleEdits: [],
        ruleEdits: [],
        codeEdits: [],
        classCode: `export default class extends BaseModifier {
  getAllowLan(rawAllowLan: boolean, config: ConfigRoot): boolean {
    return false;
  }
}`,
      },
    ]);
    expect(YAML.parse(steps[1].yaml)["allow-lan"]).toBe(false);
  });
});
