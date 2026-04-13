/**
 * Dashboard -- Auto-roadmap verification
 *
 * After each scan, checks roadmap items against scan results.
 * Auto-completes items when evidence is found, creates admin alerts
 * for items that need manual review, and tracks score milestones.
 */

import type { Env, ScanResult, Domain, RoadmapItem } from "./types";

// ---------- Schema mapping ----------

// Maps schema type names (from scan) to keywords in roadmap item titles
const SCHEMA_MATCHERS: { schemaType: string; titleKeywords: string[] }[] = [
  { schemaType: "BreadcrumbList", titleKeywords: ["breadcrumblist", "breadcrumb"] },
  { schemaType: "AggregateRating", titleKeywords: ["aggregaterating", "aggregate rating", "rating schema"] },
  { schemaType: "Article", titleKeywords: ["article schema"] },
  { schemaType: "BlogPosting", titleKeywords: ["article schema", "blog schema", "blogposting"] },
  { schemaType: "FAQPage", titleKeywords: ["faq schema", "faqpage"] },
  { schemaType: "HowTo", titleKeywords: ["howto schema", "how-to schema"] },
  { schemaType: "LocalBusiness", titleKeywords: ["localbusiness", "local business schema"] },
  { schemaType: "Product", titleKeywords: ["product schema"] },
  { schemaType: "Review", titleKeywords: ["review schema"] },
  { schemaType: "VideoObject", titleKeywords: ["video schema", "videoobject"] },
  { schemaType: "Event", titleKeywords: ["event schema"] },
];

// Roadmap items that are system-level (always true if the dashboard is running)
const SYSTEM_ITEMS: { titleKeywords: string[]; reason: string }[] = [
  { titleKeywords: ["automated aeo monitoring", "weekly automated", "weekly monitoring"], reason: "Weekly cron scans are active" },
  { titleKeywords: ["competitor tracking", "competitor dashboard", "competitor benchmarking"], reason: "Competitor tracking dashboard is live" },
];

// Items that can never be auto-verified -- always flag for manual review
const MANUAL_REVIEW_KEYWORDS: string[] = [
  "external link",
  "backlink",
  "content strategy",
  "link building",
  "outreach",
];

// ---------- Main function ----------

export async function autoVerifyRoadmap(
  domain: Domain,
  scan: ScanResult,
  env: Env
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  // Get open roadmap items for this client
  const items = (await env.DB.prepare(
    "SELECT * FROM roadmap_items WHERE client_slug = ? AND status NOT IN ('done', 'complete')"
  ).bind(domain.client_slug).all<RoadmapItem>()).results;

  if (items.length === 0) return;

  // Parse scan data
  const schemaTypes: string[] = JSON.parse(scan.schema_types || "[]");
  const schemaCoverage: { type: string; present: boolean }[] = JSON.parse(scan.schema_coverage || "[]");
  const signalsJson = JSON.parse(scan.signals_json || "{}");
  const redFlags: string[] = JSON.parse(scan.red_flags || "[]");

  for (const item of items) {
    const titleLower = item.title.toLowerCase();

    // 1. Check system items first
    const systemMatch = SYSTEM_ITEMS.find(s =>
      s.titleKeywords.some(k => titleLower.includes(k))
    );
    if (systemMatch) {
      await completeItem(item, systemMatch.reason, domain.client_slug, now, env);
      continue;
    }

    // 2. Check if this is a manual-review-only item
    const isManualOnly = MANUAL_REVIEW_KEYWORDS.some(k => titleLower.includes(k));
    if (isManualOnly) {
      // Only flag once -- check if we already have an alert for this item
      const existing = await env.DB.prepare(
        "SELECT id FROM admin_alerts WHERE roadmap_item_id = ? AND type = 'needs_review'"
      ).bind(item.id).first();
      if (!existing) {
        await createAlert(domain.client_slug, "needs_review", item.title,
          "Cannot auto-verify. Check manually.", item.id, now, env);
      }
      continue;
    }

    // 3. Check schema matchers
    const schemaMatch = SCHEMA_MATCHERS.find(m =>
      m.titleKeywords.some(k => titleLower.includes(k))
    );
    if (schemaMatch) {
      // Check if schema is present in coverage (more reliable than just schema_types)
      const coverageEntry = schemaCoverage.find(c => c.type === schemaMatch.schemaType);
      const inSchemaTypes = schemaTypes.includes(schemaMatch.schemaType);

      if ((coverageEntry && coverageEntry.present) || inSchemaTypes) {
        await completeItem(item, `${schemaMatch.schemaType} detected in scan`, domain.client_slug, now, env);
      }
      continue;
    }

    // 4. Check content-related items
    if (titleLower.includes("meta description")) {
      // Check if "missing meta description" is NOT in red flags
      const missingMeta = redFlags.some(f =>
        f.toLowerCase().includes("meta description") && f.toLowerCase().includes("missing")
      );
      if (!missingMeta) {
        await completeItem(item, "Meta descriptions detected on scanned pages", domain.client_slug, now, env);
      }
    }
  }

  // 5. Score milestone alerts
  await checkScoreMilestones(domain, scan, env, now);
}

// ---------- Helpers ----------

async function completeItem(
  item: RoadmapItem,
  reason: string,
  clientSlug: string,
  now: number,
  env: Env
): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE roadmap_items SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?"
    ).bind(now, now, item.id),
    env.DB.prepare(
      `INSERT INTO admin_alerts (client_slug, type, title, detail, roadmap_item_id, created_at)
       VALUES (?, 'auto_completed', ?, ?, ?, ?)`
    ).bind(clientSlug, item.title, reason, item.id, now),
  ]);

  console.log(`Auto-completed: "${item.title}" for ${clientSlug} (${reason})`);
}

async function createAlert(
  clientSlug: string,
  type: string,
  title: string,
  detail: string,
  roadmapItemId: number | null,
  now: number,
  env: Env
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO admin_alerts (client_slug, type, title, detail, roadmap_item_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(clientSlug, type, title, detail, roadmapItemId, now).run();
}

async function checkScoreMilestones(
  domain: Domain,
  scan: ScanResult,
  env: Env,
  now: number
): Promise<void> {
  // Get previous scan to compare
  const previous = await env.DB.prepare(
    `SELECT aeo_score, grade FROM scan_results
     WHERE domain_id = ? AND id != ? AND error IS NULL
     ORDER BY scanned_at DESC LIMIT 1`
  ).bind(domain.id, scan.id).first<{ aeo_score: number; grade: string }>();

  if (!previous) return;

  const diff = scan.aeo_score - previous.aeo_score;

  // Score milestones: crossed a 10-point boundary upward
  const prevDecile = Math.floor(previous.aeo_score / 10);
  const currDecile = Math.floor(scan.aeo_score / 10);
  if (currDecile > prevDecile && diff > 0) {
    await createAlert(
      domain.client_slug,
      "milestone",
      `${domain.domain} hit ${currDecile * 10}+`,
      `Score rose from ${previous.aeo_score} to ${scan.aeo_score} (+${diff})`,
      null, now, env
    );
  }

  // Grade change
  if (scan.grade !== previous.grade) {
    const improved = scan.aeo_score > previous.aeo_score;
    await createAlert(
      domain.client_slug,
      improved ? "milestone" : "regression",
      `${domain.domain} grade ${improved ? "upgraded" : "dropped"}: ${previous.grade} to ${scan.grade}`,
      `Score: ${previous.aeo_score} to ${scan.aeo_score} (${diff > 0 ? "+" : ""}${diff})`,
      null, now, env
    );
  }

  // Significant score change (5+ points) without grade change
  if (Math.abs(diff) >= 5 && scan.grade === previous.grade) {
    await createAlert(
      domain.client_slug,
      diff > 0 ? "score_change" : "regression",
      `${domain.domain} ${diff > 0 ? "up" : "down"} ${Math.abs(diff)} points`,
      `Score: ${previous.aeo_score} to ${scan.aeo_score}`,
      null, now, env
    );
  }
}
