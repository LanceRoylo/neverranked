/**
 * Sentiment scoring for AI citation responses.
 *
 * For each citation_run where client_cited = 1, score how the AI
 * described the client: positive / neutral / negative, with a one-
 * sentence reason. Uses Claude Haiku 4.5 (cheap + fast) since sentiment
 * is a structurally simple judgment.
 *
 * Negative mentions write an admin_inbox row so Lance sees them
 * immediately in the cockpit + 7am email. Positive and neutral
 * mentions silently update the row.
 *
 * Pipeline integration:
 *   - citations.ts fires ctx.waitUntil(scoreAndUpdate(...)) after
 *     each insert where client_cited = 1
 *   - daily cron processes 100 unscored historical rows per pass via
 *     backfillUnscoredSentiment()
 *   - admin endpoint /admin/sentiment-backfill/<slug>?days=N for
 *     manual override
 */

import type { Env } from "./types";
import { addInboxItem } from "./admin-inbox";

const MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TEXT_CHARS = 4000;

export type Sentiment = "positive" | "neutral" | "negative";

export interface SentimentResult {
  sentiment: Sentiment;
  reason: string;
}

const SYSTEM = `You score how a paragraph of AI-generated text describes a specific business. Read the text and judge whether the description of the named business is positive, neutral, or negative.

Return STRICT JSON, no prose:
{
  "sentiment": "positive" | "neutral" | "negative",
  "reason": "one sentence, specific, names what about the description was positive/neutral/negative"
}

Rules:
- "positive" = the AI recommends, praises, or describes the business with clear advantages
- "negative" = the AI warns against, complains, lists drawbacks, or describes with clear disadvantages
- "neutral" = listed factually without judgment, or judgment is mixed/balanced
- A bare mention (just naming the business) without any descriptive context is "neutral"
- If the business is mentioned multiple times with different tones, judge the strongest/most decisive one
- Reason is one sentence, references the actual text, no fluff`;

async function callHaiku(env: Env, businessName: string, responseText: string): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
  const trimmed = responseText.slice(0, MAX_TEXT_CHARS);
  const userMessage = `Business: ${businessName}\n\n---\n\nText:\n\n${trimmed}\n\n---\n\nReturn the JSON now.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage }],
      max_tokens: 200,
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Anthropic ${resp.status}: ${txt.slice(0, 300)}`);
  }
  const json = await resp.json() as { content: { type: string; text: string }[] };
  return json.content[0]?.text ?? "";
}

function parseSentiment(raw: string): SentimentResult | null {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fence ? fence[1] : raw;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as { sentiment?: unknown; reason?: unknown };
    const s = typeof obj.sentiment === "string" ? obj.sentiment.toLowerCase().trim() : "";
    if (s !== "positive" && s !== "neutral" && s !== "negative") return null;
    const reason = typeof obj.reason === "string" ? obj.reason.trim().slice(0, 400) : "";
    return { sentiment: s as Sentiment, reason };
  } catch {
    return null;
  }
}

export async function scoreSentiment(
  env: Env,
  businessName: string,
  responseText: string,
): Promise<SentimentResult | null> {
  if (!businessName || !responseText || responseText.length < 30) return null;
  try {
    const raw = await callHaiku(env, businessName, responseText);
    return parseSentiment(raw);
  } catch (e) {
    console.log(`[sentiment] score failed: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

/**
 * Score one citation_run by id, persist the result, and (on negative)
 * write an admin_inbox row. Safe to call repeatedly -- second call
 * re-scores and overwrites. Used by both the inline waitUntil hook in
 * citations.ts and the daily cron backfill.
 */
export async function scoreAndUpdateRun(
  env: Env,
  runId: number,
): Promise<{ ok: boolean; sentiment?: Sentiment }> {
  const row = await env.DB.prepare(
    `SELECT cr.id, cr.engine, cr.response_text, cr.client_cited,
            cr.run_at, ck.client_slug, ck.keyword,
            d.domain
       FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
       LEFT JOIN domains d ON d.client_slug = ck.client_slug AND d.is_competitor = 0 AND d.active = 1
       WHERE cr.id = ?`,
  ).bind(runId).first<{
    id: number; engine: string; response_text: string; client_cited: number;
    run_at: number; client_slug: string; keyword: string; domain: string | null;
  }>();

  if (!row) return { ok: false };
  if (row.client_cited !== 1) return { ok: false };

  // Use the domain (or slug fallback) as the business name we ask the
  // model to score sentiment about. The slug is usually a clean shorthand
  // and the domain is what shows up in citations.
  const businessName = row.domain ?? row.client_slug;

  const result = await scoreSentiment(env, businessName, row.response_text);
  const now = Math.floor(Date.now() / 1000);

  if (!result) {
    // Mark scored-at so we don't retry forever, but leave sentiment NULL.
    await env.DB.prepare(
      `UPDATE citation_runs SET sentiment_scored_at = ? WHERE id = ?`,
    ).bind(now, runId).run();
    return { ok: false };
  }

  await env.DB.prepare(
    `UPDATE citation_runs SET sentiment = ?, sentiment_reason = ?, sentiment_scored_at = ? WHERE id = ?`,
  ).bind(result.sentiment, result.reason, now, runId).run();

  if (result.sentiment === "negative") {
    const engineLabel: Record<string, string> = {
      perplexity: "Perplexity", openai: "ChatGPT", gemini: "Gemini", anthropic: "Claude",
    };
    const engineName = engineLabel[row.engine] ?? row.engine;
    await addInboxItem(env, {
      kind: "negative_ai_mention",
      title: `Negative AI mention: ${businessName} in ${engineName}`,
      body: `**Engine:** ${engineName}
**Keyword:** ${row.keyword}
**Run date:** ${new Date(row.run_at * 1000).toISOString().slice(0, 10)}

**AI's reason:** ${result.reason}

**Full response text:**

${row.response_text.slice(0, 3500)}

---

Review the full citation in the dashboard. If the negative framing is fixable (a stale fact, missing context, an unaddressed customer complaint), update the source. If it's a competitor advantage we can't change, that's a strategy signal not a content fix.`,
      action_url: `/citations/${row.client_slug}`,
      target_type: "citation_run",
      target_id: runId,
      target_slug: row.client_slug,
      urgency: "normal",
    });
  }

  return { ok: true, sentiment: result.sentiment };
}

/**
 * Daily cron: process oldest 100 unscored client_cited=1 runs. With
 * ~700 runs/week per client and only ~5 clients, full backlog catches
 * up in days then becomes a no-op via the partial index.
 */
export async function backfillUnscoredSentiment(env: Env, batchSize = 100): Promise<number> {
  const rows = (await env.DB.prepare(
    `SELECT id FROM citation_runs
       WHERE sentiment_scored_at IS NULL AND client_cited = 1
       ORDER BY run_at DESC
       LIMIT ?`,
  ).bind(batchSize).all<{ id: number }>()).results;

  let scored = 0;
  for (const r of rows) {
    const res = await scoreAndUpdateRun(env, r.id);
    if (res.ok) scored++;
  }
  return scored;
}

/** Per-client manual backfill (admin-only override). */
export async function backfillSentimentForClient(
  env: Env,
  clientSlug: string,
  days = 90,
): Promise<{ scanned: number; scored: number }> {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const rows = (await env.DB.prepare(
    `SELECT cr.id FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
       WHERE ck.client_slug = ?
         AND cr.client_cited = 1
         AND cr.sentiment_scored_at IS NULL
         AND cr.run_at >= ?`,
  ).bind(clientSlug, since).all<{ id: number }>()).results;

  let scored = 0;
  for (const r of rows) {
    const res = await scoreAndUpdateRun(env, r.id);
    if (res.ok) scored++;
  }
  return { scanned: rows.length, scored };
}

// ---------- Aggregation for dashboard surface ----------

export interface SentimentRollup {
  total: number;
  positive: number;
  neutral: number;
  negative: number;
  unscored: number;
}

export async function getSentimentRollup(
  env: Env,
  clientSlug: string,
  days: number,
): Promise<SentimentRollup> {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const row = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) AS positive,
       SUM(CASE WHEN sentiment = 'neutral'  THEN 1 ELSE 0 END) AS neutral,
       SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) AS negative,
       SUM(CASE WHEN sentiment IS NULL THEN 1 ELSE 0 END)      AS unscored,
       COUNT(*) AS total
       FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
       WHERE ck.client_slug = ? AND cr.client_cited = 1 AND cr.run_at >= ?`,
  ).bind(clientSlug, since).first<{
    positive: number; neutral: number; negative: number; unscored: number; total: number;
  }>();
  return {
    total: row?.total ?? 0,
    positive: row?.positive ?? 0,
    neutral: row?.neutral ?? 0,
    negative: row?.negative ?? 0,
    unscored: row?.unscored ?? 0,
  };
}
