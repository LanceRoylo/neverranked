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
  markedDone: number;
  markedInProgress: number;
  byClient: Record<string, { done: number; in_progress: number }>;
}

/** Reconcile roadmap_items against schema_injections for one client.
 *  Two passes:
 *    - approved schemas mark matching items as 'done'
 *    - pending schemas mark matching items as 'in_progress' (so the
 *      customer dashboard's "actively in progress" metric reflects
 *      real work-in-flight, not zero)
 *  Returns counts of each transition. */
export async function reconcileRoadmapForClient(
  clientSlug: string,
  env: Env,
): Promise<{ markedDone: number; markedInProgress: number }> {
  const items = (await env.DB.prepare(
    "SELECT id, client_slug, title, category, status FROM roadmap_items " +
    "WHERE client_slug = ? AND status != 'done' AND category = 'schema'"
  ).bind(clientSlug).all<ItemRow>()).results;
  if (items.length === 0) return { markedDone: 0, markedInProgress: 0 };

  // Pull both approved AND pending schema_injections. Approved
  // contributes to "done" matching, pending contributes to
  // "in_progress" matching.
  const rows = (await env.DB.prepare(
    "SELECT schema_type, json_ld, status FROM schema_injections " +
    "WHERE client_slug = ? AND status IN ('approved','pending')"
  ).bind(clientSlug).all<{ schema_type: string; json_ld: string; status: string }>()).results;

  const approvedTypes = new Set<string>();
  const pendingTypes = new Set<string>();
  for (const r of rows) {
    const target = r.status === "approved" ? approvedTypes : pendingTypes;
    target.add(r.schema_type);
    try {
      collectTypes(JSON.parse(r.json_ld), target);
    } catch { /* skip malformed json_ld */ }
  }

  if (approvedTypes.size === 0 && pendingTypes.size === 0) {
    return { markedDone: 0, markedInProgress: 0 };
  }

  const now = Math.floor(Date.now() / 1000);
  let markedDone = 0;
  let markedInProgress = 0;
  for (const item of items) {
    const mapping = TITLE_TO_TYPES.find((m) => m.titleIncludes.test(item.title));
    if (!mapping) continue;
    const satisfiedByApproved = mapping.types.some((t) => approvedTypes.has(t));
    if (satisfiedByApproved) {
      await env.DB.prepare(
        "UPDATE roadmap_items SET status = 'done', completed_at = ?, " +
        "completed_by = 'reconciler', updated_at = ? WHERE id = ?"
      ).bind(now, now, item.id).run();
      markedDone++;
      continue;
    }
    // No approved match. If there's a pending one, surface as
    // in_progress so the customer's "actively in progress" tile
    // reflects the draft-awaiting-review work. Only flip if the
    // current status is not already in_progress (avoid churning
    // updated_at for no reason).
    const satisfiedByPending = mapping.types.some((t) => pendingTypes.has(t));
    if (satisfiedByPending && item.status !== "in_progress") {
      await env.DB.prepare(
        "UPDATE roadmap_items SET status = 'in_progress', updated_at = ? WHERE id = ?"
      ).bind(now, item.id).run();
      markedInProgress++;
    }
  }
  return { markedDone, markedInProgress };
}

/** Run the reconciler against every client that has at least one
 *  approved schema_injection. Used from runDailyTasks. */
export async function reconcileAllRoadmaps(env: Env): Promise<ReconcileResult> {
  const slugs = (await env.DB.prepare(
    "SELECT DISTINCT client_slug FROM schema_injections WHERE status = 'approved'"
  ).all<{ client_slug: string }>()).results.map((r) => r.client_slug);

  const result: ReconcileResult = {
    scanned: slugs.length,
    markedDone: 0,
    markedInProgress: 0,
    byClient: {},
  };
  for (const slug of slugs) {
    try {
      const r = await reconcileRoadmapForClient(slug, env);
      if (r.markedDone > 0 || r.markedInProgress > 0) {
        result.byClient[slug] = { done: r.markedDone, in_progress: r.markedInProgress };
      }
      result.markedDone += r.markedDone;
      result.markedInProgress += r.markedInProgress;
    } catch (e) {
      console.log(`[reconciler] ${slug} failed: ${e}`);
    }
  }
  return result;
}
