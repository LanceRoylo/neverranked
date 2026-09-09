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
import { engineLayer, byLayerThenShare, LAYER_UNITS_NOTE, type EngineLayer } from "./engine-layer";
import { cohortRank, COHORT_BASIS_NOTE, type CohortRankBasis } from "./cohort-rank";
import { isReadoutShapeSnapshot } from "./snapshot-shape";

// ──────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────

export interface AtlasContext {
  customer: CustomerIdentity | null;
  measurement_window: MeasurementWindow;
  // Freshness. Atlas must be able to answer "is my measurement current /
  // running?" with dates rather than presenting the newest snapshot as
  // today's news (the measured_at class of bug, again). Populated from the
  // measurement registry + heartbeats; null fields mean "not on the pass
  // cadence" and Atlas says it doesn't have that rather than guessing.
  measurement_status: MeasurementStatus;
  locked_questions: LockedQuestionSet;
  cohort: CohortSummary;
  recent_memos: MemoSummary[];
  brand_brain: BrandBrainSection[];
  generated_at: string;
}

export interface MeasurementStatus {
  on_pass_cadence: boolean;
  passes_done_this_month: number | null;
  passes_target: number | null;
  scheduled_run_days: number[] | null; // days of month, e.g. [1, 11, 21]
  latest_data_at: string | null; // newest citation_run for this customer (ISO date)
  next_memo_date: string;
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
  /** Owned citations as a share of citations to ANY cohort venue. Matches the
   *  dashboard headline and the readout venue chart. */
  venue_share_pct: number;
  /** Owned citations as a share of EVERY cited source. Larger denominator, so
   *  a much smaller number. Not interchangeable with venue_share_pct. */
  share_of_all_cited_sources_pct: number;
  _units: { venue_share_pct: string; share_of_all_cited_sources_pct: string };
  by_engine: Array<{
    engine: string;
    total_runs: number;
    citations: number;
    share_pct: number;
    /** "citation" and "model_knowledge" are different measurements. Dropping
     *  this field let a share of ANSWERS sort above a share of CITED SOURCES
     *  in one ranked list, in the customer-facing chat. */
    layer: EngineLayer;
  }>;
  _layers: string;
  weekly_snapshots: Array<{
    week_start: string;
    /** Same unit as share_of_all_cited_sources_pct above, NOT venue share. */
    share_of_all_cited_sources_pct: number;
    client_citations: number;
    total_queries: number;
  }>;
  offsite: {
    source_types: Array<{ type: string; share_pct: number }>;
    hosts: Array<{ host: string; share_pct: number }>;
  };
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
    /** Count on whichever basis `rank_basis` names. For venue_citations this
     *  is attributed Layer 1 citations; for the 90d fallback it is how often
     *  the venue was NAMED in a response. */
    mentions_last_window: number;
    /** Runs-based fallback only. Absent on the snapshot basis, which stores a
     *  COUNT of engines and no list. An empty array here would read as "no
     *  engine cites them", which is a false claim rather than a missing one. */
    engines_citing?: string[];
    /** Snapshot basis only: how many surfaces cited this venue. */
    engines_count?: number;
  }>;
  customer_rank: number | null;
  /** Which computation produced customer_rank. The readout and the memo use
   *  venue_citations; anything else must not be quoted as the published rank. */
  rank_basis: CohortRankBasis;
  /** Read by the chat model. Spells out what this rank is and is not. */
  _rank_basis_note: string;
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
  const [customer, measurement_window, measurement_status, locked_questions, cohort, recent_memos, brand_brain] =
    await Promise.all([
      loadCustomerIdentity(env, clientSlug),
      loadMeasurementWindow(env, clientSlug, windowDays),
      loadMeasurementStatus(env, clientSlug),
      loadLockedQuestionSet(env, clientSlug),
      loadCohort(env, clientSlug, windowDays),
      loadRecentMemos(env, clientSlug, memoCount),
      loadBrandBrainSections(env, clientSlug, brandBrainSections),
    ]);

  return {
    customer,
    measurement_window,
    measurement_status,
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

async function loadMeasurementStatus(env: Env, slug: string): Promise<MeasurementStatus> {
  const { nextMemoDate } = await import("./atlas-system-prompt");
  const next_memo_date = nextMemoDate(new Date());

  // Newest raw reading for this customer, whatever produced it.
  const latest = await env.DB.prepare(
    `SELECT MAX(cr.run_at) AS ts
       FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
      WHERE ck.client_slug = ?`,
  ).bind(slug).first<{ ts: number | null }>();
  const latest_data_at = latest?.ts ? new Date(latest.ts * 1000).toISOString().slice(0, 10) : null;

  const reg = await env.DB.prepare(
    "SELECT category, run_days, full_target FROM measurement_registry WHERE client_slug = ? AND active = 1",
  ).bind(slug).first<{ category: string; run_days: string | null; full_target: number | null }>();
  if (!reg) {
    return { on_pass_cadence: false, passes_done_this_month: null, passes_target: null, scheduled_run_days: null, latest_data_at, next_memo_date };
  }

  // Heartbeat months are HST; ask in the same calendar (see cron.ts).
  const month = new Date(Date.now() - 10 * 3600 * 1000).toISOString().slice(0, 7);
  const hb = await env.DB.prepare(
    "SELECT MAX(clean_runs_on_disk) AS done FROM measurement_heartbeats WHERE category = ? AND month = ? AND ok = 1",
  ).bind(reg.category, month).first<{ done: number | null }>();

  let scheduled_run_days: number[] | null = null;
  try { scheduled_run_days = JSON.parse(String(reg.run_days || "[]")) as number[]; } catch { scheduled_run_days = null; }

  return {
    on_pass_cadence: true,
    passes_done_this_month: Number(hb?.done ?? 0),
    passes_target: Number(reg.full_target ?? 3),
    scheduled_run_days,
    latest_data_at,
    next_memo_date,
  };
}

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
    `SELECT week_start, citation_share, client_citations, total_queries, engines_breakdown, top_competitors
       FROM citation_snapshots
      WHERE client_slug = ?
      ORDER BY week_start DESC
      LIMIT 12`
  )
    .bind(slug)
    .all<{ week_start: number; citation_share: number; client_citations: number; total_queries: number; engines_breakdown: string; top_competitors: string }>();

  // Canonical metric (locked 2026-06-12): share of citations, per engine, as
  // stored in the latest snapshot's engines_breakdown by the research->D1 bridge.
  // This is the same number the published readout shows, so Atlas and the readout
  // never disagree. The citation_runs computation above is the fallback for any
  // customer that has no snapshot yet (Atlas degrades honestly, not wrongly).
  let byEngineOut = Array.from(byEngine.entries())
    .map(([engine, e]) => ({
      engine,
      total_runs: e.total,
      citations: e.cited,
      share_pct: e.total > 0 ? +(100 * e.cited / e.total).toFixed(1) : 0,
      // This path keys by RAW engine ("openai"); the snapshot path below keys
      // by DISPLAY LABEL ("ChatGPT search"). engineLayer resolves both.
      layer: engineLayer(engine),
    }))
    .sort(byLayerThenShare);
  let sharePctOut = totalRuns > 0 ? +(100 * totalCited / totalRuns).toFixed(1) : 0;
  const headSnap = snaps.results[0];
  // Shape guard added 2026-09-06. Without it a LEGACY-shape snapshot (which
  // has `queries`/`citations`, not `total`/`share_pct`) passed the try block
  // intact: `arr.length` was non-zero, so the correct runs-based byEngineOut
  // computed just above was overwritten with a row of `undefined` values --
  // and those went straight into the customer-facing Atlas context. Failing
  // back to the runs-based numbers is strictly better than answering a
  // customer from undefined.
  const headIsReadout = headSnap
    ? isReadoutShapeSnapshot(headSnap.engines_breakdown, headSnap.top_competitors)
    : false;
  if (headIsReadout && headSnap?.engines_breakdown) {
    try {
      // `layer` is written by buildReadoutSnapshot and was being discarded
      // here, along with the only thing that made the seven figures legible.
      const eb = JSON.parse(headSnap.engines_breakdown) as Record<string, { citations: number; total: number; share_pct: number; layer?: string }>;
      const arr = Object.entries(eb).map(([engine, v]) => ({
        engine,
        total_runs: v.total,
        citations: v.citations,
        share_pct: v.share_pct,
        // Trust the stored layer when present, fall back to the shared
        // resolver, never guess.
        layer: (v.layer === "citation" || v.layer === "model_knowledge") ? v.layer : engineLayer(engine),
      }));
      if (arr.length) byEngineOut = arr.sort(byLayerThenShare);
      if (typeof headSnap.citation_share === "number") sharePctOut = +(headSnap.citation_share * 100).toFixed(1);
    } catch { /* malformed snapshot: keep the runs-based fallback */ }
  }

  // Off-site sources (where AI pulls its category answers from) + the top
  // third-party hosts to target. Written into the snapshot's top_competitors
  // by the dryrun->D1 bridge, so Atlas can answer "where does AI cite for me".
  let offsiteOut: MeasurementWindow["offsite"] = { source_types: [], hosts: [] };
  // THE number the customer sees everywhere else. The dashboard headline and
  // the readout's venue chart both render htc_venue_share_pct (owned citations
  // divided by citations to ANY venue in the cohort). Atlas used to answer
  // "what is my citation share" with citation_share instead, which is owned
  // divided by EVERY cited URL -- a strictly larger denominator. On
  // 2026-09-07, from one snapshot row, that was 12% on the dashboard and 1.64%
  // in the chat: the same words, a 7.3x gap, and no way for the customer to
  // tell which was wrong. Found by the delivery audit the same day.
  let venueSharePct: number | null = null;
  if (headIsReadout && headSnap?.top_competitors) {
    try {
      const tc = JSON.parse(headSnap.top_competitors) as { htc_venue_share_pct?: number; source_types?: Record<string, { share_pct?: number }>; offsite_hosts?: Array<{ host?: string; share_pct?: number }> };
      if (typeof tc.htc_venue_share_pct === "number") venueSharePct = tc.htc_venue_share_pct;
      offsiteOut = {
        source_types: Object.entries(tc.source_types ?? {}).map(([type, v]) => ({ type, share_pct: v.share_pct ?? 0 })).filter((s) => s.share_pct > 0).sort((a, b) => b.share_pct - a.share_pct),
        hosts: (tc.offsite_hosts ?? []).map((h) => ({ host: h.host ?? "", share_pct: h.share_pct ?? 0 })).filter((h) => h.host),
      };
    } catch { /* malformed: keep empty */ }
  }

  return {
    days: windowDays,
    start: new Date(startTs * 1000).toISOString(),
    end: new Date(now * 1000).toISOString(),
    total_runs: totalRuns,
    citations_of_customer: totalCited,
    // Two DIFFERENT shares, named so they cannot be conflated. The field
    // formerly called citation_share_pct carried the second one while the
    // system prompt and every other surface meant the first.
    venue_share_pct: venueSharePct ?? sharePctOut,
    share_of_all_cited_sources_pct: sharePctOut,
    _units: {
      venue_share_pct:
        "THE headline figure. Of every citation that named a business in this customer's competitive category, the share that named THEM. This is the number on their dashboard and in their monthly readout. Use this when asked about citation share, visibility, or how they are doing.",
      share_of_all_cited_sources_pct:
        "A different and much smaller figure: of EVERY source cited across all questions, including news, guides, directories and unrelated sites, the share that was this customer. A larger denominator, so a smaller number. Never present it as their citation share and never compare it against venue_share_pct.",
    },
    by_engine: byEngineOut,
    _layers: LAYER_UNITS_NOTE,
    weekly_snapshots: dedupeByWeek(snaps.results)
      .map((s) => ({
        week_start: new Date(s.week_start * 1000).toISOString().slice(0, 10),
        share_of_all_cited_sources_pct: +(s.citation_share * 100).toFixed(1),
        client_citations: s.client_citations,
        total_queries: s.total_queries,
      }))
      .reverse(), // chronological for the model
    offsite: offsiteOut,
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

  // PREFER THE SNAPSHOT. Atlas used to rank from the computation above:
  // entity mentions, 90-day rolling window, hostname matching. The readout and
  // the monthly memo rank from attributed Layer 1 citations, month to date,
  // via the venue matcher. Different numerator, different window, different
  // attribution, and both were shown to the same customer as "your rank".
  //
  // This is the same failure the citation-share comment above records: the
  // same words over a different denominator, with no way for the customer to
  // tell which was wrong. Share was unified then. Rank was not.
  let members = cohortMembers.map((m) => ({
    domain: m.domain,
    label: m.label,
    mentions_last_window: m.mentions_last_window,
    engines_citing: m.engines_citing,
  })) as CohortSummary["members"];
  let ownedCount = customerMentionCount;
  let competitorCounts = cohortMembers.map((m) => m.mentions_last_window);
  let basis: CohortRankBasis = "entity_mentions_90d";

  try {
    const snap = await env.DB.prepare(
      `SELECT engines_breakdown, top_competitors FROM citation_snapshots
        WHERE client_slug = ? ORDER BY week_start DESC LIMIT 1`,
    ).bind(slug).first<{ engines_breakdown: string; top_competitors: string }>();
    if (snap && isReadoutShapeSnapshot(snap.engines_breakdown, snap.top_competitors)) {
      const tc = JSON.parse(snap.top_competitors) as {
        competitors?: Array<{ domain?: string; label?: string; citations?: number; engines_count?: number }>;
      };
      const eb = JSON.parse(snap.engines_breakdown) as Record<string, { citations?: number; layer?: string }>;
      // Owned side derived exactly as memo-inputs does: Layer 1 citations
      // only. Pooling in Layer 2 mentions would put a share of ANSWERS in a
      // numerator whose denominator counts cited URLs.
      const owned = Object.entries(eb)
        .filter(([k, v]) => (v.layer ?? (engineLayer(k) === "citation" ? "citation" : "model_knowledge")) === "citation")
        .reduce((a, [, v]) => a + (v.citations ?? 0), 0);
      const comps = (tc.competitors ?? []).filter((c) => c.domain);
      if (comps.length) {
        members = comps.map((c) => ({
          domain: String(c.domain),
          label: c.label ?? null,
          mentions_last_window: c.citations ?? 0,
          engines_count: c.engines_count,
        }));
        ownedCount = owned;
        competitorCounts = comps.map((c) => c.citations ?? 0);
        basis = "venue_citations";
      }
    }
  } catch (e) {
    // Fall back to the runs-based cohort. Reporting the wrong basis is worse
    // than reporting a provisional one, and the note below says which it is.
    console.log(`[atlas] cohort snapshot override failed for ${slug}: ${e}`);
  }

  return {
    registered_count: members.length,
    members,
    customer_rank: cohortRank(ownedCount, competitorCounts),
    rank_basis: basis,
    _rank_basis_note: COHORT_BASIS_NOTE[basis],
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
