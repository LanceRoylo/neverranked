/**
 * Dashboard -- Citation tracking engine
 *
 * Queries Perplexity and OpenAI APIs with client keywords,
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

async function queryOpenAI(
  keyword: string,
  apiKey: string
): Promise<{ text: string; entities: CitedEntity[] }> {
  const resp = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You recommend local businesses and services. Always include specific business names. Return structured JSON with the businesses you would recommend.",
        },
        { role: "user", content: keyword },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "BusinessRecommendations",
          strict: true,
          schema: {
            type: "object",
            properties: {
              businesses: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    url: { type: ["string", "null"] },
                    reason: { type: "string" },
                  },
                  required: ["name", "url", "reason"],
                  additionalProperties: false,
                },
              },
            },
            required: ["businesses"],
            additionalProperties: false,
          },
        },
      },
      temperature: 0.4,
      max_tokens: 1024,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.log(`OpenAI error for "${keyword}": ${resp.status} ${err}`);
    return { text: "", entities: [] };
  }

  const data = (await resp.json()) as {
    choices: { message: { content: string } }[];
  };

  const rawContent = data.choices?.[0]?.message?.content || "{}";
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
    console.log(`OpenAI JSON parse failed for "${keyword}"`);
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

            // Store run
            await env.DB.prepare(
              `INSERT INTO citation_runs (keyword_id, engine, response_text, cited_entities, cited_urls, client_cited, run_at)
               VALUES (?, 'perplexity', ?, ?, ?, ?, ?)`
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
            const cited = wasClientCited(oResult.entities, [], clientDomain, businessName);

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
              `INSERT INTO citation_runs (keyword_id, engine, response_text, cited_entities, cited_urls, client_cited, run_at)
               VALUES (?, 'openai', ?, ?, '[]', ?, ?)`
            )
              .bind(
                kw.id,
                oResult.text.slice(0, 4000),
                JSON.stringify(oResult.entities),
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
      }

      keywordResults.push({
        keyword: kw.keyword,
        keywordId: kw.id,
        cited: kwCited,
        engines: kwEngines,
      });
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

  const prompt = `Generate 15 search queries that a potential customer would ask an AI assistant (like ChatGPT or Perplexity) when looking for a ${industry} business in ${location}. The queries should be the kind where AI would recommend specific businesses by name.

Include a mix of:
- Direct recommendation queries ("best ${industry} in ${location}")
- Problem-based queries ("I need help with X in ${location}")
- Comparison queries ("${industry} near me recommendations")
- Specific service queries related to ${industry}

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
