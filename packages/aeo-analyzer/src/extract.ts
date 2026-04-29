/**
 * AEO Analyzer — Signal extraction from raw HTML
 */

import type { Signals } from "./types";

export function stripHtml(html: string): string {
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

export function countWords(html: string): number {
  const text = stripHtml(html);
  const matches = text.match(/\b\w+\b/g);
  return matches ? matches.length : 0;
}

export function collectSchemaTypes(data: unknown, bucket: string[]): void {
  if (Array.isArray(data)) {
    for (const item of data) collectSchemaTypes(item, bucket);
    return;
  }
  if (!data || typeof data !== "object") return;
  const obj = data as Record<string, unknown>;
  const t = obj["@type"];
  if (t) {
    if (Array.isArray(t)) {
      bucket.push(...t.map(String));
    } else {
      bucket.push(String(t));
    }
  }
  const graph = obj["@graph"];
  if (Array.isArray(graph)) {
    for (const item of graph) collectSchemaTypes(item, bucket);
  }
}

export function extractMeta(html: string, targetUrl: string): Signals {
  // Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : null;

  // Meta description
  let metaDesc: string | null = null;
  let m = html.match(/<meta\s+name=["']description["']\s+content="([^"]*)"/i);
  if (!m) m = html.match(/<meta\s+name=["']description["']\s+content='([^']*)'/i);
  if (!m) m = html.match(/<meta\s+content="([^"]*)"\s+name=["']description["']/i);
  if (!m) m = html.match(/<meta\s+content='([^']*)'\s+name=["']description["']/i);
  if (m) metaDesc = m[1].trim();

  // Canonical
  const canonMatch = html.match(/<link\s+rel=["']canonical["']\s+href=["'](.*?)["']/i);
  const canonical = canonMatch ? canonMatch[1] : null;

  // Robots meta
  const robotsMatch = html.match(/<meta\s+name=["']robots["']\s+content=["'](.*?)["']/i);
  const robotsMeta = robotsMatch ? robotsMatch[1] : null;

  // OG tags
  const ogTitle = /property=["']og:title["']/i.test(html);
  const ogDescription = /property=["']og:description["']/i.test(html);
  const ogImage = /property=["']og:image["']/i.test(html);
  const ogType = /property=["']og:type["']/i.test(html);

  // Twitter cards
  const twitterCard = /name=["']twitter:card["']/i.test(html);
  const twitterImage = /name=["']twitter:image["']/i.test(html);

  // Headings
  const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
  let h1First: string | null = null;
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    h1First = h1Match[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&#\d+;/g, "").replace(/&\w+;/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  }

  // JSON-LD
  const jsonldBlocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  const schemaTypes: string[] = [];
  const personNodes: Record<string, unknown>[] = [];
  let parseErrors = 0;
  for (const block of jsonldBlocks) {
    const inner = block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
    try {
      const data = JSON.parse(inner);
      collectSchemaTypes(data, schemaTypes);
      collectPersonNodes(data, personNodes);
    } catch {
      parseErrors++;
    }
  }

  // Images
  const imgs = html.match(/<img\s+[^>]*?>/gi) || [];
  const imgNoAlt = imgs.filter((i) => !/\balt\s*=/i.test(i)).length;

  // Links
  const linkMatches = html.match(/href=["']([^"']+)["']/gi) || [];
  let internal = 0;
  let external = 0;
  let hostFromCanonical: string | null = null;
  try {
    const parsed = new URL(canonical || targetUrl);
    hostFromCanonical = parsed.hostname;
  } catch {}

  for (const lm of linkMatches) {
    const hrefMatch = lm.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) continue;
    if (href.startsWith("/")) {
      internal++;
    } else if (href.startsWith("http")) {
      try {
        const parsed = new URL(href);
        if (hostFromCanonical && parsed.hostname === hostFromCanonical) {
          internal++;
        } else {
          external++;
        }
      } catch {
        internal++;
      }
    } else {
      internal++;
    }
  }

  // Author meta (Phase 4A): <meta name="author" content="...">
  let authorMeta: string | null = null;
  const am = html.match(/<meta\s+name=["']author["']\s+content=["']([^"']+)["']/i)
          || html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']author["']/i);
  if (am) authorMeta = am[1].trim().slice(0, 200) || null;

  // Person schema (Phase 4A): named-author signal in JSON-LD.
  const hasPersonSchema = schemaTypes.some(t => t.toLowerCase() === "person");

  // Trust-profile outbound links (Phase 4A). Match canonical platform
  // domains in the raw href set we already captured. Capture the full
  // URL so admins can verify the profile is real before trusting it.
  const TRUST_PLATFORMS: { platform: string; pattern: RegExp }[] = [
    { platform: "g2",         pattern: /(?:^|\.)g2\.com\//i },
    { platform: "trustpilot", pattern: /(?:^|\.)trustpilot\.com\//i },
    { platform: "capterra",   pattern: /(?:^|\.)capterra\.com\//i },
    { platform: "yelp",       pattern: /(?:^|\.)yelp\.com\/biz\//i },
    { platform: "bbb",        pattern: /(?:^|\.)bbb\.org\//i },
    { platform: "google_business", pattern: /(?:^|\.)google\.com\/maps\/place\//i },
    { platform: "glassdoor",  pattern: /(?:^|\.)glassdoor\.com\/(?:Reviews|Overview)/i },
    { platform: "clutch",     pattern: /(?:^|\.)clutch\.co\/profile\//i },
  ];
  const seenTrust = new Set<string>();
  const trustProfileLinks: { platform: string; url: string }[] = [];
  for (const lm of linkMatches) {
    const hrefMatch = lm.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];
    if (!href.startsWith("http")) continue;
    for (const tp of TRUST_PLATFORMS) {
      if (tp.pattern.test(href)) {
        const key = `${tp.platform}|${href}`;
        if (seenTrust.has(key)) break;
        seenTrust.add(key);
        trustProfileLinks.push({ platform: tp.platform, url: href });
        break;
      }
    }
  }

  // Word count
  const wordCount = countWords(html);

  // Social proof
  const hasRatingText = /(\d[\.,]?\d?)\s*(?:stars?|\/\s*5|out of 5)/i.test(html);
  const hasTestimonialText = /testimonial|review|trusted by|\d{1,3}[,.]?\d{3}\+?\s*(?:agents|users|customers|listings|clients)/i.test(html);

  return {
    title,
    title_len: title ? title.length : 0,
    meta_desc: metaDesc,
    meta_desc_len: metaDesc ? metaDesc.length : 0,
    canonical,
    robots_meta: robotsMeta,
    og_title: ogTitle,
    og_description: ogDescription,
    og_image: ogImage,
    og_type: ogType,
    twitter_card: twitterCard,
    twitter_image: twitterImage,
    h1_count: h1Count,
    h1_first: h1First,
    jsonld_block_count: jsonldBlocks.length,
    jsonld_parse_errors: parseErrors,
    schema_types: schemaTypes,
    img_count: imgs.length,
    img_no_alt: imgNoAlt,
    links_internal: internal,
    links_external: external,
    word_count: wordCount,
    has_rating_text: hasRatingText,
    has_testimonial_text: hasTestimonialText,
    author_meta: authorMeta,
    has_person_schema: hasPersonSchema,
    person_nodes: personNodes,
    trust_profile_links: trustProfileLinks,
  };
}

/** Walk a parsed JSON-LD blob and collect every Person node we
 *  encounter (top-level, nested via @graph, or via author / creator
 *  / publisher properties). Used by the schema-grader to score
 *  Person completeness instead of treating presence as binary. */
export function collectPersonNodes(data: unknown, bucket: Record<string, unknown>[]): void {
  if (Array.isArray(data)) {
    for (const item of data) collectPersonNodes(item, bucket);
    return;
  }
  if (!data || typeof data !== "object") return;
  const obj = data as Record<string, unknown>;
  const t = obj["@type"];
  const isPerson = t === "Person" || (Array.isArray(t) && t.includes("Person"));
  if (isPerson) {
    bucket.push(obj);
  }
  // Walk @graph and the common containers where Person nodes nest.
  const recurseKeys = ["@graph", "author", "creator", "publisher", "editor", "contributor", "founder"];
  for (const k of recurseKeys) {
    if (k in obj) collectPersonNodes(obj[k], bucket);
  }
}
