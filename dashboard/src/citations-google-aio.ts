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
import { isNoResults, isTransientDfsFailure, DFS_RETRY_DELAY_MS } from "./lib/dataforseo-status";

const ENDPOINT = "https://api.dataforseo.com/v3/serp/google/organic/live/advanced";

/** Result shape matching the other engine query functions. */
export interface AIOResult {
  text: string;
  urls: string[];
  entities: CitedEntity[];
  /** DataForSEO reports what each task actually cost, so these rows are
   *  recorded as `reported` rather than modelled from a rate table. */
  usage?: { inputTokens?: number; outputTokens?: number; providerCostUsd?: number };
  /** Set ONLY when the call did not complete. Absent on a real empty answer.
   *  Until 2026-10-01 every DataForSEO error returned a plain empty result,
   *  which skipReason() reads as a genuine empty answer: an empty balance would
   *  have recorded "no overview rendered" for every query and written nothing
   *  to engine_failures. engine_failures had never held a bing or AIO row. */
  failure?: { engine: string; status: number; detail: string };
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
async function queryGoogleAIOOnce(keyword: string, env: Env): Promise<AIOResult> {
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
    // location_code 2840 = United States (country-level). Safe default
    // that always works. Per-client Honolulu-specific targeting can be
    // added later by looking up the actual Honolulu DMA code via
    // DataForSEO's /v3/serp/google/locations endpoint. Query content
    // already disambiguates location for most "X in Honolulu" queries.
    location_code: 2840,
    device: "desktop",
    depth: 10,           // need at least 10 results for AI Overview to render
    // CRITICAL: AI Overview is NOT returned by default. Must opt in.
    // Costs an extra $0.002 per query, but DataForSEO refunds the
    // surcharge when no AIO renders ("asynchronous_ai_overview: false"
    // in the response triggers the refund). Net cost is lower than
    // the baseline estimate.
    load_async_ai_overview: true,
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
    return { text: "", urls: [], entities: [], failure: { engine: "google_ai_overview", status: 0, detail: `DataForSEO fetch error: ${String(e).slice(0, 300)}` } };
  }

  if (!resp.ok) {
    console.log(`[google-aio] DataForSEO HTTP ${resp.status} for "${keyword}"`);
    const body = await resp.text().catch(() => "");
    return { text: "", urls: [], entities: [], failure: { engine: "google_ai_overview", status: resp.status, detail: `DataForSEO HTTP ${resp.status}: ${body.slice(0, 300)}` } };
  }

  let data: DfsResponse;
  try {
    data = await resp.json() as DfsResponse;
  } catch (e) {
    console.log(`[google-aio] bad JSON for "${keyword}": ${e}`);
    return { text: "", urls: [], entities: [], failure: { engine: "google_ai_overview", status: 200, detail: `DataForSEO bad JSON: ${String(e).slice(0, 200)}` } };
  }

  // DataForSEO uses 20000 as the success status code (their convention,
  // not HTTP). Anything else means the task failed -- log and bail.
  if (data.status_code !== 20000) {
    console.log(`[google-aio] DataForSEO status ${data.status_code} for "${keyword}": ${data.status_message}`);
    // Top-level codes are about the REQUEST (auth, balance, limits), never
    // about whether the query had results, so any non-20000 here is a failure.
    return { text: "", urls: [], entities: [], failure: { engine: "google_ai_overview", status: 200, detail: `DataForSEO ${data.status_code}: ${data.status_message ?? ""}` } };
  }

  const task = data.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    console.log(`[google-aio] task error for "${keyword}": ${task?.status_message ?? "unknown"}`);
    // "No Search Results" is a genuine empty answer, not a failure.
    if (task && isNoResults(task.status_code, task.status_message)) return { text: "", urls: [], entities: [] };
    return { text: "", urls: [], entities: [], failure: { engine: "google_ai_overview", status: 200, detail: `DataForSEO ${task?.status_code ?? "no task"}: ${task?.status_message ?? "unknown"}` } };
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

/**
 * One retry for a TRANSIENT DataForSEO failure, never for billing or auth.
 *
 * Once failures became visible on 2026-10-01, google_ai_overview showed 16,
 * 22 and 11 "40101 Internal SE Server Error" a night out of ~63 calls: a
 * quarter to a third of the surface lost to an upstream hiccup that a second
 * attempt usually clears. A retried success is a real reading of the same
 * question on the same night, so it is recorded like any other.
 */
export async function queryGoogleAIO(keyword: string, env: Env): Promise<AIOResult> {
  const first = await queryGoogleAIOOnce(keyword, env);
  if (!first.failure || !isTransientDfsFailure(first.failure.status, first.failure.detail)) return first;
  await new Promise((r) => setTimeout(r, DFS_RETRY_DELAY_MS));
  const second = await queryGoogleAIOOnce(keyword, env);
  if (second.failure) {
    second.failure = { ...second.failure, detail: `after retry: ${second.failure.detail}` };
  }
  return second;
}
