/**
 * Dashboard -- Citation tracking engine
 *
 * Queries Perplexity, OpenAI, Gemini, and Anthropic APIs with client keywords,
 * extracts cited businesses/URLs, stores results, and builds
 * weekly citation share snapshots. Runs autonomously via cron.
 */

import type { Env, CitationKeyword, CitedEntity, Domain, InjectionConfig } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RUNS_PER_KEYWORD = 3; // Multiple runs for stability
const PERPLEXITY_ENDPOINT = "https://api.perplexity.ai/chat/completions";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
// gemini-2.5-flash works on billing-enabled projects; gemini-2.0-flash
// has a "FreeTier limit=0" quota oddity that fails even when the
// project has billing on. Verified via the gemini-probe endpoint
// 2026-04-29: 2.5-flash returns 503 (transient overload) on the new
// billing-enabled key, while 2.0-flash returns 429 RESOURCE_EXHAUSTED.
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";

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
  // pointing at a real source Google Search returned.
  const urls: string[] = [];
  const chunks = cand?.groundingMetadata?.groundingChunks || [];
  for (const ch of chunks) {
    if (ch.web?.uri) urls.push(ch.web.uri);
  }

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
      model: "claude-haiku-4-20250414",
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

  try {
    const parsed = JSON.parse(rawContent) as {
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
  const domainNorm = clientDomain.replace(/^www\./, "").toLowerCase();

  // Check URL citations (Perplexity)
  for (const url of urls) {
    try {
      const cited = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
      if (cited === domainNorm || cited.endsWith("." + domainNorm)) {
        return true;
      }
    } catch {
      // skip
    }
  }

  // Check entity name matches
  if (businessName) {
    const nameNorm = businessName.toLowerCase();
    for (const e of entities) {
      if (e.name.toLowerCase().includes(nameNorm) || nameNorm.includes(e.name.toLowerCase())) {
        return true;
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Main citation scan orchestrator
// ---------------------------------------------------------------------------

export async function runWeeklyCitations(env: Env): Promise<void> {
  if (!env.PERPLEXITY_API_KEY && !env.OPENAI_API_KEY) {
    console.log("Citation tracking: no API keys configured, skipping");
    return;
  }

  // Get all active clients with keywords
  const keywords = (
    await env.DB.prepare(
      "SELECT * FROM citation_keywords WHERE active = 1 ORDER BY client_slug, id"
    ).all<CitationKeyword>()
  ).results;

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

      // Run multiple times per engine for stability
      for (let run = 0; run < RUNS_PER_KEYWORD; run++) {
        // --- Perplexity ---
        if (env.PERPLEXITY_API_KEY) {
          try {
            const pResult = await queryPerplexity(kw.keyword, env.PERPLEXITY_API_KEY);
            const cited = wasClientCited(pResult.entities, pResult.urls, clientDomain, businessName);

            if (cited) {
              kwCited = true;
              if (!kwEngines.includes("perplexity")) kwEngines.push("perplexity");
            }

            // Track competitors
            for (const entity of pResult.entities) {
              const eName = entity.name.toLowerCase();
              if (eName !== clientDomain.replace(/^www\./, "").toLowerCase()) {
                competitorCounts.set(eName, (competitorCounts.get(eName) || 0) + 1);
              }
            }

            // Store run. Perplexity sonar has always been web-grounded.
            await env.DB.prepare(
              `INSERT INTO citation_runs (keyword_id, engine, response_text, cited_entities, cited_urls, client_cited, run_at, grounding_mode)
               VALUES (?, 'perplexity', ?, ?, ?, ?, ?, 'web')`
            )
              .bind(
                kw.id,
                pResult.text.slice(0, 4000),
                JSON.stringify(pResult.entities),
                JSON.stringify(pResult.urls),
                cited ? 1 : 0,
                now
              )
              .run();

            totalQueries++;
            if (cited) clientCitations++;
          } catch (err) {
            console.log(`Perplexity query failed for "${kw.keyword}": ${err}`);
          }

          // Rate limit: small delay between queries
          await new Promise((r) => setTimeout(r, 300));
        }

        // --- OpenAI ---
        if (env.OPENAI_API_KEY) {
          try {
            const oResult = await queryOpenAI(kw.keyword, env.OPENAI_API_KEY);
            // Now web-grounded: pass URLs to wasClientCited so a citation
            // counts when the live ChatGPT response cites the client's
            // domain in its url_citation annotations.
            const cited = wasClientCited(oResult.entities, oResult.urls, clientDomain, businessName);

            if (cited) {
              kwCited = true;
              if (!kwEngines.includes("openai")) kwEngines.push("openai");
            }

            // Track competitors from OpenAI
            for (const entity of oResult.entities) {
              const eName = entity.name.toLowerCase();
              if (
                eName !== clientDomain.replace(/^www\./, "").toLowerCase() &&
                (!businessName || eName !== businessName.toLowerCase())
              ) {
                competitorCounts.set(eName, (competitorCounts.get(eName) || 0) + 1);
              }
            }

            await env.DB.prepare(
              `INSERT INTO citation_runs (keyword_id, engine, response_text, cited_entities, cited_urls, client_cited, run_at, grounding_mode)
               VALUES (?, 'openai', ?, ?, ?, ?, ?, 'web')`
            )
              .bind(
                kw.id,
                oResult.text.slice(0, 4000),
                JSON.stringify(oResult.entities),
                JSON.stringify(oResult.urls),
                cited ? 1 : 0,
                now
              )
              .run();

            totalQueries++;
            if (cited) clientCitations++;
          } catch (err) {
            console.log(`OpenAI query failed for "${kw.keyword}": ${err}`);
          }

          await new Promise((r) => setTimeout(r, 200));
        }

        // --- Gemini ---
        if (env.GEMINI_API_KEY) {
          try {
            const gResult = await queryGemini(kw.keyword, env.GEMINI_API_KEY, env);
            // Skip persistence when the API returned nothing -- usually
            // means a 429 quota error (project on free tier without
            // billing, gemini-2.0-flash limit=0) or a transient 5xx.
            // Writing empty rows would poison the citation rate
            // calculation by inflating the denominator with non-runs.
            if (gResult.text.length === 0 && gResult.urls.length === 0) {
              // Fall through to the rate-limit sleep at the end of
              // the Gemini block so we still pace the Anthropic call.
            } else {
            // Web-grounded: pass URLs from googleSearch groundingChunks
            const cited = wasClientCited(gResult.entities, gResult.urls, clientDomain, businessName);

            if (cited) {
              kwCited = true;
              if (!kwEngines.includes("gemini")) kwEngines.push("gemini");
            }

            for (const entity of gResult.entities) {
              const eName = entity.name.toLowerCase();
              if (
                eName !== clientDomain.replace(/^www\./, "").toLowerCase() &&
                (!businessName || eName !== businessName.toLowerCase())
              ) {
                competitorCounts.set(eName, (competitorCounts.get(eName) || 0) + 1);
              }
            }

            await env.DB.prepare(
              `INSERT INTO citation_runs (keyword_id, engine, response_text, cited_entities, cited_urls, client_cited, run_at, grounding_mode)
               VALUES (?, 'gemini', ?, ?, ?, ?, ?, 'web')`
            )
              .bind(
                kw.id,
                gResult.text.slice(0, 4000),
                JSON.stringify(gResult.entities),
                JSON.stringify(gResult.urls),
                cited ? 1 : 0,
                now
              )
              .run();

            totalQueries++;
            if (cited) clientCitations++;
            }  // end: gResult had data
          } catch (err) {
            console.log(`Gemini query failed for "${kw.keyword}": ${err}`);
          }

          await new Promise((r) => setTimeout(r, 200));
        }

        // --- Claude (Anthropic) ---
        if (env.ANTHROPIC_API_KEY) {
          try {
            const cResult = await queryClaude(kw.keyword, env.ANTHROPIC_API_KEY);
            const cited = wasClientCited(cResult.entities, [], clientDomain, businessName);

            if (cited) {
              kwCited = true;
              if (!kwEngines.includes("anthropic")) kwEngines.push("anthropic");
            }

            for (const entity of cResult.entities) {
              const eName = entity.name.toLowerCase();
              if (
                eName !== clientDomain.replace(/^www\./, "").toLowerCase() &&
                (!businessName || eName !== businessName.toLowerCase())
              ) {
                competitorCounts.set(eName, (competitorCounts.get(eName) || 0) + 1);
              }
            }

            // Anthropic still LLM-only (web search tool integration is
            // a Phase 3 upgrade). Marked grounding_mode='training' so
            // analytics can distinguish from grounded engines.
            await env.DB.prepare(
              `INSERT INTO citation_runs (keyword_id, engine, response_text, cited_entities, cited_urls, client_cited, run_at, grounding_mode)
               VALUES (?, 'anthropic', ?, ?, '[]', ?, ?, 'training')`
            )
              .bind(
                kw.id,
                cResult.text.slice(0, 4000),
                JSON.stringify(cResult.entities),
                cited ? 1 : 0,
                now
              )
              .run();

            totalQueries++;
            if (cited) clientCitations++;
          } catch (err) {
            console.log(`Claude query failed for "${kw.keyword}": ${err}`);
          }

          await new Promise((r) => setTimeout(r, 200));
        }
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
