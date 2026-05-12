/**
 * QA LLM grader. Phase 1.5 Session 2.
 *
 * Generic utility for calling OpenAI to grade an artifact and parsing
 * the structured response. Used by content_voice, citation_sanity, and
 * nvi_drift audits.
 *
 * Why OpenAI when production uses Claude: independence principle. If
 * the same model that generates content also grades it, the auditor
 * inherits the same blindspots. Production uses Claude (Haiku 4.5) for
 * most drafting; we use GPT-4o-mini here. Different vocabulary, different
 * training data, different failure modes.
 *
 * Why GPT-4o-mini specifically: cheap ($0.15/M input, $0.60/M output)
 * but capable enough for binary grading. 90% of audits use this. The
 * 10% high-stakes cases (NVI drift explanations, cross-system
 * consistency, regulatory questions) can opt into gpt-4o for better
 * reasoning -- those are passed model="gpt-4o" in the call.
 */

import type { Env } from "../types";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

export interface LLMGraderInput {
  systemPrompt: string;
  userPrompt: string;
  model?: "gpt-4o-mini" | "gpt-4o";
  maxTokens?: number;
  responseSchema?: Record<string, unknown>; // For OpenAI structured output
}

export interface LLMGraderResult<T = Record<string, unknown>> {
  ok: boolean;
  parsed: T | null;
  raw: string;
  error: string | null;
  modelUsed: string;
  usage: { input_tokens?: number; output_tokens?: number };
}

/**
 * Call OpenAI to grade the input. Returns the parsed JSON response
 * along with raw text and usage stats.
 *
 * Failure modes:
 *   - API down / network error -> returns ok=false with error reason
 *   - API returns non-JSON content -> ok=false with raw text
 *   - JSON doesn't match expected shape -> caller validates
 *
 * Caller is responsible for validating the parsed object matches
 * their expected shape. This utility just gets the bytes and parses
 * JSON; semantic validation lives in the per-audit code.
 */
export async function gradeWithLLM<T = Record<string, unknown>>(
  env: Env,
  input: LLMGraderInput,
): Promise<LLMGraderResult<T>> {
  const apiKey = (env as { OPENAI_API_KEY?: string }).OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, parsed: null, raw: "", error: "OPENAI_API_KEY not configured", modelUsed: "", usage: {} };
  }

  const model = input.model ?? "gpt-4o-mini";
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: input.userPrompt },
    ],
    max_tokens: input.maxTokens ?? 600,
    temperature: 0.1, // Low temp for grading consistency
  };

  // Use OpenAI's structured-output mode when a schema is provided. This
  // guarantees valid JSON matching the schema or an API error.
  if (input.responseSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: "audit_result",
        strict: true,
        schema: input.responseSchema,
      },
    };
  } else {
    // Otherwise just request JSON object mode.
    body.response_format = { type: "json_object" };
  }

  let resp: Response;
  try {
    resp = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    return {
      ok: false, parsed: null, raw: "",
      error: `network/timeout: ${e instanceof Error ? e.message : String(e)}`,
      modelUsed: model, usage: {},
    };
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    return {
      ok: false, parsed: null, raw: errText,
      error: `OpenAI ${resp.status}: ${errText.slice(0, 200)}`,
      modelUsed: model, usage: {},
    };
  }

  let data: { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  try {
    data = await resp.json();
  } catch (e) {
    return {
      ok: false, parsed: null, raw: "",
      error: `JSON parse on API response: ${e instanceof Error ? e.message : String(e)}`,
      modelUsed: model, usage: {},
    };
  }

  const raw = data.choices?.[0]?.message?.content ?? "";
  let parsed: T | null = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Not JSON. Caller can still inspect raw.
    return {
      ok: false, parsed: null, raw,
      error: `LLM returned non-JSON content`,
      modelUsed: model,
      usage: {
        input_tokens: data.usage?.prompt_tokens,
        output_tokens: data.usage?.completion_tokens,
      },
    };
  }

  return {
    ok: true, parsed, raw, error: null,
    modelUsed: model,
    usage: {
      input_tokens: data.usage?.prompt_tokens,
      output_tokens: data.usage?.completion_tokens,
    },
  };
}
