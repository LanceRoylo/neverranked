/**
 * Dashboard -- /drafts/:clientSlug (list) and /drafts/:clientSlug/:id (editor)
 *
 * All draft content lives here. Agency owners never hand a Google Doc to a
 * client -- they open this page, see every draft queued for the client,
 * edit inline, approve, and the client copies the finished text or
 * downloads it as a file. No external handoff.
 *
 * Phase 1 scaffolds the list and detail views. Draft generation (the LLM
 * call that turns a roadmap item into a first draft) lands in phase 3.
 * For now admins can create drafts manually via a "Create draft" form to
 * exercise the editor and export pipeline.
 */

import type { Env, User, ContentDraft, ContentDraftStatus } from "../types";
import { layout, html, esc, redirect } from "../render";
import { canAccessClient } from "../agency";
import { buildGlossary } from "../glossary";
import { generateDraftInVoice, scoreDraftAgainstProfile } from "../voice-engine";
import { canUseDraftingFeature } from "../gating";

/** Upgrade nudge for non-Amplify clients landing on /drafts. */
function renderUpgradeNudge(clientSlug: string, user: User): string {
  const body = `
    <div style="margin-bottom:24px">
      <div class="label" style="margin-bottom:8px"><a href="/" style="color:var(--text-mute)">Dashboard</a> / ${esc(clientSlug)}</div>
      <h1>Drafts</h1>
    </div>
    <div class="card" style="border:1px solid var(--gold-dim);background:linear-gradient(135deg,var(--bg-lift) 0%,rgba(201,168,76,.04) 100%)">
      <div class="label" style="margin-bottom:8px;color:var(--gold)">\u00a7 Amplify tier feature</div>
      <h3 style="font-style:italic;margin-bottom:12px">In-dashboard drafting is an <em style="color:var(--gold)">Amplify</em> tier feature</h3>
      <div style="font-size:13px;color:var(--text-soft);line-height:1.75;max-width:720px;margin-bottom:18px">
        Voice profile and in-dashboard drafting belong to the Amplify retainer. We learn how you write from samples you upload, then draft articles, FAQs, and landing pages that read like you wrote them. Drafts live in the dashboard with editor, version history, voice score, and export. Nothing leaves your account.
      </div>
      <a href="https://app.neverranked.com/checkout/amplify" class="btn">Upgrade to Amplify</a>
      <a href="mailto:hello@neverranked.com?subject=Amplify%20upgrade%20question" style="margin-left:14px;font-size:12px;color:var(--gold)">Questions first? Email us &rarr;</a>
    </div>
    ${buildGlossary()}
  `;
  return layout("Drafts", body, user, clientSlug);
}

// ---------- status helpers ----------

const STATUS_LABEL: Record<ContentDraftStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  rejected: "Needs rewrite",
};
const STATUS_COLOR: Record<ContentDraftStatus, string> = {
  draft: "var(--text-faint)",
  in_review: "var(--gold)",
  approved: "var(--green, #6a9a6a)",
  rejected: "var(--red, #c96a6a)",
};
const STATUS_HINT: Record<ContentDraftStatus, string> = {
  draft: "System-generated first pass or newly created by admin. Not yet reviewed.",
  in_review: "The client is reviewing and may still edit. Waiting on approval.",
  approved: "Client approved this draft. Ready to copy or download and publish.",
  rejected: "Sent back for a rewrite. The next version will land as a new draft.",
};

// ---------- list page ----------

export async function handleDraftsList(clientSlug: string, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }
  if (!canUseDraftingFeature(user)) {
    return html(renderUpgradeNudge(clientSlug, user));
  }

  const drafts = (await env.DB.prepare(
    "SELECT * FROM content_drafts WHERE client_slug = ? ORDER BY updated_at DESC"
  ).bind(clientSlug).all<ContentDraft>()).results;

  const rows = drafts.map(d => {
    const status = (d.status as ContentDraftStatus) || "draft";
    const scoreLabel = d.voice_score === null
      ? "<span style=\"color:var(--text-faint)\">pending</span>"
      : `<span style="color:${d.voice_score >= 75 ? "var(--green,#6a9a6a)" : d.voice_score >= 60 ? "var(--gold)" : "var(--red,#c96a6a)"}">${d.voice_score}/100</span>`;
    return `
      <tr>
        <td><a href="/drafts/${esc(clientSlug)}/${d.id}" style="color:var(--text);text-decoration:none"><strong>${esc(d.title)}</strong></a></td>
        <td style="font-family:var(--mono);font-size:11px;color:var(--text-faint);text-transform:capitalize">${esc(d.kind)}</td>
        <td style="font-family:var(--mono);font-size:11px" title="${esc(STATUS_HINT[status])}"><span style="color:${STATUS_COLOR[status]}">${STATUS_LABEL[status]}</span></td>
        <td style="font-family:var(--mono);font-size:11px">${scoreLabel}</td>
        <td style="font-family:var(--mono);font-size:11px;color:var(--text-faint)">${new Date(d.updated_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
      </tr>
    `;
  }).join("");

  const body = `
    <div style="margin-bottom:32px">
      <div class="label" style="margin-bottom:8px"><a href="/" style="color:var(--text-mute)">Dashboard</a> / ${esc(clientSlug)}</div>
      <h1>Content <em>drafts</em></h1>
    </div>

    <!-- How this page works -->
    <div style="margin-bottom:28px;padding:16px 20px;background:var(--bg-lift);border-left:2px solid var(--gold-dim);border-radius:0 3px 3px 0">
      <div class="label" style="margin-bottom:8px;color:var(--gold)">\u00a7 How drafts work</div>
      <div style="font-size:12px;color:var(--text-soft);line-height:1.7;max-width:820px">
        Drafts are articles, FAQs, and landing pages the system generates for you from roadmap items and citation gaps. Each one is written to match the voice profile on your <a href="/voice/${esc(clientSlug)}" style="color:var(--gold)">Voice</a> page (a summary of how you write, learned from samples you upload) so drafts read like you, not like AI. Click any draft to edit it, score it, approve it, and copy or download the finished text. Nothing leaves the dashboard.
      </div>
    </div>

    ${drafts.length === 0 ? `
      <div style="padding:24px 28px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
        <h3 style="margin-bottom:8px;font-style:italic">No drafts yet</h3>
        <p style="color:var(--text-faint);font-size:13px;line-height:1.7;margin:0 0 14px;max-width:640px">
          Drafts appear here automatically once the drafting pipeline (Phase 3 of this feature) is live and a roadmap item triggers a generation. You can also create a draft manually from any roadmap item or citation gap.
        </p>
        ${user.role === "admin" || user.role === "agency_admin" ? `
          <form method="POST" action="/drafts/${esc(clientSlug)}/new" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <input type="text" name="title" placeholder="Draft title" required style="flex:1;min-width:260px;padding:8px 12px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:13px;border-radius:3px">
            <select name="kind" style="padding:8px 12px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:13px;border-radius:3px">
              <option value="article">Article</option>
              <option value="faq">FAQ</option>
              <option value="service_page">Service page</option>
              <option value="landing">Landing page</option>
            </select>
            <button type="submit" class="btn">Create blank draft</button>
          </form>
        ` : ""}
      </div>
    ` : `
      ${user.role === "admin" || user.role === "agency_admin" ? `
        <div class="card" style="margin-bottom:20px">
          <div class="label" style="margin-bottom:10px">Create draft manually</div>
          <form method="POST" action="/drafts/${esc(clientSlug)}/new" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <input type="text" name="title" placeholder="Draft title" required style="flex:1;min-width:260px;padding:8px 12px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:13px;border-radius:3px">
            <select name="kind" style="padding:8px 12px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:13px;border-radius:3px">
              <option value="article">Article</option>
              <option value="faq">FAQ</option>
              <option value="service_page">Service page</option>
              <option value="landing">Landing page</option>
            </select>
            <button type="submit" class="btn">Create</button>
          </form>
        </div>
      ` : ""}
      <table class="data-table" style="margin-bottom:32px">
        <thead>
          <tr>
            <th>Title</th>
            <th>Kind</th>
            <th>Status</th>
            <th title="0-100 voice match score. Higher means the draft reads closer to your uploaded writing samples.">Voice score</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `}

    ${buildGlossary()}
  `;

  return html(layout("Drafts", body, user, clientSlug));
}

// ---------- detail page (editor) ----------

export async function handleDraftDetail(clientSlug: string, draftId: number, user: User, env: Env, url?: URL): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }
  if (!canUseDraftingFeature(user)) {
    return html(renderUpgradeNudge(clientSlug, user));
  }

  const draft = await env.DB.prepare(
    "SELECT * FROM content_drafts WHERE id = ? AND client_slug = ?"
  ).bind(draftId, clientSlug).first<ContentDraft>();

  if (!draft) {
    return html(layout("Not Found", `<div class="empty"><h3>Draft not found</h3></div>`, user), 404);
  }

  const status = (draft.status as ContentDraftStatus) || "draft";
  const genError = url?.searchParams.get("gen_error") || "";
  const genOk = url?.searchParams.get("gen_ok") || "";

  // Version history (up to 10 most recent). Each row is a snapshot of
  // the body BEFORE a save, so reverting means taking that row's body
  // and making it the current body (which archives the current one).
  const versions = (await env.DB.prepare(
    `SELECT id, body_markdown, voice_score, edited_by_user_id, edited_by_system, created_at
     FROM content_draft_versions WHERE draft_id = ?
     ORDER BY created_at DESC LIMIT 10`
  ).bind(draftId).all<{ id: number; body_markdown: string; voice_score: number | null; edited_by_user_id: number | null; edited_by_system: string | null; created_at: number }>()).results;

  const body = `
    <div style="margin-bottom:24px">
      <div class="label" style="margin-bottom:8px">
        <a href="/" style="color:var(--text-mute)">Dashboard</a> /
        <a href="/drafts/${esc(clientSlug)}" style="color:var(--text-mute)">${esc(clientSlug)}</a> / Draft
      </div>
      <div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap">
        <h1 style="margin:0">${esc(draft.title)}</h1>
        <span style="font-family:var(--mono);font-size:11px;color:${STATUS_COLOR[status]}" title="${esc(STATUS_HINT[status])}">${STATUS_LABEL[status]}</span>
      </div>
    </div>

    <!-- Status banner explaining current step -->
    <div style="margin-bottom:16px;padding:14px 18px;background:var(--bg-lift);border-left:2px solid ${STATUS_COLOR[status]};border-radius:0 3px 3px 0;font-size:12px;color:var(--text-soft);line-height:1.65;max-width:820px">
      ${esc(STATUS_HINT[status])}
    </div>

    ${genError ? `
      <div style="margin-bottom:16px;padding:12px 16px;background:rgba(201,106,106,.08);border-left:2px solid var(--red,#c96a6a);border-radius:0 3px 3px 0;font-size:12px;color:var(--text-soft);line-height:1.6;max-width:820px">
        ${esc(genError)}
      </div>
    ` : ""}
    ${genOk ? `
      <div style="margin-bottom:16px;padding:12px 16px;background:rgba(106,154,106,.08);border-left:2px solid var(--green,#6a9a6a);border-radius:0 3px 3px 0;font-size:12px;color:var(--text-soft);line-height:1.6;max-width:820px">
        Draft generated in your voice. Review below and edit as needed before approving.
      </div>
    ` : ""}

    ${(user.role === "admin" || user.role === "agency_admin") ? `
      <!-- Generate in voice. Separate form from the save form so it has
           its own submit action. Brief is optional; the voice engine will
           produce a draft from the title alone if brief is empty. -->
      <form method="POST" action="/drafts/${esc(clientSlug)}/${draft.id}/generate" id="generate-form" style="margin-bottom:20px;padding:16px 20px;background:var(--bg-lift);border:1px solid var(--gold-dim);border-radius:4px">
        <div class="label" style="margin-bottom:4px;color:var(--gold)">\u00a7 Draft in your voice</div>
        <div style="font-size:12px;color:var(--text-soft);line-height:1.65;margin-bottom:12px;max-width:720px">
          Optionally give a brief (angle, thesis, key points to cover). The engine reads your voice profile and produces a full markdown draft matching your writing style. Overwrites the body below.
        </div>
        <textarea name="brief" placeholder="Brief (optional). E.g. 'Cover why the author thinks em dashes are overused in marketing, open with the stat that 58% of searches are zero-click, close with our own example.'" rows="4" style="width:100%;padding:10px 14px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:12px;line-height:1.6;border-radius:3px;resize:vertical;margin-bottom:10px"></textarea>
        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
          <button type="submit" class="btn nr-busy-trigger" data-busy-label="Drafting\u2026">Generate draft</button>
          <span class="nr-idle" style="font-size:11px;color:var(--text-faint)">Takes 10-30 seconds. Requires a voice profile to be built first.</span>
          <div class="nr-busy">
            <span class="nr-loading-bar" aria-hidden="true"></span>
            <span class="nr-busy-label">
              ${(() => {
                const phases = [
                  "Reading your voice profile",
                  "Studying your rhythm and vocabulary",
                  "Outlining the article",
                  "Drafting the opening",
                  "Writing the body in your voice",
                  "Checking for patterns you avoid",
                  "Polishing transitions",
                  "Finalizing",
                ];
                const perPhase = 2.2; // seconds each phase stays visible
                const total = phases.length * perPhase;
                return `<span class="nr-phases-wrap" style="min-width:280px">${phases.map((p, i) => `<span class="nr-phase" style="animation-duration:${total}s;animation-delay:${(i * perPhase).toFixed(2)}s">${p}</span>`).join("")}</span>`;
              })()}<span class="nr-busy-dots" aria-hidden="true"></span>
            </span>
          </div>
        </div>
      </form>
    ` : ""}

    <!-- Editor -->
    <form method="POST" action="/drafts/${esc(clientSlug)}/${draft.id}/save" id="draft-form" style="margin-bottom:24px">
      <div class="label" style="margin-bottom:10px">Draft body (Markdown)</div>
      <textarea name="body_markdown" id="draft-body" rows="28" style="width:100%;padding:16px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:13px;line-height:1.7;border-radius:3px;resize:vertical" placeholder="Start writing, or paste a generated draft here...">${esc(draft.body_markdown || "")}</textarea>
      <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;align-items:center">
        <button type="submit" class="btn">Save changes</button>
        <button type="button" class="btn btn-ghost" id="copy-btn" onclick="navigator.clipboard.writeText(document.getElementById('draft-body').value).then(()=>{this.textContent='Copied';setTimeout(()=>this.textContent='Copy to clipboard',1500)})">Copy to clipboard</button>
        <a href="/drafts/${esc(clientSlug)}/${draft.id}/download.md" class="btn btn-ghost">Download .md</a>
        <a href="/drafts/${esc(clientSlug)}/${draft.id}/download.html" class="btn btn-ghost">Download .html</a>
        <span style="font-size:11px;color:var(--text-faint);margin-left:auto">Voice score: <span style="color:${draft.voice_score !== null && draft.voice_score >= 75 ? "var(--green,#6a9a6a)" : "var(--text-faint)"}">${draft.voice_score === null ? "pending first generation" : draft.voice_score + "/100"}</span></span>
      </div>
    </form>

    <!-- Approval / status change -->
    <div class="card" style="margin-bottom:32px">
      <div class="label" style="margin-bottom:10px">Review</div>
      <div style="font-size:12px;color:var(--text-soft);line-height:1.65;margin-bottom:14px;max-width:720px">
        Once you are happy with the draft, mark it approved. Approved drafts stay available for copy and download but cannot be edited without reopening.
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <form method="POST" action="/drafts/${esc(clientSlug)}/${draft.id}/status">
          <input type="hidden" name="status" value="in_review">
          <button type="submit" class="btn btn-ghost" ${status === "in_review" ? "disabled" : ""}>Send to review</button>
        </form>
        <form method="POST" action="/drafts/${esc(clientSlug)}/${draft.id}/status">
          <input type="hidden" name="status" value="approved">
          <button type="submit" class="btn" ${status === "approved" ? "disabled" : ""}>Approve</button>
        </form>
        <form method="POST" action="/drafts/${esc(clientSlug)}/${draft.id}/status">
          <input type="hidden" name="status" value="rejected">
          <button type="submit" class="btn btn-ghost" ${status === "rejected" ? "disabled" : ""}>Send back for rewrite</button>
        </form>
        ${user.role === "admin" || user.role === "agency_admin" ? `
          <form method="POST" action="/drafts/${esc(clientSlug)}/${draft.id}/delete" onsubmit="return confirm('Delete this draft permanently? This cannot be undone.')" style="margin-left:auto">
            <button type="submit" class="btn btn-ghost" style="color:var(--red,#c96a6a)">Delete</button>
          </form>
        ` : ""}
      </div>
    </div>

    ${versions.length > 0 ? `
      <!-- Version history. Each row is a snapshot of the body BEFORE a
           save, so clicking Revert restores that snapshot and archives
           the current body as a new version. -->
      <div class="card" style="margin-bottom:32px">
        <div class="label" style="margin-bottom:6px">Version history</div>
        <div style="font-size:11px;color:var(--text-faint);margin-bottom:14px;max-width:640px;line-height:1.55">
          Every save and every generation creates a snapshot here. Revert restores an older version -- the current body gets archived too so nothing is lost.
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${versions.map(v => {
            const dateLabel = new Date(v.created_at * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
            const byLabel = v.edited_by_system
              ? v.edited_by_system
              : v.edited_by_user_id
                ? "user edit"
                : "unknown";
            const preview = v.body_markdown.replace(/\s+/g, " ").slice(0, 140);
            const scoreLabel = v.voice_score === null ? "" : `<span style="margin-right:10px;font-family:var(--mono);font-size:10px;color:${v.voice_score >= 75 ? 'var(--green,#6a9a6a)' : v.voice_score >= 60 ? 'var(--gold)' : 'var(--red,#c96a6a)'}">${v.voice_score}/100</span>`;
            return `
              <div style="padding:10px 14px;background:var(--bg-edge);border-radius:3px;display:flex;gap:14px;align-items:center;flex-wrap:wrap">
                <div style="flex:1;min-width:200px;font-size:11px;color:var(--text-faint)">
                  <span style="color:var(--text);font-family:var(--mono);font-size:11px">${dateLabel}</span>
                  &middot; <span style="font-family:var(--label);text-transform:uppercase;letter-spacing:.1em;font-size:9px">${esc(byLabel)}</span>
                  <div style="margin-top:4px;font-size:11px;color:var(--text-faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(preview)}${v.body_markdown.length > 140 ? "\u2026" : ""}</div>
                </div>
                <div style="display:flex;gap:8px;align-items:center">
                  ${scoreLabel}
                  ${(user.role === "admin" || user.role === "agency_admin") ? `
                    <form method="POST" action="/drafts/${esc(clientSlug)}/${draft.id}/revert/${v.id}" onsubmit="return confirm('Restore this older version? Your current body will be archived into the history too.')">
                      <button type="submit" class="btn btn-ghost" style="padding:4px 10px;font-size:10px">Revert</button>
                    </form>
                  ` : ""}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    ` : ""}

    ${buildGlossary()}
  `;

  return html(layout(`Draft: ${draft.title}`, body, user, clientSlug));
}

// ---------- POST handlers ----------

export async function handleDraftCreate(clientSlug: string, request: Request, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }
  if (!canUseDraftingFeature(user)) {
    return redirect(`/drafts/${encodeURIComponent(clientSlug)}`);
  }
  const form = await request.formData();
  const title = ((form.get("title") as string) || "").trim() || "Untitled draft";
  const kindRaw = ((form.get("kind") as string) || "article").trim();
  const kind = ["article", "faq", "service_page", "landing"].includes(kindRaw) ? kindRaw : "article";

  const now = Math.floor(Date.now() / 1000);
  const result = await env.DB.prepare(
    `INSERT INTO content_drafts (client_slug, kind, title, body_markdown, status, created_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, '', 'draft', ?, ?, ?)`
  ).bind(clientSlug, kind, title, user.id, now, now).run();

  const draftId = (result.meta.last_row_id as number | null) ?? 0;
  return redirect(`/drafts/${encodeURIComponent(clientSlug)}/${draftId}`);
}

/**
 * Generate (or regenerate) a draft body in the client's voice. Admin or
 * agency_admin only -- each call costs LLM tokens. Scores the output
 * against the profile in the same request so the badge lights up
 * immediately on the next page render.
 */
export async function handleDraftGenerate(clientSlug: string, draftId: number, request: Request, user: User, env: Env): Promise<Response> {
  if (user.role !== "admin" && user.role !== "agency_admin") {
    return html(layout("Forbidden", `<div class="empty"><h3>Admins only</h3></div>`, user), 403);
  }
  if (!(await canAccessClient(env, user, clientSlug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }
  if (!canUseDraftingFeature(user)) {
    return redirect(`/drafts/${encodeURIComponent(clientSlug)}`);
  }
  const draft = await env.DB.prepare(
    "SELECT id, title, body_markdown FROM content_drafts WHERE id = ? AND client_slug = ?"
  ).bind(draftId, clientSlug).first<{ id: number; title: string; body_markdown: string }>();
  if (!draft) {
    return redirect(`/drafts/${encodeURIComponent(clientSlug)}`);
  }

  const form = await request.formData();
  const brief = ((form.get("brief") as string) || "").trim();

  const slugPath = encodeURIComponent(clientSlug);

  let newBody = "";
  try {
    const out = await generateDraftInVoice(env, clientSlug, draft.title, brief || undefined);
    newBody = out.body_markdown;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Draft generation failed.";
    return redirect(`/drafts/${slugPath}/${draftId}?gen_error=${encodeURIComponent(msg)}`);
  }

  // Score the new body while we have the profile hot. If scoring fails or
  // no profile exists, we just leave voice_score null -- non-fatal.
  let score: number | null = null;
  try {
    const res = await scoreDraftAgainstProfile(env, clientSlug, newBody);
    score = res?.score ?? null;
  } catch {}

  const now = Math.floor(Date.now() / 1000);

  // Snapshot the OLD body into version history before we overwrite.
  if (draft.body_markdown && draft.body_markdown.trim().length > 0) {
    await env.DB.prepare(
      `INSERT INTO content_draft_versions (draft_id, body_markdown, voice_score, edited_by_system, created_at)
       VALUES (?, ?, NULL, 'generation', ?)`
    ).bind(draftId, draft.body_markdown, now).run();
  }

  await env.DB.prepare(
    "UPDATE content_drafts SET body_markdown = ?, voice_score = ?, updated_at = ? WHERE id = ? AND client_slug = ?"
  ).bind(newBody, score, now, draftId, clientSlug).run();

  return redirect(`/drafts/${slugPath}/${draftId}?gen_ok=1`);
}

/**
 * One-click: create a new draft with the given title (optional brief) and
 * immediately generate the body in the client's voice. Used by the
 * "Draft in your voice" buttons on roadmap items and citation-gap cards.
 */
export async function handleDraftCreateAndGenerate(clientSlug: string, request: Request, user: User, env: Env): Promise<Response> {
  if (user.role !== "admin" && user.role !== "agency_admin") {
    return html(layout("Forbidden", `<div class="empty"><h3>Admins only</h3></div>`, user), 403);
  }
  if (!(await canAccessClient(env, user, clientSlug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }
  if (!canUseDraftingFeature(user)) {
    return redirect(`/drafts/${encodeURIComponent(clientSlug)}`);
  }
  const form = await request.formData();
  const title = ((form.get("title") as string) || "").trim() || "Untitled draft";
  const brief = ((form.get("brief") as string) || "").trim();
  const kindRaw = ((form.get("kind") as string) || "article").trim();
  const kind = ["article", "faq", "service_page", "landing"].includes(kindRaw) ? kindRaw : "article";
  const roadmapItemId = form.get("roadmap_item_id") ? Number(form.get("roadmap_item_id")) : null;
  const citationKeywordId = form.get("citation_keyword_id") ? Number(form.get("citation_keyword_id")) : null;

  const slugPath = encodeURIComponent(clientSlug);
  const now = Math.floor(Date.now() / 1000);

  const insert = await env.DB.prepare(
    `INSERT INTO content_drafts (client_slug, roadmap_item_id, citation_keyword_id, kind, title, body_markdown, status, created_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '', 'draft', ?, ?, ?)`
  ).bind(clientSlug, roadmapItemId, citationKeywordId, kind, title, user.id, now, now).run();
  const draftId = (insert.meta.last_row_id as number | null) ?? 0;
  if (!draftId) {
    return redirect(`/drafts/${slugPath}`);
  }

  let body = "";
  try {
    const out = await generateDraftInVoice(env, clientSlug, title, brief || undefined);
    body = out.body_markdown;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Draft generation failed.";
    // Still land on the editor so the admin can retry; surface the error.
    return redirect(`/drafts/${slugPath}/${draftId}?gen_error=${encodeURIComponent(msg)}`);
  }

  let score: number | null = null;
  try {
    const res = await scoreDraftAgainstProfile(env, clientSlug, body);
    score = res?.score ?? null;
  } catch {}

  const updatedAt = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE content_drafts SET body_markdown = ?, voice_score = ?, updated_at = ? WHERE id = ?"
  ).bind(body, score, updatedAt, draftId).run();

  return redirect(`/drafts/${slugPath}/${draftId}?gen_ok=1`);
}

export async function handleDraftSave(clientSlug: string, draftId: number, request: Request, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }
  const form = await request.formData();
  const body = ((form.get("body_markdown") as string) || "").trim();

  const current = await env.DB.prepare(
    "SELECT body_markdown, voice_score FROM content_drafts WHERE id = ? AND client_slug = ?"
  ).bind(draftId, clientSlug).first<{ body_markdown: string; voice_score: number | null }>();
  if (!current) {
    return redirect(`/drafts/${encodeURIComponent(clientSlug)}`);
  }

  const now = Math.floor(Date.now() / 1000);

  // Rescore on save if the body actually changed. Skip if unchanged so a
  // "Save" click without edits doesn't burn an API call.
  let newScore: number | null = current.voice_score;
  if (body !== current.body_markdown && body.length >= 50) {
    try {
      const res = await scoreDraftAgainstProfile(env, clientSlug, body);
      newScore = res?.score ?? current.voice_score;
    } catch {}
  }

  await env.DB.prepare(
    "UPDATE content_drafts SET body_markdown = ?, voice_score = ?, updated_at = ? WHERE id = ? AND client_slug = ?"
  ).bind(body, newScore, now, draftId, clientSlug).run();

  // Snapshot the previous version into content_draft_versions so edits are
  // revertable. We store the OLD body, not the new one, so history reads
  // "this is what it looked like before the user's latest save".
  await env.DB.prepare(
    `INSERT INTO content_draft_versions (draft_id, body_markdown, voice_score, edited_by_user_id, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(draftId, current.body_markdown, current.voice_score, user.id, now).run();

  return redirect(`/drafts/${encodeURIComponent(clientSlug)}/${draftId}`);
}

export async function handleDraftStatus(clientSlug: string, draftId: number, request: Request, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }
  const form = await request.formData();
  const status = ((form.get("status") as string) || "draft").trim();
  if (!["draft", "in_review", "approved", "rejected"].includes(status)) {
    return redirect(`/drafts/${encodeURIComponent(clientSlug)}/${draftId}`);
  }

  const now = Math.floor(Date.now() / 1000);
  if (status === "approved") {
    await env.DB.prepare(
      "UPDATE content_drafts SET status = ?, approved_by_user_id = ?, approved_at = ?, updated_at = ? WHERE id = ? AND client_slug = ?"
    ).bind(status, user.id, now, now, draftId, clientSlug).run();
  } else {
    await env.DB.prepare(
      "UPDATE content_drafts SET status = ?, updated_at = ? WHERE id = ? AND client_slug = ?"
    ).bind(status, now, draftId, clientSlug).run();
  }

  return redirect(`/drafts/${encodeURIComponent(clientSlug)}/${draftId}`);
}

/**
 * Revert the current draft body to an older version. Archives the current
 * body into a new version row first so nothing is destroyed; the user can
 * always revert the revert.
 */
export async function handleDraftRevert(clientSlug: string, draftId: number, versionId: number, user: User, env: Env): Promise<Response> {
  if (user.role !== "admin" && user.role !== "agency_admin") {
    return html(layout("Forbidden", `<div class="empty"><h3>Admins only</h3></div>`, user), 403);
  }
  if (!(await canAccessClient(env, user, clientSlug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }

  const version = await env.DB.prepare(
    "SELECT body_markdown, voice_score FROM content_draft_versions WHERE id = ? AND draft_id = ?"
  ).bind(versionId, draftId).first<{ body_markdown: string; voice_score: number | null }>();
  if (!version) {
    return redirect(`/drafts/${encodeURIComponent(clientSlug)}/${draftId}`);
  }

  const current = await env.DB.prepare(
    "SELECT body_markdown, voice_score FROM content_drafts WHERE id = ? AND client_slug = ?"
  ).bind(draftId, clientSlug).first<{ body_markdown: string; voice_score: number | null }>();
  if (!current) {
    return redirect(`/drafts/${encodeURIComponent(clientSlug)}`);
  }

  const now = Math.floor(Date.now() / 1000);

  // Archive the current body before overwriting.
  await env.DB.prepare(
    `INSERT INTO content_draft_versions (draft_id, body_markdown, voice_score, edited_by_user_id, edited_by_system, created_at)
     VALUES (?, ?, ?, ?, 'revert-archive', ?)`
  ).bind(draftId, current.body_markdown, current.voice_score, user.id, now).run();

  await env.DB.prepare(
    "UPDATE content_drafts SET body_markdown = ?, voice_score = ?, updated_at = ? WHERE id = ? AND client_slug = ?"
  ).bind(version.body_markdown, version.voice_score, now, draftId, clientSlug).run();

  return redirect(`/drafts/${encodeURIComponent(clientSlug)}/${draftId}`);
}

export async function handleDraftDelete(clientSlug: string, draftId: number, user: User, env: Env): Promise<Response> {
  if (user.role !== "admin" && user.role !== "agency_admin") {
    return html(layout("Forbidden", `<div class="empty"><h3>Admins only</h3></div>`, user), 403);
  }
  if (!(await canAccessClient(env, user, clientSlug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }
  await env.DB.prepare(
    "DELETE FROM content_drafts WHERE id = ? AND client_slug = ?"
  ).bind(draftId, clientSlug).run();
  return redirect(`/drafts/${encodeURIComponent(clientSlug)}`);
}

// ---------- downloads ----------

export async function handleDraftDownload(clientSlug: string, draftId: number, format: "md" | "html", user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) {
    return new Response("Not found", { status: 404 });
  }
  const draft = await env.DB.prepare(
    "SELECT title, body_markdown FROM content_drafts WHERE id = ? AND client_slug = ?"
  ).bind(draftId, clientSlug).first<{ title: string; body_markdown: string }>();
  if (!draft) return new Response("Not found", { status: 404 });

  const safeTitle = draft.title.replace(/[^a-z0-9-]+/gi, "-").toLowerCase().slice(0, 80);

  if (format === "md") {
    const content = `# ${draft.title}\n\n${draft.body_markdown}\n`;
    return new Response(content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeTitle}.md"`,
      },
    });
  }

  // HTML export: wrap markdown in minimal HTML + Article schema JSON-LD so
  // it is paste-ready for a CMS. We do light Markdown -> HTML here without
  // a full parser: paragraphs, headings, and bullet lists only. Good enough
  // for most pillar articles; clients who need richer formatting can hand
  // the Markdown to their existing CMS.
  const md = draft.body_markdown;
  const lines = md.split(/\n/);
  const out: string[] = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (inList) { out.push("</ul>"); inList = false; }
      continue;
    }
    if (line.startsWith("# ")) { if (inList) { out.push("</ul>"); inList = false; } out.push(`<h1>${escHtml(line.slice(2))}</h1>`); continue; }
    if (line.startsWith("## ")) { if (inList) { out.push("</ul>"); inList = false; } out.push(`<h2>${escHtml(line.slice(3))}</h2>`); continue; }
    if (line.startsWith("### ")) { if (inList) { out.push("</ul>"); inList = false; } out.push(`<h3>${escHtml(line.slice(4))}</h3>`); continue; }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${escHtml(line.slice(2))}</li>`);
      continue;
    }
    if (inList) { out.push("</ul>"); inList = false; }
    out.push(`<p>${escHtml(line)}</p>`);
  }
  if (inList) out.push("</ul>");

  const articleJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": draft.title,
  }, null, 2);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escHtml(draft.title)}</title>
<script type="application/ld+json">
${articleJsonLd}
</script>
</head>
<body>
${out.join("\n")}
</body>
</html>
`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeTitle}.html"`,
    },
  });
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
