/**
 * dashboard/src/lib/kv-paginate.ts
 *
 * Shared helper for paginating Cloudflare KV list() calls.
 *
 * Why this exists: KV.list({ prefix, limit }) returns keys
 * ALPHABETICALLY and caps at 1000 per call. When keys are
 * epoch-prefixed (like event:scan:<ms-timestamp>:<random>), alphabetical
 * == chronological with the OLDEST keys first. A single list call
 * past 1000 total keys returns only the OLDEST 1000 — the newest
 * events are invisible. The first instance of this bug caused
 * /admin/free-check to show 3-day-old scans while real-time traffic
 * kept landing in KV.
 *
 * Every place that lists KV by prefix MUST paginate through every
 * page via the cursor until list_complete. This helper enforces that
 * pattern in one place so callers can't forget it.
 *
 * DO NOT use raw env.LEADS.list({ prefix, limit }) for prefix lists
 * intended to return "all matching keys" or "the newest N keys."
 * Use listAllKeys() instead. The dashboard repo has a grep check in
 * scripts/check-kv-list-usage.sh that runs in voice-check.sh.
 */

import type { KVNamespace } from "@cloudflare/workers-types";

export interface ListedKey {
  name: string;
  expiration?: number;
  metadata?: unknown;
}

/**
 * Paginate KV.list to retrieve all keys with the given prefix.
 *
 * @param kv The KV namespace binding (e.g. env.LEADS).
 * @param prefix The key prefix to filter on.
 * @param maxPages Safety cap so the worker subrequest budget never
 *   blows up if a namespace gets unexpectedly large. Default 10 =
 *   up to 10,000 keys. Bump if your namespace genuinely needs more.
 * @returns Array of all matching keys, alphabetically sorted (which
 *   means chronologically sorted for epoch-prefixed keys, oldest
 *   first). Caller does .slice(-N) for newest-N semantics.
 */
export async function listAllKeys(
  kv: KVNamespace,
  prefix: string,
  maxPages = 10,
): Promise<ListedKey[]> {
  const all: ListedKey[] = [];
  let cursor: string | undefined = undefined;
  for (let page = 0; page < maxPages; page++) {
    const r = await kv.list({ prefix, limit: 1000, cursor }) as {
      keys: ListedKey[];
      list_complete: boolean;
      cursor?: string;
    };
    all.push(...r.keys);
    if (r.list_complete) break;
    cursor = r.cursor;
    if (!cursor) break;
  }
  return all;
}

/**
 * Count keys with a given prefix without fetching values.
 *
 * Same pagination contract as listAllKeys() but returns just the count.
 * Cheap. Use when you only need "how many leads do I have" rather
 * than the actual lead data.
 */
export async function countKeys(
  kv: KVNamespace,
  prefix: string,
  maxPages = 10,
): Promise<number> {
  const keys = await listAllKeys(kv, prefix, maxPages);
  return keys.length;
}
