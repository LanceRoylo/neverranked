/**
 * Weekly summary email. Phase 1 iteration 2.
 *
 * Sends Lance a Monday-morning digest of system state so he doesn't
 * have to log in to know if anything needs his attention.
 *
 * Sections:
 *   1. Top-line system status (green/yellow/red one-liner)
 *   2. This week's citation activity (total runs, engines reporting)
 *   3. Cron health (any task that missed its cadence)
 *   4. QA verdicts (last 7d green/yellow/red counts)
 *   5. Items needing your attention (pending approvals, unread alerts)
 *
 * Plain text. Founder-voice. No HTML, no styling. Sent via the
 * sendEmailViaResend helper so it gets free preflight QA check.
 */

import type { Env } from "../types";

const SECONDS_PER_DAY = 86400;
const RECIPIENT = "lance@neverranked.com";

function formatTimestamp(unix: number): string {
  const date = new Date(unix * 1000);
  return date.toISOString().replace("T", " ").substring(0, 16) + " UTC";
}

interface SummaryData {
  weekRuns: number;
  weekRunsPrior: number;
  enginesReporting: number;
  emptyRateThisWeek: number;
  cronMissed: string[];
  pendingSchema: number;
  pendingDrafts: number;
  pendingNvi: number;
  unreadAlerts: number;
  oldestUnreadAlertHours: number | null;
  qaCounts7d: { green: number; yellow: number; red: number };
  qaRedTopReasons: string[];
}

async function gatherData(env: Env): Promise<SummaryData> {
  const now = Math.floor(Date.now() / 1000);
  const weekAgo = now - 7 * SECONDS_PER_DAY;
  const twoWeeksAgo = now - 14 * SECONDS_PER_DAY;

  // Citation activity this week vs prior week
  const weekRunsRow = await env.DB.prepare(
    "SELECT COUNT(*) as n FROM citation_runs WHERE run_at > ?"
  ).bind(weekAgo).first<{ n: number }>();

  const priorRunsRow = await env.DB.prepare(
    "SELECT COUNT(*) as n FROM citation_runs WHERE run_at > ? AND run_at <= ?"
  ).bind(twoWeeksAgo, weekAgo).first<{ n: number }>();

  // Engines reporting in last 7d
  const enginesRow = await env.DB.prepare(
    "SELECT COUNT(DISTINCT engine) as n FROM citation_runs WHERE run_at > ?"
  ).bind(weekAgo).first<{ n: number }>();

  // Empty rate this week
  const emptyRow = await env.DB.prepare(
    `SELECT COUNT(*) as total, SUM(CASE WHEN length(response_text) = 0 THEN 1 ELSE 0 END) as empty
     FROM citation_runs WHERE run_at > ?`
  ).bind(weekAgo).first<{ total: number; empty: number }>();
  const emptyRate = emptyRow && emptyRow.total > 0 ? (emptyRow.empty / emptyRow.total) : 0;

  // Cron tasks that missed last expected run
  const SECONDS_PER_DAY_LOCAL = 86400;
  const CRON_EXPECTED: Record<string, number> = {
    daily_tasks: SECONDS_PER_DAY_LOCAL,
    auth_cleanup: SECONDS_PER_DAY_LOCAL,
    inbox_morning_summary: SECONDS_PER_DAY_LOCAL,
    weekly_scans: 7 * SECONDS_PER_DAY_LOCAL,
    weekly_backup: 7 * SECONDS_PER_DAY_LOCAL,
  };
  const cronMissed: string[] = [];
  for (const [taskName, cadence] of Object.entries(CRON_EXPECTED)) {
    const row = await env.DB.prepare(
      "SELECT MAX(ran_at) as last FROM cron_runs WHERE task_name = ?"
    ).bind(taskName).first<{ last: number | null }>();
    if (row?.last && (now - row.last) > 1.5 * cadence) {
      cronMissed.push(taskName);
    }
  }

  // Pending approvals
  const pendingSchema = (await env.DB.prepare(
    "SELECT COUNT(*) as n FROM schema_injections WHERE status = 'pending'"
  ).first<{ n: number }>())?.n ?? 0;
  const pendingDrafts = (await env.DB.prepare(
    "SELECT COUNT(*) as n FROM content_drafts WHERE status = 'draft'"
  ).first<{ n: number }>())?.n ?? 0;
  const pendingNvi = (await env.DB.prepare(
    "SELECT COUNT(*) as n FROM nvi_reports WHERE status IN ('draft','rendered')"
  ).first<{ n: number }>())?.n ?? 0;

  // Unread alerts
  const unreadRow = await env.DB.prepare(
    "SELECT COUNT(*) as n, MIN(created_at) as oldest FROM admin_alerts WHERE read_at IS NULL"
  ).first<{ n: number; oldest: number | null }>();
  const unreadAlerts = unreadRow?.n ?? 0;
  const oldestUnreadAlertHours = unreadRow?.oldest
    ? Math.floor((now - unreadRow.oldest) / 3600)
    : null;

  // QA verdict counts last 7d
  const qa7dRows = (await env.DB.prepare(
    "SELECT verdict, COUNT(*) as n FROM qa_audits WHERE created_at > ? GROUP BY verdict"
  ).bind(weekAgo).all<{ verdict: string; n: number }>()).results;
  const qaCounts7d = { green: 0, yellow: 0, red: 0 };
  for (const r of qa7dRows) (qaCounts7d as Record<string, number>)[r.verdict] = r.n;

  // Top red QA reasons (last 7d, distinct reasoning, top 3)
  const qaRedRows = (await env.DB.prepare(
    `SELECT reasoning, COUNT(*) as n FROM qa_audits
     WHERE verdict = 'red' AND created_at > ?
     GROUP BY reasoning ORDER BY n DESC LIMIT 3`
  ).bind(weekAgo).all<{ reasoning: string; n: number }>()).results;
  const qaRedTopReasons = qaRedRows.map(r => `${r.reasoning} (x${r.n})`);

  return {
    weekRuns: weekRunsRow?.n ?? 0,
    weekRunsPrior: priorRunsRow?.n ?? 0,
    enginesReporting: enginesRow?.n ?? 0,
    emptyRateThisWeek: emptyRate,
    cronMissed,
    pendingSchema,
    pendingDrafts,
    pendingNvi,
    unreadAlerts,
    oldestUnreadAlertHours,
    qaCounts7d,
    qaRedTopReasons,
  };
}

function composeEmail(data: SummaryData): { subject: string; body: string } {
  // Top-line status: red if anything significant is broken; yellow if mild; green if clean
  let status: "green" | "yellow" | "red" = "green";
  const statusReasons: string[] = [];

  if (data.cronMissed.length > 0) {
    status = "red";
    statusReasons.push(`cron(s) missed: ${data.cronMissed.join(", ")}`);
  }
  if (data.qaCounts7d.red > 0) {
    if (status !== "red") status = "yellow";
    statusReasons.push(`${data.qaCounts7d.red} QA red verdict(s) this week`);
  }
  if (data.emptyRateThisWeek > 0.25) {
    status = "red";
    statusReasons.push(`engine empty rate at ${(data.emptyRateThisWeek * 100).toFixed(0)}%`);
  }
  if (data.unreadAlerts > 5) {
    if (status !== "red") status = "yellow";
    statusReasons.push(`${data.unreadAlerts} unread alerts`);
  }

  const statusLine = status === "green"
    ? "System: green. Nothing needs your attention this morning."
    : status === "yellow"
    ? `System: yellow. ${statusReasons.join("; ")}.`
    : `System: red. ${statusReasons.join("; ")}.`;

  const weekDelta = data.weekRunsPrior > 0
    ? ((data.weekRuns - data.weekRunsPrior) / data.weekRunsPrior * 100).toFixed(0)
    : null;

  // Items needing attention
  const attention: string[] = [];
  if (data.pendingSchema > 0) attention.push(`- ${data.pendingSchema} schema injection(s) awaiting approval at /admin/inject`);
  if (data.pendingDrafts > 0) attention.push(`- ${data.pendingDrafts} content draft(s) awaiting review at /admin/drafts`);
  if (data.pendingNvi > 0) attention.push(`- ${data.pendingNvi} NVI report(s) awaiting send at /admin/nvi-inbox`);
  if (data.unreadAlerts > 0) {
    const oldestNote = data.oldestUnreadAlertHours
      ? ` (oldest is ${data.oldestUnreadAlertHours}h old)`
      : "";
    attention.push(`- ${data.unreadAlerts} unread admin alert(s) at /admin/alerts${oldestNote}`);
  }
  const attentionBlock = attention.length === 0
    ? "Nothing in your queue."
    : attention.join("\n");

  const subject = status === "green"
    ? "NeverRanked weekly: all systems green"
    : status === "yellow"
    ? "NeverRanked weekly: yellow, review when convenient"
    : "NeverRanked weekly: red, needs your attention";

  const body = [
    `NeverRanked weekly summary`,
    `Week of ${formatTimestamp(Math.floor(Date.now() / 1000))}`,
    ``,
    statusLine,
    ``,
    `--- This week ---`,
    `Citation runs: ${data.weekRuns}${weekDelta !== null ? ` (${weekDelta.startsWith("-") ? "" : "+"}${weekDelta}% vs prior week)` : ""}`,
    `Engines reporting: ${data.enginesReporting} of 7`,
    `Engine empty rate: ${(data.emptyRateThisWeek * 100).toFixed(1)}%`,
    `QA audits (last 7d): ${data.qaCounts7d.green} green, ${data.qaCounts7d.yellow} yellow, ${data.qaCounts7d.red} red`,
    ``,
    `--- Cron heartbeat ---`,
    data.cronMissed.length === 0
      ? `All scheduled tasks running on cadence.`
      : `Missed cadence: ${data.cronMissed.join(", ")}. Investigate at /admin/health.`,
    ``,
    `--- Needs your attention ---`,
    attentionBlock,
    ``,
    data.qaRedTopReasons.length > 0
      ? `--- Top QA red verdicts this week ---\n${data.qaRedTopReasons.map(r => `- ${r}`).join("\n")}\n\n`
      : ``,
    `Full system health at https://app.neverranked.com/admin/health`,
    `QA audit log at https://app.neverranked.com/admin/qa`,
    ``,
    `-- The cron`,
  ].filter(Boolean).join("\n");

  return { subject, body };
}

/**
 * Send the weekly summary email. Wired into cron.ts for Monday 7am Pacific.
 * Uses sendEmailViaResend for QA preflight + safe send.
 */
export async function sendWeeklySummaryEmail(env: Env): Promise<{ sent: boolean; error?: string; subject?: string }> {
  try {
    const data = await gatherData(env);
    const { subject, body } = composeEmail(data);

    const { sendEmailViaResend } = await import("./qa-email-preflight");
    const result = await sendEmailViaResend(env, {
      to: RECIPIENT,
      subject,
      text: body,
      from: "NeverRanked <lance@neverranked.com>",
      artifact_ref: "weekly_summary",
    }, { blocking: true });

    if (!result.ok) {
      return { sent: false, error: result.error ?? `Resend returned ${result.status}` };
    }
    return { sent: true, subject };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}
