/**
 * 全量同步 server/data/config-schema.yaml：结构、类型、排序、枚举、规则、中文说明。
 * Run: pnpm --filter server run sync-config-schema
 */
import { writeConfigSchemaFile } from "../src/config-schema-build.js";

const workspaceRoot = process.cwd();
const { flatCount, topLevel } = writeConfigSchemaFile(workspaceRoot);
console.log(
  `Synced config schema (${flatCount} flat paths → ${topLevel} top-level properties).`,
);
