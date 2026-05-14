/**
 * Admin nudges for stale client action state.
 *
 * Runs in the Monday cron. For each surface we shipped on /actions/<slug>,
 * checks for "the client hasn't done anything in N days" and surfaces
 * an admin_inbox item so Lance can manually nudge if it's worth it.
 *
 * Not a notification to the client. That happens via the weekly digest
 * 'Things to do' section automatically. This is the operator's view:
 * "which clients are stalled, and how stalled."
 *
 * Idempotent on (kind, target_id, target_slug) over a 14-day window so
 * the cron doesn't re-insert the same nudge every Monday.
 */

import type { Env } from "../types";

const STALE_FAQ_DAYS = 7;
const SUBMITTED_WALKTHROUGH_DAYS = 14;
const NUDGE_DEDUP_DAYS = 14;

interface NudgeRow {
  client_slug: string;
  count: number;
  oldest_at: number;
}

export async function surfaceStaleActionNudges(env: Env): Promise<{
  faq_nudges: number;
  walkthrough_nudges: number;
}> {
  const faqNudges = await surfaceStaleFAQNudges(env);
  const walkthroughNudges = await surfaceStaleWalkthroughNudges(env);
  return { faq_nudges: faqNudges, walkthrough_nudges: walkthroughNudges };
}

async function surfaceStaleFAQNudges(env: Env): Promise<number> {
  const cutoff = Math.floor(Date.now() / 1000) - STALE_FAQ_DAYS * 86400;
  const rows = (
    await env.DB.prepare(
      `SELECT client_slug, COUNT(*) AS count, MIN(created_at) AS oldest_at
         FROM client_faqs
        WHERE status = 'proposed'
          AND superseded_at IS NULL
          AND created_at < ?
        GROUP BY client_slug`,
    ).bind(cutoff).all<NudgeRow>()
  ).results;

  let inserted = 0;
  for (const r of rows) {
    const ageDays = Math.floor((Date.now() / 1000 - r.oldest_at) / 86400);
    const inserted_now = await maybeInsertNudge(env, {
      kind: "faq_proposals_stale",
      title: `${r.client_slug} has ${r.count} FAQ proposal${r.count === 1 ? "" : "s"} unreviewed for ${ageDays} days`,
      body: `Oldest proposal is ${ageDays} days old. The Monday digest surfaces these to the client automatically, but they haven't acted. Consider a personal nudge or a check on whether the business_description needs sharpening.`,
      action_url: `/actions/${r.client_slug}/faq_review`,
      target_slug: r.client_slug,
      target_id: 0,
    });
    if (inserted_now) inserted++;
  }
  return inserted;
}

async function surfaceStaleWalkthroughNudges(env: Env): Promise<number> {
  // Walkthroughs that are 'submitted' (postcard or verification
  // pending) for too long. Either the client forgot to mark complete
  // after verification arrived, or the verification never arrived
  // and the client needs help retrying.
  const cutoff = Math.floor(Date.now() / 1000) - SUBMITTED_WALKTHROUGH_DAYS * 86400;
  const rows = (
    await env.DB.prepare(
      `SELECT client_slug, action_type, submitted_at
         FROM client_action_progress
        WHERE status = 'submitted'
          AND submitted_at IS NOT NULL
          AND submitted_at < ?`,
    ).bind(cutoff).all<{ client_slug: string; action_type: string; submitted_at: number }>()
  ).results;

  let inserted = 0;
  for (const r of rows) {
    const ageDays = Math.floor((Date.now() / 1000 - r.submitted_at) / 86400);
    const insertedNow = await maybeInsertNudge(env, {
      kind: "walkthrough_verification_stale",
      title: `${r.client_slug} submitted ${r.action_type} ${ageDays} days ago, still awaiting verification`,
      body: `Walkthrough was marked submitted on day ${ageDays}. If verification arrived (e.g., postcard), the client may have forgotten to mark complete. If verification never arrived, they may need help retrying. Consider a personal check-in.`,
      action_url: `/actions/${r.client_slug}/${r.action_type}`,
      target_slug: r.client_slug,
      target_id: 0,
    });
    if (insertedNow) inserted++;
  }
  return inserted;
}

async function maybeInsertNudge(
  env: Env,
  input: { kind: string; title: string; body: string; action_url: string; target_slug: string; target_id: number },
): Promise<boolean> {
  // Dedup: don't re-insert the same kind+slug nudge within the dedup
  // window. The Monday cron re-runs every week so without this we'd
  // pile up duplicate inbox items.
  const dedupCutoff = Math.floor(Date.now() / 1000) - NUDGE_DEDUP_DAYS * 86400;
  const existing = await env.DB.prepare(
    `SELECT id FROM admin_inbox
      WHERE kind = ?
        AND target_slug = ?
        AND created_at > ?
      LIMIT 1`,
  ).bind(input.kind, input.target_slug, dedupCutoff).first<{ id: number }>();
  if (existing) return false;

  try {
    await env.DB.prepare(
      `INSERT INTO admin_inbox
         (kind, title, body, action_url, target_type, target_id, target_slug, urgency, status, created_at)
       VALUES (?, ?, ?, ?, 'client', ?, ?, 'normal', 'pending', unixepoch())`,
    )
      .bind(input.kind, input.title, input.body, input.action_url, input.target_id, input.target_slug)
      .run();
    return true;
  } catch (e) {
    console.error("admin nudge insert failed:", e);
    return false;
  }
}
