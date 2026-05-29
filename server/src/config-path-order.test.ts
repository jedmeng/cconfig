import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfigItemCatalog } from "./config-catalog.js";
import { loadConfigPathOrder } from "./config-catalog.js";
import { buildDefaultEditorClassCode } from "./modifier-codegen.js";

describe("config path order", () => {
  it("orders catalog items by schema path order", () => {
    const order = loadConfigPathOrder(process.cwd());
    const items = loadConfigItemCatalog(process.cwd());
    const paths = items.map((i) => i.path);

    expect(order.indexOf("port")).toBeLessThan(order.indexOf("mixed-port"));
    expect(order.indexOf("mixed-port")).toBeLessThan(order.indexOf("allow-lan"));
    expect(order.indexOf("allow-lan")).toBeLessThan(order.indexOf("dns"));
    expect(order.indexOf("tun")).toBeLessThan(order.indexOf("sniffer"));
    expect(order.indexOf("sniffer")).toBeLessThan(order.indexOf("dns"));
    expect(order.indexOf("dns")).toBeLessThan(order.indexOf("proxies"));
    expect(order.indexOf("proxies")).toBeLessThan(order.indexOf("rules"));

    expect(paths.indexOf("mixed-port")).toBeLessThan(paths.indexOf("allow-lan"));
    expect(paths.indexOf("dns.enable")).toBeLessThan(paths.indexOf("proxies"));
    expect(paths.indexOf("rules")).toBeGreaterThan(paths.indexOf("proxy-groups"));
  });

  it("keeps default class method stubs in catalog order", () => {
    const order = loadConfigPathOrder(process.cwd());
    const items = loadConfigItemCatalog(process.cwd());
    const code = buildDefaultEditorClassCode(items, order);
    const methodOrder = [...code.matchAll(/\/\/ (get[A-Za-z0-9]+)\(/g)].map((m) => m[1]);
    expect(methodOrder.indexOf("getPort")).toBeLessThan(methodOrder.indexOf("getAllowLan"));
    expect(methodOrder.indexOf("getAllowLan")).toBeLessThan(methodOrder.indexOf("getDnsEnable"));
    expect(methodOrder.indexOf("getDnsEnable")).toBeLessThan(methodOrder.indexOf("getRules"));
  });
});
