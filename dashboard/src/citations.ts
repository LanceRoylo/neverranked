/**
 * Dashboard -- Citation tracking engine
 *
 * Queries Perplexity, OpenAI, Gemini, and Anthropic APIs with client keywords,
 * extracts cited businesses/URLs, stores results, and builds
 * weekly citation share snapshots. Runs autonomously via cron.
 */

import type { Env, CitationKeyword, CitedEntity, Domain, InjectionConfig } from "./types";
import { resolveGroundingUrls } from "./gemini-resolver";
import { detectAndRecordAlerts } from "./lib/citation-alerts";

/** After a citation_runs INSERT, fire alert detection for the
 *  (keyword, engine) tuple. No-op when last_row_id can't be read or
 *  the client isn't on a plan with realTimeAlerts. */
async function maybeAlert(
  env: Env,
  clientSlug: string,
  keywordId: number,
  engine: string,
  insertRes: { meta?: { last_row_id?: number } },
  cited: boolean,
  prominence: number | null,
): Promise<void> {
  const newRunId = Number(insertRes.meta?.last_row_id ?? 0);
  if (newRunId <= 0) return;
  await detectAndRecordAlerts(env, {
    client_slug: clientSlug,
    keyword_id: keywordId,
    engine,
    new_run_id: newRunId,
    new_client_cited: cited ? 1 : 0,
    new_prominence: prominence,
  });
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// 2026-05-10: dropped from 3 to 1. Pre-refactor we ran weekly with 3
// samples/keyword for stability (3 samples × 6 engines = 18 calls per
// keyword per week). New architecture runs DAILY with 1 sample/keyword
// per day, which gives 7 samples/week per (keyword, engine) -- far more
// stable than 3 weekly. Smaller per-step CPU footprint also avoids the
// Cloudflare Workflows internal-error threshold we hit at 18 calls per
// step (verified empirically: 39s step duration triggered
// WorkflowInternalError + auto-retry that wrote duplicate rows on
// instance de51674d-9ee4 on 2026-05-09).
const RUNS_PER_KEYWORD = 1;
const PERPLEXITY_ENDPOINT = "https://api.perplexity.ai/chat/completions";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
// gemini-2.5-flash works on billing-enabled projects; gemini-2.0-flash
// has a "FreeTier limit=0" quota oddity that fails even when the
// project has billing on. Verified via the gemini-probe endpoint
// 2026-04-29: 2.5-flash returns 503 (transient overload) on the new
// billing-enabled key, while 2.0-flash returns 429 RESOURCE_EXHAUSTED.
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
// Together AI hosts open-weight models including Gemma. OpenAI-compatible
// API surface so the client code below is structurally identical to the
// OpenAI/Anthropic patterns. We use gemma-4-31B-it (instruction-tuned)
// as the 7th tracked engine -- the only open-weight model in the set,
// which makes our citation numbers independently reproducible. This is
// the largest serverless Gemma variant Together hosts (May 2026); the
// 27B and 9B variants moved to dedicated-endpoint-only pricing. See
// content/strategy/gemma-utilization-prep.md for the strategic context.
const TOGETHER_ENDPOINT = "https://api.together.xyz/v1/chat/completions";
const GEMMA_MODEL = "google/gemma-4-31B-it";

// ---------------------------------------------------------------------------
// Perplexity queries
// ---------------------------------------------------------------------------

async function queryPerplexity(
  keyword: string,
  apiKey: string
): Promise<{ text: string; urls: string[]; entities: CitedEntity[] }> {
  const resp = await fetch(PERPLEXITY_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant. When recommending businesses or services, always include specific business names and their websites when available.",
        },
        { role: "user", content: keyword },
      ],
      return_citations: true,
      temperature: 0.3,
      max_tokens: 1024,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.log(`Perplexity error for "${keyword}": ${resp.status} ${err}`);
    return { text: "", urls: [], entities: [] };
  }

  const data = (await resp.json()) as {
    choices: { message: { content: string } }[];
    citations?: string[];
  };

  const text = data.choices?.[0]?.message?.content || "";
  const urls = data.citations || [];

  // Extract entity names from the response text
  const entities = extractEntitiesFromText(text, urls);

  return { text, urls, entities };
}

// ---------------------------------------------------------------------------
// OpenAI queries (structured output)
// ---------------------------------------------------------------------------

/**
 * OpenAI query, web-grounded via gpt-4o-mini-search-preview.
 *
 * Pre-2026-04-29 this function used `gpt-4o-mini` (LLM-only, training
 * data) which represented "what the model knows" -- not "what ChatGPT
 * cites when answering a live query." That gap meant our "citation
 * tracking" was actually "training-data tracking" for this engine.
 *
 * The search-preview models are designed exactly for this: they
 * actively retrieve from the live web and return inline url_citation
 * annotations. This makes our OpenAI tracking comparable to what a
 * real ChatGPT user sees.
 *
 * Note: search-preview models don't accept response_format JSON
 * schema, so we extract entities the same way we do for Perplexity
 * (free-text + URL list).
 */
async function queryOpenAI(
  keyword: string,
  apiKey: string
): Promise<{ text: string; urls: string[]; entities: CitedEntity[] }> {
  const resp = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-search-preview",
      // Search-preview models include real-time web search by
      // default. No tools array needed; web_search_options is
      // the optional config.
      web_search_options: {},
      messages: [
        {
          role: "system",
          content:
            "You recommend businesses and services. Always include specific business names and the URLs you find them on. Cite your sources inline.",
        },
        { role: "user", content: keyword },
      ],
      max_tokens: 1024,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.log(`OpenAI error for "${keyword}": ${resp.status} ${err}`);
    return { text: "", urls: [], entities: [] };
  }

  type OpenAIAnnotation = {
    type: string;
    url_citation?: { url: string; title?: string; start_index?: number; end_index?: number };
  };
  const data = (await resp.json()) as {
    choices: { message: { content: string; annotations?: OpenAIAnnotation[] } }[];
  };

  const message = data.choices?.[0]?.message;
  const text = message?.content || "";
  // Pull URLs from the inline url_citation annotations the model
  // returns. These are the actual cited sources.
  const urls = (message?.annotations || [])
    .filter(a => a.type === "url_citation" && a.url_citation?.url)
    .map(a => a.url_citation!.url);

  // Use the same entity-extraction helper as Perplexity, since both
  // engines now return free-text + URL list of citations.
  const entities = extractEntitiesFromText(text, urls);

  return { text, urls, entities };
}

// ---------------------------------------------------------------------------
// Gemini queries
// ---------------------------------------------------------------------------

/**
 * Gemini query, web-grounded via the google_search tool.
 *
 * Pre-2026-04-29 we called Gemini without grounding tools, which
 * meant the model answered from training data. Now we attach the
 * google_search tool, so Gemini does live Google Search retrieval
 * and returns groundingMetadata with the URLs it actually used.
 *
 * Note: when grounding is enabled, responseMimeType=application/json
 * is not supported -- Gemini emits free text with grounding markers.
 * We extract URLs from groundingChunks the same way we extract from
 * Perplexity citations and OpenAI url_citation annotations.
 */
async function queryGemini(
  keyword: string,
  apiKey: string,
  env?: Env,
): Promise<{ text: string; urls: string[]; entities: CitedEntity[] }> {
  const requestBody = JSON.stringify({
    contents: [
      {
        parts: [
          {
            text: `You recommend businesses and services. When asked for recommendations, give specific business names with their websites. Cite your sources.\n\nQuery: ${keyword}`,
          },
        ],
      },
    ],
    // Gemini's v1beta API accepts the camelCase form for the
    // grounding tool. snake_case form silently produces empty
    // responses on gemini-2.0-flash.
    tools: [{ googleSearch: {} }],
    generationConfig: {
      temperature: 0.4,
      // Bumped from 1024: grounding metadata + multi-source citations
      // can push the response payload past the smaller window, which
      // truncates the visible text portion to empty.
      maxOutputTokens: 2048,
    },
  });

  // Single retry on 503 UNAVAILABLE. gemini-2.5-flash hits transient
  // demand spikes a few times an hour; a 5s sleep + retry usually
  // succeeds. Without retry we'd lose 5-10% of weekly citation data.
  let resp = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: requestBody,
  });
  if (resp.status === 503) {
    await new Promise(r => setTimeout(r, 5000));
    resp = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: requestBody,
    });
  }

  if (!resp.ok) {
    const err = await resp.text();
    console.log("Gemini error for \"" + keyword + "\": " + resp.status + " " + err);
    return { text: "", urls: [], entities: [] };
  }

  type GroundingChunk = { web?: { uri?: string; title?: string } };
  const rawJson = await resp.text();
  let data: {
    candidates: {
      content: { parts: { text: string }[] };
      groundingMetadata?: { groundingChunks?: GroundingChunk[] };
      finishReason?: string;
    }[];
  };
  try {
    data = JSON.parse(rawJson);
  } catch {
    console.log("[gemini-debug] non-JSON response: " + rawJson.slice(0, 800));
    return { text: "", urls: [], entities: [] };
  }

  const cand = data.candidates?.[0];
  const text = cand?.content?.parts?.map(p => p.text).join("") || "";

  // Extract URLs from groundingChunks. Each chunk has a web.uri
  // pointing at a real source Google Search returned -- but Gemini
  // returns these as opaque vertexaisearch.cloud.google.com redirect
  // tokens. Resolve them to real URLs so downstream extraction (reddit,
  // competitor surfacing, citation display) sees the actual sources.
  const rawUrls: string[] = [];
  const chunks = cand?.groundingMetadata?.groundingChunks || [];
  for (const ch of chunks) {
    if (ch.web?.uri) rawUrls.push(ch.web.uri);
  }
  const urls = await resolveGroundingUrls(rawUrls);

  // Same entity extraction as Perplexity / OpenAI search-preview.
  const entities = extractEntitiesFromText(text, urls);

  return { text, urls, entities };
}

// ---------------------------------------------------------------------------
// Claude (Anthropic) queries
// ---------------------------------------------------------------------------

async function queryClaude(
  keyword: string,
  apiKey: string
): Promise<{ text: string; entities: CitedEntity[] }> {
  const resp = await fetch(ANTHROPIC_ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: "You recommend local businesses and services. Always include specific business names and their websites when available. Respond ONLY with valid JSON in this exact format: {\"businesses\": [{\"name\": \"Business Name\", \"url\": \"https://example.com\", \"reason\": \"Why you recommend them\"}]}",
      messages: [
        { role: "user", content: keyword },
      ],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.log("Claude error for \"" + keyword + "\": " + resp.status + " " + err);
    return { text: "", entities: [] };
  }

  const data = (await resp.json()) as {
    content: { type: string; text: string }[];
  };

  const rawContent = data.content?.[0]?.text || "{}";
  let entities: CitedEntity[] = [];

  // Claude sometimes wraps its JSON response in ```json fences despite
  // the prompt asking for ONLY JSON. Strip them defensively before
  // parsing -- verified empirically 2026-05-11: a sample row showed
  // "```json\n{\"businesses\":[...]}\n```" which JSON.parse rejected,
  // so entities came back empty even though Claude returned good data.
  // Matches the same defensive parse pattern queryGemma already uses.
  const cleaned = rawContent
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as {
      businesses: { name: string; url: string | null; reason: string }[];
    };
    entities = (parsed.businesses || []).map((b) => ({
      name: b.name,
      url: b.url,
      context: b.reason,
    }));
  } catch {
    console.log("Claude JSON parse failed for \"" + keyword + "\"");
  }

  return { text: rawContent, entities };
}

// ---------------------------------------------------------------------------
// Gemma queries (Google's open-weight model, hosted via Together AI)
// ---------------------------------------------------------------------------

/**
 * Gemma 3 27B query via Together AI's OpenAI-compatible endpoint.
 *
 * Gemma is Google's open-weight LLM family. We track it as the 7th
 * engine specifically because its weights are public -- anyone with
 * the same model can independently reproduce our citation numbers,
 * which the six closed-API engines (ChatGPT, Perplexity, Claude,
 * Gemini, Copilot, AIO) cannot offer. This is the differentiator
 * for compliance-sensitive and methodology-skeptical customers
 * (banks, regulated industries, agencies serving them).
 *
 * Like Anthropic, Gemma has no native web grounding -- it answers
 * from its training data. We use the same structured-JSON output
 * pattern as queryClaude() so the entity extraction is comparable.
 *
 * Together AI's API is OpenAI-compatible so the client code mirrors
 * queryOpenAI(), just with a different endpoint and model name.
 * Auth is a single Bearer token (TOGETHER_API_KEY).
 */
async function queryGemma(
  keyword: string,
  apiKey: string
): Promise<{ text: string; entities: CitedEntity[] }> {
  const resp = await fetch(TOGETHER_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GEMMA_MODEL,
      max_tokens: 1024,
      // Deterministic-ish: temperature 0 + a small seed gives more
      // reproducible outputs across runs. Strengthens the "anyone
      // can rerun and verify" methodology claim.
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You recommend local businesses and services. Always include specific business names and their websites when available. Respond ONLY with valid JSON in this exact format: {\"businesses\": [{\"name\": \"Business Name\", \"url\": \"https://example.com\", \"reason\": \"Why you recommend them\"}]}",
        },
        { role: "user", content: keyword },
      ],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.log(`Gemma error for "${keyword}": ${resp.status} ${err.slice(0, 200)}`);
    return { text: "", entities: [] };
  }

  const data = (await resp.json()) as {
    choices: { message: { content: string } }[];
  };

  const rawContent = data.choices?.[0]?.message?.content || "{}";
  let entities: CitedEntity[] = [];

  // Gemma sometimes wraps the JSON in ```json fences. Strip them
  // before parsing -- same defensive parse as Anthropic.
  const cleaned = rawContent
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as {
      businesses: { name: string; url: string | null; reason: string }[];
    };
    entities = (parsed.businesses || []).map((b) => ({
      name: b.name,
      url: b.url,
      context: b.reason,
    }));
  } catch {
    console.log(`Gemma JSON parse failed for "${keyword}"`);
  }

  return { text: rawContent, entities };
}

// ---------------------------------------------------------------------------
// Entity extraction helpers
// ---------------------------------------------------------------------------

/** Extract business entities from Perplexity's free-text + citation URLs */
function extractEntitiesFromText(
  text: string,
  urls: string[]
): CitedEntity[] {
  const entities: CitedEntity[] = [];
  const seen = new Set<string>();

  // Map URLs to domains for matching
  for (const url of urls) {
    try {
      const domain = new URL(url).hostname.replace(/^www\./, "");
      if (!seen.has(domain)) {
        seen.add(domain);
        entities.push({
          name: domain,
          url,
          context: "Cited as source",
        });
      }
    } catch {
      // Skip malformed URLs
    }
  }

  return entities;
}

/** Check if a client domain or business name was cited */
function wasClientCited(
  entities: CitedEntity[],
  urls: string[],
  clientDomain: string,
  businessName: string | null
): boolean {
  return computeProminence(entities, urls, clientDomain, businessName) !== null;
}

/** Where in the answer was the client mentioned?
 *  1 = first (hero quote), 10 = last (footnote-tier).
 *  null = not cited at all.
 *
 *  Engines return entities/urls in the order they were referenced in
 *  the response. We cap at 10 so a result like "ranked 17th of 30"
 *  doesn't drag the score off a cliff -- past rank 10 you're effectively
 *  invisible regardless. */
function computeProminence(
  entities: CitedEntity[],
  urls: string[],
  clientDomain: string,
  businessName: string | null,
): number | null {
  const domainNorm = clientDomain.replace(/^www\./, "").toLowerCase();

  // Check URL list first (most reliable -- domain match is unambiguous).
  for (let i = 0; i < urls.length; i++) {
    try {
      const host = new URL(urls[i]).hostname.replace(/^www\./, "").toLowerCase();
      if (host === domainNorm || host.endsWith("." + domainNorm)) {
        return Math.min(i + 1, 10);
      }
    } catch {
      // skip malformed
    }
  }

  // Then entity name match.
  if (businessName) {
    const nameNorm = businessName.toLowerCase();
    for (let i = 0; i < entities.length; i++) {
      const eName = entities[i].name.toLowerCase();
      if (eName.includes(nameNorm) || nameNorm.includes(eName)) {
        return Math.min(i + 1, 10);
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main citation scan orchestrator
// ---------------------------------------------------------------------------

export async function runWeeklyCitations(env: Env, slugFilter?: string): Promise<void> {
  if (!env.PERPLEXITY_API_KEY && !env.OPENAI_API_KEY) {
    console.log("Citation tracking: no API keys configured, skipping");
    return;
  }

  // Get active keywords -- optionally filtered to one client. Filter
  // exists so the "Run now" admin button on /admin/citations/<slug>
  // only burns API budget on that one client, not the entire roster.
  // The Monday cron passes no filter and runs all clients as before.
  const keywords = slugFilter
    ? (await env.DB.prepare(
        "SELECT * FROM citation_keywords WHERE active = 1 AND client_slug = ? ORDER BY id"
      ).bind(slugFilter).all<CitationKeyword>()).results
    : (await env.DB.prepare(
        "SELECT * FROM citation_keywords WHERE active = 1 ORDER BY client_slug, id"
      ).all<CitationKeyword>()).results;

  if (keywords.length === 0) {
    console.log("Citation tracking: no active keywords, skipping");
    return;
  }

  // Group keywords by client
  const clientKeywords = new Map<string, CitationKeyword[]>();
  for (const kw of keywords) {
    const arr = clientKeywords.get(kw.client_slug) || [];
    arr.push(kw);
    clientKeywords.set(kw.client_slug, arr);
  }

  const now = Math.floor(Date.now() / 1000);

  for (const [clientSlug, kwList] of clientKeywords) {
    // Get client's primary domain and business name for matching
    const domain = await env.DB.prepare(
      "SELECT * FROM domains WHERE client_slug = ? AND is_competitor = 0 AND active = 1 LIMIT 1"
    )
      .bind(clientSlug)
      .first<Domain>();

    const config = await env.DB.prepare(
      "SELECT * FROM injection_configs WHERE client_slug = ?"
    )
      .bind(clientSlug)
      .first<InjectionConfig>();

    const clientDomain = domain?.domain || "";
    const businessName = config?.business_name || null;

    let totalQueries = 0;
    let clientCitations = 0;
    const competitorCounts = new Map<string, number>();
    const keywordResults: { keyword: string; keywordId: number; cited: boolean; engines: string[] }[] = [];

    for (const kw of kwList) {
      let kwCited = false;
      const kwEngines: string[] = [];

      // Engine handlers, parallelized per keyword. Pre-2026-05-09 these
      // ran sequentially (perplexity -> openai -> gemini -> anthropic ->
      // aio -> bing) which summed to 30-60s of wall-time per keyword and
      // hit the Workers wall-time ceiling on the 5th and 6th engine. The
      // bing + google_ai_overview rows literally never landed from the
      // weekly cron path -- verified empirically (only 2 rows each in 14
      // days, both from the manual per-keyword button). Promise.allSettled
      // drops wall-time per keyword to max(slowest single engine), so all
      // 6 land. Map mutations are safe under JS single-threaded execution
      // -- continuations between awaits run serially.
      const runPerplexity = async () => {
        if (!env.PERPLEXITY_API_KEY) return;
        const r = await queryPerplexity(kw.keyword, env.PERPLEXITY_API_KEY);
        const prom = computeProminence(r.entities, r.urls, clientDomain, businessName);
        const cited = prom !== null;
        if (cited) {
          kwCited = true;
          if (!kwEngines.includes("perplexity")) kwEngines.push("perplexity");
        }
        for (const entity of r.entities) {
          const eName = entity.name.toLowerCase();
          if (eName !== clientDomain.replace(/^www\./, "").toLowerCase()) {
            competitorCounts.set(eName, (competitorCounts.get(eName) || 0) + 1);
          }
        }
        const insertRes = await env.DB.prepare(
          `INSERT INTO citation_runs (keyword_id, engine, response_text, cited_entities, cited_urls, client_cited, prominence, run_at, grounding_mode)
           VALUES (?, 'perplexity', ?, ?, ?, ?, ?, ?, 'web')`
        ).bind(kw.id, r.text.slice(0, 4000), JSON.stringify(r.entities), JSON.stringify(r.urls), cited ? 1 : 0, prom, now).run();
        await maybeAlert(env, clientSlug, kw.id, "perplexity", insertRes, cited, prom);
        totalQueries++;
        if (cited) clientCitations++;
      };

      const runOpenAI = async () => {
        if (!env.OPENAI_API_KEY) return;
        const r = await queryOpenAI(kw.keyword, env.OPENAI_API_KEY);
        const prom = computeProminence(r.entities, r.urls, clientDomain, businessName);
        const cited = prom !== null;
        if (cited) {
          kwCited = true;
          if (!kwEngines.includes("openai")) kwEngines.push("openai");
        }
        for (const entity of r.entities) {
          const eName = entity.name.toLowerCase();
          if (eName !== clientDomain.replace(/^www\./, "").toLowerCase() &&
              (!businessName || eName !== businessName.toLowerCase())) {
            competitorCounts.set(eName, (competitorCounts.get(eName) || 0) + 1);
          }
        }
        const insertRes = await env.DB.prepare(
          `INSERT INTO citation_runs (keyword_id, engine, response_text, cited_entities, cited_urls, client_cited, prominence, run_at, grounding_mode)
           VALUES (?, 'openai', ?, ?, ?, ?, ?, ?, 'web')`
        ).bind(kw.id, r.text.slice(0, 4000), JSON.stringify(r.entities), JSON.stringify(r.urls), cited ? 1 : 0, prom, now).run();
        await maybeAlert(env, clientSlug, kw.id, "openai", insertRes, cited, prom);
        totalQueries++;
        if (cited) clientCitations++;
      };

      const runGemini = async () => {
        if (!env.GEMINI_API_KEY) return;
        const r = await queryGemini(kw.keyword, env.GEMINI_API_KEY, env);
        // Skip persistence when the API returned nothing -- usually a 429
        // quota error or transient 5xx. Empty rows would poison the
        // citation rate denominator with non-runs.
        if (r.text.length === 0 && r.urls.length === 0) return;
        const prom = computeProminence(r.entities, r.urls, clientDomain, businessName);
        const cited = prom !== null;
        if (cited) {
          kwCited = true;
          if (!kwEngines.includes("gemini")) kwEngines.push("gemini");
        }
        for (const entity of r.entities) {
          const eName = entity.name.toLowerCase();
          if (eName !== clientDomain.replace(/^www\./, "").toLowerCase() &&
              (!businessName || eName !== businessName.toLowerCase())) {
            competitorCounts.set(eName, (competitorCounts.get(eName) || 0) + 1);
          }
        }
        const insertRes = await env.DB.prepare(
          `INSERT INTO citation_runs (keyword_id, engine, response_text, cited_entities, cited_urls, client_cited, prominence, run_at, grounding_mode)
           VALUES (?, 'gemini', ?, ?, ?, ?, ?, ?, 'web')`
        ).bind(kw.id, r.text.slice(0, 4000), JSON.stringify(r.entities), JSON.stringify(r.urls), cited ? 1 : 0, prom, now).run();
        await maybeAlert(env, clientSlug, kw.id, "gemini", insertRes, cited, prom);
        totalQueries++;
        if (cited) clientCitations++;
      };

      const runAnthropic = async () => {
        if (!env.ANTHROPIC_API_KEY) return;
        const r = await queryClaude(kw.keyword, env.ANTHROPIC_API_KEY);
        const prom = computeProminence(r.entities, [], clientDomain, businessName);
        const cited = prom !== null;
        if (cited) {
          kwCited = true;
          if (!kwEngines.includes("anthropic")) kwEngines.push("anthropic");
        }
        for (const entity of r.entities) {
          const eName = entity.name.toLowerCase();
          if (eName !== clientDomain.replace(/^www\./, "").toLowerCase() &&
              (!businessName || eName !== businessName.toLowerCase())) {
            competitorCounts.set(eName, (competitorCounts.get(eName) || 0) + 1);
          }
        }
        // Anthropic still LLM-only (web search tool integration is a Phase 3
        // upgrade). grounding_mode='training' so analytics distinguish.
        const insertRes = await env.DB.prepare(
          `INSERT INTO citation_runs (keyword_id, engine, response_text, cited_entities, cited_urls, client_cited, prominence, run_at, grounding_mode)
           VALUES (?, 'anthropic', ?, ?, '[]', ?, ?, ?, 'training')`
        ).bind(kw.id, r.text.slice(0, 4000), JSON.stringify(r.entities), cited ? 1 : 0, prom, now).run();
        await maybeAlert(env, clientSlug, kw.id, "anthropic", insertRes, cited, prom);
        totalQueries++;
        if (cited) clientCitations++;
      };

      const runGoogleAIO = async () => {
        if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) return;
        const { queryGoogleAIO } = await import("./citations-google-aio");
        const r = await queryGoogleAIO(kw.keyword, env);
        // AIO doesn't render for many queries -- skip the INSERT so we
        // don't poison the citation rate denominator with non-runs.
        if (r.text.length === 0 && r.urls.length === 0) return;
        const prom = computeProminence(r.entities, r.urls, clientDomain, businessName);
        const cited = prom !== null;
        if (cited) {
          kwCited = true;
          if (!kwEngines.includes("google_ai_overview")) kwEngines.push("google_ai_overview");
        }
        for (const entity of r.entities) {
          const eName = entity.name.toLowerCase();
          if (eName !== clientDomain.replace(/^www\./, "").toLowerCase() &&
              (!businessName || eName !== businessName.toLowerCase())) {
            competitorCounts.set(eName, (competitorCounts.get(eName) || 0) + 1);
          }
        }
        const insertRes = await env.DB.prepare(
          `INSERT INTO citation_runs (keyword_id, engine, response_text, cited_entities, cited_urls, client_cited, prominence, run_at, grounding_mode)
           VALUES (?, 'google_ai_overview', ?, ?, ?, ?, ?, ?, 'web')`
        ).bind(kw.id, r.text.slice(0, 4000), JSON.stringify(r.entities), JSON.stringify(r.urls), cited ? 1 : 0, prom, now).run();
        await maybeAlert(env, clientSlug, kw.id, "google_ai_overview", insertRes, cited, prom);
        totalQueries++;
        if (cited) clientCitations++;
      };

      const runBing = async () => {
        if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) return;
        const { queryBing } = await import("./citations-bing");
        const r = await queryBing(kw.keyword, env);
        if (r.text.length === 0 && r.urls.length === 0) return;
        const prom = computeProminence(r.entities, r.urls, clientDomain, businessName);
        const cited = prom !== null;
        if (cited) {
          kwCited = true;
          if (!kwEngines.includes("bing")) kwEngines.push("bing");
        }
        for (const entity of r.entities) {
          const eName = entity.name.toLowerCase();
          if (eName !== clientDomain.replace(/^www\./, "").toLowerCase() &&
              (!businessName || eName !== businessName.toLowerCase())) {
            competitorCounts.set(eName, (competitorCounts.get(eName) || 0) + 1);
          }
        }
        const insertRes = await env.DB.prepare(
          `INSERT INTO citation_runs (keyword_id, engine, response_text, cited_entities, cited_urls, client_cited, prominence, run_at, grounding_mode)
           VALUES (?, 'bing', ?, ?, ?, ?, ?, ?, 'web')`
        ).bind(kw.id, r.text.slice(0, 4000), JSON.stringify(r.entities), JSON.stringify(r.urls), cited ? 1 : 0, prom, now).run();
        await maybeAlert(env, clientSlug, kw.id, "bing", insertRes, cited, prom);
        totalQueries++;
        if (cited) clientCitations++;
      };

      // 7th engine: Gemma (open-weight, hosted via Together AI).
      // Mirror of runAnthropic but with the Gemma model. Reproducible
      // by design -- public weights mean anyone can re-run the same
      // prompts and verify our numbers.
      const runGemma = async () => {
        if (!env.TOGETHER_API_KEY) return;
        const r = await queryGemma(kw.keyword, env.TOGETHER_API_KEY);
        const prom = computeProminence(r.entities, [], clientDomain, businessName);
        const cited = prom !== null;
        if (cited) {
          kwCited = true;
          if (!kwEngines.includes("gemma")) kwEngines.push("gemma");
        }
        for (const entity of r.entities) {
          const eName = entity.name.toLowerCase();
          if (eName !== clientDomain.replace(/^www\./, "").toLowerCase() &&
              (!businessName || eName !== businessName.toLowerCase())) {
            competitorCounts.set(eName, (competitorCounts.get(eName) || 0) + 1);
          }
        }
        const insertRes = await env.DB.prepare(
          `INSERT INTO citation_runs (keyword_id, engine, response_text, cited_entities, cited_urls, client_cited, prominence, run_at, grounding_mode)
           VALUES (?, 'gemma', ?, ?, '[]', ?, ?, ?, 'training')`
        ).bind(kw.id, r.text.slice(0, 4000), JSON.stringify(r.entities), cited ? 1 : 0, prom, now).run();
        await maybeAlert(env, clientSlug, kw.id, "gemma", insertRes, cited, prom);
        totalQueries++;
        if (cited) clientCitations++;
      };

      const engineLabels = ["perplexity", "openai", "gemini", "anthropic", "google_aio", "bing", "gemma"];

      // Run multiple times per engine for stability
      for (let run = 0; run < RUNS_PER_KEYWORD; run++) {
        const results = await Promise.allSettled([
          runPerplexity(),
          runOpenAI(),
          runGemini(),
          runAnthropic(),
          runGoogleAIO(),
          runBing(),
          runGemma(),
        ]);
        results.forEach((res, i) => {
          if (res.status === "rejected") {
            console.log(`Engine ${engineLabels[i]} failed for "${kw.keyword}": ${res.reason}`);
          }
        });
      }

      keywordResults.push({
        keyword: kw.keyword,
        keywordId: kw.id,
        cited: kwCited,
        engines: kwEngines,
      });
    }

    // Phase 5: Reddit citation extraction. We do this AFTER the
    // per-engine inserts (rather than inline in each engine block)
    // because the backfill helper handles all engines uniformly,
    // is idempotent on UNIQUE(run_id, thread_url), and keeps the
    // inline engine code clean. We backfill the last 1 day so
    // we re-cover any rows inserted in this run regardless of
    // exact timing.
    try {
      const { backfillRedditCitations, maybeAddRedditRoadmapItems } = await import("./reddit-citations");
      await backfillRedditCitations(clientSlug, 1, env);
      await maybeAddRedditRoadmapItems(clientSlug, env);
    } catch (e) {
      console.log(`Reddit ingest failed for ${clientSlug}: ${e}`);
    }

    // --- Build weekly snapshot ---

    const citationShare = totalQueries > 0 ? clientCitations / totalQueries : 0;

    // Top competitors sorted by mention count
    const topCompetitors = [...competitorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    // Per-keyword breakdown
    const keywordBreakdown = keywordResults.map((kr) => ({
      keyword: kr.keyword,
      keyword_id: kr.keywordId,
      cited: kr.cited,
      engines: kr.engines,
    }));

    // Per-engine breakdown
    const enginesBreakdown: Record<string, { queries: number; citations: number }> = {};
    if (env.PERPLEXITY_API_KEY) {
      const pRuns = await env.DB.prepare(
        `SELECT COUNT(*) as total, SUM(client_cited) as cited FROM citation_runs
         WHERE keyword_id IN (SELECT id FROM citation_keywords WHERE client_slug = ?)
         AND engine = 'perplexity' AND run_at = ?`
      )
        .bind(clientSlug, now)
        .first<{ total: number; cited: number }>();
      enginesBreakdown.perplexity = {
        queries: pRuns?.total || 0,
        citations: pRuns?.cited || 0,
      };
    }
    if (env.OPENAI_API_KEY) {
      const oRuns = await env.DB.prepare(
        `SELECT COUNT(*) as total, SUM(client_cited) as cited FROM citation_runs
         WHERE keyword_id IN (SELECT id FROM citation_keywords WHERE client_slug = ?)
         AND engine = 'openai' AND run_at = ?`
      )
        .bind(clientSlug, now)
        .first<{ total: number; cited: number }>();
      enginesBreakdown.openai = {
        queries: oRuns?.total || 0,
        citations: oRuns?.cited || 0,
      };
    }
    if (env.GEMINI_API_KEY) {
      const gRuns = await env.DB.prepare(
        `SELECT COUNT(*) as total, SUM(client_cited) as cited FROM citation_runs
         WHERE keyword_id IN (SELECT id FROM citation_keywords WHERE client_slug = ?)
         AND engine = 'gemini' AND run_at = ?`
      )
        .bind(clientSlug, now)
        .first<{ total: number; cited: number }>();
      enginesBreakdown.gemini = {
        queries: gRuns?.total || 0,
        citations: gRuns?.cited || 0,
      };
    }
    if (env.ANTHROPIC_API_KEY) {
      const cRuns = await env.DB.prepare(
        `SELECT COUNT(*) as total, SUM(client_cited) as cited FROM citation_runs
         WHERE keyword_id IN (SELECT id FROM citation_keywords WHERE client_slug = ?)
         AND engine = 'anthropic' AND run_at = ?`
      )
        .bind(clientSlug, now)
        .first<{ total: number; cited: number }>();
      enginesBreakdown.anthropic = {
        queries: cRuns?.total || 0,
        citations: cRuns?.cited || 0,
      };
    }
    // Gemma -- the 7th engine, open-weight, gated on TOGETHER_API_KEY.
    // Same shape as Anthropic in the aggregator (no URLs since Gemma
    // doesn't have web grounding -- responses are training-data only).
    if (env.TOGETHER_API_KEY) {
      const gmRuns = await env.DB.prepare(
        `SELECT COUNT(*) as total, SUM(client_cited) as cited FROM citation_runs
         WHERE keyword_id IN (SELECT id FROM citation_keywords WHERE client_slug = ?)
         AND engine = 'gemma' AND run_at = ?`
      )
        .bind(clientSlug, now)
        .first<{ total: number; cited: number }>();
      enginesBreakdown.gemma = {
        queries: gmRuns?.total || 0,
        citations: gmRuns?.cited || 0,
      };
    }
    // Google AI Overviews + Bing both come from DataForSEO. Same gate.
    // Pre-2026-05-09 these were missing from engines_breakdown entirely
    // because the aggregator only knew about the 4 LLM engines, so even
    // when bing/aio rows landed they were invisible in dashboards and
    // digest emails. Snapshot now reflects the full 7-engine reality
    // (perplexity, openai, gemini, anthropic, google_ai_overview, bing,
    // gemma).
    if (env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD) {
      const aioRuns = await env.DB.prepare(
        `SELECT COUNT(*) as total, SUM(client_cited) as cited FROM citation_runs
         WHERE keyword_id IN (SELECT id FROM citation_keywords WHERE client_slug = ?)
         AND engine = 'google_ai_overview' AND run_at = ?`
      )
        .bind(clientSlug, now)
        .first<{ total: number; cited: number }>();
      enginesBreakdown.google_ai_overview = {
        queries: aioRuns?.total || 0,
        citations: aioRuns?.cited || 0,
      };
      const bingRuns = await env.DB.prepare(
        `SELECT COUNT(*) as total, SUM(client_cited) as cited FROM citation_runs
         WHERE keyword_id IN (SELECT id FROM citation_keywords WHERE client_slug = ?)
         AND engine = 'bing' AND run_at = ?`
      )
        .bind(clientSlug, now)
        .first<{ total: number; cited: number }>();
      enginesBreakdown.bing = {
        queries: bingRuns?.total || 0,
        citations: bingRuns?.cited || 0,
      };
    }

    // Get Monday of this week for week_start
    const mondayDate = new Date();
    mondayDate.setUTCHours(0, 0, 0, 0);
    const dayOfWeek = mondayDate.getUTCDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    mondayDate.setUTCDate(mondayDate.getUTCDate() - diff);
    const weekStart = Math.floor(mondayDate.getTime() / 1000);

    await env.DB.prepare(
      `INSERT INTO citation_snapshots
       (client_slug, week_start, total_queries, client_citations, citation_share, top_competitors, keyword_breakdown, engines_breakdown, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        clientSlug,
        weekStart,
        totalQueries,
        clientCitations,
        citationShare,
        JSON.stringify(topCompetitors),
        JSON.stringify(keywordBreakdown),
        JSON.stringify(enginesBreakdown),
        now
      )
      .run();

    console.log(
      `Citations for ${clientSlug}: ${clientCitations}/${totalQueries} queries cited (${(citationShare * 100).toFixed(1)}%), ${topCompetitors.length} competitors tracked`
    );

    // Citation-lost alert: mirror of first-citation. If this client had
    // citations in the previous snapshot but ZERO this week, fire a
    // warning email. Real business signal -- losing AI citations now
    // means future traffic loss. Cooldown: 30 days, so a flapping
    // client doesn't get spammed if citations bounce back.
    try {
      if (clientCitations === 0 && domain) {
        const previousSnapshot = await env.DB.prepare(
          `SELECT client_citations, total_queries, created_at FROM citation_snapshots
            WHERE client_slug = ? AND created_at < ?
            ORDER BY created_at DESC LIMIT 1`
        ).bind(clientSlug, now - 60).first<{ client_citations: number; total_queries: number; created_at: number }>();

        if (previousSnapshot && previousSnapshot.client_citations > 0) {
          // Cooldown: don't re-fire if we already alerted in last 30 days.
          const recentAlert = await env.DB.prepare(
            "SELECT id FROM admin_alerts WHERE client_slug = ? AND type = 'citation_lost' AND created_at > ? LIMIT 1"
          ).bind(clientSlug, now - 30 * 86400).first<{ id: number }>();

          if (!recentAlert) {
            const { resolveAgencyForEmail } = await import("./agency");
            const { sendCitationLostEmail } = await import("./email");
            const agency = await resolveAgencyForEmail(env, { domainId: domain.id });

            const recipients = (await env.DB.prepare(
              `SELECT email, name FROM users
                WHERE (email_regression = 1 OR email_regression IS NULL)
                  AND ((role = 'client' AND client_slug = ?) OR role = 'admin')`
            ).bind(clientSlug).all<{ email: string; name: string | null }>()).results;
            if (agency?.contact_email && !recipients.some((r) => r.email === agency.contact_email)) {
              recipients.push({ email: agency.contact_email, name: null });
            }

            const daysBetween = Math.max(1, Math.floor((now - previousSnapshot.created_at) / 86400));
            let sent = 0;
            for (const r of recipients) {
              const ok = await sendCitationLostEmail(r.email, r.name, {
                domain: domain.domain,
                clientSlug,
                previousCitations: previousSnapshot.client_citations,
                previousQueries: previousSnapshot.total_queries,
                daysBetween,
              }, env, agency);
              if (ok) sent++;
              await new Promise((res) => setTimeout(res, 200));
            }

            await env.DB.prepare(
              `INSERT INTO admin_alerts (client_slug, type, title, detail, created_at)
                 VALUES (?, 'citation_lost', ?, ?, ?)`
            ).bind(
              clientSlug,
              `Citations dropped to zero on ${domain.domain}`,
              `Was ${previousSnapshot.client_citations}/${previousSnapshot.total_queries} cited ${daysBetween}d ago, now 0/${totalQueries}. ${sent}/${recipients.length} alert emails sent.`,
              now,
            ).run();
            console.log(`[citation-lost] alerted ${clientSlug} -- ${sent}/${recipients.length} emails`);
          }
        }
      }
    } catch (e) {
      console.log(`[citation-lost] check failed for ${clientSlug}: ${e}`);
    }

    // First-citation celebration: if this run is the first time we
    // detected a cite for this client (any engine, any keyword), fire
    // the dopamine-hit email + create a milestone admin_alert. Use
    // admin_alerts as the persistent "we already celebrated" guard so
    // we never re-fire even after months of additional citations.
    try {
      if (clientCitations > 0 && domain) {
        const alreadyCelebrated = await env.DB.prepare(
          "SELECT id FROM admin_alerts WHERE client_slug = ? AND type = 'first_citation' LIMIT 1"
        ).bind(clientSlug).first<{ id: number }>();

        if (!alreadyCelebrated) {
          // Find the first cited result this run for the email content.
          const firstCited = keywordResults.find((r) => r.cited);
          const engineName = firstCited?.engines[0]
            ? (firstCited.engines[0] === "openai" ? "ChatGPT"
              : firstCited.engines[0] === "perplexity" ? "Perplexity"
              : firstCited.engines[0] === "google_aio" ? "Google AI Overviews"
              : firstCited.engines[0] === "gemini" ? "Gemini"
              : firstCited.engines[0])
            : "an AI engine";
          const keyword = firstCited?.keyword || "your tracked keywords";

          // Resolve agency for branding (domain-scoped).
          const { resolveAgencyForEmail } = await import("./agency");
          const { sendFirstCitationEmail } = await import("./email");
          const agency = await resolveAgencyForEmail(env, { domainId: domain.id });

          // Recipients: client-role users for this slug + the agency
          // contact when agency-owned. Same audience as regression alerts.
          const recipients = (await env.DB.prepare(
            `SELECT email, name FROM users
              WHERE (role = 'client' AND client_slug = ?)
                 OR role = 'admin'`
          ).bind(clientSlug).all<{ email: string; name: string | null }>()).results;
          if (agency?.contact_email && !recipients.some((r) => r.email === agency.contact_email)) {
            recipients.push({ email: agency.contact_email, name: null });
          }

          let sent = 0;
          for (const r of recipients) {
            const ok = await sendFirstCitationEmail(r.email, r.name, {
              domain: domain.domain,
              clientSlug,
              engineName,
              keyword,
              citationsThisRun: clientCitations,
              totalQueries,
            }, env, agency);
            if (ok) sent++;
            await new Promise((res) => setTimeout(res, 200));
          }

          // Persistent guard: this admin_alert serves dual purpose --
          // visibility for ops AND prevents re-celebration on future
          // weekly runs.
          await env.DB.prepare(
            `INSERT INTO admin_alerts (client_slug, type, title, detail, created_at)
             VALUES (?, 'first_citation', ?, ?, ?)`
          ).bind(
            clientSlug,
            `First AI citation: ${domain.domain} cited by ${engineName}`,
            `${clientCitations} of ${totalQueries} tracked queries cited this week. ${sent} of ${recipients.length} celebration emails sent.`,
            now,
          ).run();

          console.log(`[first-citation] celebrated ${clientSlug} -- ${sent}/${recipients.length} emails sent`);
        }
      }
    } catch (e) {
      console.log(`[first-citation] check failed for ${clientSlug}: ${e}`);
    }

    // Delay between clients
    await new Promise((r) => setTimeout(r, 500));
  }
}

// ---------------------------------------------------------------------------
// Per-keyword run -- single keyword, all 6 engines, RUNS_PER_KEYWORD repeats.
// Built for the admin "Run" button on individual keywords so a demo or
// triage run fits well inside Workers' waitUntil budget. The full-roster
// runWeeklyCitations() iterates 15+ keywords and fan-outs to ~270 API
// calls which has been hitting the wall-time ceiling and dying mid-run
// (see citations debug 2026-05-09). This function does ~18 calls max,
// which fits comfortably. Skips snapshot/alert side-effects on purpose --
// those are per-client aggregates owned by the weekly cron path.
// ---------------------------------------------------------------------------

export async function runOneKeywordCitations(
  env: Env,
  clientSlug: string,
  keywordId: number
): Promise<{ ok: boolean; rowsInserted: number; engines: Record<string, number>; error?: string }> {
  const kw = await env.DB.prepare(
    "SELECT * FROM citation_keywords WHERE id = ? AND client_slug = ? AND active = 1"
  ).bind(keywordId, clientSlug).first<CitationKeyword>();

  if (!kw) {
    return { ok: false, rowsInserted: 0, engines: {}, error: "keyword not found or inactive" };
  }

  const domain = await env.DB.prepare(
    "SELECT * FROM domains WHERE client_slug = ? AND is_competitor = 0 AND active = 1 LIMIT 1"
  ).bind(clientSlug).first<Domain>();

  const config = await env.DB.prepare(
    "SELECT * FROM injection_configs WHERE client_slug = ?"
  ).bind(clientSlug).first<InjectionConfig>();

  const clientDomain = domain?.domain || "";
  const businessName = config?.business_name || null;

  const engines: Record<string, number> = {};
  let rowsInserted = 0;

  // Per-engine handlers. Each is an async closure that does the API
  // call + INSERT and reports its row count. They run in parallel via
  // Promise.allSettled below so wall-time per outer iteration is the
  // SLOWEST single engine (~10-15s) rather than the SUM (~30-60s).
  // That's what makes 6 engines × 3 iterations fit inside Workers'
  // waitUntil budget. A failed engine doesn't take the others down --
  // its row simply doesn't write.
  const tick = () => Math.floor(Date.now() / 1000);

  const runPerplexity = async () => {
    if (!env.PERPLEXITY_API_KEY) return;
    const r = await queryPerplexity(kw.keyword, env.PERPLEXITY_API_KEY);
    const prom = computeProminence(r.entities, r.urls, clientDomain, businessName);
    const cited = prom !== null;
    await env.DB.prepare(
      `INSERT INTO citation_runs (keyword_id, engine, response_text, cited_entities, cited_urls, client_cited, prominence, run_at, grounding_mode)
       VALUES (?, 'perplexity', ?, ?, ?, ?, ?, ?, 'web')`
    ).bind(kw.id, r.text.slice(0, 4000), JSON.stringify(r.entities), JSON.stringify(r.urls), cited ? 1 : 0, prom, tick()).run();
    engines.perplexity = (engines.perplexity || 0) + 1;
    rowsInserted++;
  };

  const runOpenAI = async () => {
    if (!env.OPENAI_API_KEY) return;
    const r = await queryOpenAI(kw.keyword, env.OPENAI_API_KEY);
    const prom = computeProminence(r.entities, r.urls, clientDomain, businessName);
    const cited = prom !== null;
    await env.DB.prepare(
      `INSERT INTO citation_runs (keyword_id, engine, response_text, cited_entities, cited_urls, client_cited, prominence, run_at, grounding_mode)
       VALUES (?, 'openai', ?, ?, ?, ?, ?, ?, 'web')`
    ).bind(kw.id, r.text.slice(0, 4000), JSON.stringify(r.entities), JSON.stringify(r.urls), cited ? 1 : 0, prom, tick()).run();
    engines.openai = (engines.openai || 0) + 1;
    rowsInserted++;
  };

  const runGemini = async () => {
    if (!env.GEMINI_API_KEY) return;
    const r = await queryGemini(kw.keyword, env.GEMINI_API_KEY, env);
    if (r.text.length === 0 && r.urls.length === 0) return; // 429/empty
    const prom = computeProminence(r.entities, r.urls, clientDomain, businessName);
    const cited = prom !== null;
    await env.DB.prepare(
      `INSERT INTO citation_runs (keyword_id, engine, response_text, cited_entities, cited_urls, client_cited, prominence, run_at, grounding_mode)
       VALUES (?, 'gemini', ?, ?, ?, ?, ?, ?, 'web')`
    ).bind(kw.id, r.text.slice(0, 4000), JSON.stringify(r.entities), JSON.stringify(r.urls), cited ? 1 : 0, prom, tick()).run();
    engines.gemini = (engines.gemini || 0) + 1;
    rowsInserted++;
  };

  const runAnthropic = async () => {
    if (!env.ANTHROPIC_API_KEY) return;
    const r = await queryClaude(kw.keyword, env.ANTHROPIC_API_KEY);
    // Skip insert when the API returned nothing -- usually a transient
    // 5xx, rate limit, or model error. Empty rows poison the citation
    // rate denominator and the engines_breakdown aggregator (verified
    // empirically 2026-05-11: 53/53 Anthropic rows had cited_entities=[]
    // because most calls returned response_text=""). Matches the
    // skip-on-empty pattern Gemini / AIO / Bing already use.
    if (r.text.length === 0 && r.entities.length === 0) return;
    const prom = computeProminence(r.entities, [], clientDomain, businessName);
    const cited = prom !== null;
    await env.DB.prepare(
      `INSERT INTO citation_runs (keyword_id, engine, response_text, cited_entities, cited_urls, client_cited, prominence, run_at, grounding_mode)
       VALUES (?, 'anthropic', ?, ?, '[]', ?, ?, ?, 'training')`
    ).bind(kw.id, r.text.slice(0, 4000), JSON.stringify(r.entities), cited ? 1 : 0, prom, tick()).run();
    engines.anthropic = (engines.anthropic || 0) + 1;
    rowsInserted++;
  };

  const runGoogleAIO = async () => {
    if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) return;
    const { queryGoogleAIO } = await import("./citations-google-aio");
    const r = await queryGoogleAIO(kw.keyword, env);
    if (r.text.length === 0 && r.urls.length === 0) return; // AIO didn't render
    const prom = computeProminence(r.entities, r.urls, clientDomain, businessName);
    const cited = prom !== null;
    await env.DB.prepare(
      `INSERT INTO citation_runs (keyword_id, engine, response_text, cited_entities, cited_urls, client_cited, prominence, run_at, grounding_mode)
       VALUES (?, 'google_ai_overview', ?, ?, ?, ?, ?, ?, 'web')`
    ).bind(kw.id, r.text.slice(0, 4000), JSON.stringify(r.entities), JSON.stringify(r.urls), cited ? 1 : 0, prom, tick()).run();
    engines.google_ai_overview = (engines.google_ai_overview || 0) + 1;
    rowsInserted++;
  };

  const runBing = async () => {
    if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) return;
    const { queryBing } = await import("./citations-bing");
    const r = await queryBing(kw.keyword, env);
    if (r.text.length === 0 && r.urls.length === 0) return;
    const prom = computeProminence(r.entities, r.urls, clientDomain, businessName);
    const cited = prom !== null;
    await env.DB.prepare(
      `INSERT INTO citation_runs (keyword_id, engine, response_text, cited_entities, cited_urls, client_cited, prominence, run_at, grounding_mode)
       VALUES (?, 'bing', ?, ?, ?, ?, ?, ?, 'web')`
    ).bind(kw.id, r.text.slice(0, 4000), JSON.stringify(r.entities), JSON.stringify(r.urls), cited ? 1 : 0, prom, tick()).run();
    engines.bing = (engines.bing || 0) + 1;
    rowsInserted++;
  };

  // The 7th engine: Gemma (Google's open-weight model, hosted via
  // Together AI). The only fully reproducible engine in the set --
  // anyone can re-run our prompts on the same weights and verify.
  // grounding_mode='training' since Gemma has no native web grounding
  // (matches Anthropic's classification).
  const runGemma = async () => {
    if (!env.TOGETHER_API_KEY) return;
    const r = await queryGemma(kw.keyword, env.TOGETHER_API_KEY);
    // Skip empty results to keep the snapshot aggregator clean. Same
    // pattern as the other training-mode engines.
    if (r.text.length === 0 && r.entities.length === 0) return;
    const prom = computeProminence(r.entities, [], clientDomain, businessName);
    const cited = prom !== null;
    await env.DB.prepare(
      `INSERT INTO citation_runs (keyword_id, engine, response_text, cited_entities, cited_urls, client_cited, prominence, run_at, grounding_mode)
       VALUES (?, 'gemma', ?, ?, '[]', ?, ?, ?, 'training')`
    ).bind(kw.id, r.text.slice(0, 4000), JSON.stringify(r.entities), cited ? 1 : 0, prom, tick()).run();
    engines.gemma = (engines.gemma || 0) + 1;
    rowsInserted++;
  };

  const engineLabels = ["perplexity", "openai", "gemini", "anthropic", "google_aio", "bing", "gemma"];

  for (let run = 0; run < RUNS_PER_KEYWORD; run++) {
    const results = await Promise.allSettled([
      runPerplexity(),
      runOpenAI(),
      runGemini(),
      runAnthropic(),
      runGoogleAIO(),
      runBing(),
      runGemma(),
    ]);
    results.forEach((res, i) => {
      if (res.status === "rejected") {
        console.log(`[per-keyword] ${engineLabels[i]} failed (${kw.keyword}): ${res.reason}`);
      }
    });
  }

  console.log(`[per-keyword] ${clientSlug}/"${kw.keyword}": ${rowsInserted} rows across ${Object.keys(engines).length} engines`);
  return { ok: true, rowsInserted, engines };
}

// ---------------------------------------------------------------------------
// Workflow fan-out helpers. The pre-2026-05-09 path called
// runWeeklyCitations() inside a single step.do(), which silently hit
// the per-step 30s CPU ceiling after ~1.5 keywords and exited
// "successfully" with most data missing (verified: 31s step, only ~27
// rows per workflow instance for a 15-keyword roster). The new path
// fans out one step.do() per (client, keyword), each with its own
// fresh CPU budget, then aggregates per-client snapshots in a
// follow-up step. Same total work, no piling.
// ---------------------------------------------------------------------------

export interface CitationRunPlan {
  runStartTs: number;
  items: Array<{ clientSlug: string; keywordId: number; keyword: string }>;
  clientSlugs: string[];
}

export async function planCitationRun(
  env: Env,
  slugFilter?: string
): Promise<CitationRunPlan> {
  const runStartTs = Math.floor(Date.now() / 1000);
  const keywords = slugFilter
    ? (await env.DB.prepare(
        "SELECT id, client_slug, keyword FROM citation_keywords WHERE active = 1 AND client_slug = ? ORDER BY id"
      ).bind(slugFilter).all<{ id: number; client_slug: string; keyword: string }>()).results
    : (await env.DB.prepare(
        "SELECT id, client_slug, keyword FROM citation_keywords WHERE active = 1 ORDER BY client_slug, id"
      ).all<{ id: number; client_slug: string; keyword: string }>()).results;

  const items = keywords.map((k) => ({
    clientSlug: k.client_slug,
    keywordId: k.id,
    keyword: k.keyword,
  }));
  const clientSlugs = Array.from(new Set(items.map((i) => i.clientSlug)));

  return { runStartTs, items, clientSlugs };
}

// Build the per-client snapshot row + run citation-lost / first-citation
// alerts. Reads citation_runs rows from the last `lookbackDays` days.
// Default 7 -- the Monday weekly snapshot rolls up the prior week of
// daily samples. Manual button passes 1 -- snapshot reflects only
// today's run, fresh feedback for the user. Alert side-effects are
// guarded by admin_alerts cooldowns, so re-running won't double-fire.
export async function buildClientSnapshot(
  env: Env,
  clientSlug: string,
  lookbackDays: number = 7
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const runStartTs = now - Math.floor(lookbackDays * 86400);

  const domain = await env.DB.prepare(
    "SELECT * FROM domains WHERE client_slug = ? AND is_competitor = 0 AND active = 1 LIMIT 1"
  ).bind(clientSlug).first<Domain>();

  const config = await env.DB.prepare(
    "SELECT * FROM injection_configs WHERE client_slug = ?"
  ).bind(clientSlug).first<InjectionConfig>();

  const clientDomain = domain?.domain || "";
  const businessName = config?.business_name || null;

  // Pull all rows written for this client during this run window.
  const rows = (await env.DB.prepare(
    `SELECT cr.id, cr.keyword_id, cr.engine, cr.cited_entities, cr.client_cited,
            ck.keyword
     FROM citation_runs cr
     JOIN citation_keywords ck ON ck.id = cr.keyword_id
     WHERE ck.client_slug = ? AND cr.run_at >= ?
     ORDER BY cr.id`
  ).bind(clientSlug, runStartTs).all<{
    id: number;
    keyword_id: number;
    engine: string;
    cited_entities: string;
    client_cited: number;
    keyword: string;
  }>()).results;

  if (rows.length === 0) {
    console.log(`[snapshot] ${clientSlug}: no rows since ${runStartTs}, skipping snapshot`);
    return;
  }

  // Aggregate.
  let totalQueries = 0;
  let clientCitations = 0;
  const competitorCounts = new Map<string, number>();
  const enginesBreakdown: Record<string, { queries: number; citations: number }> = {};
  const perKeyword = new Map<number, { keyword: string; cited: boolean; engines: Set<string> }>();

  const clientLc = clientDomain.replace(/^www\./, "").toLowerCase();
  const businessLc = businessName ? businessName.toLowerCase() : null;

  for (const row of rows) {
    totalQueries++;
    const cited = row.client_cited === 1;
    if (cited) clientCitations++;

    const eb = enginesBreakdown[row.engine] || { queries: 0, citations: 0 };
    eb.queries++;
    if (cited) eb.citations++;
    enginesBreakdown[row.engine] = eb;

    const kw = perKeyword.get(row.keyword_id) || { keyword: row.keyword, cited: false, engines: new Set<string>() };
    if (cited) {
      kw.cited = true;
      kw.engines.add(row.engine);
    }
    perKeyword.set(row.keyword_id, kw);

    // Decode entities for competitor counts.
    try {
      const entities = JSON.parse(row.cited_entities || "[]") as Array<{ name: string }>;
      for (const e of entities) {
        const eName = (e.name || "").toLowerCase();
        if (!eName) continue;
        if (eName === clientLc) continue;
        if (businessLc && eName === businessLc) continue;
        competitorCounts.set(eName, (competitorCounts.get(eName) || 0) + 1);
      }
    } catch { /* malformed JSON -- skip */ }
  }

  const citationShare = totalQueries > 0 ? clientCitations / totalQueries : 0;
  const topCompetitors = [...competitorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));
  const keywordBreakdown = Array.from(perKeyword.entries()).map(([keyword_id, v]) => ({
    keyword: v.keyword,
    keyword_id,
    cited: v.cited,
    engines: Array.from(v.engines),
  }));

  // Monday of this week (UTC) for week_start.
  const mondayDate = new Date();
  mondayDate.setUTCHours(0, 0, 0, 0);
  const dayOfWeek = mondayDate.getUTCDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  mondayDate.setUTCDate(mondayDate.getUTCDate() - diff);
  const weekStart = Math.floor(mondayDate.getTime() / 1000);

  await env.DB.prepare(
    `INSERT INTO citation_snapshots
     (client_slug, week_start, total_queries, client_citations, citation_share, top_competitors, keyword_breakdown, engines_breakdown, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    clientSlug,
    weekStart,
    totalQueries,
    clientCitations,
    citationShare,
    JSON.stringify(topCompetitors),
    JSON.stringify(keywordBreakdown),
    JSON.stringify(enginesBreakdown),
    now
  ).run();

  console.log(
    `[snapshot] ${clientSlug}: ${clientCitations}/${totalQueries} cited (${(citationShare * 100).toFixed(1)}%), ${topCompetitors.length} competitors, engines=${Object.keys(enginesBreakdown).join(",")}`
  );

  // Citation-lost alert -- mirror of first-citation. Same guards as the
  // legacy path: previous snapshot had citations, this one has zero,
  // 30-day cooldown via admin_alerts.
  try {
    if (clientCitations === 0 && domain) {
      const previousSnapshot = await env.DB.prepare(
        `SELECT client_citations, total_queries, created_at FROM citation_snapshots
          WHERE client_slug = ? AND created_at < ?
          ORDER BY created_at DESC LIMIT 1`
      ).bind(clientSlug, now - 60).first<{ client_citations: number; total_queries: number; created_at: number }>();

      if (previousSnapshot && previousSnapshot.client_citations > 0) {
        const recentAlert = await env.DB.prepare(
          "SELECT id FROM admin_alerts WHERE client_slug = ? AND type = 'citation_lost' AND created_at > ? LIMIT 1"
        ).bind(clientSlug, now - 30 * 86400).first<{ id: number }>();

        if (!recentAlert) {
          const { resolveAgencyForEmail } = await import("./agency");
          const { sendCitationLostEmail } = await import("./email");
          const agency = await resolveAgencyForEmail(env, { domainId: domain.id });

          const recipients = (await env.DB.prepare(
            `SELECT email, name FROM users
              WHERE (email_regression = 1 OR email_regression IS NULL)
                AND ((role = 'client' AND client_slug = ?) OR role = 'admin')`
          ).bind(clientSlug).all<{ email: string; name: string | null }>()).results;
          if (agency?.contact_email && !recipients.some((r) => r.email === agency.contact_email)) {
            recipients.push({ email: agency.contact_email, name: null });
          }

          const daysBetween = Math.max(1, Math.floor((now - previousSnapshot.created_at) / 86400));
          let sent = 0;
          for (const r of recipients) {
            const ok = await sendCitationLostEmail(r.email, r.name, {
              domain: domain.domain,
              clientSlug,
              previousCitations: previousSnapshot.client_citations,
              previousQueries: previousSnapshot.total_queries,
              daysBetween,
            }, env, agency);
            if (ok) sent++;
            await new Promise((res) => setTimeout(res, 200));
          }

          await env.DB.prepare(
            `INSERT INTO admin_alerts (client_slug, type, title, detail, created_at)
               VALUES (?, 'citation_lost', ?, ?, ?)`
          ).bind(
            clientSlug,
            `Citations dropped to zero on ${domain.domain}`,
            `Was ${previousSnapshot.client_citations}/${previousSnapshot.total_queries} cited ${daysBetween}d ago, now 0/${totalQueries}. ${sent}/${recipients.length} alert emails sent.`,
            now,
          ).run();
          console.log(`[citation-lost] alerted ${clientSlug} -- ${sent}/${recipients.length} emails`);
        }
      }
    }
  } catch (e) {
    console.log(`[citation-lost] check failed for ${clientSlug}: ${e}`);
  }

  // First-citation celebration. Persistent guard via admin_alerts so
  // we never re-fire even after months of subsequent citations.
  try {
    if (clientCitations > 0 && domain) {
      const alreadyCelebrated = await env.DB.prepare(
        "SELECT id FROM admin_alerts WHERE client_slug = ? AND type = 'first_citation' LIMIT 1"
      ).bind(clientSlug).first<{ id: number }>();

      if (!alreadyCelebrated) {
        const firstCited = keywordBreakdown.find((r) => r.cited);
        const engineKey = firstCited?.engines[0] || "";
        const engineName =
          engineKey === "openai" ? "ChatGPT"
          : engineKey === "perplexity" ? "Perplexity"
          : engineKey === "google_ai_overview" ? "Google AI Overviews"
          : engineKey === "gemini" ? "Gemini"
          : engineKey === "bing" ? "Microsoft Copilot"
          : engineKey === "anthropic" ? "Claude"
          : engineKey || "an AI engine";
        const keyword = firstCited?.keyword || "your tracked keywords";

        const { resolveAgencyForEmail } = await import("./agency");
        const { sendFirstCitationEmail } = await import("./email");
        const agency = await resolveAgencyForEmail(env, { domainId: domain.id });

        const recipients = (await env.DB.prepare(
          `SELECT email, name FROM users
            WHERE (role = 'client' AND client_slug = ?)
               OR role = 'admin'`
        ).bind(clientSlug).all<{ email: string; name: string | null }>()).results;
        if (agency?.contact_email && !recipients.some((r) => r.email === agency.contact_email)) {
          recipients.push({ email: agency.contact_email, name: null });
        }

        let sent = 0;
        for (const r of recipients) {
          const ok = await sendFirstCitationEmail(r.email, r.name, {
            domain: domain.domain,
            clientSlug,
            engineName,
            keyword,
            citationsThisRun: clientCitations,
            totalQueries,
          }, env, agency);
          if (ok) sent++;
          await new Promise((res) => setTimeout(res, 200));
        }

        await env.DB.prepare(
          `INSERT INTO admin_alerts (client_slug, type, title, detail, created_at)
           VALUES (?, 'first_citation', ?, ?, ?)`
        ).bind(
          clientSlug,
          `First AI citation: ${domain.domain} cited by ${engineName}`,
          `${clientCitations} of ${totalQueries} tracked queries cited this week. ${sent} of ${recipients.length} celebration emails sent.`,
          now,
        ).run();

        console.log(`[first-citation] celebrated ${clientSlug} -- ${sent}/${recipients.length} emails sent`);
      }
    }
  } catch (e) {
    console.log(`[first-citation] check failed for ${clientSlug}: ${e}`);
  }

  // Reddit citation extraction. Same call the legacy path makes, kept
  // here so the snapshot step covers all post-run aggregation work.
  try {
    const { backfillRedditCitations, maybeAddRedditRoadmapItems } = await import("./reddit-citations");
    await backfillRedditCitations(clientSlug, 1, env);
    await maybeAddRedditRoadmapItems(clientSlug, env);
  } catch (e) {
    console.log(`[reddit] backfill failed for ${clientSlug}: ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Auto-generate keyword suggestions for a new client
// ---------------------------------------------------------------------------

export async function generateKeywordSuggestions(
  clientSlug: string,
  businessName: string,
  businessUrl: string,
  industry: string,
  location: string,
  env: Env
): Promise<string[]> {
  if (!env.OPENAI_API_KEY) return [];

  const prompt = `Generate 15 realistic queries that a real person would type into an AI assistant (ChatGPT, Perplexity, Gemini, Claude) when they have a problem that a ${industry} business in ${location} could solve. These should sound like a person talking to AI, not like Google search keywords.

IMPORTANT RULES:
- Write them as natural, conversational sentences. Real people explain their situation to AI.
- Never write short keyword-style queries like "best dentist Austin TX". Those are Google searches, not AI conversations.
- Include the person's context, frustration, or specific situation when possible.
- The queries should be ones where AI would recommend specific businesses by name.

Include a mix of:
- Problem-based (5): "I have [specific problem] and I need [type of help] in ${location}. What are my options?"
- Recommendation-seeking (4): "Can you recommend a good ${industry} in ${location}? I need someone who [specific quality]."
- Comparison/evaluation (3): "What should I look for when choosing a ${industry} in ${location}? Who do you recommend?"
- Scenario-based (3): "I'm [specific situation]. My current [provider] isn't working. Who else in ${location} should I talk to?"

Return as a JSON array of strings. No numbering, just the queries.`;

  try {
    const resp = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You generate search queries. Return only a JSON array of strings." },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "QuerySuggestions",
            strict: true,
            schema: {
              type: "object",
              properties: {
                queries: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["queries"],
              additionalProperties: false,
            },
          },
        },
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!resp.ok) return [];
    const data = (await resp.json()) as { choices: { message: { content: string } }[] };
    const parsed = JSON.parse(data.choices[0].message.content) as { queries: string[] };
    return parsed.queries || [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Get citation data for digest emails
// ---------------------------------------------------------------------------

export interface CitationDigestData {
  citationShare: number;
  previousShare: number | null;
  topCompetitors: { name: string; count: number }[];
  keywordsWon: number;
  keywordsLost: number;
  totalKeywords: number;
}

export async function getCitationDigestData(
  clientSlug: string,
  env: Env
): Promise<CitationDigestData | null> {
  // Get last two snapshots
  const snapshots = (
    await env.DB.prepare(
      "SELECT * FROM citation_snapshots WHERE client_slug = ? ORDER BY week_start DESC LIMIT 2"
    )
      .bind(clientSlug)
      .all<{
        citation_share: number;
        top_competitors: string;
        keyword_breakdown: string;
      }>()
  ).results;

  if (snapshots.length === 0) return null;

  const latest = snapshots[0];
  const previous = snapshots.length > 1 ? snapshots[1] : null;

  const topCompetitors: { name: string; count: number }[] = JSON.parse(
    latest.top_competitors
  );
  const breakdown: { keyword: string; cited: boolean }[] = JSON.parse(
    latest.keyword_breakdown
  );

  return {
    citationShare: latest.citation_share,
    previousShare: previous ? previous.citation_share : null,
    topCompetitors: topCompetitors.slice(0, 5),
    keywordsWon: breakdown.filter((k) => k.cited).length,
    keywordsLost: breakdown.filter((k) => !k.cited).length,
    totalKeywords: breakdown.length,
  };
}

// ===========================================================================
// Per-keyword deep breakdown — Priority 3 (per-keyword fidelity)
// ===========================================================================
//
// The basic keywordBreakdown stored in citation_snapshots tells you "was the
// client cited on this keyword." This function returns the deeper view a
// buyer actually needs:
//
//   - citation_rate: client_cited count / total runs for this keyword
//   - engines_cited / engines_run: how many engines covered + cited
//   - top_competitor: most-named competitor across mentions on this keyword
//   - dominant_framing: most common framing class when the client is cited
//   - dominant_position: most common competitive_position when cited
//   - sample_framing_phrase: a real phrase an engine used to describe the
//     client on this keyword (proof / shareable artifact for the buyer)
//
// Run at render time rather than baked into the snapshot, so we don't need
// a backfill and the analysis stays close to the freshest data.
// ===========================================================================

export interface KeywordDeepRow {
  keyword_id: number;
  keyword: string;
  total_runs: number;
  cited_runs: number;
  citation_rate: number;          // 0..1
  engines_run: string[];          // engines that produced a row for this keyword
  engines_cited: string[];        // engines where client_cited = 1
  top_competitor: string | null;  // most-named competitor on this keyword
  top_competitor_count: number;   // how often
  dominant_framing: string | null;
  dominant_position: string | null;
  sample_framing_phrase: string | null;
}

export async function getKeywordDeepBreakdown(
  env: Env,
  clientSlug: string,
  days: number,
): Promise<KeywordDeepRow[]> {
  const since = Math.floor(Date.now() / 1000) - days * 86400;

  const rows = (await env.DB.prepare(
    `SELECT
       ck.id AS keyword_id,
       ck.keyword,
       cr.engine,
       cr.client_cited,
       cr.framing,
       cr.framing_phrase,
       cr.competitive_position,
       cr.competitors_mentioned
     FROM citation_keywords ck
     LEFT JOIN citation_runs cr
       ON cr.keyword_id = ck.id
      AND cr.run_at >= ?
     WHERE ck.client_slug = ?
     ORDER BY ck.id`,
  ).bind(since, clientSlug).all<{
    keyword_id: number;
    keyword: string;
    engine: string | null;
    client_cited: number | null;
    framing: string | null;
    framing_phrase: string | null;
    competitive_position: string | null;
    competitors_mentioned: string | null;
  }>()).results;

  // Group by keyword_id and aggregate
  const byKeyword = new Map<number, {
    keyword: string;
    runs: typeof rows;
  }>();

  for (const r of rows) {
    if (!byKeyword.has(r.keyword_id)) {
      byKeyword.set(r.keyword_id, { keyword: r.keyword, runs: [] });
    }
    if (r.engine) byKeyword.get(r.keyword_id)!.runs.push(r);
  }

  const out: KeywordDeepRow[] = [];
  for (const [keyword_id, { keyword, runs }] of byKeyword) {
    const total_runs = runs.length;
    const cited_runs = runs.filter((r) => r.client_cited === 1).length;
    const citation_rate = total_runs > 0 ? cited_runs / total_runs : 0;
    const engines_run = [...new Set(runs.map((r) => r.engine!).filter(Boolean))];
    const engines_cited = [...new Set(
      runs.filter((r) => r.client_cited === 1).map((r) => r.engine!),
    )];

    // Top competitor across all runs on this keyword
    const competitorCounts = new Map<string, number>();
    for (const r of runs) {
      try {
        const list = JSON.parse(r.competitors_mentioned || "[]") as string[];
        for (const c of list) {
          const k = c.toLowerCase().trim();
          if (!k) continue;
          competitorCounts.set(k, (competitorCounts.get(k) || 0) + 1);
        }
      } catch { /* skip malformed */ }
    }
    const sortedCompetitors = [...competitorCounts.entries()].sort((a, b) => b[1] - a[1]);
    const top_competitor = sortedCompetitors.length > 0 ? sortedCompetitors[0][0] : null;
    const top_competitor_count = sortedCompetitors.length > 0 ? sortedCompetitors[0][1] : 0;

    // Dominant framing among cited runs
    const framingCounts = new Map<string, number>();
    const positionCounts = new Map<string, number>();
    let sample_framing_phrase: string | null = null;
    for (const r of runs) {
      if (r.client_cited !== 1) continue;
      if (r.framing) framingCounts.set(r.framing, (framingCounts.get(r.framing) || 0) + 1);
      if (r.competitive_position) positionCounts.set(r.competitive_position, (positionCounts.get(r.competitive_position) || 0) + 1);
      if (!sample_framing_phrase && r.framing_phrase && r.framing_phrase.trim().length > 0) {
        sample_framing_phrase = r.framing_phrase.trim();
      }
    }
    const dominant_framing = framingCounts.size > 0
      ? [...framingCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : null;
    const dominant_position = positionCounts.size > 0
      ? [...positionCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : null;

    out.push({
      keyword_id,
      keyword,
      total_runs,
      cited_runs,
      citation_rate,
      engines_run,
      engines_cited,
      top_competitor,
      top_competitor_count,
      dominant_framing,
      dominant_position,
      sample_framing_phrase,
    });
  }

  // Sort: highest citation_rate first (wins surface first); zero-rate
  // queries cluster at the bottom where the buyer's eye goes for "gaps."
  return out.sort((a, b) => {
    if (b.citation_rate !== a.citation_rate) return b.citation_rate - a.citation_rate;
    return b.total_runs - a.total_runs;
  });
}

// ===========================================================================
// Reddit citation surface — break out Reddit as a first-class signal
// ===========================================================================
//
// AI engines pull "best X for Y" answers heavily from Reddit. The
// source-type rollup we ship surfaces Reddit as one row in a bigger
// list. This function drills deeper, per-subreddit:
//
//   - Which subreddits cite the client's category
//   - How often the client is named vs. ignored on each
//   - Top competitor on each subreddit
//   - Total threads NR's reddit_briefs has surfaced for this client
//   - Top sources cited alongside the client on Reddit
//
// Output drives a dedicated dashboard panel that turns Reddit from a
// passive citation stat into an actionable content roadmap (Amplify
// tier sells the deployment of Reddit engagement based on this).
// ===========================================================================

export interface RedditSubredditRow {
  subreddit: string;            // e.g. "hawaii" (lowercase, no r/ prefix)
  mention_count: number;        // citation_runs rows with a reddit.com URL in this subreddit
  client_named_count: number;   // of those, how many had client_cited = 1
  client_named_ratio: number;   // 0..1
  top_competitor: string | null;
  top_competitor_count: number;
  example_keyword: string | null;
}

export interface RedditCitationSurface {
  total_reddit_mentions: number;
  client_named_in_reddit: number;
  client_named_ratio: number;
  subreddits: RedditSubredditRow[];
  briefs_drafted: number;        // count of reddit_briefs rows for this client
  has_signal: boolean;           // false when there are zero Reddit citations
}

const SUBREDDIT_RE = /reddit\.com\/r\/([A-Za-z0-9_]+)/i;

export async function getRedditCitationSurface(
  env: Env,
  clientSlug: string,
  days: number,
): Promise<RedditCitationSurface> {
  const since = Math.floor(Date.now() / 1000) - days * 86400;

  // Pull every citation_run row for this client where cited_urls contains
  // a reddit.com link. SQLite's LIKE keeps the work in-database; we still
  // parse the JSON in app code because subreddit extraction needs regex.
  const rows = (await env.DB.prepare(
    `SELECT cr.cited_urls, cr.client_cited, cr.competitors_mentioned, ck.keyword
       FROM citation_runs cr
       JOIN citation_keywords ck ON ck.id = cr.keyword_id
      WHERE ck.client_slug = ?
        AND cr.run_at >= ?
        AND cr.cited_urls LIKE '%reddit.com%'`,
  ).bind(clientSlug, since).all<{
    cited_urls: string;
    client_cited: number;
    competitors_mentioned: string;
    keyword: string;
  }>()).results;

  // Aggregate per-subreddit
  const bySub = new Map<string, {
    mentions: number;
    client_named: number;
    competitors: Map<string, number>;
    example_keyword: string | null;
  }>();
  let totalRedditMentions = 0;
  let clientNamedInReddit = 0;

  for (const r of rows) {
    let urls: string[] = [];
    try { urls = JSON.parse(r.cited_urls || "[]") as string[]; } catch { /* skip */ }
    const redditUrls = urls.filter((u) => typeof u === "string" && u.includes("reddit.com"));
    if (redditUrls.length === 0) continue;

    // De-dupe to unique subreddits within this row so a single response
    // citing five threads in r/hawaii counts as one mention, not five.
    const subsThisRow = new Set<string>();
    for (const url of redditUrls) {
      const m = url.match(SUBREDDIT_RE);
      if (m && m[1]) subsThisRow.add(m[1].toLowerCase());
    }
    if (subsThisRow.size === 0) continue;

    totalRedditMentions++;
    if (r.client_cited === 1) clientNamedInReddit++;

    const competitorsHere: string[] = [];
    try {
      const list = JSON.parse(r.competitors_mentioned || "[]") as string[];
      for (const c of list) {
        const k = (c || "").toLowerCase().trim();
        if (k) competitorsHere.push(k);
      }
    } catch { /* skip */ }

    for (const sub of subsThisRow) {
      let agg = bySub.get(sub);
      if (!agg) {
        agg = { mentions: 0, client_named: 0, competitors: new Map(), example_keyword: null };
        bySub.set(sub, agg);
      }
      agg.mentions++;
      if (r.client_cited === 1) agg.client_named++;
      if (!agg.example_keyword) agg.example_keyword = r.keyword;
      for (const c of competitorsHere) {
        agg.competitors.set(c, (agg.competitors.get(c) || 0) + 1);
      }
    }
  }

  // Reddit briefs count (for Amplify clients, this is the count of
  // threads NR has produced briefs for). Best-effort - if the table
  // doesn't exist for this account or query errors, treat as zero.
  let briefsDrafted = 0;
  try {
    const briefRow = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM reddit_briefs WHERE client_slug = ?",
    ).bind(clientSlug).first<{ n: number }>();
    briefsDrafted = Number(briefRow?.n || 0);
  } catch { /* table may not exist on every deployment */ }

  // Build sorted subreddit rows
  const subreddits: RedditSubredditRow[] = [];
  for (const [sub, agg] of bySub) {
    const sortedComps = [...agg.competitors.entries()].sort((a, b) => b[1] - a[1]);
    const topComp = sortedComps[0] || null;
    subreddits.push({
      subreddit: sub,
      mention_count: agg.mentions,
      client_named_count: agg.client_named,
      client_named_ratio: agg.mentions > 0 ? agg.client_named / agg.mentions : 0,
      top_competitor: topComp ? topComp[0] : null,
      top_competitor_count: topComp ? topComp[1] : 0,
      example_keyword: agg.example_keyword,
    });
  }
  subreddits.sort((a, b) => b.mention_count - a.mention_count);

  return {
    total_reddit_mentions: totalRedditMentions,
    client_named_in_reddit: clientNamedInReddit,
    client_named_ratio: totalRedditMentions > 0 ? clientNamedInReddit / totalRedditMentions : 0,
    subreddits: subreddits.slice(0, 10),
    briefs_drafted: briefsDrafted,
    has_signal: totalRedditMentions > 0,
  };
}
