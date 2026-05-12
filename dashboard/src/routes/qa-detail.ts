/**
 * Dashboard -- /admin/qa/:id
 *
 * Drill-down detail view for a single QA audit row. Shows the full
 * audit context (verdict, reasoning, grader model, blocking status)
 * plus the audited artifact's current state so Lance can see exactly
 * what was graded and decide whether the grader called it right.
 *
 * Long-term: this page becomes the "decision log" capture surface.
 * Lance reviews an audit, agrees/disagrees, the system records his
 * call. Over time the disagreements become training data for the
 * eventual Lance-agent that learns Lance's taste.
 *
 * For now (Phase 1.5 Session 1+), it shows the data. Decision-capture
 * UI ships in Phase 3.
 */

import type { Env, User } from "../types";
import { html, layout, esc } from "../render";

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

function verdictPill(verdict: string): string {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    green: { bg: "rgba(94,199,106,0.18)", fg: "#5ec76a", label: "GREEN" },
    yellow: { bg: "rgba(232,199,103,0.18)", fg: "#e8c767", label: "YELLOW" },
    red: { bg: "rgba(224,113,88,0.18)", fg: "#e07158", label: "RED" },
  };
  const v = map[verdict] ?? map.yellow;
  return `<span style="display:inline-block;padding:6px 14px;border-radius:999px;background:${v.bg};color:${v.fg};font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">${v.label}</span>`;
}

/**
 * Fetches the audited artifact row by type + id. Returns the raw row
 * data as JSON so the detail page can render it as a formatted code
 * block. Different artifact types live in different tables, so we
 * dispatch on artifact_type.
 */
async function fetchArtifact(env: Env, artifactType: string, artifactId: number | null): Promise<{ found: boolean; data: Record<string, unknown> | null; tableHint: string }> {
  if (artifactId === null) {
    return { found: false, data: null, tableHint: "no artifact_id (system-level audit)" };
  }
  try {
    if (artifactType === "schema_injection") {
      const row = await env.DB.prepare(
        "SELECT id, client_slug, schema_type, target_pages, status, json_ld, created_at, approved_at, deployed_at FROM schema_injections WHERE id = ?"
      ).bind(artifactId).first<Record<string, unknown>>();
      return { found: !!row, data: row ?? null, tableHint: "schema_injections" };
    }
    if (artifactType === "content_draft") {
      const row = await env.DB.prepare(
        "SELECT id, client_slug, title, status, kind, body_markdown, voice_score, qa_level, created_at, updated_at FROM content_drafts WHERE id = ?"
      ).bind(artifactId).first<Record<string, unknown>>();
      return { found: !!row, data: row ?? null, tableHint: "content_drafts" };
    }
    if (artifactType === "citation_run") {
      const row = await env.DB.prepare(
        "SELECT id, keyword_id, engine, response_text, cited_entities, cited_urls, client_cited, run_at, prominence FROM citation_runs WHERE id = ?"
      ).bind(artifactId).first<Record<string, unknown>>();
      return { found: !!row, data: row ?? null, tableHint: "citation_runs" };
    }
    if (artifactType === "nvi_report") {
      const row = await env.DB.prepare(
        "SELECT id, client_slug, ai_presence_score, prev_score, reporting_period, tier, status, generated_at, sent_at FROM nvi_reports WHERE id = ?"
      ).bind(artifactId).first<Record<string, unknown>>();
      return { found: !!row, data: row ?? null, tableHint: "nvi_reports" };
    }
    return { found: false, data: null, tableHint: `unknown artifact_type "${artifactType}"` };
  } catch (e) {
    return { found: false, data: null, tableHint: `fetch error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Type-aware field rendering. Different artifact field types deserve
 *  different visual treatments. We dispatch on key name (since the
 *  semantics matter -- response_text wants prose styling, cited_urls
 *  wants a link list, run_at wants a readable date). */
function renderField(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return `<span style="color:var(--text-faint);font-size:12px">empty</span>`;
  }

  // Numeric unix timestamps -- humanize
  if (typeof value === "number" && /^(created_at|updated_at|approved_at|sent_at|generated_at|run_at|deployed_at)$/.test(key)) {
    const date = new Date(value * 1000);
    const ago = Math.floor((Date.now() / 1000 - value));
    const agoText = ago < 3600 ? `${Math.floor(ago / 60)}m` : ago < 86400 ? `${Math.floor(ago / 3600)}h` : `${Math.floor(ago / 86400)}d`;
    return `<span style="font-family:var(--mono);font-size:12px;color:var(--text)">${esc(date.toISOString().replace("T", " ").slice(0, 16))} UTC</span> <span style="color:var(--text-faint);font-size:11px;margin-left:8px">${agoText} ago</span>`;
  }

  // Long-form response text -- render as a quoted prose block
  if (key === "response_text" && typeof value === "string") {
    return `
      <div style="background:rgba(255,255,255,0.03);border-left:3px solid var(--gold);padding:12px 16px;border-radius:0 6px 6px 0;font-family:var(--body);font-size:13px;line-height:1.55;color:var(--text);white-space:pre-wrap;max-height:340px;overflow-y:auto">${esc(value)}</div>`;
  }

  // JSON-LD payload -- syntax-suggestive code block
  if (key === "json_ld" && typeof value === "string") {
    let pretty = value;
    try { pretty = JSON.stringify(JSON.parse(value), null, 2); } catch { /* leave as is */ }
    return `<pre style="font-family:var(--mono);font-size:11px;color:var(--gold-bright,#e8c767);background:var(--term-bg);padding:14px 16px;border-radius:6px;overflow:auto;max-height:340px;line-height:1.5">${esc(pretty)}</pre>`;
  }

  // cited_urls -- vertical list of clickable links
  if (key === "cited_urls" && typeof value === "string") {
    try {
      const urls = JSON.parse(value);
      if (Array.isArray(urls) && urls.length > 0) {
        return `<div style="display:flex;flex-direction:column;gap:4px">${urls.map((u: string) => `<a href="${esc(u)}" target="_blank" rel="noopener" style="color:var(--gold);text-decoration:none;font-family:var(--mono);font-size:12px;word-break:break-all">${esc(u)}</a>`).join("")}</div>`;
      }
      return `<span style="color:var(--text-faint);font-size:12px">none</span>`;
    } catch { /* fall through */ }
  }

  // cited_entities -- parsed entity cards
  if (key === "cited_entities" && typeof value === "string") {
    try {
      const entities = JSON.parse(value);
      if (Array.isArray(entities) && entities.length > 0) {
        return `<div style="display:flex;flex-direction:column;gap:6px">${entities.map((e: { name?: string; url?: string; context?: string }) => `
          <div style="padding:8px 10px;background:rgba(255,255,255,0.02);border:1px solid var(--line);border-radius:4px">
            <div style="font-family:var(--body);font-size:13px;color:var(--text);font-weight:500">${esc(e.name ?? "")}</div>
            ${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener" style="font-family:var(--mono);font-size:11px;color:var(--gold);text-decoration:none;word-break:break-all">${esc(e.url)}</a>` : ""}
            ${e.context ? `<div style="font-family:var(--mono);font-size:10px;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.08em;margin-top:2px">${esc(e.context)}</div>` : ""}
          </div>`).join("")}</div>`;
      }
      return `<span style="color:var(--text-faint);font-size:12px">none</span>`;
    } catch { /* fall through */ }
  }

  // Status-style strings -- render as a pill
  if (key === "status" && typeof value === "string") {
    return `<span style="display:inline-block;padding:2px 10px;border-radius:999px;background:rgba(255,255,255,0.06);font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--text)">${esc(value)}</span>`;
  }

  // Numeric scores (voice_score, ai_presence_score, score, prominence)
  if (typeof value === "number" && /(score|prominence|rating|qa_level)$/i.test(key)) {
    const numStr = Number.isInteger(value) ? String(value) : value.toFixed(1);
    return `<span style="font-family:var(--mono);font-size:14px;color:var(--text);font-weight:500">${esc(numStr)}</span>`;
  }

  // Long strings (>200 chars but not response_text) -- collapsible code block
  if (typeof value === "string" && value.length > 200) {
    return `<pre style="font-family:var(--mono);font-size:11px;color:var(--text-mute);background:var(--term-bg);padding:10px 12px;border-radius:4px;overflow:auto;max-height:200px;white-space:pre-wrap;line-height:1.5">${esc(value)}</pre>`;
  }

  // Objects (already-parsed JSON)
  if (typeof value === "object") {
    return `<pre style="font-family:var(--mono);font-size:11px;color:var(--text-mute);background:var(--term-bg);padding:10px 12px;border-radius:4px;overflow:auto;max-height:200px;white-space:pre-wrap;line-height:1.5">${esc(JSON.stringify(value, null, 2))}</pre>`;
  }

  // Plain scalar
  return `<span style="font-family:var(--body);font-size:13px;color:var(--text)">${esc(String(value))}</span>`;
}

function renderArtifactBlock(artifactType: string, ref: { found: boolean; data: Record<string, unknown> | null; tableHint: string }): string {
  if (!ref.found || !ref.data) {
    return `
      <div class="card" style="background:rgba(255,255,255,0.02)">
        <div class="label">Audited artifact</div>
        <div style="margin-top:10px;color:var(--text-faint);font-size:13px">No artifact record found. ${esc(ref.tableHint)}</div>
      </div>`;
  }

  // Field display order: prioritize human-readable fields up top.
  const PRIORITY_KEYS = ["id", "client_slug", "engine", "title", "status", "kind",
    "keyword_id", "score", "ai_presence_score", "voice_score", "qa_level",
    "schema_type", "target_pages", "reporting_period", "tier",
    "response_text", "body_markdown", "json_ld",
    "cited_entities", "cited_urls",
    "client_cited", "prominence", "prev_score",
    "run_at", "created_at", "updated_at", "approved_at", "generated_at", "sent_at", "deployed_at"];
  const data = ref.data;
  const orderedKeys = [...PRIORITY_KEYS.filter(k => k in data), ...Object.keys(data).filter(k => !PRIORITY_KEYS.includes(k))];

  const rows = orderedKeys.map(key => {
    const displayValue = renderField(key, data[key]);
    return `
      <div style="display:grid;grid-template-columns:140px 1fr;gap:18px;padding:12px 0;border-bottom:1px solid var(--line);align-items:start">
        <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.08em;padding-top:2px">${esc(key)}</div>
        <div style="min-width:0;overflow-wrap:break-word">${displayValue}</div>
      </div>`;
  }).join("");

  return `
    <div class="card">
      <div class="label">Audited artifact &middot; ${esc(artifactType)} (${esc(ref.tableHint)})</div>
      <div style="margin-top:10px">${rows}</div>
    </div>`;
}

interface DecisionRow {
  id: number;
  audit_id: number;
  decision: string;
  new_verdict: string | null;
  note: string | null;
  user_id: number;
  created_at: number;
}

export async function handleAdminQaDetail(auditId: number, user: User, env: Env, url?: URL): Promise<Response> {
  const justSavedDecision = url?.searchParams.get("decision_saved");

  const audit = await env.DB.prepare(
    "SELECT id, category, artifact_type, artifact_id, artifact_ref, verdict, grader_model, grader_score, reasoning, blocked, created_at FROM qa_audits WHERE id = ?"
  ).bind(auditId).first<AuditRow>();

  if (!audit) {
    return new Response(html(layout("QA Audit Not Found", `
      <div class="section-header"><h1>Not found</h1></div>
      <div class="card">
        <div style="color:var(--text-mute)">No QA audit with id ${esc(String(auditId))}.</div>
        <div style="margin-top:14px"><a href="/admin/qa" style="color:var(--gold);text-decoration:none">&larr; Back to audit log</a></div>
      </div>
    `, user)), { status: 404, headers: { "Content-Type": "text/html;charset=utf-8" } });
  }

  // Fetch related rows for context (e.g. older audits on the same artifact)
  const relatedAudits = audit.artifact_id !== null
    ? (await env.DB.prepare(
        "SELECT id, verdict, reasoning, grader_model, created_at FROM qa_audits WHERE artifact_type = ? AND artifact_id = ? AND id != ? ORDER BY created_at DESC LIMIT 5"
      ).bind(audit.artifact_type, audit.artifact_id, audit.id).all<{ id: number; verdict: string; reasoning: string; grader_model: string; created_at: number }>()).results
    : [];

  const artifactBlock = await fetchArtifact(env, audit.artifact_type, audit.artifact_id);

  // Fetch Lance's prior decisions on this audit, newest first.
  const decisions = (await env.DB.prepare(
    "SELECT id, audit_id, decision, new_verdict, note, user_id, created_at FROM qa_decisions WHERE audit_id = ? ORDER BY created_at DESC"
  ).bind(audit.id).all<DecisionRow>()).results;

  const mostRecentDecision = decisions[0] ?? null;

  const body = `
    <div class="section-header" style="display:flex;align-items:center;gap:18px">
      <a href="/admin/qa" style="color:var(--gold);text-decoration:none;font-size:13px;display:inline-flex;align-items:center;gap:6px">&larr; All audits</a>
      <div>
        <h1>Audit #${audit.id}</h1>
        <div class="section-sub">${esc(audit.category)} &middot; ${timeAgo(audit.created_at)}</div>
      </div>
    </div>

    <div class="card" style="border:2px solid ${audit.verdict === "green" ? "#5ec76a" : audit.verdict === "yellow" ? "#e8c767" : "#e07158"}">
      <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
        ${verdictPill(audit.verdict)}
        <div style="flex:1;min-width:280px">
          <div style="font-size:15px;color:var(--text);font-weight:500;line-height:1.4">${esc(audit.reasoning)}</div>
          <div style="margin-top:10px;color:var(--text-faint);font-size:11px;display:flex;gap:18px;flex-wrap:wrap">
            <span>Grader: <b style="color:var(--text)">${esc(audit.grader_model)}</b>${audit.grader_score !== null ? ` (${audit.grader_score})` : ""}</span>
            <span>Category: <b style="color:var(--text)">${esc(audit.category)}</b></span>
            <span>Type: <b style="color:var(--text)">${esc(audit.artifact_type)}</b>${audit.artifact_id ? ` #${audit.artifact_id}` : ""}</span>
            ${audit.blocked ? `<span style="color:#e07158;font-weight:600">BLOCKED THE ARTIFACT FROM PROCEEDING</span>` : `<span>Did not block</span>`}
          </div>
        </div>
      </div>
    </div>

    ${renderArtifactBlock(audit.artifact_type, artifactBlock)}

    ${justSavedDecision ? `
    <div id="decision-saved-banner" class="card" style="border:2px solid #5ec76a;background:rgba(94,199,106,0.06)">
      <div style="display:flex;align-items:center;gap:12px">
        ${verdictPill("green")}
        <div style="font-size:14px;color:var(--text);font-weight:500">Decision saved: <b>${esc(justSavedDecision)}</b>. Banner auto-dismisses in 5 seconds.</div>
      </div>
    </div>
    <script>setTimeout(function(){var b=document.getElementById("decision-saved-banner");if(b)b.style.display="none";}, 5000);</script>
    ` : ""}

    <div class="card" style="border:1px dashed var(--line);background:rgba(255,255,255,0.02)">
      <div class="label">Your call</div>
      <div style="margin-top:8px;color:var(--text-mute);font-size:12px;line-height:1.5">
        Tell the system whether the grader called this right. Every click feeds the decision log -- the training-data substrate for the eventual Lance-agent.
        ${mostRecentDecision ? `<br><b style="color:var(--text)">Latest call: ${esc(mostRecentDecision.decision)}${mostRecentDecision.new_verdict ? ` &rarr; ${esc(mostRecentDecision.new_verdict)}` : ""}</b> (${timeAgo(mostRecentDecision.created_at)})` : ""}
      </div>
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
        <form method="POST" action="/admin/qa/${audit.id}/decide" style="margin:0">
          <input type="hidden" name="decision" value="agree">
          <button type="submit" title="The grader called it right. No action needed." class="btn-sm" style="background:rgba(94,199,106,0.18);color:#5ec76a;border:1px solid #5ec76a;font-size:12px;padding:8px 16px;border-radius:4px;cursor:pointer;font-weight:600">&check; Agree with grader</button>
        </form>
        <button type="button" onclick="document.getElementById('disagree-form').style.display='block';this.style.display='none'" class="btn-sm" style="background:transparent;color:#e8c767;border:1px solid #e8c767;font-size:12px;padding:8px 16px;border-radius:4px;cursor:pointer;font-weight:600">&times; Disagree...</button>
        <button type="button" onclick="document.getElementById('override-form').style.display='block';this.style.display='none'" class="btn-sm" style="background:transparent;color:#e07158;border:1px solid #e07158;font-size:12px;padding:8px 16px;border-radius:4px;cursor:pointer;font-weight:600">&#8634; Override verdict...</button>
      </div>

      <form id="disagree-form" method="POST" action="/admin/qa/${audit.id}/decide" style="display:none;margin-top:14px;padding-top:14px;border-top:1px solid var(--line)">
        <input type="hidden" name="decision" value="disagree">
        <div style="font-size:12px;color:var(--text);margin-bottom:6px">Why does the grader have it wrong?</div>
        <textarea name="note" required minlength="6" rows="3" style="width:100%;background:var(--bg);border:1px solid var(--line);color:var(--text);padding:8px 10px;font-family:var(--body);font-size:13px;border-radius:4px" placeholder="e.g. the LLM flagged it red but the response is actually fine for this query"></textarea>
        <div style="margin-top:8px;display:flex;gap:8px">
          <button type="submit" class="btn-sm" style="background:#e8c767;color:var(--bg);border:1px solid #e8c767;font-size:12px;padding:6px 14px;border-radius:4px;cursor:pointer;font-weight:600">Save disagreement</button>
          <button type="button" onclick="document.getElementById('disagree-form').reset();document.getElementById('disagree-form').style.display='none'" class="btn-sm" style="background:transparent;color:var(--text-faint);border:1px solid var(--line);font-size:12px;padding:6px 14px;border-radius:4px;cursor:pointer">Cancel</button>
        </div>
      </form>

      <form id="override-form" method="POST" action="/admin/qa/${audit.id}/decide" style="display:none;margin-top:14px;padding-top:14px;border-top:1px solid var(--line)">
        <input type="hidden" name="decision" value="override">
        <div style="font-size:12px;color:var(--text);margin-bottom:6px">Override verdict to:</div>
        <div style="display:flex;gap:6px;margin-bottom:10px">
          <label style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid var(--line);border-radius:4px;cursor:pointer;font-size:12px"><input type="radio" name="new_verdict" value="green" required> Green</label>
          <label style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid var(--line);border-radius:4px;cursor:pointer;font-size:12px"><input type="radio" name="new_verdict" value="yellow"> Yellow</label>
          <label style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid var(--line);border-radius:4px;cursor:pointer;font-size:12px"><input type="radio" name="new_verdict" value="red"> Red</label>
        </div>
        <div style="font-size:12px;color:var(--text);margin-bottom:6px">Why are you overriding?</div>
        <textarea name="note" required minlength="6" rows="3" style="width:100%;background:var(--bg);border:1px solid var(--line);color:var(--text);padding:8px 10px;font-family:var(--body);font-size:13px;border-radius:4px" placeholder="e.g. response is technically off-topic but the linked URLs are valuable"></textarea>
        <div style="margin-top:8px;display:flex;gap:8px">
          <button type="submit" class="btn-sm" style="background:#e07158;color:var(--bg);border:1px solid #e07158;font-size:12px;padding:6px 14px;border-radius:4px;cursor:pointer;font-weight:600">Save override</button>
          <button type="button" onclick="document.getElementById('override-form').reset();document.getElementById('override-form').style.display='none'" class="btn-sm" style="background:transparent;color:var(--text-faint);border:1px solid var(--line);font-size:12px;padding:6px 14px;border-radius:4px;cursor:pointer">Cancel</button>
        </div>
      </form>
    </div>

    ${decisions.length > 0 ? `
    <div class="card">
      <div class="label">Decision history (${decisions.length})</div>
      <div style="margin-top:10px">
        ${decisions.map(d => `
          <div style="padding:12px 0;border-bottom:1px solid var(--line)">
            <div style="display:flex;align-items:baseline;justify-content:space-between;gap:14px;flex-wrap:wrap">
              <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
                <span style="display:inline-block;padding:2px 10px;border-radius:999px;background:${d.decision === "agree" ? "rgba(94,199,106,0.18)" : d.decision === "disagree" ? "rgba(232,199,103,0.18)" : "rgba(224,113,88,0.18)"};color:${d.decision === "agree" ? "#5ec76a" : d.decision === "disagree" ? "#e8c767" : "#e07158"};font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase">${esc(d.decision)}</span>
                ${d.new_verdict ? `<span style="font-size:12px;color:var(--text-faint)">&rarr; verdict set to <b style="color:var(--text)">${esc(d.new_verdict)}</b></span>` : ""}
                <span style="font-size:11px;color:var(--text-faint)">${timeAgo(d.created_at)}</span>
              </div>
            </div>
            ${d.note ? `<div style="margin-top:6px;font-size:13px;color:var(--text-mute);font-style:italic;line-height:1.5">"${esc(d.note)}"</div>` : ""}
          </div>
        `).join("")}
      </div>
    </div>
    ` : ""}

    ${relatedAudits.length > 0 ? `
    <div class="card">
      <div class="label">Other audits on the same artifact</div>
      <table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:12px">
        <thead>
          <tr style="border-bottom:1px solid var(--line);color:var(--text-faint);font-size:10px;text-transform:uppercase;letter-spacing:.08em">
            <th style="padding:6px 10px;text-align:left">Verdict</th>
            <th style="padding:6px 10px;text-align:left">When</th>
            <th style="padding:6px 10px;text-align:left">Grader</th>
            <th style="padding:6px 10px;text-align:left">Reasoning</th>
          </tr>
        </thead>
        <tbody>
          ${relatedAudits.map(r => `
            <tr>
              <td style="padding:6px 10px">${verdictPill(r.verdict)}</td>
              <td style="padding:6px 10px;color:var(--text-faint)">${timeAgo(r.created_at)}</td>
              <td style="padding:6px 10px;color:var(--text-faint);font-family:var(--mono);font-size:10px">${esc(r.grader_model)}</td>
              <td style="padding:6px 10px;color:var(--text-mute)"><a href="/admin/qa/${r.id}" style="color:var(--text);text-decoration:none">${esc(r.reasoning.slice(0, 120))}${r.reasoning.length > 120 ? "..." : ""}</a></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    ` : ""}

    <div style="margin-top:20px;color:var(--text-faint);font-size:11px;text-align:center">
      Phase 2 shipped. Decision-log capture live. Bulk approval surface (one click for N audits) is Phase 3.
    </div>
  `;

  return html(layout(`Audit #${audit.id}`, body, user));
}
