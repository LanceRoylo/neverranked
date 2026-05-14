/**
 * Outreach warmth — scoring + draft generation.
 *
 * Reads from the email_opens table and classifies each prospect into
 * a signal tier based on their open pattern. Generates voice-clean
 * follow-up draft emails per tier using Claude.
 *
 * The send happens outside this module (Lance copies into his local
 * outreach tool, then marks sent in /admin/warm-prospects). This
 * module is responsible for: identify, classify, draft, record.
 */

import type { Env } from "../types";

export type SignalTier =
  | "cold"          // 0-1 opens
  | "warm"          // 2-3 opens, spread over time
  | "very_warm"     // 2-3 opens in 24h, fast re-engagement
  | "hot"           // 4+ opens
  | "fading";       // 3+ opens but nothing in the last 7 days

export interface ProspectWarmth {
  prospect_id: number;
  tier: SignalTier;
  open_count: number;
  first_open_at: number;
  last_open_at: number;
  ip_diversity: number;          // distinct IP hashes; 2+ suggests forwarded
  hours_since_last: number;
  hours_between_first_two: number | null;
  score: number;                 // numeric 0-100 for sort ordering
}

/**
 * Score every prospect with >= 2 opens. Returns sorted by score desc.
 */
export async function getProspectWarmth(env: Env): Promise<ProspectWarmth[]> {
  const rows = (
    await env.DB.prepare(
      `SELECT prospect_id,
              COUNT(*) AS opens,
              MIN(opened_at) AS first_open,
              MAX(opened_at) AS last_open,
              COUNT(DISTINCT COALESCE(ip_hash, '?')) AS ip_count
         FROM email_opens
        GROUP BY prospect_id
       HAVING opens >= 2`,
    ).all<{ prospect_id: number; opens: number; first_open: number; last_open: number; ip_count: number }>()
  ).results;

  const now = Math.floor(Date.now() / 1000);
  const out: ProspectWarmth[] = [];

  for (const r of rows) {
    // For tier classification we need to know how fast the second
    // open landed after the first. One extra targeted query per
    // prospect; rows are small.
    const secondOpen = await env.DB.prepare(
      `SELECT opened_at FROM email_opens
        WHERE prospect_id = ?
        ORDER BY opened_at ASC LIMIT 1 OFFSET 1`,
    ).bind(r.prospect_id).first<{ opened_at: number }>();
    const hoursBetweenFirstTwo = secondOpen
      ? (secondOpen.opened_at - r.first_open) / 3600
      : null;
    const hoursSinceLast = (now - r.last_open) / 3600;

    const tier = classifyTier({
      opens: r.opens,
      hours_since_last: hoursSinceLast,
      hours_between_first_two: hoursBetweenFirstTwo,
    });

    // Score: weighted combo so high-engagement, recent, fast prospects
    // float to the top.
    let score = r.opens * 8;
    if (hoursSinceLast < 24) score += 20;
    else if (hoursSinceLast < 72) score += 10;
    else if (hoursSinceLast < 168) score += 5;
    if (hoursBetweenFirstTwo !== null && hoursBetweenFirstTwo < 24) score += 15;
    if (r.ip_count >= 2) score += 8;
    if (tier === "fading") score -= 15;
    score = Math.max(0, Math.min(100, score));

    out.push({
      prospect_id: r.prospect_id,
      tier,
      open_count: r.opens,
      first_open_at: r.first_open,
      last_open_at: r.last_open,
      ip_diversity: r.ip_count,
      hours_since_last: hoursSinceLast,
      hours_between_first_two: hoursBetweenFirstTwo,
      score,
    });
  }

  out.sort((a, b) => b.score - a.score);
  return out;
}

function classifyTier(input: {
  opens: number;
  hours_since_last: number;
  hours_between_first_two: number | null;
}): SignalTier {
  const { opens, hours_since_last, hours_between_first_two } = input;
  if (opens >= 3 && hours_since_last > 24 * 7) return "fading";
  if (opens >= 4) return "hot";
  if (opens >= 2 && hours_between_first_two !== null && hours_between_first_two < 24) {
    return "very_warm";
  }
  if (opens >= 2) return "warm";
  return "cold";
}

/**
 * Get the most recent follow-up action for this prospect, or null
 * if none. Used to dedup ("don't suggest the same template twice").
 */
export async function getLastFollowupAction(
  env: Env,
  prospect_id: number,
): Promise<{ id: number; template_kind: string; status: string; created_at: number } | null> {
  return await env.DB.prepare(
    `SELECT id, template_kind, status, created_at
       FROM outreach_followup_actions
      WHERE prospect_id = ?
      ORDER BY created_at DESC
      LIMIT 1`,
  ).bind(prospect_id).first<{ id: number; template_kind: string; status: string; created_at: number }>();
}

/**
 * Record a drafted follow-up. Returns the new row id.
 */
export async function recordDraftedFollowup(
  env: Env,
  input: {
    prospect_id: number;
    template_kind: string;
    tier: SignalTier;
    open_count: number;
    subject: string;
    body: string;
  },
): Promise<number> {
  const result = await env.DB.prepare(
    `INSERT INTO outreach_followup_actions
       (prospect_id, template_kind, signal_tier_at_draft, open_count_at_draft,
        subject, body, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'drafted', unixepoch())`,
  )
    .bind(
      input.prospect_id,
      input.template_kind,
      input.tier,
      input.open_count,
      input.subject,
      input.body,
    )
    .run();
  return Number(result.meta?.last_row_id || 0);
}

export async function markFollowupSent(env: Env, id: number, user_id: number | null): Promise<void> {
  await env.DB.prepare(
    `UPDATE outreach_followup_actions
        SET status = 'sent', sent_at = unixepoch(), reviewer_user_id = ?
      WHERE id = ?`,
  ).bind(user_id, id).run();
}

export async function markFollowupDeclined(
  env: Env,
  id: number,
  reason: string | null,
  user_id: number | null,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE outreach_followup_actions
        SET status = 'declined', declined_at = unixepoch(),
            declined_reason = ?, reviewer_user_id = ?
      WHERE id = ?`,
  ).bind(reason, user_id, id).run();
}
