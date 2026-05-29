/**
 * 审计 config-schema 中缺失或质量差的 description。
 * Run: pnpm --filter server run audit-schema-descriptions
 */
import { loadConfigSchemaCatalog } from "../src/config-schema.js";
import {
  WIKI_DESCRIPTIONS_BY_KEY,
  WIKI_DESCRIPTIONS_BY_PATH,
} from "../src/config-wiki-descriptions.js";

const BAD_PATTERN = /^[a-z][a-z0-9-]*\s*:\s*.+$/i;

function isDynamicKey(key: string): boolean {
  return /[:+,]/.test(key) || key.includes("geosite:") || key.includes("rule-set:");
}

function hasWikiCoverage(path: string): boolean {
  if (WIKI_DESCRIPTIONS_BY_PATH[path]) return true;
  const key = path.split(".").pop()!;
  if (WIKI_DESCRIPTIONS_BY_KEY[path]) return true;
  if (WIKI_DESCRIPTIONS_BY_KEY[key]) return true;
  return false;
}

function isWeakDescription(desc: string | undefined): boolean {
  if (!desc?.trim()) return true;
  if (desc.includes("-----BEGIN")) return true;
  if (BAD_PATTERN.test(desc.trim()) && desc.length < 80) return true;
  if (/！！！/.test(desc)) return true;
  return false;
}

const workspaceRoot = process.cwd();
const { items } = loadConfigSchemaCatalog(workspaceRoot);

const missingWiki: string[] = [];
const weakDesc: string[] = [];
const skippedDynamic: string[] = [];

for (const item of items) {
  const key = item.path.split(".").pop()!;
  if (isDynamicKey(key)) {
    skippedDynamic.push(item.path);
    continue;
  }
  if (!hasWikiCoverage(item.path)) missingWiki.push(item.path);
  if (isWeakDescription(item.description)) weakDesc.push(item.path);
}

console.log(`Schema paths: ${items.length}`);
console.log(`Dynamic (skipped): ${skippedDynamic.length}`);
console.log(`Missing wiki map: ${missingWiki.length}`);
console.log(`Weak description: ${weakDesc.length}`);

if (missingWiki.length) {
  console.log("\n--- Missing wiki (add to config-wiki-descriptions.ts) ---");
  for (const p of missingWiki.slice(0, 80)) console.log(p);
  if (missingWiki.length > 80) console.log(`... and ${missingWiki.length - 80} more`);
}

if (weakDesc.length) {
  console.log("\n--- Weak description (fix via wiki + apply) ---");
  for (const p of weakDesc.slice(0, 40)) console.log(p);
  if (weakDesc.length > 40) console.log(`... and ${weakDesc.length - 40} more`);
}

process.exit(missingWiki.length || weakDesc.length ? 1 : 0);
