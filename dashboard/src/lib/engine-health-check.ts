/**
 * Engine self-healing health check. Phase 4.
 *
 * Detects engines stuck in a persistently-broken state that anomaly
 * detection misses. Anomaly detection catches "engine WAS clean, now
 * broken" (delta-based). This catches "engine has BEEN broken for a
 * while" (absolute-state-based).
 *
 * Transitions managed here:
 *   active  --(empty rate > 40% over 7d)--> degraded
 *   degraded --(empty rate < 20% over 24h)--> active
 *
 * Self-healing is one-way for auto-recovery: a degraded engine
 * auto-transitions back to active when the underlying issue is fixed.
 * Auto-degrade is loud (admin_alert fired). Auto-recover is quiet (info
 * alert only).
 *
 * NEVER auto-disables. Disabling is a Lance decision -- an admin button
 * triggers it manually. The disabled state means "stop calling this
 * engine entirely" which the cron dispatcher respects.
 *
 * Idempotent: re-running this on the same data does nothing once the
 * correct state has been recorded.
 */

import type { Env } from "../types";

const SECONDS_PER_DAY = 86400;
const DEGRADE_WINDOW_DAYS = 7;
const RECOVER_WINDOW_HOURS = 24;
const DEGRADE_EMPTY_THRESHOLD = 0.40;  // >40% empty over 7d => degrade
const RECOVER_EMPTY_THRESHOLD = 0.20;  // <20% empty over 24h => recover
const MIN_RUNS_FOR_DECISION = 20;       // need at least 20 runs in the window to make a call

const TRACKED_ENGINES = [
  "perplexity", "openai", "gemini", "anthropic",
  "bing", "google_ai_overview", "gemma",
];

interface CurrentStatus {
  engine: string;
  status: "active" | "degraded" | "disabled";
  changed_at: number;
  reason: string | null;
}

interface EngineMetrics {
  engine: string;
  runs_7d: number;
  empty_7d: number;
  runs_24h: number;
  empty_24h: number;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

async function getCurrentStatuses(env: Env): Promise<Map<string, CurrentStatus>> {
  // For each engine, the most recent row in engine_status is current.
  const rows = (await env.DB.prepare(
    `SELECT engine, status, reason, changed_at
     FROM engine_status es1
     WHERE changed_at = (
       SELECT MAX(changed_at) FROM engine_status es2 WHERE es2.engine = es1.engine
     )`
  ).all<CurrentStatus>()).results;
  return new Map(rows.map(r => [r.engine, r]));
}

async function getEngineMetrics(env: Env): Promise<Map<string, EngineMetrics>> {
  const now = Math.floor(Date.now() / 1000);
  const dayAgo = now - SECONDS_PER_DAY;
  const weekAgo = now - DEGRADE_WINDOW_DAYS * SECONDS_PER_DAY;

  const sevenDayRows = (await env.DB.prepare(
    `SELECT engine, COUNT(*) as runs, SUM(CASE WHEN length(response_text) = 0 THEN 1 ELSE 0 END) as empty
     FROM citation_runs WHERE run_at > ? GROUP BY engine`
  ).bind(weekAgo).all<{ engine: string; runs: number; empty: number }>()).results;

  const dayRows = (await env.DB.prepare(
    `SELECT engine, COUNT(*) as runs, SUM(CASE WHEN length(response_text) = 0 THEN 1 ELSE 0 END) as empty
     FROM citation_runs WHERE run_at > ? GROUP BY engine`
  ).bind(dayAgo).all<{ engine: string; runs: number; empty: number }>()).results;

  const dayMap = new Map(dayRows.map(r => [r.engine, r]));
  const out = new Map<string, EngineMetrics>();
  for (const r of sevenDayRows) {
    const day = dayMap.get(r.engine);
    out.set(r.engine, {
      engine: r.engine,
      runs_7d: r.runs,
      empty_7d: r.empty,
      runs_24h: day?.runs ?? 0,
      empty_24h: day?.empty ?? 0,
    });
  }
  // Engines with no rows at all in 7d still need a record (so we can
  // detect them as broken if no runs is also a broken state).
  for (const engine of TRACKED_ENGINES) {
    if (!out.has(engine)) {
      out.set(engine, { engine, runs_7d: 0, empty_7d: 0, runs_24h: 0, empty_24h: 0 });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function transitionStatus(
  env: Env,
  engine: string,
  newStatus: "active" | "degraded",
  reason: string,
): Promise<void> {
  try {
    await env.DB.prepare(
      "INSERT INTO engine_status (engine, status, reason, changed_at) VALUES (?, ?, ?, ?)"
    ).bind(engine, newStatus, reason.slice(0, 500), Math.floor(Date.now() / 1000)).run();
  } catch (e) {
    console.log(`[engine-health-check] transitionStatus failed for ${engine}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function fireAlert(
  env: Env,
  alertType: string,
  title: string,
  detail: string,
): Promise<void> {
  try {
    // client_slug is NOT NULL; use '_system' for cross-client alerts
    // (matches the gsc_token_dead convention)
    await env.DB.prepare(
      "INSERT INTO admin_alerts (client_slug, type, title, detail, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind("_system", alertType, title, detail.slice(0, 1500), Math.floor(Date.now() / 1000)).run();
  } catch (e) {
    console.log(`[engine-health-check] fireAlert failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function alertAlreadyFiredRecently(env: Env, alertType: string, engine: string): Promise<boolean> {
  // Don't double-alert if we already fired the same type for the same engine in last 24h
  const since = Math.floor(Date.now() / 1000) - SECONDS_PER_DAY;
  const row = await env.DB.prepare(
    "SELECT 1 as one FROM admin_alerts WHERE type = ? AND detail LIKE ? AND created_at > ? AND read_at IS NULL LIMIT 1"
  ).bind(alertType, `%engine:${engine}%`, since).first<{ one: number }>();
  return !!row;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface EngineHealthCheckResult {
  transitions: number;
  degradedCount: number;
  recoveredCount: number;
  alerts: number;
  detail: string[];
}

export async function runEngineHealthCheck(env: Env): Promise<EngineHealthCheckResult> {
  const statuses = await getCurrentStatuses(env);
  const metrics = await getEngineMetrics(env);
  const detail: string[] = [];
  let degradedCount = 0;
  let recoveredCount = 0;
  let alerts = 0;

  for (const engine of TRACKED_ENGINES) {
    const current = statuses.get(engine);
    const m = metrics.get(engine);
    if (!current || !m) {
      detail.push(`${engine}: missing data (status=${!!current}, metrics=${!!m}), skip`);
      continue;
    }

    // 'disabled' is a manual state. Never touch it from auto-healing.
    if (current.status === "disabled") {
      detail.push(`${engine}: status=disabled (manual), skip`);
      continue;
    }

    // ---------------- DEGRADE PATH ----------------
    if (current.status === "active") {
      if (m.runs_7d < MIN_RUNS_FOR_DECISION) {
        detail.push(`${engine}: active, only ${m.runs_7d} runs in 7d (need ${MIN_RUNS_FOR_DECISION}), no decision`);
        continue;
      }
      const empty7dRate = m.empty_7d / m.runs_7d;
      if (empty7dRate > DEGRADE_EMPTY_THRESHOLD) {
        const reason = `engine:${engine} empty rate ${(empty7dRate * 100).toFixed(0)}% over last 7d (${m.empty_7d}/${m.runs_7d}); exceeds ${(DEGRADE_EMPTY_THRESHOLD * 100).toFixed(0)}% degrade threshold`;
        await transitionStatus(env, engine, "degraded", reason);
        degradedCount++;
        detail.push(`DEGRADE: ${reason}`);
        if (!(await alertAlreadyFiredRecently(env, "engine_degraded", engine))) {
          await fireAlert(
            env,
            "engine_degraded",
            `${engine}: engine marked degraded (persistent failure)`,
            `${reason}. Cron continues to call ${engine} so the system can detect recovery, but every empty row pollutes Citation Tape data. Likely cause: stale API key, dead model name, billing exhausted, or upstream service down. Investigate at /admin/health and /admin/qa.`,
          );
          alerts++;
        }
        continue;
      }
      detail.push(`${engine}: active and healthy (${(empty7dRate * 100).toFixed(0)}% empty 7d)`);
      continue;
    }

    // ---------------- RECOVER PATH ----------------
    if (current.status === "degraded") {
      if (m.runs_24h < 3) {
        detail.push(`${engine}: degraded, only ${m.runs_24h} runs in 24h, can't assess recovery yet`);
        continue;
      }
      const empty24hRate = m.empty_24h / m.runs_24h;
      if (empty24hRate < RECOVER_EMPTY_THRESHOLD) {
        const reason = `engine:${engine} empty rate dropped to ${(empty24hRate * 100).toFixed(0)}% over last 24h (${m.empty_24h}/${m.runs_24h}); below ${(RECOVER_EMPTY_THRESHOLD * 100).toFixed(0)}% recovery threshold. Auto-restored to active.`;
        await transitionStatus(env, engine, "active", reason);
        recoveredCount++;
        detail.push(`RECOVER: ${reason}`);
        // Info-level alert. Not noisy.
        await fireAlert(
          env,
          "engine_recovered",
          `${engine}: engine auto-recovered`,
          `${reason} No action needed -- system self-healed. The previous degrade alert can be marked read.`,
        );
        alerts++;
        continue;
      }
      detail.push(`${engine}: still degraded (${(empty24hRate * 100).toFixed(0)}% empty in last 24h)`);
      continue;
    }
  }

  return {
    transitions: degradedCount + recoveredCount,
    degradedCount,
    recoveredCount,
    alerts,
    detail,
  };
}

/**
 * Read helper for the health page.
 *
 * Returns the current status of every tracked engine in one query,
 * for rendering the "status pill" column on /admin/health.
 */
export async function getCurrentEngineStatuses(env: Env): Promise<Map<string, { status: string; reason: string | null; changed_at: number }>> {
  const rows = (await env.DB.prepare(
    `SELECT engine, status, reason, changed_at
     FROM engine_status es1
     WHERE changed_at = (
       SELECT MAX(changed_at) FROM engine_status es2 WHERE es2.engine = es1.engine
     )`
  ).all<{ engine: string; status: string; reason: string | null; changed_at: number }>()).results;
  return new Map(rows.map(r => [r.engine, { status: r.status, reason: r.reason, changed_at: r.changed_at }]));
}
