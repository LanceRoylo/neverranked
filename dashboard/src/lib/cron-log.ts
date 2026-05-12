/**
 * Cron task telemetry helper.
 *
 * Every scheduled task in cron.ts wraps its work and calls logCronRun
 * on completion (success or failure). The /admin/health page reads
 * this table to show last-successful-run timestamps and the anomaly
 * detection cron compares against rolling baselines.
 *
 * The INSERT is wrapped in try/catch. A logging failure NEVER takes
 * down the actual cron task -- worst case we lose telemetry for one
 * run. The actual work is what matters, the log is just observability.
 *
 * Usage:
 *
 *   const started = Date.now();
 *   try {
 *     await runWeeklyDigest(env);
 *     await logCronRun(env, "weekly_digest", "success", Date.now() - started);
 *   } catch (e) {
 *     await logCronRun(env, "weekly_digest", "failure", Date.now() - started,
 *       e instanceof Error ? e.message : String(e));
 *     throw e;
 *   }
 *
 * Or use the withCronLogging helper to wrap a function in one line.
 */
import type { Env } from "../types";

export type CronRunStatus = "success" | "partial" | "failure";

export async function logCronRun(
  env: Env,
  taskName: string,
  status: CronRunStatus,
  durationMs?: number,
  detail?: string,
): Promise<void> {
  try {
    await env.DB.prepare(
      "INSERT INTO cron_runs (task_name, status, ran_at, duration_ms, detail) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(
        taskName,
        status,
        Math.floor(Date.now() / 1000),
        durationMs ?? null,
        detail ? detail.slice(0, 1000) : null,
      )
      .run();
  } catch (e) {
    // Never let telemetry kill the parent cron.
    console.log(
      `[cron-log] failed to log ${taskName} ${status}: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
}

/**
 * Wrap an async cron function so completion is auto-logged.
 *
 * Returns the original function's return value on success, re-throws
 * on failure (after logging). Use this for the simple case where the
 * task doesn't have a meaningful "partial" outcome.
 */
export async function withCronLogging<T>(
  env: Env,
  taskName: string,
  fn: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  try {
    const result = await fn();
    await logCronRun(env, taskName, "success", Date.now() - started);
    return result;
  } catch (e) {
    await logCronRun(
      env,
      taskName,
      "failure",
      Date.now() - started,
      e instanceof Error ? e.message : String(e),
    );
    throw e;
  }
}
