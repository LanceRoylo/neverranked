/**
 * Lightweight on-demand domain enrichment.
 *
 * For autonomous Preview generation we don't need the full scan
 * pipeline. We need enough about the prospect's site to write
 * something specific. This helper fetches their homepage, extracts
 * the basics (title, meta, schema types found, common gaps), and
 * returns a compact summary the Preview generator can lean on.
 *
 * Fast: one HTTP fetch, ~1-2 seconds typical. No DB writes. Failures
 * fall back to whatever metadata we already have.
 */

const NR_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) NeverRanked-Bot/1.0 (+https://neverranked.com/bot)";

export interface DomainEnrichment {
  url: string;
  reachable: boolean;
  page_title: string | null;
  meta_description: string | null;
  og_title: string | null;
  og_description: string | null;
  og_site_name: string | null;
  schema_types_found: string[];
  has_organization: boolean;
  has_breadcrumbs: boolean;
  has_faq: boolean;
  has_service: boolean;
  has_aggregate_rating: boolean;
  notable_gaps: string[];      // human-readable gap callouts
  fetch_error: string | null;
}

export async function enrichDomain(domain: string): Promise<DomainEnrichment> {
  const url = `https://${domain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}/`;
  const empty: DomainEnrichment = {
    url,
    reachable: false,
    page_title: null,
    meta_description: null,
    og_title: null,
    og_description: null,
    og_site_name: null,
    schema_types_found: [],
    has_organization: false,
    has_breadcrumbs: false,
    has_faq: false,
    has_service: false,
    has_aggregate_rating: false,
    notable_gaps: [],
    fetch_error: null,
  };

  let html = "";
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": NR_UA, "Accept": "text/html" },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!resp.ok) {
      empty.fetch_error = `HTTP ${resp.status}`;
      return empty;
    }
    html = await resp.text();
  } catch (e) {
    empty.fetch_error = e instanceof Error ? e.message : String(e);
    return empty;
  }

  const out: DomainEnrichment = { ...empty, reachable: true };

  // Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  out.page_title = titleMatch ? decodeEntities(titleMatch[1].trim()).slice(0, 200) : null;

  // Meta description
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  out.meta_description = descMatch ? decodeEntities(descMatch[1]).slice(0, 400) : null;

  // Open Graph
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  out.og_title = ogTitle ? decodeEntities(ogTitle[1]).slice(0, 200) : null;
  const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  out.og_description = ogDesc ? decodeEntities(ogDesc[1]).slice(0, 400) : null;
  const ogSite = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
  out.og_site_name = ogSite ? decodeEntities(ogSite[1]).slice(0, 100) : null;

  // JSON-LD blocks
  const jsonLdRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const seenTypes = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = jsonLdRe.exec(html)) !== null) {
    try {
      const raw = m[1].trim();
      const parsed = JSON.parse(raw) as unknown;
      collectTypes(parsed, seenTypes);
    } catch {
      // skip bad JSON-LD
    }
  }
  out.schema_types_found = [...seenTypes].sort();
  out.has_organization = seenTypes.has("Organization") || seenTypes.has("LocalBusiness");
  out.has_breadcrumbs = seenTypes.has("BreadcrumbList");
  out.has_faq = seenTypes.has("FAQPage");
  out.has_service = seenTypes.has("Service") || seenTypes.has("Product");
  out.has_aggregate_rating = seenTypes.has("AggregateRating") || seenTypes.has("Rating");

  // Compute notable gaps
  const gaps: string[] = [];
  if (!out.has_organization) gaps.push("No Organization or LocalBusiness schema detected on the homepage");
  if (!out.has_breadcrumbs) gaps.push("No BreadcrumbList schema");
  if (!out.has_faq) gaps.push("No FAQPage schema");
  if (!out.has_aggregate_rating) gaps.push("No AggregateRating schema");
  if (out.schema_types_found.length === 0) gaps.push("No structured data found on the homepage at all");
  out.notable_gaps = gaps;

  return out;
}

function collectTypes(node: unknown, set: Set<string>): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) collectTypes(item, set);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  if (typeof t === "string") set.add(t);
  if (Array.isArray(t)) for (const v of t) if (typeof v === "string") set.add(v);
  if (obj["@graph"]) collectTypes(obj["@graph"], set);
  if (obj["mainEntity"]) collectTypes(obj["mainEntity"], set);
  if (obj["itemListElement"]) collectTypes(obj["itemListElement"], set);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
