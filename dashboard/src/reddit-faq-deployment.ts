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

export interface RedditQuestion {
  question: string;
  source_subreddit: string;
  source_thread_url: string;
  source_thread_title: string;
}

export interface ClusteredQuestion {
  canonical: string;          // canonical phrasing
  variants: string[];         // all observed phrasings of this question
  sources: { subreddit: string; thread_url: string; thread_title: string }[];
  cluster_size: number;
}

export interface FAQEntry {
  question: string;           // canonical phrasing
  answer: string;             // voice-matched answer, 80-280 chars
  evidence: {
    cluster_size: number;
    top_sources: { subreddit: string; thread_url: string }[];
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

async function fetchRedditThreadQuestions(
  threadUrl: string,
): Promise<{ title: string; questions: string[] }> {
  const cleanedUrl = threadUrl.replace(/\/+$/, "");
  const jsonUrl = `${cleanedUrl}.json?raw_json=1&limit=15`;
  let data: unknown;
  try {
    const resp = await fetch(jsonUrl, {
      headers: { "User-Agent": REDDIT_UA, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return { title: "", questions: [] };
    data = await resp.json();
  } catch {
    return { title: "", questions: [] };
  }
  if (!Array.isArray(data) || data.length === 0) return { title: "", questions: [] };

  const listing0 = (data[0] as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  const children0 = listing0?.children as Array<Record<string, unknown>> | undefined;
  const opPost = children0?.[0]?.data as Record<string, unknown> | undefined;
  const title = String(opPost?.title || "");

  const out: string[] = [];
  if (title && /\?/.test(title)) out.push(title.trim());
  // OP body — sometimes the question is in the body
  const body = String(opPost?.selftext || "");
  if (body) {
    for (const sentence of body.split(/[.!?\n]+/)) {
      const trimmed = sentence.trim();
      if (trimmed.length > 12 && trimmed.length < 200 && /\?/.test(sentence)) {
        out.push(trimmed.endsWith("?") ? trimmed : trimmed + "?");
      }
    }
  }

  // Top comments often contain follow-up questions
  const listing1 = (data[1] as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  const children1 = listing1?.children as Array<Record<string, unknown>> | undefined;
  if (children1) {
    for (const c of children1.slice(0, 5)) {
      const cBody = String((c?.data as Record<string, unknown>)?.body || "");
      for (const sentence of cBody.split(/[.!?\n]+/)) {
        const trimmed = sentence.trim();
        if (trimmed.length > 12 && trimmed.length < 200 && /\?$/.test(sentence)) {
          out.push(trimmed.endsWith("?") ? trimmed : trimmed + "?");
        }
      }
    }
  }

  return { title, questions: out };
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

  const SUB_RE = /reddit\.com\/r\/([^/]+)/i;
  const out: RedditQuestion[] = [];

  // Process up to 20 unique threads per scan to bound API calls
  for (const url of [...threadUrls].slice(0, 20)) {
    const subMatch = url.match(SUB_RE);
    const subreddit = subMatch ? subMatch[1].toLowerCase() : "";
    const { title, questions } = await fetchRedditThreadQuestions(url);
    for (const q of questions) {
      out.push({
        question: q,
        source_subreddit: subreddit,
        source_thread_url: url,
        source_thread_title: title,
      });
    }
  }
  return out;
}

// --------------------------------------------------------------------------
// Step 2: Cluster + dedupe via Claude
// --------------------------------------------------------------------------

const CLUSTER_SYSTEM = `You cluster Reddit questions to find the canonical phrasing of each distinct question.

You will receive a JSON array of questions, each with the source subreddit and thread URL. Your job:

1. Group questions that are asking the same thing (different phrasing, same underlying question)
2. For each cluster, pick the CANONICAL phrasing — the version that most naturally fits a FAQPage on a business website. Should be:
   - First-person from the asker's perspective ("Which bank should I use for my LLC?")
   - 30-100 characters
   - Plain language, no Reddit-specific slang
   - Question form, ends with ?
3. Return up to 12 clusters total, ranked by cluster_size descending
4. Only include clusters with at least 1 source

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
  questions: RedditQuestion[],
): Promise<ClusteredQuestion[]> {
  if (questions.length === 0) return [];
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");

  const userMessage = JSON.stringify(
    questions.map((q, i) => ({
      i,
      question: q.question,
      subreddit: q.source_subreddit,
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
    const sources = (c.source_indices || []).map((i) => questions[i]).filter(Boolean);
    const uniqueSources = [
      ...new Map(sources.map((s) => [s.source_thread_url, s])).values(),
    ].map((s) => ({
      subreddit: s.source_subreddit,
      thread_url: s.source_thread_url,
      thread_title: s.source_thread_title,
    }));
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
      model: "claude-sonnet-4-7-20250514",
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

  return clusters.slice(0, 10).map((c) => ({
    question: c.canonical,
    answer: byQuestion.get(c.canonical.trim().toLowerCase()) || "",
    evidence: {
      cluster_size: c.cluster_size,
      top_sources: c.sources.slice(0, 3).map((s) => ({
        subreddit: s.subreddit,
        thread_url: s.thread_url,
      })),
    },
  })).filter((e) => e.answer.length > 0);
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
): Promise<FAQDeployment> {
  const questions = await extractRedditQuestionsForClient(env, clientSlug, days);
  const clusters = await clusterAndDedupeQuestions(env, questions);
  const faqs = await generateFAQAnswers(env, clusters, businessContext);
  const schema = renderFAQPageSchema(faqs, businessContext.url);

  const preview = faqs
    .map(
      (f) => `<div class="faq-entry">
  <div class="faq-q">${escHtml(f.question)}</div>
  <div class="faq-a">${escHtml(f.answer)}</div>
  <div class="faq-meta">From ${f.evidence.cluster_size} Reddit ${f.evidence.cluster_size === 1 ? "thread" : "threads"} — ${f.evidence.top_sources.map((s) => `r/${escHtml(s.subreddit)}`).join(", ")}</div>
</div>`,
    )
    .join("\n");

  return {
    client_slug: clientSlug,
    client_name: businessContext.name,
    generated_at: Math.floor(Date.now() / 1000),
    faq_count: faqs.length,
    faqs,
    schema_json_ld: schema,
    schema_size_bytes: schema.length,
    human_preview_html: preview,
  };
}

function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
