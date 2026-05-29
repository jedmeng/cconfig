import type { ConfigPropertySchema, ConfigRule } from "./types.js";

/** 端口类 path 校验 */
export const PORT_PATH_SUFFIX =
  /(^|\.)(port|socks-port|mixed-port|redir-port|tproxy-port|external-controller|external-controller-tls)$/;

export const PORT_RANGE_RULE: ConfigRule[] = [{ kind: "range", min: 1, max: 65535 }];

/** 显式枚举（来源：Mihomo Wiki 可选值说明） */
export const KNOWN_ENUMS: Record<string, (string | number | boolean)[]> = {
  mode: ["rule", "global", "direct"],
  "log-level": ["silent", "error", "warning", "info", "debug"],
  "find-process-mode": ["always", "strict", "off"],
  "global-client-fingerprint": ["chrome", "firefox", "safari", "ios", "random", "none"],
  "geosite-matcher": ["succinct", "mph"],
  "dns.enhanced-mode": ["fake-ip", "redir-host", "mapping"],
  "dns.fake-ip-filter-mode": ["blacklist", "whitelist", "rule"],
  "dns.cache-algorithm": ["lru", "arc"],
  "profile.store-selected": [true, false],
  "profile.store-fake-ip": [true, false],
  "tun.stack": ["system", "gvisor", "mixed"],
};

/** 同级属性排序（父 path，空串=顶层），对齐 Wiki 章节顺序 */
export const SIBLING_KEY_ORDER: Record<string, string[]> = {
  "": [
    "port",
    "socks-port",
    "mixed-port",
    "redir-port",
    "tproxy-port",
    "allow-lan",
    "bind-address",
    "authentication",
    "skip-auth-prefixes",
    "lan-allowed-ips",
    "lan-disallowed-ips",
    "find-process-mode",
    "mode",
    "log-level",
    "ipv6",
    "geox-url",
    "geo-auto-update",
    "geo-update-interval",
    "geosite-matcher",
    "geodata-mode",
    "geodata-loader",
    "global-ua",
    "etag-support",
    "tls",
    "external-controller",
    "external-controller-tls",
    "secret",
    "external-controller-cors",
    "external-controller-unix",
    "external-controller-pipe",
    "external-doh-server",
    "external-ui",
    "external-ui-name",
    "external-ui-url",
    "tcp-concurrent",
    "unified-delay",
    "interface-name",
    "routing-mark",
    "disable-keep-alive",
    "keep-alive-idle",
    "keep-alive-interval",
    "global-client-fingerprint",
    "profile",
    "hosts",
    "experimental",
    "tun",
    "sniffer",
    "dns",
    "ntp",
    "proxies",
    "proxy-groups",
    "proxy-providers",
    "rule-providers",
    "rules",
    "sub-rules",
    "listeners",
    "tunnels",
  ],
  dns: [
    "enable",
    "cache-algorithm",
    "prefer-h3",
    "use-hosts",
    "use-system-hosts",
    "respect-rules",
    "listen",
    "ipv6",
    "ipv6-timeout",
    "default-nameserver",
    "enhanced-mode",
    "fake-ip-range",
    "fake-ip-range6",
    "fake-ip-filter",
    "fake-ip-filter-mode",
    "fake-ip-ttl",
    "nameserver-policy",
    "nameserver",
    "fallback",
    "fallback-filter",
    "proxy-server-nameserver",
    "proxy-server-nameserver-policy",
    "direct-nameserver",
    "direct-nameserver-follow-policy",
  ],
  tun: [
    "enable",
    "device",
    "stack",
    "mtu",
    "gso",
    "gso-max-size",
    "dns-hijack",
    "auto-route",
    "auto-redirect",
    "auto-detect-interface",
    "strict-route",
    "endpoint-independent-nat",
    "inet6-address",
    "udp-timeout",
    "iproute2-table-index",
    "iproute2-rule-index",
    "route-address",
    "route-exclude-address",
    "route-address-set",
    "route-exclude-address-set",
  ],
  ntp: ["enable", "write-to-system", "server", "port", "interval"],
  sniffer: [
    "enable",
    "force-dns-mapping",
    "parse-pure-ip",
    "override-destination",
    "sniff",
    "force-domain",
    "skip-domain",
    "skip-src-address",
    "skip-dst-address",
  ],
  "external-controller-cors": ["allow-origins", "allow-private-network"],
  "dns.fallback-filter": ["geoip", "geoip-code", "geosite", "ipcidr", "domain"],
  profile: ["store-selected", "store-fake-ip"],
  tls: ["certificate", "private-key", "client-auth-type", "client-auth-cert", "ech-key", "custom-certifactes"],
  "geox-url": ["geoip", "geosite", "mmdb", "asn"],
};

/** 数组项必备字段（结构补全） */
export const ARRAY_ITEM_EXTRA_PROPS: Record<string, ConfigPropertySchema[]> = {
  proxies: [
    { key: "name", type: "string", default: "默认" },
    { key: "type", type: "string", default: "ss" },
    { key: "server", type: "string", default: "" },
    { key: "port", type: "number", default: 443, rules: PORT_RANGE_RULE },
    { key: "uuid", type: "string", default: "" },
    { key: "udp", type: "boolean", default: true },
  ],
  "proxy-groups": [
    { key: "name", type: "string", default: "默认" },
    { key: "type", type: "string", default: "select" },
    { key: "proxies", type: "array", items: { type: "string" }, default: [] },
  ],
};

export function rulesForPath(configPath: string): ConfigRule[] | undefined {
  if (PORT_PATH_SUFFIX.test(configPath)) return PORT_RANGE_RULE;
  return undefined;
}

export function sortSiblingProperties(
  parentPath: string,
  properties: ConfigPropertySchema[],
): ConfigPropertySchema[] {
  const order = SIBLING_KEY_ORDER[parentPath];
  if (!order?.length) return properties;
  const index = new Map(order.map((k, i) => [k, i]));
  return [...properties].sort((a, b) => {
    const keyA = a.key ?? "";
    const keyB = b.key ?? "";
    const ia = index.get(keyA);
    const ib = index.get(keyB);
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    return keyA.localeCompare(keyB);
  });
}
