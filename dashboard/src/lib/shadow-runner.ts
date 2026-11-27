/**
 * Runs and files December shadow readings. See lib/shadow-arms.ts for why.
 *
 * Writes ONLY to engine_shadow_runs. Reads citation_keywords, injection_configs
 * and customers (to know the question and the business name), and
 * engine_shadow_runs (for the nightly cap). Logs carry the tag [shadow] so a
 * shadow failure is never mistaken for a production engine failure, and none
 * goes to engine_failures, admin_alerts or cron_runs.
 */
import type { Env, InjectionConfig } from "../types";
import { planCitationRun, resolveBusinessName } from "../citations";
import {
  EXTRACTOR_MODEL,
  SHADOW_ARMS,
  SHADOW_NIGHTLY_CAP_USD,
  callArm,
  extractBusinesses,
  isShadowNight,
  shadowCost,
  shadowNight,
  textNamesBusiness,
  type ShadowArm,
} from "./shadow-arms";

/** How long after the 06:30 dispatch the shadow starts: 07:15 UTC. The
 *  production sweep dispatches at 06:00 and spreads its calls over 40 minutes,
 *  plus retries, so by 07:15 it has finished and the shadow's ChatGPT calls do
 *  not compete with production for the same per-minute token limit. */
export const SHADOW_START_DELAY_SECONDS = 45 * 60;
/** Spread the roster the same way production does, so the shadow's own
 *  ChatGPT calls stay under the per-minute limit. */
export const SHADOW_SPREAD_SECONDS = 2400;

export function shadowOffsetSeconds(keywordId: number): number {
  return SHADOW_START_DELAY_SECONDS + ((keywordId * 97) % SHADOW_SPREAD_SECONDS);
}

export function shadowEnabled(env: Env): boolean {
  return env.SHADOW_RUNS_ENABLED === "1";
}

/** Called from the 06:30 trigger. One ShadowKeywordWorkflow per active keyword. */
export async function dispatchShadowRuns(env: Env, scheduledAt: Date): Promise<{ dispatched: number; skipped?: string }> {
  if (!shadowEnabled(env)) return { dispatched: 0, skipped: "SHADOW_RUNS_ENABLED is not 1" };
  if (!isShadowNight(scheduledAt)) return { dispatched: 0, skipped: "not a shadow night" };
  const night = shadowNight(scheduledAt);
  const plan = await planCitationRun(env);
  let dispatched = 0;
  for (const item of plan.items) {
    try {
      await env.SHADOW_KEYWORD_WORKFLOW.create({
        id: `shadow-${night}-${item.keywordId}`,
        params: { clientSlug: item.clientSlug, keywordId: item.keywordId, night },
      });
      dispatched++;
    } catch (e) {
      console.log(`[shadow] dispatch failed for keyword ${item.keywordId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`[shadow] ${night}: dispatched ${dispatched}/${plan.items.length}`);
  return { dispatched };
}

export async function spentTonight(env: Env, night: string): Promise<number> {
  const r = await env.DB.prepare(
    "SELECT COALESCE(SUM(cost_usd), 0) AS usd FROM engine_shadow_runs WHERE night = ?",
  ).bind(night).first<{ usd: number }>();
  return r?.usd ?? 0;
}

export interface KeywordContext {
  question: string;
  businessName: string | null;
}

export async function loadKeywordContext(env: Env, clientSlug: string, keywordId: number): Promise<KeywordContext | null> {
  const kw = await env.DB.prepare(
    "SELECT keyword FROM citation_keywords WHERE id = ? AND client_slug = ? AND active = 1",
  ).bind(keywordId, clientSlug).first<{ keyword: string }>();
  if (!kw) return null;
  const config = await env.DB.prepare(
    "SELECT * FROM injection_configs WHERE client_slug = ?",
  ).bind(clientSlug).first<InjectionConfig>();
  return { question: kw.keyword, businessName: await resolveBusinessName(env, clientSlug, config) };
}

/** One arm for one keyword, filed. Idempotent on (night, keyword, arm). */
export async function runShadowArm(
  env: Env,
  a: ShadowArm,
  ctx: KeywordContext,
  clientSlug: string,
  keywordId: number,
  night: string,
): Promise<"written" | "exists"> {
  const existing = await env.DB.prepare(
    "SELECT 1 AS x FROM engine_shadow_runs WHERE night = ? AND keyword_id = ? AND arm = ?",
  ).bind(night, keywordId, a.arm).first<{ x: number }>();
  if (existing) return "exists";

  const r = await callArm(a, ctx.question, env);
  let entities = r.entities;
  let extractorModel: string | null = null;
  let extractIn = 0;
  let extractOut = 0;
  if (!r.failure && a.memory) {
    const ex = await extractBusinesses(r.text, env.ANTHROPIC_API_KEY);
    if (ex) {
      entities = ex.names.map((name) => ({ name, url: null }));
      extractorModel = EXTRACTOR_MODEL;
      extractIn = ex.inputTokens;
      extractOut = ex.outputTokens;
    } else {
      console.log(`[shadow] extraction failed for ${a.arm} keyword ${keywordId}`);
    }
  }
  if (r.failure) console.log(`[shadow] ${a.arm} failed for keyword ${keywordId}: ${r.failure}`);

  // A call that did not complete is not charged the per-call fee. Found in the
  // 2026-11-09 smoke test: a 402 was costed at Gemini's grounding fee.
  const cost = r.failure
    ? 0
    : shadowCost(a.model, r.inputTokens, r.outputTokens) + (extractorModel ? shadowCost(EXTRACTOR_MODEL, extractIn, extractOut) : 0);
  await env.DB.prepare(
    `INSERT OR IGNORE INTO engine_shadow_runs
       (night, client_slug, keyword_id, arm, engine, model, instruction, response_text, cited_urls, entities_json,
        extractor_model, client_named, entity_count, input_tokens, output_tokens, cost_usd, failure, run_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    night, clientSlug, keywordId, a.arm, a.engine, a.model, a.instruction,
    r.text, JSON.stringify(r.urls), JSON.stringify(entities),
    extractorModel,
    r.failure ? null : (textNamesBusiness(r.text, ctx.businessName) ? 1 : 0),
    entities.length,
    r.inputTokens + extractIn, r.outputTokens + extractOut,
    Math.round(cost * 1e6) / 1e6,
    r.failure ?? null,
    Math.floor(Date.now() / 1000),
  ).run();
  return "written";
}

export { SHADOW_ARMS, SHADOW_NIGHTLY_CAP_USD };
