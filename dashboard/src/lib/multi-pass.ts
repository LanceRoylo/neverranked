/**
 * Multi-pass validation for AI-generated artifacts.
 *
 * Every customer-facing AI artifact (FAQ, Article, NVI insight,
 * outreach email body, weekly brief) goes through three passes
 * before it ships:
 *
 *   Pass A — Factual grounding.
 *     A separate Haiku call audits the generated text against the
 *     source context and returns any unsupported claims as JSON.
 *     Catches hallucination -- the highest-trust-damage failure
 *     mode.
 *
 *   Pass B — Tone / voice.
 *     Existing checkHumanTone (banned patterns, em dashes, "leverage",
 *     "unlock", AI-tells). Cheap regex-style check, no LLM call.
 *
 *   Pass C — Quality gate.
 *     Caller-supplied. Examples: schema-grader for JSON-LD, length
 *     check for emails, JSON-parse for structured outputs. Pure
 *     function, no LLM call.
 *
 * On any failure: build a feedback prompt from the violations and
 * call the caller's regenerate() function. Loop up to maxAttempts
 * (default 3). Only escalate to admin_inbox after exhausting all
 * attempts so admins only see genuinely-stuck cases.
 *
 * Cost: each pass adds ~$0.001 (only Pass A is an LLM call). Worst
 * case 3 passes x 3 attempts = ~$0.02 per artifact. Negligible.
 *
 * Usage:
 *   const result = await multiPassValidate(env, {
 *     generated: faqsText,
 *     sourceContext: pageText,
 *     toneContext: "customer-publication",
 *     qualityGate: (text) => gradeSchema(text).meetsDeployThreshold,
 *     regenerate: (feedback) => callClaudeForFaqs(..., feedback),
 *     label: "faq-generator",
 *     clientSlug: "hawaii-theatre",
 *   });
 */
import type { Env } from "../types";
import { checkHumanTone, type ToneContext } from "../human-tone-guard";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const FACT_CHECK_MODEL = "claude-haiku-4-5";

export interface MultiPassRequest<TGenerated = string> {
  /** The AI-generated artifact, as a string (or pre-stringified). */
  generated: string;
  /** The source data the generator was supposed to ground in. If
   *  empty/null, Pass A is skipped (caller is asserting nothing
   *  to ground against, e.g. pure-template content). */
  sourceContext?: string | null;
  /** Tone-guard context. Determines which rules apply. */
  toneContext: ToneContext;
  /** Optional caller-supplied quality gate. Return {ok, reason}. */
  qualityGate?: (text: string) => { ok: boolean; reason?: string };
  /** Regenerator. Called with feedback string built from the failed
   *  passes. Should return the new artifact AS A STRING. */
  regenerate: (feedback: string) => Promise<string>;
  /** Max attempts before escalating to admin_inbox. Default 3. */
  maxAttempts?: number;
  /** Identifier for logs / inbox row. e.g. "faq-generator", "nvi-insight". */
  label: string;
  /** Client slug for the inbox row's target_slug. */
  clientSlug?: string;
  /** Skip Pass A (factual). Use for: deterministic outputs, internal-
   *  only content, or when sourceContext genuinely can't be assembled. */
  skipFactual?: boolean;
}

export interface PassFailure {
  pass: "A" | "B" | "C";
  reason: string;
  details?: string[];
}

export interface MultiPassResult {
  ok: boolean;
  text: string;
  attempts: number;
  /** Per-attempt history of which passes failed. Empty if first attempt
   *  passed cleanly. Useful for diagnostics in inbox row body. */
  attemptHistory: Array<{
    attempt: number;
    failures: PassFailure[];
  }>;
  /** Set when ok=false: id of admin_inbox row created so user can
   *  inspect the stuck case. */
  inboxId?: number;
}

export async function multiPassValidate(
  env: Env,
  req: MultiPassRequest,
): Promise<MultiPassResult> {
  const maxAttempts = req.maxAttempts ?? 3;
  const attemptHistory: MultiPassResult["attemptHistory"] = [];
  let currentText = req.generated;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const failures: PassFailure[] = [];

    // Pass A — Factual grounding (skip if no source or skipFactual)
    if (!req.skipFactual && req.sourceContext && req.sourceContext.length > 50 && env.ANTHROPIC_API_KEY) {
      const factCheck = await runFactualCheck(env, currentText, req.sourceContext);
      if (!factCheck.ok && factCheck.unsupportedClaims.length > 0) {
        failures.push({
          pass: "A",
          reason: `${factCheck.unsupportedClaims.length} unsupported claim${factCheck.unsupportedClaims.length === 1 ? "" : "s"}`,
          details: factCheck.unsupportedClaims,
        });
      }
    }

    // Pass B — Tone / voice
    const toneCheck = checkHumanTone(currentText, req.toneContext);
    if (!toneCheck.ok) {
      failures.push({
        pass: "B",
        reason: `${toneCheck.violations.length} tone violation${toneCheck.violations.length === 1 ? "" : "s"}`,
        details: toneCheck.violations.map(v => `"${v.match}" (${v.rule})`),
      });
    }

    // Pass C — Quality gate (caller-supplied)
    if (req.qualityGate) {
      const qualityCheck = req.qualityGate(currentText);
      if (!qualityCheck.ok) {
        failures.push({
          pass: "C",
          reason: qualityCheck.reason || "quality gate failed",
        });
      }
    }

    // All passes clean? Ship it.
    if (failures.length === 0) {
      return {
        ok: true,
        text: currentText,
        attempts: attempt,
        attemptHistory,
      };
    }

    attemptHistory.push({ attempt, failures });
    console.log(`[multi-pass] ${req.label} attempt ${attempt} failed: ${failures.map(f => `${f.pass}=${f.reason}`).join(", ")}`);

    // Last attempt? Don't regen, escalate.
    if (attempt === maxAttempts) break;

    // Build feedback prompt from this attempt's failures
    const feedback = buildFeedback(failures);
    try {
      currentText = await req.regenerate(feedback);
    } catch (e) {
      console.log(`[multi-pass] ${req.label} regenerate threw: ${e instanceof Error ? e.message : String(e)}`);
      break;
    }
  }

  // All attempts failed. Write admin_inbox row.
  let inboxId: number | undefined;
  try {
    const { addInboxItem } = await import("../admin-inbox");
    const body = buildInboxBody(req, attemptHistory, currentText);
    inboxId = await addInboxItem(env, {
      kind: "ai_validation_fail",
      title: `Multi-pass validation stuck after ${maxAttempts} attempts: ${req.label}${req.clientSlug ? ` (${req.clientSlug})` : ""}`,
      body,
      target_type: "ai-text",
      target_id: 0,
      target_slug: req.clientSlug,
      urgency: "high",
    });
  } catch (e) {
    console.log(`[multi-pass] ${req.label} inbox write failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  return {
    ok: false,
    text: currentText,
    attempts: maxAttempts,
    attemptHistory,
    inboxId,
  };
}

// ---------------------------------------------------------------------------
// Pass A: factual grounding
// ---------------------------------------------------------------------------

async function runFactualCheck(
  env: Env,
  generated: string,
  sourceContext: string,
): Promise<{ ok: boolean; unsupportedClaims: string[] }> {
  if (!env.ANTHROPIC_API_KEY) return { ok: true, unsupportedClaims: [] };

  // Cap source to keep cost bounded
  const source = sourceContext.length > 6000
    ? sourceContext.slice(0, 6000) + "\n[...truncated]"
    : sourceContext;
  const candidate = generated.length > 4000
    ? generated.slice(0, 4000) + "\n[...truncated]"
    : generated;

  const system = "You are a factual grounding judge. Given a SOURCE document and a CANDIDATE text purportedly derived from it, list every CLAIM in the candidate that is NOT directly supported by the source. Be strict: only count claims that introduce facts, numbers, or assertions absent from the source. Paraphrasing supported facts is fine. Reasonable inference (e.g. a year stated as '2026' implying it is the current era) is fine. Marketing puffery (e.g. 'we are great') in the candidate is also fine to flag if not in the source. Output ONLY valid JSON: {\"unsupported\":[\"claim 1\",\"claim 2\",...]}. Empty array means everything checks out.";

  const user = `SOURCE:
"""
${source}
"""

CANDIDATE:
"""
${candidate}
"""

Return JSON only.`;

  try {
    const resp = await fetch(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: FACT_CHECK_MODEL,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!resp.ok) return { ok: true, unsupportedClaims: [] }; // soft-fail open
    const data = await resp.json() as { content?: { type: string; text: string }[] };
    const text = data.content?.find(b => b.type === "text")?.text || "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { ok: true, unsupportedClaims: [] };
    const parsed = JSON.parse(m[0]) as { unsupported?: unknown };
    const unsupported = Array.isArray(parsed.unsupported)
      ? parsed.unsupported.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      : [];
    return { ok: unsupported.length === 0, unsupportedClaims: unsupported };
  } catch (e) {
    console.log(`[multi-pass] factual check threw: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: true, unsupportedClaims: [] }; // fail-open on infra errors
  }
}

// ---------------------------------------------------------------------------
// Feedback + inbox builders
// ---------------------------------------------------------------------------

function buildFeedback(failures: PassFailure[]): string {
  const lines: string[] = ["The previous attempt failed validation. Address these issues in the next attempt:"];
  for (const f of failures) {
    if (f.pass === "A") {
      lines.push(`- FACTUAL: ${f.reason}. Specifically:`);
      for (const d of f.details || []) lines.push(`    - "${d}"`);
      lines.push(`  Remove these claims or rewrite to use only facts from the source.`);
    }
    if (f.pass === "B") {
      lines.push(`- TONE: ${f.reason}. Avoid these patterns:`);
      for (const d of f.details || []) lines.push(`    - ${d}`);
    }
    if (f.pass === "C") {
      lines.push(`- QUALITY GATE: ${f.reason}`);
    }
  }
  return lines.join("\n");
}

function buildInboxBody(
  req: MultiPassRequest,
  history: MultiPassResult["attemptHistory"],
  finalText: string,
): string {
  const lines: string[] = [
    `**Generator:** \`${req.label}\``,
    req.clientSlug ? `**Client:** \`${req.clientSlug}\`` : "",
    `**Tone context:** \`${req.toneContext}\``,
    `**Attempts:** ${history.length}`,
    "",
    "## Per-attempt failures",
    "",
  ];
  for (const h of history) {
    lines.push(`### Attempt ${h.attempt}`);
    for (const f of h.failures) {
      lines.push(`- **Pass ${f.pass}** -- ${f.reason}`);
      if (f.details && f.details.length > 0) {
        for (const d of f.details.slice(0, 5)) lines.push(`    - ${d}`);
      }
    }
    lines.push("");
  }
  lines.push("## Final candidate text (NOT shipped)");
  lines.push("");
  lines.push("```");
  lines.push(finalText.slice(0, 2000));
  lines.push("```");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("All 3 regeneration attempts failed validation. The model is stuck on this content. Options:");
  lines.push("- Edit the source content / context and re-run");
  lines.push("- Loosen the validation criteria for this artifact type");
  lines.push("- Approve the final text manually if it's actually fine");
  return lines.filter(l => l !== undefined).join("\n");
}
