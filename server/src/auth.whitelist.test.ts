import { describe, expect, it } from "vitest";

function whitelistCandidates(payload: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const add = (value: unknown) => {
    const text = String(value ?? "").trim();
    if (text) out.add(text);
  };
  add(payload.preferred_username);
  add(payload.email);
  add(payload.sub);
  add(payload.name);
  const email = String(payload.email ?? "").trim();
  if (email.includes("@")) add(email.split("@")[0]);
  return [...out];
}

describe("whitelistCandidates", () => {
  it("matches email local-part against whitelist", () => {
    const candidates = whitelistCandidates({
      sub: "uuid",
      email: "alice@example.com",
    });
    expect(candidates).toContain("alice");
    expect(candidates).toContain("alice@example.com");
  });

  it("includes sub when only uuid is present", () => {
    const candidates = whitelistCandidates({ sub: "53bd9654-3cd9-4577-bc36-897cbe4be38e" });
    expect(candidates).toEqual(["53bd9654-3cd9-4577-bc36-897cbe4be38e"]);
  });
});
