import crypto from "node:crypto";

export function gravatarUrl(seed: string, size = 80): string {
  const hash = crypto.createHash("md5").update(seed.trim().toLowerCase()).digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon&r=g`;
}

export function avatarUrlForUser(email?: string, username?: string): string {
  const seed = email?.trim() || username?.trim() || "unknown";
  return gravatarUrl(seed, 80);
}
