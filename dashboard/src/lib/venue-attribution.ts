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
/** Words that describe a PAGE rather than name a PROPERTY.
 *
 * A slug is not a property when every word in it is one of these. Matching on
 * whole slugs was not enough: the real cohort held "hotel-information" and
 * "hotel-rooms", so an exact-match set containing "information" and "rooms"
 * removed neither. Only "en-us" happened to match, which made the first fix
 * look partly effective and was worse than no fix, because the count still
 * read as precise.
 *
 * Nothing distinctive belongs in here. Place and descriptor words like
 * "waikiki", "beach" or "ocean" must stay OUT, or a genuine hotel whose name
 * is ordinary English gets erased from its own category. "Waikiki Beach
 * Marriott Resort and Spa" survives because "waikiki" and "marriott" are not
 * listed; "hotel-rooms" does not, because both of its words are.
 */
const PAGE_WORDS = new Set([
  // locale and navigation
  "en", "us", "gb", "ja", "jp", "ko", "zh", "index", "home", "www", "page",
  // site sections
  "information", "info", "about", "contact", "gallery", "photos", "media",
  "press", "news", "blog", "location", "locations", "directions", "map",
  "maps", "search", "sitemap", "faq", "faqs", "help", "support", "terms",
  "privacy", "legal", "careers", "overview", "details", "guide",
  // commerce and booking
  "book", "booking", "bookings", "reserve", "reservation", "reservations",
  "rate", "rates", "offer", "offers", "deal", "deals", "special", "specials",
  "package", "packages", "promotion", "promotions", "cart", "gift", "cards",
  // generic category nouns
  "hotel", "hotels", "resort", "resorts", "suite", "suites", "room", "rooms",
  "accommodation", "accommodations", "amenity", "amenities", "dining",
  "restaurant", "restaurants", "spa", "pool", "meeting", "meetings", "event",
  "events", "wedding", "weddings", "group", "groups", "review", "reviews",
  "guest", "guests", "stay", "stays",
  // connectives
  "the", "a", "an", "and", "or", "of", "our", "your", "at", "in", "on", "to",
]);

/** True when every word in the slug is a page word, so the slug names a
 *  section of a site rather than a business. */
export function isPageSlug(slug: string): boolean {
  const words = slug.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length === 0) return true;
  return words.every((w) => PAGE_WORDS.has(w));
}

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

  // A generic page segment is not a property. Region still reads from the
  // whole path, so a locale or section page keeps contributing its region;
  // it just stops being named as a venue.
  const isProperty = slug !== "" && !isPageSlug(slug);
  return { slug: isProperty ? slug : "", region, label: isProperty ? labelFromSlug(slug) : "" };
}

/**
 * Curated display names for a registered competitor cohort, keyed by host.
 *
 * `domains.competitor_label` is where a human wrote what this client's
 * competitors are actually called. Snapshot labels were being derived from the
 * domain instead, which shipped "Kahalaresort" and "Alamoanahotelhonolulu"
 * into a paid readout where "The Kahala" and "Ala Moana Hotel" had stood a
 * month earlier. The curated name wins for a registered competitor.
 *
 * Umbrella brands are excluded on purpose. A curated "Marriott (Waikiki
 * properties)" was written before per-property attribution existed; today a
 * marriott.com URL naming no property is a brand page and the attributor
 * labels it as one, which is the more accurate statement.
 */
export function cohortLabelMap(
  rows: Array<{ domain: string; competitor_label: string | null }>,
  umbrellaDomains: string[] = UMBRELLA_DOMAINS,
): Record<string, string> {
  const umbrella = new Set(umbrellaDomains.map((d) => d.toLowerCase()));
  const out: Record<string, string> = {};
  for (const r of rows) {
    const host = (r.domain || "").replace(/^www\./, "").toLowerCase();
    const label = (r.competitor_label || "").trim();
    if (!host || !label || umbrella.has(host)) continue;
    out[host] = label;
  }
  return out;
}

/**
 * Curated names for the UMBRELLA rows, which sit at the bottom of the
 * precedence order rather than the top.
 *
 * An umbrella row that received brand-page citations is labelled by the
 * attributor ("Marriott (brand pages)"), and that beats a curated name written
 * before per-property attribution existed. But an umbrella row with no hits at
 * all falls through to the domain, which renders "Ritzcarlton" and "Hyatt" in
 * the grid. The curated name is the better last resort.
 */
export function umbrellaLabelMap(
  rows: Array<{ domain: string; competitor_label: string | null }>,
  umbrellaDomains: string[] = UMBRELLA_DOMAINS,
): Record<string, string> {
  const umbrella = new Set(umbrellaDomains.map((d) => d.toLowerCase()));
  const out: Record<string, string> = {};
  for (const r of rows) {
    const host = (r.domain || "").replace(/^www\./, "").toLowerCase();
    const label = (r.competitor_label || "").trim();
    if (!host || !label || !umbrella.has(host)) continue;
    out[host] = label;
  }
  return out;
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

/* ── Same property, two labels ────────────────────────────────────────────
 *
 * prince-waikiki's cohort holds three pairs that are one hotel written twice:
 *
 *   The Laylow Waikiki Autograph Collection / The Laylow Autograph Collection
 *   Sheraton Princess Kaiulani Waikiki Beach / Sheraton Princess Kaiulani
 *   The Ritz Carlton Residences Waikiki Beach / Ritz-Carlton Residences Waikiki
 *
 * and several that look just as similar and are NOT:
 *
 *   Outrigger Waikiki Beach Resort  vs  Outrigger Reef Waikiki Beach Resort
 *   Hyatt Regency / Hyatt Centric / Hyatt Place, all Waikiki Beach
 *   Sheraton Waikiki  vs  Sheraton Princess Kaiulani
 *
 * A string-similarity threshold cannot separate those: the true pairs and the
 * false ones sit at the same edit distance. So this does not measure
 * similarity at all. It removes the words that describe WHERE a hotel is and
 * WHAT KIND of thing it is, and compares what remains.
 *
 * The distinctive core is the hotel's actual name. "Outrigger" and "Outrigger
 * Reef" differ there, so they stay apart. "The Laylow Autograph Collection"
 * and "The Laylow Waikiki Autograph Collection" do not, so they merge.
 *
 * EXACT equality of the core, never containment. Containment is precisely
 * what would swallow Outrigger Reef into Outrigger, and collapsing two real
 * competitors into one bar understates a customer's category while looking
 * tidier than the truth. A count that is high by three is the safer error.
 */

/** Where a hotel is. Removed before comparing, never used to distinguish. */
const GEO_WORDS = new Set([
  "waikiki", "honolulu", "oahu", "hawaii", "hawaiian", "kai", "beach",
  "beachfront", "oceanfront", "island", "shore", "bay",
]);

/** What kind of thing it is. Also removed. */
const CATEGORY_WORDS = new Set([
  "hotel", "hotels", "resort", "resorts", "spa", "inn", "suites", "suite",
  "lodge", "club", "collection", "residences", "residence", "tower", "towers",
  "the", "a", "an", "and", "of", "at", "by", "on", "in",
]);

/** The distinctive part of a venue name: what is left once location and
 *  category are taken away. Empty means the label said nothing specific. */
export function venueCore(label: string): string {
  return String(label)
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")          // "(brand pages)" is a deliberate marker
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((w) => !GEO_WORDS.has(w) && !CATEGORY_WORDS.has(w))
    .join(" ");
}

/** Two labels naming the same property. Conservative by construction. */
export function sameVenue(a: string, b: string): boolean {
  const ca = venueCore(a), cb = venueCore(b);
  if (!ca || !cb) return false;        // nothing distinctive to compare
  if (/\(/.test(a) !== /\(/.test(b)) return false; // a brand page is not a property
  return ca === cb;
}

/** Group labels by property, preserving input order. Returns one entry per
 *  distinct property, each listing every label that named it. */
export function groupVenues(labels: string[]): Array<{ core: string; labels: string[] }> {
  const out: Array<{ core: string; labels: string[] }> = [];
  for (const label of labels) {
    const hit = out.find((g) => sameVenue(g.labels[0], label));
    if (hit) hit.labels.push(label);
    else out.push({ core: venueCore(label), labels: [label] });
  }
  return out;
}
