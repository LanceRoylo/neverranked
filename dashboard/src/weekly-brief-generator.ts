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
import { computeComparison, describeMovement, type ComparisonResult } from "./lib/compare-periods";
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
  /** Questions measured in BOTH weeks. The delta is computed over these only,
   *  so a set change cannot masquerade as a citation movement. Zero means no
   *  comparable pair and no delta may be stated. */
  sharedKeywords: number;
  /**
   * The week-over-week comparison, from the shared primitive. This used to be
   * four loose fields plus a per-engine array that this file compared itself,
   * and its pooled figure had NO engine filter: it averaged citation-grade and
   * model-knowledge surfaces together, with the Bing control in the
   * denominator. On the week of 09-14 that published "down 1.2 points" when
   * citation-grade surfaces were down 2.6 and model-knowledge was up 0.2.
   */
  comparison: ComparisonResult;
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

  // Week-over-week citations, LIKE FOR LIKE.
  //
  // These two counts used to be raw sums over citation_runs in each window,
  // with no join and no scoping, so any question measured in one week and not
  // the other moved the total. The totals went 827, then 578, then 483, and
  // the drafts in the review queue called that a citation decline.
  //
  // Every cause was OURS. Measured against the rows on 2026-09-27, and none of
  // them is what was first written here:
  //
  //  - and-scene went DARK on 09-09, five days before its 09-14 cost pause and
  //    undetected at the time, so the week of 09-07 holds three days of its runs
  //    against the prior week's seven (1,115 -> 502).
  //  - hawaii-theatre did NOT lose runs. Its baseline is ~110-143/day and the
  //    week of 09-07 sat at 934, right on it. The PRIOR week was inflated to
  //    1,404 by extra sweeps on 09-01 to 09-03 (467 runs on 09-02 against a
  //    ~133 baseline). An inflated comparison week, not starvation: HTC has a
  //    measurement_registry row and sorts FIRST, so it is the best protected.
  //  - the engine MIX moved. openai cites least and had been failing hard (111
  //    failures on 09-03, a total outage on 09-12), so its recovery took it from
  //    219 runs to 366 while gemini fell 717 -> 549 with the smaller keyword
  //    set. A pooled rate drops on that alone.
  //  - hawaii-theatre's 25-to-18 cut on 09-21 is real but lands in the LATER
  //    window.
  //
  // Sweep-order starvation was asserted here twice before anyone measured it.
  // There is currently no starvation at all: since 09-14 openai has run at
  // 102-103% of gemini for every client.
  //
  // This brief is PUBLISHED at /weekly/<slug>. That would have put a claim
  // about the AI citation landscape in public whose entire cause was us
  // turning off measurement, from a practice that sells measurement
  // integrity. It is the same shape as the retracted 45-to-95 figure.
  //
  // So both weeks are counted over the SAME keywords: those with runs in both
  // windows. A question added or dropped between them cannot move the delta.
  // ONE query now: the shared question set, and per-surface counts over it.
  // The pooled figures are computed by comparePeriods(), which pools within a
  // layer and never across, and excludes the control from every pool.
  //
  // What this replaces had no engine filter at all. It divided every citation
  // by every run, so a citation-grade share and a share of answers-that-name-you
  // were averaged together with the Bing control sitting in the denominator.
  // For the week of 09-14 that produced "down 1.2 points" when citation-grade
  // surfaces were down 2.6 and model-knowledge was up 0.2. The layer rule was
  // already written down in engine-layer.ts; this file just did not follow it.
  const kwRow = await env.DB.prepare(
    `WITH both AS (
       SELECT keyword_id FROM citation_runs WHERE run_at >= ?3 AND run_at < ?4
       INTERSECT
       SELECT keyword_id FROM citation_runs WHERE run_at >= ?1 AND run_at < ?2
     )
     SELECT COUNT(DISTINCT keyword_id) AS shared_keywords FROM both`,
  ).bind(prevStart, prevEnd, start, end)
   .first<{ shared_keywords: number | null }>()
   .catch(() => null);
  const sharedKeywords = kwRow?.shared_keywords ?? 0;

  const engWowRes = sharedKeywords > 0
    ? await env.DB.prepare(
        `WITH both AS (
           SELECT keyword_id FROM citation_runs WHERE run_at >= ?3 AND run_at < ?4
           INTERSECT
           SELECT keyword_id FROM citation_runs WHERE run_at >= ?1 AND run_at < ?2
         )
         SELECT engine,
                SUM(CASE WHEN run_at <  ?3 THEN 1 ELSE 0 END) AS prev_runs,
                SUM(CASE WHEN run_at <  ?3 AND client_cited = 1 THEN 1 ELSE 0 END) AS prev_cited,
                SUM(CASE WHEN run_at >= ?3 THEN 1 ELSE 0 END) AS cur_runs,
                SUM(CASE WHEN run_at >= ?3 AND client_cited = 1 THEN 1 ELSE 0 END) AS cur_cited
           FROM citation_runs
          WHERE run_at >= ?1 AND run_at < ?4
            AND keyword_id IN (SELECT keyword_id FROM both)
          GROUP BY engine
          ORDER BY engine`,
      ).bind(prevStart, prevEnd, start, end)
       .all<{ engine: string; prev_runs: number; prev_cited: number; cur_runs: number; cur_cited: number }>()
       .catch(() => null)
    : null;

  if (sharedKeywords === 0) {
    console.log("[weekly-brief] no keywords measured in both weeks; week-over-week comparison withheld.");
  }

  // Instrument events, wired 2026-10-01. Until then this passed none, so the
  // brief could not refuse a comparison spanning an adapter change, a question
  // set change or a step the detector had found. Fleet-wide, so every client's
  // events are loaded: a step in any client's numbers is inside a fleet figure.
  // A load failure passes an unrecognised global event rather than none, which
  // withholds: not knowing whether the instrument changed is not the same as
  // knowing it did not.
  const { loadInstrumentEvents } = await import("./lib/compare-loader");
  const events = await loadInstrumentEvents(
    env,
    { start: prevStart, end: prevEnd },
    { start, end },
    null,
  ).catch((e) => [{
    occurred_at: start,
    kind: "events_unavailable",
    scope: "global" as const,
    detail: `instrument_events could not be read (${e instanceof Error ? e.message : String(e)}), so no comparison can be cleared`,
  }]);

  const comparison = computeComparison({
    sharedKeywords,
    perSurface: (engWowRes?.results ?? []).map((e) => ({
      engine: e.engine,
      prevRuns: e.prev_runs,
      prevHits: e.prev_cited,
      curRuns: e.cur_runs,
      curHits: e.cur_cited,
    })),
    curWindow: { start, end },
    prevWindow: { start: prevStart, end: prevEnd },
    events,
  });

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
    newCitationsThisWeek: comparison.basis.curRuns > 0 ? sumHits(comparison, "cur") : 0,
    prevWeekCitations: comparison.basis.prevRuns > 0 ? sumHits(comparison, "prev") : 0,
    sharedKeywords,
    comparison,
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

GROUNDING RULES (the stats block in the user message is your ONLY source):
- Report what was measured. Never report why. You have no access to any surface's ranking logic, retrieval method or reasoning, so do not explain why one surface differs from another.
- Do not define what a classification means. If the source labels mentions positive, neutral or negative, report the counts and stop. Do not tell the reader what those labels measure.
- A count is not a description. Never characterise the content of an individual citation, mention or thread. If the source says one mention was negative, you may say one mention was negative and nothing about what it said.
- The source carries no dates, no thread ages and no recency signal. Never claim anything is recent, old, current or trending over time beyond the one prior-week figure given.
- Every surface has its own run count. Rates compare across surfaces, absolute counts do not. Never assert that two surfaces were asked the same questions or saw the same query set, because the source does not establish that.
- A LEVEL is not a CHANGE. "the citation rate is 16%" may never be written as "the citation rate drops 16%", in the title or anywhere else. If you state a movement, state the two numbers it is between. A draft titled "Citation Rate Drops 16%" about a rate that WAS 16% is the exact error this rule exists to stop.
- Week-over-week movement is the RATE change in the Week over week block, never the difference between two absolute citation counts. Where that block says no movement can be stated, there is no movement to report: say plainly that the two periods are not comparable and why, and never reconstruct the figure from the raw counts yourself.
- Week-over-week movement is stated PER SURFACE, from the per-surface lines. The pooled rate averages surfaces that move in opposite directions and also moves when the balance of runs between them changes, so it may not be the headline. If the per-surface block says no surface moved 2 points, the week's finding is that nothing moved, and you say so.
- Query volume is ours. We choose how many questions to ask and how often. Any change in it is a fact about our instrument, and writing it as a change in AI behaviour is the same failure as reporting a question-set change as a ranking movement.
- If a detail would make the brief more interesting but is not in the stats block, leave it out. A thin accurate brief is correct. An interesting invented one is a retraction.

OUTPUT FORMAT (strict JSON):
{
  "title": "Specific, declarative, under 70 chars. NOT 'Weekly Brief #X' -- name what actually happened.",
  "summary": "1-2 sentences. The hook. Used as the archive list entry and the meta description.",
  "body_markdown": "The full brief in Markdown. Use ## for section headers. 600-1200 words. Open with the most notable measured result, then sections for each angle (engine activity, Reddit, sentiment, referral traffic, etc). Close by naming what next week's numbers would have to show to confirm or contradict this week's reading. Do not predict."
}`;

interface GeneratedBrief {
  title: string;
  summary: string;
  body_markdown: string;
}

/** Non-control citations in one window, for the headline count line. */
export function sumHits(c: ComparisonResult, side: "cur" | "prev"): number {
  return c.perSurface
    .filter((s) => s.layer !== "control")
    .reduce((a, s) => a + (side === "cur" ? s.curHits : s.prevHits), 0);
}

/**
 * The week-over-week block.
 *
 * Renders comparePeriods(); it computes nothing itself. Every rule it used to
 * carry privately now lives in the primitive and is shared with the monthly
 * memo, which is the point: this file got the same class of thing wrong three
 * times in one day and a fourth time after being "fixed".
 *
 * The fourth: the pooled figure had no engine filter, so it averaged
 * citation-grade and model-knowledge surfaces together with the Bing control in
 * the denominator. For the week of 09-14 that reads "down 1.2 points" when
 * citation-grade was down 2.6 and model-knowledge was up 0.2.
 */
export function weekOverWeekBlock(stats: WeeklyStats): string {
  const c = stats.comparison;
  const lines: string[] = [];

  if (c.basis.sharedKeywords === 0) {
    return "  NO comparable prior week: no question was measured in both weeks, so there\n" +
           "  is NO week-over-week movement and you may not state or imply one.";
  }

  lines.push(`  Counted ONLY over the ${c.basis.sharedKeywords} questions measured in BOTH weeks.`);
  lines.push("");

  // Pooled PER LAYER. There is deliberately no all-surface figure: a citation
  // share and a share of answers-that-name-you have different numerators and
  // different denominators, so their average is not a quantity.
  lines.push("  The two layers are reported separately and are NOT comparable to each other:");
  lines.push(`    Surfaces that search the web and cite sources: ${describeMovement(c.pooled.citation, "rate").replace(/^rate: /, "")}`);
  lines.push(`    Surfaces that answer from training:            ${describeMovement(c.pooled.model_knowledge, "rate").replace(/^rate: /, "")}`);
  lines.push("  A percentage here is a LEVEL. Never write a level as a drop or a rise.");
  lines.push("");

  lines.push("  Per surface, over those same questions (prior -> this week):");
  for (const s of c.perSurface) {
    const note = s.engine === "bing"
      ? "  [classic-search CONTROL: it returns results. It does not cite or answer. Never call it an AI tool.]"
      : s.engine === "google_ai_overview"
        ? "  [smaller denominator BY DESIGN: a row exists only when an overview rendered, so this is how often Google showed one, NOT missing coverage.]"
        : "";
    if (s.movement.kind === "withheld") {
      lines.push(`    ${s.engine.padEnd(19)} no movement may be stated: ${s.movement.reason}${note}`);
      continue;
    }
    const m = s.movement;
    lines.push(
      `    ${s.engine.padEnd(19)} ${m.prevRate.toFixed(1)}% -> ${m.curRate.toFixed(1)}%  ` +
      `(${m.deltaPp >= 0 ? "+" : ""}${m.deltaPp.toFixed(1)}pp, ${s.prevRuns} -> ${s.curRuns} runs)${note}`,
    );
  }

  lines.push(
    c.movedSurfaces.length > 0
      ? `  Surfaces that moved at least 2 points: ${c.movedSurfaces.join(", ")}.`
      : "  No surface moved as much as 2 points. Say that plainly rather than finding a trend.",
  );
  lines.push(
    "  Report movement PER SURFACE and PER LAYER. Where a figure above says no",
    "  movement may be stated, you may not state one, and you may not work around",
    "  it by comparing the raw counts yourself.",
  );

  if (c.events.length > 0) {
    lines.push("", "  INSTRUMENT CHANGES inside these windows (these are OURS, not the market):");
    for (const e of c.events) lines.push(`    ${e.kind}: ${e.detail}`);
  }
  if (c.setAside.length > 0) {
    lines.push("", "  Also inside these windows, considered and found not to affect these figures:");
    for (const s of c.setAside) lines.push(`    ${s.event.kind}: ${s.why}`);
  }

  return lines.join("\n");
}

function buildUserMessage(stats: WeeklyStats): string {
  const fmtPct = (n: number, total: number) => total > 0 ? `${Math.round((n / total) * 100)}%` : "0%";
  const sentTotal = stats.sentimentBreakdown.positive + stats.sentimentBreakdown.neutral + stats.sentimentBreakdown.negative;
  // State the basis with the number, always. A delta whose basis is invisible
  // is how a set change gets published as a market movement.
  const wow = weekOverWeekBlock(stats);

  return `Week analyzed: ${new Date(stats.weekStartsAt * 1000).toISOString().slice(0,10)} to ${new Date(stats.weekEndsAt * 1000).toISOString().slice(0,10)}

## Tracked surface
  Active clients monitored: ${stats.trackedClients}
  Total tracked keywords:   ${stats.trackedKeywords}

## Citation runs
  The AI tools measured are ChatGPT, Perplexity, Claude, Gemini, Google AI Overviews and Gemma.
  Bing is a classic-search control, NOT an AI tool. It returns results. It does not cite or answer.
  Never count Bing among the AI tools and never attribute answering behaviour to it.
  Together these are seven measured surfaces.
  Total runs this week:     ${stats.totalCitationRuns}
  New client citations:     ${stats.newCitationsThisWeek}

## Week over week
${wow}

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

Write the brief now. Strict JSON only, matching the shape in your instructions. Lead with the most notable measured result, not "this week we saw...". If the numbers are unremarkable, say that plainly rather than manufacturing significance.`;
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
  //
  // This used to return ok:true for ANY existing row, whatever its status, so
  // asking to regenerate a bad draft handed back the bad draft and reported
  // success. Both September drafts had to be regenerated after the
  // week-over-week basis was fixed, and this would have silently refused while
  // looking like it worked -- a synthetic success, which is not a delivery.
  //
  // A PUBLISHED brief is never replaced silently: it is public and may already
  // be linked or indexed. Anything else has not been delivered to anyone, so it
  // is superseded and regenerated. The old row is kept, not deleted: it is the
  // evidence of what the generator used to say. Its slug is moved aside because
  // slug is UNIQUE, and only 'published' rows are ever served.
  const existing = await env.DB.prepare(
    `SELECT id, status FROM weekly_briefs WHERE slug = ?`,
  ).bind(slug).first<{ id: number; status: string }>();
  if (existing?.status === "published") {
    console.log(`[weekly-brief] ${slug} is already published; refusing to replace it.`);
    return { ok: true, briefId: existing.id, slug };
  }
  if (existing) {
    const moved = await env.DB.prepare(
      `UPDATE weekly_briefs
          SET slug = slug || '-superseded-' || id, status = 'rejected'
        WHERE id = ? AND status <> 'published'`,
    ).bind(existing.id).run();
    if (!moved.success || (moved.meta?.changes ?? 0) === 0) {
      // Never proceed to an INSERT that would collide on the unique slug and
      // fail somewhere less visible than here.
      return { ok: false, error: `could not supersede existing ${existing.status} brief ${existing.id} for ${slug}; nothing regenerated` };
    }
    console.log(`[weekly-brief] superseded ${existing.status} brief ${existing.id} for ${slug}; regenerating.`);
  }

  // Refuse to generate if there's almost no data -- a sparse brief is
  // worse than no brief.
  if (stats.totalCitationRuns < 10) {
    return { ok: false, error: `only ${stats.totalCitationRuns} citation runs this week, refusing to generate sparse brief` };
  }

  const userMessage = buildUserMessage(stats);

  // Three-pass validation. Pass A grounds against the stats summary
  // we passed in (catches numbers the model invented vs ones from
  // the data). Pass B is tone (customer-publication, strictest).
  // Pass C is JSON-parseable with title + summary + 200-char body.
  const callModel = async (extraFeedback: string): Promise<string> => {
    const um = extraFeedback
      ? userMessage + "\n\nADDITIONAL CONSTRAINTS FOR THIS ATTEMPT:\n" + extraFeedback
      : userMessage;
    return callClaude(env, um);
  };
  const initialRaw = await callModel("");

  const { multiPassValidate } = await import("./lib/multi-pass");
  const validation = await multiPassValidate(env, {
    generated: initialRaw,
    sourceContext: userMessage,  // the stats block IS the source
    toneContext: "customer-publication",
    qualityGate: (text) => {
      const parsed = parseBrief(text);
      if (!parsed) return { ok: false, reason: "could not parse brief JSON (need title + summary + 200-char body)" };
      return { ok: true };
    },
    regenerate: callModel,
    label: "weekly-brief-generator",
  });

  if (!validation.ok) {
    return { ok: false, error: `multi-pass validation stuck after ${validation.attempts} attempts; see /admin/inbox/${validation.inboxId}` };
  }

  const brief = parseBrief(validation.text);
  if (!brief) return { ok: false, error: "post-validation parse failed (should not happen)" };

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

/** Publish a draft brief, unless it carries a retired or retracted claim.
 *
 *  FAIL CLOSED. This used to be a bare UPDATE. On 2026-09-12 a draft had been
 *  sitting approvable for 71 days whose summary said "seven AI engines" and
 *  whose body named Copilot, and nothing between the button and a public URL
 *  would have stopped it. Approval is a human act and humans approve stale
 *  drafts, so the check belongs here rather than in the UI.
 *
 *  Returns a reason rather than a bare false, because a refusal the operator
 *  cannot act on just gets clicked again. */
export async function publishBrief(
  env: Env,
  briefId: number,
  userId: number | null,
): Promise<{ published: boolean; blocked?: string }> {
  const { firstRetiredClaimIn } = await import("./lib/retired-claims");
  const row = await env.DB.prepare(
    `SELECT title, summary, body_markdown FROM weekly_briefs WHERE id = ? AND status = 'draft'`,
  ).bind(briefId).first<{ title: string; summary: string; body_markdown: string }>();
  if (!row) return { published: false };

  const hit = firstRetiredClaimIn({
    title: row.title,
    summary: row.summary,
    body_markdown: row.body_markdown,
  });
  if (hit) {
    const blocked = `Refused: ${hit.field} contains "${hit.match}" (${hit.id}). ${hit.why}`;
    console.log(`[weekly-brief] publish BLOCKED for brief ${briefId}: ${blocked}`);
    return { published: false, blocked };
  }

  const now = Math.floor(Date.now() / 1000);
  const r = await env.DB.prepare(
    `UPDATE weekly_briefs SET status = 'published', approved_by = ?, approved_at = ?, published_at = ?
       WHERE id = ? AND status = 'draft'`,
  ).bind(userId, now, now, briefId).run();
  return { published: (r.meta?.changes ?? 0) > 0 };
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
