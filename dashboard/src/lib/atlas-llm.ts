// Atlas LLM caller.
//
// Wraps the Anthropic Messages API for the Atlas chat surface. Follows
// the same raw-fetch pattern the rest of the worker uses (weekly-brief,
// article generators), with two Atlas-specific choices:
//
//   1. Prompt caching on the system block. The system prompt + data
//      context are large and identical across every turn in a session.
//      Marking them cache_control: ephemeral means turns 2..N within a
//      ~5min window read the cached prefix instead of re-billing it.
//
//   2. Low temperature. Atlas is a disciplined data-reporting surface,
//      not a creative writer. We want deterministic, grader-passable
//      output, so temperature is held low.

import type { Env } from "../types";
import { buildAtlasSystemPrompt } from "./atlas-system-prompt";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const ATLAS_MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 1200; // Atlas answers are short. Caps runaway cost.
const TEMPERATURE = 0.2;

export interface AtlasTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AtlasLLMResult {
  text: string;
  usage: { input_tokens: number; output_tokens: number; model: string };
  stop_reason: string | null;
}

// Calls Claude with the Atlas system prompt + packed data context +
// conversation history. `extraSystemNote` lets the grader-retry path
// append a correction instruction (e.g. "[GRADER REJECTED: ...]")
// without mutating the conversation history.
export async function askAtlas(
  env: Env,
  args: {
    packedContext: string;
    history: AtlasTurn[];
    userMessage: string;
    now: Date;
    extraSystemNote?: string;
  }
): Promise<AtlasLLMResult> {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");

  const systemPrompt = buildAtlasSystemPrompt(args.now);

  // Two system blocks: the stable prompt (cached) and the per-request
  // data context (also cached — it's identical across turns in a
  // session). The optional correction note is NOT cached (it varies).
  const system: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> = [
    { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    { type: "text", text: args.packedContext, cache_control: { type: "ephemeral" } },
  ];
  if (args.extraSystemNote) {
    system.push({ type: "text", text: args.extraSystemNote });
  }

  const messages: AtlasTurn[] = [...args.history, { role: "user", content: args.userMessage }];

  const resp = await fetch(ANTHROPIC_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: ATLAS_MODEL,
      system,
      messages,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Anthropic ${resp.status}: ${txt.slice(0, 300)}`);
  }

  const json = (await resp.json()) as {
    content: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
    stop_reason?: string | null;
  };

  const text = json.content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text)
    .join("")
    .trim();

  return {
    text,
    usage: {
      input_tokens: json.usage?.input_tokens ?? 0,
      output_tokens: json.usage?.output_tokens ?? 0,
      model: ATLAS_MODEL,
    },
    stop_reason: json.stop_reason ?? null,
  };
}
