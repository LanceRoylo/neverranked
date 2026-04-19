/**
 * Dashboard -- Structured logging
 *
 * Pragmatic middle ground: don't refactor every existing console.log
 * (~hundreds of call sites, low marginal value at current scale).
 * Instead, add a request-level structured access log that captures
 * what matters when debugging: when, who, what, how long, what came back.
 *
 * Output is one JSON line per log call, parseable by wrangler tail
 * piped to jq, and by Logpush if/when we add it.
 *
 * Usage in the main fetch handler:
 *   const reqLog = startRequestLog(request);
 *   ... handle request ...
 *   reqLog.finish(response, { user_id, ... });
 */

export interface LogContext {
  [key: string]: string | number | boolean | null | undefined;
}

function emit(level: "info" | "warn" | "error", msg: string, ctx?: LogContext): void {
  // One JSON line. Workers' console.log preserves these end-to-end into
  // wrangler tail and Logpush.
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...ctx,
  };
  // Strip undefined values so the JSON stays clean.
  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) delete payload[k];
  }
  // Use console.error for errors so wrangler tail color-codes them.
  if (level === "error") console.error(JSON.stringify(payload));
  else console.log(JSON.stringify(payload));
}

export const log = {
  info: (msg: string, ctx?: LogContext) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => emit("error", msg, ctx),
};

// ---------------------------------------------------------------------------
// Per-request access log
// ---------------------------------------------------------------------------

function shortId(): string {
  // 8-char base36 from 6 random bytes is plenty for log correlation
  // (collision over a single request lifetime is effectively zero).
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  let n = 0;
  for (const b of buf) n = (n * 256 + b) >>> 0;
  return n.toString(36).slice(0, 8);
}

export interface RequestLog {
  /** correlation ID, suitable for echoing in response headers */
  id: string;
  /** finalize -- call once after the response is computed */
  finish(response: Response, extra?: LogContext): void;
}

export function startRequestLog(request: Request): RequestLog {
  const id = shortId();
  const start = Date.now();
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname;
  const ip = request.headers.get("CF-Connecting-IP") || null;
  const country = request.headers.get("CF-IPCountry") || null;
  const ua = request.headers.get("User-Agent") || null;

  return {
    id,
    finish(response: Response, extra?: LogContext) {
      const duration_ms = Date.now() - start;
      const status = response.status;
      // 4xx warn, 5xx error, everything else info. Keeps the log
      // grep-able by level when something's actually wrong.
      const level: "info" | "warn" | "error" =
        status >= 500 ? "error" : status >= 400 ? "warn" : "info";
      emit(level, "request", {
        req_id: id,
        method,
        path,
        status,
        duration_ms,
        country,
        // Truncate UA to keep the line readable; full UA rarely matters.
        ua: ua ? ua.slice(0, 120) : undefined,
        // Don't log full IPs by default (privacy + log size). Only the
        // first two octets of v4 / first 4 hex chars of v6.
        ip_prefix: ip
          ? (ip.includes(":")
              ? ip.split(":").slice(0, 2).join(":")
              : ip.split(".").slice(0, 2).join("."))
          : undefined,
        ...extra,
      });
    },
  };
}
