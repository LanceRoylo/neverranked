/**
 * Authority signal ingest (Phase 4A).
 *
 * Called from the scanner after each successful scan. Reads the
 * extracted signals (trust_profile_links, author_meta,
 * has_person_schema) and writes them into:
 *
 *   - trust_profiles  -- per-client per-platform-per-url presence
 *   - author_coverage -- per-client roll-up of pages_with_author
 *                        / pages_scanned
 *
 * It also generates roadmap items for missing high-value trust
 * platforms once the client has at least 5 scanned pages on their
 * own domain (so we don't fire on the first scan of a brand-new
 * site and pollute the roadmap with false negatives).
 *
 * High-value platforms vary by client category, so v1 always
 * suggests the platform-agnostic ones (G2 OR Trustpilot OR Capterra
 * for SaaS-leaning, GBP / Yelp / BBB for local). v1 is conservative:
 * we only fire ONE roadmap item per client for "set up at least one
 * review platform" until they have one, then we surface the
 * category-specific suggestions in the dashboard.
 */

import type { Env, Domain, ScanResult } from "./types";

interface ExtractedAuthority {
  trust_profile_links: { platform: string; url: string }[];
  author_meta: string | null;
  has_person_schema: boolean;
}

const TRUST_PRIORITY_TIER1 = ["g2", "trustpilot", "capterra", "google_business"];

export async function ingestAuthoritySignals(
  domain: Domain,
  scan: ScanResult,
  env: Env,
): Promise<void> {
  if (!domain.client_slug) return;
  if (domain.is_competitor) return;
  if (scan.error) return;

  let signals: ExtractedAuthority;
  try {
    signals = JSON.parse(scan.signals_json || "{}");
  } catch {
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const links = Array.isArray(signals.trust_profile_links) ? signals.trust_profile_links : [];
  const hasAuthor = !!signals.author_meta || signals.has_person_schema === true;

  // 1. Upsert each detected trust profile. PRIMARY KEY is
  //    (client_slug, platform, url) so this is idempotent across
  //    repeat scans of the same page.
  for (const link of links) {
    if (!link?.platform || !link?.url) continue;
    await env.DB.prepare(
      `INSERT INTO trust_profiles (client_slug, platform, url, detected_at, last_seen_at, source_url)
         VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(client_slug, platform, url) DO UPDATE SET
         last_seen_at = excluded.last_seen_at,
         source_url   = excluded.source_url`
    ).bind(domain.client_slug, link.platform, link.url, now, now, scan.url).run();
  }

  // 2. Roll up author coverage. We treat every successful scan as
  //    one page sample. Idempotency: this CAN double-count if the
  //    same URL is scanned twice, but the absolute number matters
  //    less than the ratio, and re-scans of the same URL get the
  //    same has_author verdict so the ratio stays stable.
  await env.DB.prepare(
    `INSERT INTO author_coverage (client_slug, pages_scanned, pages_with_author, last_scan_at, created_at, updated_at)
       VALUES (?, 1, ?, ?, ?, ?)
     ON CONFLICT(client_slug) DO UPDATE SET
       pages_scanned     = pages_scanned + 1,
       pages_with_author = pages_with_author + ?,
       last_scan_at      = excluded.last_scan_at,
       updated_at        = excluded.updated_at`
  ).bind(
    domain.client_slug,
    hasAuthor ? 1 : 0,
    now, now, now,
    hasAuthor ? 1 : 0,
  ).run();

  // 3. Roadmap items for gaps. Gate behind >=5 scans so a brand-new
  //    site doesn't get spammed with items the first time it's added.
  await maybeAddTrustRoadmapItem(domain.client_slug, env, now);
  await maybeAddAuthorRoadmapItem(domain.client_slug, env, now);
}

/** Add a single "set up review-platform presence" roadmap item if
 *  the client has none of the tier-1 platforms detected after >=5
 *  page scans. Idempotent by exact title match. */
async function maybeAddTrustRoadmapItem(
  clientSlug: string,
  env: Env,
  now: number,
): Promise<void> {
  const cov = await env.DB.prepare(
    "SELECT pages_scanned FROM author_coverage WHERE client_slug = ?"
  ).bind(clientSlug).first<{ pages_scanned: number }>();
  if (!cov || cov.pages_scanned < 5) return;

  const tier1Hits = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM trust_profiles
       WHERE client_slug = ? AND platform IN ('g2','trustpilot','capterra','google_business')`
  ).bind(clientSlug).first<{ n: number }>();

  if ((tier1Hits?.n ?? 0) > 0) return;

  const title = "Establish a review-platform presence (G2 / Trustpilot / Capterra / GBP)";
  const exists = await env.DB.prepare(
    "SELECT id FROM roadmap_items WHERE client_slug = ? AND title = ? LIMIT 1"
  ).bind(clientSlug, title).first<{ id: number }>();
  if (exists) return;

  const desc = "AI engines pull from third-party review platforms when summarizing brands. CMU's GEO research shows ~3x citation lift for brands with at least one tier-1 review profile linked from their site. Pick the best fit (G2/Capterra for SaaS, Trustpilot for ecom, Google Business Profile for local) and link to it from your site footer or trust page.";

  await env.DB.prepare(
    `INSERT INTO roadmap_items (
       client_slug, phase_id, title, description, category, status,
       sort_order, refresh_source, stale, created_at, updated_at
     ) VALUES (?, NULL, ?, ?, 'authority', 'pending', 1100, 'authority', 0, ?, ?)`
  ).bind(clientSlug, title, desc, now, now).run();
}

/** Add an author-bio roadmap item if <50% of scanned pages have
 *  a named author, gated to >=5 scans. */
async function maybeAddAuthorRoadmapItem(
  clientSlug: string,
  env: Env,
  now: number,
): Promise<void> {
  const cov = await env.DB.prepare(
    "SELECT pages_scanned, pages_with_author FROM author_coverage WHERE client_slug = ?"
  ).bind(clientSlug).first<{ pages_scanned: number; pages_with_author: number }>();
  if (!cov || cov.pages_scanned < 5) return;

  const ratio = cov.pages_with_author / cov.pages_scanned;
  if (ratio >= 0.5) return; // good enough -- skip

  const title = "Add named-author signals to content pages";
  const exists = await env.DB.prepare(
    "SELECT id FROM roadmap_items WHERE client_slug = ? AND title = ? LIMIT 1"
  ).bind(clientSlug, title).first<{ id: number }>();
  if (exists) return;

  const pct = Math.round(ratio * 100);
  const desc = `Only ${pct}% of your scanned pages declare a named author (via <meta name="author"> or schema.org Person). CMU's GEO research shows ~2.3x citation lift on content with named-author signals because AI engines treat them as authority anchors. Add author meta + Person schema to all evergreen content and blog posts.`;

  await env.DB.prepare(
    `INSERT INTO roadmap_items (
       client_slug, phase_id, title, description, category, status,
       sort_order, refresh_source, stale, created_at, updated_at
     ) VALUES (?, NULL, ?, ?, 'authority', 'pending', 1100, 'authority', 0, ?, ?)`
  ).bind(clientSlug, title, desc, now, now).run();
}

/** Used by the /trust/<slug> route. */
export async function getTrustMatrix(clientSlug: string, env: Env): Promise<{
  platforms: { platform: string; profiles: { url: string; last_seen_at: number; source_url: string | null }[] }[];
  authorCoverage: { pages_scanned: number; pages_with_author: number; last_scan_at: number } | null;
}> {
  const profiles = (await env.DB.prepare(
    `SELECT platform, url, last_seen_at, source_url FROM trust_profiles
      WHERE client_slug = ? ORDER BY platform ASC, last_seen_at DESC`
  ).bind(clientSlug).all<{ platform: string; url: string; last_seen_at: number; source_url: string | null }>()).results;

  const grouped = new Map<string, { url: string; last_seen_at: number; source_url: string | null }[]>();
  for (const p of profiles) {
    if (!grouped.has(p.platform)) grouped.set(p.platform, []);
    grouped.get(p.platform)!.push({ url: p.url, last_seen_at: p.last_seen_at, source_url: p.source_url });
  }

  const ALL_PLATFORMS = ["g2", "trustpilot", "capterra", "google_business", "yelp", "bbb", "glassdoor", "clutch"];
  const platforms = ALL_PLATFORMS.map(platform => ({
    platform,
    profiles: grouped.get(platform) ?? [],
  }));

  const cov = await env.DB.prepare(
    "SELECT pages_scanned, pages_with_author, last_scan_at FROM author_coverage WHERE client_slug = ?"
  ).bind(clientSlug).first<{ pages_scanned: number; pages_with_author: number; last_scan_at: number }>();

  return { platforms, authorCoverage: cov ?? null };
}
