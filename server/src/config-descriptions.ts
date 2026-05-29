import { WIKI_DESCRIPTIONS_BY_PATH } from "./config-wiki-descriptions.js";

/**
 * 配置项中文说明（来源：https://wiki.metacubex.one/config/）
 */
export function loadConfigDescriptions(_workspaceRoot: string): Map<string, string> {
  return new Map(Object.entries(WIKI_DESCRIPTIONS_BY_PATH));
}
