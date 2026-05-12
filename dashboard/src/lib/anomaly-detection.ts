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

const CRON_EXPECTED_CADENCE: Record<string, number> = {
  daily_tasks: SECONDS_PER_DAY,
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
  const row = await env.DB.prepare(
    "SELECT 1 as one FROM admin_alerts WHERE type = ? AND detail LIKE ? AND created_at > ? AND read_at IS NULL LIMIT 1"
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

  // Last 24h
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
      empty_baseline: baseline?.empty ?? 0,
      daily_empty_rates: dailyByEngine.get(r.engine) ?? [],
    };
  });
}

/**
 * Compute mean and stddev of a numeric array. Returns null if the array
 * is too small for a stable stddev estimate.
 */
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

    // Row-count drop: today produced <50% of baseline daily average
    const baselineDailyAvg = m.runs_baseline / BASELINE_WINDOW_DAYS;
    if (m.runs_24h < baselineDailyAvg * 0.5) {
      const fingerprint = `engine:${m.engine}:row_drop`;
      if (!(await alertAlreadyExists(env, "anomaly_engine_row_drop", fingerprint))) {
        await createAlert(
          env,
          "anomaly_engine_row_drop",
          `${m.engine}: row count dropped`,
          `${fingerprint} | ${m.engine} produced ${m.runs_24h} rows in last 24h vs ${baselineDailyAvg.toFixed(0)} baseline daily average. <50% of expected. Likely cause: cron didn't dispatch, rate limit, or upstream API down.`,
        );
        alertsCreated++;
        details.push(`ALERT: ${m.engine} only ${m.runs_24h} rows vs ${baselineDailyAvg.toFixed(0)} avg`);
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

export interface AnomalyDetectionResult {
  totalAlerts: number;
  engineAlerts: number;
  cronAlerts: number;
  details: string[];
}

export async function runAnomalyDetection(env: Env): Promise<AnomalyDetectionResult> {
  const engineResult = await detectEngineAnomalies(env);
  const cronResult = await detectCronAnomalies(env);
  return {
    totalAlerts: engineResult.alertsCreated + cronResult.alertsCreated,
    engineAlerts: engineResult.alertsCreated,
    cronAlerts: cronResult.alertsCreated,
    details: [...engineResult.details, ...cronResult.details],
  };
}
