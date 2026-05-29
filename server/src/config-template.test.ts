import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfigTemplateYaml } from "./config-template.js";

describe("loadConfigTemplateYaml", () => {
  let tmpDir = "";

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = "";
    }
  });

  it("loads template from workspace data dir", () => {
    const yaml = loadConfigTemplateYaml(process.cwd());
    expect(yaml).toContain("mixed-port");
  });

  it("throws when template file is missing", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cconfig-template-"));
    expect(() => loadConfigTemplateYaml(tmpDir)).toThrow("config template not found");
  });
});
