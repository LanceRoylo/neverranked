/**
 * QA audit: citation_sanity. Phase 1.5 Session 2.
 *
 * Samples 10% of last-24h citation_runs and asks GPT-4o-mini whether
 * each response looks plausible. Catches the failure mode where an
 * engine produces fluent-sounding but factually-wrong content
 * (hallucinated business names, dead URLs cited as real, off-topic
 * drift). Empty rows are already caught by Phase 1.5 cross-system and
 * Phase 4 engine_health_check; this audit catches the harder case of
 * non-empty-but-wrong responses.
 *
 * Cost: ~$0.001 per sample. At ~50 samples/day = ~$1.50/month.
 *
 * Runs daily as a sweep cron. Idempotent: skips citation_runs that
 * already have a citation_sanity audit.
 */

import type { Env } from "../types";
import { isControlEngine } from "./engine-layer";
import { recordAudit, type AuditResult } from "./qa-auditor";
import { gradeWithLLM } from "./qa-llm-grader";

interface SanityVerdict {
  plausible: boolean;
  on_topic: boolean;
  suspicious_claims: string[];
  reasoning: string;
}

const SYSTEM_PROMPT = `You are evaluating whether an AI engine's response to a search query looks plausible and on-topic.

Score it on three axes:
- plausible: are the claims, business names, and facts plausibly real?
- on_topic: does the response actually answer the query?
- suspicious_claims: list any specific claims that sound made-up, oddly specific, or contradictory

You don't need to verify facts against the web. Use common sense and pattern matching: if a response cites a business that doesn't sound like it could exist, that's suspicious. If a query asks about Hawaii and the answer is about Texas, that's off-topic. If a URL looks generic or unrelated, note it.

Return strict JSON matching the schema.`;

const SANITY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["plausible", "on_topic", "suspicious_claims", "reasoning"],
  properties: {
    plausible: { type: "boolean", description: "Do the claims in the response sound plausibly real?" },
    on_topic: { type: "boolean", description: "Does the response actually answer the query?" },
    suspicious_claims: { type: "array", items: { type: "string" }, description: "Specific things that look suspicious. Empty array if nothing." },
    reasoning: { type: "string", description: "One-sentence overall assessment." },
  },
};

/**
 * The control is never graded on whether it answered.
 *
 * Bing organic RETURNS RESULTS. It does not answer, and it is measured
 * precisely to show what keyword search does with a question. Asking a grader
 * "is this response plausible and on-topic" about it produces a red every time
 * and the red is correct: on 2026-09-29 all 15 red citation_sanity verdicts in
 * the prior week were bing, none were an AI surface, and the reasons were
 * "provides game links" and "does not address the query about hotels in
 * Hawaii". Those are the published Fact Bank finding, not a defect.
 *
 * The cost was not a wasted API call. `13 QA red verdict(s) this week` is what
 * turned the weekly summary yellow, so the health colour was being driven
 * entirely by the control behaving as designed. An alarm for expected
 * behaviour is noise, and noise buries the real signal.
 *
 * Keyed on isControlEngine() rather than a literal "bing" so this stays true
 * if the control ever changes. A second private copy of which surface is the
 * control is the bug this codebase keeps rediscovering.
 */
export async function auditOneCitationRun(
  env: Env,
  runId: number,
): Promise<AuditResult | null> {
  // Fetch the run + the keyword text
  const row = await env.DB.prepare(
    `SELECT cr.id, cr.engine, cr.response_text, cr.cited_urls, ck.keyword
     FROM citation_runs cr
     JOIN citation_keywords ck ON ck.id = cr.keyword_id
     WHERE cr.id = ?`
  ).bind(runId).first<{ id: number; engine: string; response_text: string; cited_urls: string; keyword: string }>();

  // See the note above: grading the control on "did it answer" is a red every
  // time, correctly, and means nothing. Guarded here as well as in the sweep so
  // a manual or future caller cannot reintroduce it.
  if (row && isControlEngine(row.engine)) {
    console.log(`[qa-citation-sanity] skipping ${row.engine} run #${runId}: the control returns results, it does not answer`);
    return null;
  }

  if (!row) return null;
  // Skip empty responses (caught by other audits)
  if (!row.response_text || row.response_text.trim().length < 50) return null;

  const llmResult = await gradeWithLLM<SanityVerdict>(env, {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `Query: "${row.keyword}"\nEngine: ${row.engine}\nCited URLs: ${row.cited_urls}\n\nResponse:\n---\n${row.response_text.slice(0, 3000)}\n---`,
    model: "gpt-4o-mini",
    responseSchema: SANITY_SCHEMA,
    maxTokens: 400,
  });

  if (!llmResult.ok || !llmResult.parsed) {
    return null; // skip on grader failure -- don't pollute the audit log
  }

  const v = llmResult.parsed;
  let verdict: AuditResult["verdict"];
  if (!v.plausible || !v.on_topic) verdict = "red";
  else if (v.suspicious_claims && v.suspicious_claims.length > 0) verdict = "yellow";
  else verdict = "green";

  const reason = [
    v.reasoning,
    v.suspicious_claims && v.suspicious_claims.length > 0 ? `suspicious: ${v.suspicious_claims.slice(0, 3).join("; ")}` : null,
  ].filter(Boolean).join(" | ");

  const result: AuditResult = {
    verdict,
    reasoning: reason.slice(0, 1500) || (verdict === "green" ? "Plausible response on-topic." : "Audit completed."),
    grader_model: "gpt-4o-mini",
    grader_score: v.plausible && v.on_topic ? 100 : v.plausible || v.on_topic ? 50 : 0,
  };

  await recordAudit(env, {
    category: "citation_sanity",
    artifact_type: "citation_run",
    artifact_id: row.id,
    artifact_ref: `${row.engine}/"${row.keyword.slice(0, 60)}"`,
  }, result);

  return result;
}

/**
 * Sweep cron: sample 10% of last-24h citation runs and audit them.
 * Stratified sampling: tries to grab 1-2 rows per engine so every
 * engine gets some judgment-grade coverage. Skips runs that already
 * have a citation_sanity audit.
 */
export async function sweepCitationSanityAudits(env: Env, samplesPerEngine = 2): Promise<{ audited: number; details: string[] }> {
  const dayAgo = Math.floor(Date.now() / 1000) - 86400;

  // Per-engine random sampling. SQLite's RANDOM() is fast enough at this volume.
  const rows = (await env.DB.prepare(
    `WITH ranked AS (
      SELECT cr.id, cr.engine,
             ROW_NUMBER() OVER (PARTITION BY cr.engine ORDER BY RANDOM()) as rn
      FROM citation_runs cr
      WHERE cr.run_at > ?
        AND length(cr.response_text) > 50
        AND NOT EXISTS (
          SELECT 1 FROM qa_audits qa
          WHERE qa.artifact_type = 'citation_run'
            AND qa.artifact_id = cr.id
            AND qa.category = 'citation_sanity'
        )
    )
    SELECT id, engine FROM ranked WHERE rn <= ?
    ORDER BY engine, id`
  ).bind(dayAgo, samplesPerEngine).all<{ id: number; engine: string }>()).results;

  // Drop the control before spending a grader call on it. Filtered here rather
  // than in the SQL so the one place that knows which surface is the control
  // stays engine-layer.ts.
  const gradable = rows.filter((r) => !isControlEngine(r.engine));
  const skipped = rows.length - gradable.length;

  const details: string[] = [];
  let audited = 0;
  if (skipped > 0) details.push(`skipped ${skipped} control run(s): the control returns results, it does not answer`);
  for (const r of gradable) {
    try {
      const result = await auditOneCitationRun(env, r.id);
      if (result) {
        audited++;
        details.push(`${r.engine} run #${r.id}: ${result.verdict}`);
      }
    } catch (e) {
      details.push(`run #${r.id}: error -- ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { audited, details };
}
