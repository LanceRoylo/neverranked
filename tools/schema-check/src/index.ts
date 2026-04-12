/**
 * NeverRanked Schema & AEO Health Check — Cloudflare Worker
 *
 * Serves the single-page UI at root and exposes POST /api/check
 * that fetches a target URL, extracts technical signals, and returns
 * a graded JSON report.
 */

export interface Env {}

// ---------- Rate limiting (in-memory, per-isolate) ----------

const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) || [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    rateLimitMap.set(ip, recent);
    return true;
  }
  recent.push(now);
  rateLimitMap.set(ip, recent);
  return false;
}

// ---------- Signal extraction (ported from Python) ----------

interface Signals {
  title: string | null;
  title_len: number;
  meta_desc: string | null;
  meta_desc_len: number;
  canonical: string | null;
  robots_meta: string | null;
  og_title: boolean;
  og_description: boolean;
  og_image: boolean;
  og_type: boolean;
  twitter_card: boolean;
  twitter_image: boolean;
  h1_count: number;
  h1_first: string | null;
  jsonld_block_count: number;
  jsonld_parse_errors: number;
  schema_types: string[];
  img_count: number;
  img_no_alt: number;
  links_internal: number;
  links_external: number;
  word_count: number;
  has_rating_text: boolean;
  has_testimonial_text: boolean;
}

function stripHtml(html: string): string {
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

function countWords(html: string): number {
  const text = stripHtml(html);
  const matches = text.match(/\b\w+\b/g);
  return matches ? matches.length : 0;
}

function collectSchemaTypes(data: unknown, bucket: string[]): void {
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

function extractMeta(html: string, targetUrl: string): Signals {
  // Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : null;

  // Meta description — match double-quoted content first, then single-quoted
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
  let parseErrors = 0;
  for (const block of jsonldBlocks) {
    const inner = block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
    try {
      const data = JSON.parse(inner);
      collectSchemaTypes(data, schemaTypes);
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
  };
}

// ---------- Grading ----------

interface Report {
  url: string;
  domain: string;
  signals: Signals;
  schema_coverage: { type: string; present: boolean }[];
  red_flags: string[];
  grade: string;
  aeo_score: number;
  technical_signals: TechnicalSignal[];
}

interface TechnicalSignal {
  label: string;
  value: string;
  status: "good" | "warning" | "bad";
}

const CRITICAL_SCHEMAS = [
  "Organization",
  "WebSite",
  "BreadcrumbList",
  "FAQPage",
  "HowTo",
  "Article",
  "BlogPosting",
  "AggregateRating",
  "SoftwareApplication",
];

function generateRedFlags(signals: Signals): string[] {
  const flags: string[] = [];

  if (!signals.canonical) {
    flags.push("No canonical tag detected — risk of duplicate content in AI indexes");
  }
  if (!signals.og_image) {
    flags.push("No og:image tag — social sharing and AI previews will lack visual context");
  }
  if (!signals.schema_types.includes("Organization")) {
    flags.push("No Organization schema — critical for entity recognition by AI engines");
  }
  if (!signals.schema_types.includes("WebSite")) {
    flags.push("No WebSite schema — SearchAction rich results are disabled");
  }
  if (!signals.schema_types.includes("BreadcrumbList")) {
    flags.push("No BreadcrumbList schema — rich result breadcrumbs are disabled");
  }
  if (!signals.schema_types.some((t) => t === "AggregateRating")) {
    flags.push("No AggregateRating detected — AI engines have no social proof hook to cite");
  }
  if (signals.h1_count === 0) {
    flags.push("No H1 tag found — heading structure is broken");
  }
  if (signals.h1_count > 1) {
    flags.push(`Multiple H1 tags found (${signals.h1_count}) — dilutes heading hierarchy`);
  }
  if (signals.title_len > 0 && signals.title_len < 30) {
    flags.push(`Title tag is only ${signals.title_len} characters — too short for SERP visibility`);
  }
  if (signals.title_len > 65) {
    flags.push(`Title tag is ${signals.title_len} characters — will truncate in search results`);
  }
  if (signals.meta_desc_len > 0 && signals.meta_desc_len < 80) {
    flags.push(`Meta description is only ${signals.meta_desc_len} characters — too thin`);
  }
  if (signals.meta_desc_len > 160) {
    flags.push(`Meta description is ${signals.meta_desc_len} characters — will truncate`);
  }
  if (signals.links_external < 2) {
    flags.push(`Only ${signals.links_external} external links — AEO authority signal is weak`);
  }
  if (signals.word_count < 300) {
    flags.push(`Only ${signals.word_count} words on page — thin content hurts AI citability`);
  }
  if (signals.img_count > 0 && signals.img_no_alt > 0) {
    flags.push(`${signals.img_no_alt} of ${signals.img_count} images are missing alt text`);
  }
  if (signals.jsonld_parse_errors > 0) {
    flags.push(`${signals.jsonld_parse_errors} JSON-LD block(s) have parse errors — schema is broken`);
  }

  return flags;
}

function calculateAeoScore(signals: Signals): number {
  let score = 0;
  if (signals.schema_types.includes("Organization")) score += 20;
  if (signals.schema_types.includes("WebSite")) score += 10;
  if (signals.schema_types.includes("BreadcrumbList")) score += 10;
  if (signals.schema_types.includes("FAQPage")) score += 10;
  if (signals.canonical) score += 10;
  if (signals.og_image) score += 5;
  if (signals.links_external >= 3) score += 15;
  else if (signals.links_external >= 1) score += 5;
  if (signals.word_count >= 300) score += 10;
  if (signals.has_rating_text || signals.has_testimonial_text) score += 10;
  return score;
}

function calculateGrade(signals: Signals, redFlags: string[]): string {
  const hasOrg = signals.schema_types.includes("Organization");
  const hasWebSite = signals.schema_types.includes("WebSite");
  const hasBreadcrumb = signals.schema_types.includes("BreadcrumbList");
  const hasCanonical = !!signals.canonical;
  const hasOgImage = signals.og_image;
  const hasAnySchema = signals.schema_types.length > 0;

  if (hasOrg && hasWebSite && hasBreadcrumb && hasCanonical && hasOgImage && signals.links_external >= 3 && redFlags.length <= 2) {
    return "A";
  }
  if (hasOrg && hasWebSite && hasCanonical && hasOgImage && redFlags.length <= 4) {
    return "B";
  }
  if (hasAnySchema && hasCanonical && redFlags.length <= 6) {
    return "C";
  }
  if (hasAnySchema || (hasCanonical && hasOgImage)) {
    return "D";
  }
  return "F";
}

function generateTechnicalSignals(signals: Signals): TechnicalSignal[] {
  const items: TechnicalSignal[] = [];

  // Title
  const titleStatus: "good" | "warning" | "bad" =
    signals.title_len >= 30 && signals.title_len <= 65 ? "good" : signals.title_len > 0 ? "warning" : "bad";
  items.push({
    label: "Title tag",
    value: signals.title ? `${signals.title.slice(0, 70)}${signals.title.length > 70 ? "..." : ""} (${signals.title_len} chars)` : "Missing",
    status: titleStatus,
  });

  // Meta description
  const metaStatus: "good" | "warning" | "bad" =
    signals.meta_desc_len >= 80 && signals.meta_desc_len <= 160 ? "good" : signals.meta_desc_len > 0 ? "warning" : "bad";
  items.push({
    label: "Meta description",
    value: signals.meta_desc ? `${signals.meta_desc.slice(0, 80)}${signals.meta_desc.length > 80 ? "..." : ""} (${signals.meta_desc_len} chars)` : "Missing",
    status: metaStatus,
  });

  // Canonical
  items.push({
    label: "Canonical URL",
    value: signals.canonical ? signals.canonical.slice(0, 60) : "Not set",
    status: signals.canonical ? "good" : "bad",
  });

  // OG image
  items.push({
    label: "og:image",
    value: signals.og_image ? "Present" : "Missing",
    status: signals.og_image ? "good" : "bad",
  });

  // H1
  const h1Status: "good" | "warning" | "bad" = signals.h1_count === 1 ? "good" : signals.h1_count === 0 ? "bad" : "warning";
  items.push({
    label: "H1 structure",
    value: signals.h1_count === 1 ? `Clean (1 H1: "${signals.h1_first?.slice(0, 50) || ""}...")` : signals.h1_count === 0 ? "No H1 found" : `${signals.h1_count} H1 tags (should be 1)`,
    status: h1Status,
  });

  // External links
  const extStatus: "good" | "warning" | "bad" = signals.links_external >= 3 ? "good" : signals.links_external >= 1 ? "warning" : "bad";
  items.push({
    label: "External links",
    value: `${signals.links_external} outbound link${signals.links_external !== 1 ? "s" : ""}${signals.links_external >= 3 ? " — strong trust signal" : signals.links_external >= 1 ? " — moderate signal" : " — weak authority signal"}`,
    status: extStatus,
  });

  // Word count
  const wcStatus: "good" | "warning" | "bad" = signals.word_count >= 300 ? "good" : signals.word_count >= 150 ? "warning" : "bad";
  items.push({
    label: "Word count",
    value: `${signals.word_count} words${signals.word_count < 300 ? " (thin content)" : ""}`,
    status: wcStatus,
  });

  return items;
}

function buildReport(url: string, html: string): Report {
  let domain: string;
  try {
    domain = new URL(url).hostname;
  } catch {
    domain = url;
  }

  const signals = extractMeta(html, url);
  const redFlags = generateRedFlags(signals);
  const aeoScore = calculateAeoScore(signals);
  const grade = calculateGrade(signals, redFlags);

  const schemaCoverage = CRITICAL_SCHEMAS.map((type) => ({
    type,
    present: signals.schema_types.some((t) => t === type || (type === "Article" && t === "BlogPosting") || (type === "BlogPosting" && t === "Article")),
  }));

  const technicalSignals = generateTechnicalSignals(signals);

  return {
    url,
    domain,
    signals,
    schema_coverage: schemaCoverage,
    red_flags: redFlags,
    grade,
    aeo_score: aeoScore,
    technical_signals: technicalSignals,
  };
}

// ---------- HTML UI ----------

const HTML_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#121212">
<title>Schema & AEO Health Check — Never Ranked</title>
<meta name="description" content="Free instant graded report on your website's schema coverage, technical SEO signals, and AEO readiness. No signup required.">
<link rel="canonical" href="https://check.neverranked.com/">
<meta name="robots" content="index, follow">
<meta property="og:title" content="Schema & AEO Health Check — Never Ranked">
<meta property="og:description" content="Enter your URL. Get an instant grade on schema coverage, technical signals, and AEO readiness. Free. No signup.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://check.neverranked.com/">
<meta property="og:site_name" content="Never Ranked">
<meta property="og:image" content="https://neverranked.com/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Schema & AEO Health Check — Never Ranked">
<meta name="twitter:description" content="Free instant AEO readiness report for any URL.">
<meta name="twitter:image" content="https://neverranked.com/og.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=DM+Mono:ital,wght@0,300;0,400;0,500&family=Barlow+Condensed:wght@300;400;500;600&display=swap" rel="stylesheet">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23121212'/%3E%3Ctext x='50%25' y='56%25' text-anchor='middle' font-family='Georgia,serif' font-size='22' fill='%23e8c767' font-style='italic'%3EN%3C/text%3E%3C/svg%3E">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "name": "Schema & AEO Health Check",
      "applicationCategory": "WebApplication",
      "operatingSystem": "Any",
      "url": "https://check.neverranked.com",
      "description": "Free instant graded report on your website's schema coverage, technical SEO signals, and AEO readiness.",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD"
      },
      "creator": {
        "@type": "Organization",
        "name": "Never Ranked",
        "url": "https://neverranked.com"
      }
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What does this tool check?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Schema coverage (JSON-LD structured data), technical SEO signals (title, meta description, canonical, OG tags, heading structure), and AEO (Answer Engine Optimization) readiness for AI search engines."
          }
        },
        {
          "@type": "Question",
          "name": "What is AEO?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Answer Engine Optimization — making your site citable by AI engines like ChatGPT, Perplexity, and Google AI Overviews. It goes beyond traditional SEO to optimize for how AI models select and cite sources."
          }
        },
        {
          "@type": "Question",
          "name": "Is this tool free?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, completely free with no signup required. Enter any URL and get an instant graded report."
          }
        },
        {
          "@type": "Question",
          "name": "What is the difference between this and the full audit?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "This is a surface scan of one page. The full $500 audit covers AI citations across ChatGPT, Perplexity, and Gemini, competitor teardown, keyword gap analysis, and produces a 90-day roadmap with six deliverables."
          }
        }
      ]
    }
  ]
}
</script>
<style>
:root{
  --bg:#121212;
  --bg-lift:#1c1c1c;
  --bg-edge:#242424;
  --gold:#e8c767;
  --gold-dim:#bfa04d;
  --gold-wash:rgba(232,199,103,.14);
  --text:#fbf8ef;
  --text-soft:rgba(251,248,239,.98);
  --text-mute:rgba(251,248,239,.86);
  --text-faint:rgba(251,248,239,.68);
  --line:rgba(251,248,239,.28);
  --line-strong:rgba(251,248,239,.44);
  --serif:"Playfair Display",Georgia,serif;
  --mono:"DM Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  --label:"Barlow Condensed","Arial Narrow",sans-serif;
  --gutter:clamp(20px,4vw,64px);
  --max:1120px;
  --ease:cubic-bezier(.2,.7,.2,1);
}

*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{
  background:var(--bg);
  color:var(--text);
  font-family:var(--mono);
  font-size:14px;
  line-height:1.65;
  font-weight:300;
  -webkit-font-smoothing:antialiased;
  -moz-osx-font-smoothing:grayscale;
  text-rendering:optimizeLegibility;
  overflow-x:hidden;
  min-height:100vh;
}
img,svg{display:block;max-width:100%}
a{color:inherit;text-decoration:none}
button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;padding:0}
::selection{background:var(--gold);color:var(--bg)}

/* grain overlay */
.grain{
  position:fixed;inset:-50%;
  width:200%;height:200%;
  pointer-events:none;z-index:100;
  opacity:.14;mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .55 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
  background-size:260px 260px;
  animation:grain 1.2s steps(6) infinite;
}
@keyframes grain{
  0%{transform:translate(0,0)}
  20%{transform:translate(-3%,2%)}
  40%{transform:translate(2%,-3%)}
  60%{transform:translate(-2%,-2%)}
  80%{transform:translate(3%,3%)}
  100%{transform:translate(0,0)}
}

/* vignette */
body::before{
  content:"";position:fixed;inset:0;
  pointer-events:none;z-index:99;
  background:
    radial-gradient(120% 80% at 50% 0%,transparent 40%,rgba(0,0,0,.45) 100%),
    radial-gradient(80% 60% at 50% 100%,transparent 45%,rgba(0,0,0,.4) 100%);
}

/* layout */
.wrap{
  width:100%;max-width:var(--max);
  margin:0 auto;padding:0 var(--gutter);
  position:relative;
}

/* nav */
.nav{
  padding:28px var(--gutter);
  display:flex;align-items:center;
  justify-content:space-between;
  position:relative;z-index:10;
}
.nav .mark{
  font-family:var(--serif);
  font-style:italic;font-size:22px;
  letter-spacing:-.01em;
  color:var(--gold);
}
.nav .tool-name{
  font-family:var(--label);
  text-transform:uppercase;
  letter-spacing:.18em;
  font-size:11px;
  color:var(--text-mute);
}

/* hero */
.hero{
  text-align:center;
  padding:60px 0 40px;
  position:relative;z-index:10;
}
.hero h1{
  font-family:var(--serif);
  font-size:clamp(32px,5.5vw,56px);
  font-weight:400;
  letter-spacing:-.02em;
  line-height:1.08;
  margin-bottom:20px;
}
.hero h1 em{font-style:italic;color:var(--gold)}
.hero .sub{
  font-family:var(--mono);
  font-size:13px;
  color:var(--text-faint);
  max-width:520px;
  margin:0 auto 36px;
  line-height:1.7;
}

/* input area */
.input-area{
  display:flex;gap:12px;
  max-width:600px;margin:0 auto;
  position:relative;z-index:10;
}
.input-area input{
  flex:1;
  background:var(--bg-lift);
  border:1px solid var(--line);
  border-radius:4px;
  padding:14px 18px;
  font-family:var(--mono);
  font-size:14px;
  color:var(--text);
  outline:none;
  transition:border-color .3s var(--ease);
}
.input-area input:focus{border-color:var(--gold)}
.input-area input::placeholder{color:var(--text-faint)}
.input-area button{
  background:transparent;
  border:1px solid var(--gold);
  color:var(--gold);
  padding:14px 28px;
  font-family:var(--label);
  text-transform:uppercase;
  letter-spacing:.18em;
  font-size:12px;
  font-weight:500;
  border-radius:4px;
  transition:background .35s var(--ease),color .35s var(--ease);
  white-space:nowrap;
}
.input-area button:hover{background:var(--gold);color:var(--bg)}
.input-area button:disabled{opacity:.4;cursor:not-allowed}

/* loading */
.loading{
  display:none;
  text-align:center;
  padding:40px 0;
  position:relative;z-index:10;
}
.loading.active{display:block}
.loading .dot{
  display:inline-block;
  width:10px;height:10px;
  background:var(--gold);
  border-radius:50%;
  animation:pulse 1.2s ease-in-out infinite;
  margin-right:12px;
}
@keyframes pulse{
  0%,100%{opacity:1;transform:scale(1)}
  50%{opacity:.4;transform:scale(.7)}
}
.loading .text{
  font-family:var(--mono);
  font-size:13px;
  color:var(--text-mute);
}

/* error */
.error-msg{
  display:none;
  text-align:center;
  padding:20px;
  margin:20px auto;
  max-width:600px;
  background:rgba(200,60,60,.08);
  border:1px solid rgba(200,60,60,.3);
  border-radius:4px;
  color:#e8a0a0;
  font-size:13px;
  position:relative;z-index:10;
}
.error-msg.active{display:block}

/* results */
.results{
  display:none;
  padding:20px 0 80px;
  position:relative;z-index:10;
}
.results.active{display:block}

/* grade card */
.grade-section{
  text-align:center;
  padding:40px 0;
  animation:fadeUp .6s var(--ease) both;
}
.grade-circle{
  display:inline-flex;
  align-items:center;justify-content:center;
  width:140px;height:140px;
  border-radius:50%;
  border:2px solid var(--gold);
  margin-bottom:16px;
  position:relative;
}
.grade-circle .letter{
  font-family:var(--serif);
  font-size:72px;
  font-weight:400;
  color:var(--gold);
}
.grade-circle.grade-c .letter,.grade-circle.grade-d .letter,.grade-circle.grade-f .letter{
  color:var(--text-faint);
}
.grade-circle.grade-c,.grade-circle.grade-d,.grade-circle.grade-f{
  border-color:var(--text-faint);
}
.aeo-score{
  font-family:var(--label);
  text-transform:uppercase;
  letter-spacing:.2em;
  font-size:12px;
  color:var(--text-mute);
  margin-top:8px;
}
.aeo-score span{
  color:var(--gold);
  font-size:20px;
  font-weight:500;
  letter-spacing:0;
}
.grade-domain{
  font-family:var(--mono);
  font-size:12px;
  color:var(--text-faint);
  margin-top:12px;
}

/* section labels */
.section-label{
  display:flex;align-items:center;gap:14px;
  font-family:var(--label);
  text-transform:uppercase;
  letter-spacing:.22em;
  font-size:11px;
  color:var(--text-mute);
  margin:48px 0 24px;
}
.section-label .num{color:var(--gold);font-weight:500}
.section-label .rule{flex:1;height:1px;background:var(--line)}

/* schema coverage grid */
.schema-grid{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(200px,1fr));
  gap:12px;
}
.schema-card{
  background:var(--bg-lift);
  border:1px solid var(--line);
  border-radius:4px;
  padding:16px 18px;
  display:flex;align-items:center;gap:12px;
  animation:fadeUp .5s var(--ease) both;
}
.schema-card .icon{
  font-family:var(--mono);
  font-size:16px;
  width:24px;text-align:center;
}
.schema-card .icon.present{color:var(--gold)}
.schema-card .icon.missing{color:var(--text-faint)}
.schema-card .name{
  font-family:var(--mono);
  font-size:12px;
  color:var(--text-mute);
}
.schema-card.is-present{border-color:rgba(232,199,103,.25)}

/* technical signals */
.tech-list{display:flex;flex-direction:column;gap:8px}
.tech-row{
  display:flex;align-items:flex-start;gap:16px;
  padding:14px 18px;
  background:var(--bg-lift);
  border:1px solid var(--line);
  border-radius:4px;
  animation:fadeUp .5s var(--ease) both;
}
.tech-row .label{
  font-family:var(--label);
  text-transform:uppercase;
  letter-spacing:.15em;
  font-size:11px;
  color:var(--text-faint);
  min-width:130px;
  padding-top:2px;
}
.tech-row .value{
  font-family:var(--mono);
  font-size:12px;
  color:var(--text-mute);
  flex:1;
  word-break:break-word;
}
.tech-row .status{
  width:8px;height:8px;
  border-radius:50%;
  margin-top:5px;
  flex-shrink:0;
}
.tech-row .status.good{background:#5cb85c}
.tech-row .status.warning{background:var(--gold-dim)}
.tech-row .status.bad{background:#c85050}

/* red flags */
.flags-list{display:flex;flex-direction:column;gap:8px}
.flag-card{
  padding:14px 18px;
  background:var(--bg-lift);
  border:1px solid var(--line);
  border-left:3px solid var(--gold-dim);
  border-radius:4px;
  font-family:var(--mono);
  font-size:12px;
  color:var(--text-mute);
  line-height:1.6;
  animation:fadeUp .5s var(--ease) both;
}

/* cta section */
.cta-section{
  margin-top:64px;
  padding:40px;
  background:var(--bg-lift);
  border:1px solid var(--line);
  border-radius:6px;
  text-align:center;
  animation:fadeUp .6s var(--ease) .3s both;
}
.cta-section h3{
  font-family:var(--serif);
  font-size:24px;
  margin-bottom:16px;
}
.cta-section p{
  font-family:var(--mono);
  font-size:13px;
  color:var(--text-faint);
  max-width:560px;
  margin:0 auto 24px;
  line-height:1.7;
}
.cta-section a.btn{
  display:inline-block;
  border:1px solid var(--gold);
  color:var(--gold);
  padding:14px 32px;
  font-family:var(--label);
  text-transform:uppercase;
  letter-spacing:.18em;
  font-size:12px;
  font-weight:500;
  border-radius:4px;
  transition:background .35s var(--ease),color .35s var(--ease);
}
.cta-section a.btn:hover{background:var(--gold);color:var(--bg)}

/* footer */
.footer{
  padding:48px 0;
  text-align:center;
  position:relative;z-index:10;
}
.footer .built{
  font-family:var(--mono);
  font-size:12px;
  color:var(--text-faint);
}
.footer a{color:var(--gold-dim);transition:color .3s}
.footer a:hover{color:var(--gold)}
.footer .email{
  margin-top:8px;
  font-family:var(--mono);
  font-size:11px;
  color:var(--text-faint);
}

/* animations */
@keyframes fadeUp{
  from{opacity:0;transform:translateY(16px)}
  to{opacity:1;transform:translateY(0)}
}

/* responsive */
@media(max-width:600px){
  .input-area{flex-direction:column}
  .input-area button{width:100%}
  .schema-grid{grid-template-columns:1fr 1fr}
  .tech-row{flex-direction:column;gap:6px}
  .tech-row .label{min-width:unset}
  .cta-section{padding:28px 20px}
}
</style>
</head>
<body>
<div class="grain"></div>

<nav class="nav">
  <a href="https://neverranked.com" class="mark">N</a>
  <span class="tool-name">Schema & AEO Health Check</span>
</nav>

<main class="wrap">
  <section class="hero">
    <h1>How ready is your site<br>for <em>AI search</em>?</h1>
    <p class="sub">Enter your URL. Get an instant grade on schema coverage, technical signals, and AEO readiness. Free. No signup.</p>
    <div class="input-area">
      <input type="url" id="url-input" placeholder="https://example.com" autocomplete="url" spellcheck="false">
      <button id="run-btn" type="button">Run check</button>
    </div>
  </section>

  <div class="loading" id="loading">
    <span class="dot"></span>
    <span class="text" id="loading-text">Analyzing...</span>
  </div>

  <div class="error-msg" id="error-msg"></div>

  <section class="results" id="results">
    <div class="grade-section" id="grade-section"></div>

    <div class="section-label"><span class="num">01</span> Schema Coverage <span class="rule"></span></div>
    <div class="schema-grid" id="schema-grid"></div>

    <div class="section-label"><span class="num">02</span> Technical Signals <span class="rule"></span></div>
    <div class="tech-list" id="tech-list"></div>

    <div class="section-label" id="flags-label" style="display:none"><span class="num">03</span> Red Flags <span class="rule"></span></div>
    <div class="flags-list" id="flags-list"></div>

    <div class="cta-section">
      <h3>Want the full audit?</h3>
      <p>This is a surface scan. The full audit goes deeper: AI citation tracking across ChatGPT, Perplexity, and Gemini. Competitor teardown. Keyword gap analysis. 90-day roadmap. Six deliverables. $500.</p>
      <a href="https://neverranked.com/#intake" class="btn">Book the $500 audit</a>
    </div>
  </section>
</main>

<footer class="footer">
  <p class="built">Built by <a href="https://neverranked.com">Never Ranked</a></p>
  <p class="email"><a href="mailto:hello@neverranked.com">hello@neverranked.com</a></p>
</footer>

<script>
(function(){
  const input = document.getElementById('url-input');
  const btn = document.getElementById('run-btn');
  const loading = document.getElementById('loading');
  const loadingText = document.getElementById('loading-text');
  const errorMsg = document.getElementById('error-msg');
  const results = document.getElementById('results');
  const gradeSection = document.getElementById('grade-section');
  const schemaGrid = document.getElementById('schema-grid');
  const techList = document.getElementById('tech-list');
  const flagsLabel = document.getElementById('flags-label');
  const flagsList = document.getElementById('flags-list');

  function escHtml(s){
    const d=document.createElement('div');
    d.textContent=s;
    return d.innerHTML;
  }

  function normalizeUrl(val){
    val = val.trim();
    if(!val) return '';
    if(!/^https?:\\/\\//i.test(val)) val = 'https://'+val;
    return val;
  }

  async function runCheck(){
    const url = normalizeUrl(input.value);
    if(!url){input.focus();return;}

    let domain;
    try{domain=new URL(url).hostname}catch{domain=url}

    btn.disabled=true;
    errorMsg.classList.remove('active');
    results.classList.remove('active');
    loading.classList.add('active');
    loadingText.textContent='Analyzing '+domain+'...';

    try{
      const resp = await fetch('/api/check',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({url})
      });
      const data = await resp.json();
      if(!resp.ok) throw new Error(data.error||'Check failed');
      renderResults(data);
    }catch(err){
      errorMsg.textContent=err.message||'Something went wrong. Please try again.';
      errorMsg.classList.add('active');
    }finally{
      loading.classList.remove('active');
      btn.disabled=false;
    }
  }

  function renderResults(data){
    // Grade
    const gradeClass = 'grade-'+data.grade.toLowerCase();
    gradeSection.innerHTML=
      '<div class="grade-circle '+gradeClass+'">'+
        '<span class="letter">'+data.grade+'</span>'+
      '</div>'+
      '<div class="aeo-score">AEO Readiness: <span>'+data.aeo_score+'</span>/100</div>'+
      '<div class="grade-domain">'+escHtml(data.domain)+'</div>';

    // Schema coverage
    schemaGrid.innerHTML='';
    data.schema_coverage.forEach(function(s,i){
      const card=document.createElement('div');
      card.className='schema-card'+(s.present?' is-present':'');
      card.style.animationDelay=(i*0.06)+'s';
      card.innerHTML=
        '<span class="icon '+(s.present?'present':'missing')+'">'+(s.present?'+':'-')+'</span>'+
        '<span class="name">'+escHtml(s.type)+'</span>';
      schemaGrid.appendChild(card);
    });

    // Technical signals
    techList.innerHTML='';
    data.technical_signals.forEach(function(t,i){
      const row=document.createElement('div');
      row.className='tech-row';
      row.style.animationDelay=(i*0.06)+'s';
      row.innerHTML=
        '<span class="status '+t.status+'"></span>'+
        '<span class="label">'+escHtml(t.label)+'</span>'+
        '<span class="value">'+escHtml(t.value)+'</span>';
      techList.appendChild(row);
    });

    // Red flags
    flagsList.innerHTML='';
    if(data.red_flags.length>0){
      flagsLabel.style.display='flex';
      data.red_flags.forEach(function(f,i){
        const card=document.createElement('div');
        card.className='flag-card';
        card.style.animationDelay=(i*0.06)+'s';
        card.textContent=f;
        flagsList.appendChild(card);
      });
    }else{
      flagsLabel.style.display='none';
    }

    results.classList.add('active');
    gradeSection.scrollIntoView({behavior:'smooth',block:'start'});
  }

  btn.addEventListener('click',runCheck);
  input.addEventListener('keydown',function(e){
    if(e.key==='Enter')runCheck();
  });
})();
</script>
</body>
</html>`;

// ---------- Worker handler ----------

export default {
  async fetch(request: Request, _env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // API endpoint
    if (url.pathname === "/api/check" && request.method === "POST") {
      // Rate limiting
      const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
      if (isRateLimited(ip)) {
        return Response.json(
          { error: "Rate limit exceeded. Please wait a moment before trying again." },
          { status: 429, headers: corsHeaders }
        );
      }

      let body: { url?: string };
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "Invalid request body." }, { status: 400, headers: corsHeaders });
      }

      const targetUrl = body.url?.trim();
      if (!targetUrl) {
        return Response.json({ error: "Please provide a URL." }, { status: 400, headers: corsHeaders });
      }

      // Validate URL
      let parsed: URL;
      try {
        parsed = new URL(targetUrl);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      } catch {
        return Response.json({ error: "Invalid URL. Please include https://." }, { status: 400, headers: corsHeaders });
      }

      // Fetch target
      let html: string;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        const resp = await fetch(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 NeverRanked-SchemaCheck/1.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          signal: controller.signal,
          redirect: "follow",
        });
        clearTimeout(timeout);

        if (!resp.ok) {
          return Response.json(
            { error: `Could not fetch the site (HTTP ${resp.status}). Make sure the URL is publicly accessible.` },
            { status: 422, headers: corsHeaders }
          );
        }

        html = await resp.text();
      } catch (err: unknown) {
        const message = err instanceof Error && err.name === "AbortError"
          ? "Request timed out (10s). The site may be too slow or blocking requests."
          : "Could not reach the site. Check the URL and make sure it is publicly accessible.";
        return Response.json({ error: message }, { status: 422, headers: corsHeaders });
      }

      const report = buildReport(targetUrl, html);
      return Response.json(report, { headers: corsHeaders });
    }

    // Serve HTML UI
    return new Response(HTML_PAGE, {
      headers: {
        "Content-Type": "text/html;charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        ...corsHeaders,
      },
    });
  },
};
