const PREFIX = "[cconfig]";

function formatMeta(meta?: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) return "";
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return "";
  }
}

function isDebugEnabled(): boolean {
  return process.env.CCONFIG_LOG_DEBUG === "1" || process.env.CCONFIG_LOG_DEBUG === "true";
}

export const log = {
  info(message: string, meta?: Record<string, unknown>): void {
    console.log(`${PREFIX} ${message}${formatMeta(meta)}`);
  },

  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(`${PREFIX} ${message}${formatMeta(meta)}`);
  },

  error(message: string, err?: unknown, meta?: Record<string, unknown>): void {
    const errPart =
      err instanceof Error ? ` ${err.message}` : err != null ? ` ${String(err)}` : "";
    console.error(`${PREFIX} ${message}${errPart}${formatMeta(meta)}`);
    if (err instanceof Error && err.stack && isDebugEnabled()) {
      console.error(err.stack);
    }
  },

  debug(message: string, meta?: Record<string, unknown>): void {
    if (!isDebugEnabled()) return;
    console.log(`${PREFIX} [debug] ${message}${formatMeta(meta)}`);
  },
};
