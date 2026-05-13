/**
 * Step-driven walkthrough progress.
 *
 * For actions in the registry with progress_shape='step_driven'
 * (Bing for Business, Apple Business Connect, etc.), we track which
 * steps the client has completed. Each "I'm done with this step,
 * continue" click marks the step complete and advances the current
 * step pointer.
 */

import type { Env } from "../types";
import { ACTION_REGISTRY, type ActionType } from "./registry";

export interface ActionProgress {
  client_slug: string;
  action_type: ActionType;
  status: "not_started" | "in_progress" | "submitted" | "complete" | "skipped";
  current_step_id: string | null;
  completed_steps: string[];
  submitted_at: number | null;
  completed_at: number | null;
  skipped_at: number | null;
  last_activity_at: number;
}

export async function getProgress(
  env: Env,
  clientSlug: string,
  actionType: ActionType,
): Promise<ActionProgress | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM client_action_progress
      WHERE client_slug = ? AND action_type = ?`,
  ).bind(clientSlug, actionType).first<{
    status: string;
    current_step_id: string | null;
    completed_steps_json: string;
    submitted_at: number | null;
    completed_at: number | null;
    skipped_at: number | null;
    last_activity_at: number;
  }>();
  if (!row) return null;
  let completed: string[] = [];
  try { completed = JSON.parse(row.completed_steps_json) as string[]; } catch { /* skip */ }
  return {
    client_slug: clientSlug,
    action_type: actionType,
    status: row.status as ActionProgress["status"],
    current_step_id: row.current_step_id,
    completed_steps: completed,
    submitted_at: row.submitted_at,
    completed_at: row.completed_at,
    skipped_at: row.skipped_at,
    last_activity_at: row.last_activity_at,
  };
}

/**
 * Mark a step complete and advance to the next step. Idempotent
 * (re-marking the same step doesn't error). If this was the last
 * step, the action moves to 'submitted' (for actions with external
 * verification like Bing's postcard) and submitted_at is set.
 */
export async function markStepComplete(
  env: Env,
  clientSlug: string,
  actionType: ActionType,
  stepId: string,
): Promise<void> {
  const def = ACTION_REGISTRY[actionType];
  if (!def) throw new Error(`unknown action type: ${actionType}`);
  const now = Math.floor(Date.now() / 1000);

  let current = await getProgress(env, clientSlug, actionType);
  if (!current) {
    // First step of a brand-new action -> create the row.
    await env.DB.prepare(
      `INSERT INTO client_action_progress
         (client_slug, action_type, status, current_step_id,
          completed_steps_json, last_activity_at, created_at)
       VALUES (?, ?, 'in_progress', ?, '[]', ?, ?)`,
    ).bind(clientSlug, actionType, stepId, now, now).run();
    current = await getProgress(env, clientSlug, actionType);
    if (!current) return;
  }

  // Mark step complete (idempotent).
  const completedSet = new Set(current.completed_steps);
  completedSet.add(stepId);
  const completedList = [...completedSet];

  // Find the next step in the definition order.
  const stepIds = def.steps.map((s) => s.id);
  const idx = stepIds.indexOf(stepId);
  const nextStepId = idx >= 0 && idx + 1 < stepIds.length ? stepIds[idx + 1] : null;

  // If all required steps complete -> submitted.
  const requiredStepIds = def.steps.filter((s) => !s.optional).map((s) => s.id);
  const allRequiredDone = requiredStepIds.every((id) => completedSet.has(id));
  const newStatus = allRequiredDone ? "submitted" : "in_progress";
  const submitted_at = allRequiredDone && !current.submitted_at ? now : current.submitted_at;

  await env.DB.prepare(
    `UPDATE client_action_progress
        SET status = ?, current_step_id = ?,
            completed_steps_json = ?,
            submitted_at = ?, last_activity_at = ?
      WHERE client_slug = ? AND action_type = ?`,
  ).bind(
    newStatus,
    nextStepId,
    JSON.stringify(completedList),
    submitted_at,
    now,
    clientSlug,
    actionType,
  ).run();
}

export async function markActionComplete(
  env: Env,
  clientSlug: string,
  actionType: ActionType,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE client_action_progress
        SET status = 'complete', completed_at = ?, last_activity_at = ?
      WHERE client_slug = ? AND action_type = ?`,
  ).bind(now, now, clientSlug, actionType).run();
}

export async function skipAction(
  env: Env,
  clientSlug: string,
  actionType: ActionType,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  // Upsert: if no row exists, create one as skipped.
  const existing = await env.DB.prepare(
    `SELECT id FROM client_action_progress
      WHERE client_slug = ? AND action_type = ?`,
  ).bind(clientSlug, actionType).first<{ id: number }>();
  if (existing) {
    await env.DB.prepare(
      `UPDATE client_action_progress
          SET status = 'skipped', skipped_at = ?, last_activity_at = ?
        WHERE client_slug = ? AND action_type = ?`,
    ).bind(now, now, clientSlug, actionType).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO client_action_progress
         (client_slug, action_type, status, skipped_at, last_activity_at, created_at)
       VALUES (?, ?, 'skipped', ?, ?, ?)`,
    ).bind(clientSlug, actionType, now, now, now).run();
  }
}
