/**
 * 审计 config-schema：结构、类型、枚举、规则、中文说明。
 * Run: pnpm --filter server run audit-config-schema
 */
import { flattenConfigSchema, loadConfigSchemaFile } from "../src/config-schema.js";
import { KNOWN_ENUMS, rulesForPath, SIBLING_KEY_ORDER } from "../src/config-schema-overrides.js";
import { resolveWikiDescription } from "../src/config-schema-wiki.js";
import type { ConfigPropertySchema } from "../src/types.js";

const BAD_PATTERN = /^[a-z][a-z0-9-]*\s*:\s*.+$/i;

function isDynamicKey(key: string): boolean {
  return /[:+,]/.test(key) || key.includes("geosite:") || key.includes("rule-set:");
}

function walkTree(
  properties: ConfigPropertySchema[],
  prefix: string,
  issues: {
    structure: string[];
    missingEnum: string[];
    missingRules: string[];
    weakDesc: string[];
    order: string[];
  },
): void {
  const expectedOrder = SIBLING_KEY_ORDER[prefix];
  if (expectedOrder?.length) {
    const keys = properties.map((p) => p.key);
    const ordered = expectedOrder.filter((k) => keys.includes(k));
    const actual = keys.filter((k) => ordered.includes(k));
    if (actual.join(",") !== ordered.join(",")) {
      issues.order.push(prefix || "(root)");
    }
  }

  for (const prop of properties) {
    const path = prefix ? `${prefix}.${prop.key}` : prop.key;

    if (prop.type === "object" && prop.properties === undefined) {
      issues.structure.push(`${path}: object 缺少 properties（应递归保存子属性）`);
    }
    if (prop.type === "array") {
      if (!prop.items) issues.structure.push(`${path}: array 缺少 items`);
      else if (prop.items.type === "object" && !prop.items.properties) {
        issues.structure.push(`${path}: array.items 缺少 properties`);
      }
    }

    if (KNOWN_ENUMS[path] && !prop.enum?.length) issues.missingEnum.push(path);
    if (rulesForPath(path) && !prop.rules?.length) issues.missingRules.push(path);

    const key = prop.key;
    if (!isDynamicKey(key)) {
      const wiki = resolveWikiDescription(path, key, prop.description);
      if (!wiki) issues.weakDesc.push(path);
      else if (prop.description && BAD_PATTERN.test(prop.description)) issues.weakDesc.push(path);
    }

    if (prop.properties?.length) walkTree(prop.properties, path, issues);
    if (prop.items?.properties?.length) walkTree(prop.items.properties, path, issues);
  }
}

const workspaceRoot = process.cwd();
const schema = loadConfigSchemaFile(workspaceRoot);
const { items } = flattenConfigSchema(schema.properties);

const issues = {
  structure: [] as string[],
  missingEnum: [] as string[],
  missingRules: [] as string[],
  weakDesc: [] as string[],
  order: [] as string[],
};

walkTree(schema.properties, "", issues);

console.log(`Schema paths (flat): ${items.length}`);
console.log(`Structure issues: ${issues.structure.length}`);
console.log(`Missing enum: ${issues.missingEnum.length}`);
console.log(`Missing rules: ${issues.missingRules.length}`);
console.log(`Weak/missing description: ${issues.weakDesc.length}`);
console.log(`Sibling order drift: ${issues.order.length}`);

const report = (title: string, list: string[], limit = 30) => {
  if (!list.length) return;
  console.log(`\n--- ${title} ---`);
  for (const p of list.slice(0, limit)) console.log(p);
  if (list.length > limit) console.log(`... +${list.length - limit} more`);
};

report("Structure", issues.structure);
report("Missing enum", issues.missingEnum);
report("Missing rules", issues.missingRules);
report("Weak description", issues.weakDesc);
report("Order drift", issues.order);

const failed =
  issues.structure.length +
  issues.missingEnum.length +
  issues.missingRules.length +
  issues.weakDesc.length;

process.exit(failed ? 1 : 0);
