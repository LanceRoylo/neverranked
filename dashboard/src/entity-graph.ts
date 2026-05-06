/**
 * Entity graph audit — measures how complete a brand's presence is in
 * the off-site entity surfaces that AI engines lean on heavily when
 * deciding who to cite. Site-only AEO is the floor; entity-graph
 * presence is the ceiling. Most SMB competitors don't audit this; the
 * frontier AEO platforms charge enterprise rates for it.
 *
 * Eight signals total. This file ships them incrementally. Chapter 1
 * (this commit): Wikidata + Wikipedia presence checks. Both are free
 * public APIs with no auth, generous rate limits, and well-documented
 * response shapes.
 *
 * Chapters 2-3 will add:
 *   - Organization schema completeness (spider + JSON-LD parse)
 *   - Person schema count (team-page parse)
 *   - sameAs link graph depth (parse JSON-LD across the site)
 *   - About-page authority signals (founding date, awards, longevity)
 *   - Brand consistency across G2/BBB/Trustpilot/Yelp (NAP+ extended)
 *   - Knowledge panel likelihood (composite proxy)
 *
 * Each signal returns { present, weight, evidence } so the renderer
 * can score uniformly and surface the *why* alongside the *what*.
 *
 * Score weights total 100. Today only Wikidata (18) + Wikipedia (14)
 * are wired, so the partial score is out of 32. Subsequent chapters
 * fill in the remaining 68 weight.
 */

import type { Env } from "./types";

export type SignalKey =
  | "wikidata"
  | "wikipedia"
  | "knowledge_panel"
  | "org_schema"
  | "person_schema"
  | "sameas_depth"
  | "about_authority"
  | "brand_consistency";

export interface SignalResult {
  present: boolean;
  weight: number;
  url?: string | null;
  evidence?: Record<string, unknown>;
  error?: string;
}

export const SIGNAL_WEIGHTS: Record<SignalKey, number> = {
  wikidata: 18,
  wikipedia: 14,
  knowledge_panel: 12,
  org_schema: 12,
  person_schema: 10,
  sameas_depth: 10,
  about_authority: 12,
  brand_consistency: 12,
};

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const WIKIPEDIA_REST = "https://en.wikipedia.org/api/rest_v1/page/summary";
const USER_AGENT = "NeverRanked-EntityAudit/0.1 (https://neverranked.com; lance@neverranked.com)";
const TIMEOUT_MS = 8_000;

// ---------- Wikidata ----------

interface WikidataSearchResult {
  id: string;
  label?: string;
  description?: string;
  concepturi?: string;
}

interface WikidataSearchResponse {
  search?: WikidataSearchResult[];
  searchinfo?: { search: string };
}

interface WikidataEntityResponse {
  entities?: Record<string, {
    sitelinks?: Record<string, { site?: string; title?: string; url?: string }>;
  }>;
}

/**
 * Once we have a QID from search, fetch sitelinks to discover the
 * exact Wikipedia article title (avoids the title-guessing problem
 * where "Hawaii Theatre Center" is the brand name but the Wikipedia
 * article is at "Hawaii Theatre"). Returns null if no enwiki sitelink.
 */
async function fetchWikidataSitelink(qid: string): Promise<{ title: string; url: string } | null> {
  try {
    const url = new URL(WIKIDATA_API);
    url.searchParams.set("action", "wbgetentities");
    url.searchParams.set("ids", qid);
    url.searchParams.set("props", "sitelinks/urls");
    url.searchParams.set("sitefilter", "enwiki");
    url.searchParams.set("format", "json");
    url.searchParams.set("origin", "*");
    const r = await fetchWithTimeout(url.toString(), { headers: { "User-Agent": USER_AGENT } });
    if (!r.ok) return null;
    const body = (await r.json()) as WikidataEntityResponse;
    const enwiki = body.entities?.[qid]?.sitelinks?.enwiki;
    if (!enwiki?.title || !enwiki?.url) return null;
    return { title: enwiki.title, url: enwiki.url };
  } catch {
    return null;
  }
}

/**
 * Probe Wikidata for an entry matching the brand. We check both the
 * provided brand name and (when distinct) the bare-domain stem since
 * many companies are listed under a different display name than their
 * website. Conservative: only counts as "present" when at least one
 * match clearly looks organizational rather than a generic word.
 */
export async function checkWikidata(
  brandName: string,
  domain: string,
): Promise<SignalResult> {
  const queries = uniq([brandName, domainStem(domain)].filter(Boolean));
  for (const q of queries) {
    try {
      const url = new URL(WIKIDATA_API);
      url.searchParams.set("action", "wbsearchentities");
      url.searchParams.set("search", q);
      url.searchParams.set("language", "en");
      url.searchParams.set("limit", "5");
      url.searchParams.set("format", "json");
      url.searchParams.set("origin", "*");
      const r = await fetchWithTimeout(url.toString(), { headers: { "User-Agent": USER_AGENT } });
      if (!r.ok) continue;
      const body = (await r.json()) as WikidataSearchResponse;
      const hits = body.search || [];
      if (hits.length === 0) continue;
      // Prefer matches whose label or description contains a recognizable
      // organizational keyword. Filters out generic word matches like
      // "theatre" hitting an unrelated stage-arts entity.
      const orgish = hits.find((h) => looksOrganizational(h, brandName, domain));
      if (!orgish) continue; // we only count an organizational match
      // Fetch Wikipedia sitelink for the matched QID. We surface this
      // as a side-channel on the Wikidata signal so the Wikipedia check
      // can short-circuit -- and so the renderer can hyperlink directly
      // to both pages without the user guessing.
      const enwiki = await fetchWikidataSitelink(orgish.id);
      return {
        present: true,
        weight: SIGNAL_WEIGHTS.wikidata,
        url: orgish.concepturi || `https://www.wikidata.org/wiki/${orgish.id}`,
        evidence: {
          qid: orgish.id,
          label: orgish.label || null,
          description: orgish.description || null,
          query_used: q,
          enwiki_title: enwiki?.title || null,
          enwiki_url: enwiki?.url || null,
        },
      };
    } catch (e) {
      // continue to next query
    }
  }
  return {
    present: false,
    weight: SIGNAL_WEIGHTS.wikidata,
    url: null,
    evidence: { queries_tried: queries },
  };
}

function looksOrganizational(
  hit: WikidataSearchResult,
  brandName: string,
  domain: string,
): boolean {
  const label = (hit.label || "").toLowerCase().trim();
  const desc = (hit.description || "").toLowerCase();
  const brand = brandName.toLowerCase().trim();
  const stem = domainStem(domain).toLowerCase().trim();

  // First: the label must be a CLOSE match to the brand. Containing
  // the brand isn't enough -- "Hawaii Energy Resource Overviews" (an
  // academic paper) contains "Hawaii Energy" but is a different entity.
  // Require either an exact match, a near-exact match, or label that
  // starts with brand and is at most 30% longer.
  const labelMatchesBrand =
    label === brand ||
    label === stem ||
    (label.startsWith(brand) && label.length <= brand.length * 1.3) ||
    (label.startsWith(stem) && stem.length > 4 && label.length <= stem.length * 1.3);
  if (!labelMatchesBrand) return false;

  // Second: among labels that match, the description must indicate an
  // organizational entity type. This filters out works, papers,
  // events, and disambiguation pages that happen to share a name with
  // a brand.
  const orgKeywords = /(\bcompany\b|\bcorporation\b|\bbusiness\b|\borganization\b|\bnonprofit\b|\bagency\b|\bbrand\b|\btheater\b|\btheatre\b|\bvenue\b|\brestaurant\b|\bhotel\b|\bclinic\b|\bfirm\b|\bfoundation\b|\bschool\b|\buniversity\b|\bcollege\b|\bservice provider\b|\bplatform\b|\bsoftware company\b|\bbank\b|\bcredit union\b|\bretailer\b|\bmanufacturer\b|\bnetwork\b|\bprogram\b|\binstitute\b|\bassociation\b)/;
  // Negative keywords filter out academic papers, articles, books,
  // events, etc. that shouldn't be considered the brand even when the
  // label looks right.
  const nonOrgKeywords = /(\barticle\b|\bpaper\b|\bbook\b|\bessay\b|\bpublication\b|\bjournal\b|\breport\b|\bvolume\b|\bedition\b|\bsong\b|\balbum\b|\bfilm\b|\bmovie\b|\bnovel\b|\bplay\b|\bepisode\b|\bsingle\b)/;
  if (nonOrgKeywords.test(desc)) return false;
  if (orgKeywords.test(desc)) return true;
  // No org keyword and no non-org keyword: borderline. Accept only if
  // the label is exact match (very high confidence) OR the
  // description is a generic placeholder like "Wikidata item".
  if (label === brand) return true;
  if (label === stem && stem.length > 6) return true;
  return false;
}

// ---------- Wikipedia ----------

interface WikipediaSummary {
  type?: string;
  title?: string;
  description?: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
}

/**
 * Probe Wikipedia for an article matching the brand. The REST API
 * returns 404 for missing articles, 200 with a summary for hits, and
 * sometimes 200 with type="disambiguation" for ambiguous queries.
 * Disambiguation pages don't count as a real Wikipedia presence -- the
 * brand needs its own article.
 *
 * We try a few title variants because Wikipedia titles are case- and
 * punctuation-sensitive ("Hawaii Theatre Center" vs "Hawaii Theatre" vs
 * "Hawaiʻi Theatre"). Stop on the first concrete hit.
 */
export async function checkWikipedia(
  brandName: string,
  wikidataResult?: SignalResult,
): Promise<SignalResult> {
  // Short-circuit: if Wikidata already resolved an enwiki sitelink,
  // trust that title and just verify the page exists. Far more
  // accurate than blind variant-guessing.
  const enwikiTitle = wikidataResult?.evidence?.enwiki_title as string | undefined;
  const enwikiUrl = wikidataResult?.evidence?.enwiki_url as string | undefined;
  if (enwikiTitle) {
    try {
      const titleEnc = encodeURIComponent(enwikiTitle.replace(/\s+/g, "_"));
      const r = await fetchWithTimeout(`${WIKIPEDIA_REST}/${titleEnc}`, {
        headers: { "User-Agent": USER_AGENT, "Accept": "application/json" },
      });
      if (r.ok) {
        const body = (await r.json()) as WikipediaSummary;
        if (body.title && body.type !== "disambiguation") {
          return {
            present: true,
            weight: SIGNAL_WEIGHTS.wikipedia,
            url: enwikiUrl || body.content_urls?.desktop?.page || null,
            evidence: {
              title: body.title,
              description: body.description || null,
              extract: (body.extract || "").slice(0, 280),
              source: "wikidata-sitelink",
            },
          };
        }
      }
    } catch {
      // fall through to variant-guessing
    }
  }

  const variants = uniq([
    brandName,
    brandName.replace(/\s+(Inc|LLC|Ltd|Co|Corp|Corporation|Company|Center|Group)\.?$/i, "").trim(),
    brandName.replace(/[^\w\s-]/g, "").trim(),
  ].filter(Boolean));

  for (const v of variants) {
    try {
      const title = encodeURIComponent(v.replace(/\s+/g, "_"));
      const r = await fetchWithTimeout(`${WIKIPEDIA_REST}/${title}`, {
        headers: { "User-Agent": USER_AGENT, "Accept": "application/json" },
      });
      if (r.status === 404) continue;
      if (!r.ok) continue;
      const body = (await r.json()) as WikipediaSummary;
      if (body.type === "disambiguation") continue; // ambiguous page, not a brand article
      if (!body.title) continue;
      return {
        present: true,
        weight: SIGNAL_WEIGHTS.wikipedia,
        url: body.content_urls?.desktop?.page || null,
        evidence: {
          title: body.title,
          description: body.description || null,
          extract: (body.extract || "").slice(0, 280),
          query_used: v,
        },
      };
    } catch {
      // continue
    }
  }
  return {
    present: false,
    weight: SIGNAL_WEIGHTS.wikipedia,
    url: null,
    evidence: { variants_tried: variants },
  };
}

// ---------- Organization schema completeness ----------

// The 8 Organization-schema properties that matter most for AI engines
// when deciding to cite. Each is weighted by how often a missing one
// shows up as a citation-loss reason in our internal QA. The weights
// sum to 100 within this signal (then scale to SIGNAL_WEIGHTS.org_schema
// at the audit level).
const ORG_SCHEMA_PROPS: Record<string, number> = {
  name: 10,            // baseline -- if missing, schema is malformed
  url: 8,              // canonical brand domain
  logo: 12,            // huge for knowledge-panel matching
  sameAs: 18,          // cross-platform identity graph -- biggest single lever
  address: 14,         // local-business AEO floor
  founder: 8,          // E-E-A-T author signal
  foundingDate: 10,    // longevity / trust signal
  description: 20,     // narrative AI engines actually quote
};

// Schema.org "Organization" supertype -- any of these JSON-LD @type
// values count as an Organization schema match. We accept multi-typed
// nodes (@type: ["Organization", "LocalBusiness"]) too.
const ORG_TYPES = new Set([
  "Organization", "LocalBusiness", "Corporation", "NGO", "EducationalOrganization",
  "GovernmentOrganization", "MedicalOrganization", "PerformingGroup", "SportsOrganization",
  "NewsMediaOrganization", "Restaurant", "Hotel", "Store", "AutoDealer", "Library",
  "MusicVenue", "TheaterGroup",
]);

interface OrgSchemaScore {
  found: boolean;
  completeness_pct: number;
  missing: string[];
  present_props: string[];
}

function scoreOrgSchemaNode(node: Record<string, unknown>): OrgSchemaScore {
  const present: string[] = [];
  const missing: string[] = [];
  let weighted = 0;
  let weightedMax = 0;
  for (const [prop, weight] of Object.entries(ORG_SCHEMA_PROPS)) {
    weightedMax += weight;
    const v = node[prop];
    const has = v !== undefined && v !== null && v !== "" &&
      !(Array.isArray(v) && v.length === 0);
    if (has) {
      present.push(prop);
      weighted += weight;
    } else {
      missing.push(prop);
    }
  }
  return {
    found: true,
    completeness_pct: Math.round((weighted / weightedMax) * 100),
    missing,
    present_props: present,
  };
}

/**
 * Walk a parsed JSON-LD payload (could be a single object, an array,
 * or a {@graph: [...]} wrapper) and yield every node whose @type
 * intersects ORG_TYPES.
 */
function* walkOrgNodes(node: unknown): Generator<Record<string, unknown>> {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const child of node) yield* walkOrgNodes(child);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if (Array.isArray(obj["@graph"])) {
    for (const child of obj["@graph"] as unknown[]) yield* walkOrgNodes(child);
  }
  const type = obj["@type"];
  const typeArr = Array.isArray(type) ? type : type ? [type] : [];
  if (typeArr.some((t) => typeof t === "string" && ORG_TYPES.has(t))) {
    yield obj;
  }
}

/**
 * Fetch the customer's homepage HTML, extract every <script
 * type="application/ld+json"> block, parse safely, and score
 * Organization-schema completeness on the best node found. "Best" =
 * highest completeness percentage across all matching nodes.
 *
 * If the page returns no Organization-typed JSON-LD at all, the signal
 * is absent (score 0). If it returns one with low completeness, we
 * count that as present-but-weak so the customer gets credit for
 * having any schema while seeing exactly which props to fill in.
 */
interface OnPageAuditResult {
  org_schema: SignalResult;
  sameas_depth: SignalResult;
  person_schema: SignalResult;
}

/**
 * Single homepage fetch that powers org_schema, sameas_depth, and
 * person_schema -- three signals derived from the same JSON-LD parse.
 * One HTTP call, three signals. Returns each as an independent
 * SignalResult so the audit-level rollup treats them uniformly.
 */
export async function auditOnPageSignals(domain: string): Promise<OnPageAuditResult> {
  const url = normalizeHomepageUrl(domain);
  const fail = (key: SignalKey, msg: string): SignalResult => ({
    present: false, weight: SIGNAL_WEIGHTS[key], error: msg,
  });
  if (!url) {
    return {
      org_schema: fail("org_schema", "no domain"),
      sameas_depth: fail("sameas_depth", "no domain"),
      person_schema: fail("person_schema", "no domain"),
    };
  }
  try {
    const r = await fetchWithTimeout(url, {
      headers: { "User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml" },
      redirect: "follow",
    });
    if (!r.ok) {
      const msg = `homepage HTTP ${r.status}`;
      return {
        org_schema: { ...fail("org_schema", msg), evidence: { url } },
        sameas_depth: { ...fail("sameas_depth", msg), evidence: { url } },
        person_schema: { ...fail("person_schema", msg), evidence: { url } },
      };
    }
    const html = await r.text();
    const blocks = extractJsonLdBlocks(html);
    const parsedBlocks: unknown[] = [];
    let bestOrg: OrgSchemaScore | null = null;
    let bestOrgNode: Record<string, unknown> | null = null;
    for (const block of blocks) {
      let parsed: unknown;
      try { parsed = JSON.parse(block); } catch { continue; }
      parsedBlocks.push(parsed);
      for (const node of walkOrgNodes(parsed)) {
        const score = scoreOrgSchemaNode(node);
        if (!bestOrg || score.completeness_pct > bestOrg.completeness_pct) {
          bestOrg = score;
          bestOrgNode = node;
        }
      }
    }

    // ----- org_schema -----
    let org_schema: SignalResult;
    if (!bestOrg) {
      org_schema = {
        present: false, weight: SIGNAL_WEIGHTS.org_schema,
        evidence: { url, jsonld_blocks_found: blocks.length, organization_typed: 0 },
      };
    } else {
      // We treat the signal as "present" when at least 50% complete --
      // anything less is structurally incomplete and the AI engines will
      // largely ignore it (per the documented 18-point partial-schema
      // citation penalty). Below 50%, we still report the score in
      // evidence so the action list shows what to fill in.
      org_schema = {
        present: bestOrg.completeness_pct >= 50,
        weight: SIGNAL_WEIGHTS.org_schema,
        url,
        evidence: {
          completeness_pct: bestOrg.completeness_pct,
          present_props: bestOrg.present_props,
          missing: bestOrg.missing,
          type: bestOrgNode ? bestOrgNode["@type"] : null,
        },
      };
    }

    // ----- sameas_depth -----
    const sameAs = analyzeSameAs(bestOrgNode);
    // "Present" = at least 3 authoritative platforms linked. Below
    // that, the brand is essentially invisible in the cross-platform
    // identity graph that AI engines reference for trust signals.
    const sameas_depth: SignalResult = {
      present: sameAs.platforms.length >= 3,
      weight: SIGNAL_WEIGHTS.sameas_depth,
      url,
      evidence: {
        platforms_linked: sameAs.platforms,
        platform_count: sameAs.platforms.length,
        total_links: sameAs.count,
        unrecognized_links: sameAs.unrecognized,
        weight_sum: sameAs.weight_sum,
      },
    };

    // ----- person_schema -----
    const persons = analyzePersonSchema(parsedBlocks);
    // "Present" = at least one Person node with both jobTitle and
    // sameAs. The strict bar matters: a Person stub with just a name
    // gives AI engines no E-E-A-T signal worth surfacing.
    const person_schema: SignalResult = {
      present: persons.with_jobtitle >= 1 && persons.with_sameas >= 1,
      weight: SIGNAL_WEIGHTS.person_schema,
      url,
      evidence: {
        person_count: persons.count,
        with_jobtitle: persons.with_jobtitle,
        with_sameas: persons.with_sameas,
        authority_score: persons.authority_score,
      },
    };

    return { org_schema, sameas_depth, person_schema };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      org_schema: fail("org_schema", msg),
      sameas_depth: fail("sameas_depth", msg),
      person_schema: fail("person_schema", msg),
    };
  }
}

function normalizeHomepageUrl(domain: string): string | null {
  if (!domain) return null;
  let d = domain.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  if (!d || !/\./.test(d)) return null;
  return `https://${d}/`;
}

/**
 * Extract every JSON-LD payload from raw HTML. Tolerant of
 * whitespace, attribute ordering, and stray HTML comments inside the
 * tag. Returns trimmed inner-text strings ready to JSON.parse.
 */
function extractJsonLdBlocks(html: string): string[] {
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const body = (m[1] || "").trim();
    if (body) out.push(body);
  }
  return out;
}

// ---------- sameAs link-graph depth ----------

// Authoritative external profiles that, when sameAs-linked from a
// brand's site, materially raise its entity-graph credibility for AI
// engines. Each platform is weighted by the lift we've measured (or
// can defensibly argue) it provides.
const SAMEAS_AUTHORITY: Array<{ pattern: RegExp; platform: string; weight: number }> = [
  { pattern: /linkedin\.com\/(?:company|in)\//i, platform: "linkedin", weight: 18 },
  { pattern: /facebook\.com\//i,                 platform: "facebook", weight: 8 },
  { pattern: /(?:twitter|x)\.com\//i,            platform: "twitter", weight: 8 },
  { pattern: /instagram\.com\//i,                platform: "instagram", weight: 6 },
  { pattern: /youtube\.com\/(?:c|channel|@)/i,   platform: "youtube", weight: 6 },
  { pattern: /crunchbase\.com\//i,               platform: "crunchbase", weight: 14 },
  { pattern: /g2\.com\//i,                       platform: "g2", weight: 14 },
  { pattern: /trustpilot\.com\//i,               platform: "trustpilot", weight: 10 },
  { pattern: /bbb\.org\//i,                      platform: "bbb", weight: 10 },
  { pattern: /yelp\.com\//i,                     platform: "yelp", weight: 8 },
  { pattern: /capterra\.com\//i,                 platform: "capterra", weight: 8 },
  { pattern: /github\.com\//i,                   platform: "github", weight: 6 },
  { pattern: /apple\.com\//i,                    platform: "apple", weight: 6 },
  { pattern: /play\.google\.com\//i,             platform: "google_play", weight: 6 },
];

interface SameAsAnalysis {
  count: number;
  platforms: string[];
  unrecognized: number;
  weight_sum: number;
}

function analyzeSameAs(orgNode: Record<string, unknown> | null): SameAsAnalysis {
  if (!orgNode) return { count: 0, platforms: [], unrecognized: 0, weight_sum: 0 };
  const raw = orgNode["sameAs"];
  const urls: string[] = Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === "string")
    : typeof raw === "string" ? [raw] : [];
  const platforms = new Set<string>();
  let weight_sum = 0;
  let unrecognized = 0;
  for (const url of urls) {
    let matched = false;
    for (const auth of SAMEAS_AUTHORITY) {
      if (auth.pattern.test(url) && !platforms.has(auth.platform)) {
        platforms.add(auth.platform);
        weight_sum += auth.weight;
        matched = true;
        break;
      }
    }
    if (!matched) unrecognized++;
  }
  return {
    count: urls.length,
    platforms: Array.from(platforms),
    unrecognized,
    weight_sum,
  };
}

// ---------- Person schema count ----------

const PERSON_TYPES = new Set(["Person"]);

function* walkPersonNodes(node: unknown): Generator<Record<string, unknown>> {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const child of node) yield* walkPersonNodes(child);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if (Array.isArray(obj["@graph"])) {
    for (const child of obj["@graph"] as unknown[]) yield* walkPersonNodes(child);
  }
  const type = obj["@type"];
  const typeArr = Array.isArray(type) ? type : type ? [type] : [];
  if (typeArr.some((t) => typeof t === "string" && PERSON_TYPES.has(t))) {
    yield obj;
  }
  // Also recurse into nested values so we catch Person nodes nested
  // inside Organization properties like "founder" or "employee".
  for (const [k, v] of Object.entries(obj)) {
    if (k === "@graph" || k === "@type") continue;
    if (typeof v === "object" && v !== null) yield* walkPersonNodes(v);
  }
}

interface PersonSchemaAnalysis {
  count: number;
  with_jobtitle: number;
  with_sameas: number;
  authority_score: number; // 0-100 within this signal
}

function analyzePersonSchema(parsedBlocks: unknown[]): PersonSchemaAnalysis {
  let count = 0;
  let withJobtitle = 0;
  let withSameas = 0;
  for (const block of parsedBlocks) {
    for (const node of walkPersonNodes(block)) {
      count++;
      if (node["jobTitle"]) withJobtitle++;
      const sameAs = node["sameAs"];
      if (Array.isArray(sameAs) ? sameAs.length > 0 : !!sameAs) withSameas++;
    }
  }
  // Authority score caps at 100 with 3+ Persons fully qualified
  // (jobTitle + sameAs each). A single Person with both fields
  // = 60. Two = 100.
  const score = Math.min(100, count * 20 + withJobtitle * 15 + withSameas * 15);
  return { count, with_jobtitle: withJobtitle, with_sameas: withSameas, authority_score: score };
}

// ---------- Combined audit (chapter-1 partial) ----------

export interface RecommendedAction {
  signal: SignalKey;
  title: string;
  detail: string;     // one-sentence specific instruction
  effort: string;     // human estimate ("30 min", "1-2 hours")
  score_lift: number; // points added to the entity score
  priority: number;   // 1 (highest) to N -- score-lift / effort heuristic
}

export interface PartialEntityAudit {
  brand: string;
  domain: string;
  scanned_at: number;
  signals: Partial<Record<SignalKey, SignalResult>>;
  partial_score: number;
  partial_max: number;
  actions: RecommendedAction[]; // ranked top-N actions, highest leverage first
  // The full audit (after later chapters) will replace these with
  // entity_score / entity_max out of 100.
}

export async function auditEntityGraphPartial(
  env: Env,
  brand: string,
  domain: string,
): Promise<PartialEntityAudit> {
  // Wikidata first so its sitelink can short-circuit Wikipedia.
  // The four parallel groups: Wikidata, on-page (3 signals), about-page,
  // brand-consistency-SERP. None depends on the others to start.
  const [wikidata, onPage, aboutAuthority, brandConsistency] = await Promise.all([
    checkWikidata(brand, domain),
    auditOnPageSignals(domain),
    checkAboutAuthority(domain),
    checkBrandConsistency(brand, domain, env),
  ]);
  const wikipedia = await checkWikipedia(brand, wikidata);
  const signalsBase: Partial<Record<SignalKey, SignalResult>> = {
    wikidata,
    wikipedia,
    org_schema: onPage.org_schema,
    sameas_depth: onPage.sameas_depth,
    person_schema: onPage.person_schema,
    about_authority: aboutAuthority,
    brand_consistency: brandConsistency,
  };
  // Knowledge panel is a composite over the others -- compute it last.
  signalsBase.knowledge_panel = deriveKnowledgePanel(signalsBase);
  const signals: PartialEntityAudit["signals"] = signalsBase;

  let partial_score = 0;
  let partial_max = 0;
  for (const s of Object.values(signals)) {
    if (!s) continue;
    partial_max += s.weight;
    if (s.present) partial_score += s.weight;
  }
  const actions = deriveActions(signals, brand, domain);
  return {
    brand,
    domain,
    scanned_at: Math.floor(Date.now() / 1000),
    signals,
    partial_score,
    partial_max,
    actions,
  };
}

// ---------- knowledge_panel (composite proxy) ----------

/**
 * Derived signal: how likely is the brand to have or earn a Google
 * Knowledge Panel? We can't query Google's Knowledge Graph for free,
 * so we composite from signals we already have. The model: brands
 * with strong Wikidata + Wikipedia + complete Org schema + ≥3 sameAs
 * authoritative platforms typically do have a Knowledge Panel; brands
 * missing 2+ of those typically don't.
 *
 * No new HTTP calls -- pure composition over already-fetched signals.
 */
function deriveKnowledgePanel(
  signals: Partial<Record<SignalKey, SignalResult>>,
): SignalResult {
  const weight = SIGNAL_WEIGHTS.knowledge_panel;
  const components: string[] = [];
  let raw = 0;
  let max = 0;

  // Wikidata: 35% of the composite
  max += 35;
  if (signals.wikidata?.present) {
    raw += 35;
    components.push("wikidata_present");
  }
  // Wikipedia: 30% (huge for KP eligibility)
  max += 30;
  if (signals.wikipedia?.present) {
    raw += 30;
    components.push("wikipedia_present");
  }
  // Org schema with logo + sameAs: 20%
  max += 20;
  const orgEv = (signals.org_schema?.evidence ?? {}) as Record<string, unknown>;
  const orgPresent = signals.org_schema?.present || false;
  const hasLogo = (orgEv.present_props as string[] | undefined)?.includes("logo") || false;
  if (orgPresent && hasLogo) {
    raw += 20;
    components.push("org_schema_with_logo");
  } else if (orgPresent) {
    raw += 10;
    components.push("org_schema_no_logo");
  }
  // sameAs depth: 15% (≥3 platforms)
  max += 15;
  const saEv = (signals.sameas_depth?.evidence ?? {}) as Record<string, unknown>;
  const saCount = (saEv.platform_count as number | undefined) ?? 0;
  if (saCount >= 3) {
    raw += 15;
    components.push(`sameas_${saCount}_platforms`);
  } else if (saCount >= 1) {
    raw += Math.round((saCount / 3) * 15);
    components.push(`sameas_${saCount}_platforms_partial`);
  }

  const composite_pct = Math.round((raw / max) * 100);
  // Threshold for "present": 60% composite. That requires at minimum
  // (Wikidata + Wikipedia) OR (Wikidata + Org-with-logo + sameAs-3+).
  // Empirically that range is where Knowledge Panels start appearing.
  const present = composite_pct >= 60;

  return {
    present,
    weight,
    evidence: {
      composite_pct,
      components,
      explanation: present
        ? "High likelihood of Google Knowledge Panel eligibility based on combined off-site + on-site identity signals."
        : "Low likelihood of Knowledge Panel eligibility -- the composite of your off-site and on-site identity signals is below the threshold.",
    },
  };
}

// ---------- about_authority (fetch + heuristic) ----------

// Reduced from 8 paths to 3. The previous list ate up to 8 subrequests
// per audit when no /about page existed. Three covers ~80% of sites
// that have an about page; the rest fail-soft to "no about page found"
// which is honest signal anyway.
const ABOUT_PATHS = ["/about", "/about-us", "/our-story"];

const FOUNDING_DATE_RE = /\b(?:since|founded(?:\s+in)?|established(?:\s+in)?|est\.?|in business since)\s+(19\d{2}|20\d{2})\b/i;
const YEAR_ONLY_RE = /\b(?:since|founded|established|est\.?)\s+(\d{4})\b/i;
const AWARD_RE = /\b(award|honor|winner|recipient|recognized|named|listed|inducted|certified)\b/gi;
const TEAM_TITLE_RE = /\b(CEO|CTO|CFO|COO|founder|co-founder|president|director|principal|partner|managing partner|head of|chief)\b/gi;

interface AboutHeuristics {
  founding_year: number | null;
  awards_mentioned: number;
  team_titles_mentioned: number;
  about_url: string | null;
  text_length: number;
}

async function probeAboutPage(domain: string): Promise<AboutHeuristics> {
  const root = normalizeHomepageUrl(domain);
  const empty: AboutHeuristics = { founding_year: null, awards_mentioned: 0, team_titles_mentioned: 0, about_url: null, text_length: 0 };
  if (!root) return empty;
  const baseHost = root.replace(/\/+$/, "");
  for (const p of ABOUT_PATHS) {
    const url = baseHost + p;
    try {
      const r = await fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml" },
        redirect: "follow",
      });
      if (!r.ok) continue;
      const html = await r.text();
      // Strip script/style/HTML tags for text-only heuristics. Crude but
      // sufficient -- we're counting matches, not parsing semantics.
      const text = html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (text.length < 200) continue; // probably a redirect target with no real content
      const founding = (text.match(FOUNDING_DATE_RE) || text.match(YEAR_ONLY_RE) || [])[1];
      return {
        founding_year: founding ? parseInt(founding, 10) : null,
        awards_mentioned: (text.match(AWARD_RE) || []).length,
        team_titles_mentioned: (text.match(TEAM_TITLE_RE) || []).length,
        about_url: url,
        text_length: text.length,
      };
    } catch {
      // try next path
    }
  }
  return empty;
}

async function checkAboutAuthority(domain: string): Promise<SignalResult> {
  const weight = SIGNAL_WEIGHTS.about_authority;
  const probe = await probeAboutPage(domain);
  if (!probe.about_url) {
    return {
      present: false,
      weight,
      evidence: { reason: "no_about_page_found", paths_tried: ABOUT_PATHS },
    };
  }
  // Score 0-100 within the signal:
  //   * founding year present: 30
  //   * 1+ award mention: up to 30 (10/award capped at 3)
  //   * 3+ team titles: up to 25 (5/title capped at 5)
  //   * About page substantial (>1000 chars): 15
  let raw = 0;
  if (probe.founding_year && probe.founding_year >= 1800 && probe.founding_year <= new Date().getFullYear()) raw += 30;
  raw += Math.min(30, probe.awards_mentioned * 10);
  raw += Math.min(25, probe.team_titles_mentioned * 5);
  if (probe.text_length >= 1000) raw += 15;
  const score = Math.min(100, raw);
  return {
    present: score >= 50,
    weight,
    url: probe.about_url,
    evidence: {
      score,
      founding_year: probe.founding_year,
      awards_mentioned: probe.awards_mentioned,
      team_titles_mentioned: probe.team_titles_mentioned,
      about_text_length: probe.text_length,
    },
  };
}

// ---------- brand_consistency (DataForSEO SERP) ----------

const REVIEW_HOSTS = ["g2.com", "trustpilot.com", "bbb.org", "capterra.com", "yelp.com", "tripadvisor.com", "linkedin.com", "crunchbase.com"];

interface DataForSeoSerpItem {
  type?: string;
  domain?: string;
  url?: string;
  title?: string;
  description?: string;
  rank_absolute?: number;
}

async function checkBrandConsistency(brand: string, domain: string, env: Env): Promise<SignalResult> {
  const weight = SIGNAL_WEIGHTS.brand_consistency;
  const login = (env as any).DATAFORSEO_LOGIN as string | undefined;
  const password = (env as any).DATAFORSEO_PASSWORD as string | undefined;
  if (!login || !password) {
    return {
      present: false,
      weight,
      error: "DataForSEO credentials not configured -- skipping brand_consistency",
    };
  }
  try {
    const auth = "Basic " + btoa(`${login}:${password}`);
    const r = await fetchWithTimeout("https://api.dataforseo.com/v3/serp/google/organic/live/advanced", {
      method: "POST",
      headers: { "Authorization": auth, "Content-Type": "application/json" },
      body: JSON.stringify([{
        keyword: brand,
        language_code: "en",
        location_code: 2840,
        device: "desktop",
        depth: 10,
      }]),
    });
    if (!r.ok) {
      return { present: false, weight, error: `DataForSEO HTTP ${r.status}` };
    }
    const body = await r.json() as { tasks?: Array<{ result?: Array<{ items?: DataForSeoSerpItem[] }> }> };
    const items = body.tasks?.[0]?.result?.[0]?.items || [];
    const organic = items.filter((i) => i.type === "organic" && i.domain).slice(0, 10);
    const domainHost = (domain || "").replace(/^www\./, "").toLowerCase();
    let topResultIsOwned = false;
    let ownedCount = 0;
    const reviewPlatformsFound: string[] = [];
    organic.forEach((item, idx) => {
      const host = (item.domain || "").replace(/^www\./, "").toLowerCase();
      const isOwned = domainHost && (host === domainHost || host.endsWith("." + domainHost));
      if (isOwned) {
        ownedCount++;
        if (idx === 0) topResultIsOwned = true;
      }
      for (const rh of REVIEW_HOSTS) {
        if (host === rh || host.endsWith("." + rh)) {
          if (!reviewPlatformsFound.includes(rh)) reviewPlatformsFound.push(rh);
        }
      }
    });
    // Tightened scoring. The original logic over-weighted "brand owns
    // its top result" (40 pts), which any unknown brand with a unique
    // enough name passes by default since nobody else ranks for them.
    // Real consistency = multiple authoritative third-party sources
    // describing the brand the same way. So the dominant lever is now
    // the count of review/authority platforms surfaced in the top 10.
    //   * 4+ platforms: 90  (strong)
    //   * 3 platforms:  75  (above threshold)
    //   * 2 platforms:  55  (just above threshold)
    //   * 1 platform:   30  (below threshold)
    //   * 0 platforms:   0  (no signal)
    //   + 7 pts top result is brand-owned (baseline web presence)
    //   + 3 pts SERP returned at least 5 results (sanity floor)
    // Threshold for "present": 60 -- requires 2+ authoritative
    // platforms minimum, which is the floor where AI engines start
    // treating cross-source agreement as a real trust signal.
    let raw = 0;
    const platformsCount = reviewPlatformsFound.length;
    if (platformsCount >= 4) raw += 90;
    else if (platformsCount === 3) raw += 75;
    else if (platformsCount === 2) raw += 55;
    else if (platformsCount === 1) raw += 30;
    if (topResultIsOwned) raw += 7;
    if (organic.length >= 5) raw += 3;
    return {
      present: raw >= 60,
      weight,
      evidence: {
        score: raw,
        top_result_is_owned: topResultIsOwned,
        owned_count_top10: ownedCount,
        review_platforms_found: reviewPlatformsFound,
        organic_results_count: organic.length,
      },
    };
  } catch (e) {
    return { present: false, weight, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------- Light audit (for competitive comparison) ----------

/**
 * Reduced-subrequest audit for use in competitive analysis. The full
 * audit runs 8 signals across 4-7 outbound HTTP calls, which is fine
 * for the customer's own audit but blows the Cloudflare Workers
 * subrequest budget when fanned out to 3+ competitors. This light
 * version runs:
 *   - Wikidata (1-2 subrequests)
 *   - Wikipedia (free -- piggybacks on Wikidata sitelink)
 *   - On-page Org schema + sameAs + Person schema (1 subrequest, all
 *     three signals from a single homepage fetch)
 * Total: 2-3 subrequests per competitor.
 *
 * Skipped: DataForSEO brand_consistency (1 subrequest, also costs $),
 *   about_authority (up to 8 subrequests probing common /about paths),
 *   knowledge_panel (composite -- still computed from what we have).
 *
 * Score is reported out of the same 100, but signals not measured are
 * marked "skipped" rather than "absent" so we don't penalize
 * competitors for things we didn't check.
 */
export async function auditEntityGraphLight(
  env: Env,
  brand: string,
  domain: string,
): Promise<PartialEntityAudit> {
  const [wikidata, onPage] = await Promise.all([
    checkWikidata(brand, domain),
    auditOnPageSignals(domain),
  ]);
  const wikipedia = await checkWikipedia(brand, wikidata);

  // Mark the unchecked signals as a special "skipped" state -- not
  // present, but we don't claim to know they're absent either. Their
  // weight is excluded from the partial_max so the score is fair.
  const skipped: SignalResult = { present: false, weight: 0, error: "skipped in light audit" };

  const signalsBase: Partial<Record<SignalKey, SignalResult>> = {
    wikidata,
    wikipedia,
    org_schema: onPage.org_schema,
    sameas_depth: onPage.sameas_depth,
    person_schema: onPage.person_schema,
    about_authority: skipped,
    brand_consistency: skipped,
  };
  signalsBase.knowledge_panel = deriveKnowledgePanel(signalsBase);
  const signals: PartialEntityAudit["signals"] = signalsBase;

  let partial_score = 0;
  let partial_max = 0;
  for (const s of Object.values(signals)) {
    if (!s) continue;
    if (s.error === "skipped in light audit") continue;
    partial_max += s.weight;
    if (s.present) partial_score += s.weight;
  }
  const actions = deriveActions(signals, brand, domain);

  return {
    brand,
    domain,
    scanned_at: Math.floor(Date.now() / 1000),
    signals,
    partial_score,
    partial_max,
    actions,
  };
}

// ---------- Action derivation ----------

/**
 * Convert raw signal absences and partial-fills into a ranked list of
 * specific, actionable recommendations. Each action names the lever
 * (which signal it lifts), the lift in points, and a defensible
 * effort estimate so the customer can sequence the work.
 *
 * Ranking heuristic: sort by score_lift descending, then effort
 * ascending (cheap wins beat expensive wins at equal lift). Wikipedia
 * is the one exception -- we score-rank it but flag effort honestly
 * because Wikipedia notability requirements mean it's not a 30-min
 * job and pretending otherwise would burn customer trust.
 */
function deriveActions(
  signals: Partial<Record<SignalKey, SignalResult>>,
  brand: string,
  domain: string,
): RecommendedAction[] {
  const out: RecommendedAction[] = [];

  // sameAs depth: highest-leverage easy win when missing or weak.
  // Customer just adds external profile URLs to existing schema.
  const sa = signals.sameas_depth;
  if (sa && !sa.error) {
    const ev = (sa.evidence ?? {}) as Record<string, unknown>;
    const platforms = (ev.platforms_linked as string[]) || [];
    if (platforms.length === 0) {
      out.push({
        signal: "sameas_depth",
        title: "Link to LinkedIn, Crunchbase, and one review platform from your schema",
        detail: "Add a sameAs array to your Organization schema with at least three authoritative external profiles. AI engines use this to verify identity across the web.",
        effort: "30 min",
        score_lift: SIGNAL_WEIGHTS.sameas_depth,
        priority: 0,
      });
    } else if (platforms.length < 3) {
      out.push({
        signal: "sameas_depth",
        title: `Add ${3 - platforms.length} more authoritative profile${3 - platforms.length === 1 ? "" : "s"} to sameAs`,
        detail: `You currently link to ${platforms.join(", ")}. Add at least one of: Crunchbase, G2, BBB, Trustpilot, or your industry's authority platform.`,
        effort: "20 min",
        score_lift: SIGNAL_WEIGHTS.sameas_depth,
        priority: 0,
      });
    }
  }

  // Org schema: "absent" and "incomplete" produce different actions.
  const org = signals.org_schema;
  if (org && !org.error) {
    const ev = (org.evidence ?? {}) as Record<string, unknown>;
    const pct = (ev.completeness_pct as number | undefined);
    const missing = (ev.missing as string[]) || [];
    if (pct === undefined) {
      out.push({
        signal: "org_schema",
        title: "Add Organization schema to your homepage",
        detail: "Your homepage has no Organization-typed JSON-LD. AI engines treat schema-less brands as low-confidence citations. One snippet, one deploy.",
        effort: "1 hour",
        score_lift: SIGNAL_WEIGHTS.org_schema,
        priority: 0,
      });
    } else if (pct < 100 && missing.length > 0) {
      // Partial-credit case: only count the gap as the lift.
      const gainPct = (100 - pct) / 100;
      const lift = Math.round(SIGNAL_WEIGHTS.org_schema * gainPct);
      if (lift >= 2) {
        out.push({
          signal: "org_schema",
          title: `Complete your Organization schema (missing: ${missing.join(", ")})`,
          detail: `Your schema is ${pct}% complete. Filling these properties closes the partial-schema citation penalty for AI engines.`,
          effort: missing.length > 3 ? "1 hour" : "20 min",
          score_lift: lift,
          priority: 0,
        });
      }
    }
  }

  // Wikidata: highest weight (18) but specific creation steps. We
  // give them the literal URL to start. Honest effort because the
  // page must pass notability review.
  const wd = signals.wikidata;
  if (wd && !wd.present && !wd.error) {
    out.push({
      signal: "wikidata",
      title: "Create a Wikidata entry for your brand",
      detail: "Open https://www.wikidata.org/wiki/Special:NewItem and add the brand name, description, and at least three identifying claims (founded date, location, sameAs to website). Wikidata is the single biggest lever in entity-graph credibility.",
      effort: "45 min",
      score_lift: SIGNAL_WEIGHTS.wikidata,
      priority: 0,
    });
  }

  // Person schema: medium-high lever, common gap on small-team sites.
  const ps = signals.person_schema;
  if (ps && !ps.error) {
    const ev = (ps.evidence ?? {}) as Record<string, unknown>;
    const count = (ev.person_count as number) || 0;
    const withSameas = (ev.with_sameas as number) || 0;
    if (count === 0) {
      out.push({
        signal: "person_schema",
        title: "Add Person schema to your team page",
        detail: "Each team member needs a Person node with name, jobTitle, worksFor, and sameAs links to their LinkedIn. AI engines use this for E-E-A-T author signal.",
        effort: "1-2 hours",
        score_lift: SIGNAL_WEIGHTS.person_schema,
        priority: 0,
      });
    } else if (withSameas === 0) {
      out.push({
        signal: "person_schema",
        title: "Add sameAs LinkedIn URLs to your existing Person schema",
        detail: `You have ${count} Person node${count === 1 ? "" : "s"} but no sameAs links. Adding LinkedIn URLs to each turns name-only stubs into verifiable authors.`,
        effort: "15 min",
        score_lift: SIGNAL_WEIGHTS.person_schema,
        priority: 0,
      });
    }
  }

  // Wikipedia: real lever but real effort. Surface honestly.
  const wp = signals.wikipedia;
  if (wp && !wp.present && !wp.error) {
    out.push({
      signal: "wikipedia",
      title: "Pursue a Wikipedia article (long play)",
      detail: "Wikipedia notability requires significant independent press coverage first. This is not a quick win, but it is the single biggest credibility leap once earned. Track it as a 6-12 month goal, not this month's task.",
      effort: "6+ months",
      score_lift: SIGNAL_WEIGHTS.wikipedia,
      priority: 0,
    });
  }

  // Brand consistency: surface the specific platforms the brand is
  // missing from. Different industry verticals have different floor
  // platforms, but the universal three are LinkedIn, BBB or Yelp, and
  // an industry-specific review platform.
  const bc = signals.brand_consistency;
  if (bc && !bc.present && !bc.error) {
    const ev = (bc.evidence ?? {}) as Record<string, unknown>;
    const found = (ev.review_platforms_found as string[]) || [];
    const detail = found.length === 0
      ? "Your brand is not listed on any major authoritative review or profile platform that we can find via Google search. Pick three relevant to your category (e.g. G2 + Trustpilot + LinkedIn for B2B; Yelp + TripAdvisor + BBB for local; Crunchbase + LinkedIn + Capterra for SaaS) and create listings."
      : `You appear on ${found.join(", ")} but no other authoritative review or profile platform. Add at least two more relevant to your category so AI engines can corroborate your identity across sources.`;
    out.push({
      signal: "brand_consistency",
      title: "Get listed on 2-3 more authoritative review platforms",
      detail,
      effort: "1-2 hours",
      score_lift: SIGNAL_WEIGHTS.brand_consistency,
      priority: 0,
    });
  }

  // Knowledge panel: composite signal -- if it's failing, the action
  // is implicit in the other failures. Only surface a separate action
  // when knowledge_panel is failing but the underlying components
  // aren't already generating their own actions (i.e., they're at
  // partial credit and not in the action list yet).
  const kp = signals.knowledge_panel;
  if (kp && !kp.present && !kp.error) {
    const ev = (kp.evidence ?? {}) as Record<string, unknown>;
    const components = (ev.components as string[]) || [];
    // Only add if not already covered by another action -- usually
    // wikidata + org_schema actions are the underlying levers.
    const alreadyCovered = out.some((a) => a.signal === "wikidata" || a.signal === "org_schema");
    if (!alreadyCovered && components.length > 0) {
      out.push({
        signal: "knowledge_panel",
        title: "Strengthen Knowledge Panel composite",
        detail: "Your composite of Wikidata + Wikipedia + Organization schema + sameAs depth is below the threshold where Google Knowledge Panels typically appear. Closing the other actions in this list raises this score automatically.",
        effort: "various",
        score_lift: SIGNAL_WEIGHTS.knowledge_panel,
        priority: 0,
      });
    }
  }

  // about_authority: actionable when the page is missing or thin.
  const ab = signals.about_authority;
  if (ab && !ab.present && !ab.error) {
    const ev = (ab.evidence ?? {}) as Record<string, unknown>;
    const noPage = ev.reason === "no_about_page_found";
    out.push({
      signal: "about_authority",
      title: noPage ? "Add an /about page" : "Strengthen your /about page",
      detail: noPage
        ? "We couldn't find a discoverable /about, /about-us, /our-story, or /team page. AI engines look here for founding date, team credentials, and longevity markers. Even a 400-word page beats nothing."
        : "Your /about page is missing common authority markers. Add a founding year (\"founded in YYYY\"), at least one award or recognition mention, and team members named with their titles.",
      effort: "1-2 hours",
      score_lift: SIGNAL_WEIGHTS.about_authority,
      priority: 0,
    });
  }

  // Rank by value density: score_lift per hour of effort. A +12 lift
  // in 1 hour beats a +14 lift in 6 months for any practical roadmap.
  // The previous sort (lift desc, effort asc) put Wikipedia first
  // when Wikipedia is a 6-month play -- the QA agent flagged this as
  // bad action_sanity. Now we use lift / effort_hours, which sorts
  // multi-month items naturally to the bottom unless their lift
  // dwarfs the alternatives.
  const effortHours = (e: string): number => {
    if (/min/i.test(e)) {
      const m = parseInt(e, 10);
      return Math.max(0.25, (Number.isFinite(m) ? m : 30) / 60);
    }
    if (/^1 hour/i.test(e)) return 1;
    if (/1-2 hour/i.test(e)) return 1.5;
    if (/hour/i.test(e)) return 2;
    if (/day/i.test(e)) return 8;
    if (/week/i.test(e)) return 40;
    if (/month/i.test(e)) {
      const m = parseInt(e, 10);
      return (Number.isFinite(m) ? m : 1) * 160;
    }
    return 1;
  };
  out.sort((a, b) => {
    const densityA = a.score_lift / effortHours(a.effort);
    const densityB = b.score_lift / effortHours(b.effort);
    if (densityA !== densityB) return densityB - densityA;
    // Tiebreaker: raw lift desc, then easier first.
    return b.score_lift - a.score_lift || effortHours(a.effort) - effortHours(b.effort);
  });
  out.forEach((a, i) => { a.priority = i + 1; });
  return out;
}

// ---------- helpers ----------

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

function domainStem(domain: string): string {
  return (domain || "")
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/)[0]
    .split(".")[0]
    .replace(/[-_]/g, " ")
    .trim();
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
