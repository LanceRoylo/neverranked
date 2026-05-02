/**
 * Gemini grounding-redirect resolver.
 *
 * Gemini's grounding API returns citation URLs as opaque redirects:
 *   https://vertexaisearch.cloud.google.com/grounding-api-redirect/<token>
 *
 * The token resolves (via 302) to the actual source URL Google Search
 * surfaced -- a real publisher, blog, reddit thread, etc. We resolve at
 * ingest time so downstream consumers (reddit extraction, competitor
 * surfacing, citation display) see real URLs, not opaque tokens.
 *
 * Failure mode: if a redirect can't be resolved (404, timeout, expired
 * token), we keep the original vertexaisearch URL. Existing extraction
 * code already handles arbitrary URLs and will simply skip non-useful
 * ones, so this is strictly additive -- no regression vs. the
 * pre-resolver behavior.
 */

const GROUNDING_HOST = "vertexaisearch.cloud.google.com";
const GROUNDING_PATH_PREFIX = "/grounding-api-redirect/";
const RESOLVE_TIMEOUT_MS = 5_000;
const RESOLVE_CONCURRENCY = 8;

/** Returns true if this is a Gemini grounding-API redirect URL. */
export function isGroundingRedirect(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === GROUNDING_HOST && u.pathname.startsWith(GROUNDING_PATH_PREFIX);
  } catch {
    return false;
  }
}

/**
 * Resolve a single grounding-redirect URL by following the 302. Returns
 * the resolved URL on success, or the original input on any failure.
 * We use redirect: "manual" so we read the Location header directly --
 * lets us handle the 302 explicitly without paying for the destination
 * page download (we only want the URL, not its contents).
 */
export async function resolveGroundingUrl(url: string): Promise<string> {
  if (!isGroundingRedirect(url)) return url;
  try {
    const resp = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
    });
    // Google returns 302 with Location header.
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get("location");
      if (loc) {
        try {
          // Validate it's a real URL before returning.
          const parsed = new URL(loc);
          // Don't loop back into another grounding URL.
          if (parsed.hostname !== GROUNDING_HOST) return loc;
        } catch { /* fall through */ }
      }
    }
    return url;
  } catch {
    return url;
  }
}

/**
 * Resolve a list of URLs with bounded concurrency. Non-grounding URLs
 * pass through untouched and don't count against the concurrency budget.
 * Order is preserved so callers can map 1:1 to the input list.
 */
export async function resolveGroundingUrls(urls: string[]): Promise<string[]> {
  const out = new Array<string>(urls.length);
  // Stamp non-grounding URLs immediately so they don't queue.
  const queue: number[] = [];
  for (let i = 0; i < urls.length; i++) {
    if (isGroundingRedirect(urls[i])) {
      queue.push(i);
    } else {
      out[i] = urls[i];
    }
  }
  if (queue.length === 0) return out;

  let cursor = 0;
  const workers: Promise<void>[] = [];
  const numWorkers = Math.min(RESOLVE_CONCURRENCY, queue.length);
  for (let w = 0; w < numWorkers; w++) {
    workers.push((async () => {
      while (true) {
        const slot = cursor++;
        if (slot >= queue.length) return;
        const idx = queue[slot];
        out[idx] = await resolveGroundingUrl(urls[idx]);
      }
    })());
  }
  await Promise.all(workers);
  return out;
}
