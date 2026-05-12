/**
 * Dashboard -- /admin/qa
 *
 * The QA audit log. Shows recent audit verdicts across all six
 * categories (three shipped in Session 1, three more in Session 2).
 * Filterable by category and verdict. Click a row to see full
 * reasoning + the artifact it audited.
 *
 * This page is the operational view of Phase 1.5. The /admin/health
 * page references the verdict counts; this page is where Lance goes
 * when he sees red counts climbing and wants to know what failed.
 */

import type { Env, User } from "../types";
import { html, layout, esc } from "../render";
import { recentVerdictCounts } from "../lib/qa-auditor";

interface AuditRow {
  id: number;
  category: string;
  artifact_type: string;
  artifact_id: number | null;
  artifact_ref: string | null;
  verdict: string;
  grader_model: string;
  grader_score: number | null;
  reasoning: string;
  blocked: number;
  created_at: number;
}

function timeAgo(unixSeconds: number): string {
  const ageSec = Math.floor(Date.now() / 1000) - unixSeconds;
  if (ageSec < 60) return `${ageSec}s ago`;
  if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m ago`;
  if (ageSec < 86400) return `${Math.floor(ageSec / 3600)}h ago`;
  return `${Math.floor(ageSec / 86400)}d ago`;
}

function verdictDot(verdict: string): string {
  const color = verdict === "green" ? "#5ec76a" : verdict === "yellow" ? "#e8c767" : "#e07158";
  return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};box-shadow:0 0 0 3px ${color}22;vertical-align:middle"></span>`;
}

function artifactLink(row: AuditRow): string {
  if (row.artifact_type === "schema_injection" && row.artifact_id) {
    return `<a href="/admin/inject" style="color:var(--gold);text-decoration:none">injection #${row.artifact_id}</a>`;
  }
  if (row.artifact_type === "content_draft" && row.artifact_id) {
    return `<a href="/admin/drafts" style="color:var(--gold);text-decoration:none">draft #${row.artifact_id}</a>`;
  }
  if (row.artifact_type === "system" && row.artifact_ref) {
    return `<span style="color:var(--text-faint)">${esc(row.artifact_ref)}</span>`;
  }
  if (row.artifact_type === "email" && row.artifact_ref) {
    return `<span style="color:var(--text-faint)">${esc(row.artifact_ref)}</span>`;
  }
  if (row.artifact_id) {
    return `<span style="color:var(--text-faint)">${esc(row.artifact_type)} #${row.artifact_id}</span>`;
  }
  return `<span style="color:var(--text-faint)">${esc(row.artifact_type)}</span>`;
}

export async function handleAdminQa(user: User, env: Env, url: URL): Promise<Response> {
  const categoryFilter = url.searchParams.get("category");
  const verdictFilter = url.searchParams.get("verdict");
  const triggered = url.searchParams.get("triggered");
  const triggeredVerdict = url.searchParams.get("triggered_verdict");
  const justCompleted = triggered === "cross_system";

  // Build query with optional filters
  const conditions: string[] = [];
  const bindings: (string | number)[] = [];
  if (categoryFilter) {
    conditions.push("category = ?");
    bindings.push(categoryFilter);
  }
  if (verdictFilter) {
    conditions.push("verdict = ?");
    bindings.push(verdictFilter);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = (await env.DB.prepare(
    `SELECT id, category, artifact_type, artifact_id, artifact_ref, verdict, grader_model, grader_score, reasoning, blocked, created_at
     FROM qa_audits
     ${where}
     ORDER BY created_at DESC
     LIMIT 100`
  ).bind(...bindings).all<AuditRow>()).results;

  const counts24h = await recentVerdictCounts(env, 24);
  const counts7d = await recentVerdictCounts(env, 168);

  // Per-category counts in last 24h
  const categoryCounts = (await env.DB.prepare(
    `SELECT category, verdict, COUNT(*) as n
     FROM qa_audits
     WHERE created_at > ?
     GROUP BY category, verdict`
  ).bind(Math.floor(Date.now() / 1000) - 86400).all<{ category: string; verdict: string; n: number }>()).results;

  const categoryMap: Record<string, { green: number; yellow: number; red: number }> = {};
  for (const r of categoryCounts) {
    if (!categoryMap[r.category]) categoryMap[r.category] = { green: 0, yellow: 0, red: 0 };
    (categoryMap[r.category] as Record<string, number>)[r.verdict] = r.n;
  }

  const ALL_CATEGORIES = [
    { key: "schema_integrity", label: "Schema integrity", status: "shipped" },
    { key: "email_preflight", label: "Email preflight", status: "shipped" },
    { key: "cross_system", label: "Cross-system consistency", status: "shipped" },
    { key: "content_voice", label: "Content brand voice", status: "shipped" },
    { key: "citation_sanity", label: "Citation sanity (LLM-graded)", status: "shipped" },
    { key: "nvi_drift", label: "NVI score drift (LLM-graded)", status: "shipped" },
  ];

  const categoryRows = ALL_CATEGORIES.map(cat => {
    const c = categoryMap[cat.key] ?? { green: 0, yellow: 0, red: 0 };
    const total = c.green + c.yellow + c.red;
    return `
      <tr>
        <td style="padding:8px 10px"><a href="/admin/qa?category=${esc(cat.key)}" style="color:var(--text);text-decoration:none"><b>${esc(cat.label)}</b></a></td>
        <td style="padding:8px 10px;text-align:right;color:#5ec76a;font-weight:${c.green > 0 ? "600" : "400"}">${c.green || "-"}</td>
        <td style="padding:8px 10px;text-align:right;color:#e8c767;font-weight:${c.yellow > 0 ? "600" : "400"}">${c.yellow || "-"}</td>
        <td style="padding:8px 10px;text-align:right;color:#e07158;font-weight:${c.red > 0 ? "600" : "400"}">${c.red || "-"}</td>
        <td style="padding:8px 10px;text-align:right;color:var(--text-faint)">${total || "-"}</td>
        <td style="padding:8px 10px;text-align:right;font-size:11px;color:var(--text-faint)">${esc(cat.status)}</td>
      </tr>`;
  }).join("");

  const auditRows = rows.length === 0
    ? `<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--text-faint)">No audits in this view yet.${categoryFilter || verdictFilter ? ` <a href="/admin/qa" style="color:var(--gold)">Clear filters</a>` : ` Audits will populate as schemas are approved, emails are sent, and the daily cross-system cron fires.`}</td></tr>`
    : rows.map(r => `
      <tr style="cursor:pointer" onclick="window.location='/admin/qa/${r.id}'">
        <td style="padding:8px 10px;white-space:nowrap">${verdictDot(r.verdict)} <span style="font-size:11px;color:var(--text-faint);margin-left:6px">${timeAgo(r.created_at)}</span></td>
        <td style="padding:8px 10px;font-size:12px"><b>${esc(r.category)}</b></td>
        <td style="padding:8px 10px;font-size:12px">${artifactLink(r)}</td>
        <td style="padding:8px 10px;font-size:12px;color:var(--text-faint);font-family:var(--mono);font-size:11px">${esc(r.grader_model)}${r.grader_score !== null ? ` (${r.grader_score})` : ""}</td>
        <td style="padding:8px 10px;font-size:12px;color:var(--text-mute);max-width:500px"><a href="/admin/qa/${r.id}" style="color:var(--text-mute);text-decoration:none">${esc(r.reasoning.slice(0, 140))}${r.reasoning.length > 140 ? "..." : ""}</a></td>
        <td style="padding:8px 10px;font-size:11px">${r.blocked ? `<span style="color:#e07158;font-weight:500">BLOCKED</span>` : ""}</td>
      </tr>`).join("");

  const filterChip = (categoryFilter || verdictFilter)
    ? `<div style="margin-top:10px;font-size:12px;color:var(--text-faint)">Filtered by ${[categoryFilter && `category=${categoryFilter}`, verdictFilter && `verdict=${verdictFilter}`].filter(Boolean).join(", ")}. <a href="/admin/qa" style="color:var(--gold)">Clear</a></div>`
    : "";

  const body = `
    <div class="section-header">
      <h1>QA Audits</h1>
      <div class="section-sub">Independent grader. Catches what operational monitoring can't.</div>
    </div>

    ${justCompleted ? `
    <div id="qa-just-ran-banner" class="card" style="border:2px solid ${triggeredVerdict === "green" ? "#5ec76a" : triggeredVerdict === "yellow" ? "#e8c767" : "#e07158"};background:${triggeredVerdict === "green" ? "rgba(94,199,106,0.06)" : triggeredVerdict === "yellow" ? "rgba(232,199,103,0.06)" : "rgba(224,113,88,0.06)"}">
      <div style="display:flex;align-items:center;gap:12px">
        ${verdictDot(triggeredVerdict || "green")}
        <div style="flex:1">
          <div style="font-size:14px;color:var(--text);font-weight:500">Cross-system audit just completed: <b style="color:${triggeredVerdict === "green" ? "#5ec76a" : triggeredVerdict === "yellow" ? "#e8c767" : "#e07158"}">${esc(triggeredVerdict || "green")}</b></div>
          <div style="font-size:12px;color:var(--text-faint);margin-top:4px">Scroll down to "Recent audits" to see the new rows. Banner auto-dismisses in 8 seconds.</div>
        </div>
      </div>
    </div>
    <script>setTimeout(function(){var b=document.getElementById("qa-just-ran-banner");if(b)b.style.display="none";}, 8000);</script>
    ` : ""}

    <div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:14px">
      <div>
        <div style="font-size:13px;color:var(--text)">Manually trigger the cross-system audit</div>
        <div style="font-size:11px;color:var(--text-faint);margin-top:4px">Validates homepage + state-of-aeo claims against production data. Runs daily on cron; this is the on-demand override. <b style="color:var(--text)">Usually completes in 5 to 15 seconds, occasionally up to 30 seconds if an external page is slow.</b></div>
      </div>
      <form method="POST" action="/admin/qa/run-cross-system" style="margin:0" id="qa-run-form">
        <button type="submit" id="qa-run-btn" class="btn-sm" style="background:var(--gold);color:var(--bg);border:1px solid var(--gold);min-width:160px" onclick="var b=this;b.textContent='Running... 2-5s';b.style.background='var(--line)';b.style.color='var(--text-faint)';b.style.borderColor='var(--line)';b.style.cursor='not-allowed';b.form.submit();b.disabled=true;">Run now</button>
      </form>
    </div>

    <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:14px">
      <div class="card">
        <div class="label">Last 24 hours</div>
        <div style="display:flex;gap:24px;margin-top:14px;align-items:baseline">
          <div><div style="font-size:24px;color:#5ec76a;font-weight:600">${counts24h.green}</div><div style="font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.08em">green</div></div>
          <div><div style="font-size:24px;color:#e8c767;font-weight:600">${counts24h.yellow}</div><div style="font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.08em">yellow</div></div>
          <div><div style="font-size:24px;color:#e07158;font-weight:600">${counts24h.red}</div><div style="font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.08em">red</div></div>
        </div>
      </div>
      <div class="card">
        <div class="label">Last 7 days</div>
        <div style="display:flex;gap:24px;margin-top:14px;align-items:baseline">
          <div><div style="font-size:24px;color:#5ec76a;font-weight:600">${counts7d.green}</div><div style="font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.08em">green</div></div>
          <div><div style="font-size:24px;color:#e8c767;font-weight:600">${counts7d.yellow}</div><div style="font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.08em">yellow</div></div>
          <div><div style="font-size:24px;color:#e07158;font-weight:600">${counts7d.red}</div><div style="font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.08em">red</div></div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="label">By category (last 24h)</div>
      <table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:13px">
        <thead>
          <tr style="border-bottom:1px solid var(--line);color:var(--text-faint);font-size:11px;text-transform:uppercase;letter-spacing:.08em">
            <th style="padding:6px 10px;text-align:left">Category</th>
            <th style="padding:6px 10px;text-align:right">Green</th>
            <th style="padding:6px 10px;text-align:right">Yellow</th>
            <th style="padding:6px 10px;text-align:right">Red</th>
            <th style="padding:6px 10px;text-align:right">Total</th>
            <th style="padding:6px 10px;text-align:right">Status</th>
          </tr>
        </thead>
        <tbody>${categoryRows}</tbody>
      </table>
    </div>

    <div class="card">
      <div class="label">Recent audits${categoryFilter || verdictFilter ? " (filtered)" : ""}</div>
      ${filterChip}
      <table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:12px">
        <thead>
          <tr style="border-bottom:1px solid var(--line);color:var(--text-faint);font-size:10px;text-transform:uppercase;letter-spacing:.08em">
            <th style="padding:6px 10px;text-align:left">Verdict / time</th>
            <th style="padding:6px 10px;text-align:left">Category</th>
            <th style="padding:6px 10px;text-align:left">Artifact</th>
            <th style="padding:6px 10px;text-align:left">Grader</th>
            <th style="padding:6px 10px;text-align:left">Reasoning</th>
            <th style="padding:6px 10px;text-align:left"></th>
          </tr>
        </thead>
        <tbody>${auditRows}</tbody>
      </table>
    </div>

    <div style="margin-top:20px;color:var(--text-faint);font-size:11px;text-align:center">
      Phase 1.5 Session 1. Three rules-based audits shipped: schema integrity (blocking), email preflight (blocking), cross-system consistency (descriptive, daily cron). LLM-graded audits (content voice, citation sanity, NVI drift) ship in Session 2.
    </div>
  `;

  return html(layout("QA Audits", body, user));
}
