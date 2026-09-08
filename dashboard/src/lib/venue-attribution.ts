/**
 * venue-attribution.ts — resolve a cited URL to the SPECIFIC property, not the
 * brand that owns it.
 *
 * THE PROBLEM. A competitor cohort holds domains, and hotel chains put many
 * properties on one domain. prince-waikiki's cohort lists sheraton-waikiki.com,
 * moana-surfrider.com and outriggerwaikiki.com, but AI tools cite those hotels
 * at marriott.com/.../hnlws-sheraton-waikiki-beach-resort/ and
 * outrigger.com/hawaii/oahu/outrigger-waikiki-beach-resort. Matching on host
 * alone credits all of it to "Marriott" and renders the three named hotels at
 * 0%, which reads as "AI never mentions Sheraton Waikiki". It mentions it
 * constantly. Found 2026-09-07, 18 days before the first paid readout.
 *
 * Host-only matching also pulls in properties that are not competitors at all:
 * Grand Hyatt Kauai, Ritz-Carlton Kapalua, Hilton Waikoloa. A Kauai resort is
 * not competing for a Waikiki booking.
 *
 * THE SIGNAL. Chains encode both the property and its airport region in the
 * path slug, which makes this decidable rather than guessable:
 *
 *   /en-us/hotels/hnlws-sheraton-waikiki-beach-resort/pools/   HNL -> Oahu
 *   /en-us/hotels/koaak-mauna-kea-beach-hotel/golf/            KOA -> Big Island
 *   /hyatt-regency/en-us/oggrm-hyatt-regency-maui-resort/      OGG -> Maui
 *
 * Two independent signals are read (the region code and the place words in the
 * slug) and they must not contradict. When they do, or when neither is
 * present, the result is `unknown` and the caller excludes it rather than
 * guessing. Fail closed, same as every other guard in this codebase.
 */

/** Airport/region prefixes chains use in property codes. */
const REGION_BY_CODE: Record<string, string> = {
  hnl: "oahu",
  wkl: "oahu",
  ogg: "maui",
  jhm: "maui",
  koa: "big-island",
  ito: "big-island",
  lih: "kauai",
  mkk: "molokai",
  lny: "lanai",
};

/** Place words that appear in property slugs, mapped to their island. */
const REGION_BY_WORD: Array<[RegExp, string]> = [
  [/\b(waikiki|honolulu|oahu|kapolei|ko-?olina|turtle-?bay|kahala|aulani|laylow|kaiulani)\b/, "oahu"],
  [/\b(maui|wailea|kapalua|kaanapali|lahaina|hana|makena|kahului)\b/, "maui"],
  [/\b(kauai|poipu|princeville|lihue|wailua|hanalei)\b/, "kauai"],
  [/\b(kona|waikoloa|hilo|mauna-?kea|mauna-?lani|big-?island|hawaii-big-island|kohala)\b/, "big-island"],
  [/\b(molokai)\b/, "molokai"],
  [/\b(lanai)\b/, "lanai"],
];

function regionFromCode(slug: string): string | null {
  const m = slug.match(/^([a-z]{3})[a-z0-9]{0,5}-/);
  if (!m) return null;
  return REGION_BY_CODE[m[1]] ?? null;
}

function regionFromWords(text: string): string | null {
  for (const [re, region] of REGION_BY_WORD) if (re.test(text)) return region;
  return null;
}


/**
 * Domains that host MANY properties, so a host match says nothing about which
 * business was cited. These are the domains matchCohortMember must refuse to
 * credit. Extend as new chains appear in cohorts; an unlisted chain degrades
 * to today's behaviour (bundled under the brand) rather than misattributing.
 */
export const UMBRELLA_DOMAINS: string[] = [
  "marriott.com",
  "hilton.com",
  "hyatt.com",
  "ritzcarlton.com",
  "outrigger.com",
  "ihg.com",
  "accor.com",
  "wyndhamhotels.com",
  "choicehotels.com",
  "bestwestern.com",
  "radissonhotels.com",
  "loewshotels.com",
  "fourseasons.com",
  "aman.com",
];

/** Path portion of a URL, or "/" when it has none. Total: never throws. */
export function pathOf(u: string): string {
  try {
    const url = new URL(u);
    return url.pathname + (url.search || "");
  } catch {
    return "/";
  }
}

/** Region implied by free text (a domain, a business name). Null when none. */
export function regionOf(text: string): string | null {
  return regionFromWords(text.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
}

export interface VenueAttribution {
  /** Property slug pulled from the path, or "" when the URL names none. */
  slug: string;
  /** Island the property sits on, or "unknown" when undecidable. */
  region: string;
  /** Human label derived from the slug, or "" when there is no slug. */
  label: string;
}

/**
 * Chain URL path shapes, most specific first. Each captures the property slug.
 * Deliberately a list of literal patterns rather than a clever generic parser:
 * every entry here was read off real cited URLs, and an unmatched shape must
 * fall through to "no property" rather than be invented.
 */
const PATH_PATTERNS: RegExp[] = [
  // marriott.com/en-us/hotels/<code>-<name>/..., ritzcarlton.com/en/hotels/...,
  // hilton.com/en/hotels/<code>-<name>/...
  /\/hotels\/([a-z0-9]{4,8}-[a-z0-9-]+?)(?:\/|$)/,
  // marriott.com/en-us/dining/restaurant-bar/<code>-<name>/...
  /\/dining\/restaurant-bar\/([a-z0-9]{4,8}-[a-z0-9-]+?)(?:\/|$)/,
  // hyatt.com/<brand>/en-us/<code>-<name>/...  and the no-locale variant
  /\/(?:hyatt-regency|hyatt-centric|hyatt-place|grand-hyatt|andaz|destination-by-hyatt|park-hyatt|hyatt-house)\/(?:[a-z]{2}-[a-z]{2}\/)?([a-z0-9-]+?)(?:\/|$)/,
  // outrigger.com/hawaii/<island>/<property>/...
  /\/hawaii\/[a-z-]+\/(outrigger-[a-z0-9-]+?)(?:\/|$)/,
];

/** Strip the leading chain property code so the label reads as a hotel name. */
function labelFromSlug(slug: string): string {
  const stripped = slug.replace(/^[a-z]{3}[a-z0-9]{0,5}-/, "");
  return stripped
    .split("-")
    .filter(Boolean)
    // Articles and short prepositions stay lowercase INSIDE a name, but the
    // first word is always capitalised: "the Royal Hawaiian" reads as a typo
    // in a client deliverable.
    .map((w, i) => (i > 0 && /^(and|the|of|at|a)$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/**
 * Attribute one cited URL. `path` is everything after the host.
 * Returns region "unknown" when the two signals disagree or neither fires, so
 * the caller can exclude rather than guess at an island.
 */
export function attributeVenueUrl(path: string): VenueAttribution {
  const p = path.toLowerCase();
  let slug = "";
  for (const re of PATH_PATTERNS) {
    const m = p.match(re);
    if (m && m[1]) { slug = m[1]; break; }
  }

  // No property in the path (a brand landing page, a listicle, a destination
  // guide). Region is read from the whole path, because
  // /destinations/united-states/hawaii/waikiki/... is still an Oahu page.
  const wordSource = slug || p;
  const byWord = regionFromWords(wordSource);
  const byCode = slug ? regionFromCode(slug) : null;

  let region: string;
  if (byCode && byWord) region = byCode === byWord ? byCode : "unknown"; // signals disagree
  else region = byCode ?? byWord ?? "unknown";

  return { slug, region, label: slug ? labelFromSlug(slug) : "" };
}

/**
 * Does an attributed property correspond to a cohort domain? Cohort domains
 * are property-specific hosts like sheraton-waikiki.com; the slug carried by a
 * chain URL for the same hotel is "hnlws-sheraton-waikiki-beach-resort". Match
 * by comparing the domain's distinctive stem against the slug.
 *
 * Returns the cohort domain, or null when the property belongs to no cohort
 * member (which is a COVERAGE finding, not an error).
 */
export function matchCohortMember(
  slug: string,
  cohortDomains: string[],
  umbrellaDomains: string[] = [],
): string | null {
  if (!slug) return null;
  // Separators carry no information and the two sides punctuate differently:
  // the domain is "hiltonhawaiianvillage.com", the slug is
  // "hnlhvhh-hilton-hawaiian-village-waikiki-beach-resort".
  const flat = (s: string) => s.replace(/[^a-z0-9]/g, "");
  const s = flat(slug.replace(/^[a-z]{3}[a-z0-9]{0,5}-/, ""));
  const umbrella = new Set(umbrellaDomains.map((d) => d.toLowerCase()));

  let best: { domain: string; len: number } | null = null;
  for (const d of cohortDomains) {
    const dom = d.toLowerCase();
    // A brand domain must never claim a property. "hilton" is a substring of
    // every Hilton property slug, and letting it match would re-create the
    // exact bundling this module exists to undo.
    if (umbrella.has(dom)) continue;
    const stem = flat(dom.replace(/\.(com|net|org|co)$/i, ""));
    if (stem.length < 6) continue; // too short to be distinctive
    // CONTIGUOUS substring, not a token-set overlap. Token overlap credited
    // "Sheraton Princess Kaiulani" to sheraton-waikiki.com because both
    // "sheraton" and "waikiki" appear in it. They are different hotels, and a
    // contiguous match rejects it: "sheratonwaikiki" does not occur inside
    // "sheratonprincesskaiulaniwaikikibeach".
    if (!s.includes(stem)) continue;
    // Longest stem wins, so a more specific cohort domain beats a vaguer one.
    if (!best || stem.length > best.len) best = { domain: d, len: stem.length };
  }
  return best ? best.domain : null;
}
