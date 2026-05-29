import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigSource } from "./types.js";

describe("source-service", () => {
  let tmpDir = "";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cconfig-source-"));
    process.env.CCONFIG_DATA_DIR = tmpDir;
  });

  afterEach(() => {
    delete process.env.CCONFIG_DATA_DIR;
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = "";
    }
    vi.restoreAllMocks();
  });

  it("upsertSourceContent writes yaml to sources dir", async () => {
    const { upsertSourceContent } = await import("./source-service.js");
    const source: ConfigSource = {
      id: "src-1",
      name: "local",
      kind: "upload",
      updateIntervalSeconds: 0,
    };
    const updated = upsertSourceContent(source, "port: 7890\n");
    expect(updated.cachedYaml).toBe("port: 7890\n");
    expect(updated.filePath).toBeTruthy();
    expect(fs.readFileSync(updated.filePath!, "utf8")).toBe("port: 7890\n");
  });

  it("refreshSource for upload uses cachedYaml when present", async () => {
    const { refreshSource } = await import("./source-service.js");
    const source: ConfigSource = {
      id: "src-2",
      name: "cached",
      kind: "upload",
      updateIntervalSeconds: 0,
      cachedYaml: "mode: rule\n",
    };
    const refreshed = await refreshSource(source);
    expect(refreshed.cachedYaml).toBe("mode: rule\n");
    expect(refreshed.filePath).toBeTruthy();
    expect(fs.existsSync(refreshed.filePath!)).toBe(true);
  });

  it("refreshHttpDraft decodes base64 yaml payloads", async () => {
    const { refreshHttpDraft } = await import("./source-service.js");
    const yaml = "port: 7890\nmode: rule\n";
    const encoded = Buffer.from(yaml, "utf8").toString("base64");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => encoded,
      })),
    );

    const result = await refreshHttpDraft("https://example.com/sub.yaml");
    expect(result.yaml).toBe(yaml);
    expect(result.lastFetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("refreshHttpDraft throws on non-ok response", async () => {
    const { refreshHttpDraft } = await import("./source-service.js");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        text: async () => "not found",
      })),
    );

    await expect(refreshHttpDraft("https://example.com/missing.yaml")).rejects.toThrow(
      "fetch source failed: 404",
    );
  });

  it("refreshSource for http handles 304 not modified", async () => {
    const { refreshSource } = await import("./source-service.js");
    const source: ConfigSource = {
      id: "src-http",
      name: "remote",
      kind: "http",
      url: "https://example.com/config.yaml",
      updateIntervalSeconds: 300,
      cachedYaml: "mode: global\n",
      etag: '"v1"',
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 304,
        text: async () => "",
        headers: {
          get: () => null,
        },
      })),
    );

    const refreshed = await refreshSource(source);
    expect(refreshed).toBe(source);
  });

  it("refreshSource for http fetches and writes yaml", async () => {
    const { refreshSource } = await import("./source-service.js");
    const yaml = "port: 7890\nmode: rule\n";
    const source: ConfigSource = {
      id: "src-http-2",
      name: "remote",
      kind: "http",
      url: "https://example.com/config.yaml",
      updateIntervalSeconds: 300,
      etag: '"v0"',
      lastModified: "Mon, 01 Jan 2024 00:00:00 GMT",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        expect(init?.headers).toMatchObject({
          "User-Agent": expect.stringContaining("ClashX Meta"),
          "If-None-Match": '"v0"',
          "If-Modified-Since": "Mon, 01 Jan 2024 00:00:00 GMT",
        });
        return {
          ok: true,
          status: 200,
          text: async () => yaml,
          headers: {
            get: (name: string) =>
              name === "etag" ? '"v1"' : name === "last-modified" ? "Tue, 02 Jan 2024 00:00:00 GMT" : null,
          },
        };
      }),
    );

    const refreshed = await refreshSource(source);
    expect(refreshed.cachedYaml).toBe(yaml);
    expect(refreshed.etag).toBe('"v1"');
    expect(refreshed.lastModified).toBe("Tue, 02 Jan 2024 00:00:00 GMT");
    expect(fs.readFileSync(refreshed.filePath!, "utf8")).toBe(yaml);
  });

  it("refreshSource for http throws on fetch failure", async () => {
    const { refreshSource } = await import("./source-service.js");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => "error",
        headers: { get: () => null },
      })),
    );

    await expect(
      refreshSource({
        id: "src-http-3",
        name: "remote",
        kind: "http",
        url: "https://example.com/bad.yaml",
        updateIntervalSeconds: 0,
      }),
    ).rejects.toThrow("fetch source failed: 500");
  });

  it("refreshSource reads existing file when no cachedYaml", async () => {
    const { refreshSource } = await import("./source-service.js");
    const filePath = path.join(tmpDir, "sources", "local.yaml");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "mode: direct\n", "utf8");

    const refreshed = await refreshSource({
      id: "src-file",
      name: "local",
      kind: "upload",
      updateIntervalSeconds: 0,
      filePath,
    });
    expect(refreshed.cachedYaml).toBe("mode: direct\n");
  });

  it("refreshHttpDraft decodes data URL base64 payloads", async () => {
    const { refreshHttpDraft } = await import("./source-service.js");
    const yaml = "port: 7890\n";
    const encoded = Buffer.from(yaml, "utf8").toString("base64");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => `data:text/yaml;base64,${encoded}`,
      })),
    );

    const result = await refreshHttpDraft("https://example.com/data-url.yaml");
    expect(result.yaml).toBe(yaml);
  });

  it("refreshHttpDraft leaves plain text unchanged", async () => {
    const { refreshHttpDraft } = await import("./source-service.js");
    const plain = "not-base64-content";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => plain,
      })),
    );

    const result = await refreshHttpDraft("https://example.com/plain.txt");
    expect(result.yaml).toBe(plain);
  });
});
