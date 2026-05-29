import { describe, expect, it } from "vitest";
import { loadConfigDescriptions } from "./config-descriptions.js";

describe("config descriptions", () => {
  it("loads wiki descriptions for catalog paths", () => {
    const map = loadConfigDescriptions(process.cwd());
    expect(map.get("mixed-port")).toMatch(/混合代理端口/);
    expect(map.get("allow-lan")).toMatch(/局域网/);
    expect(map.get("external-ui-url")).toBe("自定义外部用户界面下载地址");
    expect(map.get("dns.enable")).toMatch(/内置 DNS/);
  });
});
