/**
 * Audit QA Agent — independent post-production review of every audit
 * deliverable before it ships to the customer.
 *
 * Distinct from the in-pipeline multi-pass validation:
 *   - Multi-pass runs DURING generation, per section, with per-section
 *     grounding data. It catches local issues but can't see the
 *     assembled artifact.
 *   - This agent runs AFTER assembly, on the full HTML, with the same
 *     scan data the generator had. It catches cross-section issues
 *     (number drift, contradictions), voice gestalt, promise overreach,
 *     and gives a single yes/no verdict with structured reasoning.
 *
 * The goal: Lance is out of the per-customer audit workflow. Audits
 * either pass QA and ship, or fail QA and trigger regeneration. After
 * 3 attempts, a stuck audit escalates to admin_inbox for Lance to
 * inspect — at that point we'd rather block delivery than ship slop.
 *
 * Cost target: ~$0.03 per QA run (Sonnet ~3-4k input + 1k output). On
 * a typical week of 5-10 audits this is well under $5/month.
 *
 * Phase 2 (separate session): wire weekly aggregation cron + auto-
 * tuning admin_inbox alerts when a category's failure rate spikes.
 */

import type { Env } from "./types";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const QA_MODEL = "claude-sonnet-4-5";
const ANTHROPIC_VERSION = "2023-06-01";
const QA_TIMEOUT_MS = 45_000;

export type QaCategory =
  | "consistency"      // numbers / claims agree across sections
  | "voice"            // matches HM brand voice, no AI tells
  | "specificity"      // names, numbers, paths -- not generic
  | "action_sanity"    // top action is the highest-leverage one
  | "promise_alignment"// no overpromises beyond NeverRanked's actual capabilities
  | "factual_recheck"  // independent factual review against source data
  | "gestalt";         // "would Lance be proud to send this"

export type QaSeverity = "ok" | "warn" | "block";

export interface QaPassResult {
  category: QaCategory;
  ok: boolean;
  severity: QaSeverity;
  reason: string;
  /** When ok=false, optional evidence quotes from the artifact so the
   * regen step can target the failure. */
  evidence?: string[];
  /** When ok=false, which section identifier (e.g. "exec_summary",
   * "competitive_commentary") needs regeneration. */
  section_to_regenerate?: string;
}

export interface QaRunResult {
  overall_verdict: "pass" | "warn" | "fail";
  blocking_failures: number;
  warnings: number;
  passes: QaPassResult[];
  duration_ms: number;
  remediation: { sections: string[]; reasons: string[] };
}

/**
 * The QA agent's system prompt. Embodies Lance's standards and the
 * NeverRanked / Hello Momentum voice. We list each category the agent
 * checks and the severity threshold for blocking vs warning.
 */
const SYSTEM_PROMPT = `You are an independent QA reviewer for NeverRanked AEO audit deliverables. Your job is to read the full HTML audit a customer is about to receive, and decide whether it ships. You are NOT the writer. You are the final reviewer Lance trusts so he doesn't have to read every audit himself.

You check seven categories. Return STRICT JSON, no prose:

{
  "overall_verdict": "pass" | "warn" | "fail",
  "passes": [
    {
      "category": "consistency" | "voice" | "specificity" | "action_sanity" | "promise_alignment" | "factual_recheck" | "gestalt",
      "ok": true | false,
      "severity": "ok" | "warn" | "block",
      "reason": "one specific sentence",
      "evidence": ["short quote from the audit"],
      "section_to_regenerate": "exec_summary" | "aeo_findings" | "schema_commentary" | "competitive_commentary" | null
    }
  ]
}

Categories:

1. **consistency** — Do the numbers and claims agree across sections? If exec summary cites entity score 32, does §01 also say 32? If exec summary names a "biggest gap" of Organization schema, does §03 reference it? Discrepancies between sections are blocking.

2. **voice** — Does the prose match the NeverRanked / Hello Momentum voice?
   BLOCK any of these: em dashes (—) in prose, semicolons in prose, "delve into", "navigate the", "in today's", "leverage" as a verb, "robust solution", "comprehensive solution", "cutting-edge", "seamlessly", "welcome to", "in conclusion", "to summarize", "feel free to", "hidden gem", "rare opportunity", "unlock the power", "game-changer", "in a world where", "moving the needle", three-adjective lists.
   WARN: passive voice in headlines, hedge-heavy openers, more than 2 adverbs per paragraph.

3. **specificity** — Does the prose name actual things? Specific URL paths from the schema deep dive, specific competitor names from the comparison, specific scores. Generic phrasing ("various improvements", "key insights", "your competitors") without naming what or who is BLOCKING in the executive summary, WARNING elsewhere.

4. **action_sanity** — Is the top recommended action genuinely the highest-leverage one given the entity audit data? Verify the top action's score_lift is the highest among the listed actions, and the action targets a signal that's actually missing or weak. If the top action is wrong (e.g. recommends Wikipedia when the customer already has a Wikipedia entry), BLOCK.

5. **promise_alignment** — Does the audit promise things NeverRanked actually does? In-scope: schema deployment, citation tracking across 6 engines, NVI reporting, AEO scanning, entity-graph audit, monthly reports, content drafts (Amplify only). Out-of-scope: building websites, paid media management, traditional PPC, crawl-based SEO ranking, link building, SEO audits unrelated to AEO, social media management. Out-of-scope claims are BLOCKING.

6. **factual_recheck** — Independent of the multi-pass factual check, re-read the prose claims against the underlying scan data. Does the AEO score in the prose match the gauge? Does the "you're missing X" claim actually correspond to a signal showing as ❌ in the entity grid? Discrepancies are blocking.

7. **gestalt** — "Would Lance Roylo be proud to send this to a paying customer?" Single subjective check. Strong audits feel like a smart consultant wrote them. Weak audits feel templated. WARN if templated, BLOCK if obviously generated. The bar: would a smart business owner reading this think the work is worth $750?

Verdict rules:
- "pass": zero blocks, ≤1 warning. Ship it.
- "warn": zero blocks, 2-3 warnings. Ship with a flag for Lance to review later.
- "fail": ≥1 block. Do NOT ship. The remediation_json field tells the system what to regenerate.

Be skeptical. The customer is paying $750. Default to scrutiny. But don't invent issues that aren't there. Each pass result must reference specific evidence from the artifact.`;

interface QaInputs {
  auditHtml: string;
  brand: string;
  domain: string;
  /** Compact JSON of the underlying scan data the audit was generated
   * from. The agent uses this to factual-recheck against. */
  scanData: Record<string, unknown>;
}

export async function runAuditQa(env: Env, inputs: QaInputs): Promise<QaRunResult> {
  const start = Date.now();
  if (!env.ANTHROPIC_API_KEY) {
    // Fail-soft: if the API key is missing, return a pass with a
    // warning. We'd rather ship than block on infrastructure issues.
    return {
      overall_verdict: "warn",
      blocking_failures: 0,
      warnings: 1,
      passes: [{
        category: "gestalt", ok: false, severity: "warn",
        reason: "QA agent skipped: ANTHROPIC_API_KEY not set",
      }],
      duration_ms: 0,
      remediation: { sections: [], reasons: [] },
    };
  }

  // Strip script tags from the artifact before showing it to the QA
  // model -- we want the agent to focus on prose, not on inline JS.
  const stripped = inputs.auditHtml
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // Cap input size at ~30k chars (~7.5k tokens). Real audits are well
  // under this. Truncation would only happen on edge cases.
  const auditExcerpt = stripped.length > 30_000 ? stripped.slice(0, 30_000) + "\n\n[truncated]" : stripped;

  const userMessage = `Audit to review:\n\nBrand: ${inputs.brand}\nDomain: ${inputs.domain}\n\nUnderlying scan data:\n\n${JSON.stringify(inputs.scanData, null, 2).slice(0, 8000)}\n\n---\n\nFull audit HTML (script + style tags stripped):\n\n${auditExcerpt}\n\n---\n\nReturn the JSON now.`;

  let raw = "";
  try {
    const resp = await fetch(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: QA_MODEL,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userMessage }],
        max_tokens: 2000,
        temperature: 0.0, // QA wants deterministic
      }),
      signal: AbortSignal.timeout(QA_TIMEOUT_MS),
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Anthropic ${resp.status}: ${body.slice(0, 300)}`);
    }
    const json = await resp.json() as { content: Array<{ type: string; text: string }> };
    raw = json.content[0]?.text ?? "";
  } catch (e) {
    console.log(`[audit-qa] call failed: ${e instanceof Error ? e.message : e}`);
    return {
      overall_verdict: "warn",
      blocking_failures: 0,
      warnings: 1,
      passes: [{
        category: "gestalt", ok: false, severity: "warn",
        reason: `QA agent call failed: ${e instanceof Error ? e.message : String(e)}`,
      }],
      duration_ms: Date.now() - start,
      remediation: { sections: [], reasons: [] },
    };
  }

  // Parse the JSON response. Tolerant of the model wrapping it in
  // markdown fences.
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fenceMatch ? fenceMatch[1] : raw;
  const start_idx = jsonText.indexOf("{");
  const end_idx = jsonText.lastIndexOf("}");
  let parsed: { overall_verdict?: string; passes?: QaPassResult[] };
  try {
    parsed = JSON.parse(jsonText.slice(start_idx, end_idx + 1));
  } catch (e) {
    console.log(`[audit-qa] parse failed, raw: ${raw.slice(0, 300)}`);
    return {
      overall_verdict: "warn",
      blocking_failures: 0,
      warnings: 1,
      passes: [{
        category: "gestalt", ok: false, severity: "warn",
        reason: "QA agent response could not be parsed as JSON",
      }],
      duration_ms: Date.now() - start,
      remediation: { sections: [], reasons: [] },
    };
  }

  const passes: QaPassResult[] = (parsed.passes || []).map((p) => ({
    category: p.category,
    ok: !!p.ok,
    severity: (p.severity || "ok") as QaSeverity,
    reason: String(p.reason || "").slice(0, 500),
    evidence: Array.isArray(p.evidence) ? p.evidence.slice(0, 3).map((e) => String(e).slice(0, 200)) : undefined,
    section_to_regenerate: p.section_to_regenerate || undefined,
  }));

  const blocks = passes.filter((p) => p.severity === "block" && !p.ok).length;
  const warns = passes.filter((p) => p.severity === "warn" && !p.ok).length;

  let overall: "pass" | "warn" | "fail";
  if (blocks > 0) overall = "fail";
  else if (warns >= 2) overall = "warn";
  else overall = (parsed.overall_verdict as any) || "pass";

  // Build the remediation list -- which sections to regenerate.
  const remediationSet = new Set<string>();
  const remediationReasons: string[] = [];
  for (const p of passes) {
    if (!p.ok && p.severity === "block" && p.section_to_regenerate) {
      remediationSet.add(p.section_to_regenerate);
      remediationReasons.push(`${p.section_to_regenerate}: ${p.reason}`);
    }
  }

  return {
    overall_verdict: overall,
    blocking_failures: blocks,
    warnings: warns,
    passes,
    duration_ms: Date.now() - start,
    remediation: { sections: Array.from(remediationSet), reasons: remediationReasons },
  };
}

/**
 * Persist a QA run to D1 for the learning loop. Single-row write,
 * fire-and-forget tolerant.
 */
export async function recordQaRun(
  env: Env,
  args: {
    auditToken: string;
    clientSlug: string | null;
    brand: string | null;
    artifactType: "audit" | "nvi-report" | "pitch";
    attemptNumber: number;
    result: QaRunResult;
    finalOutcome: "shipped" | "regenerated" | "escalated" | "pending";
    costCents?: number;
  },
): Promise<number | null> {
  try {
    const ins = await env.DB.prepare(
      `INSERT INTO audit_qa_runs (
        audit_token, client_slug, brand, artifact_type, attempt_number,
        scanned_at, passes_json, blocking_failures, warnings,
        overall_verdict, final_outcome, generation_cost_cents,
        qa_duration_ms, remediation_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      args.auditToken,
      args.clientSlug,
      args.brand,
      args.artifactType,
      args.attemptNumber,
      Math.floor(Date.now() / 1000),
      JSON.stringify(args.result.passes),
      args.result.blocking_failures,
      args.result.warnings,
      args.result.overall_verdict,
      args.finalOutcome,
      args.costCents ?? 3,  // ~$0.03/run rough estimate, refined later
      args.result.duration_ms,
      JSON.stringify(args.result.remediation),
    ).run();
    return Number(ins.meta?.last_row_id ?? 0) || null;
  } catch (e) {
    console.log(`[audit-qa] recordQaRun failed: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}
