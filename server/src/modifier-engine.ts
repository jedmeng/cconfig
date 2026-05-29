import vm from "node:vm";
import YAML from "yaml";
import { stringifyConfigYaml } from "./config-key-order.js";
import {
  mergeEditorConfigToYaml,
  pathToMethodName,
  prepareClassCodeForRuntime,
  RUNTIME_CLASS_PRELUDE,
  toEditorConfig,
} from "./modifier-codegen.js";
import { applySimpleEdits } from "./simple-modifier.js";
import type { Modifier, PreviewStep, RuleEdit } from "./types.js";

function getByPath(root: any, path: string): any {
  return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), root);
}

function setByPath(root: any, path: string, value: any): void {
  const keys = path.split(".");
  let cursor = root;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const k = keys[i];
    if (cursor[k] == null || typeof cursor[k] !== "object") {
      cursor[k] = {};
    }
    cursor = cursor[k];
  }
  cursor[keys[keys.length - 1]] = value;
}

function applyRule(obj: any, rule: RuleEdit): void {
  const current = getByPath(obj, rule.path);
  switch (rule.op) {
    case "replace":
      setByPath(obj, rule.path, rule.value);
      return;
    case "regexReplace": {
      const source = current == null ? "" : String(current);
      const replaced = source.replace(new RegExp(rule.pattern ?? "", "g"), rule.replace ?? "");
      setByPath(obj, rule.path, replaced);
      return;
    }
    case "prependList": {
      const arr = Array.isArray(current) ? current : [];
      setByPath(obj, rule.path, [rule.value, ...arr]);
      return;
    }
    case "appendList": {
      const arr = Array.isArray(current) ? current : [];
      setByPath(obj, rule.path, [...arr, rule.value]);
      return;
    }
  }
}

function applyCodeEdit(obj: any, path: string, code: string): void {
  const originalValue = getByPath(obj, path);
  const sandbox = { input: originalValue, output: originalValue };
  vm.createContext(sandbox);
  const wrapped = `"use strict";\n${code}`;
  new vm.Script(wrapped).runInContext(sandbox, { timeout: 300 });
  setByPath(obj, path, sandbox.output);
}

function applyClassModifier(obj: any, classCode?: string): void {
  if (!classCode?.trim()) return;
  const sandbox = {
    exports: {} as Record<string, unknown>,
    module: { exports: {} as Record<string, unknown> },
  };
  vm.createContext(sandbox);
  const runtimeClassCode = prepareClassCodeForRuntime(classCode);
  const wrapped = `"use strict";
${RUNTIME_CLASS_PRELUDE}
${runtimeClassCode}
if (typeof module.exports.default !== "function") {
  throw new Error("classCode must export default class extends BaseModifier");
}
`;
  new vm.Script(wrapped).runInContext(sandbox, { timeout: 600 });
  const ModifierClass = (sandbox.module.exports as { default?: new () => Record<string, unknown> }).default;
  if (!ModifierClass) return;
  const instance = new ModifierClass();
  const editorConfig = toEditorConfig(obj);
  if (typeof instance.transform === "function") {
    const transformed = instance.transform(editorConfig);
    if (transformed && typeof transformed === "object" && transformed !== editorConfig) {
      mergeEditorConfigToYaml(obj as Record<string, unknown>, transformed as Record<string, unknown>);
    }
  }
  const allPaths = new Set<string>();
  const walk = (current: any, prefix = ""): void => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return;
    for (const [k, v] of Object.entries(current)) {
      const next = prefix ? `${prefix}.${k}` : k;
      allPaths.add(next);
      walk(v, next);
    }
  };
  walk(obj);
  for (const path of allPaths) {
    const method = instance[pathToMethodName(path)];
    if (typeof method !== "function") continue;
    const before = getByPath(obj, path);
    const after = method.call(instance, before, editorConfig);
    setByPath(obj, path, after);
  }
}

export function isClassCodeEnabled(modifier: Modifier): boolean {
  if (modifier.classCodeEnabled === false) return false;
  if (modifier.classCodeEnabled === true) return true;
  return Boolean(modifier.classCode?.trim());
}

function normalizeModifier(modifier: Modifier): Modifier {
  return {
    ...modifier,
    simpleEdits: modifier.simpleEdits ?? [],
    ruleEdits: modifier.ruleEdits ?? [],
    codeEdits: modifier.codeEdits ?? [],
    classCodeEnabled: isClassCodeEnabled(modifier),
  };
}

export function compileWithSteps(rawYaml: string, modifiers: Modifier[]): PreviewStep[] {
  const parsed = YAML.parse(rawYaml) ?? {};
  const steps: PreviewStep[] = [{ stepName: "source", yaml: stringifyConfigYaml(parsed) }];

  for (const modifier of modifiers.map(normalizeModifier)) {
    applySimpleEdits(parsed as Record<string, unknown>, modifier.simpleEdits);
    for (const rule of modifier.ruleEdits ?? []) {
      applyRule(parsed, rule);
    }
    for (const codeEdit of modifier.codeEdits) {
      applyCodeEdit(parsed, codeEdit.path, codeEdit.code);
    }
    if (isClassCodeEnabled(modifier)) {
      applyClassModifier(parsed, modifier.classCode);
    }
    steps.push({ stepName: modifier.name, yaml: stringifyConfigYaml(parsed) });
  }

  return steps;
}
