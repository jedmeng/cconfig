import { describe, expect, it } from "vitest";
import { avatarUrlForUser, gravatarUrl } from "./avatar.js";

describe("avatarUrlForUser", () => {
  it("builds gravatar url from email", () => {
    const url = gravatarUrl("test@example.com");
    expect(url).toContain("gravatar.com/avatar/");
    expect(url).toContain("d=identicon");
  });

  it("falls back to username seed", () => {
    const url = avatarUrlForUser(undefined, "alice");
    expect(url).toContain("gravatar.com/avatar/");
  });
});
