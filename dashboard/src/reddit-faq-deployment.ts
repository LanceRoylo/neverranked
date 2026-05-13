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
    graded_faqs: GradedFAQ[];
    rejected_faqs: GradedFAQ[];
    auto_deployed: boolean;
  }
> {
  const questions = await extractRedditQuestionsForClient(env, clientSlug, days);
  const sourceThreadCount = new Set(questions.map((q) => q.source_thread_url)).size;
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
    .map(
      (f) => `<div class="faq-entry">
  <div class="faq-q">${escHtml(f.question)}</div>
  <div class="faq-a">${escHtml(f.answer)}</div>
  <div class="faq-meta">From ${f.evidence.cluster_size} Reddit ${f.evidence.cluster_size === 1 ? "thread" : "threads"} — ${f.evidence.top_sources.map((s) => `r/${escHtml(s.subreddit)}`).join(", ")}</div>
</div>`,
    )
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
