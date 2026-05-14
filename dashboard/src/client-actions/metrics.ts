/**
 * Per-action, per-client metric lines.
 *
 * Each action card on /actions/<slug> can show a concrete data line
 * pulled from production state ("you're missing from 11 of 17 tracked
 * Microsoft Copilot answers" beats "claim your Bing profile to lift
 * citations"). The metric is computed at render time.
 *
 * Returning null hides the metric line entirely (no card noise when
 * we don't have meaningful data yet for this client).
 */

import type { Env } from "../types";
import type { ActionType } from "./registry";

export async function getActionMetric(
  env: Env,
  clientSlug: string,
  actionType: ActionType,
): Promise<string | null> {
  switch (actionType) {
    case "faq_review":
      return faqReviewMetric(env, clientSlug);
    case "bing_for_business":
      return bingForBusinessMetric(env, clientSlug);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// FAQ review metric
// ---------------------------------------------------------------------------

async function faqReviewMetric(env: Env, clientSlug: string): Promise<string | null> {
  // Count proposed FAQs by source so the card can say "X gap-closers,
  // Y from cited Reddit threads, Z from competitor-pressure queries."
  const rows = (
    await env.DB.prepare(
      `SELECT source, COUNT(*) AS n FROM client_faqs
        WHERE client_slug = ? AND status = 'proposed' AND superseded_at IS NULL
        GROUP BY source`,
    ).bind(clientSlug).all<{ source: string; n: number }>()
  ).results;

  if (rows.length === 0) return null;

  const byKind: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    byKind[r.source] = r.n;
    total += r.n;
  }
  const parts: string[] = [];
  if (byKind.tracked_prompt_gap) {
    parts.push(`${byKind.tracked_prompt_gap} from tracked AI ${byKind.tracked_prompt_gap === 1 ? "query" : "queries"} where you weren't cited`);
  }
  if (byKind.tracked_prompt_defense) {
    parts.push(`${byKind.tracked_prompt_defense} from ${byKind.tracked_prompt_defense === 1 ? "a query" : "queries"} with competitor pressure`);
  }
  if (byKind.reddit_thread) {
    parts.push(`${byKind.reddit_thread} from cited Reddit ${byKind.reddit_thread === 1 ? "thread" : "threads"}`);
  }
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Bing for Business metric
// ---------------------------------------------------------------------------

async function bingForBusinessMetric(env: Env, clientSlug: string): Promise<string | null> {
  // Bing tracks Microsoft Copilot citations directly. ChatGPT (openai)
  // grounds through Bing for most queries. So gaps in either engine
  // are the upside if they claim a Bing profile.
  const since = Math.floor(Date.now() / 1000) - 90 * 86400;

  const totalRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
      WHERE ck.client_slug = ?
        AND ck.active = 1
        AND cr.engine IN ('bing', 'openai')
        AND cr.run_at >= ?`,
  ).bind(clientSlug, since).first<{ n: number }>();

  const gapRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
      WHERE ck.client_slug = ?
        AND ck.active = 1
        AND cr.engine IN ('bing', 'openai')
        AND cr.run_at >= ?
        AND cr.client_cited = 0`,
  ).bind(clientSlug, since).first<{ n: number }>();

  const total = totalRow?.n ?? 0;
  const gap = gapRow?.n ?? 0;
  if (total === 0) return null;
  if (gap === 0) {
    return `Cited in all ${total} tracked Microsoft Copilot and ChatGPT answers. Claim your profile to defend that position.`;
  }
  const pct = Math.round((gap / total) * 100);
  return `Currently missing from ${gap} of ${total} tracked Microsoft Copilot and ChatGPT answers (${pct}%)`;
}
