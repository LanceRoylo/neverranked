/**
 * FAQ schema content generator.
 *
 * Auto-generates FAQPage JSON-LD from a customer's existing page
 * content. Pipeline: scrape source URL -> Claude API extracts 5-10
 * Q&A pairs grounded in the actual page content -> wrap as FAQPage
 * schema -> grade -> insert as a 'pending' schema_injection.
 *
 * Inserted as 'pending', NEVER auto-approved. Customer or admin
 * reviews the draft in the dashboard before it goes live. This
 * keeps the "we deploy" promise honest -- we deploy what the
 * customer signs off on, not what an LLM hallucinated.
 *
 * Why this matters: most AEO tools tell customers "add FAQ schema"
 * and hand them a template. The customer then has to write the
 * actual Q&A pairs themselves, which is the work they hired us to
 * remove. Generating the content closes the gap and gives us a
 * defensible product moat against competitors who only report.
 */
import type { Env } from "./types";
import { gradeSchema } from "../../packages/aeo-analyzer/src/schema-grader";
import { logSchemaDrafted } from "./activity-log";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const MAX_INPUT_WORDS = 3000;
const USER_AGENT = "NeverRanked-FAQ-Generator/1.0";

export interface GenerateFaqResult {
  ok: boolean;
  reason?: string;
  faqs?: Array<{ question: string; answer: string }>;
  schema?: unknown;
  qualityScore?: number;
  injectionId?: number;
}

export async function generateFaqForPage(
  clientSlug: string,
  sourceUrl: string,
  env: Env,
): Promise<GenerateFaqResult> {
  if (!env.ANTHROPIC_API_KEY) {
    return { ok: false, reason: "ANTHROPIC_API_KEY not set" };
  }

  // 1. Fetch the source page.
  let html: string;
  try {
    const resp = await fetch(sourceUrl, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
    });
    if (!resp.ok) return { ok: false, reason: `HTTP ${resp.status} fetching source` };
    html = await resp.text();
  } catch (e) {
    return { ok: false, reason: `fetch failed: ${e}` };
  }

  // 2. Strip HTML and normalize. Cap at MAX_INPUT_WORDS to keep
  //    the prompt sized.
  const text = stripToText(html);
  const words = text.split(/\s+/);
  if (words.length < 200) {
    return { ok: false, reason: `source page has only ${words.length} words; need 200+` };
  }
  const inputText = words.slice(0, MAX_INPUT_WORDS).join(" ");

  // 3. Generate Q&A via Claude. Strict prompt: factual, source-grounded,
  //    no marketing fluff, no hallucination.
  const businessHost = (() => {
    try { return new URL(sourceUrl).hostname.replace(/^www\./, ""); }
    catch { return sourceUrl; }
  })();

  const generated = await callClaudeForFaqs(env.ANTHROPIC_API_KEY, businessHost, sourceUrl, inputText);
  if (!generated.ok || !generated.faqs) {
    return { ok: false, reason: generated.reason || "generation failed" };
  }
  const faqs = generated.faqs;
  if (faqs.length < 3) {
    return { ok: false, reason: `only ${faqs.length} usable Q&A pairs generated; need 3+` };
  }

  // Human-tone guard: FAQ answers get embedded as schema on the
  // customer's live site, so they read like marketing copy. Block AI
  // tells before they ship. On failure we surface to admin_inbox and
  // refuse the FAQ -- customer can re-trigger generation later.
  const faqAsText = faqs.map(qa => `${qa.question}\n${qa.answer}`).join("\n\n");
  const { assertHumanTone } = await import("./human-tone-guard");
  const tone = await assertHumanTone(env, faqAsText, "customer-publication", {
    source: "faq-generator.generateFaqForPage",
    client_slug: clientSlug,
    target_type: "faq_schema",
  });
  if (!tone.ok) {
    return { ok: false, reason: `tone-guard blocked ${tone.violations.length} pattern(s) -- see /admin/inbox/${tone.inboxId}` };
  }

  // 4. Wrap as FAQPage JSON-LD.
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${sourceUrl}#faq`,
    mainEntity: faqs.map((qa) => ({
      "@type": "Question",
      name: qa.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: qa.answer,
      },
    })),
  };

  // 5. Quality gate via the existing schema-grader.
  const grade = gradeSchema(schema);
  if (!grade.meetsDeployThreshold) {
    return {
      ok: false,
      reason: `quality gate failed (score ${grade.score}): ${grade.issues.join("; ") || "no detail"}`,
      faqs,
      schema,
      qualityScore: grade.score,
    };
  }

  // 6. Match target_pages to the source URL's path so the FAQ only
  //    fires on the page the questions are about.
  let targetPath: string;
  try { targetPath = new URL(sourceUrl).pathname; }
  catch { targetPath = "/*"; }
  const targetPages = JSON.stringify([targetPath]);

  // 7. Insert as 'pending' -- customer reviews before live.
  const result = await env.DB.prepare(
    "INSERT INTO schema_injections (client_slug, schema_type, json_ld, target_pages, status, quality_score, quality_graded_at) " +
    "VALUES (?, 'FAQPage', ?, ?, 'pending', ?, unixepoch())"
  ).bind(
    clientSlug,
    JSON.stringify(schema),
    targetPages,
    grade.score,
  ).run();

  const injectionId = Number(result.meta?.last_row_id ?? 0);

  // 8. Activity log -- shows in customer's Recent Activity feed so
  //    they know a draft is ready for review (NOT live yet).
  await logSchemaDrafted(env, clientSlug, "FAQPage", targetPath, injectionId);

  return {
    ok: true,
    faqs,
    schema,
    qualityScore: grade.score,
    injectionId,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripToText(html: string): string {
  let h = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  h = h.replace(/<style[\s\S]*?<\/style>/gi, " ");
  h = h.replace(/<nav[\s\S]*?<\/nav>/gi, " ");
  h = h.replace(/<footer[\s\S]*?<\/footer>/gi, " ");
  h = h.replace(/<[^>]+>/g, " ");
  h = h.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'");
  h = h.replace(/&\w+;/g, " ");
  return h.replace(/\s+/g, " ").trim();
}

async function callClaudeForFaqs(
  apiKey: string,
  businessHost: string,
  sourceUrl: string,
  pageText: string,
): Promise<{ ok: boolean; faqs?: Array<{ question: string; answer: string }>; reason?: string }> {
  const system = "You generate FAQ structured data for a business website. " +
    "Generate questions a real customer might ask Google or ChatGPT, with factual answers grounded ONLY in the provided page content. " +
    "Never invent details. Never use marketing fluff. Never use questions like 'Why should I choose us?'. " +
    "Each answer must be 1-3 sentences, factual, and quote-able. " +
    "Respond ONLY with valid JSON in this exact format: " +
    `{"faqs":[{"question":"...","answer":"..."},...]}`;

  const userPrompt = `Source URL: ${sourceUrl}
Business: ${businessHost}

Page content:
"""
${pageText}
"""

Generate 5-10 high-quality FAQ pairs grounded in this content. Each Q&A should help an AI engine cite this page when a real user asks the question. Output JSON only.`;

  const resp = await fetch(ANTHROPIC_ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    return { ok: false, reason: `Claude API ${resp.status}: ${err.slice(0, 200)}` };
  }
  const data = await resp.json() as { content?: { type: string; text: string }[] };
  const text = data.content?.find((b) => b.type === "text")?.text || "";
  // Be defensive about wrapper text -- pull the first {...} block.
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, reason: `no JSON block in response: ${text.slice(0, 200)}` };
  let parsed: { faqs?: Array<{ question?: string; answer?: string }> };
  try {
    parsed = JSON.parse(m[0]);
  } catch (e) {
    return { ok: false, reason: `JSON parse failed: ${e}` };
  }
  const raw = Array.isArray(parsed.faqs) ? parsed.faqs : [];
  const cleaned = raw
    .map((qa) => ({
      question: typeof qa.question === "string" ? qa.question.trim() : "",
      answer: typeof qa.answer === "string" ? qa.answer.trim() : "",
    }))
    .filter((qa) => qa.question.length > 8 && qa.answer.length > 8);
  return { ok: true, faqs: cleaned };
}
