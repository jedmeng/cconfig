import { describe, expect, it } from "vitest";
import { loadConfigItemCatalog } from "./config-catalog.js";

describe("config yaml supplement", () => {
  it("includes wiki stub paths in catalog", () => {
    const paths = new Set(loadConfigItemCatalog(process.cwd()).map((i) => i.path));
    expect(paths.has("allow-lan")).toBe(true);
    expect(paths.has("bind-address")).toBe(true);
    expect(paths.has("port")).toBe(true);
    expect(paths.has("socks-port")).toBe(true);
    expect(paths.has("secret")).toBe(true);
    expect(paths.has("geodata-mode")).toBe(true);
    expect(paths.has("tcp-concurrent")).toBe(true);
    expect(paths.has("tun.auto-route")).toBe(true);
  });

  it("has substantially more items than parsed demo yaml alone", () => {
    const items = loadConfigItemCatalog(process.cwd());
    expect(items.length).toBeGreaterThan(200);
  });
});
