/**
 * December 2026 shadow measurement: the plain question, beside production.
 *
 * WHY THIS EXISTS. Every production AI engine is sent a standing instruction
 * to name businesses (disclosed on /methodology/ 2026-11-09). On 2027-01-01 the
 * plan is to send the plain question instead. December measures what that
 * instruction does, on the same keywords and nights, before anything changes.
 * Predictions are pre-registered in content/preregistrations/2026-12-plain-question.md.
 *
 * ISOLATION. Nothing here writes to citation_runs, engine_spend,
 * engine_failures, cron_runs, admin_alerts or any table a readout, memo,
 * digest, watchdog or coverage check reads. The only table written is
 * engine_shadow_runs. test/shadow-isolation.test.ts enforces it.
 *
 * ONE CHANGE PER ARM. Each *_plain arm keeps production's model and settings
 * and drops only the instruction. The new-model arms (gemini_plain_new and the
 * two Sonnet arms) are exploratory and carry no prediction.
 */
import type { Env } from "../types";
import { GEMMA_MODEL, parsePerplexityAgentOutput, resolveGemmaProvider } from "../citations";

export type ShadowEngine = "perplexity" | "openai" | "gemini" | "anthropic" | "gemma";

export interface ShadowArm {
  /** Stored in engine_shadow_runs.arm. Never reused for a different setup. */
  arm: string;
  /** The production engine name this arm is compared with. */
  engine: ShadowEngine;
  model: string;
  /** Text sent besides the question. Empty for every arm in this experiment. */
  instruction: string;
  /** True when production uses the same model, so the instruction is the only change. */
  sameModelAsProduction: boolean;
  /** Answers from memory with no URLs, so entities come from the extraction call. */
  memory: boolean;
  /** Whether the pre-registration makes a prediction for this arm. */
  predicted: boolean;
}

/** Pure data. Order is the order arms run within a keyword. */
export const SHADOW_ARMS: readonly ShadowArm[] = [
  { arm: "perplexity_plain", engine: "perplexity", model: "perplexity/sonar", instruction: "", sameModelAsProduction: true, memory: false, predicted: true },
  { arm: "openai_plain", engine: "openai", model: "gpt-5-search-api", instruction: "", sameModelAsProduction: true, memory: false, predicted: true },
  { arm: "gemini_plain_old", engine: "gemini", model: "gemini-2.5-flash", instruction: "", sameModelAsProduction: true, memory: false, predicted: true },
  // Chosen 2026-11-09 from our key's models.list. Google's own I/O 2026 post
  // named 3.5 Flash the Gemini app default, and later secondary sources say
  // 3.6 Flash replaced it for free users. 3.6 is a pinned version id
  // (3.6-flash-07-2026), not the moving "gemini-flash-latest" alias, so the
  // shadow measures one fixed model for the whole month.
  { arm: "gemini_plain_new", engine: "gemini", model: "gemini-3.6-flash", instruction: "", sameModelAsProduction: false, memory: false, predicted: false },
  { arm: "gemma_plain", engine: "gemma", model: GEMMA_MODEL, instruction: "", sameModelAsProduction: true, memory: true, predicted: true },
  { arm: "claude_plain_haiku45", engine: "anthropic", model: "claude-haiku-4-5-20251001", instruction: "", sameModelAsProduction: true, memory: true, predicted: true },
  { arm: "claude_plain_sonnet5", engine: "anthropic", model: "claude-sonnet-5", instruction: "", sameModelAsProduction: false, memory: true, predicted: false },
  { arm: "claude_plain_sonnet55", engine: "anthropic", model: "claude-sonnet-5-5", instruction: "", sameModelAsProduction: false, memory: true, predicted: false },
];

/** The extraction call that lists business names in a memory arm's answer.
 *  It never decides client_named: that is the deterministic text match. */
export const EXTRACTOR_MODEL = "claude-haiku-5-5";

/** Hard spend ceiling per shadow night, USD, from rows already written. */
export const SHADOW_NIGHTLY_CAP_USD = 5;

/** Shadow nights: UTC dates 2026-12-01 to 2026-12-31 where day % 3 == 1.
 *  That is the 1st, 4th, 7th ... 31st: eleven nights. */
export function isShadowNight(d: Date): boolean {
  return d.getUTCFullYear() === 2026 && d.getUTCMonth() === 11 && d.getUTCDate() % 3 === 1;
}

/** The UTC date string a shadow row is filed under. */
export function shadowNight(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Deterministic "did the answer name the business".
 *
 * Case-insensitive substring of the business name in the answer text, with
 * the same 4-character floor nameMatches() uses. Kept this simple on purpose
 * so scripts/shadow-compare.mjs can apply the IDENTICAL test in SQL
 * (instr(lower(text), lower(name)) > 0) to production rows, which store
 * entities differently. Same test on both sides is what makes the comparison
 * fair.
 */
export function textNamesBusiness(text: string, businessName: string | null): boolean {
  if (!businessName) return false;
  const b = businessName.trim().toLowerCase();
  if (b.length < 4) return false;
  return text.toLowerCase().includes(b);
}

interface Rates { inputPerM: number; outputPerM: number; perCall?: number; note: string }

/** Indicative rates, USD per million tokens. Used for the nightly cap and the
 *  shadow cost column only, never for engine_spend. */
export const SHADOW_RATES: Record<string, Rates> = {
  "perplexity/sonar": { inputPerM: 1, outputPerM: 1, perCall: 0.005, note: "matches engine_spend's perplexity row, unverified" },
  "gpt-5-search-api": { inputPerM: 1.25, outputPerM: 10, note: "public pricing read 2026-09-15" },
  "gemini-2.5-flash": { inputPerM: 0.3, outputPerM: 2.5, note: "grounding inside the 1,500/day free allowance" },
  "gemini-3.6-flash": { inputPerM: 0.5, outputPerM: 3, perCall: 0.014, note: "conservative guess including grounding, NOT verified" },
  [GEMMA_MODEL]: { inputPerM: 0.1, outputPerM: 0.2, note: "matches engine_spend's gemma row" },
  "claude-haiku-4-5-20251001": { inputPerM: 1, outputPerM: 5, note: "Anthropic list price" },
  "claude-sonnet-5": { inputPerM: 2, outputPerM: 10, note: "Anthropic list price" },
  "claude-sonnet-5-5": { inputPerM: 2, outputPerM: 10, note: "Anthropic list price" },
  [EXTRACTOR_MODEL]: { inputPerM: 0.1, outputPerM: 0.5, note: "Anthropic list price" },
};

export function shadowCost(model: string, inputTokens: number, outputTokens: number): number {
  const r = SHADOW_RATES[model];
  if (!r) return 0;
  const usd = (Math.max(0, inputTokens) / 1e6) * r.inputPerM + (Math.max(0, outputTokens) / 1e6) * r.outputPerM + (r.perCall ?? 0);
  return Math.round(usd * 1e6) / 1e6;
}

export interface ShadowEntity { name: string; url: string | null }

export interface ShadowResult {
  text: string;
  urls: string[];
  entities: ShadowEntity[];
  inputTokens: number;
  outputTokens: number;
  /** Set ONLY when the call did not complete. A real empty answer has none. */
  failure?: string;
}

const PERPLEXITY_ENDPOINT = "https://api.perplexity.ai/v1/agent";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const geminiEndpoint = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

function fail(detail: string): ShadowResult {
  return { text: "", urls: [], entities: [], inputTokens: 0, outputTokens: 0, failure: detail.slice(0, 300) };
}

function domainEntities(urls: string[]): ShadowEntity[] {
  const seen = new Set<string>();
  const out: ShadowEntity[] = [];
  for (const u of urls) {
    try {
      const host = new URL(u).hostname.replace(/^www\./, "");
      if (!seen.has(host)) { seen.add(host); out.push({ name: host, url: u }); }
    } catch { /* skip malformed */ }
  }
  return out;
}

/** The request body each arm sends. Pure, exported for the tests that prove
 *  no arm carries an instruction. */
export function armRequestBody(a: ShadowArm, question: string): Record<string, unknown> {
  switch (a.engine) {
    case "perplexity":
      // Production: instructions + temperature 0.3 + web_search. Plain: no instructions.
      return { model: a.model, input: question, temperature: 0.3, max_output_tokens: 1024, tools: [{ type: "web_search" }] };
    case "openai":
      // Production: a system message. Plain: the user message alone.
      return { model: a.model, web_search_options: {}, messages: [{ role: "user", content: question }], max_tokens: 1024 };
    case "gemini":
      // Production prepends its instruction to the question in the same part.
      // The new model may think before answering, so it gets more room to avoid
      // a truncated, empty visible answer. That arm is exploratory anyway.
      return {
        contents: [{ parts: [{ text: question }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: { temperature: 0.4, maxOutputTokens: a.sameModelAsProduction ? 2048 : 8192 },
      };
    case "gemma":
      return { model: a.model, max_tokens: 1024, temperature: 0, messages: [{ role: "user", content: question }] };
    case "anthropic": {
      // Plain user message, no system, no temperature. Thinking is off on the
      // Sonnet arms so all 1,024 tokens go to the answer and the three Claude
      // arms differ by model only. Haiku 4.5 does not think by default.
      const body: Record<string, unknown> = { model: a.model, max_tokens: 1024, messages: [{ role: "user", content: question }] };
      if (a.model === "claude-sonnet-5") body.thinking = { type: "disabled" };
      if (a.model === "claude-sonnet-5-5") body.thinking = { type: "between_tools" };
      return body;
    }
  }
}

export interface ShadowKeys {
  PERPLEXITY_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  DEEPINFRA_API_KEY?: string;
  TOGETHER_API_KEY?: string;
}

/** One call for one arm. Never throws for an engine failure: it returns one. */
export async function callArm(a: ShadowArm, question: string, keys: ShadowKeys): Promise<ShadowResult> {
  const body = JSON.stringify(armRequestBody(a, question));
  try {
    if (a.engine === "perplexity") {
      if (!keys.PERPLEXITY_API_KEY) return fail("no key");
      const resp = await fetch(PERPLEXITY_ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${keys.PERPLEXITY_API_KEY}`, "Content-Type": "application/json" }, body });
      if (!resp.ok) return fail(`http ${resp.status}: ${(await resp.text()).slice(0, 250)}`);
      const data = (await resp.json()) as Parameters<typeof parsePerplexityAgentOutput>[0] & { status?: string; error?: { message?: string }; usage?: { input_tokens?: number; output_tokens?: number } };
      if (data.status === "failed") return fail(`agent failed: ${data.error?.message ?? "no message"}`);
      const { text, urls } = parsePerplexityAgentOutput(data);
      return { text, urls, entities: domainEntities(urls), inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 };
    }
    if (a.engine === "openai") {
      if (!keys.OPENAI_API_KEY) return fail("no key");
      const resp = await fetch(OPENAI_ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${keys.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body });
      if (!resp.ok) return fail(`http ${resp.status}: ${(await resp.text()).slice(0, 250)}`);
      const data = (await resp.json()) as { choices?: { message?: { content?: string; annotations?: { type: string; url_citation?: { url: string } }[] } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      const msg = data.choices?.[0]?.message;
      const urls = (msg?.annotations ?? []).filter((x) => x.type === "url_citation" && x.url_citation?.url).map((x) => x.url_citation!.url);
      return { text: msg?.content ?? "", urls, entities: domainEntities(urls), inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 };
    }
    if (a.engine === "gemini") {
      if (!keys.GEMINI_API_KEY) return fail("no key");
      const resp = await fetch(geminiEndpoint(a.model), { method: "POST", headers: { "x-goog-api-key": keys.GEMINI_API_KEY, "Content-Type": "application/json" }, body });
      if (!resp.ok) return fail(`http ${resp.status}: ${(await resp.text()).slice(0, 250)}`);
      const data = (await resp.json()) as { candidates?: { content?: { parts?: { text?: string }[] }; groundingMetadata?: { groundingChunks?: { web?: { uri?: string } }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } };
      const cand = data.candidates?.[0];
      const text = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("");
      // Raw grounding redirect URLs, NOT resolved: resolving costs a fetch per
      // link and client_named does not use URLs. The compare script says so.
      const urls = (cand?.groundingMetadata?.groundingChunks ?? []).map((c) => c.web?.uri).filter((u): u is string => !!u);
      const out = (data.usageMetadata?.candidatesTokenCount ?? 0) + (data.usageMetadata?.thoughtsTokenCount ?? 0);
      return { text, urls, entities: domainEntities(urls), inputTokens: data.usageMetadata?.promptTokenCount ?? 0, outputTokens: out };
    }
    if (a.engine === "gemma") {
      const provider = resolveGemmaProvider(keys as Env);
      if (!provider) return fail("no key");
      const resp = await fetch(provider.endpoint, { method: "POST", headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" }, body });
      if (!resp.ok) return fail(`gemma:${provider.host} http ${resp.status}: ${(await resp.text()).slice(0, 230)}`);
      const data = (await resp.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      return { text: data.choices?.[0]?.message?.content ?? "", urls: [], entities: [], inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 };
    }
    // anthropic
    if (!keys.ANTHROPIC_API_KEY) return fail("no key");
    const resp = await fetch(ANTHROPIC_ENDPOINT, { method: "POST", headers: { "x-api-key": keys.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }, body });
    if (!resp.ok) return fail(`http ${resp.status}: ${(await resp.text()).slice(0, 250)}`);
    const data = (await resp.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string; stop_details?: { category?: string | null } | null; usage?: { input_tokens?: number; output_tokens?: number } };
    // A refusal is HTTP 200. It is not an empty answer and must never be stored as one.
    if (data.stop_reason === "refusal") return fail(`refusal: ${data.stop_details?.category ?? "no category"}`);
    const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    return { text, urls: [], entities: [], inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 };
  } catch (e) {
    return fail(`threw: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** The extraction call's request body. Pure, exported for tests. */
export function extractorRequestBody(answer: string): Record<string, unknown> {
  return {
    model: EXTRACTOR_MODEL,
    max_tokens: 1024,
    thinking: { type: "disabled" },
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: { businesses: { type: "array", items: { type: "string" } } },
          required: ["businesses"],
          additionalProperties: false,
        },
      },
    },
    messages: [{
      role: "user",
      content: `List the names of every business mentioned in the text below. List names only, exactly as written, and nothing else. If none are mentioned, return an empty list.\n\n<text>\n${answer}\n</text>`,
    }],
  };
}

/** Business names in a memory arm's answer. Returns null on failure, never a
 *  fake empty list, so a failed extraction is distinguishable from "none". */
export async function extractBusinesses(answer: string, apiKey: string | undefined): Promise<{ names: string[]; inputTokens: number; outputTokens: number } | null> {
  if (!apiKey || !answer.trim()) return answer.trim() ? null : { names: [], inputTokens: 0, outputTokens: 0 };
  try {
    const resp = await fetch(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify(extractorRequestBody(answer)),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number } };
    if (data.stop_reason === "refusal") return null;
    const raw = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    const parsed = JSON.parse(raw) as { businesses?: unknown };
    const names = Array.isArray(parsed.businesses) ? parsed.businesses.filter((n): n is string => typeof n === "string" && n.trim().length > 0) : [];
    return { names, inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 };
  } catch {
    return null;
  }
}
