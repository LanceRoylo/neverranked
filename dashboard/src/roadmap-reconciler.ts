/**
 * Roadmap reconciler: marks roadmap_items done when the work they
 * describe is already shipped.
 *
 * Why this exists: schema deploys land directly in
 * `schema_injections` (the truth source for what's actually being
 * served to visitors), while the customer-facing roadmap reads from
 * `roadmap_items` (the checklist generated from scan findings). The
 * scanner does a pure HTTP fetch and never sees client-side-injected
 * schemas, so without this reconciler the roadmap shows an item like
 * "Add WebSite schema" forever even after we've deployed it.
 *
 * The reconciler closes that gap by mapping roadmap_items.title (free
 * text from the auto-generator) to a set of schema_types that satisfy
 * the item, then marking the item done if any of those types is in
 * approved schema_injections for the same client.
 *
 * Conservative on purpose: only touches items where category='schema'
 * AND the title matches a known mapping. Everything else (content,
 * technical, authority items) stays untouched -- those need real
 * verification, not just a row in schema_injections.
 *
 * Idempotent. Doesn't un-do completion (so a customer who manually
 * checks something off won't have it un-checked). Logs how many it
 * marked per run.
 */
import type { Env } from "./types";

interface ItemRow {
  id: number;
  client_slug: string;
  title: string;
  category: string;
  status: string;
}

/** Schema-category roadmap items, mapped to the schema_types that
 *  satisfy them. Order matters only for stable iteration. */
const TITLE_TO_TYPES: Array<{ titleIncludes: RegExp; types: string[] }> = [
  // Foundation schemas
  { titleIncludes: /add\s+website\s+schema/i,
    types: ["WebSite"] },
  { titleIncludes: /add\s+(organization|localbusiness)\s+schema|organization\s+or\s+localbusiness/i,
    types: [
      "Organization", "LocalBusiness", "Corporation", "NGO",
      // LocalBusiness subtypes we plausibly deploy
      "Restaurant", "PerformingArtsTheater", "MovieTheater",
      "LodgingBusiness", "Hotel", "Store", "MedicalBusiness",
    ] },
  { titleIncludes: /add\s+breadcrumblist\s+schema/i,
    types: ["BreadcrumbList"] },
  { titleIncludes: /review\s+and\s+rating\s+schema|aggregaterating/i,
    types: ["AggregateRating"] },
  // Phase 2+ schemas
  { titleIncludes: /faq\s+schema/i,
    types: ["FAQPage"] },
  { titleIncludes: /article\s+schema/i,
    types: ["Article", "BlogPosting", "NewsArticle"] },
  { titleIncludes: /(product|service)\s+schema/i,
    types: ["Product", "Service"] },
  { titleIncludes: /howto\s+schema/i,
    types: ["HowTo"] },
  { titleIncludes: /speakable\s+schema/i,
    types: ["SpeakableSpecification"] },
  { titleIncludes: /event\s+schema/i,
    types: ["Event"] },
];

/** Walk a JSON-LD object and collect every @type value (string or
 *  array) into the given set. Recurses into nested objects and arrays
 *  so nested schemas like AggregateRating embedded in a parent
 *  organization schema get counted. */
function collectTypes(node: unknown, into: Set<string>): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) collectTypes(child, into);
    return;
  }
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  if (typeof t === "string") into.add(t);
  else if (Array.isArray(t)) for (const v of t) if (typeof v === "string") into.add(v);
  for (const k of Object.keys(obj)) {
    if (k === "@type" || k === "@context" || k === "@id") continue;
    collectTypes(obj[k], into);
  }
}

export interface ReconcileResult {
  scanned: number;
  marked: number;
  byClient: Record<string, number>;
}

/** Reconcile roadmap_items against schema_injections for one client.
 *  Returns the count marked done in this run. */
export async function reconcileRoadmapForClient(
  clientSlug: string,
  env: Env,
): Promise<number> {
  const items = (await env.DB.prepare(
    "SELECT id, client_slug, title, category, status FROM roadmap_items " +
    "WHERE client_slug = ? AND status != 'done' AND category = 'schema'"
  ).bind(clientSlug).all<ItemRow>()).results;
  if (items.length === 0) return 0;

  // Pull every approved schema_injection and extract ALL @type
  // values, including nested ones (e.g. AggregateRating embedded
  // inside a PerformingArtsTheater schema). Without this, the
  // reconciler would miss schemas that aren't deployed as their own
  // top-level row.
  const rows = (await env.DB.prepare(
    "SELECT schema_type, json_ld FROM schema_injections " +
    "WHERE client_slug = ? AND status = 'approved'"
  ).bind(clientSlug).all<{ schema_type: string; json_ld: string }>()).results;
  const typeSet = new Set<string>();
  for (const r of rows) {
    typeSet.add(r.schema_type);
    try {
      collectTypes(JSON.parse(r.json_ld), typeSet);
    } catch { /* skip malformed json_ld */ }
  }
  if (typeSet.size === 0) return 0;

  const now = Math.floor(Date.now() / 1000);
  let marked = 0;
  for (const item of items) {
    const mapping = TITLE_TO_TYPES.find((m) => m.titleIncludes.test(item.title));
    if (!mapping) continue;
    const satisfied = mapping.types.some((t) => typeSet.has(t));
    if (!satisfied) continue;
    await env.DB.prepare(
      "UPDATE roadmap_items SET status = 'done', completed_at = ?, " +
      "completed_by = 'reconciler', updated_at = ? WHERE id = ?"
    ).bind(now, now, item.id).run();
    marked++;
  }
  return marked;
}

/** Run the reconciler against every client that has at least one
 *  approved schema_injection. Used from runDailyTasks. */
export async function reconcileAllRoadmaps(env: Env): Promise<ReconcileResult> {
  const slugs = (await env.DB.prepare(
    "SELECT DISTINCT client_slug FROM schema_injections WHERE status = 'approved'"
  ).all<{ client_slug: string }>()).results.map((r) => r.client_slug);

  const result: ReconcileResult = { scanned: slugs.length, marked: 0, byClient: {} };
  for (const slug of slugs) {
    try {
      const n = await reconcileRoadmapForClient(slug, env);
      if (n > 0) result.byClient[slug] = n;
      result.marked += n;
    } catch (e) {
      console.log(`[reconciler] ${slug} failed: ${e}`);
    }
  }
  return result;
}
