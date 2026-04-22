/**
 * Dashboard -- Voice engine
 *
 * Three jobs, all Anthropic-API-backed:
 *   1. extractVoiceProfile  -- distill uploaded samples into a style JSON
 *   2. generateDraft        -- produce a markdown draft matching the style
 *   3. scoreDraftAgainstProfile -- 0-100 voice-match score for a given body
 *
 * Uses the Claude API directly over HTTP so there's no SDK dep. Prompt
 * caching is enabled on the system-prompt side of each call to reduce
 * token spend when the same profile is reused across multiple drafts.
 *
 * Model: claude-sonnet-4-5 (latest Sonnet at build time). If the model
 * gets deprecated, update the MODEL constant below -- no other code
 * changes required.
 */

import type { Env, VoiceSample, VoiceFingerprintData } from "./types";

const MODEL = "claude-sonnet-4-5";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_SAMPLE_CHARS = 40000; // per request, safe under 200k context
const MAX_DRAFT_CHARS = 12000;

// ---------- Low-level Anthropic call ----------

interface MessageRequest {
  system: string | { type: "text"; text: string; cache_control?: { type: "ephemeral" } }[];
  messages: { role: "user" | "assistant"; content: string }[];
  max_tokens: number;
  temperature?: number;
}

interface MessageResponse {
  content: { type: string; text: string }[];
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number };
}

async function callAnthropic(env: Env, req: MessageRequest): Promise<MessageResponse> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set. Voice engine is disabled until it's added via wrangler secret.");
  }
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({ model: MODEL, ...req }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Anthropic API ${resp.status}: ${txt.slice(0, 500)}`);
  }
  return (await resp.json()) as MessageResponse;
}

/** Extract the first ```json ... ``` block or best-effort parse */
function parseJsonFromText(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  // Strip leading/trailing whitespace + commentary before first { or [
  const firstBrace = raw.search(/[{[]/);
  const lastBrace = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error("Could not find JSON in model output");
  }
  return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
}

// ---------- Phase 2: Extract voice profile ----------

const EXTRACTION_SYSTEM = `You are a style analyst. Your job is to read a batch of writing samples from a single author and produce a compact, opinionated profile of how they write. The profile will be used to prompt other language models to produce new content that reads like the same author wrote it.

Return STRICT JSON in this exact shape, no prose around it:

{
  "summary": "One paragraph (3-5 sentences) describing how this person writes, as if you are briefing a ghostwriter. Specific and opinionated. Name real patterns you see.",
  "tone": ["3 to 6 short descriptors, e.g. 'direct', 'conversational', 'no fluff', 'wry', 'plain-spoken'"],
  "sentence_length": "short" or "mixed" or "long",
  "vocabulary_notes": ["3 to 6 specific observations like 'uses \\"folks\\" over \\"customers\\"' or 'prefers Anglo-Saxon words over Latinate ones'. Quote actual phrases from the samples where relevant."],
  "forbidden_patterns": ["3 to 8 things this writer would never do, e.g. 'em dashes', 'semicolons in body copy', 'the phrase \\"elevate your business\\"', 'exclamation points in marketing copy', 'marketing cliches like \\"seamlessly integrate\\"'"],
  "structural_preferences": ["2 to 4 observations about structure, e.g. 'H2-heavy, rarely uses H3', 'bullet lists for process steps', 'short declarative lead paragraph', 'closes posts with a single-sentence paragraph'"]
}

Be specific. Vague profiles produce vague drafts. If the samples contradict each other, pick the pattern that appears most often.`;

/**
 * Build a voice profile for a client by calling Claude on the concatenated
 * samples. Stores in voice_fingerprints. Returns the parsed profile.
 */
export async function extractVoiceProfile(
  env: Env,
  clientSlug: string
): Promise<VoiceFingerprintData> {
  const samples = (
    await env.DB.prepare(
      "SELECT title, body, word_count FROM voice_samples WHERE client_slug = ? ORDER BY created_at ASC"
    )
      .bind(clientSlug)
      .all<Pick<VoiceSample, "title" | "body" | "word_count">>()
  ).results;

  if (samples.length === 0) {
    throw new Error("No samples to analyze. Upload at least one piece of writing first.");
  }

  // Concatenate samples with clear delimiters, cap to MAX_SAMPLE_CHARS to
  // keep the call cost reasonable. Trimming the longest samples first
  // biases toward having representation from ALL samples rather than a
  // single dominant one.
  const byLengthDesc = [...samples].sort((a, b) => b.body.length - a.body.length);
  const perSampleCap = Math.max(1500, Math.floor(MAX_SAMPLE_CHARS / Math.max(1, samples.length)));
  const parts: string[] = [];
  let used = 0;
  for (const s of byLengthDesc) {
    const trimmed = s.body.slice(0, perSampleCap);
    const chunk = `### Sample: ${s.title || "untitled"}\n\n${trimmed}\n\n`;
    if (used + chunk.length > MAX_SAMPLE_CHARS) break;
    parts.push(chunk);
    used += chunk.length;
  }

  const userMessage = `Here are ${parts.length} writing samples from the author. Analyze them and return the profile JSON.\n\n${parts.join("\n---\n\n")}`;

  const resp = await callAnthropic(env, {
    system: [{ type: "text", text: EXTRACTION_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMessage }],
    max_tokens: 1500,
    temperature: 0.3,
  });

  const text = (resp.content[0] && resp.content[0].type === "text") ? resp.content[0].text : "";
  const parsed = parseJsonFromText(text) as VoiceFingerprintData;

  // Defensive normalization
  const profile: VoiceFingerprintData = {
    summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
    tone: Array.isArray(parsed.tone) ? parsed.tone.filter((x) => typeof x === "string").slice(0, 10) : [],
    sentence_length: parsed.sentence_length === "short" || parsed.sentence_length === "long" ? parsed.sentence_length : "mixed",
    vocabulary_notes: Array.isArray(parsed.vocabulary_notes) ? parsed.vocabulary_notes.filter((x) => typeof x === "string").slice(0, 10) : [],
    forbidden_patterns: Array.isArray(parsed.forbidden_patterns) ? parsed.forbidden_patterns.filter((x) => typeof x === "string").slice(0, 12) : [],
    structural_preferences: Array.isArray(parsed.structural_preferences) ? parsed.structural_preferences.filter((x) => typeof x === "string").slice(0, 8) : [],
  };

  const now = Math.floor(Date.now() / 1000);
  const totalWords = samples.reduce((s, r) => s + (r.word_count || 0), 0);

  await env.DB.prepare(
    `INSERT INTO voice_fingerprints (client_slug, fingerprint_json, sample_count, total_word_count, computed_at, model)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(client_slug) DO UPDATE SET
       fingerprint_json = excluded.fingerprint_json,
       sample_count = excluded.sample_count,
       total_word_count = excluded.total_word_count,
       computed_at = excluded.computed_at,
       model = excluded.model`
  )
    .bind(clientSlug, JSON.stringify(profile), samples.length, totalWords, now, MODEL)
    .run();

  return profile;
}

// ---------- Phase 3: Generate a draft in voice ----------

const GENERATION_SYSTEM_BASE = `You are a ghostwriter. You produce content that sounds like the author whose voice profile is attached, not like AI. You follow the forbidden_patterns list absolutely.

Rules:
  - Write in Markdown. Use #, ##, ### for headings. Use - for bullets.
  - Match the author's tone, sentence length patterns, and vocabulary preferences.
  - Respect forbidden_patterns with no exceptions. If the profile says "no em dashes", use zero em dashes.
  - Do not include front-matter or meta commentary. Start with the article itself.
  - Do not explain what you wrote. Just write.

The user will give you a topic or brief. Produce a complete draft. Aim for 600-1000 words unless asked for something shorter or longer.`;

/**
 * Generate a draft in the client's voice. If no profile exists, this throws
 * so the caller can prompt the admin to build one first.
 */
export async function generateDraftInVoice(
  env: Env,
  clientSlug: string,
  title: string,
  brief?: string
): Promise<{ body_markdown: string; used_profile: boolean }> {
  const fp = await env.DB.prepare(
    "SELECT fingerprint_json FROM voice_fingerprints WHERE client_slug = ?"
  )
    .bind(clientSlug)
    .first<{ fingerprint_json: string }>();

  if (!fp) {
    throw new Error("No voice profile built yet for this client. Run 'Build profile' on the Voice page first.");
  }

  let profile: VoiceFingerprintData;
  try {
    profile = JSON.parse(fp.fingerprint_json) as VoiceFingerprintData;
  } catch {
    throw new Error("Voice profile is corrupted. Rebuild it from the Voice page.");
  }

  const profileBlock = `## VOICE PROFILE FOR THIS CLIENT

Summary: ${profile.summary || "(unset)"}

Tone descriptors: ${(profile.tone || []).join(", ") || "(unset)"}
Sentence length: ${profile.sentence_length || "mixed"}

Vocabulary:
${(profile.vocabulary_notes || []).map((x) => "- " + x).join("\n") || "- (none)"}

Forbidden patterns (absolute):
${(profile.forbidden_patterns || []).map((x) => "- " + x).join("\n") || "- (none)"}

Structural preferences:
${(profile.structural_preferences || []).map((x) => "- " + x).join("\n") || "- (none)"}`;

  const system = GENERATION_SYSTEM_BASE + "\n\n" + profileBlock;

  const userMessage = brief
    ? `Write a draft titled: "${title}"\n\nBrief / angle:\n${brief}`
    : `Write a draft titled: "${title}"`;

  const resp = await callAnthropic(env, {
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMessage }],
    max_tokens: 3500,
    temperature: 0.6,
  });

  const text = (resp.content[0] && resp.content[0].type === "text") ? resp.content[0].text : "";
  return { body_markdown: text.trim(), used_profile: true };
}

// ---------- Phase 4: Score a draft against the profile ----------

const SCORING_SYSTEM = `You are a style judge. You evaluate how closely a piece of writing matches a given voice profile. You return a single 0-100 integer score and a one-sentence justification.

Scoring rubric:
  - 90-100: indistinguishable from the author's own writing
  - 75-89:  clearly their voice with a few small tells
  - 60-74:  in the neighborhood but noticeably off
  - 40-59:  generic content, only loosely matches
  - 0-39:   clearly not their voice, AI-smelling, or violates forbidden_patterns

Return STRICT JSON:
{
  "score": 0-100 integer,
  "justification": "one sentence, specific and concrete"
}`;

export async function scoreDraftAgainstProfile(
  env: Env,
  clientSlug: string,
  draftBody: string
): Promise<{ score: number; justification: string } | null> {
  const fp = await env.DB.prepare(
    "SELECT fingerprint_json FROM voice_fingerprints WHERE client_slug = ?"
  )
    .bind(clientSlug)
    .first<{ fingerprint_json: string }>();

  if (!fp) return null; // no profile, no score

  let profile: VoiceFingerprintData;
  try {
    profile = JSON.parse(fp.fingerprint_json) as VoiceFingerprintData;
  } catch {
    return null;
  }

  const trimmed = draftBody.slice(0, MAX_DRAFT_CHARS);
  if (trimmed.trim().length < 50) return null; // too short to score

  const userMessage = `VOICE PROFILE:\n${JSON.stringify(profile, null, 2)}\n\n---\n\nDRAFT TO SCORE:\n\n${trimmed}`;

  try {
    const resp = await callAnthropic(env, {
      system: [{ type: "text", text: SCORING_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage }],
      max_tokens: 400,
      temperature: 0.2,
    });
    const text = (resp.content[0] && resp.content[0].type === "text") ? resp.content[0].text : "";
    const parsed = parseJsonFromText(text) as { score?: unknown; justification?: unknown };
    const raw = typeof parsed.score === "number" ? parsed.score : Number(parsed.score);
    const score = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw as number))) : null;
    const justification = typeof parsed.justification === "string" ? parsed.justification.trim().slice(0, 300) : "";
    if (score === null) return null;
    return { score, justification };
  } catch {
    return null;
  }
}
