import type { Request, Response } from "express";

const BROWSER_UA =
  /Mozilla\/5\.0.*(?:Chrome|CriOS|Chromium|Safari|Firefox|FxiOS|Edg|OPR|Opera)/i;
const NON_BROWSER_UA =
  /curl|wget|httpie|Go-http-client|okhttp|clash|subconverter|postman|insomnia|axios|node-fetch|undici/i;

export function isBrowserUserAgent(userAgent: string | undefined): boolean {
  const ua = (userAgent ?? "").trim();
  if (!ua) return false;
  if (NON_BROWSER_UA.test(ua)) return false;
  return BROWSER_UA.test(ua);
}

export function sendOutputYaml(res: Response, req: Request, yaml: string): void {
  if (isBrowserUserAgent(req.get("user-agent"))) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", "inline");
  } else {
    res.type("application/yaml");
  }
  res.send(yaml);
}
