/**
 * BreadcrumbList auto-trigger: hooks into scan completion to
 * generate breadcrumbs when a client doesn't have any yet.
 *
 * Mirrors the FAQ auto-trigger pattern. Same dedup semantics: if
 * any BreadcrumbList row exists for the client (any status -- pending,
 * approved, paused, archived) we skip. Customer or admin has touched
 * it; don't loop.
 *
 * Unlike FAQ generation this does NOT call an LLM. Breadcrumbs are
 * deterministic from URL structure -- we just parse the homepage's
 * nav for top-level sections. No API cost.
 */
import type { Env, Domain } from "./types";

export async function maybeGenerateBreadcrumbsForClient(
  domain: Domain,
  env: Env,
): Promise<{ generated: boolean; reason?: string; inserted?: number }> {
  const slug = domain.client_slug;
  if (!slug) return { generated: false, reason: "no client_slug" };
  if (domain.is_competitor) return { generated: false, reason: "competitor domain" };

  const existing = await env.DB.prepare(
    "SELECT 1 AS ok FROM schema_injections WHERE client_slug = ? AND schema_type = 'BreadcrumbList' LIMIT 1"
  ).bind(slug).first<{ ok: number }>();
  if (existing) return { generated: false, reason: "BreadcrumbList already exists for client" };

  const config = await env.DB.prepare(
    "SELECT 1 AS ok FROM injection_configs WHERE client_slug = ? LIMIT 1"
  ).bind(slug).first<{ ok: number }>();
  if (!config) return { generated: false, reason: "snippet not installed (no injection_configs)" };

  const host = domain.domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const homepageUrl = host.startsWith("www.") ? `https://${host}/` : `https://www.${host}/`;

  const { generateBreadcrumbsForSite } = await import("./breadcrumb-generator");
  const result = await generateBreadcrumbsForSite(slug, homepageUrl, env);

  if (result.ok) {
    console.log(`[breadcrumb-auto] generated ${result.inserted} breadcrumbs for ${slug} from ${homepageUrl}`);
    return { generated: true, inserted: result.inserted };
  }
  console.log(`[breadcrumb-auto] skipped ${slug}: ${result.reason}`);
  return { generated: false, reason: result.reason };
}
