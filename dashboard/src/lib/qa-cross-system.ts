/**
 * QA audit: cross_system (rules-based, descriptive, NO external fetches).
 *
 * Rewritten 2026-05-11. Previous version fetched the marketing site
 * HTML from the Worker to compare claims against D1. That ran into a
 * Cloudflare same-account Worker→Pages routing quirk (522s) that
 * produced false positives. External uptime monitoring (BetterStack)
 * is the authoritative source for "is the public site reachable" --
 * the audit's job here is "is the production data healthy AND does
 * it support the claims we make publicly."
 *
 * New design:
 *   - Marketing claims are encoded as constants below. When copy
 *     changes, update the constants. Forcing an explicit decision is
 *     a feature, not a bug.
 *   - Audit runs D1 queries to verify the claim-supporting data
 *     exists and is healthy.
 *   - No HTTP fetches. Completes in <500ms.
 *   - Public-site uptime is BetterStack's job, not this audit's.
 */

import type { Env } from "../types";
import { recordAudit, type AuditResult } from "./qa-auditor";

// ---------------------------------------------------------------------------
// Marketing claims we make publicly. Single source of truth -- when
// the homepage/state-of-aeo/etc copy changes, update these constants.
// The audit verifies the production data backs up each claim.
// ---------------------------------------------------------------------------

const MARKETING_CLAIMS = {
  /** Homepage + footer + pricing copy all reference "7 engines tracked" including Gemma */
  engines_tracked: 7,
  /** Acceptable range for active client_slugs with citation_keywords (excludes 'neverranked' which is our own brand) */
  min_active_clients: 2,
  /** Citation data should never be staler than this. If it is, the cron is broken. */
  max_stale_hours: 48,
};

// ---------------------------------------------------------------------------
// Individual checks (all D1, no fetches)
// ---------------------------------------------------------------------------

interface CheckResult {
  verdict: "green" | "yellow" | "red";
  reasoning: string;
  ref: string;
}

async function checkEngineCoverage(env: Env): Promise<CheckResult> {
  const since = Math.floor(Date.now() / 1000) - 7 * 86400;
  const row = await env.DB.prepare(
    "SELECT COUNT(DISTINCT engine) as n FROM citation_runs WHERE run_at > ?"
  ).bind(since).first<{ n: number }>();
  const distinct = row?.n ?? 0;
  const claimed = MARKETING_CLAIMS.engines_tracked;
  if (distinct >= claimed) {
    return {
      verdict: "green",
      reasoning: `Marketing claims ${claimed} engines tracked; production produced rows for ${distinct} distinct engines in last 7d. Claim is supported.`,
      ref: "engine_coverage",
    };
  }
  // Google AIO legitimately doesn't render for every query, so 6 of 7 is acceptable
  if (distinct === claimed - 1) {
    return {
      verdict: "yellow",
      reasoning: `Marketing claims ${claimed} engines; production has ${distinct} in last 7d. Likely Google AIO didn't render (acceptable). Recheck tomorrow.`,
      ref: "engine_coverage",
    };
  }
  return {
    verdict: "red",
    reasoning: `Marketing claims ${claimed} engines tracked but only ${distinct} produced rows in last 7d. Claim and reality have diverged by ${claimed - distinct}.`,
    ref: "engine_coverage",
  };
}

async function checkClientCoverage(env: Env): Promise<CheckResult> {
  const row = await env.DB.prepare(
    "SELECT COUNT(DISTINCT client_slug) as n FROM citation_keywords WHERE active = 1 AND client_slug != 'neverranked'"
  ).first<{ n: number }>();
  const active = row?.n ?? 0;
  if (active >= MARKETING_CLAIMS.min_active_clients) {
    return {
      verdict: "green",
      reasoning: `${active} client(s) with active citation_keywords tracked (minimum claim: ${MARKETING_CLAIMS.min_active_clients}). Tracking footprint is healthy.`,
      ref: "client_coverage",
    };
  }
  if (active === MARKETING_CLAIMS.min_active_clients - 1) {
    return {
      verdict: "yellow",
      reasoning: `${active} client(s) tracked, one below the ${MARKETING_CLAIMS.min_active_clients}-client floor. If a client was just offboarded that's expected; otherwise investigate.`,
      ref: "client_coverage",
    };
  }
  return {
    verdict: "red",
    reasoning: `Only ${active} client(s) tracked, below the ${MARKETING_CLAIMS.min_active_clients}-client floor we claim publicly. Citation Tape coverage may be misrepresented.`,
    ref: "client_coverage",
  };
}

async function checkDataFreshness(env: Env): Promise<CheckResult> {
  const row = await env.DB.prepare(
    "SELECT MAX(run_at) as last_run FROM citation_runs"
  ).first<{ last_run: number }>();
  const lastRun = row?.last_run ?? 0;
  if (lastRun === 0) {
    return {
      verdict: "red",
      reasoning: "No citation_runs rows exist at all. Daily cron is not producing data.",
      ref: "data_freshness",
    };
  }
  const ageHours = (Math.floor(Date.now() / 1000) - lastRun) / 3600;
  if (ageHours <= 24) {
    return {
      verdict: "green",
      reasoning: `Most recent citation_runs row is ${ageHours.toFixed(1)}h old. Cron is fresh.`,
      ref: "data_freshness",
    };
  }
  if (ageHours <= MARKETING_CLAIMS.max_stale_hours) {
    return {
      verdict: "yellow",
      reasoning: `Most recent citation_runs row is ${ageHours.toFixed(1)}h old. Slightly stale -- cron may have missed a run.`,
      ref: "data_freshness",
    };
  }
  return {
    verdict: "red",
    reasoning: `Most recent citation_runs row is ${ageHours.toFixed(1)}h old (threshold: ${MARKETING_CLAIMS.max_stale_hours}h). Daily cron has likely stopped firing.`,
    ref: "data_freshness",
  };
}

async function checkPerEngineHealth(env: Env): Promise<CheckResult> {
  const since = Math.floor(Date.now() / 1000) - 24 * 3600;
  const rows = (await env.DB.prepare(
    `SELECT engine,
            COUNT(*) as runs,
            SUM(CASE WHEN length(response_text) = 0 THEN 1 ELSE 0 END) as empty
     FROM citation_runs
     WHERE run_at > ?
     GROUP BY engine`
  ).bind(since).all<{ engine: string; runs: number; empty: number }>()).results;

  if (rows.length === 0) {
    return {
      verdict: "red",
      reasoning: "No citation_runs in last 24h across any engine.",
      ref: "per_engine_health",
    };
  }
  const broken = rows.filter(r => r.runs > 0 && r.empty / r.runs > 0.5).map(r => r.engine);
  if (broken.length === 0) {
    return {
      verdict: "green",
      reasoning: `All ${rows.length} engines with runs in last 24h have <50% empty responses.`,
      ref: "per_engine_health",
    };
  }
  return {
    verdict: "red",
    reasoning: `Engine(s) with >50% empty responses in last 24h: ${broken.join(", ")}. Likely API key or model-name issue.`,
    ref: "per_engine_health",
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function runCrossSystemAudit(env: Env): Promise<AuditResult> {
  // All checks are D1-only and run in parallel. Total time: <500ms.
  const checks = await Promise.all([
    checkEngineCoverage(env),
    checkClientCoverage(env),
    checkDataFreshness(env),
    checkPerEngineHealth(env),
  ]);

  for (const c of checks) {
    await recordAudit(env, {
      category: "cross_system",
      artifact_type: "system",
      artifact_ref: c.ref,
    }, {
      verdict: c.verdict,
      reasoning: c.reasoning,
      grader_model: "rules",
      blocked: false,
    });
  }

  const verdicts = checks.map(c => c.verdict);
  const aggregate: AuditResult["verdict"] =
    verdicts.includes("red") ? "red"
    : verdicts.includes("yellow") ? "yellow"
    : "green";

  const reasons = checks.filter(c => c.verdict !== "green").map(c => c.reasoning);
  return {
    verdict: aggregate,
    reasoning: reasons.length ? reasons.join(" | ") : "All cross-system claims verified against production data.",
    grader_model: "rules",
  };
}
