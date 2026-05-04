/**
 * NVI monthly report runner.
 *
 * For one client, for one reporting period:
 *   1. Run citation queries across all wired engines (reuses
 *      runWeeklyCitations from src/citations.ts -- same code path
 *      that powers the weekly cron, just scoped to one slug)
 *   2. Stamp the resulting citation_runs rows with nvi_report_id
 *   3. Compute the AI Presence Score
 *   4. Draft the insight + action via Claude
 *   5. INSERT nvi_reports row with status='pending'
 *   6. Return the report id so admin can preview / approve
 *
 * Does NOT render the PDF or send the email -- those happen on
 * approval (admin inbox flow). Keeps human-in-the-loop intact:
 * Lance reviews the insight + action before any customer sees a
 * deliverable.
 *
 * v1 deferral: Google AI Overviews queries are not included until
 * the DataForSEO integration ships in Phase 0. The runner uses
 * whatever engines runWeeklyCitations already supports (OpenAI,
 * Perplexity, Gemini, Claude-training). Reports labeled accordingly.
 */
import type { Env } from "../types";
import { runWeeklyCitations } from "../citations";
import { computeAiPresenceScore } from "./score";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const INSIGHT_MODEL = "claude-haiku-4-5";

export interface RunnerResult {
  ok: boolean;
  reportId?: number;
  reason?: string;
  score?: number;
}

export async function runMonthlyNviReport(
  env: Env,
  clientSlug: string,
  reportingPeriod: string, // 'YYYY-MM'
): Promise<RunnerResult> {
  // Look up subscription to fetch tier (lite vs full)
  const sub = await env.DB.prepare(
    "SELECT tier FROM nvi_subscriptions WHERE client_slug = ? AND active = 1"
  ).bind(clientSlug).first<{ tier: string }>();
  if (!sub) return { ok: false, reason: `no active NVI subscription for ${clientSlug}` };
  const tier = sub.tier;

  // Don't double-run a month. If a report exists for this period,
  // refuse unless we add a force flag. Matches HTC events cron's
  // dedup discipline.
  const existing = await env.DB.prepare(
    "SELECT id FROM nvi_reports WHERE client_slug = ? AND reporting_period = ?"
  ).bind(clientSlug, reportingPeriod).first<{ id: number }>();
  if (existing) {
    return { ok: false, reason: `report ${existing.id} already exists for ${clientSlug} ${reportingPeriod}` };
  }

  // 1. Trigger citation run for this client. Reuses the existing
  //    weekly citation infrastructure (3 engines wired today,
  //    Google AI Overviews when Phase 0 ships).
  const runStartedAt = Math.floor(Date.now() / 1000);
  await runWeeklyCitations(env, clientSlug);
  const runFinishedAt = Math.floor(Date.now() / 1000);

  // 2. Stamp the resulting citation_runs rows with a placeholder
  //    nvi_report_id (we'll set it to the real id after INSERT).
  //    For now use 0 as a sentinel, then UPDATE after.
  //    Simpler: keep nvi_report_id NULL and rely on the time
  //    window (runStartedAt..runFinishedAt) to identify rows for
  //    this report. Less brittle than two-step UPDATE.

  // 3. Compute the AI Presence Score from this period's data.
  const presence = await computeAiPresenceScore(env, clientSlug, reportingPeriod);

  // 4. Draft the insight + action via Claude. Pass the score
  //    breakdown plus the most-cited and most-missed prompts.
  let insight = "";
  let action = "";
  if (env.ANTHROPIC_API_KEY) {
    const drafted = await draftInsightAndAction(env, clientSlug, reportingPeriod, presence);
    insight = drafted.insight;
    action = drafted.action;
  }
  if (!insight || !action) {
    insight = `AI Presence Score for ${reportingPeriod}: ${presence.score}/100 (Grade ${presence.grade}). Cited in ${presence.promptsCited} of ${presence.promptsTotal} tracked prompts across ${presence.enginesCited} engines.`;
    action = `Review the missed prompts list and identify one prompt where a content or schema improvement would close the gap. Most leverage tends to come from prompts where competitors are cited but you are not.`;
  }

  // 5. INSERT the report row as 'pending'. Status flips to
  //    'approved' when admin reviews, then 'sent' after delivery.
  const result = await env.DB.prepare(
    `INSERT INTO nvi_reports
       (client_slug, reporting_period, tier, ai_presence_score, prev_score,
        prompts_evaluated, citations_found, insight, action, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
  ).bind(
    clientSlug,
    reportingPeriod,
    tier,
    presence.score,
    presence.prevScore,
    presence.promptsTotal,
    presence.citedRows,
    insight,
    action,
  ).run();

  const reportId = Number(result.meta?.last_row_id ?? 0);

  // 6. Stamp the citation_runs rows we just generated with the
  //    report id, so future re-aggregation against this report
  //    only reads its rows. Window matches our runner timestamps.
  await env.DB.prepare(
    `UPDATE citation_runs
       SET nvi_report_id = ?
       WHERE run_at >= ? AND run_at <= ?
         AND keyword_id IN (SELECT id FROM citation_keywords WHERE client_slug = ?)`
  ).bind(reportId, runStartedAt, runFinishedAt + 30, clientSlug).run();

  // 7. Write an admin_inbox row so the report surfaces in cockpit
  //    + 7am founder email + sidebar pending count. The inbox
  //    item's action_url sends Lance directly to the preview page,
  //    no hunting required.
  try {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT INTO admin_inbox
         (kind, title, body, action_url, target_type, target_id, target_slug, urgency, status, created_at)
       VALUES ('nvi_report_review', ?, ?, ?, 'nvi_report', ?, ?, 'normal', 'pending', ?)`
    ).bind(
      `NVI report ready for review: ${clientSlug} (${reportingPeriod})`,
      `AI Presence Score ${presence.score}/100 (Grade ${presence.grade}). ${presence.promptsCited} of ${presence.promptsTotal} tracked prompts cited across ${presence.enginesCited} engines. Insight + action drafted by Claude Haiku, awaiting your review before customer delivery.`,
      `/admin/nvi/preview/${reportId}`,
      reportId,
      clientSlug,
      now,
    ).run();
  } catch (e) {
    console.log(`[nvi] inbox write failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
  }

  console.log(`[nvi] ${clientSlug} ${reportingPeriod} report #${reportId} ready for review (score=${presence.score})`);

  return { ok: true, reportId, score: presence.score };
}

interface DraftedNarrative {
  insight: string;
  action: string;
}

async function draftInsightAndAction(
  env: Env,
  clientSlug: string,
  period: string,
  presence: Awaited<ReturnType<typeof computeAiPresenceScore>>,
): Promise<DraftedNarrative> {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return { insight: "", action: "" };

  // Pull the cited / missed prompts for context
  const [year, month] = period.split("-").map(Number);
  const periodStart = Math.floor(Date.UTC(year, month - 1, 1) / 1000);
  const periodEnd = Math.floor(Date.UTC(year, month, 1) / 1000);

  const cited = (await env.DB.prepare(
    `SELECT ck.keyword
       FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
       WHERE ck.client_slug = ? AND cr.run_at >= ? AND cr.run_at < ?
         AND cr.client_cited = 1
       GROUP BY ck.keyword
       ORDER BY COUNT(*) DESC LIMIT 5`
  ).bind(clientSlug, periodStart, periodEnd).all<{ keyword: string }>()).results;

  const allKw = (await env.DB.prepare(
    `SELECT keyword FROM citation_keywords WHERE client_slug = ?`
  ).bind(clientSlug).all<{ keyword: string }>()).results;
  const citedSet = new Set(cited.map((r) => r.keyword));
  const missed = allKw.filter((r) => !citedSet.has(r.keyword)).slice(0, 5);

  // AEO Readiness for cross-context
  const scan = await env.DB.prepare(
    `SELECT sr.aeo_score
       FROM scan_results sr
       JOIN domains d ON d.id = sr.domain_id
       WHERE d.client_slug = ? AND d.is_competitor = 0 AND d.active = 1
       ORDER BY sr.scanned_at DESC LIMIT 1`
  ).bind(clientSlug).first<{ aeo_score: number }>();

  const system = "You write short, factual analyst notes for the Neverranked Visibility Index, a monthly report on a business's appearance in AI search engine responses. Output is read by the business owner. Voice: direct, specific, no hype, no formulaic filler. Never use em dashes, semicolons, or exclamation marks. Never say 'unlock' / 'leverage' / 'game-changer' / 'in today's world' / 'are you tired of'. Always cite specific numbers from the data. Never invent data not provided.";

  const user = `CLIENT_SLUG: ${clientSlug}
REPORTING_PERIOD: ${period}
AI_PRESENCE_SCORE: ${presence.score}/100 (Grade ${presence.grade})
PREV_MONTH_SCORE: ${presence.prevScore ?? "no previous report"}
PROMPTS_TRACKED: ${presence.promptsTotal}
PROMPTS_WHERE_CITED: ${presence.promptsCited}
ENGINES_CITED_IN: ${presence.enginesCited}
AEO_READINESS_FROM_LATEST_SCAN: ${scan?.aeo_score ?? "no scan available"}/100

PROMPTS_WHERE_CITED:
${cited.map((r) => "  - " + r.keyword).join("\n") || "  (none this month)"}

PROMPTS_NOT_CITED:
${missed.map((r) => "  - " + r.keyword).join("\n") || "  (none -- every prompt cited)"}

WRITE TWO PARAGRAPHS, returned as JSON with this exact shape:
{
  "insight": "2-4 sentences explaining what the score means in context. Reference at least one specific prompt by quoting it. If the AEO Readiness Score is meaningfully different from AI Presence (gap of 15+), explain the lag (Readiness leads Presence by 60-90 days). If both align, observe that. No fluff.",
  "action": "1-2 sentences naming ONE concrete next step the customer can take this month to move the score. Pick from: a specific schema deploy, a specific content gap to fill, a specific competitor query to target. Tie it to a specific prompt from the lists above when possible."
}

Output ONLY the JSON object. No surrounding markdown.`;

  try {
    const resp = await fetch(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: INSIGHT_MODEL,
        max_tokens: 800,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!resp.ok) return { insight: "", action: "" };
    const data = await resp.json() as { content?: { type: string; text: string }[] };
    const text = data.content?.find((b) => b.type === "text")?.text || "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { insight: "", action: "" };
    const parsed = JSON.parse(m[0]);
    return {
      insight: typeof parsed.insight === "string" ? parsed.insight.trim() : "",
      action: typeof parsed.action === "string" ? parsed.action.trim() : "",
    };
  } catch (e) {
    console.log(`[nvi-runner] insight draft failed: ${e}`);
    return { insight: "", action: "" };
  }
}
