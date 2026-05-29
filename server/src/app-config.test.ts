import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isOidcEnabledEnv, loadAppConfig } from "./app-config.js";

describe("loadAppConfig", () => {
  let tmpDir = "";

  afterEach(() => {
    delete process.env.CCONFIG_OIDC_ENABLED;
    delete process.env.CCONFIG_CONFIG_DIR;
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = "";
    }
  });

  it("disables OIDC by default", () => {
    expect(isOidcEnabledEnv()).toBe(false);
    expect(loadAppConfig()).toEqual({ oidcEnabled: false, oidc: null });
  });

  it("loads oidc from config.yaml when CCONFIG_OIDC_ENABLED=true", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cconfig-config-"));
    fs.writeFileSync(
      path.join(tmpDir, "config.yaml"),
      `oidc:
  issuer: "https://idp.example.com"
  clientId: "my-client"
  clientSecret: "secret"
  redirectUri: ""
  scope: "openid profile email"
  preferredUsernameWhitelist:
    - "alice"
`,
      "utf8",
    );
    process.env.CCONFIG_CONFIG_DIR = tmpDir;
    process.env.CCONFIG_OIDC_ENABLED = "true";
    expect(loadAppConfig()).toEqual({
      oidcEnabled: true,
      oidc: {
        issuer: "https://idp.example.com",
        clientId: "my-client",
        clientSecret: "secret",
        redirectUri: "",
        scope: "openid profile email",
        preferredUsernameWhitelist: ["alice"],
      },
    });
  });

  it("falls back to disabled when CCONFIG_OIDC_ENABLED but config file missing", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cconfig-config-"));
    process.env.CCONFIG_CONFIG_DIR = tmpDir;
    process.env.CCONFIG_OIDC_ENABLED = "true";
    expect(loadAppConfig()).toEqual({ oidcEnabled: false, oidc: null });
  });

  it("falls back to disabled when oidc config is incomplete", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cconfig-config-"));
    fs.writeFileSync(
      path.join(tmpDir, "config.yaml"),
      `oidc:
  issuer: "https://idp.example.com"
  clientId: "my-client"
`,
      "utf8",
    );
    process.env.CCONFIG_CONFIG_DIR = tmpDir;
    process.env.CCONFIG_OIDC_ENABLED = "true";
    expect(loadAppConfig()).toEqual({ oidcEnabled: false, oidc: null });
  });

  it("falls back to disabled when config.yaml has no oidc section", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cconfig-config-"));
    fs.writeFileSync(path.join(tmpDir, "config.yaml"), "port: 7890\n", "utf8");
    process.env.CCONFIG_CONFIG_DIR = tmpDir;
    process.env.CCONFIG_OIDC_ENABLED = "true";
    expect(loadAppConfig()).toEqual({ oidcEnabled: false, oidc: null });
  });

  it("falls back to disabled when config.yaml is invalid", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cconfig-config-"));
    fs.writeFileSync(path.join(tmpDir, "config.yaml"), "oidc: [\n", "utf8");
    process.env.CCONFIG_CONFIG_DIR = tmpDir;
    process.env.CCONFIG_OIDC_ENABLED = "true";
    expect(loadAppConfig()).toEqual({ oidcEnabled: false, oidc: null });
  });

  it.each(["true", "1", "yes"])("enables OIDC when CCONFIG_OIDC_ENABLED=%s", (value) => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cconfig-config-"));
    fs.writeFileSync(
      path.join(tmpDir, "config.yaml"),
      `oidc:
  issuer: "https://idp.example.com"
  clientId: "c"
  clientSecret: "s"
  redirectUri: ""
  preferredUsernameWhitelist:
    - "u"
`,
      "utf8",
    );
    process.env.CCONFIG_CONFIG_DIR = tmpDir;
    process.env.CCONFIG_OIDC_ENABLED = value;
    expect(loadAppConfig().oidcEnabled).toBe(true);
  });
});
