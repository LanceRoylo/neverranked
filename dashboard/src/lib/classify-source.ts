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
