/**
 * One-shot internal validation report for the Gemini grounding-redirect
 * resolver shipped 2026-05-01. Fires once on/after 2026-05-12, sends an
 * email summarizing whether Gemini was actually citing reddit threads
 * we previously couldn't see, then permanently no-ops via an
 * automation_log flag.
 *
 * Lives in the daily cron path. Microsecond no-op when the date hasn't
 * arrived OR the report was already sent. Wrapped in try/catch by the
 * caller so a Resend hiccup never breaks the daily run.
 *
 * After 2026-05-12 fires, this file can be deleted in a follow-up
 * cleanup PR -- it's a one-shot.
 */

import type { Env } from "./types";

// 2026-05-12 07:00 UTC = 9pm Pacific/Honolulu 2026-05-11. The first
// daily cron fires at 06:00 UTC -- so this triggers on the morning of
// May 12 UTC. ~10 days after the resolver shipped on 2026-05-01.
const REPORT_TS = 1778605200;
const SHIP_TS = 1746057600; // 2026-05-01 00:00 UTC -- when resolver shipped
const FLAG_KIND = "gemini_coverage_report";

interface CoverageStats {
  geminiRunsScanned: number;
  geminiRedditCitations: number;
  geminiSubreddits: number;
  amplifyClientsWithThreads: number;
  amplifyClientCount: number;
}

async function gatherStats(env: Env): Promise<CoverageStats> {
  const since = SHIP_TS;

  const runsRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM citation_runs WHERE engine = 'gemini' AND run_at >= ?`,
  ).bind(since).first<{ n: number }>();

  const redditRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n, COUNT(DISTINCT subreddit) AS subs
       FROM reddit_citations WHERE engine = 'gemini' AND run_at >= ?`,
  ).bind(since).first<{ n: number; subs: number }>();

  // Amplify clients with at least one reddit_citations row in the
  // window. Joined via domains.plan since plan lives at domain level.
  const amplifyHits = await env.DB.prepare(
    `SELECT COUNT(DISTINCT rc.client_slug) AS n
       FROM reddit_citations rc
       JOIN domains d ON d.client_slug = rc.client_slug
       WHERE d.plan = 'amplify' AND d.active = 1 AND rc.run_at >= ?`,
  ).bind(since).first<{ n: number }>();

  const amplifyTotal = await env.DB.prepare(
    `SELECT COUNT(DISTINCT client_slug) AS n FROM domains WHERE plan = 'amplify' AND active = 1`,
  ).first<{ n: number }>();

  return {
    geminiRunsScanned: runsRow?.n ?? 0,
    geminiRedditCitations: redditRow?.n ?? 0,
    geminiSubreddits: redditRow?.subs ?? 0,
    amplifyClientsWithThreads: amplifyHits?.n ?? 0,
    amplifyClientCount: amplifyTotal?.n ?? 0,
  };
}

export function formatReport(stats: CoverageStats, since: number): { subject: string; text: string } {
  const sinceDate = new Date(since * 1000).toISOString().slice(0, 10);
  const verdict = stats.geminiRedditCitations > 0
    ? `VERDICT: Resolver is surfacing real reddit citations from Gemini. Marketing copy claim holds. Worth scheduling weekly Reddit-coverage monitoring as a follow-up.`
    : `VERDICT: Zero reddit citations from Gemini in the window. The resolver works (verified at ship), Gemini just isn't citing reddit for the keywords we run. Soften homepage Reddit claim to "category-level true, not yet measured on our data" or revisit keyword set.`;

  const text = `Gemini Reddit-coverage 10-day check
====================================

Since the resolver shipped on ${sinceDate}:

  Gemini citation_runs scanned:        ${stats.geminiRunsScanned}
  Reddit citations from Gemini:        ${stats.geminiRedditCitations}
  Distinct subreddits surfaced:        ${stats.geminiSubreddits}
  Amplify clients with reddit data:    ${stats.amplifyClientsWithThreads} of ${stats.amplifyClientCount}

${verdict}

This is a one-shot internal report -- the file gemini-coverage-report.ts
can be deleted in a cleanup PR now that it has fired.
`;
  return { subject: `[NeverRanked] Gemini Reddit-coverage 10-day check`, text };
}

async function sendEmail(env: Env, subject: string, text: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log("[gemini-coverage] no RESEND_API_KEY, dev-mode log only");
    console.log(text);
    return true;
  }
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "NeverRanked <reports@neverranked.com>",
      to: [env.ADMIN_EMAIL],
      subject,
      text,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    console.log(`[gemini-coverage] email failed: ${resp.status} ${err.slice(0, 300)}`);
    return false;
  }
  return true;
}

/**
 * Daily cron entry. No-op until the trigger date arrives, then sends
 * the report once and never again.
 */
export async function maybeReportGeminiCoverage(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  if (now < REPORT_TS) return;

  const already = await env.DB.prepare(
    `SELECT id FROM automation_log WHERE kind = ? LIMIT 1`,
  ).bind(FLAG_KIND).first<{ id: number }>();
  if (already) return;

  const stats = await gatherStats(env);
  const { subject, text } = formatReport(stats, SHIP_TS);
  const sent = await sendEmail(env, subject, text);

  // Log either way -- if we don't, we'll re-attempt forever on every
  // daily cron and spam Resend on a persistent failure. Mark sent=0 in
  // detail so we can see in the log if it failed; manual re-send is
  // a one-line DELETE to clear the flag.
  await env.DB.prepare(
    `INSERT INTO automation_log (kind, target_type, target_id, target_slug, reason, detail, created_at)
       VALUES (?, 'system', NULL, NULL, ?, ?, ?)`,
  ).bind(
    FLAG_KIND,
    sent ? "Gemini coverage report sent" : "Gemini coverage report attempted, email failed",
    JSON.stringify({ ...stats, sent }),
    now,
  ).run();
}

/**
 * Admin dry-run: returns what the email WOULD say right now, without
 * sending and without marking the flag. Safe to call repeatedly.
 */
export async function previewGeminiCoverage(env: Env): Promise<{ subject: string; text: string; stats: CoverageStats }> {
  const stats = await gatherStats(env);
  const { subject, text } = formatReport(stats, SHIP_TS);
  return { subject, text, stats };
}
