/**
 * Citation-lift outcome tracking.
 *
 * Computes a per-client "your citation rate then vs your citation rate
 * now" metric. This is the proof case -- the answer to "does
 * NeverRanked actually work?" for a specific account.
 *
 * Math:
 *   - engagement_started_at: per-client anchor in client_settings
 *   - baseline window: first 2 weeks after engagement_started_at
 *   - current window: last 2 weeks
 *   - For each window: rate = SUM(cited) / COUNT(*) over all citation_runs
 *     across all keywords + engines for that client
 *   - lift_points = current_rate - baseline_rate (in percentage points)
 *   - lift_multiplier = current_rate / baseline_rate (only when baseline > 0)
 *
 * Honesty rules:
 *   - When engagement < 4 weeks old: baseline still forming
 *   - When sample size is small (< 50 runs in either window): low confidence
 *   - When baseline = 0: surface "first citations earned" instead of multiplier
 */

import type { Env } from "./types";

export interface CitationLift {
  /** Has at least one full window of data on each side. */
  hasData: boolean;
  /** When false, we're still in the baseline-forming window. */
  baselineEstablished: boolean;
  /** Days remaining until baseline is fully formed. Null when established. */
  baselineFormsInDays: number | null;
  /** 0.0-1.0 fraction. Null when not yet measurable. */
  baselineRate: number | null;
  /** 0.0-1.0 fraction. Null when no recent data. */
  currentRate: number | null;
  /** Percentage-point delta. Positive = improvement. */
  liftPoints: number | null;
  /** Multiplier (current / baseline). Only meaningful when baseline > 0. */
  liftMultiplier: number | null;
  /** Sample sizes for the confidence flag. */
  baselineRuns: number;
  currentRuns: number;
  /** True when sample size is too small to claim a number reliably. */
  lowConfidence: boolean;
  /** Engagement anchor as unix seconds. */
  engagementStartedAt: number | null;
  /** Special-case display: client had zero citations and now has some. */
  firstCitationsEarned: boolean;
}

const TWO_WEEKS_SEC = 14 * 86400;
const FOUR_WEEKS_SEC = 28 * 86400;
const MIN_RUNS_FOR_CONFIDENCE = 50;

export async function computeCitationLift(clientSlug: string, env: Env): Promise<CitationLift> {
  const now = Math.floor(Date.now() / 1000);

  // 1. Engagement anchor.
  const settings = await env.DB.prepare(
    "SELECT engagement_started_at FROM client_settings WHERE client_slug = ?"
  ).bind(clientSlug).first<{ engagement_started_at: number | null }>();

  const engagementStartedAt = settings?.engagement_started_at ?? null;

  if (!engagementStartedAt) {
    return zeroLift({ engagementStartedAt: null });
  }

  const baselineEnd = engagementStartedAt + TWO_WEEKS_SEC;
  const currentStart = now - TWO_WEEKS_SEC;

  // 2. Baseline still forming?
  const baselineEstablished = now >= engagementStartedAt + FOUR_WEEKS_SEC;
  const baselineFormsInDays = baselineEstablished
    ? null
    : Math.max(0, Math.ceil((engagementStartedAt + FOUR_WEEKS_SEC - now) / 86400));

  // 3. Per-window aggregates. We aggregate across ALL keywords + engines
  // for the slug. Citation rate is fraction-of-runs-with-citation.
  const baselineQ = await env.DB.prepare(
    `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN cr.client_cited = 1 THEN 1 ELSE 0 END) AS cited
      FROM citation_runs cr
      JOIN citation_keywords ck ON ck.id = cr.keyword_id
      WHERE ck.client_slug = ?
        AND cr.run_at >= ?
        AND cr.run_at < ?`
  ).bind(clientSlug, engagementStartedAt, baselineEnd).first<{ total: number; cited: number }>();

  const currentQ = await env.DB.prepare(
    `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN cr.client_cited = 1 THEN 1 ELSE 0 END) AS cited
      FROM citation_runs cr
      JOIN citation_keywords ck ON ck.id = cr.keyword_id
      WHERE ck.client_slug = ?
        AND cr.run_at >= ?`
  ).bind(clientSlug, currentStart).first<{ total: number; cited: number }>();

  const baselineRuns = baselineQ?.total ?? 0;
  const currentRuns = currentQ?.total ?? 0;

  // No data either side -> no lift to report.
  if (baselineRuns === 0 && currentRuns === 0) {
    return zeroLift({ engagementStartedAt, baselineEstablished, baselineFormsInDays });
  }

  const baselineRate = baselineRuns > 0 ? (baselineQ!.cited / baselineRuns) : null;
  const currentRate = currentRuns > 0 ? (currentQ!.cited / currentRuns) : null;

  let liftPoints: number | null = null;
  let liftMultiplier: number | null = null;
  let firstCitationsEarned = false;

  if (baselineRate !== null && currentRate !== null) {
    liftPoints = (currentRate - baselineRate) * 100;
    if (baselineRate === 0 && currentRate > 0) {
      firstCitationsEarned = true;
    } else if (baselineRate > 0) {
      liftMultiplier = currentRate / baselineRate;
    }
  }

  const lowConfidence = baselineRuns < MIN_RUNS_FOR_CONFIDENCE
    || currentRuns < MIN_RUNS_FOR_CONFIDENCE;

  return {
    hasData: baselineRuns > 0 || currentRuns > 0,
    baselineEstablished,
    baselineFormsInDays,
    baselineRate,
    currentRate,
    liftPoints,
    liftMultiplier,
    baselineRuns,
    currentRuns,
    lowConfidence,
    engagementStartedAt,
    firstCitationsEarned,
  };
}

function zeroLift(partial: Partial<CitationLift>): CitationLift {
  return {
    hasData: false,
    baselineEstablished: true,
    baselineFormsInDays: null,
    baselineRate: null,
    currentRate: null,
    liftPoints: null,
    liftMultiplier: null,
    baselineRuns: 0,
    currentRuns: 0,
    lowConfidence: true,
    engagementStartedAt: null,
    firstCitationsEarned: false,
    ...partial,
  };
}

/** Render the lift as a small HTML block ready to drop into a page.
 *  Compact, headline-style. Returns "" when there's nothing to show
 *  (no engagement anchor, no data). */
export function renderCitationLiftBlock(lift: CitationLift): string {
  if (!lift.engagementStartedAt) return "";

  // Still forming baseline.
  if (!lift.baselineEstablished) {
    const days = lift.baselineFormsInDays ?? 0;
    return `
      <div class="lift-block" style="display:inline-flex;align-items:center;gap:14px;padding:14px 20px;background:var(--bg-edge);border:1px solid var(--line);border-radius:6px;font-size:13px;color:var(--text-soft);line-height:1.5">
        <div style="font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold)">Baseline forming</div>
        <div>Citation lift available in <strong>${days} day${days === 1 ? "" : "s"}</strong>. We're collecting your starting-point data now.</div>
      </div>`;
  }

  // No citations on either side.
  if (!lift.hasData || lift.currentRate === null) {
    return `
      <div class="lift-block" style="display:inline-flex;align-items:center;gap:14px;padding:14px 20px;background:var(--bg-edge);border:1px solid var(--line);border-radius:6px;font-size:13px;color:var(--text-faint)">
        <div style="font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase">Citation lift</div>
        <div>No citation runs in the current window yet. Next run lands Monday.</div>
      </div>`;
  }

  // First citations earned.
  if (lift.firstCitationsEarned) {
    const currentPct = (lift.currentRate * 100).toFixed(1);
    return `
      <div class="lift-block" style="display:inline-flex;align-items:center;gap:16px;padding:16px 22px;background:linear-gradient(180deg,rgba(201,168,76,.12),rgba(201,168,76,.04));border:1px solid var(--gold-dim);border-radius:6px">
        <div>
          <div style="font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);margin-bottom:6px">First citations earned</div>
          <div style="font-family:var(--serif);font-size:24px;font-style:italic;color:var(--text);line-height:1.1">From <em>0%</em> to <strong style="color:var(--gold);font-style:normal">${currentPct}%</strong> citation rate.</div>
          <div style="font-size:11px;color:var(--text-faint);margin-top:6px">${lift.currentRuns} citation runs in the last 2 weeks.${lift.lowConfidence ? " <span style=\"color:var(--gold)\">Sample size is still small -- numbers will tighten with more runs.</span>" : ""}</div>
        </div>
      </div>`;
  }

  // Have both windows. Show delta.
  const baselinePct = ((lift.baselineRate ?? 0) * 100).toFixed(1);
  const currentPct = ((lift.currentRate ?? 0) * 100).toFixed(1);
  const liftPts = lift.liftPoints ?? 0;
  const direction = liftPts > 0 ? "up" : liftPts < 0 ? "down" : "flat";
  const sign = liftPts > 0 ? "+" : "";
  const color = direction === "up" ? "var(--gold)" : direction === "down" ? "#e6a4a0" : "var(--text-mute)";
  const label = direction === "up" ? "Citation rate up" : direction === "down" ? "Citation rate down" : "Citation rate flat";

  return `
    <div class="lift-block" style="display:inline-flex;align-items:center;gap:16px;padding:16px 22px;background:var(--bg-edge);border:1px solid var(--line);border-radius:6px">
      <div>
        <div style="font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:${color};margin-bottom:6px">${label} since you started</div>
        <div style="font-family:var(--serif);font-size:24px;font-style:italic;color:var(--text);line-height:1.1">From <em>${baselinePct}%</em> to <strong style="color:${color};font-style:normal">${currentPct}%</strong> &mdash; <span style="color:${color};font-style:normal">${sign}${liftPts.toFixed(1)}pp</span></div>
        <div style="font-size:11px;color:var(--text-faint);margin-top:6px">Baseline: ${lift.baselineRuns} runs &middot; Current: ${lift.currentRuns} runs.${lift.lowConfidence ? " <span style=\"color:var(--gold)\">Low-confidence (small sample).</span>" : ""}</div>
      </div>
    </div>`;
}
