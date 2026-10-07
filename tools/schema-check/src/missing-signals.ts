/**
 * The list the email gate promises: each missing signal by name, and what it
 * is, in plain words (decision 3a, 2026-10-07).
 *
 * ONE function decides what counts as missing, and three things use it:
 *   - the count in the gate title ("[N] things on your site AI tools may not
 *     read") and the two names shown above the gate
 *   - the emailed result, which names every one of the N
 *   - the stored scan summary, so the email is built from OUR copy
 *
 * The old gate count added red flags, missing schema types and failing
 * technical signals together, and most red flags restate one of the other
 * two ("No canonical tag" was counted twice). Building the list from the
 * structured coverage instead of the flag sentences counts each thing once,
 * so the number in the title is the number of items in the email.
 *
 * Every description is customer copy. dashboard/test/free-check-copy-guards
 * runs each one through the tone, causal and engine-verb guards.
 */

export interface ScanSummary {
  v: 1;
  url: string;
  domain: string;
  score: number;
  grade: string;
  schema_coverage: { type: string; present: boolean }[];
  technical_signals: { label: string; status: "good" | "warning" | "bad" }[];
  red_flags: string[];
  crawl: { noindex: boolean; nofollow: boolean; blocked: string[] } | null;
  client_side_rendered: boolean;
  jsonld_parse_errors: number;
  schema_types: string[];
  identity: {
    name: string | null;
    category: string | null;
    town: string | null;
    og_site_name: string | null;
    title: string | null;
    meta_description: string | null;
  } | null;
}

export interface MissingSignal {
  key: string;
  name: string;
  what: string;
}

export const SCHEMA_SIGNALS: Record<string, { name: string; what: string }> = {
  Organization: {
    name: "Business identity label (Organization schema)",
    what: "A short block of structured data that states who the business is: its name, logo, address and contact details, in a form software can read without guessing.",
  },
  WebSite: {
    name: "Website label (WebSite schema)",
    what: "Structured data that names the site and ties it to the business that runs it.",
  },
  BreadcrumbList: {
    name: "Breadcrumb label (BreadcrumbList schema)",
    what: "Structured data that shows where this page sits in the site, for example Home, then Services, then this page.",
  },
  FAQPage: {
    name: "FAQ label (FAQPage schema)",
    what: "Structured data that marks each question on a page and its answer, so software can tell which text is the question and which is the answer.",
  },
  HowTo: {
    name: "Step-by-step label (HowTo schema)",
    what: "Structured data that marks a set of instructions as numbered steps.",
  },
  Article: {
    name: "Article label (Article schema)",
    what: "Structured data that marks a page as an article and states its headline, author and date.",
  },
  BlogPosting: {
    name: "Blog post label (BlogPosting schema)",
    what: "The article label for blog posts. It states the headline, author and date of each post.",
  },
  AggregateRating: {
    name: "Review score label (AggregateRating schema)",
    what: "Structured data that states your average review score and how many reviews it comes from.",
  },
  SoftwareApplication: {
    name: "Software label (SoftwareApplication schema)",
    what: "Structured data that describes a software product: what it is, what it runs on and what it costs.",
  },
};

/** Keyed by the analyzer's technical-signal label. Only a "bad" status counts
 *  as missing, the same rule the gate count has always used. */
export const TECHNICAL_SIGNALS: Record<string, { key: string; name: string; what: string }> = {
  "Title tag": {
    key: "title",
    name: "Page title (title tag)",
    what: "The name of the page in its code. Browsers show it in the tab and search tools show it as the headline. This page has none.",
  },
  "Meta description": {
    key: "meta_description",
    name: "Page summary (meta description)",
    what: "A sentence or two in the page's code that sums up the page. Search tools often show it under the headline. This page has none.",
  },
  "Canonical URL": {
    key: "canonical",
    name: "Main address (canonical tag)",
    what: "A line in the page's code that says which web address is the main copy of this page, so copies at other addresses are not read as separate pages.",
  },
  "og:image": {
    key: "og_image",
    name: "Preview image (og:image tag)",
    what: "A line in the page's code that names the image to show when the page is shared or previewed.",
  },
  "H1 structure": {
    key: "h1",
    name: "Main heading (H1)",
    what: "The page has no top-level heading, so no single line says what the page is about.",
  },
  "External links": {
    key: "external_links",
    name: "Links to other sites",
    what: "The page links to no outside sources, such as a review profile, a directory listing or a professional body.",
  },
  "Word count": {
    key: "word_count",
    name: "Readable text",
    what: "The page has very little text in its HTML for software to read.",
  },
  "Trust-platform links": {
    key: "trust_links",
    name: "Review profile links",
    what: "The page does not link to a review profile such as Google, Yelp, the BBB or Trustpilot.",
  },
};

/** Crawlers an AI tool sends to READ a page when it answers. Mirrors
 *  CITATION_BOTS in index.ts. Everything else in the robots.txt list is
 *  mainly a training crawler. */
const READING_CRAWLERS = new Set([
  "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-Web", "anthropic-ai",
  "PerplexityBot", "Perplexity-User",
]);
const ALL_CRAWLERS = "all crawlers (User-agent: *)";

function crawlerAccessText(blocked: string[]): string {
  if (blocked.includes(ALL_CRAWLERS)) {
    return "The site's robots.txt file tells every crawler to stay out, so no crawler that respects it reads any page.";
  }
  const reading = blocked.filter((b) => READING_CRAWLERS.has(b));
  const training = blocked.filter((b) => !READING_CRAWLERS.has(b));
  const parts: string[] = [];
  if (reading.length) {
    parts.push(`The site's robots.txt file blocks ${reading.join(", ")}. ${reading.length === 1 ? "That is a crawler" : "Those are crawlers"} an AI tool sends to read a page when it answers a question.`);
  }
  if (training.length) {
    parts.push(`${reading.length ? "It also blocks" : "The site's robots.txt file blocks"} ${training.join(", ")}. ${training.length === 1 ? "That is mainly a training crawler" : "Those are mainly training crawlers"}, which affects whether models learn from the site over time, not whether a tool can read it today.`);
  }
  return parts.join(" ");
}

export function missingSignals(s: Pick<ScanSummary, "schema_coverage" | "technical_signals" | "crawl" | "client_side_rendered" | "jsonld_parse_errors">): MissingSignal[] {
  const out: MissingSignal[] = [];

  if (s.crawl?.noindex) {
    out.push({
      key: "noindex",
      name: "Indexing instruction (noindex)",
      what: "The page tells crawlers not to add it to their index. Search tools and AI tools that respect the instruction leave the page out.",
    });
  }
  if (s.crawl && s.crawl.blocked.length > 0) {
    out.push({ key: "robots", name: "Crawler access (robots.txt)", what: crawlerAccessText(s.crawl.blocked) });
  }
  if (s.client_side_rendered) {
    out.push({
      key: "client_side_rendered",
      name: "Text in the HTML",
      what: "The page builds its text with JavaScript after it loads. A crawler that does not run JavaScript gets a nearly empty page, so the other items below read as missing to it too.",
    });
  }
  if (s.jsonld_parse_errors > 0) {
    out.push({
      key: "jsonld_errors",
      name: "Broken structured data",
      what: `${s.jsonld_parse_errors === 1 ? "One block" : `${s.jsonld_parse_errors} blocks`} of structured data on the page ${s.jsonld_parse_errors === 1 ? "has" : "have"} errors, so software cannot read ${s.jsonld_parse_errors === 1 ? "it" : "them"}.`,
    });
  }
  for (const c of s.schema_coverage || []) {
    if (c.present) continue;
    const d = SCHEMA_SIGNALS[c.type];
    if (d) out.push({ key: `schema:${c.type}`, name: d.name, what: d.what });
  }
  for (const t of s.technical_signals || []) {
    if (t.status !== "bad") continue;
    const d = TECHNICAL_SIGNALS[t.label];
    if (d) out.push({ key: d.key, name: d.name, what: d.what });
  }
  return out;
}

const GRADES = new Set(["A", "B", "C", "D", "F"]);
const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

/**
 * Build a summary from the object a BROWSER sent. Only used when our stored
 * copy is missing (a page cached from before scan_id existed, or a D1 write
 * that failed at scan time). Nothing free-text survives: the domain must be a
 * hostname, the score a number, the grade a letter, and coverage entries must
 * name a schema type or technical label we know. Red flags and crawl details
 * are dropped, since they are sentences anyone could have typed.
 */
export function summaryFromClient(report: unknown): ScanSummary | null {
  if (!report || typeof report !== "object") return null;
  const r = report as Record<string, unknown>;
  const domain = typeof r.domain === "string" ? r.domain.trim().toLowerCase() : "";
  if (!HOSTNAME_RE.test(domain)) return null;
  const n = Number(r.aeo_score);
  const score = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
  const grade = typeof r.grade === "string" && GRADES.has(r.grade.toUpperCase()) ? r.grade.toUpperCase() : "F";
  const schema_coverage = (Array.isArray(r.schema_coverage) ? r.schema_coverage : [])
    .filter((c): c is { type: string; present: unknown } => !!c && typeof c === "object" && typeof (c as any).type === "string" && !!SCHEMA_SIGNALS[(c as any).type])
    .map((c) => ({ type: c.type, present: c.present === true }));
  const technical_signals = (Array.isArray(r.technical_signals) ? r.technical_signals : [])
    .filter((t): t is { label: string; status: string } => !!t && typeof t === "object" && typeof (t as any).label === "string" && !!TECHNICAL_SIGNALS[(t as any).label])
    .map((t) => ({ label: t.label, status: (t.status === "good" || t.status === "warning" || t.status === "bad" ? t.status : "warning") as "good" | "warning" | "bad" }));
  return {
    v: 1,
    url: `https://${domain}/`,
    domain,
    score,
    grade,
    schema_coverage,
    technical_signals,
    red_flags: [],
    crawl: null,
    client_side_rendered: false,
    jsonld_parse_errors: 0,
    schema_types: [],
    identity: null,
  };
}
