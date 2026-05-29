/** 与 server config-key-order.comparePathsByOrder 一致 */
export function comparePathsByOrder(pathOrder: string[], a: string, b: string): number {
  const index = new Map(pathOrder.map((p, i) => [p, i]));
  const ia = index.get(a);
  const ib = index.get(b);
  if (ia !== undefined && ib !== undefined) return ia - ib;
  if (ia !== undefined) return -1;
  if (ib !== undefined) return 1;
  return a.localeCompare(b);
}
