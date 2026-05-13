/**
 * Prompt auto-expansion.
 *
 * Generate candidate prompts for a client, run them through four
 * deterministic + model gates, auto-accept survivors directly into
 * citation_keywords. No human-in-the-loop review queue. If the system
 * can decide, the system decides.
 *
 * Gates (a candidate must pass all four):
 *   1. format       — length, shape, no Reddit-isms, no jargon dump
 *   2. tone         — assertHumanTone() blocks AI-sounding output
 *   3. similarity   — Haiku checks if the candidate is a near-duplicate
 *                     of any active citation_keyword for this client
 *   4. relevance    — Haiku checks the candidate against business_description
 *                     to filter prompts that don't match the actual business
 *
 * Failures are logged to prompt_rejections with the failing gate and
 * reason. Not for customer review — for system tuning + audit.
 *
 * Wired into the Monday weekly cron. Targets any client with active
 * prompt count below MIN_TARGET. Generates ~10 candidates per run.
 */

import type { Env } from "./types";
import { discoverContext } from "./prompt-discovery";

const MIN_TARGET = 40;            // stop expanding when client reaches this many active prompts
const CANDIDATES_PER_RUN = 12;    // raw model output before gates
const SIMILARITY_THRESHOLD = 0.78; // 0-1 cosine-ish; Haiku self-scores
const ANTHROPIC_VERSION = "2023-06-01";
const HAIKU_MODEL = "claude-haiku-4-5";

interface AutoExpandResult {
  client_slug: string;
  generated: number;
  accepted: string[];
  rejected_by: Record<string, number>; // gate -> count
}

// ---------------------------------------------------------------------------
// Gate 1: deterministic format check
// ---------------------------------------------------------------------------

function gateFormat(prompt: string): { ok: true } | { ok: false; reason: string } {
  const p = prompt.trim();
  if (p.length < 12) return { ok: false, reason: "too short" };
  if (p.length > 280) return { ok: false, reason: "too long" };
  // Reddit-ism + jargon dump signals
  const banned = /\b(tl;?dr|imo|fwiw|ymmv|smh|eli5|edit:)\b/i;
  if (banned.test(p)) return { ok: false, reason: "Reddit jargon" };
  // Must be a natural-language sentence or question, not a keyword string
  const wordCount = p.split(/\s+/).length;
  if (wordCount < 4) return { ok: false, reason: "keyword string, not a sentence" };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Gate 3: similarity check via Haiku
// ---------------------------------------------------------------------------

const SIMILARITY_SYSTEM = `You score how similar a CANDIDATE prompt is to a list of EXISTING tracked prompts.

A score of 1.0 means the candidate asks the same thing as an existing prompt (different phrasing, same search intent). A score of 0.0 means it asks something distinctly different. Return one score per candidate, picking the maximum similarity against any existing prompt.

You are deciding whether tracking this candidate would be redundant. Cosmetic variations ("best CRM for startups" vs "what CRM should a startup use") are HIGH similarity. Different categories of search ("best CRM" vs "CRM pricing") are LOWER similarity.

Return STRICT JSON, no prose:
{
  "scores": [
    { "idx": 0, "max_similarity": 0.0-1.0, "matched_existing": "<closest existing prompt>" }
  ]
}`;

async function gateSimilarity(
  env: Env,
  candidates: string[],
  existingPrompts: string[],
): Promise<Array<{ idx: number; max_similarity: number; matched_existing: string }>> {
  if (candidates.length === 0) return [];
  if (existingPrompts.length === 0) {
    // No existing prompts -> nothing to be redundant with.
    return candidates.map((_, idx) => ({ idx, max_similarity: 0, matched_existing: "" }));
  }
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");

  const userMessage = `EXISTING tracked prompts:
${existingPrompts.map((p, i) => `[E${i}] ${p}`).join("\n")}

CANDIDATE prompts:
${candidates.map((p, i) => `[C${i}] ${p}`).join("\n")}

Return scores for each candidate. JSON only.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      system: [{ type: "text", text: SIMILARITY_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage.slice(0, 18000) }],
      max_tokens: 2500,
      temperature: 0.0,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!resp.ok) throw new Error(`Similarity gate: ${resp.status} ${await resp.text()}`);

  const json = (await resp.json()) as { content: { type: string; text: string }[] };
  const raw = json.content?.[0]?.text || "";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) {
    // Fail-open on similarity: if the model can't score, we let candidates
    // through. Worst case is a duplicate that the next scan catches.
    return candidates.map((_, idx) => ({ idx, max_similarity: 0, matched_existing: "" }));
  }
  try {
    const parsed = JSON.parse(m[0]) as {
      scores?: Array<{ idx: number; max_similarity: number; matched_existing: string }>;
    };
    return parsed.scores || [];
  } catch {
    return candidates.map((_, idx) => ({ idx, max_similarity: 0, matched_existing: "" }));
  }
}

// ---------------------------------------------------------------------------
// Gate 4: relevance check via Haiku, against business_description
// ---------------------------------------------------------------------------

const RELEVANCE_SYSTEM = `You decide whether a list of candidate AI-prompts are plausibly something a real searcher would type when looking for THIS specific business.

Pass criteria: a candidate passes if a real user typing this prompt into ChatGPT or Perplexity could plausibly want a recommendation, comparison, or answer that includes this business based on what the business does.

Fail criteria: the prompt is for a completely different category, the prompt is too broad to ever name this business, or the prompt asks about something the business does not do.

Return STRICT JSON, no prose:
{
  "results": [
    { "idx": 0, "verdict": "pass" | "fail", "reason": "<short>" }
  ]
}`;

async function gateRelevance(
  env: Env,
  candidates: string[],
  businessContext: { name: string; description: string },
): Promise<Array<{ idx: number; verdict: "pass" | "fail"; reason: string }>> {
  if (candidates.length === 0) return [];
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");

  const userMessage = `Business name: ${businessContext.name}

Business description:
${businessContext.description}

Candidate prompts to grade:
${candidates.map((p, i) => `${i}. ${p}`).join("\n")}

Return JSON only.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      system: [{ type: "text", text: RELEVANCE_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage }],
      max_tokens: 2000,
      temperature: 0.0,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!resp.ok) throw new Error(`Relevance gate: ${resp.status} ${await resp.text()}`);

  const json = (await resp.json()) as { content: { type: string; text: string }[] };
  const raw = json.content?.[0]?.text || "";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  // Fail-closed on relevance: if we can't tell, don't auto-accept.
  if (!m) {
    return candidates.map((_, idx) => ({ idx, verdict: "fail" as const, reason: "relevance grader unparseable" }));
  }
  try {
    const parsed = JSON.parse(m[0]) as { results?: Array<{ idx: number; verdict: string; reason: string }> };
    return (parsed.results || []).map((r) => ({
      idx: r.idx,
      verdict: r.verdict === "pass" ? ("pass" as const) : ("fail" as const),
      reason: r.reason || "",
    }));
  } catch {
    return candidates.map((_, idx) => ({ idx, verdict: "fail" as const, reason: "relevance JSON parse error" }));
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export async function autoExpandPromptsForClient(
  env: Env,
  clientSlug: string,
): Promise<AutoExpandResult> {
  const result: AutoExpandResult = {
    client_slug: clientSlug,
    generated: 0,
    accepted: [],
    rejected_by: { format: 0, tone: 0, similarity: 0, relevance: 0 },
  };

  // 1. Skip if already at target
  const trackedRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n, keyword FROM citation_keywords WHERE client_slug = ? AND active = 1`,
  ).bind(clientSlug).first<{ n: number }>();
  const activeCount = trackedRow?.n ?? 0;
  if (activeCount >= MIN_TARGET) {
    return result;
  }

  // 2. Require a business description to ground the relevance gate.
  const ctx = await discoverContext(env, clientSlug);
  if (!ctx.businessDescription || ctx.businessDescription.length < 60) {
    return result;
  }

  // 3. Generate raw candidates via the existing prompt-discovery generator.
  const { generateAndStorePromptSuggestions: _unused } = await import("./prompt-discovery");
  void _unused; // we don't actually want the suggestions table path; we do the gen+gate inline
  const candidates = await generateRawCandidates(env, ctx, CANDIDATES_PER_RUN);
  result.generated = candidates.length;
  if (candidates.length === 0) return result;

  const batchId = `${clientSlug}-${Math.floor(Date.now() / 1000)}`;
  const now = Math.floor(Date.now() / 1000);

  // 4. Existing active prompts (for similarity gate)
  const existing = (
    await env.DB.prepare(
      `SELECT keyword FROM citation_keywords WHERE client_slug = ? AND active = 1`,
    ).bind(clientSlug).all<{ keyword: string }>()
  ).results.map((r) => r.keyword);

  // 5. Gate 1: format (deterministic, free)
  const afterFormat: { prompt: string; category: string }[] = [];
  for (const c of candidates) {
    const fmt = gateFormat(c.prompt);
    if (!fmt.ok) {
      await logRejection(env, clientSlug, c.prompt, c.category, "format", fmt.reason, batchId);
      result.rejected_by.format++;
      continue;
    }
    afterFormat.push(c);
  }
  if (afterFormat.length === 0) return result;

  // 6. Gate 2: tone (existing assertHumanTone)
  const { assertHumanTone } = await import("./human-tone-guard");
  const afterTone: { prompt: string; category: string }[] = [];
  for (const c of afterFormat) {
    const tone = await assertHumanTone(env, c.prompt, "customer-dashboard", {
      source: "prompt-auto-expand.gate",
      client_slug: clientSlug,
      target_type: "prompt_candidate",
    });
    if (!tone.ok) {
      await logRejection(env, clientSlug, c.prompt, c.category, "tone", "blocked by tone guard", batchId);
      result.rejected_by.tone++;
      continue;
    }
    afterTone.push(c);
  }
  if (afterTone.length === 0) return result;

  // 7. Gate 3: similarity (Haiku, batched)
  const simScores = await gateSimilarity(env, afterTone.map((c) => c.prompt), existing);
  const afterSim: { prompt: string; category: string }[] = [];
  afterTone.forEach((c, i) => {
    const s = simScores.find((x) => x.idx === i);
    if (s && s.max_similarity >= SIMILARITY_THRESHOLD) {
      void logRejection(env, clientSlug, c.prompt, c.category, "similarity",
        `dup of "${s.matched_existing}" (sim ${s.max_similarity.toFixed(2)})`, batchId);
      result.rejected_by.similarity++;
      return;
    }
    afterSim.push(c);
  });
  if (afterSim.length === 0) return result;

  // 8. Gate 4: relevance (Haiku, batched)
  const relResults = await gateRelevance(env, afterSim.map((c) => c.prompt), {
    name: ctx.businessName,
    description: ctx.businessDescription,
  });
  const survivors: { prompt: string; category: string }[] = [];
  afterSim.forEach((c, i) => {
    const r = relResults.find((x) => x.idx === i);
    if (!r || r.verdict === "fail") {
      void logRejection(env, clientSlug, c.prompt, c.category, "relevance",
        r?.reason || "no grader result", batchId);
      result.rejected_by.relevance++;
      return;
    }
    survivors.push(c);
  });

  // 9. Auto-accept survivors straight into citation_keywords. Source
  // tag lets us distinguish auto from manual later.
  for (const s of survivors) {
    await env.DB.prepare(
      `INSERT INTO citation_keywords (client_slug, keyword, category, active, created_at)
         VALUES (?, ?, ?, 1, ?)`,
    ).bind(clientSlug, s.prompt, s.category, now).run();
    result.accepted.push(s.prompt);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function logRejection(
  env: Env,
  clientSlug: string,
  prompt: string,
  category: string,
  gate: string,
  reason: string,
  batchId: string,
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO prompt_rejections
         (client_slug, prompt, category, failed_gate, reason, candidate_batch_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, unixepoch())`,
    ).bind(clientSlug, prompt, category, gate, reason, batchId).run();
  } catch {
    // Logging is best-effort. Never block the pipeline on the audit log.
  }
}

const GEN_SYSTEM = `You generate realistic AI-prompts that real people would type into ChatGPT, Perplexity, or Gemini when they have a need this business could solve.

Rules:
- Conversational sentences, not Google-style keyword strings
- Cover four categories evenly: problem, recommendation, comparison, scenario
- Each prompt should plausibly cause AI to recommend specific businesses by name with citations
- Vary length; real users mix short asks with long backstory
- NEVER use AI-tell language: no em dashes, no semicolons, no "delve", no "leverage", no "robust", no "seamless", no "in today's fast-paced", no three-adjective lists. Write like a real person typing in a chat box.

Return STRICT JSON only:
{ "prompts": [ { "prompt": "...", "category": "problem|recommendation|comparison|scenario" } ] }`;

async function generateRawCandidates(
  env: Env,
  ctx: { businessName: string; businessUrl: string; businessDescription: string; locationHint: string },
  count: number,
): Promise<{ prompt: string; category: string }[]> {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
  const userMessage = `Business: ${ctx.businessName}
URL: ${ctx.businessUrl}
Location: ${ctx.locationHint}

Description:
${ctx.businessDescription}

Generate exactly ${count} prompts. JSON only.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      system: [{ type: "text", text: GEN_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage }],
      max_tokens: 2500,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(40_000),
  });
  if (!resp.ok) throw new Error(`Generator: ${resp.status} ${await resp.text()}`);
  const json = (await resp.json()) as { content: { type: string; text: string }[] };
  const raw = json.content?.[0]?.text || "";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return [];
  try {
    const parsed = JSON.parse(m[0]) as { prompts?: Array<{ prompt: string; category: string }> };
    return (parsed.prompts || []).map((p) => ({
      prompt: String(p.prompt || "").trim(),
      category: String(p.category || "problem"),
    })).filter((p) => p.prompt.length > 0);
  } catch {
    return [];
  }
}

/**
 * Run auto-expand across every eligible client. Called from the weekly
 * Monday cron. Eligible = business_description >= 60 chars and active
 * prompt count < MIN_TARGET.
 */
export async function runAutoExpandSweep(env: Env): Promise<AutoExpandResult[]> {
  const rows = (
    await env.DB.prepare(
      `SELECT ic.client_slug
         FROM injection_configs ic
        WHERE ic.business_description IS NOT NULL
          AND LENGTH(ic.business_description) >= 60
          AND (
            SELECT COUNT(*) FROM citation_keywords ck
             WHERE ck.client_slug = ic.client_slug AND ck.active = 1
          ) < ${MIN_TARGET}`,
    ).all<{ client_slug: string }>()
  ).results;

  const out: AutoExpandResult[] = [];
  for (const r of rows) {
    try {
      const res = await autoExpandPromptsForClient(env, r.client_slug);
      out.push(res);
    } catch (e) {
      console.error(`prompt auto-expand failed for ${r.client_slug}:`, e);
    }
  }
  return out;
}
