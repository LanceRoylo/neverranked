/**
 * Dashboard -- Admin views for the signal-collection tables
 *
 * Routes:
 *   GET /admin/nps      -> NPS scores with rolling 90-day calculation
 *   GET /admin/exit     -> exit-survey responses + outcome breakdown
 *
 * Both tables are populated by the cancellation interstitial and
 * the in-product NPS prompt. Without this UI Lance had no way to
 * see the signal without writing SQL by hand.
 */

import type { Env, User } from "../types";
import { layout, html, esc } from "../render";

interface NpsRow {
  id: number; user_email: string; score: number | null;
  follow_up: string | null; dismissed: number;
  client_slug: string | null; created_at: number;
}

interface ExitRow {
  id: number; user_email: string; reason: string;
  details: string | null; outcome: string;
  client_slug: string | null; created_at: number;
}

function rel(now: number, ts: number): string {
  const diff = now - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// /admin/nps
// ---------------------------------------------------------------------------

export async function handleAdminNpsGet(user: User | null, env: Env): Promise<Response> {
  if (!user || user.role !== "admin") return new Response("Forbidden", { status: 403 });

  const now = Math.floor(Date.now() / 1000);
  const ninetyDaysAgo = now - 90 * 86400;

  const all = (await env.DB.prepare(
    "SELECT * FROM nps_responses WHERE created_at > ? ORDER BY created_at DESC LIMIT 200"
  ).bind(ninetyDaysAgo).all<NpsRow>()).results;

  // NPS calc on actual scores in the window (exclude dismisses).
  const scored = all.filter((r) => r.score !== null && !r.dismissed);
  const promoters = scored.filter((r) => (r.score as number) >= 9).length;
  const detractors = scored.filter((r) => (r.score as number) <= 6).length;
  const passive = scored.length - promoters - detractors;
  const nps = scored.length > 0 ? Math.round(((promoters - detractors) / scored.length) * 100) : null;

  const dismissCount = all.filter((r) => r.dismissed).length;
  const responseRate = (all.length - dismissCount) > 0
    ? Math.round(((all.length - dismissCount) / all.length) * 100)
    : null;

  const stat = (label: string, value: string | number, color = "var(--text)") => `
    <div class="card" style="text-align:center;padding:18px">
      <div class="label" style="margin-bottom:6px">${esc(label)}</div>
      <div style="font-size:28px;font-weight:600;color:${color}">${value}</div>
    </div>
  `;

  const rows = all.length === 0
    ? `<tr class="empty-row"><td colspan="5" style="padding:24px;text-align:center;color:var(--text-faint)">No NPS responses yet.</td></tr>`
    : all.map((r) => {
        if (r.dismissed) {
          return `<tr style="opacity:.5">
            <td class="muted" style="white-space:nowrap;font-size:12px">${rel(now, r.created_at)}</td>
            <td>${esc(r.user_email)}</td>
            <td colspan="2" class="muted">Dismissed</td>
            <td class="muted">${r.client_slug ? esc(r.client_slug) : ""}</td>
          </tr>`;
        }
        const score = r.score as number;
        const cat = score >= 9 ? "Promoter" : score >= 7 ? "Passive" : "Detractor";
        const catColor = score >= 9 ? "var(--green)" : score >= 7 ? "var(--text-faint)" : "var(--red)";
        return `<tr>
          <td class="muted" style="white-space:nowrap;font-size:12px">${rel(now, r.created_at)}</td>
          <td>${esc(r.user_email)}</td>
          <td><strong style="color:${catColor}">${score}</strong> <span class="muted" style="font-size:11px">${cat}</span></td>
          <td>${r.follow_up ? `<span style="font-size:12px">${esc(r.follow_up)}</span>` : `<span class="muted" style="font-size:11px">no comment</span>`}</td>
          <td class="muted">${r.client_slug ? esc(r.client_slug) : ""}</td>
        </tr>`;
      }).join("");

  const body = `
    <div class="section-header">
      <h1>NPS <em>signal</em></h1>
      <p class="section-sub">Rolling 90-day window. NPS = % promoters minus % detractors. Detractors get an admin alert the moment they score so you can reach out.</p>
    </div>

    <div class="stats" style="grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px">
      ${stat("NPS", nps !== null ? nps : "—", nps !== null && nps >= 30 ? "var(--green)" : nps !== null && nps < 0 ? "var(--red)" : "var(--gold)")}
      ${stat("Promoters", promoters, "var(--green)")}
      ${stat("Passive", passive, "var(--text-faint)")}
      ${stat("Detractors", detractors, "var(--red)")}
      ${stat("Response rate", responseRate !== null ? responseRate + "%" : "—")}
    </div>

    <div class="card">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Score</th>
              <th>Reason</th>
              <th>Client</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;

  return html(layout("NPS", body, user));
}

// ---------------------------------------------------------------------------
// /admin/exit
// ---------------------------------------------------------------------------

const EXIT_REASON_LABELS: Record<string, string> = {
  too_expensive: "Too expensive",
  not_seeing_value: "Not seeing value",
  missing_feature: "Missing feature",
  too_complicated: "Too complicated",
  no_longer_need: "No longer need",
  other: "Other",
  paused: "(Paused instead)",
  wants_to_talk: "(Wanted to talk)",
  update_payment: "(Just updating card)",
};

const EXIT_OUTCOME_LABELS: Record<string, string> = {
  paused_instead: "Paused",
  requested_call: "Requested call",
  abandoned: "Update card / abandoned",
  proceeded_to_cancel: "Proceeded to cancel",
};

export async function handleAdminExitGet(user: User | null, env: Env): Promise<Response> {
  if (!user || user.role !== "admin") return new Response("Forbidden", { status: 403 });

  const now = Math.floor(Date.now() / 1000);
  const ninetyDaysAgo = now - 90 * 86400;

  const all = (await env.DB.prepare(
    "SELECT * FROM exit_surveys WHERE created_at > ? ORDER BY created_at DESC LIMIT 200"
  ).bind(ninetyDaysAgo).all<ExitRow>()).results;

  // Outcome breakdown.
  const outcomeCounts = new Map<string, number>();
  for (const r of all) {
    outcomeCounts.set(r.outcome, (outcomeCounts.get(r.outcome) || 0) + 1);
  }
  const reasonCounts = new Map<string, number>();
  for (const r of all) {
    if (r.outcome === "proceeded_to_cancel") {
      reasonCounts.set(r.reason, (reasonCounts.get(r.reason) || 0) + 1);
    }
  }

  const outcomeStats = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">
      ${["paused_instead","requested_call","abandoned","proceeded_to_cancel"].map((o) => `
        <div class="card" style="padding:18px;text-align:center">
          <div class="label" style="margin-bottom:6px">${esc(EXIT_OUTCOME_LABELS[o] || o)}</div>
          <div style="font-size:28px;font-weight:600;color:${o === "proceeded_to_cancel" ? "var(--red)" : o === "paused_instead" ? "var(--gold)" : "var(--text)"}">${outcomeCounts.get(o) || 0}</div>
        </div>
      `).join("")}
    </div>
  `;

  const reasonsBlock = reasonCounts.size === 0
    ? `<p class="muted" style="font-size:13px">No "proceeded to cancel" survey responses in the window.</p>`
    : `
      <div style="display:flex;flex-direction:column;gap:6px">
        ${Array.from(reasonCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([reason, count]) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg-edge);border-radius:4px">
              <span>${esc(EXIT_REASON_LABELS[reason] || reason)}</span>
              <strong style="font-family:var(--mono);color:var(--gold)">${count}</strong>
            </div>
          `).join("")}
      </div>
    `;

  const rows = all.length === 0
    ? `<tr class="empty-row"><td colspan="5" style="padding:24px;text-align:center;color:var(--text-faint)">No exit-survey responses yet.</td></tr>`
    : all.map((r) => `
        <tr>
          <td class="muted" style="white-space:nowrap;font-size:12px">${rel(now, r.created_at)}</td>
          <td>${esc(r.user_email)}</td>
          <td>${esc(EXIT_OUTCOME_LABELS[r.outcome] || r.outcome)}</td>
          <td>${esc(EXIT_REASON_LABELS[r.reason] || r.reason)}</td>
          <td>${r.details ? `<span style="font-size:12px">${esc(r.details)}</span>` : `<span class="muted" style="font-size:11px">—</span>`}</td>
        </tr>
      `).join("");

  const body = `
    <div class="section-header">
      <h1>Exit <em>signal</em></h1>
      <p class="section-sub">90-day window. Captured at /settings/cancel. Outcome shows what the user actually did; reason shows the survey answer (only when they proceeded to cancel).</p>
    </div>

    ${outcomeStats}

    <div class="card" style="margin-bottom:24px">
      <h3 style="margin-top:0">Top cancellation reasons</h3>
      ${reasonsBlock}
    </div>

    <div class="card">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Outcome</th>
              <th>Reason</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;

  return html(layout("Exit signal", body, user));
}
