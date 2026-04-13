/**
 * Schema Injection — Public JS endpoint
 *
 * GET /inject/:client_slug.js
 * Serves a self-executing JS file that injects approved JSON-LD
 * schema blocks into the client's pages. Cached at the edge.
 */

import type { Env, SchemaInjection, InjectionConfig } from "../types";

export async function handleInjectScript(
  slug: string,
  env: Env
): Promise<Response> {
  // Get config
  const config = await env.DB.prepare(
    "SELECT * FROM injection_configs WHERE client_slug = ?"
  )
    .bind(slug)
    .first<InjectionConfig>();

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
