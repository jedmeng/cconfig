import { comparePathsByOrder } from "./config-key-order.js";
import type { ConfigPathMeta } from "./types.js";

/** Sort flattened catalog items by explicit schema order. */
export function sortConfigPathMeta(items: ConfigPathMeta[], order: string[]): ConfigPathMeta[] {
  return [...items].sort((a, b) => comparePathsByOrder(order, a.path, b.path));
}
