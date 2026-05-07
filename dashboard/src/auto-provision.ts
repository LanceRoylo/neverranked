/**
 * Dashboard -- Auto-provision roadmap for clients
 *
 * Generates a multi-phase roadmap from scan results:
 *   Phase 1 (Foundation): Fix red flags + add critical missing schema
 *   Phase 2 (Growth): Expand schema coverage + content optimization
 *   Phase 3 (Dominance): Advanced entity optimization + competitive displacement
 *
 * Runs on first scan (onboarding/checkout). Can be re-triggered by admin
 * via regenerateRoadmap() which clears existing items first.
 */

import type { Env, ScanResult, Domain } from "./types";
import { hasSchemaType } from "../../packages/aeo-analyzer/src";

interface RoadmapSeed {
  title: string;
  description: string;
  category: "schema" | "content" | "technical" | "authority";
  priority: number;
}

interface ScanContext {
  schemaTypes: string[];
  schemaCoverage: { type: string; present: boolean }[];
  redFlags: string[];
  techSignals: { label: string; value: string; status: string }[];
  score: number;
  domain: string;
}

// Uses the shared schema.org hierarchy, so subtypes count as matching
// parent types (e.g. ProfessionalService satisfies an Organization check).
// schemaCoverage is also consulted in case a caller pre-computed it with
// the same helper upstream.
function hasSchema(ctx: ScanContext, type: string): boolean {
  if (ctx.schemaCoverage.some(c => c.type === type && c.present)) return true;
  return hasSchemaType(ctx.schemaTypes, type);
}

// ---------------------------------------------------------------------------
// Phase 1: Foundation — fix what's broken, add what's missing
// ---------------------------------------------------------------------------

function generatePhase1(ctx: ScanContext): RoadmapSeed[] {
  const items: RoadmapSeed[] = [];
  let p = 1;

  // Red flag items — each red flag becomes a specific task
  const flagGroups = groupRedFlags(ctx.redFlags);

  if (flagGroups.missingTitle) {
    items.push({ title: "Give every page a clear name", description: "Some pages don't have a title (the bit of text browsers show in the tab and search engines show as the headline). Without it, AI engines have no quick context for what the page is about.\n\nWhere to fix it:\n- WordPress: page editor -> SEO field (Yoast / Rank Math)\n- Squarespace: page settings -> SEO -> Browser Title\n- Webflow: page settings -> Title Tag\n- Wix: SEO Tools -> Page Title\n- Custom-coded: ask your dev to add a <title> tag in the <head> of every page", category: "technical", priority: p++ });
  }
  if (flagGroups.missingMeta) {
    items.push({ title: "Add a one-line summary to each page", description: "A meta description is the 120-160 character summary search engines and AI assistants show under your link. Without it, they generate one from your page content (often badly).\n\nWhere to fix it:\n- WordPress: page editor -> SEO meta description field (Yoast / Rank Math)\n- Squarespace: page settings -> SEO Description\n- Webflow: page settings -> Meta Description\n- Wix: SEO Tools -> Meta Description\n- Custom-coded: ask your dev for a <meta name=\"description\"> tag per page", category: "content", priority: p++ });
  }
  if (flagGroups.missingH1) {
    items.push({ title: "Make sure every page has one clear headline", description: "Every page needs exactly ONE main headline (the H1 tag) followed by smaller subheadings (H2, H3). Right now your pages either have no main headline or have several competing for attention, which confuses AI engines about what the page is actually about.\n\nWhere to fix it:\n- WordPress, Squarespace, Webflow, Wix: use the page editor's heading style buttons. Heading 1 is the one main headline. Heading 2 is for section titles.\n- Custom-coded: ask your dev to use one <h1> per page, with <h2>s for sections", category: "content", priority: p++ });
  }
  if (flagGroups.noHttps) {
    items.push({ title: "Switch your site to a secure (https) connection", description: "Right now your site loads over http instead of https. Modern browsers warn visitors that the site is \"not secure,\" and search engines and AI engines treat http as a trust failure. The fix is enabling SSL (a free, automatic certificate).\n\nWhere to fix it:\n- Most modern hosting (Squarespace, Wix, Webflow, Shopify): SSL is built in, just toggle it on in site settings\n- WordPress: install the Really Simple SSL plugin, or get a free Let's Encrypt cert from your host (most hosts offer this in their control panel)\n- Custom-coded / self-hosted: ask your dev to install a Let's Encrypt cert (free, takes 10 minutes)", category: "technical", priority: p++ });
  }
  if (flagGroups.slowPage) {
    items.push({ title: "Make your pages load faster", description: "Pages that take longer than 3 seconds to load lose visitors and get downranked by both search engines and AI engines. The most common culprits are oversized images, too many third-party scripts, and slow hosting.\n\nWhere to fix it:\n- Compress images: use Squoosh.app, TinyPNG, or your CMS's built-in compression. Aim for under 200KB per image.\n- Remove unused plugins / scripts: each one slows the page. WordPress sites often have 20+ plugins; trim to the essential 5-10.\n- Test your speed at PageSpeed Insights (pagespeed.web.dev). Score under 70 = fix is worth doing.\n- For deeper issues: ask your dev about lazy loading, a CDN (Cloudflare is free), or upgrading hosting", category: "technical", priority: p++ });
  }
  if (flagGroups.robotsBlocked) {
    items.push({ title: "Let AI crawlers read your site", description: "Your robots.txt file is currently telling AI crawlers (GPTBot, PerplexityBot, ClaudeBot, Google-Extended) NOT to read your content. That means ChatGPT, Perplexity, Claude, and Gemini can't see what's on your site at all. They'll never cite you because they can't read you.\n\nWhere to fix it:\n- WordPress: edit robots.txt via Yoast or Rank Math (SEO settings -> Tools -> File Editor)\n- Squarespace, Wix: edit via SEO settings or contact their support\n- Webflow: Project Settings -> SEO -> robots.txt\n- Custom-coded: edit /robots.txt directly. Remove any \"Disallow\" lines targeting GPTBot, PerplexityBot, ClaudeBot, or Google-Extended", category: "technical", priority: p++ });
  }
  if (flagGroups.brokenSchema) {
    items.push({ title: "Fix the schema code that's currently broken", description: "Your site has structured data (the code that tells AI engines what your business is), but it has errors. Broken schema sends conflicting signals and can be worse than no schema at all.\n\nWhere to fix it:\n- Run your site URL through Google's Rich Results Test (search.google.com/test/rich-results). It will list every error.\n- WordPress: most errors come from outdated SEO plugins. Update Yoast, Rank Math, or whatever is generating your schema, then re-test.\n- Custom-coded: ask your dev to run the Rich Results Test, fix the listed errors, and re-validate. Common issues: missing required fields, wrong @type values, malformed JSON.", category: "schema", priority: p++ });
  }

  // Missing critical schema types
  if (!hasSchema(ctx, "Organization") && !hasSchema(ctx, "LocalBusiness")) {
    items.push({ title: "Tell Google and AI engines who you are", description: "Right now AI engines have no machine-readable way to know your business name, address, services, or hours. They cite competitors who do. This is the single most important fix on the list.\n\nWhere to fix it:\n- WordPress: install Yoast or Rank Math -> SEO -> Knowledge Graph -> set Organization or Local Business and fill in details\n- Squarespace: Settings -> Business Information (auto-generates from these fields)\n- Webflow: Project Settings -> SEO -> Custom Code -> paste a JSON-LD Organization block in the head\n- Wix: SEO Tools -> Structured Data Markup\n- Custom-coded: ask your dev for an Organization or LocalBusiness JSON-LD block in your sitewide template", category: "schema", priority: p++ });
  }
  if (!hasSchema(ctx, "WebSite")) {
    items.push({ title: "Identify your site as the official source", description: "WebSite schema is a small block of code that tells search engines and AI assistants \"this domain is the official site for this brand.\" It also enables the search box that sometimes appears under your site in Google results.\n\nWhere to fix it:\n- WordPress: most SEO plugins (Yoast, Rank Math) add this automatically once enabled\n- Squarespace and Wix: included by default\n- Webflow / custom-coded: ask your dev for a WebSite JSON-LD block on the homepage", category: "schema", priority: p++ });
  }
  if (!hasSchema(ctx, "BreadcrumbList")) {
    items.push({ title: "Show search engines how your pages connect", description: "Breadcrumbs are the trail like Home > Services > AEO. When you add them as structured data, Google and AI engines understand how your pages relate, and Google sometimes shows breadcrumbs in search results instead of your raw URL.\n\nWhere to fix it:\n- WordPress: most SEO plugins (Yoast, Rank Math, SEOPress) generate this automatically\n- Squarespace and Wix: usually included on collection / category pages\n- Webflow / custom-coded: ask your dev for a BreadcrumbList JSON-LD block on every page except the homepage", category: "schema", priority: p++ });
  }

  // Technical signal fixes
  for (const sig of ctx.techSignals) {
    if (sig.status === "bad" || sig.status === "error") {
      if (sig.label.toLowerCase().includes("og") || sig.label.toLowerCase().includes("open graph")) {
        items.push({ title: "Add social preview cards", description: "Right now when your site is shared on LinkedIn, Twitter, Slack, or referenced by ChatGPT, the preview is blank. With this fix, every share shows a proper image, title, and description (the things called Open Graph tags).\n\nWhere to fix it:\n- WordPress: Yoast or Rank Math -> Social tab -> upload a default image\n- Squarespace: Settings -> Marketing -> SEO -> enable preview image\n- Webflow: Page Settings -> Open Graph -> upload image\n- Wix: SEO Tools -> Social Share -> upload image\n- Custom-coded: ask your dev to add og:title, og:description, og:image meta tags in the head of every page", category: "technical", priority: p++ });
      } else if (sig.label.toLowerCase().includes("canonical")) {
        items.push({ title: "Tell Google which version of each page is the real one", description: "If your site is reachable at multiple URLs (with or without www, with or without trailing slash, with tracking parameters), Google may treat them as separate pages and split your traffic. Canonical tags fix that by naming the official URL for each page.\n\nWhere to fix it:\n- WordPress: Yoast or Rank Math handle this automatically once installed\n- Squarespace, Wix, Webflow: included by default\n- Custom-coded: ask your dev to add a <link rel=\"canonical\"> tag in the head of every page pointing to that page's preferred URL", category: "technical", priority: p++ });
      }
    }
  }

  // Remaining red flags not covered by specific items above. The
  // generic-fallback description used to read "Address it to remove
  // the penalty" — vague code-speak that violated the Clarity
  // Principle. Now: name the gap in plain English and tell the
  // customer where to start. Even a generic fallback should respect
  // the principle.
  const coveredPatterns = ["title", "meta description", "heading", "h1", "https", "speed", "slow", "robots", "schema", "invalid", "broken"];
  const uncoveredFlags = ctx.redFlags.filter(f => {
    const lower = f.toLowerCase();
    return !coveredPatterns.some(p => lower.includes(p));
  });
  for (const flag of uncoveredFlags.slice(0, 3)) {
    items.push({ title: flag, description: "Our scan flagged this on your site and it's reducing your AEO score. If you're not sure where to start, send us a note from the dashboard and we'll point you at the exact place to fix it on your specific platform (WordPress, Squarespace, Webflow, Wix, or custom-coded).", category: "technical", priority: p++ });
  }

  return items;
}

function groupRedFlags(flags: string[]): {
  missingTitle: boolean;
  missingMeta: boolean;
  missingH1: boolean;
  noHttps: boolean;
  slowPage: boolean;
  robotsBlocked: boolean;
  brokenSchema: boolean;
} {
  const lower = flags.map(f => f.toLowerCase());
  return {
    missingTitle: lower.some(f => f.includes("title") && (f.includes("missing") || f.includes("no "))),
    missingMeta: lower.some(f => f.includes("meta description")),
    missingH1: lower.some(f => f.includes("heading") || f.includes("h1")),
    noHttps: lower.some(f => f.includes("https") || f.includes("ssl")),
    slowPage: lower.some(f => f.includes("speed") || f.includes("slow") || f.includes("load time")),
    robotsBlocked: lower.some(f => f.includes("robots") || f.includes("blocked") || f.includes("crawl")),
    brokenSchema: lower.some(f => (f.includes("schema") || f.includes("structured data")) && (f.includes("invalid") || f.includes("broken") || f.includes("error"))),
  };
}

// ---------------------------------------------------------------------------
// Phase 2: Growth — expand coverage + content strategy
// ---------------------------------------------------------------------------

function generatePhase2(ctx: ScanContext): RoadmapSeed[] {
  const items: RoadmapSeed[] = [];
  let p = 1;

  // Schema types that are good for growth but not critical for foundation
  if (!hasSchema(ctx, "FAQPage")) {
    items.push({ title: "Turn your FAQs into something AI can quote directly", description: "When you mark up your FAQ section as structured data, ChatGPT, Perplexity, and Google AI Overviews can pull your exact answer and cite you. Without it, they paraphrase a competitor's page instead. Write 5-10 real customer questions per major service page (the questions you actually answer on sales calls).\n\nWhere to fix it:\n- WordPress: most SEO plugins (Yoast, Rank Math) include an FAQ block\n- Squarespace and Wix: use their FAQ block which auto-generates the schema\n- Webflow / custom-coded: ask your dev for an FAQPage JSON-LD block matching the visible Q&A", category: "schema", priority: p++ });
  }
  if (!hasSchema(ctx, "Article") && !hasSchema(ctx, "BlogPosting")) {
    items.push({ title: "Show AI engines who wrote your content and when", description: "Article schema is the small block of code that tells AI assistants this is content with an author, a publish date, and a topic. It helps them assess whether your post is fresh and credible enough to cite.\n\nWhere to fix it:\n- WordPress with Yoast or Rank Math: handles this automatically for blog posts\n- Squarespace: adds it to blog posts by default\n- Webflow / custom-coded: ask your dev for an Article (or BlogPosting) JSON-LD block on every blog/article template", category: "schema", priority: p++ });
  }
  if (!hasSchema(ctx, "Product") && !hasSchema(ctx, "Service")) {
    items.push({ title: "Make your offerings machine-readable", description: "Product and Service schema describes what you sell in a structured format AI engines can pull from: name, description, pricing, availability. When someone asks ChatGPT \"what does [your category] cost\" or \"who offers [your service]\", structured data is what lets you appear in the answer.\n\nWhere to fix it:\n- E-commerce platforms (Shopify, WooCommerce): generate Product schema automatically\n- WordPress service businesses: use Yoast or Schema Pro plugin to add Service schema per page\n- Webflow / custom-coded: ask your dev for Product or Service JSON-LD blocks", category: "schema", priority: p++ });
  }
  if (!hasSchema(ctx, "AggregateRating") && !hasSchema(ctx, "Review")) {
    items.push({ title: "Surface your reviews and ratings as social proof AI can cite", description: "If you have customer reviews on Google, Yelp, Trustpilot, or your own site, AggregateRating and Review schema lets AI engines pull \"4.8 stars, 124 reviews\" into their answers about you.\n\nWhere to fix it:\n- Review platforms (Trustpilot, Yotpo, Stamped): add this automatically when their widget is embedded\n- WordPress: use a review schema plugin (e.g. WP Review)\n- Webflow / custom-coded: ask your dev for AggregateRating JSON-LD pulling from your real review counts", category: "schema", priority: p++ });
  }

  // Content strategy items
  items.push({ title: "Write the FAQ page that answers what your buyers actually ask AI", description: "Most FAQ pages answer questions you wish customers asked. Instead, answer the 15-20 questions they actually type into ChatGPT, Perplexity, and Google about your industry. Plain factual answers, 2-4 sentences each. This page becomes the source AI engines reach for when summarizing your category. We can help you identify the actual queries to answer if you DM us from the dashboard.", category: "content", priority: p++ });

  items.push({ title: "Publish one definitive guide on your core topic", description: "AI engines prefer to cite comprehensive, single-source pages over scattered shorter posts. Pick one topic where you have deep expertise (the thing you'd write if you only got to write one piece) and write a 2,000+ word guide with proper headings, internal links, and a few citations. This becomes the page AI engines reach for first when answering about your area.", category: "content", priority: p++ });

  if (ctx.score < 60) {
    items.push({ title: "Either grow or remove your shortest pages", description: "Pages under 300 words of real content rarely get cited by AI engines (not enough substance to quote). Look at your site, find the thin pages (often About pages, contact pages, category landing pages), and either expand them with real detail or consolidate them with related pages. Where to find them: most CMS dashboards show word count per page in their SEO panel.", category: "content", priority: p++ });
  }

  // Authority building
  items.push({ title: "Claim your Google Business Profile and keep it current", description: "Your Google Business Profile feeds Google's AI Overviews and Maps results, and AI engines pull from it for local and business queries. If you have not claimed it, do that first. If you have, make sure your hours, phone, address, and recent photos are current, and ask happy customers for fresh reviews monthly. Manage it at business.google.com.", category: "authority", priority: p++ });

  items.push({ title: "Make sure your name, address, phone are identical everywhere", description: "AI engines build confidence in a business entity when its name, address, and phone number are spelled the same way across the web (your site, Google Business, Yelp, Facebook, industry directories). Even tiny differences (\"St.\" vs \"Street\", with or without a suite number) cost you. Audit your top 10 listings and fix inconsistencies.", category: "authority", priority: p++ });

  items.push({ title: "Get listed in the top directories for your industry", description: "Each listing on a recognized industry directory reinforces your business as a real entity in AI training data. Identify the 5-10 most-cited directories for your category (for dental: Healthgrades, Zocdoc, ADA Find-a-Dentist; for legal: Avvo, Justia, Martindale; for restaurants: OpenTable, Yelp, TripAdvisor). Submit consistent listings to each.", category: "authority", priority: p++ });

  return items;
}

// ---------------------------------------------------------------------------
// Phase 3: Dominance — advanced optimization
// ---------------------------------------------------------------------------

function generatePhase3(ctx: ScanContext): RoadmapSeed[] {
  const items: RoadmapSeed[] = [];
  let p = 1;

  items.push({ title: "Restructure your content around the things you sell, not the keywords you target", description: "Most sites organize content by keyword (\"best X services in Y city\"). AI engines understand the world as entities (specific people, places, things, services) and the relationships between them. Restructure your top pages to be about THE THING (your service, your team member, your location) and link related entities together. This is a content strategy shift, not a one-day fix.", category: "content", priority: p++ });

  items.push({ title: "Create comparison content (X vs Y, best X for Y)", description: "AI engines answer a huge volume of comparison queries (\"best CRM for small businesses\", \"X vs Y for [use case]\"). If you have honest comparison content positioning your offering against alternatives, AI engines cite it. Pick the 3-5 comparisons your buyers actually make and write a fair, named, opinionated piece for each.", category: "content", priority: p++ });

  items.push({ title: "Mark up your step-by-step content so AI can quote each step", description: "If you have tutorials, recipes, setup guides, or process content, HowTo schema is the structured format that lets AI engines cite individual steps in answers (\"step 3 of how to do X is...\"). Where to add: WordPress -> use a HowTo schema plugin or a Gutenberg HowTo block; Webflow / custom-coded -> ask your dev for a HowTo JSON-LD block on each tutorial page.", category: "schema", priority: p++ });

  items.push({ title: "Make your key pages voice-assistant friendly", description: "Speakable schema tells voice assistants (Siri, Alexa, Google Assistant) which sections of your page are best suited to read aloud. Most useful for news, FAQ, and how-to content. Where to add: ask your dev for a SpeakableSpecification JSON-LD block referencing the most important text on key pages.", category: "schema", priority: p++ });

  items.push({ title: "Make sure your business is described the same way everywhere on the web", description: "AI engines build confidence in your business entity when its description (what you do, who you serve, where you operate) matches across your site, social profiles, Wikipedia (if you have a page), Wikidata, and industry databases. Audit your top profiles and unify the descriptions to one canonical version.", category: "authority", priority: p++ });

  items.push({ title: "Build a network of interlinked content covering your topic", description: "AI engines prefer sources that demonstrate deep, structured expertise on a single topic over sources with one or two pages. Plan a topic cluster: one pillar page on the core topic, 5-10 supporting pages on subtopics, all interlinked. Over 6-12 months this becomes the source AI reaches for when summarizing your area.", category: "content", priority: p++ });

  items.push({ title: "Test your visibility across ChatGPT, Perplexity, Claude, Gemini, Copilot", description: "Each AI engine cites differently (Perplexity is web-grounded and shows links; Claude reasons across more context but cites less; ChatGPT's Search is closer to Perplexity's pattern). Test your top 10 buyer queries in each engine, note where you appear and where you don't, and prioritize the 1-2 engines your buyers use most.", category: "authority", priority: p++ });

  items.push({ title: "Set up weekly competitive citation tracking", description: "Citation share moves weekly. A competitor publishing a comprehensive guide can take your spot in ChatGPT's answers within a single training cycle. Track which competitors gain or lose share, and respond before the gap widens. We do this automatically as part of Pulse, Signal, and Amplify; or you can manually run your top 10 queries weekly across the major AI engines and log the citing sources.", category: "technical", priority: p++ });

  return items;
}

// ---------------------------------------------------------------------------
// Main generation function
// ---------------------------------------------------------------------------

export async function autoGenerateRoadmap(
  clientSlug: string,
  scan: ScanResult,
  env: Env
): Promise<void> {
  // Check if roadmap items already exist for this client
  const existing = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM roadmap_items WHERE client_slug = ?"
  ).bind(clientSlug).first<{ count: number }>();

  if (existing && existing.count > 0) {
    console.log(`Roadmap already exists for ${clientSlug}, skipping auto-generate`);
    return;
  }

  await generateFullRoadmap(clientSlug, scan, env);
}

/** Regenerate roadmap from latest scan (admin-triggered, replaces existing) */
export async function regenerateRoadmap(
  clientSlug: string,
  env: Env
): Promise<{ itemCount: number } | null> {
  // Get the latest successful scan for any primary domain
  const domain = await env.DB.prepare(
    "SELECT d.id, d.domain FROM domains d WHERE d.client_slug = ? AND d.is_competitor = 0 AND d.active = 1 ORDER BY d.domain LIMIT 1"
  ).bind(clientSlug).first<{ id: number; domain: string }>();

  if (!domain) return null;

  const scan = await env.DB.prepare(
    "SELECT * FROM scan_results WHERE domain_id = ? AND error IS NULL ORDER BY scanned_at DESC LIMIT 1"
  ).bind(domain.id).first<ScanResult>();

  if (!scan) return null;

  // Delete existing phases and items
  await env.DB.prepare("DELETE FROM roadmap_items WHERE client_slug = ?").bind(clientSlug).run();
  await env.DB.prepare("DELETE FROM roadmap_phases WHERE client_slug = ?").bind(clientSlug).run();

  const count = await generateFullRoadmap(clientSlug, scan, env);
  return { itemCount: count };
}

async function generateFullRoadmap(
  clientSlug: string,
  scan: ScanResult,
  env: Env
): Promise<number> {
  const now = Math.floor(Date.now() / 1000);

  // Parse scan data
  const ctx: ScanContext = {
    schemaTypes: JSON.parse(scan.schema_types || "[]"),
    schemaCoverage: JSON.parse(scan.schema_coverage || "[]"),
    redFlags: JSON.parse(scan.red_flags || "[]"),
    techSignals: JSON.parse(scan.technical_signals || "[]"),
    score: scan.aeo_score,
    domain: scan.url.replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
  };

  const phase1Items = generatePhase1(ctx);
  const phase2Items = generatePhase2(ctx);
  const phase3Items = generatePhase3(ctx);

  // Determine phase statuses based on score
  const phase1Status = "active";
  const phase2Status = ctx.score >= 60 ? "active" : "locked";
  const phase3Status = ctx.score >= 80 ? "active" : "locked";

  // Create phases
  const p1 = await env.DB.prepare(
    `INSERT INTO roadmap_phases (client_slug, phase_number, title, subtitle, description, status, created_at, updated_at)
     VALUES (?, 1, 'Foundation', 'Fix and build the base', 'Critical fixes and essential schema markup. These are the highest-impact items that remove penalties and give AI engines the basics they need to understand your business.', ?, ?, ?)`
  ).bind(clientSlug, phase1Status, now, now).run();
  const phase1Id = Number(p1.meta?.last_row_id ?? 0);

  const p2 = await env.DB.prepare(
    `INSERT INTO roadmap_phases (client_slug, phase_number, title, subtitle, description, status, created_at, updated_at)
     VALUES (?, 2, 'Growth', 'Expand coverage and authority', 'Broader schema coverage, content strategy, and authority signals that move you from visible to credible in AI engine responses.', ?, ?, ?)`
  ).bind(clientSlug, phase2Status, now, now).run();
  const phase2Id = Number(p2.meta?.last_row_id ?? 0);

  const p3 = await env.DB.prepare(
    `INSERT INTO roadmap_phases (client_slug, phase_number, title, subtitle, description, status, created_at, updated_at)
     VALUES (?, 3, 'Dominance', 'Own your category', 'Advanced entity optimization, competitive displacement, and cross-platform AI visibility for market leaders.', ?, ?, ?)`
  ).bind(clientSlug, phase3Status, now, now).run();
  const phase3Id = Number(p3.meta?.last_row_id ?? 0);

  // Batch insert all items
  const stmts: any[] = [];

  for (const item of phase1Items) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO roadmap_items (client_slug, phase_id, title, description, category, status, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
      ).bind(clientSlug, phase1Id, item.title, item.description, item.category, item.priority, now, now)
    );
  }

  for (const item of phase2Items) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO roadmap_items (client_slug, phase_id, title, description, category, status, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
      ).bind(clientSlug, phase2Id, item.title, item.description, item.category, item.priority, now, now)
    );
  }

  for (const item of phase3Items) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO roadmap_items (client_slug, phase_id, title, description, category, status, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
      ).bind(clientSlug, phase3Id, item.title, item.description, item.category, item.priority, now, now)
    );
  }

  if (stmts.length > 0) {
    await env.DB.batch(stmts);
  }

  const totalItems = phase1Items.length + phase2Items.length + phase3Items.length;

  // Create admin alert
  await env.DB.prepare(
    `INSERT INTO admin_alerts (client_slug, type, title, detail, created_at)
     VALUES (?, 'milestone', ?, ?, ?)`
  ).bind(
    clientSlug,
    `Roadmap generated for ${clientSlug}`,
    `${totalItems} items across 3 phases. Foundation: ${phase1Items.length} items, Growth: ${phase2Items.length} items, Dominance: ${phase3Items.length} items. Based on scan score ${scan.aeo_score}/100.`,
    now
  ).run();

  console.log(`Generated roadmap for ${clientSlug}: ${totalItems} items (P1:${phase1Items.length} P2:${phase2Items.length} P3:${phase3Items.length})`);

  return totalItems;
}
