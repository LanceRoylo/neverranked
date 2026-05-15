/**
 * NeverRanked ops content review queue.
 *
 * Admin-only page showing every draft the QA pipeline flagged as
 * "held" -- meaning the Claude brand-safety scan hit something risky.
 * Ops reviews each, decides to clear, edit, or reject, and only then
 * does the draft surface to the customer.
 *
 * Routes:
 *   GET  /admin/content-review         -- the queue
 *   POST /admin/content-review/:id/clear -- override: mark QA pass so
 *     the customer can see + approve normally. Admins take responsibility.
 */

import type { Env, User, ContentDraft } from "../types";
import { layout, html, esc, redirect } from "../render";

interface HeldRow {
  id: number;
  client_slug: string;
  title: string;
  kind: string;
  voice_score: number | null;
  qa_result_json: string;
  created_at: number;
  updated_at: number;
}

export async function handleContentReviewList(user: User, env: Env): Promise<Response> {
  if (user.role !== "admin") {
    return html(layout("Forbidden", `<div class="empty"><h3>Admins only</h3></div>`, user), 403);
  }

  const rows = (await env.DB.prepare(
    `SELECT id, client_slug, title, kind, voice_score, qa_result_json, created_at, updated_at
       FROM content_drafts
       WHERE qa_level = 'held'
       ORDER BY updated_at DESC LIMIT 60`,
  ).all<HeldRow>()).results;

  const cards = rows.map(r => {
    let flags: { category: string; excerpt: string; reason: string }[] = [];
    try {
      const parsed = JSON.parse(r.qa_result_json);
      flags = Array.isArray(parsed.brandSafetyFlags) ? parsed.brandSafetyFlags : [];
    } catch { /* ignore */ }
    const flagList = flags.slice(0, 3).map(f => `
      <div style="padding:8px 12px;background:rgba(232,84,84,.06);border-left:2px solid var(--red);border-radius:0 3px 3px 0;margin-bottom:8px">
        <div style="font-family:var(--mono);font-size:11px;color:var(--red);margin-bottom:4px">${esc(f.category)}</div>
        <div style="font-size:12px;color:var(--text-soft);line-height:1.5;margin-bottom:4px">${esc(f.reason)}</div>
        <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint);line-height:1.4">"${esc(f.excerpt)}"</div>
      </div>
    `).join("");
    const extraFlagCount = flags.length > 3 ? `<div style="font-family:var(--mono);font-size:11px;color:var(--text-faint);margin-top:4px">+ ${flags.length - 3} more flag${flags.length - 3 === 1 ? "" : "s"}</div>` : "";
    return `
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px">
          <div>
            <div class="label" style="margin-bottom:4px">${esc(r.client_slug)} &middot; ${esc(r.kind)}</div>
            <div style="font-family:var(--serif);font-size:18px;color:var(--text);line-height:1.35">${esc(r.title)}</div>
          </div>
          <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint);text-align:right">
            <div>Voice ${r.voice_score !== null ? r.voice_score + "/100" : "pending"}</div>
            <div>Held ${new Date(r.updated_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
          </div>
        </div>
        ${flagList || `<div style="font-size:12px;color:var(--text-faint)">No structured flag data (QA result may be malformed).</div>`}
        ${extraFlagCount}
        <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
          <a href="/drafts/${esc(r.client_slug)}/${r.id}" class="btn btn-ghost">Open draft</a>
          <form method="POST" action="/admin/content-review/${r.id}/clear" onsubmit="return confirm('Override the QA hold? The customer will see this draft for approval. Do this only if the flagged excerpts are false positives or clearly acceptable in context.')">
            <button type="submit" class="btn">Clear hold</button>
          </form>
        </div>
      </div>
    `;
  }).join("");

  const body = `
    <div style="margin-bottom:32px">
      <div class="label" style="margin-bottom:8px"><a href="/admin" style="color:var(--text-mute)">Cockpit</a></div>
      <h1>Content <em>review</em></h1>
      <p class="section-sub" style="margin-top:8px;max-width:720px">Drafts the QA pipeline flagged for brand-safety concerns -- political, medical/financial/legal advice, inflammatory language, reputational risks. These are held from customers until a human clears them. Err on the side of caution.</p>
    </div>
    ${rows.length === 0 ? `
      <div class="empty-hero">
        <div class="empty-hero-eyebrow">Queue is clear</div>
        <h2 class="empty-hero-title">Nothing held for review right now.</h2>
        <p class="empty-hero-body">When a generated draft trips a brand-safety check, it lands here. Customers never see a held draft until ops approves it.</p>
      </div>
    ` : cards}
  `;
  return html(layout("Content review", body, user));
}

export async function handleContentReviewClear(draftId: number, user: User, env: Env): Promise<Response> {
  if (user.role !== "admin") {
    return redirect("/admin/content-review");
  }
  const draft = await env.DB.prepare(
    "SELECT id, client_slug, qa_result_json FROM content_drafts WHERE id = ?",
  ).bind(draftId).first<{ id: number; client_slug: string; qa_result_json: string | null }>();
  if (!draft) return redirect("/admin/content-review");

  // Downgrade qa_level from "held" to "warn" so the customer can see it
  // and approve, but the warning state preserves the audit trail. We
  // do NOT wipe the qa_result_json so the flags remain visible in the
  // customer-facing QA panel as a reminder of what ops saw.
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE content_drafts SET qa_level = 'warn', updated_at = ? WHERE id = ?",
  ).bind(now, draftId).run();

  // If the scheduled_drafts row was waiting on this draft, move it to
  // 'drafted' status so the cron/UI pick it up on the next sweep.
  await env.DB.prepare(
    `UPDATE scheduled_drafts SET status = 'drafted', updated_at = ? WHERE draft_id = ? AND status = 'planned'`,
  ).bind(now, draftId).run();

  const { recordLanceDecision } = await import("../lib/decision-log");
  await recordLanceDecision(env, user.id, {
    artifact_type: "content_draft",
    artifact_id: draftId,
    decision_kind: "clear",
    prior_state: "held",
    new_state: "warn",
    metadata: {
      client_slug: draft.client_slug,
      had_qa_flags: draft.qa_result_json !== null,
    },
  });

  return redirect("/admin/content-review");
}
