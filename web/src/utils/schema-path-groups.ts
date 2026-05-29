import type { SchemaItem } from "../types/config-schema";
import type { ConditionOp } from "../types/simple-modifier";
import { buildPathOptions, filterPathOptionsForCondition } from "./simple-modifier-meta";

/** 与 https://wiki.metacubex.one/config/ 章节一致 */
export type SchemaPathGroupId =
  | "global"
  | "dns"
  | "sniffer"
  | "inbound"
  | "outbound"
  | "proxy"
  | "rules"
  | "other";

export type SchemaPathOptionGroup = {
  label: string;
  options: Array<SchemaItem & { depth: number }>;
};

const GROUP_DEFS: Array<{ id: SchemaPathGroupId; label: string }> = [
  { id: "global", label: "全局配置" },
  { id: "dns", label: "DNS" },
  { id: "sniffer", label: "域名嗅探" },
  { id: "inbound", label: "流量入站" },
  { id: "outbound", label: "出站代理" },
  { id: "proxy", label: "代理" },
  { id: "rules", label: "规则" },
  { id: "other", label: "其他" },
];

/** 流量入站：TUN / listeners（代理端口在全局配置中更易查找） */
const INBOUND_ROOT_KEYS = new Set(["tun", "listeners"]);

/** 核心顶层 path，防止 schema 未加载时丢失常用项 */
const CORE_PATHS: SchemaItem[] = [
  { path: "port", kind: "number", sample: "7890", sampleRaw: "7890", description: "HTTP(S) 代理监听端口" },
  { path: "socks-port", kind: "number", sample: "7891", sampleRaw: "7891", description: "SOCKS5 代理监听端口" },
  { path: "mixed-port", kind: "number", sample: "7890", sampleRaw: "7890", description: "HTTP(S) 与 SOCKS 混合代理端口" },
  { path: "redir-port", kind: "number", sample: "7892", sampleRaw: "7892", description: "透明代理端口" },
  { path: "tproxy-port", kind: "number", sample: "7893", sampleRaw: "7893", description: "TProxy 透明代理端口" },
  { path: "mode", kind: "string", sample: "rule", sampleRaw: '"rule"', description: "运行模式" },
  { path: "allow-lan", kind: "boolean", sample: "false", sampleRaw: "false", description: "是否允许局域网连接" },
];

export function classifySchemaPathGroup(path: string): SchemaPathGroupId {
  const top = path.split(".")[0] ?? path;

  if (top === "dns") return "dns";
  if (top === "sniffer") return "sniffer";
  if (INBOUND_ROOT_KEYS.has(top)) return "inbound";
  if (top === "proxies") return "outbound";
  if (top === "proxy-groups" || top === "proxy-providers") return "proxy";
  if (top === "rules" || top === "rule-providers" || top === "sub-rules") return "rules";
  if (top === "tunnels" || top === "ntp" || top === "experimental") return "other";

  return "global";
}

function mergeCorePaths(items: SchemaItem[]): SchemaItem[] {
  const byPath = new Map(items.map((i) => [i.path, i]));
  for (const core of CORE_PATHS) {
    if (!byPath.has(core.path)) byPath.set(core.path, core);
  }
  return [...byPath.values()];
}

export function buildGroupedPathOptions(items: SchemaItem[], pathOrder?: string[]): SchemaPathOptionGroup[] {
  const flat = buildPathOptions(mergeCorePaths(items), pathOrder);
  const buckets = new Map<SchemaPathGroupId, Array<SchemaItem & { depth: number }>>(
    GROUP_DEFS.map((g) => [g.id, []]),
  );

  for (const opt of flat) {
    buckets.get(classifySchemaPathGroup(opt.path))!.push(opt);
  }

  return GROUP_DEFS.map((g) => ({
    label: g.label,
    options: buckets.get(g.id)!,
  })).filter((g) => g.options.length > 0);
}

export function filterGroupedPathOptions(
  groups: SchemaPathOptionGroup[],
  predicate: (opt: SchemaItem & { depth: number }) => boolean,
): SchemaPathOptionGroup[] {
  return groups
    .map((g) => ({
      label: g.label,
      options: g.options.filter(predicate),
    }))
    .filter((g) => g.options.length > 0);
}

export function filterGroupedPathOptionsForCondition(
  groups: SchemaPathOptionGroup[],
  op: ConditionOp,
  items: SchemaItem[],
): SchemaPathOptionGroup[] {
  return groups
    .map((g) => ({
      label: g.label,
      options: filterPathOptionsForCondition(g.options, op, items),
    }))
    .filter((g) => g.options.length > 0);
}
