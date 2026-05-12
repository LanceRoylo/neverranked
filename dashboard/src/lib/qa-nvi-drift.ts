/**
 * QA audit: nvi_drift. Phase 1.5 Session 2.
 *
 * Detects significant week-over-week or month-over-month changes in
 * a client's NVI (NeverRanked Visibility Index) score. The rules
 * pass catches the delta numerically; the LLM pass attempts to
 * attribute the change ("did something real happen, or is this a bug?").
 *
 * Triggered on insert of any nvi_report row. Run as a daily sweep
 * cron for safety (catches any reports we missed at insert time).
 *
 * Cost: uses GPT-4o (the higher-quality model, not mini) because
 * NVI drift is a high-stakes signal and false positives hurt trust.
 * ~$0.02/report. At weekly cadence × ~3 clients = ~$0.06/week.
 */

import type { Env } from "../types";
import { recordAudit, type AuditResult } from "./qa-auditor";
import { gradeWithLLM } from "./qa-llm-grader";

const WEEK_DELTA_THRESHOLD = 15;
const MONTH_DELTA_THRESHOLD = 25;

interface DriftVerdict {
  anomalous: boolean;
  likely_cause: string;
  needs_human_review: boolean;
  confidence: "low" | "medium" | "high";
}

const DRIFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["anomalous", "likely_cause", "needs_human_review", "confidence"],
  properties: {
    anomalous: { type: "boolean", description: "Is the score change anomalous given the prior trend?" },
    likely_cause: { type: "string", description: "Best guess at why the score changed: real shift, schema deploy effect, engine change, or bug." },
    needs_human_review: { type: "boolean", description: "Should Lance look at this report before sharing with the client?" },
    confidence: { type: "string", enum: ["low", "medium", "high"], description: "Your confidence in the cause attribution." },
  },
};

const SYSTEM_PROMPT = `You are evaluating a NeverRanked Visibility Index (NVI) score change for a tracked brand.

NVI scores range 0-100 and measure how visible a brand is to AI search engines. A typical week-over-week change is +/- 5 points. Anything larger usually has a specific cause:

- Real movement: customer shipped a major schema overhaul, ran a press campaign, or pivoted positioning
- Engine change: an AI engine (Perplexity, ChatGPT) changed how it retrieves, affecting all clients
- Scoring bug: data integrity issue in citation_runs or the scoring formula
- Sample-size noise: too few citation_runs for stable score this week

Given the prior 4-week score history and this week's score, decide:
1. Is this change anomalous (worth flagging) or expected?
2. What's the most likely cause?
3. Does it need Lance's review before the client sees the report?

Be conservative with anomalous=true. The cost of a false positive (alert fatigue) is high. Only flag when the change is materially outside the prior trend.

Return strict JSON.`;

interface NviContext {
  reportId: number;
  clientSlug: string;
  thisScore: number;
  period: string;
  history: { score: number; period: string; created_at: number }[];
}

async function getNviContext(env: Env, reportId: number): Promise<NviContext | null> {
  // nvi_reports schema: score column is ai_presence_score, period is
  // reporting_period, timestamp is generated_at. Alias them in the
  // SELECT so the rest of the code can stay readable.
  const report = await env.DB.prepare(
    "SELECT id, client_slug, ai_presence_score as score, reporting_period as period, generated_at as created_at FROM nvi_reports WHERE id = ?"
  ).bind(reportId).first<{ id: number; client_slug: string; score: number; period: string; created_at: number }>();

  if (!report) return null;

  const history = (await env.DB.prepare(
    `SELECT ai_presence_score as score, reporting_period as period, generated_at as created_at FROM nvi_reports
     WHERE client_slug = ? AND id != ? AND generated_at < ?
     ORDER BY generated_at DESC LIMIT 4`
  ).bind(report.client_slug, report.id, report.created_at).all<{ score: number; period: string; created_at: number }>()).results;

  return {
    reportId: report.id,
    clientSlug: report.client_slug,
    thisScore: report.score,
    period: report.period,
    history,
  };
}

/**
 * Audit a single NVI report for drift. Returns the verdict. Records
 * the audit row in qa_audits.
 */
export async function auditNviDrift(env: Env, reportId: number): Promise<AuditResult | null> {
  const ctx = await getNviContext(env, reportId);
  if (!ctx) return null;

  // Compute delta vs prior report
  const priorScore = ctx.history[0]?.score;
  if (priorScore === undefined) {
    // First report for this client -- no drift to detect
    const result: AuditResult = {
      verdict: "green",
      reasoning: `First NVI report for ${ctx.clientSlug}. No prior to compare against.`,
      grader_model: "rules",
    };
    await recordAudit(env, {
      category: "nvi_drift",
      artifact_type: "nvi_report",
      artifact_id: reportId,
      artifact_ref: ctx.clientSlug,
    }, result);
    return result;
  }

  const delta = ctx.thisScore - priorScore;
  const absDelta = Math.abs(delta);

  // Rules pass: small deltas are green. No need to spend LLM tokens.
  if (absDelta < WEEK_DELTA_THRESHOLD) {
    const result: AuditResult = {
      verdict: "green",
      reasoning: `${ctx.clientSlug} NVI ${ctx.thisScore} (${delta >= 0 ? "+" : ""}${delta} vs prior). Within normal range.`,
      grader_model: "rules",
    };
    await recordAudit(env, {
      category: "nvi_drift",
      artifact_type: "nvi_report",
      artifact_id: reportId,
      artifact_ref: ctx.clientSlug,
    }, result);
    return result;
  }

  // Significant delta -- ask the LLM to attribute it.
  const historySummary = ctx.history.map(h => `${h.period}: ${h.score}`).join(", ");
  const llmResult = await gradeWithLLM<DriftVerdict>(env, {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `Client: ${ctx.clientSlug}\nThis report (${ctx.period}): score ${ctx.thisScore}\nPrior 4 reports: ${historySummary}\nDelta from prior: ${delta >= 0 ? "+" : ""}${delta} points\n\nIs this anomalous, and what's the likely cause?`,
    model: "gpt-4o", // higher-quality model for high-stakes signal
    responseSchema: DRIFT_SCHEMA,
    maxTokens: 300,
  });

  if (!llmResult.ok || !llmResult.parsed) {
    // LLM failed -- fall back to rules-only "needs review"
    const result: AuditResult = {
      verdict: absDelta >= MONTH_DELTA_THRESHOLD ? "red" : "yellow",
      reasoning: `${ctx.clientSlug} NVI ${ctx.thisScore} (${delta >= 0 ? "+" : ""}${delta} vs prior, history: ${historySummary}). LLM grader unavailable; flagged for manual review on delta size.`,
      grader_model: "rules",
    };
    await recordAudit(env, {
      category: "nvi_drift",
      artifact_type: "nvi_report",
      artifact_id: reportId,
      artifact_ref: ctx.clientSlug,
    }, result);
    return result;
  }

  const v = llmResult.parsed;
  let verdict: AuditResult["verdict"];
  if (v.needs_human_review) verdict = "red";
  else if (v.anomalous) verdict = "yellow";
  else verdict = "green";

  const result: AuditResult = {
    verdict,
    reasoning: `${ctx.clientSlug} NVI ${ctx.thisScore} (${delta >= 0 ? "+" : ""}${delta} pts). ${v.likely_cause} (confidence: ${v.confidence})`.slice(0, 1500),
    grader_model: "gpt-4o",
    grader_score: v.needs_human_review ? 0 : v.anomalous ? 50 : 100,
  };

  await recordAudit(env, {
    category: "nvi_drift",
    artifact_type: "nvi_report",
    artifact_id: reportId,
    artifact_ref: ctx.clientSlug,
  }, result);

  return result;
}

/**
 * Sweep cron: audit any NVI reports created in the last 7 days that
 * haven't yet been drift-audited. Idempotent.
 */
export async function sweepNviDriftAudits(env: Env): Promise<{ audited: number; details: string[] }> {
  const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  const reports = (await env.DB.prepare(
    `SELECT r.id FROM nvi_reports r
     WHERE r.generated_at > ?
       AND NOT EXISTS (
         SELECT 1 FROM qa_audits qa
         WHERE qa.artifact_type = 'nvi_report'
           AND qa.artifact_id = r.id
           AND qa.category = 'nvi_drift'
       )
     ORDER BY r.generated_at DESC`
  ).bind(weekAgo).all<{ id: number }>()).results;

  const details: string[] = [];
  let audited = 0;
  for (const r of reports) {
    try {
      const result = await auditNviDrift(env, r.id);
      if (result) {
        audited++;
        details.push(`nvi #${r.id}: ${result.verdict}`);
      }
    } catch (e) {
      details.push(`nvi #${r.id}: error -- ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { audited, details };
}
