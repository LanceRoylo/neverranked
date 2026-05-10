/**
 * Source-type classification for cited URLs.
 *
 * AI engines cite a small set of source types per query category. Each
 * type implies a different action when there's a gap (e.g. Wikipedia
 * gap = entity entry update; TripAdvisor gap = review density push;
 * news gap = press release distribution).
 *
 * Adding a source type is a one-place change here -- the brief
 * generator looks up by type, so new types automatically get briefs.
 */

/**
 * Source type taxonomy. Order matters: classifyDomain() runs the
 * matchers in order, first hit wins.
 */
export const SOURCE_TYPES = [
  {
    type: "wikipedia",
    label: "Wikipedia",
    domains: ["wikipedia.org"],
    action: "edit-or-create-entity-entry",
    citeable: true,
  },
  {
    type: "tripadvisor",
    label: "TripAdvisor",
    domains: ["tripadvisor.com", "tripadvisor.co.uk"],
    action: "increase-review-density",
    citeable: true,
  },
  {
    type: "google-maps",
    label: "Google Maps / Business Profile",
    domains: ["google.com/maps", "maps.google.com", "g.page"],
    action: "complete-business-profile",
    citeable: true,
  },
  {
    type: "yelp",
    label: "Yelp",
    domains: ["yelp.com"],
    action: "claim-and-enrich-listing",
    citeable: true,
  },
  {
    type: "reddit",
    label: "Reddit",
    domains: ["reddit.com"],
    action: "seed-thread-or-reply",
    citeable: true,
  },
  {
    type: "youtube",
    label: "YouTube",
    domains: ["youtube.com", "youtu.be"],
    action: "syndicate-video-or-shorts",
    citeable: true,
  },
  {
    type: "news",
    label: "News / press",
    domains: [
      "globenewswire.com", "prnewswire.com", "businesswire.com",
      "apnews.com", "reuters.com", "bloomberg.com", "wsj.com",
      "nytimes.com", "washingtonpost.com", "cnbc.com",
      "staradvertiser.com", "khon2.com", "kitv.com", "hawaiinewsnow.com",
      "civilbeat.org", "pacificbusinessnews.com",
    ],
    action: "press-release-or-pitch",
    citeable: true,
  },
  {
    type: "directory",
    label: "Directory / aggregator",
    domains: [
      "vividseats.com", "stubhub.com", "ticketmaster.com", "eventbrite.com",
      "yellowpages.com", "manta.com", "bbb.org",
      "auw211.org",
    ],
    action: "claim-and-update-listing",
    citeable: true,
  },
  {
    type: "social",
    label: "Social",
    domains: ["facebook.com", "instagram.com", "x.com", "twitter.com", "linkedin.com", "tiktok.com"],
    action: "publish-canonical-bio-and-post",
    citeable: true,
  },
  {
    type: "review-aggregator",
    label: "Review aggregator",
    domains: ["g2.com", "capterra.com", "trustpilot.com", "softwareadvice.com"],
    action: "claim-listing-and-collect-reviews",
    citeable: true,
  },
  {
    type: "industry-publication",
    label: "Industry publication",
    domains: [
      "hbr.org", "techcrunch.com", "theverge.com", "wired.com",
      "marketingweek.com", "adweek.com", "marketwatch.com",
    ],
    action: "contribute-or-pitch-coverage",
    citeable: true,
  },
  {
    // SEO / content-marketing publications. These are the named
    // editorial voices in the SEO+AEO space. AI engines cite them
    // as authority for "how does AEO work" / "SEO best practice"
    // type queries.
    type: "seo-publication",
    label: "SEO / marketing publication",
    domains: [
      "sparktoro.com", "animalz.co", "orbitmedia.com",
      "searchengineland.com", "searchenginejournal.com",
      "moz.com", "ahrefs.com/blog", "semrush.com/blog",
      "backlinko.com", "neilpatel.com",
      "minuttia.com", "onely.com",
    ],
    action: "pitch-contributed-content",
    citeable: true,
  },
  {
    // Direct AEO/AI-search platform competitors. These are the
    // companies selling AEO software, dashboards, or visibility
    // platforms. When AI engines answer "how do I get cited in
    // ChatGPT" they often surface these. Surfacing them as a
    // distinct type makes competitive-intelligence analysis
    // possible directly from the report.
    type: "aeo-platform",
    label: "AEO platform competitor",
    domains: [
      "evertune.ai", "searchatlas.com", "searchseal.com",
      "generatemore.ai", "promptalpha.ai", "lureon.ai",
      "senso.ai", "birdeye.com", "cited.so",
      "onmarketing.ai", "fozzels.com",
    ],
    action: "competitive-positioning-content",
    citeable: true,
  },
  {
    // AEO / AI-search / SEO service agencies that compete with NR
    // for "best AI visibility agency" type queries. Different from
    // aeo-platform: these sell services not software.
    type: "aeo-services-agency",
    label: "AEO services agency competitor",
    domains: [
      "geekpoweredstudios.com", "greenbananaseo.com",
      "eseospace.com", "penguinpeak.com", "seotuners.com",
      "1digitalagency.com", "seoworks.co.uk", "riweb.uk",
      "roiamplified.com", "clickslice.co.uk", "jasonjkhoo.com",
      "sealglobalholdings.com", "smamarketing.net",
      "embarque.io", "cairrot.com", "marceldigital.com",
      "firstpagesage.com", "arcintermedia.com",
      "quoleady.com", "ommax.com", "leadgeneratorx.com",
    ],
    action: "differentiated-positioning-content",
    citeable: true,
  },
  {
    // Google's internal AI infrastructure (Gemini's grounding
    // service URLs). Not a publishable surface; appears in citation
    // logs because Gemini self-cites its own retrieval layer.
    // Tagging it lets the report exclude or call it out separately
    // rather than confusing it with third-party citation share.
    type: "google-ai-infra",
    label: "Google AI infrastructure (Gemini grounding)",
    domains: [
      "vertexaisearch.cloud.google.com",
      "vertexaisearch.googleapis.com",
    ],
    action: "monitor-only",
    citeable: false,
  },
];

const CATCHALL_TYPE = {
  type: "other",
  label: "Other source",
  action: "investigate-and-classify",
  citeable: true,
};

/**
 * Extract a normalized domain (no protocol, no www, no trailing slash,
 * lowercase) from a URL. Returns null if the URL is unparseable.
 */
export function extractDomain(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const u = new URL(url.trim());
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

const CLIENT_OWNED_TYPE = {
  type: "client-owned",
  label: "Client-owned property",
  action: "monitor",
  citeable: true,
};

/**
 * Test whether a domain matches a matcher pattern.
 *  - matcher with no "/" : matches if domain === matcher OR domain
 *    ends with "." + matcher (so "x.com" matches "x.com" and
 *    "subdomain.x.com" but NOT "ommax.com").
 *  - matcher with a "/"  : matches if `domain + path` starts with the
 *    matcher OR contains "/" + matcher (so "google.com/maps" matches
 *    "www.google.com/maps/search/...").
 */
function matcherHits(matcher, domain, path) {
  if (matcher.includes("/")) {
    const haystack = `${domain}${path}`;
    return haystack.startsWith(matcher) || haystack.includes("/" + matcher) || haystack.includes("." + matcher);
  }
  return domain === matcher || domain.endsWith("." + matcher);
}

/**
 * Classify a URL into a source type. Returns the matched SOURCE_TYPES
 * entry plus { domain, path } for downstream use. Falls back to
 * CATCHALL_TYPE for unknown domains.
 *
 * If `clientDomains` is provided, URLs matching the client's own
 * domain(s) get the "client-owned" type so they render distinctly
 * from unrecognized third-party sources.
 */
export function classifyUrl(url, clientDomains = null) {
  const domain = extractDomain(url);
  if (!domain) return { ...CATCHALL_TYPE, domain: null, path: null, original: url };
  let path = "";
  try { path = new URL(url).pathname || ""; } catch {}
  if (clientDomains && isClientOwnedUrl(url, clientDomains)) {
    return { ...CLIENT_OWNED_TYPE, domain, path, original: url };
  }
  for (const t of SOURCE_TYPES) {
    for (const matcher of t.domains) {
      if (matcherHits(matcher, domain, path)) {
        return { ...t, domain, path, original: url };
      }
    }
  }
  return { ...CATCHALL_TYPE, domain, path, original: url };
}

/**
 * Is this URL the client's own property? Used to distinguish
 * "client cited via their own site" (already won) from "client cited
 * via third-party source" (the durable signal).
 */
export function isClientOwnedUrl(url, clientDomains) {
  const d = extractDomain(url);
  if (!d || !Array.isArray(clientDomains)) return false;
  return clientDomains.some((cd) => {
    const norm = (cd || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    return d === norm || d.endsWith("." + norm);
  });
}
