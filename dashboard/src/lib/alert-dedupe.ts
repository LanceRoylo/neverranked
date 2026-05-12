/**
 * Admin alert de-duplication. Phase 4 automation.
 *
 * Multiple monitoring layers can fire alerts for the same root cause:
 *   - anomaly detection sees an empty-rate spike
 *   - engine health check sees a persistently-broken engine
 *   - QA cross-system catches the resulting Citation Tape drift
 *
 * Without dedupe, Lance ends up reading three alerts for one issue.
 * This cleanup keeps the OLDEST unread alert per (engine, 24h window)
 * and marks the rest as read with a reference back to the canonical
 * alert. The information isn't lost (still queryable in the table),
 * just collapsed in the inbox.
 *
 * Runs daily after the anomaly + engine-health crons. Idempotent.
 */

import type { Env } from "../types";

const SECONDS_PER_DAY = 86400;

const ENGINE_ALERT_TYPES = new Set([
  "anomaly_engine_empty_spike",
  "anomaly_engine_row_drop",
  "engine_degraded",
  "engine_recovered",
]);

interface AlertRow {
  id: number;
  type: string;
  title: string;
  detail: string;
  created_at: number;
}

/**
 * Extract the engine name from an alert's detail text. The convention
 * across all engine-typed alerts is to embed "engine:<name>" in the
 * detail (e.g. "engine:anthropic empty rate 94%"). If we can't find a
 * name, return null and let the alert through un-deduped.
 */
function extractEngine(detail: string): string | null {
  const m = detail.match(/\bengine:([a-z_]+)\b/i);
  return m ? m[1].toLowerCase() : null;
}

export interface AlertDedupeResult {
  scanned: number;
  acked: number;
  groups: number;
  detail: string[];
}

export async function dedupeRelatedAlerts(env: Env): Promise<AlertDedupeResult> {
  const now = Math.floor(Date.now() / 1000);
  const since = now - SECONDS_PER_DAY;

  // Pull all unread engine-typed alerts from the last 24h, oldest first.
  const placeholders = Array.from(ENGINE_ALERT_TYPES).map(() => "?").join(",");
  const rows = (await env.DB.prepare(
    `SELECT id, type, title, detail, created_at FROM admin_alerts
     WHERE read_at IS NULL
       AND created_at > ?
       AND type IN (${placeholders})
     ORDER BY created_at ASC`
  ).bind(since, ...Array.from(ENGINE_ALERT_TYPES)).all<AlertRow>()).results;

  // Group by extracted engine name. First alert per engine is the
  // canonical; the rest get auto-acked with a reference.
  const groups = new Map<string, AlertRow[]>();
  for (const r of rows) {
    const engine = extractEngine(r.detail);
    if (!engine) continue;
    if (!groups.has(engine)) groups.set(engine, []);
    groups.get(engine)!.push(r);
  }

  const detailLog: string[] = [];
  let acked = 0;

  for (const [engine, alerts] of groups) {
    if (alerts.length < 2) {
      detailLog.push(`${engine}: 1 alert, nothing to dedupe`);
      continue;
    }
    const canonical = alerts[0];
    const duplicates = alerts.slice(1);
    for (const dup of duplicates) {
      // Mark the dup as read with a reference to the canonical alert.
      // We update the detail to include the reference so a future Lance
      // reading this row knows it was auto-acked.
      try {
        await env.DB.prepare(
          "UPDATE admin_alerts SET read_at = ?, detail = ? WHERE id = ?"
        ).bind(
          now,
          `[auto-acked: see alert #${canonical.id} for the canonical issue on ${engine}] ${dup.detail}`.slice(0, 1500),
          dup.id,
        ).run();
        acked++;
      } catch (e) {
        console.log(`[alert-dedupe] failed to ack alert ${dup.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    detailLog.push(`${engine}: kept #${canonical.id}, acked ${duplicates.length} dup(s) [${duplicates.map(d => `#${d.id}`).join(", ")}]`);
  }

  return {
    scanned: rows.length,
    acked,
    groups: groups.size,
    detail: detailLog,
  };
}
