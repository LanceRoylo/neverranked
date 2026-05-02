/**
 * Weekly AEO brief generator.
 *
 * Aggregates the prior 7 days of NeverRanked-wide observations into a
 * single Claude-authored, tone-guarded, anonymized brief that Lance
 * approves before publish. Becomes its own marketing surface at
 * /weekly/<slug>: NeverRanked is its own demo, in public, weekly.
 *
 * Hard rules enforced in the system prompt + post-generation check:
 *   - Never name specific client domains, slugs, or business names
 *   - Geography aggregated to region; industry aggregated to category
 *   - Frame everything as "across N tracked categories" / "in N% of
 *     monitored queries"
 *   - Tone-guarded: blocked phrases, em dashes, semicolons, hedge
 *     openers all rejected
 *
 * If the generated brief contains any active client_slug as a substring
 * (case-insensitive), we hard-fail and surface to admin_inbox instead
 * of persisting the draft. Belt-and-suspenders against the model
 * leaking identifying detail.
 */

import type { Env } from "./types";
import { addInboxItem } from "./admin-inbox";

const MODEL = "claude-sonnet-4-5";
const ANTHROPIC_VERSION = "2023-06-01";

// ---------- Aggregation ----------

export interface WeeklyStats {
  weekStartsAt: number;
  weekEndsAt: number;
  totalCitationRuns: number;
  perEngine: { engine: string; runs: number; clientCited: number }[];
  totalBotHits: number;
  topBots: { bot: string; hits: number }[];
  totalReddit: number;
  topSubreddits: { subreddit: string; hits: number }[];
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  totalReferrerVisits: number;
  topReferrerEngines: { engine: string; visits: number }[];
  trackedClients: number;          // count of distinct active client_slugs
  trackedKeywords: number;         // count of active citation_keywords across all clients
  newCitationsThisWeek: number;    // client_cited rows added this week
  prevWeekCitations: number;       // for week-over-week delta
}

export async function aggregateLastWeek(env: Env, weekStartsAt?: number): Promise<WeeklyStats> {
  // Default: the most recent UTC Monday
  const now = Math.floor(Date.now() / 1000);
  const start = weekStartsAt ?? mostRecentMondayUtc(now) - 7 * 86400;
  const end = start + 7 * 86400;
  const prevStart = start - 7 * 86400;
  const prevEnd = start;

  // Engine activity
  const enginesRes = await env.DB.prepare(
    `SELECT engine, COUNT(*) AS runs,
            SUM(CASE WHEN client_cited = 1 THEN 1 ELSE 0 END) AS client_cited
       FROM citation_runs
       WHERE run_at >= ? AND run_at < ?
       GROUP BY engine
       ORDER BY runs DESC`,
  ).bind(start, end).all<{ engine: string; runs: number; client_cited: number }>();

  // Bot crawl activity
  const botsRes = await env.DB.prepare(
    `SELECT bot_pattern AS bot, COUNT(*) AS hits FROM bot_hits
       WHERE hit_at >= ? AND hit_at < ?
       GROUP BY bot_pattern ORDER BY hits DESC LIMIT 8`,
  ).bind(start, end).all<{ bot: string; hits: number }>();
  const totalBotHits = (await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM bot_hits WHERE hit_at >= ? AND hit_at < ?`,
  ).bind(start, end).first<{ n: number }>())?.n ?? 0;

  // Reddit activity
  const subsRes = await env.DB.prepare(
    `SELECT subreddit, COUNT(*) AS hits FROM reddit_citations
       WHERE run_at >= ? AND run_at < ?
       GROUP BY subreddit ORDER BY hits DESC LIMIT 8`,
  ).bind(start, end).all<{ subreddit: string; hits: number }>();
  const totalReddit = (await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM reddit_citations WHERE run_at >= ? AND run_at < ?`,
  ).bind(start, end).first<{ n: number }>())?.n ?? 0;

  // Sentiment
  const sentRes = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) AS pos,
       SUM(CASE WHEN sentiment = 'neutral'  THEN 1 ELSE 0 END) AS neu,
       SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) AS neg
       FROM citation_runs
       WHERE run_at >= ? AND run_at < ? AND sentiment IS NOT NULL`,
  ).bind(start, end).first<{ pos: number; neu: number; neg: number }>();

  // Referrer visits (humans arriving from AI engines)
  const refRes = await env.DB.prepare(
    `SELECT engine, COUNT(*) AS visits FROM referrer_hits
       WHERE hit_at >= ? AND hit_at < ?
       GROUP BY engine ORDER BY visits DESC LIMIT 6`,
  ).bind(start, end).all<{ engine: string; visits: number }>();
  const totalRefVisits = (await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM referrer_hits WHERE hit_at >= ? AND hit_at < ?`,
  ).bind(start, end).first<{ n: number }>())?.n ?? 0;

  // Tracked surface size
  const trackedClients = (await env.DB.prepare(
    `SELECT COUNT(DISTINCT client_slug) AS n FROM domains
       WHERE active = 1 AND is_competitor = 0`,
  ).first<{ n: number }>())?.n ?? 0;
  const trackedKeywords = (await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM citation_keywords WHERE active = 1`,
  ).first<{ n: number }>())?.n ?? 0;

  // Week-over-week new citations delta
  const newCitations = (await env.DB.prepare(
    `SELECT SUM(CASE WHEN client_cited = 1 THEN 1 ELSE 0 END) AS n
       FROM citation_runs WHERE run_at >= ? AND run_at < ?`,
  ).bind(start, end).first<{ n: number }>())?.n ?? 0;
  const prevCitations = (await env.DB.prepare(
    `SELECT SUM(CASE WHEN client_cited = 1 THEN 1 ELSE 0 END) AS n
       FROM citation_runs WHERE run_at >= ? AND run_at < ?`,
  ).bind(prevStart, prevEnd).first<{ n: number }>())?.n ?? 0;

  const totalRuns = enginesRes.results.reduce((s, r) => s + r.runs, 0);

  return {
    weekStartsAt: start,
    weekEndsAt: end,
    totalCitationRuns: totalRuns,
    perEngine: enginesRes.results,
    totalBotHits,
    topBots: botsRes.results,
    totalReddit,
    topSubreddits: subsRes.results,
    sentimentBreakdown: {
      positive: sentRes?.pos ?? 0,
      neutral: sentRes?.neu ?? 0,
      negative: sentRes?.neg ?? 0,
    },
    totalReferrerVisits: totalRefVisits,
    topReferrerEngines: refRes.results,
    trackedClients,
    trackedKeywords,
    newCitationsThisWeek: newCitations,
    prevWeekCitations: prevCitations,
  };
}

function mostRecentMondayUtc(unixTs: number): number {
  const d = new Date(unixTs * 1000);
  d.setUTCHours(0, 0, 0, 0);
  // Monday = 1, Sunday = 0 in JS
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return Math.floor(d.getTime() / 1000);
}

function weekSlug(weekStartsAt: number): string {
  const d = new Date(weekStartsAt * 1000);
  return `week-of-${d.toISOString().slice(0, 10)}`;
}

// ---------- Generation ----------

const SYSTEM = `You write the NeverRanked Weekly Brief: a public, anonymized observation feed about what happened across AI engine citations this past week. Audience: marketers, founders, and SEO professionals trying to understand AI search behavior.

CRITICAL RULES (these are non-negotiable):
- NEVER name a specific client business, domain, brand, or proper noun referring to a tracked customer
- NEVER pair geography + industry specifically enough to fingerprint a client (e.g., "a chiropractor in Honolulu" is too specific; "a service business in the Pacific region" is fine)
- Aggregate to category and region only
- Frame numbers as "across N tracked categories" or "in N% of monitored queries"
- Sources allowed to be named: subreddits, AI engine names (ChatGPT, Perplexity, Gemini, Claude), Reddit, public publishers (Yelp, Healthgrades, etc. — only if they appear in cited entities, not as competitors-by-implication)

VOICE RULES:
- No em dashes, no semicolons in marketing prose
- No "feel free to", "delve into", "in today's fast-paced", "in the digital age", "it's important to note", "navigate the complexities", "leverage", "robust", "comprehensive solution", "cutting-edge", "seamless", "in conclusion", "without further ado", "the importance of"
- No hedge openers ("Welcome to...", "In a world where...", "Furthermore,", "Moreover,", "In conclusion,")
- No three-adjective lists
- Write like a smart human practitioner, not an AI summarizer

OUTPUT FORMAT (strict JSON):
{
  "title": "Specific, declarative, under 70 chars. NOT 'Weekly Brief #X' -- name what actually happened.",
  "summary": "1-2 sentences. The hook. Used as the archive list entry and the meta description.",
  "body_markdown": "The full brief in Markdown. Use ## for section headers. 600-1200 words. Open with the most interesting observation, then sections for each angle (engine activity, Reddit, sentiment, referral traffic, etc). Close with a forward-looking observation, not a summary."
}`;

interface GeneratedBrief {
  title: string;
  summary: string;
  body_markdown: string;
}

function buildUserMessage(stats: WeeklyStats): string {
  const fmtPct = (n: number, total: number) => total > 0 ? `${Math.round((n / total) * 100)}%` : "0%";
  const sentTotal = stats.sentimentBreakdown.positive + stats.sentimentBreakdown.neutral + stats.sentimentBreakdown.negative;
  const wow = stats.prevWeekCitations === 0
    ? "(no prior-week baseline yet)"
    : `${stats.newCitationsThisWeek > stats.prevWeekCitations ? "up" : stats.newCitationsThisWeek < stats.prevWeekCitations ? "down" : "flat"} from ${stats.prevWeekCitations} citations the week before`;

  return `Week analyzed: ${new Date(stats.weekStartsAt * 1000).toISOString().slice(0,10)} to ${new Date(stats.weekEndsAt * 1000).toISOString().slice(0,10)}

## Tracked surface
  Active clients monitored: ${stats.trackedClients}
  Total tracked keywords:   ${stats.trackedKeywords}

## Citation runs (4 engines: ChatGPT, Perplexity, Gemini, Claude)
  Total runs this week:     ${stats.totalCitationRuns}
  New client citations:     ${stats.newCitationsThisWeek} (${wow})

  Per engine:
${stats.perEngine.map(e => `    ${e.engine.padEnd(12)} ${e.runs} runs, ${e.client_cited} cited (${fmtPct(e.client_cited, e.runs)})`).join("\n")}

## Reddit thread citations
  Total reddit threads cited by AI: ${stats.totalReddit}
  Top subreddits:
${stats.topSubreddits.map(s => `    r/${s.subreddit}: ${s.hits} thread mentions`).join("\n")}

## Bot crawler activity
  Total bot fetches: ${stats.totalBotHits}
  Top bots:
${stats.topBots.map(b => `    ${b.bot}: ${b.hits} fetches`).join("\n")}

## Sentiment of AI mentions (where client was named)
  Positive: ${stats.sentimentBreakdown.positive} (${fmtPct(stats.sentimentBreakdown.positive, sentTotal)})
  Neutral:  ${stats.sentimentBreakdown.neutral}  (${fmtPct(stats.sentimentBreakdown.neutral, sentTotal)})
  Negative: ${stats.sentimentBreakdown.negative} (${fmtPct(stats.sentimentBreakdown.negative, sentTotal)})

## Real human visits from AI engines (referral traffic)
  Total: ${stats.totalReferrerVisits}
  Per engine:
${stats.topReferrerEngines.map(r => `    ${r.engine}: ${r.visits} visits`).join("\n")}

---

Write the brief now. Strict JSON only, matching the shape in your instructions. Lead with the most interesting observation, not "this week we saw...". Find the story in the numbers.`;
}

async function callClaude(env: Env, userMessage: string): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
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
      max_tokens: 4000,
      temperature: 0.6,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Anthropic ${resp.status}: ${txt.slice(0, 300)}`);
  }
  const json = await resp.json() as { content: { type: string; text: string }[] };
  return json.content[0]?.text ?? "";
}

function parseBrief(raw: string): GeneratedBrief | null {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fence ? fence[1] : raw;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as { title?: unknown; summary?: unknown; body_markdown?: unknown };
    const title = typeof obj.title === "string" ? obj.title.trim().slice(0, 200) : "";
    const summary = typeof obj.summary === "string" ? obj.summary.trim().slice(0, 500) : "";
    const body = typeof obj.body_markdown === "string" ? obj.body_markdown.trim() : "";
    if (!title || !summary || body.length < 200) return null;
    return { title, summary, body_markdown: body };
  } catch {
    return null;
  }
}

async function loadActiveClientSlugs(env: Env): Promise<string[]> {
  const rows = (await env.DB.prepare(
    `SELECT DISTINCT client_slug FROM domains WHERE active = 1`,
  ).all<{ client_slug: string }>()).results;
  return rows.map(r => r.client_slug.toLowerCase()).filter(Boolean);
}

/**
 * Belt-and-suspenders anonymization check. If the generated brief
 * contains any active client_slug as a substring (case-insensitive),
 * we treat it as a leak and refuse to persist. The system prompt is
 * the primary defense; this is the verification layer.
 */
function checkAnonymization(text: string, clientSlugs: string[]): { ok: boolean; leakedSlug?: string } {
  const lower = text.toLowerCase();
  for (const slug of clientSlugs) {
    // Skip very short slugs (1-2 chars) -- false positive risk
    if (slug.length < 4) continue;
    if (lower.includes(slug)) return { ok: false, leakedSlug: slug };
  }
  return { ok: true };
}

export interface GenerationResult {
  ok: boolean;
  briefId?: number;
  slug?: string;
  error?: string;
}

/**
 * Generate-and-store the brief for a given week (defaults to last
 * complete week). Idempotent on UNIQUE(slug) -- returns existing draft
 * if one already exists. Approval is a separate human step.
 */
export async function generateWeeklyBrief(env: Env, weekStartsAt?: number): Promise<GenerationResult> {
  const stats = await aggregateLastWeek(env, weekStartsAt);
  const slug = weekSlug(stats.weekStartsAt);

  // Already generated for this week?
  const existing = await env.DB.prepare(
    `SELECT id, status FROM weekly_briefs WHERE slug = ?`,
  ).bind(slug).first<{ id: number; status: string }>();
  if (existing) return { ok: true, briefId: existing.id, slug };

  // Refuse to generate if there's almost no data -- a sparse brief is
  // worse than no brief.
  if (stats.totalCitationRuns < 10) {
    return { ok: false, error: `only ${stats.totalCitationRuns} citation runs this week, refusing to generate sparse brief` };
  }

  const userMessage = buildUserMessage(stats);
  const raw = await callClaude(env, userMessage);
  const brief = parseBrief(raw);
  if (!brief) return { ok: false, error: "could not parse brief from model output" };

  // Tone guard pass on the full body (customer-publication context --
  // strictest checks).
  const { assertHumanTone } = await import("./human-tone-guard");
  const tone = await assertHumanTone(env, brief.title + "\n\n" + brief.summary + "\n\n" + brief.body_markdown, "customer-publication", {
    source: "weekly-brief-generator.generate",
    target_type: "weekly_brief",
  });
  if (!tone.ok) {
    return { ok: false, error: `tone-guard blocked ${tone.violations.length} pattern(s); see /admin/inbox/${tone.inboxId}` };
  }

  // Anonymization verification pass -- belt + suspenders to the
  // system prompt's anonymization rules.
  const clientSlugs = await loadActiveClientSlugs(env);
  const leak = checkAnonymization(brief.title + " " + brief.summary + " " + brief.body_markdown, clientSlugs);
  if (!leak.ok) {
    await addInboxItem(env, {
      kind: "weekly_brief_leak",
      title: `Weekly Brief generation leaked client slug "${leak.leakedSlug}"`,
      body: `Generated draft for ${slug} contained the string "${leak.leakedSlug}" -- likely identifies a client. Brief was REJECTED, not persisted. Trigger regeneration via /admin/weekly-brief/regenerate after reviewing the system prompt.

Generated content (do not publish as-is):

${brief.body_markdown.slice(0, 1500)}`,
      target_type: "weekly_brief",
      target_id: 0,
      target_slug: leak.leakedSlug ?? null,
      urgency: "high",
    });
    return { ok: false, error: `anonymization check failed: leaked slug "${leak.leakedSlug}"` };
  }

  const now = Math.floor(Date.now() / 1000);
  const result = await env.DB.prepare(
    `INSERT INTO weekly_briefs
       (slug, week_starts_at, title, summary, body_markdown, data_snapshot, status, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)
     RETURNING id`,
  ).bind(
    slug, stats.weekStartsAt,
    brief.title, brief.summary, brief.body_markdown,
    JSON.stringify(stats), now,
  ).first<{ id: number }>();

  const briefId = result?.id ?? 0;

  // Surface to admin inbox for review.
  await addInboxItem(env, {
    kind: "weekly_brief_review",
    title: `Weekly Brief draft ready: ${brief.title}`,
    body: `Generated from ${stats.totalCitationRuns} citation runs across ${stats.trackedClients} active clients.

**Summary:**
${brief.summary}

Click below to review the full body, approve to publish, or reject/regenerate.`,
    action_url: `/admin/weekly-brief/${briefId}`,
    target_type: "weekly_brief",
    target_id: briefId,
    urgency: "normal",
  });

  return { ok: true, briefId, slug };
}

// ---------- Approval / publish ----------

export async function publishBrief(env: Env, briefId: number, userId: number | null): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const r = await env.DB.prepare(
    `UPDATE weekly_briefs SET status = 'published', approved_by = ?, approved_at = ?, published_at = ?
       WHERE id = ? AND status = 'draft'`,
  ).bind(userId, now, now, briefId).run();
  return (r.meta?.changes ?? 0) > 0;
}

export async function rejectBrief(env: Env, briefId: number, userId: number | null): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const r = await env.DB.prepare(
    `UPDATE weekly_briefs SET status = 'rejected', approved_by = ?, approved_at = ?
       WHERE id = ? AND status = 'draft'`,
  ).bind(userId, now, briefId).run();
  return (r.meta?.changes ?? 0) > 0;
}

// ---------- Read helpers ----------

export interface PublicBriefRow {
  slug: string;
  title: string;
  summary: string;
  body_markdown: string;
  published_at: number;
}

export async function getPublishedBrief(env: Env, slug: string): Promise<PublicBriefRow | null> {
  return await env.DB.prepare(
    `SELECT slug, title, summary, body_markdown, published_at
       FROM weekly_briefs WHERE slug = ? AND status = 'published'`,
  ).bind(slug).first<PublicBriefRow>() ?? null;
}

export async function listPublishedBriefs(env: Env, limit = 50): Promise<{
  slug: string; title: string; summary: string; published_at: number;
}[]> {
  return (await env.DB.prepare(
    `SELECT slug, title, summary, published_at FROM weekly_briefs
       WHERE status = 'published' ORDER BY published_at DESC LIMIT ?`,
  ).bind(limit).all<{ slug: string; title: string; summary: string; published_at: number }>()).results;
}
