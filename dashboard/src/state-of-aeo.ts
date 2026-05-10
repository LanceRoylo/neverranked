/**
 * State of AEO -- digest integration.
 *
 * The marketing site at neverranked.com/state-of-aeo/latest.json is
 * regenerated weekly by .github/workflows/weekly-state-of-aeo.yml.
 * This module fetches the JSON and renders a small block for the
 * weekly digest email so every customer sees the latest industry
 * headline alongside their per-domain results.
 *
 * Failure is non-fatal: if the fetch errors or the payload is stale,
 * the block is omitted and the rest of the digest sends normally.
 */

export interface StateOfAeoLatest {
  slug: string;
  title: string;
  generated: string;
  windowStart: string | null;
  windowEnd: string | null;
  sampleRuns: string | number | null;
  url: string;
  pdfUrl: string | null;
  headline: string;
}

const LATEST_URL = "https://neverranked.com/state-of-aeo/latest.json";

/**
 * Fetch the latest State of AEO summary. Returns null on any failure
 * so callers can treat it as "no block this week" without branching.
 * Uses the Cache API with a 30-minute TTL so a Monday morning fanout
 * across many users only triggers one origin fetch.
 */
export async function getLatestStateOfAeo(): Promise<StateOfAeoLatest | null> {
  try {
    const cache = (caches as unknown as { default: Cache }).default;
    const cacheKey = new Request(LATEST_URL, { method: "GET" });
    let res = cache ? await cache.match(cacheKey) : undefined;
    if (!res) {
      res = await fetch(LATEST_URL, { cf: { cacheTtl: 1800 } } as RequestInit);
      if (cache && res.ok) {
        const cloned = res.clone();
        // Override caching headers so the Workers cache honors our TTL.
        const headers = new Headers(cloned.headers);
        headers.set("Cache-Control", "public, max-age=1800");
        await cache.put(cacheKey, new Response(await cloned.arrayBuffer(), {
          status: res.status,
          statusText: res.statusText,
          headers,
        }));
      }
    }
    if (!res.ok) return null;
    const json = (await res.json()) as Partial<StateOfAeoLatest>;
    if (!json || typeof json.url !== "string" || typeof json.headline !== "string") {
      return null;
    }
    return json as StateOfAeoLatest;
  } catch {
    return null;
  }
}

/**
 * Render the digest block. Email-safe HTML: inline styles, table
 * layout, no script. Returns "" if the payload is null so callers can
 * unconditionally interpolate the result.
 */
export function buildStateOfAeoBlock(data: StateOfAeoLatest | null): string {
  if (!data) return "";
  const sample = data.sampleRuns ? `${data.sampleRuns} captured AI engine responses` : "the latest tracked sample";
  const windowLine = data.windowStart && data.windowEnd
    ? `${data.windowStart} to ${data.windowEnd}`
    : data.generated;
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px">
      <tr>
        <td style="padding:24px;background:#1c1c1c;border:1px solid #2a2a2a;border-radius:4px">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:#bfa04d;padding-bottom:8px">The State of AEO &middot; week of ${escHtml(windowLine)}</td>
            </tr>
            <tr>
              <td style="font-family:Georgia,serif;font-size:18px;font-style:italic;color:#fbf8ef;line-height:1.4;padding-bottom:12px">${escHtml(data.title)}</td>
            </tr>
            <tr>
              <td style="font-family:Georgia,serif;font-size:14px;line-height:1.7;color:#b0b0a8;padding-bottom:16px">${escHtml(data.headline)}</td>
            </tr>
            <tr>
              <td style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:1px;color:#888888;padding-bottom:16px">Pulled from ${escHtml(String(sample))}.</td>
            </tr>
            <tr>
              <td>
                <a href="${escAttr(data.url)}" style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#e8c767;text-decoration:none;font-weight:bold">Read the full report &rarr;</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

function escHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escAttr(s: string): string {
  return escHtml(s);
}
