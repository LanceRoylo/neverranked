/**
 * neverranked.com edge worker.
 *
 * The site is otherwise pure static assets. This worker exists for ONE reason:
 * a tiny per-visitor /geo endpoint that returns the viewer's approximate city
 * and region from Cloudflare's own request.cf data. No third party is involved
 * and the visitor's IP never leaves Cloudflare; we only read the city Cloudflare
 * has already resolved at the edge.
 *
 * Every other request is delegated to the static assets binding, so all existing
 * pages (and the single-page-application not_found_handling fallback) behave
 * exactly as they did before this worker was added.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/geo") {
      const cf = request.cf || {};
      const body = JSON.stringify({
        city: cf.city || null,
        region: cf.region || null,
        country: cf.country || null,
      });
      return new Response(body, {
        headers: {
          "content-type": "application/json; charset=utf-8",
          // per-visitor; must never be cached at the edge or in the browser
          "cache-control": "no-store",
        },
      });
    }

    // No custom handling: serve the static asset (or the SPA fallback).
    return env.ASSETS.fetch(request);
  },
};
