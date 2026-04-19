/**
 * Dashboard -- NPS prompt + recording
 *
 * Routes:
 *   POST /nps      -> record a 0-10 score (with optional follow-up)
 *   POST /nps/dismiss -> record an explicit dismiss
 *
 * The render helper (renderNpsPromptIfDue) is exported so callers
 * can drop the prompt into any dashboard surface. It returns "" when
 * the user has been around < 30d, or has already responded in the
 * last 90 days, or has explicitly dismissed in the last 90 days.
 *
 * No new email -- this is in-product only. NPS by email feels like
 * spam and the response rates are 4x lower.
 */

import type { Env, User } from "../types";
import { redirect, esc } from "../render";

const ASK_AFTER_DAYS = 30;
const REASK_AFTER_DAYS = 90;

/**
 * Returns the HTML for the NPS prompt card, or "" if we shouldn't
 * ask this user right now. Cheap (one indexed query).
 */
export async function renderNpsPromptIfDue(user: User, env: Env): Promise<string> {
  if (!user) return "";
  // Don't ask admins -- self-rating is noise.
  if (user.role === "admin") return "";
  if (!user.created_at) return "";

  const now = Math.floor(Date.now() / 1000);
  const DAY = 86400;

  // User must be at least 30 days old.
  if (now - user.created_at < ASK_AFTER_DAYS * DAY) return "";

  // Skip if we asked (or were dismissed) in the last 90 days.
  const recent = await env.DB.prepare(
    "SELECT id FROM nps_responses WHERE user_id = ? AND created_at > ? LIMIT 1"
  ).bind(user.id, now - REASK_AFTER_DAYS * DAY).first<{ id: number }>();
  if (recent) return "";

  const buttons = Array.from({ length: 11 }, (_, i) => `
    <button type="submit" name="score" value="${i}"
            style="width:36px;height:36px;border:1px solid var(--line);background:var(--bg-edge);color:var(--text);font-family:var(--mono);font-size:13px;cursor:pointer;border-radius:3px;transition:border-color .15s,background .15s"
            onmouseover="this.style.borderColor='var(--gold)';this.style.background='var(--gold-wash)'"
            onmouseout="this.style.borderColor='var(--line)';this.style.background='var(--bg-edge)'">${i}</button>
  `).join("");

  return `
    <div style="margin-bottom:24px;padding:16px 20px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap">
        <div style="flex:1;min-width:240px">
          <div class="label" style="margin-bottom:6px;color:var(--gold)">Quick question</div>
          <div style="font-size:14px;color:var(--text);line-height:1.5">
            How likely are you to recommend NeverRanked to a colleague? <span style="color:var(--text-faint);font-size:12px">(0 = not at all, 10 = extremely)</span>
          </div>
        </div>
        <form method="POST" action="/nps/dismiss" style="margin:0">
          <button type="submit" style="background:none;border:none;color:var(--text-faint);font-size:18px;cursor:pointer;padding:0 4px" title="Not now">&times;</button>
        </form>
      </div>
      <form method="POST" action="/nps" style="margin-top:12px">
        <div style="display:flex;flex-wrap:wrap;gap:6px">${buttons}</div>
      </form>
    </div>
  `;
}

export async function handleNpsPost(request: Request, user: User, env: Env): Promise<Response> {
  const form = await request.formData();
  const scoreRaw = (form.get("score") as string || "").trim();
  const followUp = (form.get("follow_up") as string || "").trim().slice(0, 2000) || null;
  const score = Number(scoreRaw);
  if (!Number.isInteger(score) || score < 0 || score > 10) {
    return redirect(request.headers.get("Referer") || "/");
  }

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO nps_responses
       (user_id, user_email, score, follow_up, dismissed, client_slug, agency_id, created_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`
  ).bind(
    user.id, user.email, score, followUp,
    user.client_slug || null, user.agency_id || null, now,
  ).run();

  // Detractor (0-6): file an admin alert so Lance can reach out.
  if (score <= 6) {
    try {
      await env.DB.prepare(
        `INSERT INTO admin_alerts (client_slug, type, title, detail, created_at)
           VALUES (?, 'nps_detractor', ?, ?, ?)`
      ).bind(
        user.client_slug || "_system",
        `NPS detractor: ${user.email} scored ${score}`,
        followUp ? `Reason: ${followUp.slice(0, 300)}` : "No reason given.",
        now,
      ).run();
    } catch {}
  }

  // Promoters (9-10) get a thanks-could-you-share message; everyone
  // else just gets a quiet "thanks" + back to where they were.
  const thanks = score >= 9
    ? "Thanks. If you're up for it, we'd love a quick word-of-mouth introduction to anyone in your network -- reply to any email and tell us who. Honest props from a real customer is the most valuable lead source we have."
    : score >= 7
    ? "Thanks for the score. We'll keep working."
    : "Thanks. Lance will reach out personally to ask what we can do better.";

  const referer = request.headers.get("Referer") || "/";
  const url = new URL(referer);
  url.searchParams.set("flash", thanks);
  return redirect(url.pathname + url.search);
}

export async function handleNpsDismiss(request: Request, user: User, env: Env): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  try {
    await env.DB.prepare(
      `INSERT INTO nps_responses
         (user_id, user_email, score, follow_up, dismissed, client_slug, agency_id, created_at)
         VALUES (?, ?, NULL, NULL, 1, ?, ?, ?)`
    ).bind(
      user.id, user.email,
      user.client_slug || null, user.agency_id || null, now,
    ).run();
  } catch {}
  return redirect(request.headers.get("Referer") || "/");
}
