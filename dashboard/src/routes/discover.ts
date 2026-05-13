/**
 * Route: /discover/<slug>
 *
 * Was: a "review and accept" queue for AI-suggested prompts that
 * required human clicks before any new prompt could be tracked. The
 * suggestion-review workflow was the same anti-pattern we keep
 * removing: the system already decided, then asked permission anyway.
 *
 * Now: a transparency log for the auto-expanded prompt set. Shows
 * what's currently tracked, what got added in the last sweep, and
 * what got rejected by which gate. Read-only. No buttons.
 *
 * The auto-expansion itself runs in the Monday weekly cron via
 * runAutoExpandSweep() in prompt-auto-expand.ts.
 */

import type { Env, User } from "../types";
import { layout, html, esc } from "../render";
import { canAccessClient } from "../agency";

function fmtAge(seconds: number): string {
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function categoryBadge(cat: string | null): string {
  const colors: Record<string, string> = {
    problem: "var(--red)",
    recommendation: "var(--green)",
    comparison: "var(--yellow)",
    scenario: "var(--gold)",
  };
  const c = cat ?? "primary";
  const color = colors[c] ?? "var(--text-mute)";
  return `<span style="font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:${color};border:1px solid ${color};padding:1px 5px;border-radius:2px;margin-right:8px">${esc(c)}</span>`;
}

const GATE_LABELS: Record<string, string> = {
  format: "Format",
  tone: "Tone guard",
  similarity: "Similar to existing",
  relevance: "Off-business",
};

export async function handleDiscoverList(slug: string, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, slug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }

  const now = Math.floor(Date.now() / 1000);
  const weekAgo = now - 7 * 86400;

  const tracked = (
    await env.DB.prepare(
      `SELECT id, keyword, category, created_at FROM citation_keywords
         WHERE client_slug = ? AND active = 1
         ORDER BY created_at DESC, id DESC`,
    ).bind(slug).all<{ id: number; keyword: string; category: string | null; created_at: number }>()
  ).results;

  const recentAdds = tracked.filter((t) => t.created_at >= weekAgo);

  const rejections = (
    await env.DB.prepare(
      `SELECT prompt, failed_gate, reason, created_at FROM prompt_rejections
         WHERE client_slug = ? AND created_at >= ?
         ORDER BY created_at DESC
         LIMIT 50`,
    ).bind(slug, weekAgo).all<{ prompt: string; failed_gate: string; reason: string; created_at: number }>()
  ).results;

  const recentAddsHtml = recentAdds.length === 0
    ? `<div style="color:var(--text-faint);font-size:13px;padding:14px 0">No new prompts added in the last 7 days. The system adds up to 12 per week per client until reaching the tracked-prompt target.</div>`
    : recentAdds.map((t) => `
        <div style="padding:12px 0;border-bottom:1px solid var(--line)">
          <div style="margin-bottom:6px;display:flex;align-items:center;flex-wrap:wrap">
            ${categoryBadge(t.category)}
            <span style="color:var(--text-faint);font-size:11px;font-family:var(--mono)">added ${fmtAge(now - t.created_at)} ago</span>
          </div>
          <div style="font-size:14px;line-height:1.5;color:var(--text-soft)">${esc(t.keyword)}</div>
        </div>
      `).join("");

  const trackedHtml = tracked.length === 0
    ? `<div style="color:var(--text-faint);font-size:13px;padding:14px 0">No prompts being tracked yet. The system will auto-expand the set when business_description is populated and citation tracking starts.</div>`
    : tracked.slice(0, 50).map((t) => `
        <div style="padding:10px 0;border-bottom:1px solid var(--line);display:flex;align-items:flex-start;gap:12px">
          <div style="flex-shrink:0;padding-top:2px">${categoryBadge(t.category)}</div>
          <div style="flex:1;min-width:0;font-size:13px;line-height:1.5;color:var(--text-soft)">${esc(t.keyword)}</div>
        </div>
      `).join("") + (tracked.length > 50 ? `<div style="color:var(--text-faint);font-size:12px;padding:12px 0">${tracked.length - 50} more not shown</div>` : "");

  const rejectionsHtml = rejections.length === 0
    ? `<div style="color:var(--text-faint);font-size:13px;padding:14px 0">No prompts rejected in the last 7 days.</div>`
    : rejections.map((r) => `
        <div style="padding:10px 0;border-bottom:1px solid var(--line)">
          <div style="margin-bottom:4px">
            <span style="font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint);border:1px solid var(--line);padding:1px 5px;border-radius:2px;margin-right:8px">${esc(GATE_LABELS[r.failed_gate] || r.failed_gate)}</span>
            <span style="color:var(--text-faint);font-size:11px;font-family:var(--mono)">${fmtAge(now - r.created_at)} ago</span>
          </div>
          <div style="font-size:13px;color:var(--text-soft);line-height:1.5;margin-bottom:4px">${esc(r.prompt)}</div>
          <div style="font-size:11px;color:var(--text-faint);line-height:1.5;font-style:italic">${esc(r.reason || "")}</div>
        </div>
      `).join("");

  const cardStyle = "margin-bottom:24px;padding:20px 24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px";
  const labelStyle = "font-family:var(--label);font-size:10px;text-transform:uppercase;letter-spacing:0.15em;color:var(--gold);margin-bottom:14px";

  const body = `
    <div style="margin-bottom:24px">
      <div class="label" style="margin-bottom:8px"><a href="/citations/${esc(slug)}" style="color:var(--text-mute)">Citations</a> / Tracked prompts</div>
      <h1>Tracked <em>prompts</em></h1>
      <p style="color:var(--text-mute);max-width:680px;margin-top:8px;line-height:1.6">
        Every Monday the system generates new candidate prompts from your business context, runs them through four quality gates (format, tone, similarity to existing prompts, relevance to your business), and adds the survivors directly to your tracked set. No clicks required. This page shows what's tracked, what got added in the last week, and what got rejected and why.
      </p>
    </div>

    <div style="${cardStyle}">
      <div style="${labelStyle}">Active set · ${tracked.length} prompt${tracked.length === 1 ? "" : "s"} tracked</div>
      ${trackedHtml}
    </div>

    <div style="${cardStyle}">
      <div style="${labelStyle}">Added in the last 7 days · ${recentAdds.length}</div>
      ${recentAddsHtml}
    </div>

    <div style="${cardStyle}">
      <div style="${labelStyle}">Rejected in the last 7 days · ${rejections.length}</div>
      ${rejectionsHtml}
    </div>
  `;

  return html(layout("Tracked prompts", body, user, slug));
}
