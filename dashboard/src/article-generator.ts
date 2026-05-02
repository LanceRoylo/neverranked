/**
 * Article schema generator.
 *
 * Given a sitemap URL, discovers article-like posts and generates
 * Article JSON-LD per post. Inserted as 'pending' for review --
 * same pattern as FAQ and breadcrumbs.
 *
 * Discovery: sitemap.xml (most CMSes expose one). We filter URLs
 * that look like article paths -- /blog/, /news/, /post/, /article/,
 * or paths matching a date heuristic (/YYYY/MM/...). Cap at MAX_POSTS
 * to avoid blasting hundreds of schemas on first run.
 *
 * Metadata extraction per post: headline from og:title or <h1>,
 * datePublished from <time datetime=...> or article:published_time
 * meta, image from og:image, author from <meta name="author"> or
 * the visible byline. If we can't extract all four required fields
 * (headline, author, datePublished, image) we skip the post --
 * partial Article schema produces the 18pp citation penalty per the
 * 730-citation study.
 *
 * No auto-trigger -- most clients don't have blogs. Run this
 * manually via /admin/generate-articles when a blog-heavy client
 * is onboarded.
 */
import type { Env } from "./types";
import { gradeSchema } from "../../packages/aeo-analyzer/src/schema-grader";
import { logSchemaDrafted } from "./activity-log";

const USER_AGENT = "NeverRanked-Article-Generator/1.0";
const MAX_POSTS = 25;

// Path patterns that suggest a URL is an article post.
const ARTICLE_PATH_PATTERNS: RegExp[] = [
  /\/blog\//i,
  /\/news\//i,
  /\/post\//i,
  /\/posts\//i,
  /\/article\//i,
  /\/articles\//i,
  /\/(19|20)\d{2}\/\d{2}\//, // /2024/04/...
];

// Paths to deliberately skip even if they match the article patterns.
const NON_ARTICLE_BLOCKLIST: RegExp[] = [
  /\/(category|tag|author|page|archive)\//i,
  /\/feed\/?$/,
];

interface DiscoveredPost {
  url: string;
  lastmod?: string;
}

interface ArticleMeta {
  url: string;
  headline: string;
  author: string;
  datePublished: string;
  image: string;
  description?: string;
  dateModified?: string;
}

export interface GenerateArticlesResult {
  ok: boolean;
  reason?: string;
  postsDiscovered?: number;
  postsExtracted?: number;
  inserted?: number;
  skipped?: Array<{ url: string; reason: string }>;
}

export async function generateArticlesFromSitemap(
  clientSlug: string,
  sitemapUrl: string,
  env: Env,
): Promise<GenerateArticlesResult> {
  // 1. Fetch sitemap.
  let sitemapXml: string;
  try {
    const resp = await fetch(sitemapUrl, { headers: { "User-Agent": USER_AGENT } });
    if (!resp.ok) return { ok: false, reason: `HTTP ${resp.status} fetching sitemap` };
    sitemapXml = await resp.text();
  } catch (e) {
    return { ok: false, reason: `sitemap fetch failed: ${e}` };
  }

  // 2. Discover article URLs. Walk all <loc> entries, filter to ones
  //    matching article patterns and not the blocklist. If the file
  //    is a sitemap index (<sitemapindex>) we recurse one level.
  let posts = extractArticleUrls(sitemapXml);
  if (posts.length === 0 && /<sitemapindex/i.test(sitemapXml)) {
    const subSitemapUrls = extractAllUrls(sitemapXml).slice(0, 10);
    for (const sub of subSitemapUrls) {
      try {
        const r = await fetch(sub, { headers: { "User-Agent": USER_AGENT } });
        if (!r.ok) continue;
        posts = posts.concat(extractArticleUrls(await r.text()));
        if (posts.length >= MAX_POSTS) break;
      } catch { /* skip unreadable sub-sitemap */ }
    }
  }
  posts = posts.slice(0, MAX_POSTS);
  if (posts.length === 0) {
    return { ok: false, reason: "no article-like URLs found in sitemap", postsDiscovered: 0 };
  }

  // 3. For each post, fetch and extract metadata. Skip if any of the
  //    four required fields can't be determined.
  const extracted: ArticleMeta[] = [];
  const skipped: Array<{ url: string; reason: string }> = [];
  for (const p of posts) {
    try {
      const resp = await fetch(p.url, { headers: { "User-Agent": USER_AGENT } });
      if (!resp.ok) {
        skipped.push({ url: p.url, reason: `HTTP ${resp.status}` });
        continue;
      }
      const html = await resp.text();
      const meta = extractArticleMeta(html, p.url, p.lastmod);
      if (!meta) {
        skipped.push({ url: p.url, reason: "missing required metadata (headline / author / datePublished / image)" });
        continue;
      }
      extracted.push(meta);
    } catch (e) {
      skipped.push({ url: p.url, reason: `fetch error: ${e}` });
    }
  }

  if (extracted.length === 0) {
    return {
      ok: false,
      reason: "no posts had complete metadata",
      postsDiscovered: posts.length,
      postsExtracted: 0,
      skipped,
    };
  }

  // 4. Build + grade + insert each Article schema.
  const insertedIds: number[] = [];
  for (const meta of extracted) {
    const schema = buildArticleSchema(meta);
    const grade = gradeSchema(schema);
    if (!grade.meetsDeployThreshold) {
      skipped.push({ url: meta.url, reason: `quality ${grade.score}: ${grade.issues.slice(0, 2).join("; ")}` });
      continue;
    }
    const targetPath = canonicalPath(meta.url);
    const result = await env.DB.prepare(
      "INSERT INTO schema_injections (client_slug, schema_type, json_ld, target_pages, status, quality_score, quality_graded_at) " +
      "VALUES (?, 'Article', ?, ?, 'pending', ?, unixepoch())"
    ).bind(
      clientSlug,
      JSON.stringify(schema),
      JSON.stringify([targetPath]),
      grade.score,
    ).run();
    insertedIds.push(Number(result.meta?.last_row_id ?? 0));
  }

  if (insertedIds.length > 0) {
    await logSchemaDrafted(
      env,
      clientSlug,
      "Article",
      `${insertedIds.length} blog post${insertedIds.length === 1 ? "" : "s"}`,
      insertedIds[0],
    );
  }

  return {
    ok: true,
    postsDiscovered: posts.length,
    postsExtracted: extracted.length,
    inserted: insertedIds.length,
    skipped,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractAllUrls(sitemapXml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sitemapXml)) !== null) {
    const url = m[1].trim();
    if (url) out.push(url);
  }
  return out;
}

function extractArticleUrls(sitemapXml: string): DiscoveredPost[] {
  // Walk URL entries, capturing both <loc> and the optional <lastmod>.
  const urlRe = /<url>([\s\S]*?)<\/url>/gi;
  const out: DiscoveredPost[] = [];
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(sitemapXml)) !== null) {
    const block = m[1];
    const locMatch = block.match(/<loc>\s*([^<]+?)\s*<\/loc>/i);
    if (!locMatch) continue;
    const url = locMatch[1].trim();
    if (NON_ARTICLE_BLOCKLIST.some((re) => re.test(url))) continue;
    if (!ARTICLE_PATH_PATTERNS.some((re) => re.test(url))) continue;
    const lastmodMatch = block.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/i);
    out.push({ url, lastmod: lastmodMatch ? lastmodMatch[1].trim() : undefined });
  }
  return out;
}

function extractArticleMeta(html: string, url: string, fallbackLastmod?: string): ArticleMeta | null {
  const headline = pickFirst([
    matchMeta(html, "og:title"),
    matchHtml(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i),
    matchTitle(html),
  ]);
  const author = pickFirst([
    matchMeta(html, "author", "name"),
    matchMeta(html, "article:author"),
    matchAuthorByline(html),
  ]);
  const datePublished = pickFirst([
    matchMeta(html, "article:published_time"),
    matchTimePub(html),
    fallbackLastmod,
  ]);
  const image = pickFirst([
    matchMeta(html, "og:image"),
    matchFirstImg(html),
  ]);
  const description = pickFirst([
    matchMeta(html, "og:description"),
    matchMeta(html, "description", "name"),
  ]);
  const dateModified = pickFirst([
    matchMeta(html, "article:modified_time"),
    fallbackLastmod,
  ]);

  if (!headline || !author || !datePublished || !image) return null;
  return {
    url,
    headline: cleanText(headline).slice(0, 180),
    author: cleanText(author).slice(0, 120),
    datePublished: cleanText(datePublished).slice(0, 32),
    image: cleanText(image),
    description: description ? cleanText(description).slice(0, 280) : undefined,
    dateModified: dateModified ? cleanText(dateModified).slice(0, 32) : undefined,
  };
}

function buildArticleSchema(meta: ArticleMeta): unknown {
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": meta.url + "#article",
    headline: meta.headline,
    author: { "@type": "Person", name: meta.author },
    datePublished: meta.datePublished,
    image: meta.image,
    mainEntityOfPage: { "@type": "WebPage", "@id": meta.url },
  };
  if (meta.dateModified) node.dateModified = meta.dateModified;
  if (meta.description) node.description = meta.description;
  return node;
}

function matchMeta(html: string, prop: string, attr: "property" | "name" = "property"): string | null {
  const reA = new RegExp(`<meta\\s+${attr}=["']${escapeRe(prop)}["']\\s+content=["']([^"']+)["']`, "i");
  const reB = new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+${attr}=["']${escapeRe(prop)}["']`, "i");
  const m = html.match(reA) || html.match(reB);
  return m ? m[1] : null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchHtml(html: string, re: RegExp): string | null {
  const m = html.match(re);
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, " ");
}

function matchTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1] : null;
}

function matchTimePub(html: string): string | null {
  const m = html.match(/<time[^>]*datetime=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

function matchAuthorByline(html: string): string | null {
  // Common WordPress / publisher patterns.
  const patterns = [
    /<a[^>]*rel=["']author["'][^>]*>([\s\S]*?)<\/a>/i,
    /class=["'][^"']*\bauthor\b[^"']*["'][^>]*>([\s\S]*?)</i,
    /class=["'][^"']*byline[^"']*["'][^>]*>[^<]*?(?:by\s+)?<[^>]+>([^<]+)</i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      const cleaned = m[1].replace(/<[^>]+>/g, " ").trim();
      if (cleaned && cleaned.length < 80) return cleaned;
    }
  }
  return null;
}

function matchFirstImg(html: string): string | null {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

function pickFirst<T>(items: (T | null | undefined)[]): T | null {
  for (const v of items) if (v) return v;
  return null;
}

function cleanText(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalPath(url: string): string {
  try { return new URL(url).pathname; }
  catch { return "/"; }
}
