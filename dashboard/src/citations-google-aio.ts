/**
 * Google AI Overviews coverage via DataForSEO.
 *
 * Google AIO is server-side rendered from Google search results -- there
 * is no public API. Every AEO competitor (Profound, Athena HQ, Otterly)
 * gets at this data through a third-party SERP API. We use DataForSEO
 * because it's pay-as-you-go (~$0.01 per AIO query at our scale, $50
 * minimum prepay, no monthly subscription).
 *
 * This module is the parallel of queryPerplexity / queryOpenAI / etc.
 * It returns the same shape so the per-engine ingest in citations.ts
 * can call it identically: { text, urls, entities }.
 *
 * Auth: DataForSEO uses Basic auth with login + password (not a single
 * API key). Both env vars must be set; otherwise the function returns
 * empty results and the caller's "if no data, skip the INSERT" guard
 * triggers -- exactly the pattern Gemini uses for quota errors.
 *
 * Endpoint: /v3/serp/google/organic/live/advanced returns a regular
 * SERP response with the AI Overview embedded as an item of
 * type='ai_overview' in the items array. We parse that item out and
 * return its text + references. When no AIO is present (common for
 * navigational/branded queries), we return empty results.
 *
 * Geographic targeting: defaults to Honolulu, Hawaii. When we expose
 * per-client location settings later, override at the call site.
 */
import type { Env, CitedEntity } from "./types";

const ENDPOINT = "https://api.dataforseo.com/v3/serp/google/organic/live/advanced";

/** Result shape matching the other engine query functions. */
export interface AIOResult {
  text: string;
  urls: string[];
  entities: CitedEntity[];
}

interface DfsTaskResult {
  items?: Array<{
    type?: string;
    title?: string;
    text?: string;
    markdown?: string;
    references?: Array<{ url?: string; title?: string; source?: string; domain?: string }>;
  }>;
}

interface DfsResponse {
  status_code?: number;
  status_message?: string;
  tasks?: Array<{
    status_code?: number;
    status_message?: string;
    result?: DfsTaskResult[];
  }>;
}

/** Run one AI Overview query through DataForSEO. */
export async function queryGoogleAIO(keyword: string, env: Env): Promise<AIOResult> {
  if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) {
    return { text: "", urls: [], entities: [] };
  }

  // Basic auth header. btoa is available in Workers; falling back to
  // a manual base64 encode would require importing a polyfill.
  const auth = "Basic " + btoa(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`);

  // DataForSEO accepts an array of tasks per request. We send one
  // task per call to keep error handling simple. Their "live/advanced"
  // mode returns results synchronously in 2-5 seconds.
  const body = [{
    keyword,
    language_code: "en",
    location_name: "Honolulu, Hawaii, United States",
    device: "desktop",
    depth: 10,           // need at least 10 results for AI Overview to render
    // people_also_ask_click_depth omitted; we only care about AIO
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
    console.log(`[google-aio] fetch error for "${keyword}": ${e}`);
    return { text: "", urls: [], entities: [] };
  }

  if (!resp.ok) {
    console.log(`[google-aio] DataForSEO HTTP ${resp.status} for "${keyword}"`);
    return { text: "", urls: [], entities: [] };
  }

  let data: DfsResponse;
  try {
    data = await resp.json() as DfsResponse;
  } catch (e) {
    console.log(`[google-aio] bad JSON for "${keyword}": ${e}`);
    return { text: "", urls: [], entities: [] };
  }

  // DataForSEO uses 20000 as the success status code (their convention,
  // not HTTP). Anything else means the task failed -- log and bail.
  if (data.status_code !== 20000) {
    console.log(`[google-aio] DataForSEO status ${data.status_code} for "${keyword}": ${data.status_message}`);
    return { text: "", urls: [], entities: [] };
  }

  const task = data.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    console.log(`[google-aio] task error for "${keyword}": ${task?.status_message ?? "unknown"}`);
    return { text: "", urls: [], entities: [] };
  }

  const items = task.result?.[0]?.items ?? [];
  // Find the AI Overview item. When AIO didn't render for this query
  // (very common -- nav queries, branded queries, etc), there's simply
  // no item with type='ai_overview' and we return empty.
  const aioItem = items.find((it) => it.type === "ai_overview");
  if (!aioItem) return { text: "", urls: [], entities: [] };

  // Prefer markdown when available (cleaner block separation), fall
  // back to text. Either way cap to 8000 chars to match the other
  // engines' response_text storage budget.
  const text = (aioItem.markdown || aioItem.text || "").slice(0, 8000);

  // Pull URLs and entities from references. Each reference is one
  // citation chip in the AIO panel.
  const urls: string[] = [];
  const entities: CitedEntity[] = [];
  for (const ref of aioItem.references ?? []) {
    if (ref.url) urls.push(ref.url);
    // Entity name preference: source -> domain -> hostname-from-url -> title
    let entityName = ref.source || ref.domain || "";
    if (!entityName && ref.url) {
      try { entityName = new URL(ref.url).hostname.replace(/^www\./, ""); }
      catch { /* skip */ }
    }
    if (!entityName) entityName = ref.title || "";
    if (entityName) {
      entities.push({
        name: entityName,
        url: ref.url || null,
        context: "google_ai_overview",
      });
    }
  }

  return { text, urls, entities };
}
