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
