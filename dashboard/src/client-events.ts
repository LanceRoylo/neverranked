/**
 * Client events log.
 *
 * Replaces the firehose of per-event client emails (citation gained,
 * citation lost, grade up, snippet detected, regression alert, etc.)
 * with one consolidated Monday digest. Each event lands here at the
 * moment it happens. The digest cron renders sections from the rows
 * accumulated since the last digest send.
 *
 * Call logClientEvent() anywhere you would previously have called a
 * sendXEmail() function. The function never sends mail; it only logs.
 */

import type { Env } from "./types";

export type ClientEventKind =
  | "citation_gained"
  | "citation_lost"
  | "grade_up"
  | "snippet_detected"
  | "first_citation"
  | "phase_complete"
  | "regression_alert"
  | "schema_deployed"
  | "faq_deployed"
  | "roadmap_complete";

export type ClientEventSeverity = "info" | "win" | "concern";

export interface ClientEventInput {
  client_slug: string;
  kind: ClientEventKind;
  severity?: ClientEventSeverity;
  title: string;
  body?: string;
  payload?: Record<string, unknown>;
  occurred_at?: number;
}

const SEVERITY_BY_KIND: Record<ClientEventKind, ClientEventSeverity> = {
  citation_gained: "win",
  citation_lost: "concern",
  grade_up: "win",
  snippet_detected: "win",
  first_citation: "win",
  phase_complete: "win",
  regression_alert: "concern",
  schema_deployed: "info",
  faq_deployed: "info",
  roadmap_complete: "info",
};

export async function logClientEvent(env: Env, input: ClientEventInput): Promise<void> {
  const severity = input.severity ?? SEVERITY_BY_KIND[input.kind] ?? "info";
  const occurred_at = input.occurred_at ?? Math.floor(Date.now() / 1000);
  try {
    await env.DB.prepare(
      `INSERT INTO client_events (client_slug, kind, severity, title, body, payload_json, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        input.client_slug,
        input.kind,
        severity,
        input.title,
        input.body ?? null,
        input.payload ? JSON.stringify(input.payload) : null,
        occurred_at,
      )
      .run();
  } catch (e) {
    console.error("logClientEvent failed:", e);
    // Never block the calling pipeline on a log failure.
  }
}

export interface PendingEventBundle {
  events: Array<{
    id: number;
    kind: ClientEventKind;
    severity: ClientEventSeverity;
    title: string;
    body: string | null;
    payload_json: string | null;
    occurred_at: number;
  }>;
  by_kind: Record<string, number>;
  win_count: number;
  concern_count: number;
}

/**
 * Pull all events for a client that have not yet been included in
 * a delivered digest. The digest renderer groups these by kind to
 * build sections.
 */
export async function getPendingEvents(env: Env, clientSlug: string): Promise<PendingEventBundle> {
  const rows = (
    await env.DB.prepare(
      `SELECT id, kind, severity, title, body, payload_json, occurred_at
         FROM client_events
        WHERE client_slug = ? AND delivered_in_digest_id IS NULL
        ORDER BY occurred_at ASC`,
    )
      .bind(clientSlug)
      .all<{
        id: number;
        kind: ClientEventKind;
        severity: ClientEventSeverity;
        title: string;
        body: string | null;
        payload_json: string | null;
        occurred_at: number;
      }>()
  ).results;

  const by_kind: Record<string, number> = {};
  let win_count = 0;
  let concern_count = 0;
  for (const r of rows) {
    by_kind[r.kind] = (by_kind[r.kind] ?? 0) + 1;
    if (r.severity === "win") win_count++;
    else if (r.severity === "concern") concern_count++;
  }
  return { events: rows, by_kind, win_count, concern_count };
}

/**
 * Pull the latest approved-but-unsent NVI report for a client, if any.
 * The digest renders a section linking to the full report, then marks
 * it as sent. Hold-back rule: if AI Presence Score dropped by more
 * than NVI_HOLD_BACK_DROP points week-over-week we DON'T include the
 * report in the auto-digest. Lance gets pinged via admin_inbox to
 * call the client first, then can manually send.
 */
const NVI_HOLD_BACK_DROP = 15;

export interface DigestableNviReport {
  id: number;
  reporting_period: string;
  ai_presence_score: number;
  prev_score: number | null;
  prompts_evaluated: number;
  citations_found: number;
  insight: string | null;
  action: string | null;
  pdf_url: string | null;
  held_back: boolean;
  drop: number | null;
}

export async function getNviReportForDigest(
  env: Env,
  clientSlug: string,
): Promise<DigestableNviReport | null> {
  const row = await env.DB.prepare(
    `SELECT id, reporting_period, ai_presence_score, prev_score,
            prompts_evaluated, citations_found, insight, action, pdf_url
       FROM nvi_reports
      WHERE client_slug = ? AND status = 'approved' AND sent_at IS NULL
      ORDER BY generated_at DESC
      LIMIT 1`,
  )
    .bind(clientSlug)
    .first<{
      id: number;
      reporting_period: string;
      ai_presence_score: number;
      prev_score: number | null;
      prompts_evaluated: number;
      citations_found: number;
      insight: string | null;
      action: string | null;
      pdf_url: string | null;
    }>();
  if (!row) return null;

  const drop = row.prev_score !== null ? row.prev_score - row.ai_presence_score : null;
  const held_back = drop !== null && drop > NVI_HOLD_BACK_DROP;

  // If held back, flag for manual review instead of auto-including.
  // Idempotent on (target_id, kind) via the LEFT JOIN check.
  if (held_back) {
    try {
      const existing = await env.DB.prepare(
        `SELECT id FROM admin_inbox
          WHERE kind = 'nvi_held_back' AND target_id = ? LIMIT 1`,
      ).bind(row.id).first<{ id: number }>();
      if (!existing) {
        await env.DB.prepare(
          `INSERT INTO admin_inbox
             (kind, title, body, action_url, target_type, target_id, target_slug, urgency, status, created_at)
           VALUES ('nvi_held_back', ?, ?, ?, 'nvi_report', ?, ?, 'high', 'pending', unixepoch())`,
        )
          .bind(
            `NVI report held back: ${clientSlug} dropped ${drop} pts`,
            `Score fell from ${row.prev_score} to ${row.ai_presence_score}. Auto-include in the weekly digest is paused. Call the client or review and send manually.`,
            `/admin/nvi/preview/${row.id}`,
            row.id,
            clientSlug,
          )
          .run();
      }
    } catch {
      // Inbox is non-critical
    }
  }

  return {
    id: row.id,
    reporting_period: row.reporting_period,
    ai_presence_score: row.ai_presence_score,
    prev_score: row.prev_score,
    prompts_evaluated: row.prompts_evaluated,
    citations_found: row.citations_found,
    insight: row.insight,
    action: row.action,
    pdf_url: row.pdf_url,
    held_back,
    drop,
  };
}

/**
 * Mark an NVI report as delivered through the digest. Called after a
 * successful digest send for each report that was included.
 */
export async function markNviReportSent(env: Env, reportId: number): Promise<void> {
  try {
    await env.DB.prepare(
      `UPDATE nvi_reports SET status = 'sent', sent_at = unixepoch() WHERE id = ?`,
    ).bind(reportId).run();
  } catch (e) {
    console.error("markNviReportSent failed:", e);
  }
}

/**
 * Mark a list of event ids as delivered. Called by the digest sender
 * after a successful send so the same events don't appear in next
 * week's digest.
 */
export async function markEventsDelivered(env: Env, eventIds: number[], digestId: number): Promise<void> {
  if (eventIds.length === 0) return;
  const placeholders = eventIds.map(() => "?").join(",");
  await env.DB.prepare(
    `UPDATE client_events
        SET delivered_in_digest_id = ?
      WHERE id IN (${placeholders})`,
  )
    .bind(digestId, ...eventIds)
    .run();
}
