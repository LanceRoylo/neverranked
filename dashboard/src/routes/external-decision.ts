/**
 * POST /api/admin/external-decision
 *
 * Decision-capture endpoint for tools that live outside the dashboard
 * (cold-outreach CLI, scripts, anything that observes Lance making a
 * yes/no choice and wants to land that choice in lance_decisions for
 * Benjamin training data).
 *
 * Auth: ADMIN_SECRET in the X-Admin-Secret header (same convention as
 * /api/admin/sync-prospects and friends).
 *
 * Body:
 *   {
 *     "artifact_type": "outreach_prospect" | "outreach_followup" | ...,
 *     "artifact_id": 192,
 *     "decision_kind": "approve" | "reject" | "approve_bulk" | ...,
 *     "prior_state": "generated",          // optional
 *     "new_state": "approved",             // optional
 *     "note": "...",                       // optional, capped at 2000
 *     "metadata": { ... }                  // optional, capped at 2000
 *   }
 *
 * The caller does NOT pass user_id. All external pushes are attributed
 * to Lance (user_id = 1). If the dashboard ever has multiple admins,
 * this will need to grow a caller-identity field.
 */

import type { Env } from "../types";
import { recordLanceDecision } from "../lib/decision-log";

interface ExternalDecisionPayload {
  artifact_type?: unknown;
  artifact_id?: unknown;
  decision_kind?: unknown;
  prior_state?: unknown;
  new_state?: unknown;
  note?: unknown;
  metadata?: unknown;
}

const LANCE_USER_ID = 1;

export async function handleExternalDecision(request: Request, env: Env): Promise<Response> {
  const provided = request.headers.get("x-admin-secret") || "";
  if (!env.ADMIN_SECRET || provided !== env.ADMIN_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ExternalDecisionPayload;
  try {
    body = await request.json() as ExternalDecisionPayload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.artifact_type !== "string" || !body.artifact_type) {
    return Response.json({ error: "artifact_type required" }, { status: 400 });
  }
  if (typeof body.artifact_id !== "number" || !Number.isFinite(body.artifact_id)) {
    return Response.json({ error: "artifact_id (number) required" }, { status: 400 });
  }
  if (typeof body.decision_kind !== "string" || !body.decision_kind) {
    return Response.json({ error: "decision_kind required" }, { status: 400 });
  }

  await recordLanceDecision(env, LANCE_USER_ID, {
    artifact_type: body.artifact_type,
    artifact_id: body.artifact_id,
    decision_kind: body.decision_kind,
    prior_state: typeof body.prior_state === "string" ? body.prior_state : null,
    new_state: typeof body.new_state === "string" ? body.new_state : null,
    note: typeof body.note === "string" ? body.note : null,
    metadata: (body.metadata && typeof body.metadata === "object")
      ? body.metadata as Record<string, unknown>
      : null,
  });

  return Response.json({ ok: true });
}
