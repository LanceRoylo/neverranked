/**
 * classify-source.ts — source-type classifier for cited URLs.
 *
 * PORT of dryrun/forensic/classify.mjs, kept deliberately line-for-line
 * faithful. The published methodology page documents these nine buckets by
 * name, so the two implementations must agree: if the research pipeline and
 * the Worker bucket the same URL differently, one of them is contradicting a
 * public page. test/classify-source.test.ts pins the shared cases.
 *
 * HONEST SCOPE (quoting the method page): this classifies into buckets that
 * are reliably determinable from the host alone. It deliberately does NOT try
 * to distinguish "major publication" from "random blog" by domain, because
 * that is not honestly knowable from a hostname. Both land in
 * `independent_web` and the readout says so.
 */

export type SourceType =
  | "youtube"
  | "reddit"
  | "wikipedia"
  | "forum"
  | "social"
  | "review_directory"
  | "independent_web"
  | "owned"
  | "competitor"
  | "invalid";

export const SOURCE_TYPES: SourceType[] = [
  "youtube",
  "reddit",
  "wikipedia",
  "forum",
  "social",
  "review_directory",
  "independent_web",
  "owned",
  "competitor",
];

export function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

// Ordered deliberately: the .mjs original iterates `Object.entries(RE)` and
// returns the FIRST match, so the sequence is part of the behaviour. An array
// of tuples makes that explicit rather than leaning on object key ordering.
const RULES: Array<[SourceType, RegExp]> = [
  ["youtube", /(^|\.)youtube\.com$|(^|\.)youtu\.be$/],
  ["reddit", /(^|\.)reddit\.com$/],
  ["wikipedia", /(^|\.)wikipedia\.org$|(^|\.)wikimedia\.org$|(^|\.)wikidata\.org$/],
  [
    "forum",
    /(^|\.)quora\.com$|(^|\.)stackexchange\.com$|(^|\.)stackoverflow\.com$|(^|\.)community\.|(^|\.)news\.ycombinator\.com$|(^|\.)discourse\.|(^|\.)forum\./,
  ],
  [
    "social",
    /(^|\.)linkedin\.com$|(^|\.)x\.com$|(^|\.)twitter\.com$|(^|\.)facebook\.com$|(^|\.)instagram\.com$|(^|\.)tiktok\.com$|(^|\.)threads\.net$|(^|\.)medium\.com$|(^|\.)substack\.com$/,
  ],
  [
    "review_directory",
    /(^|\.)yelp\.com$|(^|\.)g2\.com$|(^|\.)capterra\.com$|(^|\.)trustpilot\.com$|(^|\.)trustradius\.com$|(^|\.)clutch\.co$|(^|\.)healthgrades\.com$|(^|\.)realself\.com$|(^|\.)tripadvisor\.|(^|\.)bbb\.org$|(^|\.)yellowpages\.com$|(^|\.)glassdoor\.com$|(^|\.)producthunt\.com$|(^|\.)gartner\.com$|(^|\.)getapp\.com$|(^|\.)softwareadvice\.com$|(^|\.)expertise\.com$|(^|\.)threebestrated\.com$|(^|\.)birdeye\.com$|(^|\.)nicelocal\.|(^|\.)medspascout\.com$|(^|\.)cylex\./,
  ],
];

export interface SourceContext {
  owned?: string[];
  competitors?: string[];
}

/**
 * Classify one cited URL. `owned` and `competitors` are checked FIRST and in
 * that order, matching the original: a competitor who happens to be hosted on
 * a review directory is still a competitor.
 */
export function classifySource(url: string, ctx: SourceContext = {}): SourceType {
  const h = hostOf(url);
  if (!h) return "invalid";
  const norm = (d: string) => d.replace(/^www\./, "").toLowerCase();
  const owned = (ctx.owned || []).map(norm);
  const comp = (ctx.competitors || []).map(norm);
  const matchAny = (list: string[]) => list.some((d) => d !== "" && (h === d || h.endsWith("." + d)));
  if (matchAny(owned)) return "owned";
  if (matchAny(comp)) return "competitor";
  for (const [type, re] of RULES) if (re.test(h)) return type;
  // Everything else: independent sites -- publications, blogs, vendor pages.
  // NOT honestly separable by hostname. Labeled honestly.
  return "independent_web";
}

/**
 * Google result-page wrappers are not sources.
 *
 * Google AI Overviews lists many links on google.com itself that are not pages
 * anyone wrote: knowledge-panel viewers (/searchviewer?svid=...), opaque
 * redirects (/goto?url=<token>), and search-result pages (/search?q=...).
 * Counted as sources they put "google.com" in a client's source list as if it
 * were a site AI reads: measured 2026-10-05, 2,180 of 2,181 google.com links
 * from AI Overviews in one client's September were /searchviewer, and one was
 * /goto. Neither carries a readable target: the svid parameter encodes a
 * knowledge-graph entity id and the goto token is encrypted.
 *
 * Returns:
 *   { kind: "page" }               not a wrapper, classify the URL as it is
 *   { kind: "target", url }        a wrapper carrying a real target in a
 *                                  query parameter (url=, q=, adurl=, imgurl=)
 *   { kind: "wrapper" }            a wrapper with no readable target: drop it
 *
 * Google's real pages (support.google.com, developers.google.com, Maps,
 * Travel and the rest) are untouched: only the wrapper PATHS on the bare
 * google domain match.
 */
export type GoogleLink = { kind: "page" } | { kind: "target"; url: string } | { kind: "wrapper" };

const GOOGLE_WRAPPER_PATH = /^\/(?:searchviewer(?:\/|$)|goto$|search$|url$|aclk$|imgres$)/;
const GOOGLE_BARE_HOST = /^google\.(?:com|[a-z]{2}|com?\.[a-z]{2})$/;

export function classifyGoogleLink(u: string): GoogleLink {
  let parsed: URL;
  try { parsed = new URL(u); } catch { return { kind: "page" }; }
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (!GOOGLE_BARE_HOST.test(host)) return { kind: "page" };
  if (!GOOGLE_WRAPPER_PATH.test(parsed.pathname)) return { kind: "page" };
  for (const key of ["url", "q", "adurl", "imgurl"]) {
    const v = parsed.searchParams.get(key);
    if (!v || !/^https?:\/\//i.test(v)) continue;
    try {
      const t = new URL(v);
      const th = t.hostname.replace(/^www\./, "").toLowerCase();
      // A wrapper pointing at another wrapper is still not a page.
      if (GOOGLE_BARE_HOST.test(th) && GOOGLE_WRAPPER_PATH.test(t.pathname)) continue;
      return { kind: "target", url: t.toString() };
    } catch { /* not a URL: a search phrase, keep looking */ }
  }
  return { kind: "wrapper" };
}
