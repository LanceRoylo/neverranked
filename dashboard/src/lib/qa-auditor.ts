/**
 * QA Auditor framework.
 *
 * Phase 1.5 layer: an independent grader that audits the system's
 * outputs. Different LLM than production generation (production uses
 * Claude, audits use OpenAI) so the grader doesn't share blindspots
 * with the generator. Rules-based audits use no LLM at all.
 *
 * Six audit categories ship in iteration 1 (this file plus consumers):
 *   - schema_integrity   (rules-only, blocking on red)
 *   - email_preflight    (rules-only, blocking on red)
 *   - cross_system       (rules-only, descriptive)
 *
 * Iteration 2 will add:
 *   - content_voice      (rules pass 1 + GPT-4o-mini pass 2)
 *   - citation_sanity    (sampled, GPT-4o-mini)
 *   - nvi_drift          (rules + GPT-4o explainer)
 *
 * Every audit writes to qa_audits. Red verdicts on blocking audits
 * also write an admin_alert so Lance sees them in the standard inbox
 * + on the /admin/health page.
 *
 * Design principle: each audit function returns an AuditResult.
 * Callers decide whether to block based on the result. The framework
 * itself never makes blocking decisions -- that authority stays with
 * the calling business logic so behavior is explicit at every site.
 */

import type { Env } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditVerdict = "green" | "yellow" | "red";

export type AuditCategory =
  | "schema_integrity"
  | "content_voice"
  | "citation_sanity"
  | "nvi_drift"
  | "cross_system"
  | "email_preflight";

export type ArtifactType =
  | "schema_injection"
  | "content_draft"
  | "citation_run"
  | "nvi_report"
  | "system"
  | "email";

export interface AuditResult {
  verdict: AuditVerdict;
  reasoning: string;
  grader_model: string;
  grader_score?: number;
  blocked?: boolean;
}

export interface AuditContext {
  category: AuditCategory;
  artifact_type: ArtifactType;
  artifact_id?: number | null;
  artifact_ref?: string | null;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Write an audit row to qa_audits. Wrapped in try/catch -- a logging
 * failure must never break the caller. If the row write fails the audit
 * result still propagates back to the caller for blocking decisions.
 *
 * For red verdicts on blocking audits, also writes an admin_alert so
 * the failure surfaces in Lance's regular triage flow.
 */
export async function recordAudit(
  env: Env,
  ctx: AuditContext,
  result: AuditResult,
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO qa_audits (category, artifact_type, artifact_id, artifact_ref, verdict, grader_model, grader_score, reasoning, blocked)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      ctx.category,
      ctx.artifact_type,
      ctx.artifact_id ?? null,
      ctx.artifact_ref ?? null,
      result.verdict,
      result.grader_model,
      result.grader_score ?? null,
      result.reasoning.slice(0, 2000),
      result.blocked ? 1 : 0,
    ).run();
  } catch (e) {
    console.log(`[qa-auditor] recordAudit failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // For blocking red audits, also create an admin_alert so it shows
  // up in the normal triage flow. Yellow doesn't alert (descriptive
  // only), green doesn't alert (no signal). client_slug is NOT NULL in
  // admin_alerts, so we use '_system' for cross-client alerts (matches
  // the gsc_token_dead convention already in production).
  if (result.verdict === "red" && result.blocked) {
    try {
      const title = `QA audit blocked ${ctx.category.replace(/_/g, " ")}`;
      const detail = `${ctx.artifact_type}${ctx.artifact_id ? `#${ctx.artifact_id}` : ""}${ctx.artifact_ref ? ` (${ctx.artifact_ref})` : ""}: ${result.reasoning}`;
      await env.DB.prepare(
        "INSERT INTO admin_alerts (client_slug, type, title, detail, created_at) VALUES (?, ?, ?, ?, ?)"
      ).bind(
        "_system",
        "qa_blocked",
        title,
        detail.slice(0, 1500),
        Math.floor(Date.now() / 1000),
      ).run();
    } catch (e) {
      console.log(`[qa-auditor] admin_alert write failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Rules pipeline helper
// ---------------------------------------------------------------------------

export type RuleCheck<T> = {
  name: string;
  /** Returns null on pass, or a reason string on fail. */
  check: (input: T) => Promise<string | null> | string | null;
  /** Severity of failure: red blocks, yellow flags but allows. */
  severity: "red" | "yellow";
};

/**
 * Run a sequence of rules. Returns the first red failure (blocking),
 * or aggregates yellow warnings, or green if everything passes. Used
 * by schema_integrity, email_preflight, cross_system.
 *
 * Rules run sequentially and short-circuit on the first red failure
 * for performance (no point fetching a URL if JSON.parse already
 * failed). Yellow failures collect.
 */
export async function runRulesPipeline<T>(
  input: T,
  rules: RuleCheck<T>[],
): Promise<AuditResult> {
  const yellowReasons: string[] = [];

  for (const rule of rules) {
    let reason: string | null;
    try {
      reason = await rule.check(input);
    } catch (e) {
      reason = `rule "${rule.name}" threw: ${e instanceof Error ? e.message : String(e)}`;
    }
    if (reason === null) continue;
    if (rule.severity === "red") {
      return {
        verdict: "red",
        reasoning: `${rule.name}: ${reason}`,
        grader_model: "rules",
      };
    }
    yellowReasons.push(`${rule.name}: ${reason}`);
  }

  if (yellowReasons.length > 0) {
    return {
      verdict: "yellow",
      reasoning: yellowReasons.join("; ").slice(0, 1000),
      grader_model: "rules",
    };
  }
  return {
    verdict: "green",
    reasoning: "all rules passed",
    grader_model: "rules",
  };
}

// ---------------------------------------------------------------------------
// Read helpers (for /admin/qa page and health-page integration)
// ---------------------------------------------------------------------------

export async function recentVerdictCounts(
  env: Env,
  hoursBack = 24,
): Promise<{ green: number; yellow: number; red: number }> {
  const since = Math.floor(Date.now() / 1000) - hoursBack * 3600;
  const rows = (await env.DB.prepare(
    "SELECT verdict, COUNT(*) as n FROM qa_audits WHERE created_at > ? GROUP BY verdict"
  ).bind(since).all<{ verdict: AuditVerdict; n: number }>()).results;
  const counts = { green: 0, yellow: 0, red: 0 };
  for (const r of rows) counts[r.verdict] = r.n;
  return counts;
}
