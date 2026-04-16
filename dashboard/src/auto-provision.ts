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
    items.push({ title: "Add missing page titles", description: "Page titles are the most basic metadata. Without them, AI engines have no quick context for the page. Add unique, descriptive titles to every page.", category: "technical", priority: p++ });
  }
  if (flagGroups.missingMeta) {
    items.push({ title: "Write meta descriptions for all pages", description: "Meta descriptions give AI engines a concise summary of each page. Write unique descriptions (120-160 characters) that accurately describe the content.", category: "content", priority: p++ });
  }
  if (flagGroups.missingH1) {
    items.push({ title: "Add proper heading hierarchy", description: "Every page needs exactly one H1 tag, followed by H2s and H3s in logical order. AI engines use heading structure to understand content organization.", category: "content", priority: p++ });
  }
  if (flagGroups.noHttps) {
    items.push({ title: "Enable HTTPS across the entire site", description: "HTTPS is a trust signal for both traditional and AI search engines. Ensure all pages load over HTTPS with a valid certificate.", category: "technical", priority: p++ });
  }
  if (flagGroups.slowPage) {
    items.push({ title: "Improve page load speed", description: "Pages loading slower than 3 seconds get penalized. Optimize images, enable compression, and minimize render-blocking resources.", category: "technical", priority: p++ });
  }
  if (flagGroups.robotsBlocked) {
    items.push({ title: "Unblock AI crawlers in robots.txt", description: "Your robots.txt is blocking AI crawlers (GPTBot, PerplexityBot, ClaudeBot). Update it to allow these bots to read your content.", category: "technical", priority: p++ });
  }
  if (flagGroups.brokenSchema) {
    items.push({ title: "Fix broken or invalid schema markup", description: "Schema with errors sends conflicting signals to AI engines. Validate all existing schema using Google's Rich Results Test and fix any errors.", category: "schema", priority: p++ });
  }

  // Missing critical schema types
  if (!hasSchema(ctx, "Organization") && !hasSchema(ctx, "LocalBusiness")) {
    items.push({ title: "Add Organization or LocalBusiness schema", description: "This is the foundation schema. It tells AI engines who you are, where you are, and what you do. Every business site needs this. Use LocalBusiness for physical locations, Organization for others.", category: "schema", priority: p++ });
  }
  if (!hasSchema(ctx, "WebSite")) {
    items.push({ title: "Add WebSite schema with search action", description: "WebSite schema identifies your site to AI engines and can include a sitelinks search box. Add it to your homepage.", category: "schema", priority: p++ });
  }
  if (!hasSchema(ctx, "BreadcrumbList")) {
    items.push({ title: "Add BreadcrumbList schema", description: "Breadcrumb schema helps AI engines understand your site hierarchy and how pages relate to each other. Add to all pages except the homepage.", category: "schema", priority: p++ });
  }

  // Technical signal fixes
  for (const sig of ctx.techSignals) {
    if (sig.status === "bad" || sig.status === "error") {
      if (sig.label.toLowerCase().includes("og") || sig.label.toLowerCase().includes("open graph")) {
        items.push({ title: "Add Open Graph meta tags", description: "Open Graph tags help AI engines understand your content when it appears in social and aggregation contexts. Add og:title, og:description, og:image to all pages.", category: "technical", priority: p++ });
      } else if (sig.label.toLowerCase().includes("canonical")) {
        items.push({ title: "Set canonical URLs on all pages", description: "Canonical tags prevent duplicate content confusion. Every page should have a self-referencing canonical URL.", category: "technical", priority: p++ });
      }
    }
  }

  // Remaining red flags not covered by specific items above
  const coveredPatterns = ["title", "meta description", "heading", "h1", "https", "speed", "slow", "robots", "schema", "invalid", "broken"];
  const uncoveredFlags = ctx.redFlags.filter(f => {
    const lower = f.toLowerCase();
    return !coveredPatterns.some(p => lower.includes(p));
  });
  for (const flag of uncoveredFlags.slice(0, 3)) {
    items.push({ title: "Fix: " + flag, description: "This issue was detected during your AEO scan and is reducing your score. Address it to remove the penalty.", category: "technical", priority: p++ });
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
    items.push({ title: "Create FAQ schema on key service pages", description: "FAQ schema gives AI engines pre-structured Q&A pairs they can cite directly. Write 5-10 real customer questions per major service page.", category: "schema", priority: p++ });
  }
  if (!hasSchema(ctx, "Article") && !hasSchema(ctx, "BlogPosting")) {
    items.push({ title: "Add Article schema to blog and content pages", description: "Article schema marks content as authored, dated, and attributed. This helps AI engines assess freshness and credibility.", category: "schema", priority: p++ });
  }
  if (!hasSchema(ctx, "Product") && !hasSchema(ctx, "Service")) {
    items.push({ title: "Add Product or Service schema", description: "Describe your offerings in machine-readable format. Include pricing, availability, and descriptions so AI engines can recommend them accurately.", category: "schema", priority: p++ });
  }
  if (!hasSchema(ctx, "AggregateRating") && !hasSchema(ctx, "Review")) {
    items.push({ title: "Add review and rating schema", description: "AggregateRating and Review schema give AI engines social proof signals. If you have customer reviews, mark them up.", category: "schema", priority: p++ });
  }

  // Content strategy items
  items.push({ title: "Write an authoritative FAQ page answering top industry questions", description: "Go beyond basic FAQs. Answer the 15-20 questions people actually ask AI engines about your industry. Use clear, factual language. This becomes a citation magnet.", category: "content", priority: p++ });

  items.push({ title: "Publish a definitive guide in your primary topic area", description: "Create a 2,000+ word guide that thoroughly covers your core expertise. AI engines prefer comprehensive, authoritative sources when generating answers.", category: "content", priority: p++ });

  if (ctx.score < 60) {
    items.push({ title: "Audit and rewrite thin content pages", description: "Pages with less than 300 words of meaningful content are unlikely to be cited by AI engines. Identify thin pages and either expand them or consolidate.", category: "content", priority: p++ });
  }

  // Authority building
  items.push({ title: "Claim and optimize Google Business Profile", description: "Your Google Business Profile feeds into AI engines' understanding of your business. Ensure it is complete, accurate, and has recent reviews.", category: "authority", priority: p++ });

  items.push({ title: "Ensure consistent NAP across all directories", description: "Name, Address, Phone number consistency across the web is how AI models build entity confidence. Audit and fix inconsistencies.", category: "authority", priority: p++ });

  items.push({ title: "Build citations on industry-specific directories", description: "Get listed on the top 10 directories in your industry. Each listing reinforces your entity in AI training data.", category: "authority", priority: p++ });

  return items;
}

// ---------------------------------------------------------------------------
// Phase 3: Dominance — advanced optimization
// ---------------------------------------------------------------------------

function generatePhase3(ctx: ScanContext): RoadmapSeed[] {
  const items: RoadmapSeed[] = [];
  let p = 1;

  items.push({ title: "Implement entity-first content architecture", description: "Restructure content around entities (people, places, things, concepts) rather than keywords. Link related entities with schema sameAs and about properties.", category: "content", priority: p++ });

  items.push({ title: "Create comparison and vs content for AI citation queries", description: "AI engines frequently answer comparison queries ('X vs Y', 'best X for Y'). Create definitive comparison content that positions your business.", category: "content", priority: p++ });

  items.push({ title: "Add HowTo schema to instructional content", description: "HowTo schema structures step-by-step content in a format AI engines can cite step-by-step. Add to any tutorial or process content.", category: "schema", priority: p++ });

  items.push({ title: "Add speakable schema to key pages", description: "Speakable schema tells voice assistants which sections of your content are best suited for audio playback. Target your most-cited content.", category: "schema", priority: p++ });

  items.push({ title: "Implement cross-platform entity consistency", description: "Ensure your business entity is described identically across your website, social profiles, Wikipedia (if applicable), Wikidata, and industry databases.", category: "authority", priority: p++ });

  items.push({ title: "Build topical authority cluster content", description: "Create a network of interlinked content pieces that comprehensively cover your topic area. AI engines prefer sources that demonstrate deep topical expertise.", category: "content", priority: p++ });

  items.push({ title: "Optimize for multi-engine AI visibility", description: "Test your content across ChatGPT, Perplexity, Claude, and Gemini. Each engine has different citation patterns. Optimize for the engines most relevant to your audience.", category: "authority", priority: p++ });

  items.push({ title: "Set up ongoing competitive citation monitoring", description: "Track which competitors gain or lose citation share weekly. Identify when a competitor makes a move so you can respond before the gap widens.", category: "technical", priority: p++ });

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
