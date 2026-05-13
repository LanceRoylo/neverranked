/**
 * Unified Lance decision log. Phase 2.5.
 *
 * Every approve/reject/edit/dismiss/override Lance makes across the
 * admin surface gets recorded here. Foundation for the Lance-agent
 * training data: each row is a labeled (artifact, state, choice) tuple.
 *
 * Usage from an admin POST handler:
 *
 *   await recordLanceDecision(env, user.id, {
 *     artifact_type: "schema_injection",
 *     artifact_id: id,
 *     decision_kind: "approve",
 *     prior_state: "pending",
 *     new_state: "approved",
 *     metadata: { force, quality_score: grade.score },
 *   });
 *
 * Wrapped in try/catch internally; a logging failure never breaks the
 * parent flow. Telemetry is best-effort, the actual decision is what
 * matters.
 */

import type { Env } from "../types";

export interface LanceDecisionInput {
  artifact_type: string;
  artifact_id: number;
  decision_kind: string;
  prior_state?: string | null;
  new_state?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function recordLanceDecision(
  env: Env,
  userId: number,
  input: LanceDecisionInput,
): Promise<void> {
  try {
    const metadataStr = input.metadata && Object.keys(input.metadata).length > 0
      ? JSON.stringify(input.metadata).slice(0, 2000)
      : null;
    await env.DB.prepare(
      `INSERT INTO lance_decisions
       (artifact_type, artifact_id, decision_kind, prior_state, new_state, note, metadata, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      input.artifact_type,
      input.artifact_id,
      input.decision_kind,
      input.prior_state ?? null,
      input.new_state ?? null,
      input.note ? input.note.slice(0, 2000) : null,
      metadataStr,
      userId,
    ).run();
  } catch (e) {
    console.log(`[decision-log] recordLanceDecision failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Read helper for the /admin/decisions page and summary widgets.
 * Returns the most-recent decisions with optional filtering.
 */
export async function recentDecisions(
  env: Env,
  options: { artifactType?: string; userId?: number; limit?: number; sinceUnix?: number } = {},
): Promise<Array<{
  id: number;
  artifact_type: string;
  artifact_id: number;
  decision_kind: string;
  prior_state: string | null;
  new_state: string | null;
  note: string | null;
  metadata: string | null;
  user_id: number;
  created_at: number;
}>> {
  const conds: string[] = [];
  const binds: (string | number)[] = [];
  if (options.artifactType) {
    conds.push("artifact_type = ?");
    binds.push(options.artifactType);
  }
  if (options.userId) {
    conds.push("user_id = ?");
    binds.push(options.userId);
  }
  if (options.sinceUnix) {
    conds.push("created_at > ?");
    binds.push(options.sinceUnix);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const limit = options.limit ?? 100;
  const rows = (await env.DB.prepare(
    `SELECT id, artifact_type, artifact_id, decision_kind, prior_state, new_state, note, metadata, user_id, created_at
     FROM lance_decisions
     ${where}
     ORDER BY created_at DESC
     LIMIT ?`
  ).bind(...binds, limit).all<{
    id: number;
    artifact_type: string;
    artifact_id: number;
    decision_kind: string;
    prior_state: string | null;
    new_state: string | null;
    note: string | null;
    metadata: string | null;
    user_id: number;
    created_at: number;
  }>()).results;
  return rows;
}
