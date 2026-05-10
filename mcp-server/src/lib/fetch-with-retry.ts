/**
 * fetch-with-retry — small helper used by every tool to:
 *   1. Retry once on transient 5xx with 1s backoff (most outages are <1s)
 *   2. Translate HTTP errors into MCP-friendly messages instead of
 *      raw `HTTP 422 Unprocessable Entity`
 *   3. Log to stderr (stdout is reserved for JSON-RPC) so operators
 *      can debug via wrangler-tail equivalents
 *
 * The output to the LLM should never be a panic-shaped error.
 * Surface the cause AND the suggested next step.
 */

interface Options {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

interface RetryConfig {
  toolName: string;
  /** What kind of resource was requested, used in error messages.
   *  e.g. "AEO scan", "llms.txt fetch", "agent-readiness scrape" */
  operation: string;
  /** What URL/target the user is asking about, used in messages. */
  target: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

function logErr(...parts: unknown[]) {
  // stderr only — stdout is reserved for the MCP JSON-RPC stream
  console.error("[neverranked/mcp]", ...parts);
}

async function attempt(url: string, opts: Options): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: opts.method ?? "GET",
      headers: opts.headers,
      body: opts.body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchWithRetry(url: string, opts: Options, cfg: RetryConfig): Promise<Response> {
  let res: Response;
  try {
    res = await attempt(url, opts);
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    const msg = isAbort
      ? `${cfg.operation} timed out after ${(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS) / 1000}s. The target server (${url}) did not respond. Retry, or try a different URL.`
      : `${cfg.operation} could not reach the target server. Network error: ${err instanceof Error ? err.message : String(err)}. Retry in a moment, or check that ${url} is reachable.`;
    logErr(cfg.toolName, "network-error", url, err);
    throw new Error(msg);
  }

  // Retry once on transient 5xx
  if (res.status >= 500 && res.status < 600) {
    logErr(cfg.toolName, "5xx-retry", url, res.status);
    await new Promise((r) => setTimeout(r, 1000));
    try {
      res = await attempt(url, opts);
    } catch (err) {
      const msg = `${cfg.operation} server returned ${res.status} on first try and the retry failed with a network error. The target server (${url}) appears to be down. Try again in a few minutes.`;
      logErr(cfg.toolName, "5xx-retry-network-error", url, err);
      throw new Error(msg);
    }
  }

  // Translate common HTTP errors into MCP-friendly messages
  if (!res.ok) {
    let bodyHint = "";
    try {
      const txt = await res.clone().text();
      if (txt && txt.length < 400) bodyHint = ` Server said: "${txt.trim()}".`;
    } catch {}

    let msg: string;
    if (res.status === 422) {
      msg = `${cfg.operation} could not process the URL "${cfg.target}". The scanner refused to score it (HTTP 422). This usually means the URL is in an exclusion list (e.g., the scanner's own marketing site) or the URL is malformed. Try a different public website URL.${bodyHint}`;
    } else if (res.status === 429) {
      msg = `${cfg.operation} hit a rate limit (HTTP 429). Wait a minute and retry, or contact lance@neverranked.com for an API key if your agent runs at high volume.`;
    } else if (res.status === 404) {
      msg = `${cfg.operation} returned 404 for "${cfg.target}". The endpoint or the target URL was not found.${bodyHint}`;
    } else if (res.status === 403) {
      msg = `${cfg.operation} was forbidden (HTTP 403). The target ${cfg.target} may be blocking automated requests, or the scanner's user-agent is rejected.`;
    } else if (res.status === 400) {
      msg = `${cfg.operation} rejected the request (HTTP 400). The URL "${cfg.target}" may be malformed. Include the protocol (https://) and a valid hostname.${bodyHint}`;
    } else {
      msg = `${cfg.operation} failed with HTTP ${res.status} ${res.statusText}. Target: ${cfg.target}.${bodyHint}`;
    }

    logErr(cfg.toolName, "http-error", url, res.status, res.statusText);
    throw new Error(msg);
  }

  return res;
}
