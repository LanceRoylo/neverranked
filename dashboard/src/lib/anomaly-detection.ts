/**
 * Anomaly detection. Phase 1 iteration 2.
 *
 * Runs daily after the morning citation cron. Compares last-24h
 * production metrics against a 14-day rolling baseline. Creates
 * admin_alerts for anomalies that deviate enough from baseline to
 * warrant Lance's attention.
 *
 * Three classes of detection:
 *   1. Per-engine empty-rate spikes (engine was clean for 14d, suddenly empty)
 *   2. Per-engine row-count drops (engine produced <50% of baseline)
 *   3. Cron tasks overdue (missed expected cadence)
 *
 * Design notes:
 *   - 14-day baseline warm-up: if an engine has <100 rows in the
 *     baseline window, skip alerting. Better to be silent than to
 *     spam-alert on too-little-data noise. This handles the cold-start
 *     for new engines (Gemma added 2026-05-10) and avoids tonight's
 *     residual broken-row signal generating noise on first run.
 *   - Idempotency: each alert type checks for an existing unread
 *     admin_alert with the same fingerprint in last 24h. If one exists,
 *     skip creating a duplicate. Prevents wake-up to 5 copies of the
 *     same alert when the underlying issue persists.
 *   - Self-logging: cron run is wrapped in withCronLogging in the
 *     caller (cron.ts), so anomaly_detection shows up on /admin/health.
 *
 * Why this matters: tonight's three engine bugs (Gemma, Claude, OpenAI)
 * would have all triggered alerts on their first morning if this had
 * been running. Lance would have known within hours instead of finding
 * out during MCP launch prep.
 */

import type { Env } from "../types";
import { assessPeerHealth, PEER_DEGRADED_RATIO } from "./engine-peer-health";

const SECONDS_PER_DAY = 86400;
const BASELINE_WINDOW_DAYS = 14;
const BASELINE_MIN_ROWS = 100;
// Auto-tune thresholds: when we have enough data, use statistical
// detection instead of fixed thresholds. Today's empty rate is
// anomalous if it exceeds (mean + 2*stddev) of the per-engine daily
// baseline AND exceeds an absolute floor (so 0%-baseline engines
// don't fire on a single 1% blip).
const STDDEV_DAYS_REQUIRED = 14;  // Need 14+ daily samples for stable stddev
const STDDEV_SIGMA_THRESHOLD = 2; // 2σ ≈ 95% confidence anomaly
const ABSOLUTE_EMPTY_FLOOR = 0.10; // Today must be > 10% empty AT MINIMUM, even if statistically anomalous

interface EngineMetrics {
  engine: string;
  runs_24h: number;
  empty_24h: number;
  runs_baseline: number;
  /** Yesterday, whole UTC day. */
  runs_prev_day: number;
  /** Mean over prior whole days that produced rows. */
  prev_days_avg: number;
  /** How many prior whole days actually produced rows. Carried on the metric
   *  rather than looked up at the rule: the map lives in fetchEngineMetrics
   *  and reaching for it from detectEngineAnomalies is a ReferenceError that
   *  transpiles cleanly and dies at runtime. */
  prior_days: number;
  empty_baseline: number;
  // Auto-tune extension: per-day samples over the baseline window
  // (excluding last 24h). When >= STDDEV_DAYS_REQUIRED days have data,
  // we compute mean+stddev for statistical anomaly detection.
  daily_empty_rates: number[];
}

interface CronTaskMetrics {
  task_name: string;
  last_ran: number | null;
  expected_cadence_seconds: number;
}

/** Exported so the auto-close pass answers "is this task still overdue?"
 *  with the SAME cadence table that raised the alert. Two copies of this
 *  map would drift, and an alert that closes on a cadence the detector
 *  does not share is worse than one that never closes. */
export const CRON_EXPECTED_CADENCE: Record<string, number> = {
  daily_tasks: SECONDS_PER_DAY,
  // Added 2026-09-07. runDailyTasks was split into runCitationDispatch and
  // runDailyMaintenance on 2026-09-03 so the two halves get independent CPU
  // budgets. Only the original task name stayed monitored, so the entire
  // maintenance half -- drip emails, sweeps, watchdogs, memo drafts, and now
  // the query-set hash -- could have stopped dead without raising anything.
  // A monitor that watches half a split task reports health it cannot see.
  daily_maintenance: SECONDS_PER_DAY,
  auth_cleanup: SECONDS_PER_DAY,
  inbox_morning_summary: SECONDS_PER_DAY,
  weekly_scans: 7 * SECONDS_PER_DAY,
  weekly_backup: 7 * SECONDS_PER_DAY,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check whether an admin_alert with this type+fingerprint already exists
 * unread in the last 24h. Used to suppress duplicate alerts.
 */
async function alertAlreadyExists(env: Env, type: string, fingerprint: string): Promise<boolean> {
  const since = Math.floor(Date.now() / 1000) - SECONDS_PER_DAY;
  // Deduped on AGE ONLY, deliberately. This clause used to also require
  // `read_at IS NULL`, which made the alert system quieter the more it had to
  // say: an unread backlog (25 on 2026-08-30) suppressed every new alert
  // sharing those fingerprints. Whether a human has read yesterday's alert is
  // not evidence about today's fleet.
  const row = await env.DB.prepare(
    "SELECT 1 as one FROM admin_alerts WHERE type = ? AND detail LIKE ? AND created_at > ? LIMIT 1"
  ).bind(type, `%${fingerprint}%`, since).first<{ one: number }>();
  return !!row;
}

async function createAlert(env: Env, type: string, title: string, detail: string): Promise<void> {
  try {
    // client_slug is NOT NULL in admin_alerts. Use '_system' for
    // system-level alerts that aren't scoped to a specific client.
    // Matches the existing convention (gsc_token_dead alerts use this).
    await env.DB.prepare(
      "INSERT INTO admin_alerts (client_slug, type, title, detail, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind("_system", type, title, detail.slice(0, 1500), Math.floor(Date.now() / 1000)).run();
  } catch (e) {
    console.log(`[anomaly-detection] createAlert failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ---------------------------------------------------------------------------
// Engine empty-rate spike detection
// ---------------------------------------------------------------------------

async function fetchEngineMetrics(env: Env): Promise<EngineMetrics[]> {
  const now = Math.floor(Date.now() / 1000);
  const dayAgo = now - SECONDS_PER_DAY;
  const baselineStart = now - BASELINE_WINDOW_DAYS * SECONDS_PER_DAY;

  // WHOLE UTC DAYS FOR THE ROW COUNT.
  //
  // The sweep fires once a day at 06:00 and takes minutes to drain, so a
  // rolling 24h window that ends mid-sweep cuts the burst in half and counts a
  // fraction of it. On 2026-09-08 this check ran at 06:03, three minutes into
  // a sixteen-minute sweep with 16% of the day's rows on disk, and raised a
  // row-drop alert for ALL FIVE engines inside one second: 31/77, 30/78,
  // 33/78, 22/55, 35/75. Five surfaces do not fail simultaneously and
  // identically. It was the window, not the engines.
  //
  // Widening the keyword spread to 2400s the next day would have made this
  // fire every morning on every engine, because the check would see about 7%
  // of the sweep instead of 16%.
  //
  // A complete UTC day contains exactly one sweep, so it is the honest unit
  // and it does not depend on when this check happens to run.
  const startOfToday = Math.floor(new Date(now * 1000).setUTCHours(0, 0, 0, 0) / 1000);
  const startOfYesterday = startOfToday - SECONDS_PER_DAY;

  // Last 24h
  // Yesterday, whole, and the mean of the whole days before it.
  const prevDayRows = (await env.DB.prepare(
    `SELECT engine, COUNT(*) AS runs FROM citation_runs
      WHERE run_at >= ? AND run_at < ? GROUP BY engine`
  ).bind(startOfYesterday, startOfToday).all<{ engine: string; runs: number }>()).results;
  const prevDayMap = new Map(prevDayRows.map((r) => [r.engine, r.runs]));

  const priorDaysRows = (await env.DB.prepare(
    `SELECT engine, COUNT(*) AS runs,
            COUNT(DISTINCT CAST(run_at / 86400 AS INTEGER)) AS days
       FROM citation_runs WHERE run_at >= ? AND run_at < ? GROUP BY engine`
  ).bind(startOfYesterday - BASELINE_WINDOW_DAYS * SECONDS_PER_DAY, startOfYesterday)
   .all<{ engine: string; runs: number; days: number }>()).results;
  const priorDaysMap = new Map(priorDaysRows.map((r) => [r.engine, r]));

  const recentRows = (await env.DB.prepare(
    `SELECT engine, COUNT(*) as runs, SUM(CASE WHEN length(response_text) = 0 THEN 1 ELSE 0 END) as empty
     FROM citation_runs WHERE run_at > ? GROUP BY engine`
  ).bind(dayAgo).all<{ engine: string; runs: number; empty: number }>()).results;

  // 14-day baseline EXCLUDING the last 24h so the comparison is apples-to-apples
  const baselineRows = (await env.DB.prepare(
    `SELECT engine, COUNT(*) as runs, SUM(CASE WHEN length(response_text) = 0 THEN 1 ELSE 0 END) as empty
     FROM citation_runs WHERE run_at > ? AND run_at <= ? GROUP BY engine`
  ).bind(baselineStart, dayAgo).all<{ engine: string; runs: number; empty: number }>()).results;

  const baselineMap = new Map(baselineRows.map(r => [r.engine, r]));

  // Per-day baseline samples for stddev computation.
  // Group baseline rows by day (UTC) and compute daily empty rate per engine.
  const dailyRows = (await env.DB.prepare(
    `SELECT engine,
            CAST((run_at - ?) / 86400 AS INTEGER) as day_bucket,
            COUNT(*) as runs,
            SUM(CASE WHEN length(response_text) = 0 THEN 1 ELSE 0 END) as empty
     FROM citation_runs
     WHERE run_at > ? AND run_at <= ?
     GROUP BY engine, day_bucket`
  ).bind(baselineStart, baselineStart, dayAgo).all<{ engine: string; day_bucket: number; runs: number; empty: number }>()).results;

  const dailyByEngine = new Map<string, number[]>();
  for (const r of dailyRows) {
    if (r.runs === 0) continue;
    const rate = r.empty / r.runs;
    if (!dailyByEngine.has(r.engine)) dailyByEngine.set(r.engine, []);
    dailyByEngine.get(r.engine)!.push(rate);
  }

  return recentRows.map(r => {
    const baseline = baselineMap.get(r.engine);
    return {
      engine: r.engine,
      runs_24h: r.runs,
      empty_24h: r.empty,
      runs_baseline: baseline?.runs ?? 0,
      runs_prev_day: prevDayMap.get(r.engine) ?? 0,
      // Averaged over days that ACTUALLY produced rows, not over a fixed 14.
      // Dividing by a constant while the client roster or the measurement
      // start date means fewer real days understates the baseline and hides a
      // genuine drop.
      prev_days_avg: (() => {
        const p = priorDaysMap.get(r.engine);
        return p && p.days > 0 ? p.runs / p.days : 0;
      })(),
      prior_days: priorDaysMap.get(r.engine)?.days ?? 0,
      empty_baseline: baseline?.empty ?? 0,
      daily_empty_rates: dailyByEngine.get(r.engine) ?? [],
    };
  });
}

/**
 * Compute mean and stddev of a numeric array. Returns null if the array
 * is too small for a stable stddev estimate.
 */
/**
 * Is an engine's row count STILL dropped?
 *
 * Exported so alert-autoclose asks this question instead of reimplementing it.
 * The measurement is whole UTC days for the reason recorded above: a rolling
 * window ending mid-sweep counts a fraction of the burst and reported every
 * engine as halved at once.
 */
export async function engineRowDropStillTrue(env: Env, engine: string, nowSecs: number): Promise<boolean> {
  const startOfToday = Math.floor(new Date(nowSecs * 1000).setUTCHours(0, 0, 0, 0) / 1000);
  const startOfYesterday = startOfToday - SECONDS_PER_DAY;
  const y = await env.DB.prepare(
    "SELECT COUNT(*) AS runs FROM citation_runs WHERE engine = ? AND run_at >= ? AND run_at < ?",
  ).bind(engine, startOfYesterday, startOfToday).first<{ runs: number }>();
  const p = await env.DB.prepare(
    `SELECT COUNT(*) AS runs, COUNT(DISTINCT CAST(run_at / 86400 AS INTEGER)) AS days
       FROM citation_runs WHERE engine = ? AND run_at >= ? AND run_at < ?`,
  ).bind(engine, startOfYesterday - BASELINE_WINDOW_DAYS * SECONDS_PER_DAY, startOfYesterday)
   .first<{ runs: number; days: number }>();
  const days = p?.days ?? 0;
  const avg = days > 0 ? (p?.runs ?? 0) / days : 0;
  // Too little history to judge means we cannot say it recovered either.
  if (days < 3 || avg <= 0) return true;
  return (y?.runs ?? 0) < avg * 0.5;
}

function stats(samples: number[]): { mean: number; stddev: number } | null {
  if (samples.length < STDDEV_DAYS_REQUIRED) return null;
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance = samples.reduce((acc, x) => acc + (x - mean) ** 2, 0) / samples.length;
  const stddev = Math.sqrt(variance);
  return { mean, stddev };
}

async function detectEngineAnomalies(env: Env): Promise<{ alertsCreated: number; details: string[] }> {
  const metrics = await fetchEngineMetrics(env);
  const details: string[] = [];
  let alertsCreated = 0;

  for (const m of metrics) {
    // Skip cold-start engines: not enough baseline data
    if (m.runs_baseline < BASELINE_MIN_ROWS) {
      details.push(`${m.engine}: baseline has only ${m.runs_baseline} rows (<${BASELINE_MIN_ROWS} threshold), skipping`);
      continue;
    }
    const baselineRate = m.empty_baseline / m.runs_baseline;
    const recentRate = m.runs_24h === 0 ? 0 : m.empty_24h / m.runs_24h;

    // Empty-rate spike: prefer statistical detection over fixed
    // thresholds when we have enough daily samples (>= 14 days).
    // Spike fires when ALL of the following are true:
    //   1. today's empty rate exceeds the absolute floor (10%)
    //   2. today's rate is > mean + 2*stddev of the baseline daily rates
    //
    // Falls back to the legacy fixed thresholds (baseline<10%, today>30%)
    // for engines that don't yet have 14 daily samples (cold-start).
    const baselineStats = stats(m.daily_empty_rates);
    let spikeDetected = false;
    let spikeReason = "";

    if (baselineStats) {
      const threshold = baselineStats.mean + STDDEV_SIGMA_THRESHOLD * baselineStats.stddev;
      if (recentRate > ABSOLUTE_EMPTY_FLOOR && recentRate > threshold) {
        spikeDetected = true;
        spikeReason = `24h empty rate ${(recentRate * 100).toFixed(0)}% exceeds data-driven threshold of ${(threshold * 100).toFixed(0)}% (baseline ${m.daily_empty_rates.length}-day mean ${(baselineStats.mean * 100).toFixed(1)}%, stddev ${(baselineStats.stddev * 100).toFixed(1)}%)`;
      }
    } else {
      // Cold-start fallback: hardcoded thresholds.
      if (baselineRate < 0.10 && recentRate > 0.30) {
        spikeDetected = true;
        spikeReason = `24h empty rate ${(recentRate * 100).toFixed(0)}% vs baseline ${(baselineRate * 100).toFixed(0)}% (fixed thresholds; need ${STDDEV_DAYS_REQUIRED}+ daily samples for auto-tune to kick in, have ${m.daily_empty_rates.length})`;
      }
    }

    if (spikeDetected) {
      const fingerprint = `engine:${m.engine}:empty_spike`;
      if (!(await alertAlreadyExists(env, "anomaly_engine_empty_spike", fingerprint))) {
        await createAlert(
          env,
          "anomaly_engine_empty_spike",
          `${m.engine}: empty-response rate spiked`,
          `${fingerprint} | ${spikeReason}. Likely cause: API key expired, model name changed, or upstream service degraded. Check /admin/qa for the per_engine_health audit.`,
        );
        alertsCreated++;
        details.push(`ALERT: ${m.engine} ${spikeReason}`);
      } else {
        details.push(`${m.engine} empty spike already alerted in last 24h`);
      }
    } else if (baselineStats) {
      details.push(`${m.engine}: auto-tune OK (rate ${(recentRate * 100).toFixed(1)}%, threshold ${((baselineStats.mean + STDDEV_SIGMA_THRESHOLD * baselineStats.stddev) * 100).toFixed(1)}%, ${m.daily_empty_rates.length} day baseline)`);
    }

    // Row-count drop, measured on WHOLE days. See the window comment above:
    // the rolling version bisected the daily sweep and alerted every engine at
    // once. Needs at least 3 prior days with rows before it will judge.
    const baselineDailyAvg = m.prev_days_avg;
    const priorDays = m.prior_days;
    if (priorDays >= 3 && baselineDailyAvg > 0 && m.runs_prev_day < baselineDailyAvg * 0.5) {
      const fingerprint = `engine:${m.engine}:row_drop`;
      if (!(await alertAlreadyExists(env, "anomaly_engine_row_drop", fingerprint))) {
        await createAlert(
          env,
          "anomaly_engine_row_drop",
          `${m.engine}: row count dropped`,
          `${fingerprint} | ${m.engine} produced ${m.runs_prev_day} rows yesterday vs ${baselineDailyAvg.toFixed(0)} daily average over the ${priorDays} prior days. <50% of expected. Likely cause: cron didn't dispatch, rate limit, or upstream API down.`,
        );
        alertsCreated++;
        details.push(`ALERT: ${m.engine} only ${m.runs_prev_day} rows yesterday vs ${baselineDailyAvg.toFixed(0)} avg`);
      }
    }
  }

  return { alertsCreated, details };
}

// ---------------------------------------------------------------------------
// Cron task freshness detection
// ---------------------------------------------------------------------------

async function detectCronAnomalies(env: Env): Promise<{ alertsCreated: number; details: string[] }> {
  const details: string[] = [];
  let alertsCreated = 0;
  const now = Math.floor(Date.now() / 1000);

  for (const [taskName, cadenceSeconds] of Object.entries(CRON_EXPECTED_CADENCE)) {
    const row = await env.DB.prepare(
      "SELECT MAX(ran_at) as last_ran FROM cron_runs WHERE task_name = ? AND status IN ('success','partial')"
    ).bind(taskName).first<{ last_ran: number | null }>();

    const lastRan = row?.last_ran ?? null;
    if (lastRan === null) {
      // No history at all -- could be cold start (cron_runs telemetry is new). Don't alert yet.
      details.push(`${taskName}: no cron_runs history yet (cold start), skipping`);
      continue;
    }

    const ageSeconds = now - lastRan;
    // Threshold: 2x expected cadence means definitely overdue
    if (ageSeconds > 2 * cadenceSeconds) {
      const fingerprint = `cron:${taskName}:overdue`;
      if (!(await alertAlreadyExists(env, "anomaly_cron_overdue", fingerprint))) {
        const ageHours = (ageSeconds / 3600).toFixed(1);
        const cadenceHours = (cadenceSeconds / 3600).toFixed(0);
        await createAlert(
          env,
          "anomaly_cron_overdue",
          `${taskName}: cron task is overdue`,
          `${fingerprint} | ${taskName} last ran ${ageHours}h ago; expected cadence is every ${cadenceHours}h. More than 2x cadence overdue. Likely cause: Cloudflare scheduled trigger misconfigured or worker error during run.`,
        );
        alertsCreated++;
        details.push(`ALERT: ${taskName} overdue by ${ageHours}h`);
      } else {
        details.push(`${taskName} overdue already alerted in last 24h`);
      }
    }
  }

  return { alertsCreated, details };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------


/**
 * Cross-sectional check: is any surface falling behind its siblings?
 *
 * Complements (does NOT replace) detectEngineAnomalies. The self-baseline
 * catches a sudden fleet-wide stop; this catches the slow, chronic case the
 * self-baseline is blind to by construction, because here the yardstick is
 * the other engines and they do not drift when one of them breaks.
 */
async function detectPeerDrops(env: Env): Promise<{ alertsCreated: number; details: string[] }> {
  const health = await assessPeerHealth(env, Math.floor(Date.now() / 1000) - SECONDS_PER_DAY);
  const details: string[] = [];
  let alertsCreated = 0;

  if (!health.length) {
    details.push("peer check: fleet too quiet to assess (no opinion)");
    return { alertsCreated, details };
  }

  for (const h of health) {
    if (!h.degraded) continue;
    const fingerprint = `engine:${h.engine}:peer_drop`;
    details.push(`${h.engine}: ${h.rows} rows vs peer median ${h.median} (${Math.round(h.pct * 100)}%)`);
    if (await alertAlreadyExists(env, "anomaly_engine_peer_drop", fingerprint)) continue;
    await createAlert(
      env,
      "anomaly_engine_peer_drop",
      `${h.engine}: behind the other surfaces`,
      `${fingerprint} | ${h.engine} produced ${h.rows} rows in 24h against a peer median of ${h.median} ` +
      `(${Math.round(h.pct * 100)}%, threshold ${Math.round(PEER_DEGRADED_RATIO * 100)}%). Every surface gets the ` +
      `same questions on the same schedule, so this is a real shortfall on ${h.engine}, not a quiet day. ` +
      `Unlike the rolling-baseline check this does NOT go quiet if the problem persists. ` +
      `A client readout covering these days will omit ${h.engine} from the citation grid and question movement ` +
      `(report-facts drops any engine under 50% coverage) -- check the key, credits, spend limit and rate limit.`,
    );
    alertsCreated++;
  }
  return { alertsCreated, details };
}

export interface AnomalyDetectionResult {
  totalAlerts: number;
  engineAlerts: number;
  cronAlerts: number;
  details: string[];
}

export async function runAnomalyDetection(env: Env): Promise<AnomalyDetectionResult> {
  const engineResult = await detectEngineAnomalies(env);
  const peerResult = await detectPeerDrops(env);
  const cronResult = await detectCronAnomalies(env);
  return {
    totalAlerts: engineResult.alertsCreated + peerResult.alertsCreated + cronResult.alertsCreated,
    engineAlerts: engineResult.alertsCreated + peerResult.alertsCreated,
    cronAlerts: cronResult.alertsCreated,
    details: [...engineResult.details, ...peerResult.details, ...cronResult.details],
  };
}
