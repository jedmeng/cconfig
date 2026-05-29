import { apiUrl } from "./api-base";

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(apiUrl(url), {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || `HTTP ${resp.status}`);
  }
  return (await resp.json()) as T;
}
