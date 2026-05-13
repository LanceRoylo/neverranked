/**
 * Dashboard -- /admin/decisions
 *
 * Read-only view of the unified Lance decision log. Shows every
 * approve/reject/edit/dismiss/override recorded across the admin
 * surface. Foundation training-data view for the eventual Lance-agent.
 *
 * Phase 2.5 ships this as a flat log with filters. Phase 3+ will add
 * pattern analytics (e.g. "you override yellow content_voice verdicts
 * 80% of the time when the note mentions X").
 */

import type { Env, User } from "../types";
import { html, layout, esc } from "../render";
import { recentDecisions } from "../lib/decision-log";

function timeAgo(unixSeconds: number): string {
  const ageSec = Math.floor(Date.now() / 1000) - unixSeconds;
  if (ageSec < 60) return `${ageSec}s ago`;
  if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m ago`;
  if (ageSec < 86400) return `${Math.floor(ageSec / 3600)}h ago`;
  return `${Math.floor(ageSec / 86400)}d ago`;
}

function kindPill(kind: string): string {
  // Color-code decisions: green for approving/agreeing, yellow for
  // dismissing/editing, red for rejecting/overriding to red.
  const positive = new Set(["approve", "agree", "complete", "run_now", "force"]);
  const cautionary = new Set(["edit", "mark_read", "dismiss", "defer", "archive"]);
  const negative = new Set(["reject", "disagree", "override"]);
  let bg = "rgba(255,255,255,0.08)";
  let fg = "var(--text)";
  if (positive.has(kind)) { bg = "rgba(94,199,106,0.18)"; fg = "#5ec76a"; }
  else if (cautionary.has(kind)) { bg = "rgba(232,199,103,0.18)"; fg = "#e8c767"; }
  else if (negative.has(kind)) { bg = "rgba(224,113,88,0.18)"; fg = "#e07158"; }
  return `<span style="display:inline-block;padding:2px 10px;border-radius:999px;background:${bg};color:${fg};font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase">${esc(kind)}</span>`;
}

function artifactLink(row: { artifact_type: string; artifact_id: number }): string {
  // Best-effort deep-link to the artifact's admin page
  if (row.artifact_type === "qa_audit") {
    return `<a href="/admin/qa/${row.artifact_id}" style="color:var(--gold);text-decoration:none;font-family:var(--mono);font-size:12px">qa_audit #${row.artifact_id}</a>`;
  }
  if (row.artifact_type === "schema_injection") {
    return `<a href="/admin/inject" style="color:var(--gold);text-decoration:none;font-family:var(--mono);font-size:12px">schema_injection #${row.artifact_id}</a>`;
  }
  if (row.artifact_type === "admin_alert") {
    return `<a href="/admin/alerts" style="color:var(--gold);text-decoration:none;font-family:var(--mono);font-size:12px">alert #${row.artifact_id}</a>`;
  }
  return `<span style="color:var(--text-faint);font-family:var(--mono);font-size:12px">${esc(row.artifact_type)} #${row.artifact_id}</span>`;
}

export async function handleAdminDecisions(user: User, env: Env, url: URL): Promise<Response> {
  const artifactFilter = url.searchParams.get("artifact_type");
  const kindFilter = url.searchParams.get("kind");

  // Headline counts: total + last 24h + last 7d
  const now = Math.floor(Date.now() / 1000);
  const dayAgo = now - 86400;
  const weekAgo = now - 7 * 86400;

  const totalRow = await env.DB.prepare("SELECT COUNT(*) as n FROM lance_decisions").first<{ n: number }>();
  const day24Row = await env.DB.prepare("SELECT COUNT(*) as n FROM lance_decisions WHERE created_at > ?").bind(dayAgo).first<{ n: number }>();
  const week7Row = await env.DB.prepare("SELECT COUNT(*) as n FROM lance_decisions WHERE created_at > ?").bind(weekAgo).first<{ n: number }>();
  const total = totalRow?.n ?? 0;
  const day24 = day24Row?.n ?? 0;
  const week7 = week7Row?.n ?? 0;

  // Per-artifact-type counts
  const byTypeRows = (await env.DB.prepare(
    "SELECT artifact_type, COUNT(*) as n FROM lance_decisions GROUP BY artifact_type ORDER BY n DESC"
  ).all<{ artifact_type: string; n: number }>()).results;

  // Per-decision-kind counts
  const byKindRows = (await env.DB.prepare(
    "SELECT decision_kind, COUNT(*) as n FROM lance_decisions GROUP BY decision_kind ORDER BY n DESC"
  ).all<{ decision_kind: string; n: number }>()).results;

  const decisions = await recentDecisions(env, {
    artifactType: artifactFilter ?? undefined,
    limit: 100,
  });

  // Optionally filter further by kind in-memory (cheap, since limit=100)
  const filteredDecisions = kindFilter
    ? decisions.filter(d => d.decision_kind === kindFilter)
    : decisions;

  const filterChip = (artifactFilter || kindFilter)
    ? `<div style="margin-top:10px;font-size:12px;color:var(--text-faint)">Filtered by ${[artifactFilter && `artifact=${artifactFilter}`, kindFilter && `kind=${kindFilter}`].filter(Boolean).join(", ")}. <a href="/admin/decisions" style="color:var(--gold)">Clear</a></div>`
    : "";

  const rows = filteredDecisions.length === 0
    ? `<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--text-faint)">No decisions recorded yet${artifactFilter || kindFilter ? " in this view" : ""}. As you click approve / agree / disagree / override across the admin, rows land here.</td></tr>`
    : filteredDecisions.map(d => {
        let metadataPreview = "";
        if (d.metadata) {
          try {
            const parsed = JSON.parse(d.metadata);
            const keys = Object.keys(parsed).slice(0, 3);
            metadataPreview = keys.map(k => `${k}=${typeof parsed[k] === "object" ? JSON.stringify(parsed[k]).slice(0, 30) : String(parsed[k]).slice(0, 30)}`).join(", ");
          } catch { metadataPreview = ""; }
        }
        const stateNote = d.prior_state || d.new_state
          ? `<div style="font-size:11px;color:var(--text-faint);margin-top:2px">${d.prior_state ? `from <b style="color:var(--text-mute)">${esc(d.prior_state)}</b>` : ""}${d.prior_state && d.new_state ? " &rarr; " : ""}${d.new_state ? `<b style="color:var(--text-mute)">${esc(d.new_state)}</b>` : ""}</div>`
          : "";
        return `
          <tr>
            <td style="padding:10px;vertical-align:top;white-space:nowrap">${kindPill(d.decision_kind)}<div style="font-size:11px;color:var(--text-faint);margin-top:4px">${timeAgo(d.created_at)}</div></td>
            <td style="padding:10px;vertical-align:top">${artifactLink(d)}${stateNote}</td>
            <td style="padding:10px;vertical-align:top;font-size:12px;color:var(--text-mute);max-width:400px">${d.note ? esc(d.note) : "<span style=\"color:var(--text-faint)\">no note</span>"}</td>
            <td style="padding:10px;vertical-align:top;font-family:var(--mono);font-size:10px;color:var(--text-faint);max-width:240px;word-break:break-all">${esc(metadataPreview)}</td>
          </tr>`;
      }).join("");

  const typeRows = byTypeRows.map(r => `
    <tr>
      <td style="padding:6px 10px;font-family:var(--mono);font-size:12px"><a href="/admin/decisions?artifact_type=${esc(r.artifact_type)}" style="color:var(--text);text-decoration:none">${esc(r.artifact_type)}</a></td>
      <td style="padding:6px 10px;text-align:right;font-family:var(--mono);font-size:12px;color:var(--gold)">${r.n}</td>
    </tr>`).join("");

  const kindRows = byKindRows.map(r => `
    <tr>
      <td style="padding:6px 10px;font-family:var(--mono);font-size:12px"><a href="/admin/decisions?kind=${esc(r.decision_kind)}" style="color:var(--text);text-decoration:none">${esc(r.decision_kind)}</a></td>
      <td style="padding:6px 10px;text-align:right;font-family:var(--mono);font-size:12px;color:var(--gold)">${r.n}</td>
    </tr>`).join("");

  const body = `
    <div class="section-header">
      <h1>Decision Log</h1>
      <div class="section-sub">Every approve / reject / edit / dismiss / override you make across the admin. Foundation training data for the Lance-agent.</div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:14px;margin-bottom:14px">
      <div class="card">
        <div class="label">Total decisions</div>
        <div style="font-size:32px;color:var(--text);font-weight:500;margin-top:6px">${total}</div>
      </div>
      <div class="card">
        <div class="label">Last 24 hours</div>
        <div style="font-size:32px;color:var(--gold);font-weight:500;margin-top:6px">${day24}</div>
      </div>
      <div class="card">
        <div class="label">Last 7 days</div>
        <div style="font-size:32px;color:var(--text);font-weight:500;margin-top:6px">${week7}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
      <div class="card">
        <div class="label">By artifact type</div>
        <table style="width:100%;border-collapse:collapse;margin-top:10px">
          <tbody>${byTypeRows.length === 0 ? '<tr><td style="padding:10px;color:var(--text-faint);text-align:center" colspan="2">no decisions yet</td></tr>' : typeRows}</tbody>
        </table>
      </div>
      <div class="card">
        <div class="label">By decision kind</div>
        <table style="width:100%;border-collapse:collapse;margin-top:10px">
          <tbody>${byKindRows.length === 0 ? '<tr><td style="padding:10px;color:var(--text-faint);text-align:center" colspan="2">no decisions yet</td></tr>' : kindRows}</tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="label">Recent decisions${artifactFilter || kindFilter ? " (filtered)" : ""}</div>
      ${filterChip}
      <table style="width:100%;border-collapse:collapse;margin-top:10px">
        <thead>
          <tr style="border-bottom:1px solid var(--line);color:var(--text-faint);font-size:10px;text-transform:uppercase;letter-spacing:.08em">
            <th style="padding:6px 10px;text-align:left">Decision / time</th>
            <th style="padding:6px 10px;text-align:left">Artifact / state change</th>
            <th style="padding:6px 10px;text-align:left">Note</th>
            <th style="padding:6px 10px;text-align:left">Metadata</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div style="margin-top:20px;color:var(--text-faint);font-size:11px;text-align:center">
      Phase 2.5 shipped. Decisions captured across schema approvals, alert dismissals, QA grader overrides. Phase 3 adds bulk-approval UI on top.
    </div>
  `;

  return html(layout("Decision Log", body, user));
}
