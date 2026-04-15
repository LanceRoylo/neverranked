/**
 * Demo mode -- Fixture data for Meridian Dental
 *
 * Realistic fake data for the public demo. No DB queries.
 * This file defines everything the demo pages need to render.
 */

// --- Timestamps ---
const NOW = Math.floor(Date.now() / 1000);
const WEEK = 7 * 86400;
const DAY = 86400;

export const DEMO_SLUG = "meridian-dental";
export const DEMO_DOMAIN = "meridiandental.com";
export const DEMO_DOMAIN_ID = 0;

// --- Scan history (12 weeks, trending up) ---
export const SCAN_HISTORY = [
  { aeo_score: 34, grade: "D", scanned_at: NOW - 12 * WEEK },
  { aeo_score: 38, grade: "D", scanned_at: NOW - 11 * WEEK },
  { aeo_score: 41, grade: "C", scanned_at: NOW - 10 * WEEK },
  { aeo_score: 45, grade: "C", scanned_at: NOW - 9 * WEEK },
  { aeo_score: 48, grade: "C", scanned_at: NOW - 8 * WEEK },
  { aeo_score: 51, grade: "C", scanned_at: NOW - 7 * WEEK },
  { aeo_score: 55, grade: "C", scanned_at: NOW - 6 * WEEK },
  { aeo_score: 57, grade: "C", scanned_at: NOW - 5 * WEEK },
  { aeo_score: 60, grade: "B", scanned_at: NOW - 4 * WEEK },
  { aeo_score: 63, grade: "B", scanned_at: NOW - 3 * WEEK },
  { aeo_score: 65, grade: "B", scanned_at: NOW - 2 * WEEK },
  { aeo_score: 68, grade: "B", scanned_at: NOW - WEEK },
];

export const LATEST_SCAN = SCAN_HISTORY[SCAN_HISTORY.length - 1];
export const PREVIOUS_SCAN = SCAN_HISTORY[SCAN_HISTORY.length - 2];

// --- Full latest scan result ---
export const LATEST_SCAN_FULL = {
  id: 1,
  domain_id: DEMO_DOMAIN_ID,
  url: `https://${DEMO_DOMAIN}/`,
  aeo_score: 68,
  grade: "B",
  schema_types: JSON.stringify(["Organization", "LocalBusiness", "FAQPage", "BreadcrumbList", "WebSite"]),
  red_flags: JSON.stringify([
    "No AggregateRating schema found",
    "Missing Review schema markup",
    "Meta description is 43 characters (recommended: 120-160)",
  ]),
  technical_signals: JSON.stringify([
    { label: "HTTPS", value: "Active", status: "good" },
    { label: "Mobile friendly", value: "Responsive", status: "good" },
    { label: "Meta description", value: "43 chars", status: "warning" },
    { label: "H1 tag", value: "Present", status: "good" },
    { label: "Canonical URL", value: "Set", status: "good" },
    { label: "Open Graph", value: "Complete", status: "good" },
    { label: "Robots.txt", value: "Present", status: "good" },
    { label: "Sitemap", value: "Found", status: "good" },
    { label: "Page speed", value: "2.1s", status: "warning" },
    { label: "Schema depth", value: "5 types", status: "good" },
  ]),
  schema_coverage: JSON.stringify([
    { type: "Organization", present: true },
    { type: "LocalBusiness", present: true },
    { type: "FAQPage", present: true },
    { type: "BreadcrumbList", present: true },
    { type: "WebSite", present: true },
    { type: "Service", present: false },
    { type: "AggregateRating", present: false },
    { type: "Review", present: false },
    { type: "Article", present: false },
  ]),
  signals_json: "{}",
  scan_type: "cron",
  error: null,
  scanned_at: NOW - WEEK,
};

// --- Score projection ---
export const PROJECTION = {
  currentScore: 68,
  projectedScore: 82,
  gains: [
    { category: "schema", count: 3, points: 8 },
    { category: "content", count: 4, points: 8 },
    { category: "technical", count: 2, points: 7 },
    { category: "authority", count: 2, points: 3 },
  ],
  totalItems: 18,
  doneItems: 7,
};

// --- Citation snapshots (12 weeks) ---
export const CITATION_SNAPSHOTS = [
  { citation_share: 0.05, client_citations: 1, total_queries: 20, week_start: NOW - 12 * WEEK },
  { citation_share: 0.05, client_citations: 1, total_queries: 20, week_start: NOW - 11 * WEEK },
  { citation_share: 0.10, client_citations: 2, total_queries: 20, week_start: NOW - 10 * WEEK },
  { citation_share: 0.10, client_citations: 2, total_queries: 20, week_start: NOW - 9 * WEEK },
  { citation_share: 0.15, client_citations: 3, total_queries: 20, week_start: NOW - 8 * WEEK },
  { citation_share: 0.15, client_citations: 3, total_queries: 20, week_start: NOW - 7 * WEEK },
  { citation_share: 0.20, client_citations: 4, total_queries: 20, week_start: NOW - 6 * WEEK },
  { citation_share: 0.20, client_citations: 4, total_queries: 20, week_start: NOW - 5 * WEEK },
  { citation_share: 0.25, client_citations: 5, total_queries: 20, week_start: NOW - 4 * WEEK },
  { citation_share: 0.30, client_citations: 6, total_queries: 20, week_start: NOW - 3 * WEEK },
  { citation_share: 0.30, client_citations: 6, total_queries: 20, week_start: NOW - 2 * WEEK },
  { citation_share: 0.35, client_citations: 7, total_queries: 20, week_start: NOW - WEEK },
];

// --- Citation matrix (8 keywords x 3 entities) ---
export const CITATION_KEYWORDS = [
  "best dentist near me",
  "cosmetic dentistry options",
  "dental implants cost",
  "emergency dental care",
  "teeth whitening professional",
  "invisalign vs braces",
  "pediatric dentist recommendations",
  "root canal procedure",
];

export const CITATION_COMPETITORS = ["Aspen Dental", "Bright Smiles Family"];

// Matrix: for each keyword, who is cited [client, comp1, comp2]
export const CITATION_MATRIX: Record<string, [boolean, boolean, boolean]> = {
  "best dentist near me":          [true,  true,  false],
  "cosmetic dentistry options":    [true,  false, true ],
  "dental implants cost":          [false, true,  true ],
  "emergency dental care":         [true,  true,  true ],
  "teeth whitening professional":  [false, true,  false],
  "invisalign vs braces":          [false, false, true ],
  "pediatric dentist recommendations": [true,  false, false],
  "root canal procedure":          [false, true,  true ],
};

// --- Content gap suggestions ---
export const CONTENT_GAPS = [
  { keyword: "dental implants cost", category: "services", competitors: ["Aspen Dental", "Bright Smiles Family"], engines: ["openai", "perplexity"] },
  { keyword: "teeth whitening professional", category: "services", competitors: ["Aspen Dental"], engines: ["openai", "gemini"] },
  { keyword: "invisalign vs braces", category: "comparisons", competitors: ["Bright Smiles Family"], engines: ["perplexity", "gemini"] },
  { keyword: "root canal procedure", category: "procedures", competitors: ["Aspen Dental", "Bright Smiles Family"], engines: ["openai", "perplexity", "gemini"] },
];

// --- Roadmap ---
export const ROADMAP_PHASES = [
  {
    id: 1, phase_number: 1, title: "Foundation", subtitle: "Get the basics right",
    description: "Core technical SEO, essential schema markup, and content fundamentals that AI models need to understand and cite your site.",
    status: "completed" as const, completed_at: NOW - 6 * WEEK,
  },
  {
    id: 2, phase_number: 2, title: "Growth", subtitle: "Expand your visibility",
    description: "Advanced schema coverage, content authority signals, entity optimization, and competitive gap closure.",
    status: "active" as const, completed_at: null,
  },
  {
    id: 3, phase_number: 3, title: "Dominance", subtitle: "Own your category",
    description: "Featured snippet capture, cross-platform entity presence, competitive displacement, and sustained authority building.",
    status: "locked" as const, completed_at: null,
  },
];

export const ROADMAP_ITEMS = [
  // Phase 1 (completed)
  { id: 1, phase_id: 1, title: "Deploy Organization schema", category: "schema", status: "done", completed_at: NOW - 11 * WEEK },
  { id: 2, phase_id: 1, title: "Deploy LocalBusiness schema", category: "schema", status: "done", completed_at: NOW - 10 * WEEK },
  { id: 3, phase_id: 1, title: "Add FAQPage schema to service pages", category: "schema", status: "done", completed_at: NOW - 9 * WEEK },
  { id: 4, phase_id: 1, title: "Fix meta descriptions across all pages", category: "technical", status: "done", completed_at: NOW - 9 * WEEK },
  { id: 5, phase_id: 1, title: "Set up BreadcrumbList navigation schema", category: "schema", status: "done", completed_at: NOW - 8 * WEEK },
  // Phase 2 (active -- mixed statuses)
  { id: 6, phase_id: 2, title: "Add AggregateRating schema", category: "schema", status: "in_progress", completed_at: null },
  { id: 7, phase_id: 2, title: "Create dental implants pillar article", category: "content", status: "in_progress", completed_at: null },
  { id: 8, phase_id: 2, title: "Deploy Review schema with Google reviews", category: "schema", status: "pending", completed_at: null },
  { id: 9, phase_id: 2, title: "Write teeth whitening comparison guide", category: "content", status: "pending", completed_at: null },
  { id: 10, phase_id: 2, title: "Optimize page speed to under 1.5s", category: "technical", status: "in_progress", completed_at: null },
  { id: 11, phase_id: 2, title: "Add Service schema to each treatment page", category: "schema", status: "pending", completed_at: null },
  { id: 12, phase_id: 2, title: "Build Invisalign vs braces FAQ content", category: "content", status: "pending", completed_at: null },
  { id: 13, phase_id: 2, title: "Claim and optimize Google Business Profile", category: "authority", status: "done", completed_at: NOW - 3 * WEEK },
  { id: 14, phase_id: 2, title: "Get listed on Healthgrades and Zocdoc", category: "authority", status: "done", completed_at: NOW - 2 * WEEK },
  // Phase 3 (locked)
  { id: 15, phase_id: 3, title: "Deploy Article schema on blog posts", category: "schema", status: "pending", completed_at: null },
  { id: 16, phase_id: 3, title: "Create root canal procedure deep-dive", category: "content", status: "pending", completed_at: null },
  { id: 17, phase_id: 3, title: "Build emergency dental care landing page", category: "content", status: "pending", completed_at: null },
  { id: 18, phase_id: 3, title: "Establish backlinks from dental associations", category: "authority", status: "pending", completed_at: null },
];

// --- GSC data ---
export const GSC_DATA = {
  clicks: 1240,
  impressions: 18600,
  ctr: 6.7,
  position: 14.2,
  prevClicks: 1080,
  prevImpressions: 16200,
  topQueries: [
    { query: "dentist downtown", clicks: 180, impressions: 2400 },
    { query: "meridian dental reviews", clicks: 120, impressions: 890 },
    { query: "teeth whitening near me", clicks: 95, impressions: 3200 },
    { query: "emergency dentist open now", clicks: 82, impressions: 1900 },
    { query: "dental implants cost", clicks: 68, impressions: 2800 },
  ],
};

// --- Page-level schema coverage ---
export const PAGE_SCANS = [
  { path: "/", schemas_found: 5, schemas_missing: 2, score: 71 },
  { path: "/services/implants", schemas_found: 3, schemas_missing: 3, score: 50 },
  { path: "/services/whitening", schemas_found: 2, schemas_missing: 4, score: 33 },
  { path: "/services/invisalign", schemas_found: 2, schemas_missing: 4, score: 33 },
  { path: "/about", schemas_found: 4, schemas_missing: 1, score: 80 },
  { path: "/contact", schemas_found: 3, schemas_missing: 2, score: 60 },
  { path: "/blog/dental-implant-guide", schemas_found: 1, schemas_missing: 3, score: 25 },
];
