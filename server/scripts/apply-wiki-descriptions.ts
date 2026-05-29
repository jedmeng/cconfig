/**
 * 仅更新 schema 中的中文说明（不改结构/类型/枚举/规则）。
 * 全量同步请用 sync-config-schema。
 * Run: pnpm --filter server run apply-wiki-descriptions
 */
import fs from "node:fs";
import YAML from "yaml";
import { configSchemaPath } from "../src/config-schema.js";
import { applyWikiDescriptionsToTree } from "../src/config-schema-wiki.js";
import type { ConfigPropertySchema } from "../src/types.js";

const schemaPath = configSchemaPath(process.cwd());
const schema = YAML.parse(fs.readFileSync(schemaPath, "utf8")) as {
  version: number;
  properties: ConfigPropertySchema[];
};

const applied = applyWikiDescriptionsToTree(schema.properties, "");
fs.writeFileSync(schemaPath, YAML.stringify(schema, { lineWidth: 0 }), "utf8");
console.log(`Updated descriptions in ${schemaPath} (${applied} nodes)`);
