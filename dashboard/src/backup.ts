/**
 * Dashboard -- Weekly D1 backup to R2
 *
 * Cloudflare's Time Travel gives us 30-day point-in-time restore on
 * the managed side, but that's locked inside the Cloudflare account.
 * This cron makes our own weekly snapshot into R2 (AGENCY_ASSETS
 * bucket, under a `backups/` prefix) as a plain JSON blob so:
 *
 *   1. We can download and inspect it offline if D1 ever goes weird
 *   2. If we lose the Cloudflare account, we keep the data
 *   3. It's cheap (D1 is tiny -- single-digit MB)
 *
 * The snapshot covers the tables that actually matter for recovery:
 * prospects-adjacent agency state and the clients/scans/roadmap data
 * that's hard to reconstruct. We skip ephemeral stuff (sessions,
 * magic_links, page_views) since those rebuild organically.
 *
 * Called from the Monday weekly-tasks branch of the scheduled handler.
 */
'use strict';

import type { Env } from "./types";

const BACKUP_TABLES = [
  "agencies",
  "agency_applications",
  "agency_invites",
  "agency_slot_events",
  "users",
  "domains",
  "scan_results",
  "page_scans",
  "roadmap_items",
  "schema_injections",
  "competitor_suggestions",
  "citation_tracking",
  "admin_alerts",
  "automation_log",
  "automation_settings",
  "shared_reports",
] as const;

export async function runWeeklyBackup(env: Env): Promise<void> {
  const bucket = (env as any).AGENCY_ASSETS;
  if (!bucket) {
    console.log("[backup] AGENCY_ASSETS bucket binding missing, skipping");
    return;
  }

  const started = Date.now();
  const snapshot: Record<string, unknown[]> = {};
  const errors: Record<string, string> = {};
  let totalRows = 0;

  for (const table of BACKUP_TABLES) {
    try {
      const result = await env.DB.prepare(`SELECT * FROM ${table}`).all();
      const rows = result.results || [];
      snapshot[table] = rows as unknown[];
      totalRows += rows.length;
    } catch (e) {
      errors[table] = String(e).slice(0, 200);
      snapshot[table] = [];
    }
  }

  const now = new Date();
  const key = `backups/d1-${now.toISOString().slice(0, 10)}.json`;
  const payload = {
    schema_version: 1,
    taken_at: now.toISOString(),
    row_count: totalRows,
    tables: BACKUP_TABLES,
    errors,
    data: snapshot,
  };

  try {
    const body = JSON.stringify(payload);
    await bucket.put(key, body, {
      httpMetadata: { contentType: "application/json" },
      customMetadata: {
        taken_at: payload.taken_at,
        row_count: String(totalRows),
      },
    });
    console.log(`[backup] wrote ${key} (${body.length} bytes, ${totalRows} rows, ${Date.now() - started}ms)`);

    // Prune old backups: keep last 8 (roughly 2 months). List, sort,
    // delete the oldest. Don't fail the whole backup if this hiccups.
    try {
      const list = await bucket.list({ prefix: "backups/" });
      const keys = (list.objects || [])
        .map((o: any) => o.key as string)
        .filter((k: string) => k.endsWith(".json"))
        .sort();
      const toDelete = keys.slice(0, Math.max(0, keys.length - 8));
      for (const k of toDelete) {
        await bucket.delete(k);
        console.log(`[backup] pruned ${k}`);
      }
    } catch (e) {
      console.log(`[backup] prune failed: ${e}`);
    }

    // Log to automation_log so it surfaces in the cockpit.
    await env.DB.prepare(
      "INSERT INTO automation_log (action, detail, created_at) VALUES ('weekly_backup', ?, ?)"
    ).bind(`Snapshotted ${totalRows} rows to R2 at ${key}`, Math.floor(Date.now() / 1000)).run().catch(() => {});
  } catch (e) {
    console.log(`[backup] R2 put failed: ${e}`);
    await env.DB.prepare(
      "INSERT INTO admin_alerts (client_slug, type, title, detail, created_at) VALUES ('_system', 'backup_failure', 'Weekly D1 backup failed', ?, ?)"
    ).bind(String(e).slice(0, 500), Math.floor(Date.now() / 1000)).run().catch(() => {});
  }
}
