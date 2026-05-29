import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureRuntimeDirs,
  getConfigDir,
  getConfigFilePath,
  getDataDir,
  getProjectRoot,
  getSourcesDir,
  getStateFilePath,
  getWebDistPath,
} from "./runtime-config.js";

describe("runtime-config", () => {
  let tmpDir = "";

  afterEach(() => {
    delete process.env.CCONFIG_DATA_DIR;
    delete process.env.CCONFIG_CONFIG_DIR;
    delete process.env.WEB_DIST;
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = "";
    }
  });

  it("getProjectRoot resolves parent of server cwd", () => {
    expect(getProjectRoot()).toBe(path.resolve(process.cwd(), ".."));
  });

  it("getDataDir and getConfigDir honor env overrides", () => {
    process.env.CCONFIG_DATA_DIR = "/tmp/cconfig-data";
    process.env.CCONFIG_CONFIG_DIR = "/tmp/cconfig-config";
    expect(getDataDir()).toBe(path.resolve("/tmp/cconfig-data"));
    expect(getConfigDir()).toBe(path.resolve("/tmp/cconfig-config"));
    expect(getStateFilePath()).toBe(path.join(path.resolve("/tmp/cconfig-data"), "state.json"));
    expect(getSourcesDir()).toBe(path.join(path.resolve("/tmp/cconfig-data"), "sources"));
    expect(getConfigFilePath()).toBe(path.join(path.resolve("/tmp/cconfig-config"), "config.yaml"));
  });

  it("getWebDistPath prefers WEB_DIST env", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cconfig-web-"));
    process.env.WEB_DIST = tmpDir;
    expect(getWebDistPath()).toBe(path.resolve(tmpDir));
  });

  it("ensureRuntimeDirs creates runtime directories", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cconfig-runtime-"));
    process.env.CCONFIG_DATA_DIR = tmpDir;
    process.env.CCONFIG_CONFIG_DIR = tmpDir;
    ensureRuntimeDirs();
    expect(fs.existsSync(getSourcesDir())).toBe(true);
    expect(fs.existsSync(getConfigDir())).toBe(true);
    expect(fs.existsSync(path.dirname(getStateFilePath()))).toBe(true);
  });
});
