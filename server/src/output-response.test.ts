import { describe, expect, it } from "vitest";
import { isBrowserUserAgent } from "./output-response.js";

describe("isBrowserUserAgent", () => {
  it("detects common desktop browsers", () => {
    expect(
      isBrowserUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ),
    ).toBe(true);
    expect(
      isBrowserUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      ),
    ).toBe(true);
    expect(isBrowserUserAgent("Mozilla/5.0 (Windows NT 10.0; rv:121.0) Gecko/20100101 Firefox/121.0")).toBe(
      true,
    );
  });

  it("treats proxy clients and CLI tools as non-browser", () => {
    expect(isBrowserUserAgent("curl/8.4.0")).toBe(false);
    expect(isBrowserUserAgent("Go-http-client/1.1")).toBe(false);
    expect(isBrowserUserAgent("clash.meta/1.18.0")).toBe(false);
    expect(isBrowserUserAgent("mihomo/v1.18.0")).toBe(false);
    expect(isBrowserUserAgent("")).toBe(false);
  });
});
