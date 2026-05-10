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

/** Authority-category items that don't apply to SaaS / no-physical-
 *  location clients. The auto-generator drops these in for every
 *  client because it doesn't yet branch on business type, and they
 *  stall forever for SaaS clients (no Google Business Profile, no
 *  NAP across local directories). Flagged here so the enhanced
 *  reconciler can auto-defer them with a "not-applicable" completion
 *  marker for SaaS-detected clients. */
const AUTHORITY_NOT_APPLICABLE_TO_SAAS: RegExp[] = [
  /google\s+business\s+profile/i,
  /nap\s+across\s+(all\s+)?directories/i,
  /citations\s+on\s+(industry-specific\s+)?directories/i,
  /local\s+business\s+citation/i,
];

/** Content-category items that the reconciler can resolve by HTTP-probing
 *  the live domain for the corresponding artifact. Each entry maps a
 *  title regex to the path patterns we'll probe. If any path returns
 *  200, the item is marked done. */
const CONTENT_TITLE_TO_PATHS: Array<{ titleIncludes: RegExp; paths: string[] }> = [
  { titleIncludes: /authoritative\s+faq\s+page|faq\s+page\s+answering/i,
    paths: ["/faq", "/faqs", "/frequently-asked-questions", "/help/faq", "/support/faq"] },
  { titleIncludes: /definitive\s+guide|comprehensive\s+guide/i,
    paths: ["/guide", "/guides", "/resources", "/docs", "/learn", "/tutorial", "/tutorials"] },
  { titleIncludes: /case\s+stud(y|ies)/i,
    paths: ["/case-studies", "/customers", "/case-study"] },
  { titleIncludes: /pillar\s+page|cornerstone\s+content/i,
    paths: ["/", "/blog", "/resources"] },
];

/** Detect whether a client is SaaS / no-physical-location. We use
 *  business_address as the proxy: any meaningful address means local
 *  business; null/empty means SaaS. Conservative -- if the field
 *  isn't filled in at all, we assume SaaS (better to defer authority
 *  items than nag forever). */
async function detectIsSaaS(env: Env, clientSlug: string): Promise<boolean> {
  const config = await env.DB.prepare(
    "SELECT business_address FROM injection_configs WHERE client_slug = ?"
  ).bind(clientSlug).first<{ business_address: string | null }>();
  const addr = (config?.business_address || "").trim();
  return addr.length === 0;
}

/** HTTP-probe each candidate path on the client's primary domain.
 *  Returns the set of paths that returned a 200. We use HEAD with a
 *  3s timeout per probe. Failures (404, timeout, DNS) just don't add
 *  the path to the set -- we don't throw. The caller decides what
 *  to do with the result. */
async function detectContentArtifacts(
  env: Env,
  clientSlug: string,
  paths: string[],
): Promise<Set<string>> {
  const domain = await env.DB.prepare(
    "SELECT domain FROM domains WHERE client_slug = ? AND is_competitor = 0 AND active = 1 LIMIT 1"
  ).bind(clientSlug).first<{ domain: string }>();
  if (!domain?.domain) return new Set();

  const found = new Set<string>();
  // Sequential probes (parallelizing 5+ HEAD requests is fine but
  // adds complexity; sequential keeps the per-step subrequest count
  // small and predictable).
  for (const path of paths) {
    try {
      const url = `https://${domain.domain}${path}`;
      const res = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) found.add(path);
    } catch { /* probe failure -- skip */ }
  }
  return found;
}

/** Reconcile roadmap_items against schema_injections for one client.
 *  Three passes:
 *    - approved schemas mark matching schema items as 'done'
 *    - pending schemas mark matching schema items as 'in_progress'
 *    - authority items not applicable to SaaS clients → 'done' with
 *      completed_by='reconciler-not-applicable'
 *    - content items where the corresponding artifact path returns
 *      200 on the client's domain → 'done'
 *  Returns counts of each transition. */
export async function reconcileRoadmapForClient(
  clientSlug: string,
  env: Env,
): Promise<{ markedDone: number; markedInProgress: number }> {
  const items = (await env.DB.prepare(
    "SELECT id, client_slug, title, category, status FROM roadmap_items " +
    "WHERE client_slug = ? AND status != 'done' AND category IN ('schema','content','authority')"
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

  // Pre-2026-05-10 we early-returned here when the client had no
  // schema_injections, but that meant SaaS clients (which often have
  // zero injections on their own marketing site) never reached the
  // authority + content reconciliation logic added below. Now we
  // continue regardless -- the schema-category branch will harmlessly
  // no-op when both sets are empty.
  const now = Math.floor(Date.now() / 1000);
  let markedDone = 0;
  let markedInProgress = 0;

  // Lazy-evaluate SaaS detection and content probes -- only run them
  // if we actually have an item that needs them. Avoids unnecessary
  // DB queries and outbound HTTP probes for clients whose stalls are
  // all schema-category.
  let isSaaS: boolean | null = null;
  const probedPaths = new Map<string, Set<string>>(); // titleRegex.source -> found paths

  for (const item of items) {
    // --- Schema category: existing schema_injection matching ---
    if (item.category === "schema") {
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
      const satisfiedByPending = mapping.types.some((t) => pendingTypes.has(t));
      if (satisfiedByPending && item.status !== "in_progress") {
        await env.DB.prepare(
          "UPDATE roadmap_items SET status = 'in_progress', updated_at = ? WHERE id = ?"
        ).bind(now, item.id).run();
        markedInProgress++;
      }
      continue;
    }

    // --- Authority category: not-applicable for SaaS clients ---
    if (item.category === "authority") {
      const matchesNotApplicable = AUTHORITY_NOT_APPLICABLE_TO_SAAS.some(
        (re) => re.test(item.title)
      );
      if (!matchesNotApplicable) continue;
      if (isSaaS === null) isSaaS = await detectIsSaaS(env, clientSlug);
      if (isSaaS) {
        await env.DB.prepare(
          "UPDATE roadmap_items SET status = 'done', completed_at = ?, " +
          "completed_by = 'reconciler-not-applicable', updated_at = ? WHERE id = ?"
        ).bind(now, now, item.id).run();
        markedDone++;
      }
      continue;
    }

    // --- Content category: HTTP-probe the live domain ---
    if (item.category === "content") {
      const mapping = CONTENT_TITLE_TO_PATHS.find((m) => m.titleIncludes.test(item.title));
      if (!mapping) continue;
      const cacheKey = mapping.titleIncludes.source;
      let found = probedPaths.get(cacheKey);
      if (!found) {
        found = await detectContentArtifacts(env, clientSlug, mapping.paths);
        probedPaths.set(cacheKey, found);
      }
      if (found.size > 0) {
        await env.DB.prepare(
          "UPDATE roadmap_items SET status = 'done', completed_at = ?, " +
          "completed_by = 'reconciler-content-detected', updated_at = ? WHERE id = ?"
        ).bind(now, now, item.id).run();
        markedDone++;
      }
      continue;
    }
  }

  return { markedDone, markedInProgress };
}

/** Run the reconciler against every client that has any non-done
 *  roadmap items. Used from runDailyTasks. Pre-2026-05-10 this only
 *  selected clients with approved schema_injections, which missed
 *  SaaS clients whose only stalls are authority/content category --
 *  they'd never get the not-applicable / content-detected pass that
 *  resolves their roadmap automatically. */
export async function reconcileAllRoadmaps(env: Env): Promise<ReconcileResult> {
  const slugs = (await env.DB.prepare(
    "SELECT DISTINCT client_slug FROM roadmap_items WHERE status != 'done'"
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
