import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("store persistence", () => {
  let tmpDir = "";
  let prevNodeEnv: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cconfig-store-"));
    process.env.CCONFIG_DATA_DIR = tmpDir;
    prevNodeEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    delete process.env.CCONFIG_DATA_DIR;
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = "";
    }
  });

  it("loadStoreFromDisk migrates legacy file sources", async () => {
    const statePath = path.join(tmpDir, "state.json");
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        sources: [
          {
            id: "s1",
            name: "legacy",
            kind: "file",
            updateIntervalMinutes: 5,
          },
        ],
        modifiers: [],
        schemes: [],
      }),
      "utf8",
    );

    const { loadStoreFromDisk, store } = await import("./store.js");
    loadStoreFromDisk();
    expect(store.sources).toHaveLength(1);
    expect(store.sources[0]?.kind).toBe("upload");
    expect(store.sources[0]?.updateIntervalSeconds).toBe(300);
  });

  it("persistStoreToDisk writes sources modifiers and schemes", async () => {
    const { persistStoreToDisk, store } = await import("./store.js");
    store.sources = [
      {
        id: "s1",
        name: "local",
        kind: "upload",
        updateIntervalSeconds: 0,
      },
    ];
    store.modifiers = [];
    store.schemes = [];

    persistStoreToDisk();
    const saved = JSON.parse(fs.readFileSync(path.join(tmpDir, "state.json"), "utf8"));
    expect(saved.sources).toHaveLength(1);
    expect(saved.modifiers).toEqual([]);
    expect(saved.schemes).toEqual([]);
  });

  it("loadStoreFromDisk tolerates corrupted state file", async () => {
    fs.writeFileSync(path.join(tmpDir, "state.json"), "{not-json", "utf8");
    const { loadStoreFromDisk, store } = await import("./store.js");
    store.sources = [
      {
        id: "keep",
        name: "keep",
        kind: "upload",
        updateIntervalSeconds: 0,
      },
    ];
    loadStoreFromDisk();
    expect(store.sources[0]?.id).toBe("keep");
  });

  it("loadConfig refreshes oidc settings from app config", async () => {
    const { loadConfig, store } = await import("./store.js");
    store.oidcEnabled = true;
    store.oidc = {
      issuer: "https://old.example.com",
      clientId: "old",
      clientSecret: "old",
      redirectUri: "",
      preferredUsernameWhitelist: ["old"],
    };
    loadConfig();
    expect(store.oidcEnabled).toBe(false);
    expect(store.oidc).toBeNull();
  });
});
