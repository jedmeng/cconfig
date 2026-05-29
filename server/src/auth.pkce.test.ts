import crypto from "node:crypto";
import { describe, expect, it } from "vitest";

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

describe("PKCE S256", () => {
  it("produces a challenge that verifies against the verifier", () => {
    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);
    expect(challenge).toBe(
      crypto.createHash("sha256").update(verifier).digest("base64url"),
    );
    expect(verifier.length).toBeGreaterThanOrEqual(43);
  });
});
