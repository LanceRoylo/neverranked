/**
 * QA audit: content_voice. Phase 1.5 Session 2.
 *
 * Grades a content draft against the Hello Momentum brand voice. Two
 * passes:
 *
 *   1. Rules pass (fast, $0): checks for em dashes, banned words, AI
 *      tells, semicolons in marketing copy. Hard fails block immediately.
 *   2. LLM pass (cheap, ~$0.001/draft): GPT-4o-mini grades the draft
 *      on "does this sound like a human wrote it" plus brand voice
 *      fingerprint match. Returns score 0-100 and reasoning.
 *
 * Verdict mapping:
 *   - 80+ AND rules clean -> green (draft is on voice)
 *   - 60-79 OR rules yellow -> yellow (review recommended)
 *   - <60 OR rules red -> red (off voice, draft is flagged loudly)
 *
 * The grader is non-blocking by default. Lance reviews red verdicts
 * before publishing. Eventually (Phase 3 batch approval UI) the
 * verdict drives auto-approval flow: green drafts can ship without
 * Lance touching them; yellow surfaces in batch approval; red blocks.
 */

import type { Env } from "../types";
import { recordAudit, runRulesPipeline, type AuditResult, type RuleCheck } from "./qa-auditor";
import { gradeWithLLM } from "./qa-llm-grader";

const BANNED_WORDS = [
  "leverage", "unlock", "seamless", "seamlessly", "effortless", "effortlessly",
  "cutting-edge", "synergy", "synergies", "bandwidth",
  "circle back", "touch base", "moving forward", "at the end of the day",
  "hidden gem", "rare opportunity",
];

const AI_TELLS = [
  /^Welcome to /i,
  /^Nestled in /i,
  /Discover the /i,
  /a journey of /i,
  /in the heart of /i,
  /Look no further/i,
];

interface VoiceInput {
  text: string;
  isMarketing: boolean;
}

const RULES_VOICE: RuleCheck<VoiceInput>[] = [
  {
    name: "no_em_dashes",
    severity: "red",
    check: (input) => {
      if (/—/.test(input.text)) {
        const matches = input.text.match(/—/g) ?? [];
        return `found ${matches.length} em dash${matches.length === 1 ? "" : "es"}. Use double-hyphens (--) instead per HM voice rules.`;
      }
      return null;
    },
  },
  {
    name: "no_banned_words",
    severity: "yellow",
    check: (input) => {
      const lower = input.text.toLowerCase();
      // Skip meta-references (lines mentioning the words as banned)
      const isMeta = /\b(banned|don'?t use|avoid|voice rule)\b/i.test(lower);
      if (isMeta) return null;
      const hits: string[] = [];
      for (const word of BANNED_WORDS) {
        const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        if (re.test(lower)) hits.push(word);
      }
      if (hits.length > 0) return `contains banned word(s): ${hits.slice(0, 5).join(", ")}`;
      return null;
    },
  },
  {
    name: "no_ai_tells",
    severity: "yellow",
    check: (input) => {
      const hits: string[] = [];
      for (const tell of AI_TELLS) {
        if (tell.test(input.text)) hits.push(tell.source.slice(0, 40));
      }
      if (hits.length > 0) return `contains AI-tell phrases: ${hits.join("; ")}`;
      return null;
    },
  },
  {
    name: "no_semicolons_in_marketing",
    severity: "yellow",
    check: (input) => {
      if (!input.isMarketing) return null;
      // Strip code-like content and URLs
      const cleaned = input.text.replace(/`[^`]*`/g, "").replace(/https?:\/\/[^\s)]+/g, "");
      const matches = cleaned.match(/;/g) ?? [];
      if (matches.length > 0) return `${matches.length} semicolon${matches.length === 1 ? "" : "s"} in marketing copy`;
      return null;
    },
  },
];

interface LLMVerdict {
  score: number;
  on_voice: boolean;
  reasoning: string;
  violations: string[];
}

const LLM_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["score", "on_voice", "reasoning", "violations"],
  properties: {
    score: { type: "integer", minimum: 0, maximum: 100, description: "Overall brand voice score, 0-100. 80+ is on-voice." },
    on_voice: { type: "boolean", description: "Does the draft sound like a human founder wrote it (not an AI agency)." },
    reasoning: { type: "string", description: "One- or two-sentence explanation of the score." },
    violations: { type: "array", items: { type: "string" }, description: "Specific issues, if any." },
  },
};

const SYSTEM_PROMPT = `You are a senior brand strategist grading marketing content for a B2B SaaS company called NeverRanked.

The brand voice rules:
- Sounds like a thoughtful founder, not an AI agency
- No em dashes (use double-hyphens)
- No banned words: leverage, unlock, seamless, effortless, cutting-edge, synergy, bandwidth, circle back, touch base, moving forward, at the end of the day, hidden gem, rare opportunity
- No AI-tell phrases: "Welcome to...", "Nestled in...", "Discover the...", "in the heart of..."
- Specific over generic: every claim should pass the swap test (could a competitor say the same thing?)
- Confessional over promotional: admits limits, names trade-offs, doesn't oversell
- Plain words over jargon
- Short sentences over long ones

Score 80+ = on voice. 60-79 = needs revision. Below 60 = off voice, do not publish.

Always return a strict JSON object matching the schema. Do not include code fences or commentary outside the JSON.`;

/**
 * Audit a content draft against brand voice rules + LLM grading.
 * Records the audit row in qa_audits. Returns the verdict.
 */
export async function auditContentVoice(
  env: Env,
  draftId: number,
  draftText: string,
  options: { isMarketing?: boolean; skipLLM?: boolean } = {},
): Promise<AuditResult> {
  const isMarketing = options.isMarketing ?? true;

  // Pass 1: rules
  const rulesResult = await runRulesPipeline<VoiceInput>(
    { text: draftText, isMarketing },
    RULES_VOICE,
  );

  // If rules already failed RED (em dash), stop here. No need to spend
  // LLM tokens on a draft that won't ship anyway.
  if (rulesResult.verdict === "red") {
    await recordAudit(env, {
      category: "content_voice",
      artifact_type: "content_draft",
      artifact_id: draftId,
    }, {
      ...rulesResult,
      blocked: false,  // Voice audits don't block ship; they advise
    });
    return rulesResult;
  }

  // Pass 2: LLM grade. Skip if caller opted out (e.g. during dry-run testing).
  if (options.skipLLM) {
    await recordAudit(env, {
      category: "content_voice",
      artifact_type: "content_draft",
      artifact_id: draftId,
    }, rulesResult);
    return rulesResult;
  }

  const llmResult = await gradeWithLLM<LLMVerdict>(env, {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `Grade this draft against the brand voice rules. Draft:\n\n---\n${draftText.slice(0, 4000)}\n---`,
    model: "gpt-4o-mini",
    responseSchema: LLM_RESPONSE_SCHEMA,
    maxTokens: 400,
  });

  if (!llmResult.ok || !llmResult.parsed) {
    // LLM failed -- fall back to rules-only verdict
    const fallback: AuditResult = {
      ...rulesResult,
      reasoning: `${rulesResult.reasoning} | LLM grader unavailable: ${llmResult.error ?? "unknown error"}`,
    };
    await recordAudit(env, {
      category: "content_voice",
      artifact_type: "content_draft",
      artifact_id: draftId,
    }, fallback);
    return fallback;
  }

  const llm = llmResult.parsed;
  // Merge LLM verdict with rules verdict. The harsher of the two wins.
  let mergedVerdict: AuditResult["verdict"];
  if (llm.score < 60) mergedVerdict = "red";
  else if (llm.score < 80 || rulesResult.verdict === "yellow") mergedVerdict = "yellow";
  else mergedVerdict = "green";

  const reasonParts: string[] = [`LLM score ${llm.score}/100`];
  if (llm.reasoning) reasonParts.push(llm.reasoning);
  if (llm.violations && llm.violations.length > 0) reasonParts.push(`violations: ${llm.violations.slice(0, 3).join("; ")}`);
  if (rulesResult.verdict !== "green") reasonParts.push(`rules: ${rulesResult.reasoning}`);

  const merged: AuditResult = {
    verdict: mergedVerdict,
    reasoning: reasonParts.join(" | ").slice(0, 1500),
    grader_model: `gpt-4o-mini+rules`,
    grader_score: llm.score,
  };

  await recordAudit(env, {
    category: "content_voice",
    artifact_type: "content_draft",
    artifact_id: draftId,
  }, merged);

  return merged;
}

/**
 * Sweep cron: find content_drafts that haven't been voice-audited yet
 * and grade them. Idempotent: skips drafts that already have a recent
 * content_voice audit.
 */
export async function sweepContentVoiceAudits(env: Env, limit = 20): Promise<{ audited: number; details: string[] }> {
  const since = Math.floor(Date.now() / 1000) - 7 * 86400;
  // content_drafts has body_markdown (the raw text source) and body_html
  // (the rendered output). We grade the markdown -- it's what Lance
  // actually wrote, before any rendering pass that might mask issues.
  const drafts = (await env.DB.prepare(
    `SELECT cd.id, cd.body_markdown
     FROM content_drafts cd
     WHERE cd.body_markdown IS NOT NULL
       AND cd.created_at > ?
       AND NOT EXISTS (
         SELECT 1 FROM qa_audits qa
         WHERE qa.artifact_type = 'content_draft'
           AND qa.artifact_id = cd.id
           AND qa.category = 'content_voice'
           AND qa.created_at > cd.updated_at
       )
     ORDER BY cd.updated_at DESC
     LIMIT ?`
  ).bind(since, limit).all<{ id: number; body_markdown: string }>()).results;

  const details: string[] = [];
  let audited = 0;
  for (const d of drafts) {
    try {
      const result = await auditContentVoice(env, d.id, d.body_markdown, { isMarketing: true });
      audited++;
      details.push(`draft #${d.id}: ${result.verdict} (${result.grader_score ?? "rules-only"})`);
    } catch (e) {
      details.push(`draft #${d.id}: error -- ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { audited, details };
}
