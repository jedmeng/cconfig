/** 与 vite.config 中 base / 反向代理子路径一致 */
export function getAppBasePath(): string {
  const base = import.meta.env.BASE_URL ?? "/";
  if (base === "/" || base === "") return "";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

export function apiUrl(path: string): string {
  const base = getAppBasePath();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}
