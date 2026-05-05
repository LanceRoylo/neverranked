/**
 * AI Presence Score — the headline metric of the NVI report.
 *
 * v2 (current). Composite 0-100 from four sub-signals:
 *
 *   citation_rate (40)   % of tracked prompts where the client appears
 *   engine_spread (25)   how many engines cite us at all
 *   prominence    (20)   how high in the cited list we landed
 *   sentiment     (15)   positive minus negative share among cited
 *
 * Prominence is the position the client appeared in the engine's
 * answer. 1 = first / hero quote. 10 = last / footnote-tier. NULL =
 * not cited. We map per-row prominence to (11 - p) / 10 so a hero
 * mention contributes 1.0 and rank 10 contributes 0.1, then average
 * across cited rows and scale by the 20-pt cap.
 *
 * v1 (previous) used 50/30/20 with no prominence; v2 rebalances now
 * that citations.ts emits the position column on every run.
 *
 * The function is pure: feed it citation_run rows, get back the
 * score. Easier to unit-test, easier to re-aggregate any past period
 * idempotently from raw data.
 */
import type { Env } from "../types";
import { gradeBand, type Grade } from "../../../packages/aeo-analyzer/src/grade-bands";

export interface CitationRow {
  engine: string;             // 'openai' | 'perplexity' | 'gemini' | 'google_ai_overview'
  client_cited: number;       // 0 | 1
  sentiment: string | null;   // 'positive' | 'neutral' | 'negative' | null
  prominence: number | null;  // 1 (first) .. 10 (last) | null (not cited)
}

export interface ScoreBreakdown {
  citation_rate_pts: number;
  engine_spread_pts: number;
  prominence_pts: number;
  sentiment_pts: number;
}

export interface PresenceScore {
  score: number;              // 0-100, integer
  grade: Grade;
  breakdown: ScoreBreakdown;
  promptsTotal: number;       // distinct prompts evaluated
  promptsCited: number;       // distinct prompts where client_cited >= 1 in any engine
  enginesCited: number;       // distinct engines with at least one client_cited row
  citedRows: number;          // total client_cited rows (across prompts and engines)
  prevScore: number | null;   // previous month's score, for delta
}

/** v2 cap weights. Sum to 100. */
const W = {
  CITATION_RATE: 40,
  ENGINE_SPREAD: 25,
  PROMINENCE: 20,
  SENTIMENT: 15,
} as const;

/** All engines we count toward the spread bonus. Update if the tracked
 *  engine list changes. Excludes Claude because its responses are
 *  training-only (not a citation surface for current-state visibility). */
const TRACKED_ENGINES = ["openai", "perplexity", "gemini", "google_ai_overview", "bing"] as const;

/** Pure scoring function. Takes the raw citation rows for one client
 *  for one period and returns the score. Optional prevScore is used
 *  for the delta on the report. */
export function scoreFromRows(
  rows: CitationRow[],
  promptsTotal: number,
  prevScore: number | null = null,
): PresenceScore {
  // Group rows by (engine, prompt) so we can compute "distinct prompts
  // cited" and "distinct engines cited" without double-counting.
  // The caller is responsible for not feeding duplicate (engine, prompt)
  // rows for the same period -- we treat each row as the single result
  // for that combination.

  const citedRows = rows.filter((r) => r.client_cited === 1);

  // 1. Citation rate (40 pts max)
  // We collapse rows by prompt to get distinct-prompt-cited count.
  // citation_rate = promptsCited / promptsTotal.
  // Note: rows array doesn't carry prompt id directly, so we approximate
  // by treating each cited row as one prompt mention. Caller should
  // dedupe by prompt before passing rows in if exact prompts-cited
  // count matters for the formula's denominator.
  // For our use the rows ARE per (prompt × engine), so promptsCited
  // requires a unique-prompt count from the caller. We thread that
  // count via the rows' position field as a proxy when grouped by
  // prompt at the SQL level (see computeAiPresenceScore below).
  const promptsCited = countDistinctCitedPrompts(citedRows);
  const citation_rate_pts = promptsTotal > 0
    ? (promptsCited / promptsTotal) * W.CITATION_RATE
    : 0;

  // 2. Engine spread (25 pts max)
  // 6.25 pts per engine cited in, capped at 25.
  const enginesCitedSet = new Set(citedRows.map((r) => r.engine));
  const enginesCited = enginesCitedSet.size;
  const engine_spread_pts = Math.min(W.ENGINE_SPREAD, enginesCited * (W.ENGINE_SPREAD / TRACKED_ENGINES.length));

  // 3. Prominence (20 pts max). Per-row score = (11 - prominence) / 10
  // so rank 1 = 1.0 and rank 10 = 0.1. Average across cited rows that
  // carry a prominence value, then scale by the cap. Rows missing
  // prominence (legacy data pre-migration 0058) are excluded from the
  // denominator so we don't penalize history.
  const promRows = citedRows.filter((r) => r.prominence != null);
  let prominence_pts = 0;
  if (promRows.length > 0) {
    const avgPerRow = promRows.reduce((sum, r) => {
      const p = Math.max(1, Math.min(10, r.prominence!));
      return sum + (11 - p) / 10;
    }, 0) / promRows.length;
    prominence_pts = avgPerRow * W.PROMINENCE;
  }

  // 4. Sentiment (15 pts max). Net (positive - negative) share of cited
  // rows with a sentiment scored. Neutral and unscored contribute 0.
  const scored = citedRows.filter((r) => r.sentiment != null);
  let sentiment_pts = 0;
  if (scored.length > 0) {
    const pos = scored.filter((r) => r.sentiment === "positive").length;
    const neg = scored.filter((r) => r.sentiment === "negative").length;
    const net = (pos - neg) / scored.length;            // -1 .. 1
    sentiment_pts = Math.max(0, Math.min(W.SENTIMENT, net * W.SENTIMENT));
  }

  const breakdown: ScoreBreakdown = {
    citation_rate_pts: round2(citation_rate_pts),
    engine_spread_pts: round2(engine_spread_pts),
    prominence_pts: round2(prominence_pts),
    sentiment_pts: round2(sentiment_pts),
  };

  const score = Math.round(
    breakdown.citation_rate_pts +
    breakdown.engine_spread_pts +
    breakdown.prominence_pts +
    breakdown.sentiment_pts
  );

  return {
    score,
    grade: gradeBand(score).grade,
    breakdown,
    promptsTotal,
    promptsCited,
    enginesCited,
    citedRows: citedRows.length,
    prevScore,
  };
}

function countDistinctCitedPrompts(rows: CitationRow[]): number {
  // Without prompt id in CitationRow, we use a heuristic: distinct
  // (engine, position, sentiment) tuples severely under-count. Caller
  // should pass in prompt_id-grouped rows to get accurate numbers.
  // For now we treat citedRows.length / TRACKED_ENGINES.length as a
  // floor approximation of unique prompts cited.
  return Math.ceil(rows.length / TRACKED_ENGINES.length);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** End-to-end scoring against the live database. Loads citation_runs
 *  for the given client + reporting period, joins to citation_keywords
 *  to count distinct prompts, and scores. */
export async function computeAiPresenceScore(
  env: Env,
  clientSlug: string,
  reportingPeriod: string, // 'YYYY-MM'
): Promise<PresenceScore> {
  const [year, month] = reportingPeriod.split("-").map(Number);
  if (!year || !month) {
    throw new Error(`Invalid reporting period: ${reportingPeriod}`);
  }

  // UTC bounds for the period
  const periodStart = Math.floor(Date.UTC(year, month - 1, 1) / 1000);
  const periodEnd = Math.floor(Date.UTC(year, month, 1) / 1000);

  // Distinct prompts evaluated this period
  const totalRow = await env.DB.prepare(
    `SELECT COUNT(DISTINCT cr.keyword_id) AS n
       FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
       WHERE ck.client_slug = ? AND cr.run_at >= ? AND cr.run_at < ?`
  ).bind(clientSlug, periodStart, periodEnd).first<{ n: number }>();

  const promptsTotal = totalRow?.n ?? 0;

  // Distinct prompts where client_cited in at least one engine
  const citedPromptsRow = await env.DB.prepare(
    `SELECT COUNT(DISTINCT cr.keyword_id) AS n
       FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
       WHERE ck.client_slug = ? AND cr.run_at >= ? AND cr.run_at < ?
         AND cr.client_cited = 1`
  ).bind(clientSlug, periodStart, periodEnd).first<{ n: number }>();

  const promptsCited = citedPromptsRow?.n ?? 0;

  // All cited rows for the rest of the math (engine spread, sentiment).
  // Cheap to load -- max ~400 rows for an NVI Full month.
  const rowsResult = await env.DB.prepare(
    `SELECT cr.engine, cr.client_cited, cr.sentiment, cr.prominence
       FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
       WHERE ck.client_slug = ? AND cr.run_at >= ? AND cr.run_at < ?`
  ).bind(clientSlug, periodStart, periodEnd).all<CitationRow>();

  const rows = rowsResult.results;

  // Build sub-scores using the pure function but override
  // promptsCited with the SQL-derived accurate count.
  const partial = scoreFromRows(rows, promptsTotal);
  const accurateCitationRate = promptsTotal > 0
    ? (promptsCited / promptsTotal) * W.CITATION_RATE
    : 0;
  const breakdown: ScoreBreakdown = {
    ...partial.breakdown,
    citation_rate_pts: round2(accurateCitationRate),
  };
  const score = Math.round(
    breakdown.citation_rate_pts +
    breakdown.engine_spread_pts +
    breakdown.prominence_pts +
    breakdown.sentiment_pts
  );

  // Previous month's score for delta
  const prevPeriod = previousPeriod(reportingPeriod);
  const prevRow = await env.DB.prepare(
    `SELECT ai_presence_score FROM nvi_reports
       WHERE client_slug = ? AND reporting_period = ?`
  ).bind(clientSlug, prevPeriod).first<{ ai_presence_score: number }>();

  return {
    score,
    grade: gradeBand(score).grade,
    breakdown,
    promptsTotal,
    promptsCited,
    enginesCited: partial.enginesCited,
    citedRows: partial.citedRows,
    prevScore: prevRow?.ai_presence_score ?? null,
  };
}

function previousPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  return `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
}
