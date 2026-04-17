/**
 * Dashboard -- Snippet detector
 *
 * Fetches a client domain's homepage and checks whether our injector
 * script tag is present. Used by the daily nudge cron to decide
 * whether to remind the agency that their client hasn't installed it
 * yet.
 *
 * We look for the injector URL substring rather than a strict regex
 * parse because different CMS templates encode the tag differently
 * (with/without `async`, `defer`, crossorigin attrs, different URL
 * protocols, rewriting through CDN proxies). The substring approach
 * catches them all with one check.
 */

const DETECT_TIMEOUT_MS = 10_000;
const DETECT_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 NeverRanked-SnippetDetector/1.0";

/**
 * Return true if the homepage HTML references our injector endpoint.
 * Non-fatal: any fetch / parse / network error returns `false` so the
 * cron treats an unreachable site the same as a missing snippet (it
 * will nudge -- the agency can then re-verify the install or fix the
 * downtime). Does NOT throw.
 */
export async function detectSnippet(domain: string): Promise<boolean> {
  if (!domain) return false;

  // Try https first, fall back to http if it 4xx/5xx's. Strip any
  // protocol the caller may have included.
  const bare = String(domain)
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");
  if (!bare) return false;

  const urlsToTry = [`https://${bare}/`, `http://${bare}/`];

  for (const url of urlsToTry) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DETECT_TIMEOUT_MS);
      const resp = await fetch(url, {
        headers: {
          "User-Agent": DETECT_UA,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        redirect: "follow",
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) continue;

      const html = await resp.text();
      // Match either the production inject URL or the Workers dev URL
      // that could show up on a pre-prod site configured by hand.
      if (
        html.includes("app.neverranked.com/inject/") ||
        html.includes("neverranked-dashboard.lanceroylo.workers.dev/inject/")
      ) {
        return true;
      }
      return false; // successfully fetched, snippet not present
    } catch {
      // timeout / DNS / refused -- try the next URL
    }
  }
  return false;
}
