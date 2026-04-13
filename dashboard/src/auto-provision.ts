/**
 * Dashboard -- Auto-provision roadmap for new clients
 *
 * After first scan, generates a Foundation phase with roadmap items
 * based on what the scan found missing. Only runs once per client
 * (skips if roadmap items already exist).
 */

import type { Env, ScanResult } from "./types";

interface RoadmapSeed {
  title: string;
  description: string;
  category: string;
  condition: (ctx: ScanContext) => boolean;
  priority: number; // lower = higher priority = earlier sort_order
}

interface ScanContext {
  schemaTypes: string[];
  schemaCoverage: { type: string; present: boolean }[];
  redFlags: string[];
  technicalSignals: string[];
  score: number;
}

// All possible Foundation items -- only added if the condition is true (meaning the issue exists)
const FOUNDATION_ITEMS: RoadmapSeed[] = [
  {
    title: "Add Organization schema",
    description: "Tells AI engines who you are, what you do, and how to reference your business correctly.",
    category: "schema",
    condition: (ctx) => !ctx.schemaTypes.includes("Organization"),
    priority: 1,
  },
  {
    title: "Add BreadcrumbList schema to all pages",
    description: "Enables rich result breadcrumbs and helps AI engines understand site hierarchy.",
    category: "schema",
    condition: (ctx) => !hasSchema(ctx, "BreadcrumbList"),
    priority: 2,
  },
  {
    title: "Add FAQ schema to key service pages",
    description: "FAQ schema directly feeds AI answer engines with structured Q&A pairs.",
    category: "schema",
    condition: (ctx) => !hasSchema(ctx, "FAQPage"),
    priority: 3,
  },
  {
    title: "Add AggregateRating schema",
    description: "Gives AI engines a social proof hook to cite when recommending your business.",
    category: "schema",
    condition: (ctx) => !hasSchema(ctx, "AggregateRating"),
    priority: 4,
  },
  {
    title: "Add Article or BlogPosting schema to content pages",
    description: "Ensures blog and article content is properly typed for AI engine ingestion.",
    category: "schema",
    condition: (ctx) => !hasSchema(ctx, "Article") && !hasSchema(ctx, "BlogPosting"),
    priority: 5,
  },
  {
    title: "Add LocalBusiness schema",
    description: "Critical for local search and AI recommendations in your service area.",
    category: "schema",
    condition: (ctx) => !hasSchema(ctx, "LocalBusiness") && !ctx.schemaTypes.includes("LocalBusiness"),
    priority: 6,
  },
  {
    title: "Write meta descriptions for pages missing them",
    description: "Meta descriptions are the first thing AI engines read when deciding to cite content.",
    category: "content",
    condition: (ctx) => ctx.redFlags.some(f => f.toLowerCase().includes("meta description")),
    priority: 7,
  },
  {
    title: "Add structured heading hierarchy (H1-H3)",
    description: "Clear heading structure helps AI engines parse and extract key information from your pages.",
    category: "content",
    condition: (ctx) => ctx.redFlags.some(f => f.toLowerCase().includes("heading") || f.toLowerCase().includes("h1")),
    priority: 8,
  },
  {
    title: "Improve internal linking structure",
    description: "Strong internal links help AI engines discover and contextualize all your content.",
    category: "authority",
    condition: (ctx) => ctx.redFlags.some(f => f.toLowerCase().includes("internal link")),
    priority: 9,
  },
  {
    title: "Increase external link count on homepage",
    description: "More authority signals help AI engines rank content higher in citations.",
    category: "authority",
    condition: () => true, // Always relevant
    priority: 10,
  },
  {
    title: "Set up weekly automated AEO monitoring",
    description: "Track score changes over time to catch regressions early.",
    category: "technical",
    condition: () => true, // System handles this -- will be auto-completed on next scan
    priority: 11,
  },
  {
    title: "Create competitor tracking dashboard",
    description: "Monitor AEO gap vs key competitors to maintain advantage.",
    category: "technical",
    condition: () => true, // System handles this -- will be auto-completed on next scan
    priority: 12,
  },
];

function hasSchema(ctx: ScanContext, type: string): boolean {
  const inCoverage = ctx.schemaCoverage.some(c => c.type === type && c.present);
  const inTypes = ctx.schemaTypes.includes(type);
  return inCoverage || inTypes;
}

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

  const now = Math.floor(Date.now() / 1000);

  // Parse scan data
  const ctx: ScanContext = {
    schemaTypes: JSON.parse(scan.schema_types || "[]"),
    schemaCoverage: JSON.parse(scan.schema_coverage || "[]"),
    redFlags: JSON.parse(scan.red_flags || "[]"),
    technicalSignals: JSON.parse(scan.technical_signals || "[]"),
    score: scan.aeo_score,
  };

  // Filter to items that are relevant based on scan results
  const items = FOUNDATION_ITEMS.filter(item => item.condition(ctx));

  if (items.length === 0) {
    console.log(`No roadmap items needed for ${clientSlug} (score: ${scan.aeo_score})`);
    return;
  }

  // Create Phase 1: Foundation
  const phaseResult = await env.DB.prepare(
    `INSERT INTO roadmap_phases (client_slug, phase_number, title, subtitle, description, status, created_at, updated_at)
     VALUES (?, 1, 'Foundation', 'Get the basics right', 'Core technical SEO, essential schema markup, and content fundamentals that AI models need to understand and cite your site.', 'active', ?, ?)`
  ).bind(clientSlug, now, now).run();

  const phaseId = Number(phaseResult.meta?.last_row_id ?? 0);

  // Create Phase 2: Growth (locked, for later)
  await env.DB.prepare(
    `INSERT INTO roadmap_phases (client_slug, phase_number, title, subtitle, description, status, created_at, updated_at)
     VALUES (?, 2, 'Growth', 'Build authority and coverage', 'Expand schema coverage, build content authority, and optimize for AI citation patterns.', 'locked', ?, ?)`
  ).bind(clientSlug, now, now).run();

  // Create Phase 3: Dominance (locked, for later)
  await env.DB.prepare(
    `INSERT INTO roadmap_phases (client_slug, phase_number, title, subtitle, description, status, created_at, updated_at)
     VALUES (?, 3, 'Dominance', 'Own your category', 'Advanced entity optimization, cross-platform AI visibility, and competitive displacement.', 'locked', ?, ?)`
  ).bind(clientSlug, now, now).run();

  // Insert roadmap items into Phase 1
  const stmts = items.map((item, i) =>
    env.DB.prepare(
      `INSERT INTO roadmap_items (client_slug, phase_id, title, description, category, status, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
    ).bind(clientSlug, phaseId, item.title, item.description, item.category, item.priority, now, now)
  );

  await env.DB.batch(stmts);

  // Create admin alert
  await env.DB.prepare(
    `INSERT INTO admin_alerts (client_slug, type, title, detail, created_at)
     VALUES (?, 'milestone', ?, ?, ?)`
  ).bind(
    clientSlug,
    `Roadmap auto-generated for ${clientSlug}`,
    `${items.length} items created in Foundation phase based on initial scan (score: ${scan.aeo_score})`,
    now
  ).run();

  console.log(`Auto-generated roadmap for ${clientSlug}: ${items.length} items in Foundation phase`);
}
