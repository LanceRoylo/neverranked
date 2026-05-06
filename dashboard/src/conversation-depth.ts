/**
 * Conversation depth: rich extraction of HOW an AI engine describes the
 * client beyond the binary positive/neutral/negative scored by
 * sentiment-scorer.ts. Outputs framing class, framing phrase,
 * competitive position, competitors named, and prominence class.
 *
 * This is the layer that turns "we got cited" into "we got cited as the
 * premium option, primary recommendation, alongside Smith and Jones."
 *
 * Pattern mirrors sentiment-scorer.ts -- single Haiku call per row,
 * JSON-only output, fire-and-forget waitUntil from citations.ts plus a
 * daily cron backfill. Sentiment and depth run as independent passes so a
 * failure in one doesn't block the other and we can A/B prompts
 * separately.
 *
 * Cost: Haiku 4.5 ~$0.001/call. ~700 runs/wk/client -> well under
 * $1/mo/client.
 */

import type { Env } from "./types";

const MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TEXT_CHARS = 4000;

export type Framing =
  | "value"
  | "premium"
  | "specialist"
  | "established"
  | "niche"
  | "budget"
  | "balanced"
  | "unclear";

export type CompetitivePosition =
  | "sole"
  | "primary"
  | "secondary"
  | "tertiary"
  | "listed";

export type ProminenceClass = "recommended" | "listed" | "footnote";

export interface DepthResult {
  framing: Framing;
  framing_phrase: string;
  competitive_position: CompetitivePosition;
  competitors_mentioned: string[];
  prominence_class: ProminenceClass;
  reason: string;
}

const SYSTEM = `You analyze a paragraph of AI-generated text that mentions a specific business. The client is named in the text. Other businesses may also be named.

Read the text and return STRICT JSON, no prose:

{
  "framing": "value" | "premium" | "specialist" | "established" | "niche" | "budget" | "balanced" | "unclear",
  "framing_phrase": "the exact phrase from the text that describes the client, or empty string if none",
  "competitive_position": "sole" | "primary" | "secondary" | "tertiary" | "listed",
  "competitors_mentioned": ["names", "of", "other", "businesses", "in", "the", "text"],
  "prominence_class": "recommended" | "listed" | "footnote",
  "reason": "one sentence, specific, names the actual signal in the text"
}

Definitions:
- framing: how the AI characterizes the client. "value" = good price for what you get; "premium" = expensive but high-end; "specialist" = focused on a specific niche; "established" = legacy/long-standing/trusted; "niche" = small/independent/distinctive; "budget" = cheapest option; "balanced" = middle of the road; "unclear" = no clear positioning signal.
- framing_phrase: lift the actual words from the text. Quote it. Empty string if the text only names the client without descriptive context.
- competitive_position: "sole" = only business named; "primary" = first/main recommendation among several; "secondary" = mentioned alongside others without leading; "tertiary" = appears in a list of three or more without distinction; "listed" = appears in a long list with no individual treatment.
- competitors_mentioned: JSON array of any other business names in the text. Brand names only, not generic categories. Empty array if none.
- prominence_class: "recommended" = AI is actively recommending the client; "listed" = AI is naming the client among other options without endorsement; "footnote" = client is mentioned in passing, as a caveat, or as a contrast example.
- reason: one sentence, references the actual text, no fluff. Tells Lance why you classified it that way.`;

async function callHaiku(env: Env, businessName: string, responseText: string): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
  const trimmed = responseText.slice(0, MAX_TEXT_CHARS);
  const userMessage = `Client business: ${businessName}\n\n---\n\nText:\n\n${trimmed}\n\n---\n\nReturn the JSON now.`;

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
      max_tokens: 500,
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Anthropic ${resp.status}: ${txt.slice(0, 300)}`);
  }
  const json = (await resp.json()) as { content: { type: string; text: string }[] };
  return json.content[0]?.text ?? "";
}

const FRAMING_VALUES: Framing[] = [
  "value", "premium", "specialist", "established", "niche", "budget", "balanced", "unclear",
];
const POSITION_VALUES: CompetitivePosition[] = [
  "sole", "primary", "secondary", "tertiary", "listed",
];
const PROMINENCE_VALUES: ProminenceClass[] = ["recommended", "listed", "footnote"];

function parseDepth(raw: string): DepthResult | null {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fence ? fence[1] : raw;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const framing = String(obj.framing || "").toLowerCase().trim() as Framing;
    if (!FRAMING_VALUES.includes(framing)) return null;
    const position = String(obj.competitive_position || "").toLowerCase().trim() as CompetitivePosition;
    if (!POSITION_VALUES.includes(position)) return null;
    const prominence = String(obj.prominence_class || "").toLowerCase().trim() as ProminenceClass;
    if (!PROMINENCE_VALUES.includes(prominence)) return null;
    const phrase = typeof obj.framing_phrase === "string" ? obj.framing_phrase.trim().slice(0, 300) : "";
    const reason = typeof obj.reason === "string" ? obj.reason.trim().slice(0, 400) : "";
    const competitors = Array.isArray(obj.competitors_mentioned)
      ? obj.competitors_mentioned.filter((x) => typeof x === "string").map((s) => String(s).trim().slice(0, 80)).slice(0, 20)
      : [];
    return {
      framing,
      framing_phrase: phrase,
      competitive_position: position,
      competitors_mentioned: competitors,
      prominence_class: prominence,
      reason,
    };
  } catch {
    return null;
  }
}

export async function scoreConversationDepth(
  env: Env,
  businessName: string,
  responseText: string,
): Promise<DepthResult | null> {
  if (!businessName || !responseText || responseText.length < 30) return null;
  try {
    const raw = await callHaiku(env, businessName, responseText);
    return parseDepth(raw);
  } catch (e) {
    console.log(`[depth] score failed: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

/**
 * Score one citation_run by id, persist the result. Safe to call
 * repeatedly -- second call re-scores and overwrites. Used by both the
 * inline waitUntil hook in citations.ts and the daily cron backfill.
 *
 * Only scores rows where client_cited = 1, mirrors sentiment-scorer.
 */
export async function scoreAndUpdateDepth(
  env: Env,
  runId: number,
): Promise<{ ok: boolean; framing?: Framing }> {
  const row = await env.DB.prepare(
    `SELECT cr.id, cr.engine, cr.response_text, cr.client_cited,
            cr.run_at, ck.client_slug,
            d.domain
       FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
       LEFT JOIN domains d ON d.client_slug = ck.client_slug AND d.is_competitor = 0 AND d.active = 1
       WHERE cr.id = ?`,
  ).bind(runId).first<{
    id: number; engine: string; response_text: string; client_cited: number;
    run_at: number; client_slug: string; domain: string | null;
  }>();

  if (!row) return { ok: false };
  if (row.client_cited !== 1) return { ok: false };

  const businessName = row.domain ?? row.client_slug;
  const result = await scoreConversationDepth(env, businessName, row.response_text);
  const now = Math.floor(Date.now() / 1000);

  if (!result) {
    // Mark scored-at so we don't retry forever, but leave fields NULL.
    await env.DB.prepare(
      `UPDATE citation_runs SET depth_scored_at = ? WHERE id = ?`,
    ).bind(now, runId).run();
    return { ok: false };
  }

  await env.DB.prepare(
    `UPDATE citation_runs
        SET framing = ?,
            framing_phrase = ?,
            competitive_position = ?,
            competitors_mentioned = ?,
            prominence_class = ?,
            depth_reason = ?,
            depth_scored_at = ?
      WHERE id = ?`,
  ).bind(
    result.framing,
    result.framing_phrase,
    result.competitive_position,
    JSON.stringify(result.competitors_mentioned),
    result.prominence_class,
    result.reason,
    now,
    runId,
  ).run();

  return { ok: true, framing: result.framing };
}

/** Per-client manual backfill (admin-only override). Mirrors
 * backfillSentimentForClient so /admin/depth-backfill/<slug>?days=N
 * can drain a specific client's history on demand instead of waiting
 * for the daily cron. */
export async function backfillDepthForClient(
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
         AND cr.depth_scored_at IS NULL
         AND cr.run_at >= ?`,
  ).bind(clientSlug, since).all<{ id: number }>()).results;

  let scored = 0;
  for (const r of rows) {
    const res = await scoreAndUpdateDepth(env, r.id);
    if (res.ok) scored++;
  }
  return { scanned: rows.length, scored };
}

/**
 * Daily cron: process oldest 100 unscored client_cited=1 runs.
 * Mirrors backfillUnscoredSentiment.
 */
export async function backfillUnscoredDepth(env: Env, batchSize = 100): Promise<number> {
  const rows = (await env.DB.prepare(
    `SELECT id FROM citation_runs
       WHERE depth_scored_at IS NULL AND client_cited = 1
       ORDER BY run_at DESC
       LIMIT ?`,
  ).bind(batchSize).all<{ id: number }>()).results;

  let scored = 0;
  for (const r of rows) {
    const res = await scoreAndUpdateDepth(env, r.id);
    if (res.ok) scored++;
  }
  return scored;
}

// ---------- Aggregation for dashboard surface (used next session) ----------

export interface DepthRollup {
  total: number;
  by_framing: Record<Framing, number>;
  by_position: Record<CompetitivePosition, number>;
  by_prominence: Record<ProminenceClass, number>;
  top_competitors: { name: string; count: number }[];
}

export async function getDepthRollup(
  env: Env,
  clientSlug: string,
  days: number,
): Promise<DepthRollup> {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const rows = (await env.DB.prepare(
    `SELECT cr.framing, cr.competitive_position, cr.prominence_class, cr.competitors_mentioned
       FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
      WHERE ck.client_slug = ?
        AND cr.client_cited = 1
        AND cr.run_at >= ?
        AND cr.framing IS NOT NULL`,
  ).bind(clientSlug, since).all<{
    framing: string;
    competitive_position: string;
    prominence_class: string;
    competitors_mentioned: string;
  }>()).results;

  const byFraming: Record<string, number> = {};
  const byPosition: Record<string, number> = {};
  const byProminence: Record<string, number> = {};
  const competitorCounts: Record<string, number> = {};

  for (const r of rows) {
    byFraming[r.framing] = (byFraming[r.framing] || 0) + 1;
    byPosition[r.competitive_position] = (byPosition[r.competitive_position] || 0) + 1;
    byProminence[r.prominence_class] = (byProminence[r.prominence_class] || 0) + 1;
    try {
      const list = JSON.parse(r.competitors_mentioned || "[]") as string[];
      for (const c of list) {
        const k = c.toLowerCase().trim();
        if (!k) continue;
        competitorCounts[k] = (competitorCounts[k] || 0) + 1;
      }
    } catch {}
  }

  const topCompetitors = Object.entries(competitorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  return {
    total: rows.length,
    by_framing: byFraming as DepthRollup["by_framing"],
    by_position: byPosition as DepthRollup["by_position"],
    by_prominence: byProminence as DepthRollup["by_prominence"],
    top_competitors: topCompetitors,
  };
}
