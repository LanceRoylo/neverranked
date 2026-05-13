/**
 * Reddit-aware FAQ deployment.
 *
 * Replaces the reply-brief feature with something on-brand for NeverRanked.
 * Instead of telling clients "go write a Reddit reply to this thread,"
 * we extract the QUESTIONS being asked on Reddit in their category and
 * generate FAQPage schema deployable to their own site.
 *
 * The thesis:
 *   - AI engines (ChatGPT, Perplexity, Gemini) cite Reddit threads
 *     because Reddit hosts the questions in natural language
 *   - Those same engines will cite ANY well-structured source that
 *     answers the same question authoritatively
 *   - A FAQPage schema on the client's own site, with the EXACT
 *     questions being asked on Reddit, captures the same citation
 *     lift without requiring Reddit engagement
 *   - The client owns the source, controls the answer, owns the
 *     domain, doesn't risk a banned Reddit account, doesn't need
 *     anyone whose job is "be on Reddit"
 *
 * Pipeline:
 *   1. extractRedditQuestionsForClient() — pull every Reddit thread
 *      cited on the client's tracked queries in the last N days,
 *      fetch the thread JSON, extract the OP question + any
 *      question-shaped top comments
 *   2. classifyAndDedupeQuestions() — Claude pass to cluster
 *      semantically-similar questions and pick the canonical phrasing
 *   3. generateFAQAnswers() — Claude pass that takes the canonical
 *      questions plus the client's business context and produces
 *      voice-matched answers (each capped at ~280 chars per Schema.org
 *      best practice for FAQPage)
 *   4. renderFAQPageSchema() — emit JSON-LD ready to paste into a
 *      <script type="application/ld+json"> tag, plus a human-readable
 *      preview of every Q+A pair
 *
 * Output is a deployable artifact, not a workflow. The client (or NR
 * on their behalf) drops the JSON-LD into a page. AI engines pick it
 * up on their next crawl. No Reddit account required.
 */

import type { Env } from "./types";

/**
 * FAQ candidate sources. The pipeline supports multiple input
 * channels; the source tag flows through clustering and grading so
 * the dashboard can later show "this FAQ exists because AI engines
 * have been answering this query without naming you."
 *
 *   reddit_thread          — extracted from a Reddit thread cited
 *                            by an AI engine
 *   tracked_prompt_gap     — sourced from a citation_keyword for
 *                            this client where client_cited = 0 on
 *                            recent runs (a clear gap to close)
 *   tracked_prompt_defense — sourced from a tracked prompt where
 *                            the client IS cited but multiple
 *                            competitors are also named (defensive)
 */
export type FAQCandidateSource =
  | "reddit_thread"
  | "tracked_prompt_gap"
  | "tracked_prompt_defense";

export interface FAQCandidate {
  question: string;
  source: FAQCandidateSource;
  // reddit_thread fields
  source_subreddit?: string;
  source_thread_url?: string;
  source_thread_title?: string;
  // tracked_prompt_* fields
  source_keyword?: string;
  source_engines?: string[];
  source_run_count?: number;
  source_competitors?: string[];
}

// Backward-compat alias: existing code that referenced RedditQuestion
// still compiles. New code should use FAQCandidate.
export type RedditQuestion = FAQCandidate;

export interface ClusterSource {
  source: FAQCandidateSource;
  // populated based on source type
  subreddit?: string;
  thread_url?: string;
  thread_title?: string;
  keyword?: string;
  engines?: string[];
  competitors?: string[];
}

export interface ClusteredQuestion {
  canonical: string;          // canonical phrasing
  variants: string[];         // all observed phrasings of this question
  sources: ClusterSource[];
  cluster_size: number;
}

export interface FAQEntry {
  question: string;           // canonical phrasing
  answer: string;             // voice-matched answer, 80-280 chars
  evidence: {
    cluster_size: number;
    sources_by_type: Record<FAQCandidateSource, number>;
    top_sources: ClusterSource[];
  };
}

export interface FAQDeployment {
  client_slug: string;
  client_name: string;
  generated_at: number;
  faq_count: number;
  faqs: FAQEntry[];
  schema_json_ld: string;     // the deployable script tag content
  schema_size_bytes: number;
  human_preview_html: string; // optional, for the dashboard view
}

// --------------------------------------------------------------------------
// Step 1: Extract Reddit questions for a client
// --------------------------------------------------------------------------

const REDDIT_UA =
  "Mozilla/5.0 (compatible; NeverRanked-FAQ/1.0; +https://neverranked.com/bot)";

interface RawRedditThread {
  url: string;
  subreddit: string;
  title: string;
  body: string;
  top_comments: string[];
}

async function fetchRawRedditThread(threadUrl: string): Promise<RawRedditThread | null> {
  const cleanedUrl = threadUrl.replace(/\/+$/, "");
  const jsonUrl = `${cleanedUrl}.json?raw_json=1&limit=8`;
  let data: unknown;
  try {
    const resp = await fetch(jsonUrl, {
      headers: { "User-Agent": REDDIT_UA, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    data = await resp.json();
  } catch {
    return null;
  }
  if (!Array.isArray(data) || data.length === 0) return null;

  const subMatch = cleanedUrl.match(/reddit\.com\/r\/([^/]+)/i);
  const subreddit = subMatch ? subMatch[1].toLowerCase() : "";

  const listing0 = (data[0] as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  const children0 = listing0?.children as Array<Record<string, unknown>> | undefined;
  const opPost = children0?.[0]?.data as Record<string, unknown> | undefined;
  const title = String(opPost?.title || "").trim();
  const body = String(opPost?.selftext || "").trim().slice(0, 1200);

  const top_comments: string[] = [];
  const listing1 = (data[1] as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  const children1 = listing1?.children as Array<Record<string, unknown>> | undefined;
  if (children1) {
    for (const c of children1.slice(0, 4)) {
      const cBody = String((c?.data as Record<string, unknown>)?.body || "").trim();
      if (cBody && cBody.length > 20) top_comments.push(cBody.slice(0, 500));
    }
  }

  return { url: cleanedUrl, subreddit, title, body, top_comments };
}

const QUESTION_EXTRACTOR_SYSTEM = `You extract the QUESTIONS being asked in Reddit threads. The input is one or more thread bundles (title + body + top comments). The output is a list of normalized search-intent questions for each thread.

Reddit threads rarely use literal question form. People write "Looking for X in [place]" or "Visiting next month, recs?" or "Anyone been to [venue]?" Your job is to convert these into the search-engine questions someone would type to land on this thread.

Rules:
- Output 1-4 questions per thread, only the questions that are clearly being asked
- Skip threads that aren't asking anything (news posts, rants, status updates)
- Normalize to first-person searcher form ("Where can I find X in Y?", "What is the best X for Y?")
- 30-100 characters per question
- Specific to the category mentioned, not generic ("best comedy venues in Oahu" not "best entertainment")
- End each with ?
- No duplicate questions across threads — the clusterer runs after you

Return STRICT JSON, no prose:
{
  "threads": [
    { "thread_idx": 0, "questions": ["<question 1>", "<question 2>"] }
  ]
}`;

async function extractQuestionsViaClaude(
  env: Env,
  threads: RawRedditThread[],
): Promise<Array<{ thread_idx: number; questions: string[] }>> {
  if (threads.length === 0) return [];
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");

  const userMessage = threads
    .map(
      (t, i) =>
        `--- Thread ${i} (r/${t.subreddit}) ---
TITLE: ${t.title}
${t.body ? `BODY: ${t.body}` : ""}
${t.top_comments.length > 0 ? `TOP COMMENTS:\n${t.top_comments.map((c, j) => `[${j}] ${c}`).join("\n")}` : ""}`,
    )
    .join("\n\n");

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      system: [{ type: "text", text: QUESTION_EXTRACTOR_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage.slice(0, 24000) }],
      max_tokens: 3000,
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!resp.ok) throw new Error(`Claude question-extract: ${resp.status} ${await resp.text()}`);

  const json = (await resp.json()) as { content: { type: string; text: string }[] };
  const raw = json.content?.[0]?.text || "";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return [];
  try {
    const parsed = JSON.parse(m[0]) as { threads?: Array<{ thread_idx: number; questions: string[] }> };
    return parsed.threads || [];
  } catch {
    return [];
  }
}

/**
 * Pull every Reddit thread that has been cited on this client's tracked
 * queries in the window, fetch each thread, extract questions.
 * Returns up to ~100 questions across all sourced threads.
 */
export async function extractRedditQuestionsForClient(
  env: Env,
  clientSlug: string,
  days: number,
): Promise<RedditQuestion[]> {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const rows = (
    await env.DB.prepare(
      `SELECT cr.cited_urls
         FROM citation_runs cr
         JOIN citation_keywords ck ON ck.id = cr.keyword_id
        WHERE ck.client_slug = ?
          AND cr.run_at >= ?
          AND cr.cited_urls LIKE '%reddit.com%'`,
    )
      .bind(clientSlug, since)
      .all<{ cited_urls: string }>()
  ).results;

  const threadUrls = new Set<string>();
  const THREAD_RE = /(https?:\/\/(?:www\.)?reddit\.com\/r\/[^/]+\/comments\/[^/?]+(?:\/[^/?]+)?)/i;
  for (const r of rows) {
    let urls: string[] = [];
    try {
      urls = JSON.parse(r.cited_urls || "[]") as string[];
    } catch {
      continue;
    }
    for (const u of urls) {
      const m = String(u).match(THREAD_RE);
      if (m) threadUrls.add(m[1]);
    }
  }

  // Fetch raw content for up to 20 unique threads. Reddit fetches run
  // in parallel since they don't depend on each other.
  const urlList = [...threadUrls].slice(0, 20);
  const fetched = await Promise.all(urlList.map((u) => fetchRawRedditThread(u)));
  const threads: RawRedditThread[] = fetched.filter((t): t is RawRedditThread => t !== null);

  // One Claude pass that converts raw thread content into normalized
  // search-intent questions. Catches implicit asks ("Looking for X in
  // Honolulu") that the old regex-only extractor dropped.
  const extracted = await extractQuestionsViaClaude(env, threads);
  const byIdx = new Map(extracted.map((e) => [e.thread_idx, e.questions]));

  const out: FAQCandidate[] = [];
  threads.forEach((t, i) => {
    const questions = byIdx.get(i) || [];
    for (const q of questions) {
      out.push({
        question: q,
        source: "reddit_thread",
        source_subreddit: t.subreddit,
        source_thread_url: t.url,
        source_thread_title: t.title,
      });
    }
  });
  return out;
}

// --------------------------------------------------------------------------
// Step 1b: Extract FAQ candidates from this client's own citation_runs.
//
// This is the higher-signal source: for every tracked prompt where the
// AI engine has been answering without naming the client, we have a
// gap. A FAQ on the client's domain that answers that exact prompt
// closes the gap on the next engine crawl.
//
// Priority levels:
//   tracked_prompt_gap     — client_cited = 0 across multiple runs;
//                            schema deployment puts the client into
//                            the next answer
//   tracked_prompt_defense — client_cited = 1 alongside multiple
//                            competitors; strengthens citation share
//
// We cap candidates to keep Claude $ bounded. Priority gaps fill
// slots first, defenses use remaining capacity.
// --------------------------------------------------------------------------

interface KeywordRollup {
  keyword: string;
  total_runs: number;
  cited_runs: number;
  engines: Set<string>;
  competitors: Set<string>;
}

export async function extractFAQCandidatesFromCitationRuns(
  env: Env,
  clientSlug: string,
  days: number,
  maxCandidates = 24,
): Promise<FAQCandidate[]> {
  const since = Math.floor(Date.now() / 1000) - days * 86400;

  // Pull every citation_run for this client in the window, including
  // the keyword text and whether the client was cited. cited_entities
  // gives us competitor names so we can flag the defense case.
  const rows = (
    await env.DB.prepare(
      `SELECT ck.keyword,
              cr.engine,
              cr.client_cited,
              cr.cited_entities
         FROM citation_runs cr
         JOIN citation_keywords ck ON ck.id = cr.keyword_id
        WHERE ck.client_slug = ?
          AND ck.active = 1
          AND cr.run_at >= ?`,
    )
      .bind(clientSlug, since)
      .all<{ keyword: string; engine: string; client_cited: number; cited_entities: string | null }>()
  ).results;

  if (rows.length === 0) return [];

  // Roll up by keyword. Track engine coverage and competitor presence.
  const byKeyword = new Map<string, KeywordRollup>();
  for (const r of rows) {
    let rollup = byKeyword.get(r.keyword);
    if (!rollup) {
      rollup = {
        keyword: r.keyword,
        total_runs: 0,
        cited_runs: 0,
        engines: new Set(),
        competitors: new Set(),
      };
      byKeyword.set(r.keyword, rollup);
    }
    rollup.total_runs++;
    if (r.client_cited) rollup.cited_runs++;
    rollup.engines.add(r.engine);
    if (r.cited_entities) {
      try {
        const ents = JSON.parse(r.cited_entities) as Array<{ name?: string }>;
        for (const e of ents) {
          if (e && typeof e.name === "string" && e.name.trim().length > 0) {
            rollup.competitors.add(e.name.trim().toLowerCase());
          }
        }
      } catch {
        // skip
      }
    }
  }

  // Classify each keyword and sort priority gaps first.
  type Classified = { rollup: KeywordRollup; priority: 1 | 2 | 3 };
  const classified: Classified[] = [];
  for (const rollup of byKeyword.values()) {
    if (rollup.total_runs === 0) continue;
    // Need at least 2 runs to consider — single-run signal is too thin.
    if (rollup.total_runs < 2) continue;

    const cited_ratio = rollup.cited_runs / rollup.total_runs;
    if (cited_ratio === 0) {
      // Pure gap. Highest priority.
      classified.push({ rollup, priority: 1 });
    } else if (cited_ratio < 1 && rollup.competitors.size >= 2) {
      // Partial cite + competitors. Defense candidate.
      classified.push({ rollup, priority: 2 });
    } else if (cited_ratio < 1) {
      // Partial cite, no competitor pressure. Lower priority.
      classified.push({ rollup, priority: 3 });
    }
    // cited_ratio === 1 means full coverage; no FAQ needed.
  }

  // Order: priority asc (1 first), then total_runs desc (higher confidence first).
  classified.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.rollup.total_runs - a.rollup.total_runs;
  });

  const out: FAQCandidate[] = [];
  for (const { rollup, priority } of classified.slice(0, maxCandidates)) {
    out.push({
      question: rollup.keyword,
      source: priority === 1 ? "tracked_prompt_gap" : "tracked_prompt_defense",
      source_keyword: rollup.keyword,
      source_engines: [...rollup.engines],
      source_run_count: rollup.total_runs,
      source_competitors: [...rollup.competitors].slice(0, 6),
    });
  }
  return out;
}

// --------------------------------------------------------------------------
// Step 2: Cluster + dedupe via Claude
// --------------------------------------------------------------------------

const CLUSTER_SYSTEM = `You cluster Reddit questions to find the canonical phrasing of each distinct SEARCH INTENT.

You will receive a JSON array of questions, each with the source subreddit and thread URL. Your job:

1. Group questions that share the SAME search intent — what the asker would have typed into a search engine. Different intents stay in different clusters even when they could happen at the same business. Examples:
   - "best comedy in Honolulu" and "where to see stand-up in Oahu" → SAME cluster (comedy search intent)
   - "best comedy in Honolulu" and "live music venues in Oahu" → DIFFERENT clusters (comedy vs. music)
   - "theater in Honolulu" and "musicals in Oahu" → DIFFERENT clusters (theatre vs. musical theatre is similar but distinct)
   - "where to see a show in Honolulu" + "what to do in Oahu at night" → DIFFERENT clusters (specific show vs. nightlife)
   Prefer SPLITTING over MERGING. Each FAQ should answer one specific kind of search.

2. For each cluster, pick the CANONICAL phrasing — the version that most naturally fits a FAQPage on a business website. Should be:
   - First-person from the asker's perspective ("Which bank should I use for my LLC?")
   - 30-100 characters
   - Plain language, no Reddit-specific slang
   - Specific about the category being asked about (don't generalize "comedy" or "concerts" into "live entertainment")
   - Question form, ends with ?

3. Return between 4 and 12 clusters. If the input has fewer distinct intents than 4, return what you have. Rank by cluster_size descending.

4. Only include clusters with at least 1 source.

Return STRICT JSON, no prose:
{
  "clusters": [
    {
      "canonical": "<question>",
      "variants": ["<observed phrasing 1>", "<observed phrasing 2>"],
      "source_indices": [0, 3, 7]
    }
  ]
}`;

export async function clusterAndDedupeQuestions(
  env: Env,
  questions: FAQCandidate[],
): Promise<ClusteredQuestion[]> {
  if (questions.length === 0) return [];
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");

  // Source context flows into the clusterer so it can group across
  // mixed inputs. Reddit candidates show subreddit; tracked-prompt
  // candidates show the keyword itself.
  const userMessage = JSON.stringify(
    questions.map((q, i) => ({
      i,
      question: q.question,
      source: q.source,
      ...(q.source === "reddit_thread"
        ? { subreddit: q.source_subreddit }
        : { keyword: q.source_keyword, run_count: q.source_run_count }),
    })),
    null,
    0,
  ).slice(0, 12000);

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      system: [{ type: "text", text: CLUSTER_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage }],
      max_tokens: 3500,
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!resp.ok) throw new Error(`Claude cluster: ${resp.status} ${await resp.text()}`);

  const json = (await resp.json()) as { content: { type: string; text: string }[] };
  const raw = json.content?.[0]?.text || "";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return [];
  let parsed: { clusters?: Array<{ canonical: string; variants: string[]; source_indices: number[] }> };
  try {
    parsed = JSON.parse(m[0]);
  } catch {
    return [];
  }
  const clusters = parsed.clusters || [];
  return clusters.map((c) => {
    const candidates = (c.source_indices || []).map((i) => questions[i]).filter(Boolean);
    // Dedupe by a source-appropriate key, then map to the unified
    // ClusterSource shape so downstream code is type-uniform.
    const seenKeys = new Set<string>();
    const uniqueSources: ClusterSource[] = [];
    for (const q of candidates) {
      const key = q.source === "reddit_thread"
        ? `r:${q.source_thread_url || ""}`
        : `k:${q.source_keyword || ""}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      uniqueSources.push({
        source: q.source,
        subreddit: q.source_subreddit,
        thread_url: q.source_thread_url,
        thread_title: q.source_thread_title,
        keyword: q.source_keyword,
        engines: q.source_engines,
        competitors: q.source_competitors,
      });
    }
    return {
      canonical: c.canonical,
      variants: c.variants || [],
      sources: uniqueSources,
      cluster_size: c.source_indices?.length || 0,
    };
  });
}

// --------------------------------------------------------------------------
// Step 3: Generate FAQ answers in client voice
// --------------------------------------------------------------------------

const ANSWER_SYSTEM = `You generate FAQPage answers for a specific business based on their business profile.

Each answer must:
- Be 80-280 characters (Schema.org sweet spot — gets cited cleanly)
- Speak in the business's voice based on the provided context
- Answer the specific question; no marketing fluff
- Avoid hedging ("we believe", "we think", "potentially")
- Avoid superlatives ("best", "leading", "world-class") unless verifiable
- Use specific, concrete language ("we offer overdraft protection up to $X" not "we offer comprehensive overdraft solutions")
- Never include URLs or phone numbers — those belong in other Schema types
- Never make up facts about the business — if the business context doesn't have the answer, use generic but factually correct industry language

Return STRICT JSON:
{
  "faqs": [
    { "question": "<canonical question>", "answer": "<answer>" }
  ]
}`;

export async function generateFAQAnswers(
  env: Env,
  clusters: ClusteredQuestion[],
  businessContext: { name: string; description: string; vertical?: string; url?: string },
): Promise<FAQEntry[]> {
  if (clusters.length === 0) return [];
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");

  const questions = clusters.slice(0, 10).map((c) => c.canonical);
  const userMessage = `Business name: ${businessContext.name}
${businessContext.vertical ? `Vertical: ${businessContext.vertical}` : ""}
${businessContext.url ? `URL: ${businessContext.url}` : ""}

Business description:
${businessContext.description}

Generate FAQ answers for these questions (each 80-280 chars, in this business's voice):

${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Return JSON only.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      system: [{ type: "text", text: ANSWER_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage }],
      max_tokens: 3500,
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!resp.ok) throw new Error(`Claude FAQ: ${resp.status} ${await resp.text()}`);

  const json = (await resp.json()) as { content: { type: string; text: string }[] };
  const raw = json.content?.[0]?.text || "";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return [];
  let parsed: { faqs?: Array<{ question: string; answer: string }> };
  try {
    parsed = JSON.parse(m[0]);
  } catch {
    return [];
  }

  const byQuestion = new Map(
    (parsed.faqs || []).map((f) => [f.question.trim().toLowerCase(), f.answer]),
  );

  return clusters.slice(0, 10).map((c) => {
    // Roll up source-type counts for the evidence panel so the
    // dashboard can show "3 from tracked-prompt gaps, 1 from reddit"
    // and prove why each FAQ exists.
    const sources_by_type: Record<FAQCandidateSource, number> = {
      reddit_thread: 0,
      tracked_prompt_gap: 0,
      tracked_prompt_defense: 0,
    };
    for (const s of c.sources) sources_by_type[s.source]++;
    return {
      question: c.canonical,
      answer: byQuestion.get(c.canonical.trim().toLowerCase()) || "",
      evidence: {
        cluster_size: c.cluster_size,
        sources_by_type,
        top_sources: c.sources.slice(0, 3),
      },
    };
  }).filter((e) => e.answer.length > 0);
}

// --------------------------------------------------------------------------
// Step 3b: Quality grader — filters FAQs before they can ship.
//
// Without this, Sonnet shoehorns the business into questions it doesn't
// really answer (e.g., a performing-arts theatre answering "best comedy
// clubs in Oahu"). The grader is a single Haiku call that scores each
// generated FAQ on two axes and returns pass/fail per FAQ. Failing
// FAQs are dropped before persistence so they can never be deployed.
//
// Two checks:
//   - Relevance: does the business actually answer this question, or
//     is the model stretching to make it fit?
//   - Faithfulness: does the answer only make claims supported by the
//     business_description? Specific numbers, services, or amenities
//     not in the description fail this check.
// --------------------------------------------------------------------------

const GRADER_SYSTEM = `You grade FAQ entries generated for a business website. For each FAQ, return whether it should be PUBLISHED on this business's site or FILTERED OUT.

Two pass criteria. Both must be true to publish.

1. RELEVANCE: The business genuinely answers this question. If the model shoehorned the business into a question it doesn't really fit (e.g., a performing-arts theatre answering "best comedy clubs in town"), filter out. If the business legitimately serves this audience, pass.

2. FAITHFULNESS: Every specific claim in the answer is supported by the business description. Specific numbers (capacity, year, address), specific services, specific amenities — if the answer states a fact not in the business description, filter out. Generic language about the industry that doesn't claim a specific business fact is fine.

Return STRICT JSON, no prose:
{
  "results": [
    { "idx": 0, "verdict": "pass" | "fail", "reason": "<short>" }
  ]
}`;

export interface GradedFAQ extends FAQEntry {
  verdict: "pass" | "fail";
  grader_reason: string;
}

export async function gradeFAQs(
  env: Env,
  faqs: FAQEntry[],
  businessContext: { name: string; description: string },
): Promise<GradedFAQ[]> {
  if (faqs.length === 0) return [];
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");

  const userMessage = `Business name: ${businessContext.name}

Business description:
${businessContext.description}

FAQs to grade:

${faqs.map((f, i) => `${i}. Q: ${f.question}\n   A: ${f.answer}`).join("\n\n")}

Return JSON only.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      system: [{ type: "text", text: GRADER_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage }],
      max_tokens: 2000,
      temperature: 0.0,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!resp.ok) throw new Error(`Claude grader: ${resp.status} ${await resp.text()}`);

  const json = (await resp.json()) as { content: { type: string; text: string }[] };
  const raw = json.content?.[0]?.text || "";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  // Fail-closed: if the grader output is unparseable, treat every FAQ
  // as failing. We never want to ship un-graded answers to a live site.
  if (!m) {
    return faqs.map((f) => ({ ...f, verdict: "fail" as const, grader_reason: "grader output unparseable" }));
  }
  let parsed: { results?: Array<{ idx: number; verdict: string; reason: string }> };
  try {
    parsed = JSON.parse(m[0]);
  } catch {
    return faqs.map((f) => ({ ...f, verdict: "fail" as const, grader_reason: "grader JSON parse error" }));
  }
  const byIdx = new Map((parsed.results || []).map((r) => [r.idx, r]));
  return faqs.map((f, i) => {
    const r = byIdx.get(i);
    if (!r) return { ...f, verdict: "fail" as const, grader_reason: "missing from grader response" };
    return {
      ...f,
      verdict: r.verdict === "pass" ? "pass" : "fail",
      grader_reason: r.reason || "",
    };
  });
}

// --------------------------------------------------------------------------
// Step 4: Render the deployable JSON-LD
// --------------------------------------------------------------------------

export function renderFAQPageSchema(faqs: FAQEntry[], canonicalUrl?: string): string {
  if (faqs.length === 0) return "";
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    ...(canonicalUrl ? { url: canonicalUrl } : {}),
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.answer,
      },
    })),
  };
  return JSON.stringify(schema, null, 2);
}

// --------------------------------------------------------------------------
// Step 5: End-to-end orchestration
// --------------------------------------------------------------------------

export async function buildFAQDeployment(
  env: Env,
  clientSlug: string,
  businessContext: { name: string; description: string; vertical?: string; url?: string },
  days = 90,
): Promise<
  FAQDeployment & {
    deployment_id: number;
    source_thread_count: number;
    source_tracked_prompt_count: number;
    accepted_by_source: Record<FAQCandidateSource, number>;
    graded_faqs: GradedFAQ[];
    rejected_faqs: GradedFAQ[];
    auto_deployed: boolean;
  }
> {
  // Multi-source extraction. Primary signal is our own citation_runs
  // data (tracked prompts where the client has gaps or competitor
  // pressure). Secondary is Reddit threads cited by AI engines (still
  // useful for surfacing questions we don't have in our tracked set).
  // Both feed the same cluster/answer/grade pipeline.
  const [citationCandidates, redditCandidates] = await Promise.all([
    extractFAQCandidatesFromCitationRuns(env, clientSlug, days),
    extractRedditQuestionsForClient(env, clientSlug, days),
  ]);

  // Merge with a simple dedupe: candidates with the same lowercased
  // question text collapse to one row, preserving the higher-priority
  // source. Order matters because the cluster pass capacity is bounded.
  const seenQuestions = new Map<string, FAQCandidate>();
  for (const c of citationCandidates) {
    const key = c.question.trim().toLowerCase();
    if (!seenQuestions.has(key)) seenQuestions.set(key, c);
  }
  for (const c of redditCandidates) {
    const key = c.question.trim().toLowerCase();
    if (!seenQuestions.has(key)) seenQuestions.set(key, c);
  }
  const questions: FAQCandidate[] = [...seenQuestions.values()];
  const sourceThreadCount = new Set(
    redditCandidates.map((q) => q.source_thread_url).filter(Boolean),
  ).size;
  const sourceTrackedPromptCount = citationCandidates.length;
  console.log(`[faq-build] ${clientSlug}: ${citationCandidates.length} citation candidates + ${redditCandidates.length} reddit candidates = ${questions.length} unique to cluster`);
  const clusters = await clusterAndDedupeQuestions(env, questions);
  const rawFaqs = await generateFAQAnswers(env, clusters, businessContext);

  // Quality grader pass. Filters out FAQs where the business doesn't
  // really answer the question (shoehorning) or where the answer makes
  // claims unsupported by the business description (fabrication).
  // Anything that fails the grader never gets persisted into the
  // schema -- it lives only in the rejected log for audit.
  const graded = await gradeFAQs(env, rawFaqs, businessContext);
  const passing = graded.filter((g) => g.verdict === "pass");
  const rejected = graded.filter((g) => g.verdict === "fail");

  // Strip grader metadata before they hit the schema.
  const cleanFaqs: FAQEntry[] = passing.map((g) => ({
    question: g.question,
    answer: g.answer,
    evidence: g.evidence,
  }));

  const schema = cleanFaqs.length > 0 ? renderFAQPageSchema(cleanFaqs, businessContext.url) : "";

  const preview = cleanFaqs
    .map((f) => {
      // Source-aware meta line. Reddit candidates show subreddit;
      // tracked-prompt candidates show the keyword that drove the
      // FAQ to exist. Defensive against undefined fields.
      const sourceLabels = (f.evidence.top_sources || []).slice(0, 3).map((s) => {
        if (s.source === "reddit_thread" && s.subreddit) return `r/${escHtml(s.subreddit)}`;
        if (s.keyword) return `"${escHtml(s.keyword)}"`;
        return "";
      }).filter(Boolean).join(", ");
      return `<div class="faq-entry">
  <div class="faq-q">${escHtml(f.question)}</div>
  <div class="faq-a">${escHtml(f.answer)}</div>
  <div class="faq-meta">From ${f.evidence.cluster_size} source${f.evidence.cluster_size === 1 ? "" : "s"}${sourceLabels ? ` — ${sourceLabels}` : ""}</div>
</div>`;
    })
    .join("\n");

  const generatedAt = Math.floor(Date.now() / 1000);
  const ctxHash = await sha256Short(`${businessContext.name}|${businessContext.description}`);

  // Supersede prior drafts so /reddit-faq always shows the freshest build.
  await env.DB.prepare(
    `UPDATE reddit_faq_deployments
        SET status = 'superseded', updated_at = unixepoch()
      WHERE client_slug = ? AND status = 'draft'`,
  ).bind(clientSlug).run();

  // No passing FAQs means we have nothing safe to ship. Persist with
  // a distinct status so the UI can explain rather than going blank.
  const initialStatus = cleanFaqs.length === 0 ? "no_faq_passed" : "draft";

  const insertResult = await env.DB.prepare(
    `INSERT INTO reddit_faq_deployments
       (client_slug, generated_at, faq_count, source_thread_count,
        faqs_json, schema_json_ld, schema_size_bytes,
        status, business_context_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      clientSlug,
      generatedAt,
      cleanFaqs.length,
      sourceThreadCount,
      JSON.stringify(cleanFaqs),
      schema,
      schema.length,
      initialStatus,
      ctxHash,
    )
    .run();
  const deploymentId = Number(insertResult.meta?.last_row_id || 0);

  // Auto-deploy if any FAQ passed the grader. With the relevance and
  // faithfulness checks in front of it, the surviving FAQs are safe
  // to ship. "We ship the work" — no click.
  let autoDeployed = false;
  if (cleanFaqs.length > 0 && deploymentId > 0) {
    try {
      await deployFAQToSite(env, clientSlug, deploymentId);
      autoDeployed = true;
    } catch (e) {
      console.error(`reddit-faq auto-deploy failed for ${clientSlug}:`, e);
    }
  }

  // Roll up acceptance counts by source type so the verification
  // endpoint and the dashboard can show "X of these FAQs came from
  // tracked-prompt gaps; Y came from Reddit."
  const accepted_by_source: Record<FAQCandidateSource, number> = {
    reddit_thread: 0,
    tracked_prompt_gap: 0,
    tracked_prompt_defense: 0,
  };
  for (const f of cleanFaqs) {
    for (const k of Object.keys(f.evidence.sources_by_type) as FAQCandidateSource[]) {
      if (f.evidence.sources_by_type[k] > 0) accepted_by_source[k]++;
    }
  }

  return {
    client_slug: clientSlug,
    client_name: businessContext.name,
    generated_at: generatedAt,
    faq_count: cleanFaqs.length,
    faqs: cleanFaqs,
    schema_json_ld: schema,
    schema_size_bytes: schema.length,
    human_preview_html: preview,
    deployment_id: deploymentId,
    source_thread_count: sourceThreadCount,
    source_tracked_prompt_count: sourceTrackedPromptCount,
    accepted_by_source,
    graded_faqs: graded,
    rejected_faqs: rejected,
    auto_deployed: autoDeployed,
  };
}

/**
 * Promote a draft FAQ deployment to live by writing into the existing
 * schema_injections table. The client-side snippet picks up approved
 * rows on its next cache TTL. Idempotent — safe to call twice.
 */
export async function deployFAQToSite(
  env: Env,
  clientSlug: string,
  deploymentId: number,
): Promise<{ injection_id: number; already_deployed: boolean }> {
  const row = await env.DB.prepare(
    `SELECT id, schema_json_ld, schema_injection_id, status
       FROM reddit_faq_deployments
      WHERE id = ? AND client_slug = ?`,
  ).bind(deploymentId, clientSlug).first<{
    id: number;
    schema_json_ld: string;
    schema_injection_id: number | null;
    status: string;
  }>();
  if (!row) throw new Error(`deployment ${deploymentId} not found for ${clientSlug}`);
  if (row.schema_injection_id && row.status === "deployed") {
    return { injection_id: row.schema_injection_id, already_deployed: true };
  }

  // Supersede any prior FAQPage injection for this client so only one
  // FAQ schema is live at a time.
  await env.DB.prepare(
    `UPDATE schema_injections
        SET status = 'superseded', updated_at = unixepoch()
      WHERE client_slug = ? AND schema_type = 'FAQPage' AND status = 'approved'`,
  ).bind(clientSlug).run();

  const now = Math.floor(Date.now() / 1000);
  const inj = await env.DB.prepare(
    `INSERT INTO schema_injections
       (client_slug, schema_type, json_ld, target_pages, status, approved_at, created_at, updated_at)
     VALUES (?, 'FAQPage', ?, '*', 'approved', ?, ?, ?)`,
  )
    .bind(clientSlug, row.schema_json_ld, now, now, now)
    .run();
  const injectionId = Number(inj.meta?.last_row_id || 0);

  await env.DB.prepare(
    `UPDATE reddit_faq_deployments
        SET schema_injection_id = ?, status = 'deployed',
            deployed_at = ?, updated_at = unixepoch()
      WHERE id = ?`,
  ).bind(injectionId, now, deploymentId).run();

  return { injection_id: injectionId, already_deployed: false };
}

export async function getLatestFAQDeployment(
  env: Env,
  clientSlug: string,
): Promise<{
  id: number;
  generated_at: number;
  faq_count: number;
  source_thread_count: number;
  faqs: FAQEntry[];
  schema_json_ld: string;
  schema_size_bytes: number;
  status: string;
  deployed_at: number | null;
  schema_injection_id: number | null;
} | null> {
  const row = await env.DB.prepare(
    `SELECT id, generated_at, faq_count, source_thread_count, faqs_json,
            schema_json_ld, schema_size_bytes, status, deployed_at,
            schema_injection_id
       FROM reddit_faq_deployments
      WHERE client_slug = ?
        AND status IN ('draft', 'deployed')
      ORDER BY generated_at DESC
      LIMIT 1`,
  )
    .bind(clientSlug)
    .first<{
      id: number;
      generated_at: number;
      faq_count: number;
      source_thread_count: number;
      faqs_json: string;
      schema_json_ld: string;
      schema_size_bytes: number;
      status: string;
      deployed_at: number | null;
      schema_injection_id: number | null;
    }>();
  if (!row) return null;
  let faqs: FAQEntry[] = [];
  try {
    faqs = JSON.parse(row.faqs_json);
  } catch {
    faqs = [];
  }
  return {
    id: row.id,
    generated_at: row.generated_at,
    faq_count: row.faq_count,
    source_thread_count: row.source_thread_count,
    faqs,
    schema_json_ld: row.schema_json_ld,
    schema_size_bytes: row.schema_size_bytes,
    status: row.status,
    deployed_at: row.deployed_at,
    schema_injection_id: row.schema_injection_id,
  };
}

async function sha256Short(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
