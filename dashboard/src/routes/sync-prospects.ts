/**
 * POST /api/admin/sync-prospects
 *
 * Lance's local outreach tool POSTs prospect metadata here so D1
 * has enough context to auto-generate personalized Previews without
 * Lance typing anything in the dashboard.
 *
 * Auth: ADMIN_SECRET in the X-Admin-Secret header. Same convention
 * as /api/admin/leads.json and /api/admin/referrers.
 *
 * Body (either shape works):
 *
 *   Bulk:
 *     {
 *       "prospects": [
 *         { "prospect_id": 192, "email": "...", "name": "...",
 *           "company_name": "...", "domain": "...", "vertical": "...",
 *           "city": "...", "notes": "..." },
 *         { ... }
 *       ]
 *     }
 *
 *   Single:
 *     { "prospect_id": 192, "email": "...", ... }
 *
 * Behavior:
 *   - Upsert per prospect_id. Existing rows get their metadata
 *     overwritten with the latest values; last_synced_at gets bumped.
 *   - Best-effort: a malformed row gets skipped and reported back
 *     in `skipped`, the rest land normally.
 *   - Idempotent. Safe to re-run the whole list periodically.
 */

import type { Env } from "../types";

interface IncomingProspect {
  prospect_id: number;
  email?: string;
  name?: string;
  company_name?: string;
  domain?: string;
  vertical?: string;
  city?: string;
  notes?: string;
}

export async function handleSyncProspects(request: Request, env: Env): Promise<Response> {
  // Same auth header convention as the other /api/admin/* endpoints.
  const provided = request.headers.get("x-admin-secret") || "";
  if (!env.ADMIN_SECRET || provided !== env.ADMIN_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const list: IncomingProspect[] = Array.isArray((payload as { prospects?: unknown }).prospects)
    ? ((payload as { prospects: IncomingProspect[] }).prospects)
    : [(payload as IncomingProspect)];

  let upserted = 0;
  const skipped: Array<{ prospect_id?: unknown; reason: string }> = [];

  for (const p of list) {
    if (!p || typeof p.prospect_id !== "number" || !Number.isFinite(p.prospect_id)) {
      skipped.push({ prospect_id: p?.prospect_id, reason: "prospect_id missing or not a number" });
      continue;
    }
    const domain = typeof p.domain === "string"
      ? p.domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "")
      : null;
    try {
      await env.DB.prepare(
        `INSERT INTO outreach_prospects
           (prospect_id, email, name, company_name, domain, vertical, city, notes,
            last_synced_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
         ON CONFLICT(prospect_id) DO UPDATE SET
           email = excluded.email,
           name = excluded.name,
           company_name = excluded.company_name,
           domain = excluded.domain,
           vertical = excluded.vertical,
           city = excluded.city,
           notes = excluded.notes,
           last_synced_at = unixepoch()`,
      )
        .bind(
          p.prospect_id,
          p.email?.trim() || null,
          p.name?.trim() || null,
          p.company_name?.trim() || null,
          domain,
          p.vertical?.trim() || null,
          p.city?.trim() || null,
          p.notes?.trim() || null,
        )
        .run();
      upserted++;
    } catch (e) {
      skipped.push({
        prospect_id: p.prospect_id,
        reason: e instanceof Error ? e.message : "insert failed",
      });
    }
  }

  return Response.json({ ok: true, upserted, skipped, skipped_count: skipped.length });
}

/**
 * Look up a single prospect's metadata. Returns null if not synced.
 */
export interface ProspectMetadata {
  prospect_id: number;
  email: string | null;
  name: string | null;
  company_name: string | null;
  domain: string | null;
  vertical: string | null;
  city: string | null;
  notes: string | null;
  last_synced_at: number;
}

// REPOINTED 2026-05-16 (Workers cutover): the narrow outreach_prospects
// table was fed by the now-retired laptop via /api/admin/sync-prospects
// and is no longer updated. The full prospect data lives in
// outreach_prospects_master (migrated + delta-synced, 508 rows). Read
// from there with a faithful column mapping so Build Preview / Build
// Draft / the warm list all work post-cutover. domain is derived from
// the email (master has no domain column); the old endpoint + narrow
// table are intentionally left in place (blast-radius minimal).
export async function getProspectMetadata(
  env: Env,
  prospect_id: number,
): Promise<ProspectMetadata | null> {
  const row = await env.DB.prepare(
    `SELECT id              AS prospect_id,
            email,
            broker_name     AS name,
            brokerage_name  AS company_name,
            CASE
              WHEN email LIKE '%@%'
              THEN LOWER(SUBSTR(email, INSTR(email, '@') + 1))
              ELSE NULL
            END             AS domain,
            vertical,
            market          AS city,
            notes,
            CAST(strftime('%s', COALESCE(updated_at, CURRENT_TIMESTAMP)) AS INTEGER) AS last_synced_at
       FROM outreach_prospects_master WHERE id = ?`,
  ).bind(prospect_id).first<ProspectMetadata>();
  return row;
}
