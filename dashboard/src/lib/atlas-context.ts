// Atlas context loader.
//
// At each Atlas Chat request, this module assembles the structured
// data context appended to the system prompt. The contract lives in
// /atlas-system-prompt.md (DATA CONTEXT section). Every field below
// corresponds to a promise that prompt makes to the customer.
//
// Design notes:
//
//   - Every loader is independently optional. If a customer has no
//     monthly memos yet, that section returns null and the assembler
//     includes a "(none on file)" marker. Atlas reads the marker and
//     references the absence honestly when relevant. This is how the
//     surface ships before every customer has full editorial history.
//
//   - Loaders are kept narrow. Heavy aggregation (e.g., per-engine
//     citation share, cohort rank computation) happens here so the
//     model doesn't have to do arithmetic on raw rows.
//
//   - All timestamps in the output are ISO-8601 strings, not unix ints.
//     The model handles ISO more reliably and the conversion cost is
//     negligible.
//
//   - The assembled context is packed JSON, not free-form text. The
//     model is instructed (via the system prompt) to read it as
//     structured data; this is more reliable than markdown headings.
//
// Performance: this runs on every Atlas message. Six SQL queries +
// some in-memory aggregation. Targeting <150ms at p95 against the
// D1 East replica.

import type { Env } from "../types";

// ──────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────

export interface AtlasContext {
  customer: CustomerIdentity | null;
  measurement_window: MeasurementWindow;
  locked_questions: LockedQuestionSet;
  cohort: CohortSummary;
  recent_memos: MemoSummary[];
  brand_brain: BrandBrainSection[];
  generated_at: string;
}

export interface CustomerIdentity {
  client_slug: string;
  name: string;
  category: string;
  category_label: string | null;
  status: string;
  signed_at: string | null;
  mrr_cents: number;
  primary_contact_name: string | null;
}

export interface MeasurementWindow {
  days: number;
  start: string;
  end: string;
  total_runs: number;
  citations_of_customer: number;
  citation_share_pct: number;
  by_engine: Array<{
    engine: string;
    total_runs: number;
    citations: number;
    share_pct: number;
  }>;
  weekly_snapshots: Array<{
    week_start: string;
    citation_share: number;
    client_citations: number;
    total_queries: number;
  }>;
}

export interface LockedQuestionSet {
  count: number;
  questions: Array<{
    id: number;
    keyword: string;
    category: string;
    active: boolean;
  }>;
}

export interface CohortSummary {
  registered_count: number;
  members: Array<{
    domain: string;
    label: string | null;
    mentions_last_window: number;
    engines_citing: string[];
  }>;
  customer_rank: number | null; // 1-indexed position by mention count
}

export interface MemoSummary {
  month_key: string;
  title: string | null;
  delivered_at: string;
  body_markdown: string;
}

export interface BrandBrainSection {
  section_number: number;
  title: string;
  body_markdown: string;
  updated_at: string;
}

// Loads the full Atlas context for one customer. Empty sections come
// back as empty arrays or nulls — the assembler/system-prompt handle
// graceful degradation.
export async function buildAtlasContext(
  env: Env,
  clientSlug: string,
  opts: { windowDays?: number; memoCount?: number; brandBrainSections?: number[] } = {}
): Promise<AtlasContext> {
  const windowDays = opts.windowDays ?? 90;
  const memoCount = opts.memoCount ?? 3;
  const brandBrainSections = opts.brandBrainSections ?? [5, 6, 7];

  // Parallel fan-out: every loader is independent, so D1 sees one batch
  // of round-trips instead of six sequential ones.
  const [customer, measurement_window, locked_questions, cohort, recent_memos, brand_brain] =
    await Promise.all([
      loadCustomerIdentity(env, clientSlug),
      loadMeasurementWindow(env, clientSlug, windowDays),
      loadLockedQuestionSet(env, clientSlug),
      loadCohort(env, clientSlug, windowDays),
      loadRecentMemos(env, clientSlug, memoCount),
      loadBrandBrainSections(env, clientSlug, brandBrainSections),
    ]);

  return {
    customer,
    measurement_window,
    locked_questions,
    cohort,
    recent_memos,
    brand_brain,
    generated_at: new Date().toISOString(),
  };
}

// Packs the context into a system-prompt-appendable string. JSON with
// a leading marker the model is instructed to look for. Stable shape,
// so the model can rely on field names being where the prompt says.
export function packContextForPrompt(ctx: AtlasContext): string {
  return [
    "DATA CONTEXT (read as structured JSON; trust these values; do not invent fields not present):",
    "",
    "```json",
    JSON.stringify(ctx, null, 2),
    "```",
    "",
    "End of data context.",
  ].join("\n");
}

// ──────────────────────────────────────────────────────────────────
// Individual loaders
// ──────────────────────────────────────────────────────────────────

async function loadCustomerIdentity(env: Env, slug: string): Promise<CustomerIdentity | null> {
  const row = await env.DB.prepare(
    `SELECT client_slug, name, category, category_label, status, signed_at,
            mrr_cents, primary_contact_name
       FROM customers
      WHERE client_slug = ?`
  )
    .bind(slug)
    .first<{
      client_slug: string;
      name: string;
      category: string;
      category_label: string | null;
      status: string;
      signed_at: number | null;
      mrr_cents: number;
      primary_contact_name: string | null;
    }>();
  if (!row) return null;
  return {
    client_slug: row.client_slug,
    name: row.name,
    category: row.category,
    category_label: row.category_label,
    status: row.status,
    signed_at: row.signed_at ? new Date(row.signed_at * 1000).toISOString() : null,
    mrr_cents: row.mrr_cents,
    primary_contact_name: row.primary_contact_name,
  };
}

async function loadMeasurementWindow(
  env: Env,
  slug: string,
  windowDays: number
): Promise<MeasurementWindow> {
  const now = Math.floor(Date.now() / 1000);
  const startTs = now - windowDays * 86400;

  // Pull every citation_run in the window for this slug's keywords.
  // We aggregate in JS rather than relying on SQLite GROUP BY because
  // we want per-engine counts AND totals from the same row scan.
  const runs = await env.DB.prepare(
    `SELECT cr.engine, cr.client_cited
       FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
      WHERE ck.client_slug = ?
        AND cr.run_at >= ?`
  )
    .bind(slug, startTs)
    .all<{ engine: string; client_cited: number }>();

  const byEngine = new Map<string, { total: number; cited: number }>();
  let totalRuns = 0;
  let totalCited = 0;
  for (const r of runs.results) {
    totalRuns++;
    if (r.client_cited) totalCited++;
    const e = byEngine.get(r.engine) ?? { total: 0, cited: 0 };
    e.total++;
    if (r.client_cited) e.cited++;
    byEngine.set(r.engine, e);
  }

  // Last 12 weekly snapshots; gives Atlas the trend without flooding context.
  const snaps = await env.DB.prepare(
    `SELECT week_start, citation_share, client_citations, total_queries
       FROM citation_snapshots
      WHERE client_slug = ?
      ORDER BY week_start DESC
      LIMIT 12`
  )
    .bind(slug)
    .all<{ week_start: number; citation_share: number; client_citations: number; total_queries: number }>();

  return {
    days: windowDays,
    start: new Date(startTs * 1000).toISOString(),
    end: new Date(now * 1000).toISOString(),
    total_runs: totalRuns,
    citations_of_customer: totalCited,
    citation_share_pct: totalRuns > 0 ? +(100 * totalCited / totalRuns).toFixed(1) : 0,
    by_engine: Array.from(byEngine.entries())
      .map(([engine, e]) => ({
        engine,
        total_runs: e.total,
        citations: e.cited,
        share_pct: e.total > 0 ? +(100 * e.cited / e.total).toFixed(1) : 0,
      }))
      .sort((a, b) => b.share_pct - a.share_pct),
    weekly_snapshots: dedupeByWeek(snaps.results)
      .map((s) => ({
        week_start: new Date(s.week_start * 1000).toISOString().slice(0, 10),
        citation_share: +(s.citation_share * 100).toFixed(1),
        client_citations: s.client_citations,
        total_queries: s.total_queries,
      }))
      .reverse(), // chronological for the model
  };
}

async function loadLockedQuestionSet(env: Env, slug: string): Promise<LockedQuestionSet> {
  const rows = await env.DB.prepare(
    `SELECT id, keyword, category, active
       FROM citation_keywords
      WHERE client_slug = ?
      ORDER BY active DESC, id ASC`
  )
    .bind(slug)
    .all<{ id: number; keyword: string; category: string; active: number }>();
  return {
    count: rows.results.filter((r) => r.active).length,
    questions: rows.results.map((r) => ({
      id: r.id,
      keyword: r.keyword,
      category: r.category,
      active: !!r.active,
    })),
  };
}

async function loadCohort(env: Env, slug: string, windowDays: number): Promise<CohortSummary> {
  const now = Math.floor(Date.now() / 1000);
  const startTs = now - windowDays * 86400;

  // Registered cohort = domains where is_competitor=1 and active=1 for this slug.
  // The customer themselves are also rows in domains (is_competitor=0); we
  // exclude them from cohort but still need their mention count for rank.
  const domains = await env.DB.prepare(
    `SELECT domain, competitor_label, is_competitor
       FROM domains
      WHERE client_slug = ? AND active = 1`
  )
    .bind(slug)
    .all<{ domain: string; competitor_label: string | null; is_competitor: number }>();

  // The competitor_citations rollup table exists in schema but is not
  // populated by the current measurement cron (verified 2026-05-28: zero
  // rows across all clients). Source of truth is citation_runs.cited_entities,
  // a JSON array per run containing {name, url, context} for every entity
  // the AI engine named. We extract hostnames from `url` (reliable) and
  // match against the registered cohort.
  const runs = await env.DB.prepare(
    `SELECT cr.engine, cr.cited_entities, cr.client_cited
       FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
      WHERE ck.client_slug = ?
        AND cr.run_at >= ?
        AND cr.cited_entities != '[]'`
  )
    .bind(slug, startTs)
    .all<{ engine: string; cited_entities: string; client_cited: number }>();

  // Build lookup: registered cohort hostnames (lowercased, www-stripped).
  const cohortDomains = domains.results
    .filter((d) => d.is_competitor === 1)
    .map((d) => ({
      registered: d.domain,
      label: d.competitor_label,
      key: normalizeHostname(d.domain),
    }));
  const cohortKeys = new Set(cohortDomains.map((d) => d.key));

  // Walk every run, extract cited hostnames, match against cohort.
  const byKey = new Map<string, { mentions: number; engines: Set<string> }>();
  let customerMentionCount = 0;
  for (const r of runs.results) {
    if (r.client_cited) customerMentionCount++;
    let parsed: Array<{ name?: string; url?: string }> = [];
    try {
      parsed = JSON.parse(r.cited_entities) ?? [];
    } catch {
      continue; // malformed row, skip
    }
    // Track which cohort keys this run mentions, deduped per-run so a
    // single AI answer counts as one mention per competitor regardless
    // of how many times it lists them.
    const seenThisRun = new Set<string>();
    for (const ent of parsed) {
      const key = hostnameFromEntity(ent);
      if (!key || !cohortKeys.has(key) || seenThisRun.has(key)) continue;
      seenThisRun.add(key);
      const agg = byKey.get(key) ?? { mentions: 0, engines: new Set() };
      agg.mentions++;
      agg.engines.add(r.engine);
      byKey.set(key, agg);
    }
  }

  const cohortMembers = cohortDomains
    .map((d) => {
      const agg = byKey.get(d.key) ?? { mentions: 0, engines: new Set<string>() };
      return {
        domain: d.registered,
        label: d.label,
        mentions_last_window: agg.mentions,
        engines_citing: Array.from(agg.engines).sort(),
      };
    })
    .sort((a, b) => b.mentions_last_window - a.mentions_last_window);

  // Rank: customer's position when sorted descending by mention count
  // against the cohort. 1 = top.
  const allCounts = [
    ...cohortMembers.map((m) => m.mentions_last_window),
    customerMentionCount,
  ].sort((a, b) => b - a);
  const customerRank = allCounts.indexOf(customerMentionCount) + 1;

  return {
    registered_count: cohortMembers.length,
    members: cohortMembers,
    customer_rank: cohortMembers.length > 0 ? customerRank : null,
  };
}

// Hostname extraction helpers. Cited entities have either a `name` that is
// already a hostname ("blaisdellcenter.com") or a brand ("Blaisdell Center")
// plus a `url`. URL is the reliable signal; name is a fallback for entries
// that lack URLs (rare in practice).
function hostnameFromEntity(ent: { name?: string; url?: string }): string | null {
  if (ent.url) {
    try {
      return normalizeHostname(new URL(ent.url).hostname);
    } catch {
      // fall through to name
    }
  }
  if (ent.name && ent.name.includes(".")) {
    return normalizeHostname(ent.name);
  }
  return null;
}

function normalizeHostname(h: string): string {
  return h.toLowerCase().replace(/^www\./, "").trim();
}

// Defensive dedup for weekly snapshots. Migration 0098 + the generator
// UPSERT prevent duplicate (client_slug, week_start) rows going forward,
// but historical data may still carry dupes. Keep one row per week (the
// query already orders by week_start DESC, so the first seen per week is
// the one we keep).
function dedupeByWeek<T extends { week_start: number }>(rows: T[]): T[] {
  const seen = new Set<number>();
  const out: T[] = [];
  for (const r of rows) {
    if (seen.has(r.week_start)) continue;
    seen.add(r.week_start);
    out.push(r);
  }
  return out;
}

async function loadRecentMemos(env: Env, slug: string, n: number): Promise<MemoSummary[]> {
  const rows = await env.DB.prepare(
    `SELECT month_key, title, delivered_at, body_markdown
       FROM monthly_memos
      WHERE client_slug = ?
        AND delivered_at IS NOT NULL
      ORDER BY delivered_at DESC
      LIMIT ?`
  )
    .bind(slug, n)
    .all<{ month_key: string; title: string | null; delivered_at: number; body_markdown: string }>();
  return rows.results.map((r) => ({
    month_key: r.month_key,
    title: r.title,
    delivered_at: new Date(r.delivered_at * 1000).toISOString(),
    body_markdown: r.body_markdown,
  }));
}

async function loadBrandBrainSections(
  env: Env,
  slug: string,
  sections: number[]
): Promise<BrandBrainSection[]> {
  if (sections.length === 0) return [];
  const placeholders = sections.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT section_number, title, body_markdown, updated_at
       FROM brand_brains
      WHERE client_slug = ?
        AND section_number IN (${placeholders})
      ORDER BY section_number ASC`
  )
    .bind(slug, ...sections)
    .all<{ section_number: number; title: string; body_markdown: string; updated_at: number }>();
  return rows.results.map((r) => ({
    section_number: r.section_number,
    title: r.title,
    body_markdown: r.body_markdown,
    updated_at: new Date(r.updated_at * 1000).toISOString(),
  }));
}
