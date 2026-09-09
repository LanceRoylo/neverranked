/**
 * alert-autoclose.ts — close alerts whose condition has demonstrably cleared.
 *
 * WHY THIS EXISTS. admin_alerts has exactly one state field, read_at, and
 * only a human sets it. An alert therefore describes a moment, not a
 * condition, and it stays in the needs-you lane forever after the problem
 * goes away. Observed 2026-09-08: "daily_tasks: cron task is overdue" sat
 * 143 hours old in the morning briefing while daily_tasks had run clean
 * every day since, including 1.7 hours earlier.
 *
 * The cost is not the stale row. It is that the queue mixes live problems
 * with resolved ones and sorts them by age as though age meant urgency, so
 * the reader cannot tell by looking which is which. In the same briefing,
 * two openai alerts of similar age were entirely real.
 *
 * TWO RULES THIS FILE IS BUILT AROUND.
 *
 * FAIL CLOSED. A type with no entry in CLOSERS is never auto-closed. Most
 * alerts are not "conditions" at all: a negative AI mention does not stop
 * being worth answering because time passed, and a failed backup is not
 * fixed by the next backup succeeding. Only types whose current truth can
 * be re-derived from data belong here, and adding one is a deliberate act.
 *
 * ASK THE DETECTOR, DO NOT REIMPLEMENT IT. Each closer answers "is this
 * still true?" using the same function or table that raised the alert.
 * A second, subtly different copy of the condition is how an alert closes
 * while the problem it named is still happening.
 */

import type { Env } from "../types";
import { CRON_EXPECTED_CADENCE } from "./anomaly-detection";
import { assessPeerHealth } from "./engine-peer-health";
import { monthlyRefreshOverdue } from "./monthly-refresh";
import { isReadoutShapeSnapshot } from "./snapshot-shape";

const SECONDS_PER_DAY = 86400;

export interface OpenAlert {
  id: number;
  type: string;
  detail: string | null;
  created_at: number;
  /** admin_alerts carries this. A slug-scoped closer must read the COLUMN
   *  rather than regex it out of prose: the same alert type is raised with two
   *  different sentences (a customer with zero snapshots, and one whose
   *  snapshot went stale), and a parser tuned to one would silently never
   *  close the other. */
  client_slug: string | null;
}

export interface AutoCloseResult {
  closed: number;
  kept: number;
  /** One line per closed alert, for the cron detail column. */
  notes: string[];
}

interface Closer {
  /** Pull the subject out of the alert. Most read the detail; slug-scoped
   *  ones read the client_slug column. */
  parse(detail: string, alert: OpenAlert): string | null;
  /** True when the condition the alert named is STILL happening. */
  stillTrue(env: Env, subject: string, now: number): Promise<boolean>;
  /** Evidence recorded on the alert when it closes. */
  describe(subject: string): string;
}

const CLOSERS: Record<string, Closer> = {
  // "cron:<task>:overdue | <task> last ran 48.0h ago; ..."
  anomaly_cron_overdue: {
    parse: (d) => d.match(/cron:([A-Za-z0-9_-]+):overdue/)?.[1] ?? null,
    async stillTrue(env, task, now) {
      const cadence = CRON_EXPECTED_CADENCE[task];
      // An unknown task means an unknown cadence, so its overdue-ness
      // cannot be re-derived. Keep the alert.
      if (!cadence) return true;
      const row = await env.DB.prepare(
        "SELECT MAX(ran_at) AS last_ran FROM cron_runs WHERE task_name = ? AND status IN ('success','partial')",
      ).bind(task).first<{ last_ran: number | null }>();
      const last = row?.last_ran ?? null;
      if (last === null) return true;
      // Same 2x threshold the detector raises on.
      return now - last > 2 * cadence;
    },
    describe: (task) => `${task} has run clean within its expected cadence`,
  },

  // "No response from: openai. The probe is one tiny call per engine, ..."
  instrument_probe_failed: {
    parse: (d) => d.match(/No response from:\s*([A-Za-z0-9_]+)/)?.[1] ?? null,
    async stillTrue(env, engine, now) {
      const since = now - SECONDS_PER_DAY;
      const row = await env.DB.prepare(
        `SELECT
           (SELECT COUNT(*) FROM citation_runs   WHERE engine = ?1 AND run_at    > ?2) AS rows_24h,
           (SELECT COUNT(*) FROM engine_failures WHERE engine = ?1 AND failed_at > ?2) AS fails_24h`,
      ).bind(engine, since).first<{ rows_24h: number; fails_24h: number }>();
      const rows = row?.rows_24h ?? 0;
      const fails = row?.fails_24h ?? 0;
      // Cleared only when the engine is both answering AND not being
      // refused. Rows alone are not enough: openai landed 254 rows over
      // seven days while rejecting 399 calls, which is exactly the state
      // this alert is about.
      return !(rows > 0 && fails === 0);
    },
    describe: (engine) => `${engine} answered in the last 24h with no recorded refusals`,
  },

  // Raised per customer, in two different sentences, so the subject comes from
  // the client_slug COLUMN rather than the prose.
  monthly_refresh_overdue: {
    parse: (_d, a) => a.client_slug && a.client_slug !== "_system" ? a.client_slug : null,
    async stillTrue(env, slug, now) {
      const snap = await env.DB.prepare(
        `SELECT engines_breakdown, top_competitors, created_at, week_start
           FROM citation_snapshots WHERE client_slug = ? ORDER BY week_start DESC LIMIT 1`,
      ).bind(slug).first<{ engines_breakdown: string; top_competitors: string; created_at: number | null; week_start: number }>();
      // No snapshot at all is the harder version of the same alert.
      if (!snap) return true;
      // The detector skips legacy-shape rows, so a legacy row is not evidence
      // the refresh landed. Mirroring that keeps the two from disagreeing.
      if (!isReadoutShapeSnapshot(snap.engines_breakdown, snap.top_competitors)) return true;
      // The detector's own function, not a second copy of the date arithmetic.
      return monthlyRefreshOverdue(new Date(now * 1000), snap.created_at || snap.week_start);
    },
    describe: (slug) => `${slug} has a current-month readout snapshot again`,
  },

  // "engine:openai:peer_drop | openai produced 19 rows in 24h against ..."
  anomaly_engine_peer_drop: {
    parse: (d) => d.match(/engine:([A-Za-z0-9_]+):peer_drop/)?.[1] ?? null,
    async stillTrue(env, engine, now) {
      // Deferred entirely to the detector's own function, so the two can
      // never reach different verdicts about the same engine.
      const health = await assessPeerHealth(env, now - SECONDS_PER_DAY);
      const mine = health.find((h) => h.engine === engine);
      // No reading means no evidence it recovered.
      if (!mine) return true;
      return mine.degraded;
    },
    describe: (engine) => `${engine} is back in line with its peer surfaces`,
  },
};

/**
 * Close every unread alert whose condition provably no longer holds.
 *
 * Sets read_at and APPENDS evidence to detail. The append is deliberate:
 * an auto-close that erased the original alert would destroy the record of
 * a problem that really happened.
 */
export async function autoCloseAlerts(env: Env, now: number): Promise<AutoCloseResult> {
  const types = Object.keys(CLOSERS);
  const placeholders = types.map(() => "?").join(",");
  const open = (await env.DB.prepare(
    `SELECT id, type, detail, created_at, client_slug FROM admin_alerts
      WHERE read_at IS NULL AND type IN (${placeholders})
      ORDER BY created_at`,
  ).bind(...types).all<OpenAlert>()).results;

  let closed = 0;
  let kept = 0;
  const notes: string[] = [];

  for (const a of open) {
    const closer = CLOSERS[a.type];
    const subject = closer.parse(a.detail ?? "", a);
    if (!subject) { kept++; continue; }
    let still: boolean;
    try {
      still = await closer.stillTrue(env, subject, now);
    } catch (e) {
      // A checker that throws must never be read as "condition cleared".
      console.log(`[autoclose] check failed for alert ${a.id} (${a.type}/${subject}): ${e}`);
      kept++;
      continue;
    }
    if (still) { kept++; continue; }
    const stamp = new Date(now * 1000).toISOString().slice(0, 10);
    const evidence = ` [auto-closed ${stamp}: ${closer.describe(subject)}]`;
    try {
      await env.DB.prepare(
        "UPDATE admin_alerts SET read_at = ?, detail = COALESCE(detail,'') || ? WHERE id = ? AND read_at IS NULL",
      ).bind(now, evidence, a.id).run();
      closed++;
      notes.push(`${a.type}/${subject}`);
    } catch (e) {
      console.log(`[autoclose] could not close alert ${a.id}: ${e}`);
      kept++;
    }
  }

  return { closed, kept, notes };
}
