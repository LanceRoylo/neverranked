/**
 * query-set.ts — the hash and change log the methodology page promises.
 *
 * The published page says a customer's question set is locked and that any
 * change breaks comparability across it. Until 2026-09-06 neither half was
 * implemented on the customer side: no hash, and no record of edits, because
 * citation_keywords carries created_at but no updated_at and no log.
 *
 * That is not a bookkeeping detail. Aggregates are computed over whatever ran,
 * so a set that changes mid-engagement silently compares two different
 * universes month over month. hawaii-theatre's August window ran 34 questions
 * and 16 of them were gone by September. The measured effect on the reported
 * aggregate was about half a percentage point, inside the noise at the
 * resolution published, but nobody could have known that without this table.
 *
 * See neverranked-docs/CLAIMS-VS-CODE-AUDIT-2026-09-06.md finding 1.
 */

import type { Env } from "../types";

/**
 * SHA-256 over the active keyword strings, sorted then newline-joined.
 *
 * Sorted so that reordering rows in the table is not a "change" (the set is a
 * set, not a sequence). Trimmed so whitespace edits do not read as content
 * edits. Anything else about a keyword changing IS a content change and must
 * move the hash, which is the entire point.
 */
export async function hashQuerySet(keywords: string[]): Promise<string> {
  const canonical = [...keywords].map((k) => k.trim()).sort().join("\n");
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface QuerySetVersion {
  set_hash: string;
  question_count: number;
  keywords_json: string;
  observed_at: number;
  prev_hash: string | null;
  added_json: string;
  removed_json: string;
}

/** The client's current active set, in canonical (sorted, trimmed) order. */
export async function activeQuerySet(env: Env, clientSlug: string): Promise<string[]> {
  const rows = (await env.DB.prepare(
    "SELECT keyword FROM citation_keywords WHERE client_slug = ? AND active = 1"
  ).bind(clientSlug).all<{ keyword: string }>()).results;
  return rows.map((r) => (r.keyword || "").trim()).filter(Boolean).sort();
}

/** Most recent recorded version, or null if this client has never been seen. */
export async function latestQuerySetVersion(
  env: Env,
  clientSlug: string,
): Promise<QuerySetVersion | null> {
  return await env.DB.prepare(
    `SELECT set_hash, question_count, keywords_json, observed_at, prev_hash, added_json, removed_json
       FROM query_set_versions WHERE client_slug = ?
      ORDER BY observed_at DESC, id DESC LIMIT 1`
  ).bind(clientSlug).first<QuerySetVersion>();
}

export interface RecordResult {
  changed: boolean;
  hash: string;
  count: number;
  added: string[];
  removed: string[];
  /** True on the very first observation, which is a baseline and not a drift
   *  event. Callers must not alert on it. */
  first: boolean;
}

/**
 * Record the current set IF its hash differs from the last recorded one.
 * Append-only and idempotent: calling it repeatedly on an unchanged set writes
 * nothing, so it is safe on a daily cron.
 */
export async function recordQuerySetVersion(
  env: Env,
  clientSlug: string,
): Promise<RecordResult | null> {
  const keywords = await activeQuerySet(env, clientSlug);
  // An empty active set is almost certainly a misconfiguration or a partial
  // write, not a deliberate "the customer now has zero questions". Recording
  // it would enter a bogus baseline that every future diff is measured
  // against, so refuse. Fail closed, same as every other guard here.
  if (keywords.length === 0) {
    console.log(`[query-set] ${clientSlug}: no active keywords; refusing to record an empty set`);
    return null;
  }

  const hash = await hashQuerySet(keywords);
  const prev = await latestQuerySetVersion(env, clientSlug);
  if (prev && prev.set_hash === hash) {
    return { changed: false, hash, count: keywords.length, added: [], removed: [], first: false };
  }

  let prevKeywords: string[] = [];
  if (prev) {
    try { prevKeywords = JSON.parse(prev.keywords_json) as string[]; } catch { prevKeywords = []; }
  }
  const prevSet = new Set(prevKeywords);
  const curSet = new Set(keywords);
  const added = keywords.filter((k) => !prevSet.has(k));
  const removed = prevKeywords.filter((k) => !curSet.has(k));

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO query_set_versions
       (client_slug, set_hash, question_count, keywords_json, observed_at, prev_hash, added_json, removed_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    clientSlug,
    hash,
    keywords.length,
    JSON.stringify(keywords),
    now,
    prev ? prev.set_hash : null,
    JSON.stringify(added),
    JSON.stringify(removed),
  ).run();

  const first = !prev;
  console.log(
    first
      ? `[query-set] ${clientSlug}: baseline recorded, ${keywords.length} questions, hash ${hash.slice(0, 12)}`
      : `[query-set] ${clientSlug}: SET CHANGED, ${prev!.question_count} -> ${keywords.length} questions ` +
        `(+${added.length} / -${removed.length}), hash ${prev!.set_hash.slice(0, 12)} -> ${hash.slice(0, 12)}`
  );
  return { changed: true, hash, count: keywords.length, added, removed, first };
}

/**
 * What the set was at a point in time. This is the question the audit could
 * not answer on 2026-09-06 and had to reconstruct from run data.
 * Returns null when nothing was recorded yet at that moment.
 */
export async function querySetAt(
  env: Env,
  clientSlug: string,
  atUnix: number,
): Promise<{ set_hash: string; question_count: number; keywords: string[]; observed_at: number } | null> {
  const row = await env.DB.prepare(
    `SELECT set_hash, question_count, keywords_json, observed_at
       FROM query_set_versions
      WHERE client_slug = ? AND observed_at <= ?
      ORDER BY observed_at DESC, id DESC LIMIT 1`
  ).bind(clientSlug, atUnix).first<{ set_hash: string; question_count: number; keywords_json: string; observed_at: number }>();
  if (!row) return null;
  let keywords: string[] = [];
  try { keywords = JSON.parse(row.keywords_json) as string[]; } catch { /* keep empty */ }
  return {
    set_hash: row.set_hash,
    question_count: row.question_count,
    keywords,
    observed_at: row.observed_at,
  };
}

/**
 * Record every registry client's set and raise an admin alert when one changes
 * mid-engagement. The alert exists because the methodology page states that a
 * change makes runs non-comparable across it, and a stated consequence with no
 * detection behind it is the shape of gap this whole audit was about.
 *
 * The first observation per client is a baseline and never alerts.
 */
export async function sweepQuerySets(env: Env): Promise<void> {
  // GATE ON WHAT IS ACTUALLY MEASURED, not on the registry.
  //
  // planCitationRun dispatches from citation_keywords WHERE active = 1. This
  // swept measurement_registry WHERE active = 1 instead, which is a different
  // question, so a client with live keywords and no armed registry row was
  // measured every day and hashed never. Found 2026-09-09 while checking a
  // methodology sentence: one slug was in exactly that state.
  //
  // Two definitions of "is this client being measured" is the same drift that
  // put a private Layer 1 set in one file and none in its neighbour. There is
  // one definition now, and it is the one the dispatcher uses.
  const clients = (await env.DB.prepare(
    "SELECT DISTINCT client_slug FROM citation_keywords WHERE active = 1 AND client_slug IS NOT NULL"
  ).all<{ client_slug: string }>()).results;

  for (const { client_slug } of clients) {
    try {
      const res = await recordQuerySetVersion(env, client_slug);
      if (!res || !res.changed || res.first) continue;

      // current = prev + added - removed, so prev = current - added + removed.
      const prevCount = res.count - res.added.length + res.removed.length;
      const detail =
        `Question set changed from ${prevCount} to ${res.count} questions ` +
        `(+${res.added.length} added, -${res.removed.length} removed). New hash ${res.set_hash.slice(0, 12)}. ` +
        `Aggregates before and after this point are computed over different question sets, so ` +
        `month-over-month comparisons that span it are not like-for-like. ` +
        (res.added.length ? `Added: ${res.added.slice(0, 5).join(" | ")}${res.added.length > 5 ? " ..." : ""}. ` : "") +
        (res.removed.length ? `Removed: ${res.removed.slice(0, 5).join(" | ")}${res.removed.length > 5 ? " ..." : ""}.` : "");

      await env.DB.prepare(
        `INSERT INTO admin_alerts (client_slug, type, title, detail, created_at)
           VALUES (?, 'query_set_changed', ?, ?, ?)`
      ).bind(
        client_slug,
        `Question set changed for ${client_slug}`,
        detail,
        Math.floor(Date.now() / 1000),
      ).run();
    } catch (e) {
      console.log(`[query-set] ${client_slug}: sweep failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
