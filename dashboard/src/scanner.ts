/**
 * Dashboard — Domain scanner (wraps shared aeo-analyzer)
 */

import type { Env, ScanResult, Domain } from "./types";
import { buildReport } from "../../packages/aeo-analyzer/src";
import type { Report } from "../../packages/aeo-analyzer/src";
import { autoVerifyRoadmap } from "./auto-roadmap";

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 NeverRanked-AEO-Monitor/1.0";

// Inline retry backoff for transient fetch failures. Most scan failures
// are 5xx or temporary DNS blips -- retrying a few times with small waits
// catches ~80% of them without needing a separate retry queue.
// Hard timeout per attempt is still 10s, so worst-case three attempts =
// ~50s including the waits.
const SCAN_RETRY_WAITS_MS = [5_000, 15_000];

// Cloudflare intra-zone loopback workaround: when a Worker fetches a
// domain served by another Worker in the same CF account, the fetch can
// be short-circuited through internal routing which occasionally fails
// in the scheduled-event context while working fine in request context.
// DB evidence: 100% cron failures vs 100% manual success on
// neverranked.com. For these known loopback domains, fetching via the
// workers.dev subdomain bypasses the zone routing and the fetch works
// reliably from any context. The marketing Worker serves both URLs
// identically so the scanned HTML is the same.
const CF_LOOPBACK_FALLBACK: Record<string, string> = {
  "neverranked.com": "https://neverranked.lanceroylo.workers.dev",
  "www.neverranked.com": "https://neverranked.lanceroylo.workers.dev",
};

function loopbackFallbackUrl(originalUrl: string): string | null {
  try {
    const u = new URL(originalUrl);
    const base = CF_LOOPBACK_FALLBACK[u.hostname];
    if (!base) return null;
    return base + u.pathname + u.search;
  } catch {
    return null;
  }
}

/**
 * Attempt a single scan. `fetchUrl` is what we hit over the wire;
 * `reportUrl` is the canonical URL recorded in signals and derived
 * references. They're the same in the normal path; they diverge only
 * when the loopback fallback is in play (fetch workers.dev, report as
 * the public custom domain).
 */
async function attemptScan(fetchUrl: string, reportUrl: string = fetchUrl): Promise<{ report: Report | null; error: string | null }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const resp = await fetch(fetchUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      return { report: null, error: `HTTP ${resp.status}` };
    }
    const html = await resp.text();
    return { report: buildReport(reportUrl, html), error: null };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return { report: null, error: "Timeout (10s)" };
    }
    // Capture the real error name + message instead of a generic
    // "Could not reach site". This is how we tell DNS failures apart
    // from TLS failures, connect-refused, Cloudflare intra-zone
    // loopback issues, etc. -- otherwise every network-layer problem
    // collapses to the same unhelpful string and we can't debug it.
    const detail = err instanceof Error
      ? `${err.name}: ${err.message}`
      : String(err);
    console.error(`[scanner] fetch failed for ${fetchUrl}: ${detail}`);
    return { report: null, error: `Network: ${detail}` };
  }
}

// Treat 5xx, timeouts, and network-layer failures as retryable. 4xx,
// robots.txt blocks, and permanent issues are NOT retryable -- we'd
// just hammer them.
function isRetryableError(error: string | null): boolean {
  if (!error) return false;
  if (error.startsWith("Timeout")) return true;
  if (error.startsWith("Network:")) return true;
  const m = error.match(/^HTTP (\d+)$/);
  if (m) {
    const code = Number(m[1]);
    return code >= 500 || code === 429; // server errors + rate-limit
  }
  return false;
}

export async function scanDomain(
  domainId: number,
  url: string,
  scanType: "cron" | "manual" | "onboard",
  env: Env
): Promise<ScanResult | null> {
  const now = Math.floor(Date.now() / 1000);
  let report: Report | null = null;
  let error: string | null = null;
  let attempts = 0;

  // First attempt + up to 2 retries on transient failures.
  const maxAttempts = 1 + SCAN_RETRY_WAITS_MS.length;
  for (let i = 0; i < maxAttempts; i++) {
    attempts = i + 1;
    const result = await attemptScan(url);
    report = result.report;
    error = result.error;
    if (!error || !isRetryableError(error)) break;
    if (i < SCAN_RETRY_WAITS_MS.length) {
      await new Promise((r) => setTimeout(r, SCAN_RETRY_WAITS_MS[i]));
    }
  }

  // Last-resort loopback fallback: if the domain is one we know is
  // served by a Worker in our own CF account AND all attempts failed
  // with network-layer errors, try once via the workers.dev subdomain.
  // That URL bypasses the zone routing that causes the short-circuit
  // loopback failure in the scheduled-event context.
  if (error && error.startsWith("Network:")) {
    const fallbackUrl = loopbackFallbackUrl(url);
    if (fallbackUrl) {
      console.warn(`[scanner] ${url} failed with ${error}, trying loopback fallback: ${fallbackUrl}`);
      // Fetch via workers.dev but keep canonical URL in the report so
      // signals (canonical tags, base URLs, etc.) reference the public
      // site, not the internal loopback address.
      const fallback = await attemptScan(fallbackUrl, url);
      if (!fallback.error) {
        report = fallback.report;
        error = null;
        attempts = attempts + 1;
        console.log(`[scanner] ${url} recovered via workers.dev fallback`);
      }
    }
  }

  if (attempts > 1) {
    console.log(`[scanner] ${url} settled after ${attempts} attempt(s)${error ? ` with error: ${error}` : " (succeeded on retry)"}`);
  }

  const result = {
    domain_id: domainId,
    url,
    aeo_score: report ? report.aeo_score : 0,
    grade: report ? report.grade : "?",
    schema_types: JSON.stringify(report ? report.signals.schema_types : []),
    red_flags: JSON.stringify(report ? report.red_flags : []),
    technical_signals: JSON.stringify(report ? report.technical_signals : []),
    schema_coverage: JSON.stringify(report ? report.schema_coverage : []),
    signals_json: JSON.stringify(report ? report.signals : {}),
    scan_type: scanType,
    error,
    scanned_at: now,
  };

  const stmt = await env.DB.prepare(
    `INSERT INTO scan_results (domain_id, url, aeo_score, grade, schema_types, red_flags, technical_signals, schema_coverage, signals_json, scan_type, error, scanned_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    result.domain_id, result.url, result.aeo_score, result.grade,
    result.schema_types, result.red_flags, result.technical_signals,
    result.schema_coverage, result.signals_json, result.scan_type,
    result.error, result.scanned_at
  ).run();

  const id = stmt.meta?.last_row_id ?? 0;
  const scanResult = { id: Number(id), ...result } as ScanResult;

  // Auto-verify roadmap items against scan results
  if (!error) {
    try {
      const domain = await env.DB.prepare(
        "SELECT * FROM domains WHERE id = ?"
      ).bind(domainId).first<Domain>();
      if (domain && !domain.is_competitor) {
        await autoVerifyRoadmap(domain, scanResult, env);
      }
    } catch (e) {
      console.log(`Auto-roadmap check failed: ${e}`);
    }
  }

  return scanResult;
}
