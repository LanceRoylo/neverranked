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

/**
 * JSON sibling for the .js endpoint -- same data, no JS wrapper.
 *
 * GET /inject/:client_slug.json
 * Returns: { client_slug, schemas: [{pages, ld}, ...] }
 *
 * Used by our own scanner so it can see schemas we deploy via
 * injection. Without this, the scanner does pure HTTP fetch and never
 * executes the .js to discover the JSON-LD blocks. With it, the
 * scanner gets a clean structured payload with no eval/regex needed.
 *
 * pages is either the literal string "*" (every page) or a JSON
 * array of patterns (each entry exact-match unless ends in "*", in
 * which case it's a prefix match -- mirrors the .js matcher).
 */
export async function handleInjectJson(
  slug: string,
  env: Env,
): Promise<Response> {
  const config = await env.DB.prepare(
    "SELECT enabled FROM injection_configs WHERE client_slug = ?"
  ).bind(slug).first<{ enabled: number }>();

  if (!config || !config.enabled) {
    return jsonResponse({ client_slug: slug, schemas: [], note: "not configured or disabled" });
  }

  const injections = (
    await env.DB.prepare(
      "SELECT schema_type, json_ld, target_pages FROM schema_injections WHERE client_slug = ? AND status = 'approved' ORDER BY schema_type"
    ).bind(slug).all<Pick<SchemaInjection, "schema_type" | "json_ld" | "target_pages">>()
  ).results;

  const schemas = injections.map((inj) => {
    let pages: string | string[] = "*";
    if (inj.target_pages !== "*") {
      try { pages = JSON.parse(inj.target_pages); }
      catch { pages = "*"; /* malformed -- treat as all-pages so we don't silently drop a schema */ }
    }
    let ld: unknown = null;
    try { ld = JSON.parse(inj.json_ld); }
    catch { ld = null; }
    return { schema_type: inj.schema_type, pages, ld };
  }).filter((s) => s.ld !== null);

  return jsonResponse({ client_slug: slug, schemas });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
