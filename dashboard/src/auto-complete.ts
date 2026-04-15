/**
 * Dashboard -- Auto-complete roadmap items based on scan results
 *
 * After each scan, checks pending/in-progress roadmap items to see if
 * the underlying issue has been resolved. If so, marks the item as done.
 *
 * This makes the roadmap self-maintaining: client fixes something,
 * the next scan detects it, the item auto-completes.
 */

import type { Env, ScanResult, RoadmapItem } from "./types";
import { checkPhaseCompletion } from "./routes/roadmap";

interface ScanContext {
  schemaTypes: string[];
  schemaCoverage: { type: string; present: boolean }[];
  redFlags: string[];
  techSignals: { label: string; value: string; status: string }[];
  score: number;
}

/** Check all pending roadmap items for a client and auto-complete any that the scan shows are resolved */
export async function autoCompleteRoadmapItems(
  clientSlug: string,
  scan: ScanResult,
  env: Env
): Promise<number> {
  // Get all non-complete roadmap items
  const items = (await env.DB.prepare(
    "SELECT * FROM roadmap_items WHERE client_slug = ? AND status != 'done'"
  ).bind(clientSlug).all<RoadmapItem>()).results;

  if (items.length === 0) return 0;

  const ctx: ScanContext = {
    schemaTypes: JSON.parse(scan.schema_types || "[]"),
    schemaCoverage: JSON.parse(scan.schema_coverage || "[]"),
    redFlags: JSON.parse(scan.red_flags || "[]"),
    techSignals: JSON.parse(scan.technical_signals || "[]"),
    score: scan.aeo_score,
  };

  const now = Math.floor(Date.now() / 1000);
  const completed: RoadmapItem[] = [];

  for (const item of items) {
    if (shouldAutoComplete(item, ctx)) {
      completed.push(item);
    }
  }

  if (completed.length === 0) return 0;

  // Batch update all completed items
  const stmts = completed.map(item =>
    env.DB.prepare(
      "UPDATE roadmap_items SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?"
    ).bind(now, now, item.id)
  );

  await env.DB.batch(stmts);

  // Create an alert for auto-completions
  const titles = completed.map(i => i.title).join(", ");
  await env.DB.prepare(
    "INSERT INTO admin_alerts (client_slug, type, title, detail, created_at) VALUES (?, 'auto_completed', ?, ?, ?)"
  ).bind(
    clientSlug,
    `${completed.length} roadmap item${completed.length > 1 ? 's' : ''} auto-completed`,
    titles,
    now
  ).run();

  console.log(`Auto-completed ${completed.length} roadmap items for ${clientSlug}: ${titles}`);

  // Check if this completes any phases (triggers phase unlock)
  await checkPhaseCompletion(clientSlug, env);

  return completed.length;
}

function hasSchema(ctx: ScanContext, type: string): boolean {
  return ctx.schemaCoverage.some(c => c.type === type && c.present) || ctx.schemaTypes.includes(type);
}

function shouldAutoComplete(item: RoadmapItem, ctx: ScanContext): boolean {
  const title = item.title.toLowerCase();
  const category = item.category;

  // --- Schema items: check if the schema type is now present ---

  if (category === "schema" || title.includes("schema")) {
    if (title.includes("organization") && (hasSchema(ctx, "Organization") || hasSchema(ctx, "LocalBusiness"))) return true;
    if (title.includes("localbusiness") && hasSchema(ctx, "LocalBusiness")) return true;
    if (title.includes("breadcrumb") && hasSchema(ctx, "BreadcrumbList")) return true;
    if (title.includes("faq") && hasSchema(ctx, "FAQPage")) return true;
    if (title.includes("aggregaterating") || title.includes("rating")) {
      if (hasSchema(ctx, "AggregateRating")) return true;
    }
    if (title.includes("review") && !title.includes("needs review")) {
      if (hasSchema(ctx, "Review") || hasSchema(ctx, "AggregateRating")) return true;
    }
    if (title.includes("article") || title.includes("blogposting")) {
      if (hasSchema(ctx, "Article") || hasSchema(ctx, "BlogPosting")) return true;
    }
    if (title.includes("product") && hasSchema(ctx, "Product")) return true;
    if (title.includes("service") && !title.includes("customer service")) {
      if (hasSchema(ctx, "Service")) return true;
    }
    if (title.includes("website") && hasSchema(ctx, "WebSite")) return true;
    if (title.includes("howto") && hasSchema(ctx, "HowTo")) return true;
    if (title.includes("speakable") && hasSchema(ctx, "SpeakableSpecification")) return true;
  }

  // --- Technical items: check if the issue is resolved ---

  if (title.includes("meta description")) {
    if (!ctx.redFlags.some(f => f.toLowerCase().includes("meta description"))) return true;
  }
  if (title.includes("heading") || title.includes("h1")) {
    if (!ctx.redFlags.some(f => f.toLowerCase().includes("heading") || f.toLowerCase().includes("h1"))) return true;
  }
  if (title.includes("https") || title.includes("ssl")) {
    if (!ctx.redFlags.some(f => f.toLowerCase().includes("https") || f.toLowerCase().includes("ssl"))) return true;
  }
  if (title.includes("page") && (title.includes("speed") || title.includes("load"))) {
    if (!ctx.redFlags.some(f => f.toLowerCase().includes("speed") || f.toLowerCase().includes("slow"))) return true;
  }
  if (title.includes("robots") || title.includes("crawl")) {
    if (!ctx.redFlags.some(f => f.toLowerCase().includes("robots") || f.toLowerCase().includes("blocked") || f.toLowerCase().includes("crawl"))) return true;
  }
  if (title.includes("open graph") || title.includes("og tag")) {
    const ogSignal = ctx.techSignals.find(s => s.label.toLowerCase().includes("og") || s.label.toLowerCase().includes("open graph"));
    if (ogSignal && ogSignal.status === "good") return true;
  }
  if (title.includes("canonical")) {
    const canSignal = ctx.techSignals.find(s => s.label.toLowerCase().includes("canonical"));
    if (canSignal && canSignal.status === "good") return true;
  }

  // --- "Fix:" prefixed items: check if the original red flag text is gone ---
  if (title.startsWith("fix: ")) {
    const flagText = item.title.substring(5).toLowerCase();
    if (!ctx.redFlags.some(f => f.toLowerCase().includes(flagText))) return true;
  }

  // --- System items that are always true once the system is running ---
  if (title.includes("weekly automated aeo monitoring") || title.includes("set up weekly")) return true;
  if (title.includes("competitor tracking dashboard") || title.includes("create competitor")) return true;

  return false;
}
