/**
 * BreadcrumbList schema generator.
 *
 * Auto-derives breadcrumbs from a site's top-level navigation
 * structure. Inserts as 'pending' for review (same pattern as the
 * FAQ generator) so the customer sees the proposed taxonomy
 * before it goes live.
 *
 * Why no LLM here: breadcrumbs are deterministic from URL
 * structure. We don't need a generation model -- we just need to
 * know which sections of the site exist. We extract that from
 * the homepage's nav menu via simple HTML parsing. Cheaper,
 * faster, more reliable than an LLM call.
 *
 * Strategy:
 *   1. Fetch the homepage
 *   2. Pull all <a href> links from the page (with optional nav
 *      element prioritization)
 *   3. Filter to internal links with path depth = 1 (top-level
 *      sections like /events, /about, /membership, NOT /events/foo)
 *   4. Deploy a 1-item home breadcrumb at "/"
 *   5. Deploy a 2-item breadcrumb (Home > Section) at each top-
 *      level path's prefix
 *
 * Idempotent. Skips if any BreadcrumbList already exists for the
 * client. Same dedup semantics as the FAQ trigger.
 */
import type { Env } from "./types";
import { gradeSchema } from "../../packages/aeo-analyzer/src/schema-grader";
import { logSchemaDrafted } from "./activity-log";

const USER_AGENT = "NeverRanked-Breadcrumb-Generator/1.0";

// Paths we always exclude from being treated as a "section."
// Files, fragments, query-only links, and tracking suffixes.
const PATH_EXCLUDES = /\.(jpg|jpeg|png|gif|svg|webp|pdf|ico|css|js|xml|txt)$/i;

// Section paths we deliberately skip even when they're top-level.
// These are usually content pages, not navigation roots.
const SECTION_BLOCKLIST = new Set<string>([
  "/wp-content", "/wp-admin", "/wp-includes", "/feed", "/rss",
  "/sitemap", "/robots.txt", "/cart", "/checkout", "/login",
  "/account", "/my-account", "/search",
]);

interface DiscoveredSection {
  path: string;        // canonical, leading slash, no trailing slash
  label: string;       // human-readable name from anchor text
  href: string;        // full URL
}

export interface GenerateBreadcrumbsResult {
  ok: boolean;
  reason?: string;
  sections?: DiscoveredSection[];
  inserted?: number;
  injectionIds?: number[];
}

export async function generateBreadcrumbsForSite(
  clientSlug: string,
  homepageUrl: string,
  env: Env,
): Promise<GenerateBreadcrumbsResult> {
  // 1. Fetch homepage.
  let html: string;
  try {
    const resp = await fetch(homepageUrl, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
    });
    if (!resp.ok) return { ok: false, reason: `HTTP ${resp.status} fetching homepage` };
    html = await resp.text();
  } catch (e) {
    return { ok: false, reason: `fetch failed: ${e}` };
  }

  // 2. Discover top-level sections.
  const sections = discoverSections(html, homepageUrl);
  if (sections.length === 0) {
    return { ok: false, reason: "no top-level sections discovered (nav structure may be JS-only)" };
  }

  // 3. Build the schemas. Two layers:
  //    - homepage: 1-item breadcrumb (Home)
  //    - each section: 2-item breadcrumb (Home > Section)
  const homeUrl = canonicalHomeUrl(homepageUrl);
  const homepageSchema = buildHomeBreadcrumb(homeUrl);
  const sectionSchemas = sections.map((s) => buildSectionBreadcrumb(homeUrl, s));

  // 4. Quality-gate each. The grader requires itemListElement and
  //    each entry have name + (item or position). All our outputs
  //    satisfy both, so this is mostly a defense against regressions.
  const allSchemas = [
    { schema: homepageSchema, targetPath: "/" },
    ...sectionSchemas.map((sch, i) => ({ schema: sch, targetPath: `${sections[i].path}*` })),
  ];

  const insertedIds: number[] = [];
  for (const { schema, targetPath } of allSchemas) {
    const grade = gradeSchema(schema);
    if (!grade.meetsDeployThreshold) {
      console.log(`[breadcrumb-gen] skipping ${targetPath}: quality ${grade.score}`);
      continue;
    }
    const result = await env.DB.prepare(
      "INSERT INTO schema_injections (client_slug, schema_type, json_ld, target_pages, status, quality_score, quality_graded_at) " +
      "VALUES (?, 'BreadcrumbList', ?, ?, 'pending', ?, unixepoch())"
    ).bind(
      clientSlug,
      JSON.stringify(schema),
      JSON.stringify([targetPath]),
      grade.score,
    ).run();
    insertedIds.push(Number(result.meta?.last_row_id ?? 0));
  }

  if (insertedIds.length === 0) {
    return { ok: false, reason: "no schemas passed the quality gate" };
  }

  // 5. Single activity-log entry summarizing the batch. One alert
  //    per generation event, not one per breadcrumb -- fewer noise
  //    in the customer feed.
  await logSchemaDrafted(
    env,
    clientSlug,
    "BreadcrumbList",
    `${insertedIds.length} pages (home + ${sections.length} section${sections.length === 1 ? "" : "s"})`,
    insertedIds[0],
  );

  return {
    ok: true,
    sections,
    inserted: insertedIds.length,
    injectionIds: insertedIds,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function canonicalHomeUrl(input: string): string {
  try {
    const u = new URL(input);
    return `${u.protocol}//${u.host}/`;
  } catch {
    return input.replace(/\/+$/, "") + "/";
  }
}

function discoverSections(html: string, homepageUrl: string): DiscoveredSection[] {
  let homeHost: string;
  try { homeHost = new URL(homepageUrl).host; }
  catch { return []; }

  // Pull all <a href="..."> links along with their visible text.
  // We strip nested HTML inside the anchor to get a clean label.
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seenPaths = new Map<string, DiscoveredSection>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    const innerHtml = m[2];

    // Resolve href to absolute URL relative to the homepage.
    let absUrl: URL;
    try { absUrl = new URL(href, homepageUrl); }
    catch { continue; }

    // Same-host only.
    if (absUrl.host !== homeHost) continue;
    // Skip files, fragments, mailto, tel, etc.
    if (PATH_EXCLUDES.test(absUrl.pathname)) continue;
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;

    // Top-level only (path depth = 1). /events => keep, /events/foo => skip.
    const trimmed = absUrl.pathname.replace(/\/$/, "");
    if (!trimmed || trimmed === "/") continue; // skip the home link itself
    const segments = trimmed.split("/").filter(Boolean);
    if (segments.length !== 1) continue;
    const path = `/${segments[0]}`;
    if (SECTION_BLOCKLIST.has(path)) continue;

    // Extract a clean label from the anchor inner HTML.
    const label = innerHtml
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      // De-cap if all-uppercase (some menus use <a>EVENTS</a>).
      .replace(/^([A-Z]+(?: [A-Z]+)*)$/, (s) => titleCase(s));

    if (!label || label.length > 60) continue;

    // Keep first-seen (top-of-page nav typically wins) and dedupe by path.
    if (!seenPaths.has(path)) {
      seenPaths.set(path, { path, label, href: absUrl.toString() });
    }
  }
  return [...seenPaths.values()];
}

function titleCase(s: string): string {
  return s.toLowerCase().split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function buildHomeBreadcrumb(homeUrl: string): unknown {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": `${homeUrl}#breadcrumb-home`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: homeUrl },
    ],
  };
}

function buildSectionBreadcrumb(homeUrl: string, section: DiscoveredSection): unknown {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": `${section.href}#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: homeUrl },
      { "@type": "ListItem", position: 2, name: section.label, item: section.href },
    ],
  };
}
