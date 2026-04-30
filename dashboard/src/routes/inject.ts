/**
 * Schema Injection — Public JS endpoint
 *
 * GET /inject/:client_slug.js
 * Serves a self-executing JS file that injects approved JSON-LD
 * schema blocks into the client's pages. Cached at the edge.
 *
 * Side-effect: every request is inspected for bot user-agents and
 * logged to bot_hits via ctx.waitUntil(). This powers the dashboard's
 * "AI bots crawling your site" view. The logging happens off the hot
 * path so a logging failure can't slow down or break the response.
 */

import type { Env, SchemaInjection, InjectionConfig } from "../types";
import { logBotHit, refererPath } from "../bot-analytics";

export async function handleInjectScript(
  slug: string,
  env: Env,
  request?: Request,
  ctx?: ExecutionContext,
): Promise<Response> {
  // Bot-analytics logging is opportunistic: we only have the request
  // when the route was called from the main fetch handler. The legacy
  // call signature (slug + env only) is still supported.
  if (request && ctx) {
    const ua = request.headers.get("user-agent");
    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for");
    const ref = refererPath(request.headers.get("referer"));
    ctx.waitUntil(logBotHit(env, {
      clientSlug: slug,
      userAgent: ua,
      ip,
      refererPath: ref,
    }));
  }
  // Get config
  let config = await env.DB.prepare(
    "SELECT * FROM injection_configs WHERE client_slug = ?"
  )
    .bind(slug)
    .first<InjectionConfig>();

  // Lazy provisioning: if there's no config but this slug exists in
  // domains (i.e. it's a real client), auto-create one. This closes
  // the bug where a customer pastes the snippet on their site BEFORE
  // we've created their injection_configs row -- the snippet would
  // load forever and silently return a no-op comment with the customer
  // none the wiser. With this fallback, the first hit creates the
  // config and subsequent hits serve normally.
  //
  // Won't accidentally create configs for arbitrary slugs hitting the
  // endpoint -- the slug must already exist in domains, which only
  // happens for real customers we've onboarded.
  if (!config) {
    const knownSlug = await env.DB.prepare(
      "SELECT 1 AS ok FROM domains WHERE client_slug = ? LIMIT 1"
    ).bind(slug).first<{ ok: number }>();
    if (knownSlug) {
      const snippetToken = Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map(b => b.toString(16).padStart(2, "0")).join("");
      try {
        await env.DB.prepare(
          `INSERT INTO injection_configs (client_slug, snippet_token)
             VALUES (?, ?)
           ON CONFLICT(client_slug) DO NOTHING`
        ).bind(slug, snippetToken).run();
        // Surface the auto-creation so we know it happened (not a
        // user-facing error, but a signal the upstream onboarding
        // missed a step).
        try {
          const now = Math.floor(Date.now() / 1000);
          await env.DB.prepare(
            `INSERT INTO admin_alerts (client_slug, type, title, detail, created_at)
               VALUES (?, 'config_lazy_created', ?, ?, ?)`
          ).bind(slug, `Lazy-created injection_config for ${slug}`,
                 `The snippet endpoint received a request for client_slug "${slug}" but no injection_configs row existed. Auto-created one. Upstream onboarding missed a step -- review the path that provisioned this client.`,
                 now).run();
        } catch { /* best-effort alert */ }
        // Re-read the just-created row
        config = await env.DB.prepare(
          "SELECT * FROM injection_configs WHERE client_slug = ?"
        ).bind(slug).first<InjectionConfig>();
      } catch (e) {
        console.log(`Lazy config creation failed for ${slug}: ${e}`);
      }
    }
  }

  // No config or disabled — return empty JS
  if (!config || !config.enabled) {
    return new Response("/* NeverRanked: not configured */", {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Get approved injections
  const injections = (
    await env.DB.prepare(
      "SELECT schema_type, json_ld, target_pages FROM schema_injections WHERE client_slug = ? AND status = 'approved' ORDER BY schema_type"
    )
      .bind(slug)
      .all<Pick<SchemaInjection, "schema_type" | "json_ld" | "target_pages">>()
  ).results;

  if (injections.length === 0) {
    return new Response("/* NeverRanked: no active schema */", {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Build the schema array for the JS
  const schemas = injections.map((inj) => {
    const pages = inj.target_pages === "*" ? '"*"' : inj.target_pages;
    return `{pages:${pages},ld:${inj.json_ld}}`;
  });

  const js = `(function(){
var schemas=[${schemas.join(",")}];
var path=location.pathname;
schemas.forEach(function(s){
  var match=false;
  if(s.pages==="*"){match=true}
  else if(Array.isArray(s.pages)){
    match=s.pages.some(function(p){
      return p.endsWith("*")?path.startsWith(p.slice(0,-1)):path===p;
    });
  }
  if(match){
    var el=document.createElement("script");
    el.type="application/ld+json";
    el.textContent=JSON.stringify(s.ld);
    document.head.appendChild(el);
  }
});
})();`;

  const ttl = config.cache_ttl || 3600;

  return new Response(js, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": `public, max-age=${ttl}, s-maxage=${ttl}`,
      "Access-Control-Allow-Origin": "*",
      "X-NR-Schemas": String(injections.length),
    },
  });
}
