/**
 * Bing / Microsoft Copilot citation tracking via DataForSEO.
 *
 * Microsoft Copilot's web answers are powered by Bing's index, so
 * tracking Bing organic SERP gives us the same surface that Copilot
 * draws from. Plus Bing has its own "answer_box" and "featured_snippet"
 * items that act like the AI Overview equivalent. We extract URLs
 * from all of these to build the citation set for matching against
 * the client's domain.
 *
 * Same auth as citations-google-aio.ts (DataForSEO Basic auth with
 * DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD env vars). Same response
 * shape returned: { text, urls, entities }.
 *
 * Cost: ~$0.002 per Bing organic SERP query (cheapest tier in the
 * DataForSEO catalog, no AI Overview multiplier needed). At our
 * scale that's pennies per customer per month.
 */
import type { Env, CitedEntity } from "./types";

const ENDPOINT = "https://api.dataforseo.com/v3/serp/bing/organic/live/advanced";

export interface BingResult {
  text: string;
  urls: string[];
  entities: CitedEntity[];
}

interface DfsBingItem {
  type?: string;
  title?: string;
  description?: string;
  url?: string;
  domain?: string;
  source?: string;
  // featured_snippet / answer_box fields
  text?: string;
  // organic fields
  rank_absolute?: number;
}

interface DfsBingResponse {
  status_code?: number;
  status_message?: string;
  tasks?: Array<{
    status_code?: number;
    status_message?: string;
    result?: Array<{
      items?: DfsBingItem[];
    }>;
  }>;
}

/** Run one Bing/Copilot query through DataForSEO. */
export async function queryBing(keyword: string, env: Env): Promise<BingResult> {
  if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) {
    return { text: "", urls: [], entities: [] };
  }

  const auth = "Basic " + btoa(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`);

  const body = [{
    keyword,
    language_code: "en",
    location_code: 2840,    // United States, country level
    device: "desktop",
    depth: 10,
  }];

  let resp: Response;
  try {
    resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.log(`[bing] fetch error for "${keyword}": ${e}`);
    return { text: "", urls: [], entities: [] };
  }

  if (!resp.ok) {
    console.log(`[bing] DataForSEO HTTP ${resp.status} for "${keyword}"`);
    return { text: "", urls: [], entities: [] };
  }

  let data: DfsBingResponse;
  try {
    data = await resp.json() as DfsBingResponse;
  } catch (e) {
    console.log(`[bing] bad JSON for "${keyword}": ${e}`);
    return { text: "", urls: [], entities: [] };
  }

  if (data.status_code !== 20000) {
    console.log(`[bing] DataForSEO status ${data.status_code} for "${keyword}": ${data.status_message}`);
    return { text: "", urls: [], entities: [] };
  }

  const task = data.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    console.log(`[bing] task error for "${keyword}": ${task?.status_message ?? "unknown"}`);
    return { text: "", urls: [], entities: [] };
  }

  const items = task.result?.[0]?.items ?? [];

  // Build a synthesized "answer text" from Bing's various response
  // types so the matching code in citations.ts has something to scan.
  // We prioritize answer_box / featured_snippet (Bing's AI-equivalent
  // surfaces) and fall back to organic title+description for the top
  // few results.
  const textParts: string[] = [];
  const urls: string[] = [];
  const entities: CitedEntity[] = [];

  for (const item of items) {
    const t = item.type;
    // Answer-box / featured-snippet are Bing's AI-Overview-equivalent
    // surfaces. Their text is what Copilot would paraphrase.
    if (t === "answer_box" || t === "featured_snippet") {
      if (item.title) textParts.push(item.title.trim());
      if (item.description) textParts.push(item.description.trim());
      if (item.text) textParts.push(item.text.trim());
      if (item.url) urls.push(item.url);
      const entityName = item.source || item.domain || (item.url ? safeHostname(item.url) : "") || item.title || "";
      if (entityName) {
        entities.push({ name: entityName, url: item.url || null, context: "bing" });
      }
    }
    // Top 5 organic results count as the "what Bing/Copilot would
    // surface" set. We cap at 5 to mirror what the AI summary would
    // typically pull from.
    else if (t === "organic" && item.rank_absolute && item.rank_absolute <= 5) {
      if (item.title) textParts.push(item.title.trim());
      if (item.description) textParts.push(item.description.trim());
      if (item.url) urls.push(item.url);
      const entityName = item.source || item.domain || (item.url ? safeHostname(item.url) : "") || item.title || "";
      if (entityName) {
        entities.push({ name: entityName, url: item.url || null, context: "bing" });
      }
    }
  }

  const text = textParts.join("\n").slice(0, 8000);
  return { text, urls, entities };
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
