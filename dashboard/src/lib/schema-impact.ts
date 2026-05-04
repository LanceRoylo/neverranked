/**
 * Schema impact scoring — the A/B test layer on top of variant tracking.
 *
 * Given a deployed schema variant, computes:
 *   - Citation rate in the N weeks BEFORE deployed_at (control window)
 *   - Citation rate in the N weeks AFTER deployed_at (test window)
 *   - Lift (test - control), as both percentage-point and relative %
 *   - Significance: two-proportion z-test on (cited/total) vs (cited/total)
 *   - Sample-size confidence: "low" if either window has < 20 runs
 *
 * The math is intentionally simple. We're not claiming peer-reviewed
 * statistical rigor -- we're claiming honest, defensible numbers at
 * the level a customer actually wants ("did this work?"). When we
 * don't have enough data we say so instead of making up a result.
 *
 * Window choices:
 *   DEFAULT_WINDOW_WEEKS = 4    enough for 4 weekly Signal runs
 *   BLACKOUT_DAYS = 7           skip the week right at deploy boundary
 *                               (AI engines need ~7 days to re-crawl)
 *
 * Caller pulls citation_runs filtered to keywords on this client, then
 * partitions them into control/test windows by run_at vs deployed_at.
 *
 * NOT in this module:
 *   - Variant manager UI (next iteration)
 *   - Customer-facing report rendering (consumes this module's output)
 */
import type { Env } from "../types";

const DEFAULT_WINDOW_WEEKS = 4;
const BLACKOUT_DAYS = 7;
const MIN_SAMPLE = 20;

export interface VariantImpact {
  injection_id: number;
  client_slug: string;
  schema_type: string;
  target_pages: string;
  variant: string | null;
  deployed_at: number;
  superseded_at: number | null;
  control: WindowStats;
  test: WindowStats;
  /** Absolute lift in percentage points (test_rate - control_rate). */
  lift_pp: number;
  /** Relative lift (test_rate / control_rate - 1) as fraction. NaN if control=0. */
  lift_relative: number;
  /** Two-proportion z-statistic. */
  z_score: number;
  /** Approximate two-tailed p-value from z_score. */
  p_value: number;
  /** "high" | "medium" | "low" | "insufficient" */
  confidence: "high" | "medium" | "low" | "insufficient";
  /** Human-readable summary suitable for customer reports. */
  summary: string;
}

interface WindowStats {
  start: number;          // unix
  end: number;            // unix
  runs: number;           // total citation_runs in window
  cited: number;          // count where client_cited = 1
  rate: number;           // cited / runs (0..1), 0 if runs=0
}

/** Compute impact for a single deployed variant. Returns null if the
 *  variant has no deployed_at set yet. */
export async function computeVariantImpact(
  env: Env,
  injectionId: number,
  windowWeeks: number = DEFAULT_WINDOW_WEEKS,
): Promise<VariantImpact | null> {
  const v = await env.DB.prepare(
    `SELECT id, client_slug, schema_type, target_pages, variant, deployed_at, superseded_at
       FROM schema_injections WHERE id = ?`
  ).bind(injectionId).first<{
    id: number;
    client_slug: string;
    schema_type: string;
    target_pages: string;
    variant: string | null;
    deployed_at: number | null;
    superseded_at: number | null;
  }>();
  if (!v || !v.deployed_at) return null;

  // Build the two windows.
  const blackoutSec = BLACKOUT_DAYS * 86400;
  const windowSec = windowWeeks * 7 * 86400;

  const controlEnd = v.deployed_at - blackoutSec;
  const controlStart = controlEnd - windowSec;
  const testStart = v.deployed_at + blackoutSec;
  // Test window ends at min(now, superseded_at, deployed_at + windowSec).
  const naturalEnd = v.deployed_at + blackoutSec + windowSec;
  const cap = v.superseded_at ?? Math.floor(Date.now() / 1000);
  const testEnd = Math.min(naturalEnd, cap);

  // Pull aggregate stats for each window.
  // Citation_runs join citation_keywords to filter by client_slug.
  // We do NOT filter to specific keywords -- a deployed FAQ on /events
  // can lift citation rate for ANY query about events, not just the
  // ones literally on the page. Causal? No. Indicative? Yes.
  const control = await fetchWindowStats(env, v.client_slug, controlStart, controlEnd);
  const test = await fetchWindowStats(env, v.client_slug, testStart, testEnd);

  const lift_pp = test.rate * 100 - control.rate * 100;
  const lift_relative = control.rate > 0 ? (test.rate / control.rate - 1) : NaN;

  // Two-proportion z-test (pooled). Standard formula:
  //   z = (p_test - p_control) / sqrt(p_pool * (1-p_pool) * (1/n_test + 1/n_control))
  const pPool = (control.cited + test.cited) / Math.max(1, control.runs + test.runs);
  const seComponent = pPool * (1 - pPool) * (1 / Math.max(1, control.runs) + 1 / Math.max(1, test.runs));
  const se = Math.sqrt(Math.max(1e-12, seComponent));
  const z_score = (test.rate - control.rate) / se;
  const p_value = twoTailedPFromZ(z_score);

  // Confidence ladder: insufficient < low < medium < high
  let confidence: VariantImpact["confidence"];
  if (control.runs < MIN_SAMPLE || test.runs < MIN_SAMPLE) {
    confidence = "insufficient";
  } else if (p_value < 0.05) {
    confidence = "high";
  } else if (p_value < 0.15) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  return {
    injection_id: v.id,
    client_slug: v.client_slug,
    schema_type: v.schema_type,
    target_pages: v.target_pages,
    variant: v.variant,
    deployed_at: v.deployed_at,
    superseded_at: v.superseded_at,
    control,
    test,
    lift_pp,
    lift_relative,
    z_score,
    p_value,
    confidence,
    summary: buildSummary(v.schema_type, v.variant, v.target_pages, lift_pp, control, test, confidence),
  };
}

/** Convenience: impact for every deployed variant on a client. Used by
 *  the customer NVI "what we deployed and what it did" section. */
export async function computeAllVariantImpacts(
  env: Env,
  clientSlug: string,
): Promise<VariantImpact[]> {
  const rows = (await env.DB.prepare(
    `SELECT id FROM schema_injections
       WHERE client_slug = ? AND deployed_at IS NOT NULL
       ORDER BY deployed_at DESC`
  ).bind(clientSlug).all<{ id: number }>()).results || [];

  const impacts: VariantImpact[] = [];
  for (const row of rows) {
    const impact = await computeVariantImpact(env, row.id);
    if (impact) impacts.push(impact);
  }
  return impacts;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchWindowStats(
  env: Env,
  clientSlug: string,
  start: number,
  end: number,
): Promise<WindowStats> {
  // Guard: if start >= end (e.g. variant deployed less than 1 week ago,
  // test window hasn't opened yet), return empty stats.
  if (start >= end) return { start, end, runs: 0, cited: 0, rate: 0 };

  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS runs,
            SUM(CASE WHEN cr.client_cited = 1 THEN 1 ELSE 0 END) AS cited
       FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
       WHERE ck.client_slug = ? AND cr.run_at >= ? AND cr.run_at < ?`
  ).bind(clientSlug, start, end).first<{ runs: number; cited: number | null }>();

  const runs = row?.runs ?? 0;
  const cited = row?.cited ?? 0;
  const rate = runs > 0 ? cited / runs : 0;
  return { start, end, runs, cited, rate };
}

/** Two-tailed p-value from a z-score. Uses an Abramowitz & Stegun
 *  approximation for the standard normal CDF -- accurate to ~1e-7,
 *  more than enough for our "is it real or not" decisions. */
function twoTailedPFromZ(z: number): number {
  const absZ = Math.abs(z);
  // Standard normal CDF approximation
  const t = 1 / (1 + 0.2316419 * absZ);
  const d = 0.3989422804014327 * Math.exp(-absZ * absZ / 2);
  const cdf = 1 - d * t * (
    0.319381530 +
    t * (-0.356563782 +
    t * (1.781477937 +
    t * (-1.821255978 +
    t * 1.330274429)))
  );
  return 2 * (1 - cdf);
}

function buildSummary(
  schemaType: string,
  variant: string | null,
  targetPages: string,
  liftPp: number,
  control: WindowStats,
  test: WindowStats,
  confidence: VariantImpact["confidence"],
): string {
  // Parse target_pages JSON for human display
  let target = "";
  try {
    const arr = JSON.parse(targetPages);
    target = Array.isArray(arr) && arr.length > 0 ? arr[0] : "";
  } catch { target = targetPages; }

  const direction = liftPp > 0 ? "lifted" : liftPp < 0 ? "dropped" : "did not change";
  const liftAbs = Math.abs(liftPp).toFixed(1);
  const variantLabel = variant ? `${schemaType}-${variant}` : schemaType;
  const targetLabel = target ? ` on ${target}` : "";

  if (confidence === "insufficient") {
    return `${variantLabel}${targetLabel}: not enough data yet. Control n=${control.runs}, test n=${test.runs}. We need at least ${MIN_SAMPLE} runs in each window to call it. Check back next week.`;
  }

  const significance = confidence === "high"
    ? "statistically significant"
    : confidence === "medium"
    ? "directionally suggestive"
    : "not significant";

  return `${variantLabel}${targetLabel}: citation rate ${direction} by ${liftAbs} percentage points (${(control.rate * 100).toFixed(1)}% → ${(test.rate * 100).toFixed(1)}%). ${significance.charAt(0).toUpperCase() + significance.slice(1)} at the ${confidence}-confidence level (n_control=${control.runs}, n_test=${test.runs}).`;
}
