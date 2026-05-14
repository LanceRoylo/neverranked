/**
 * Client action surfaces.
 *
 *   /actions/<slug>                        — index of all client actions
 *   /actions/<slug>/<action_type>          — action detail (walkthrough or FAQ review)
 *   POST /actions/<slug>/<action_type>/step/<step_id>/complete  — mark step done
 *   POST /actions/<slug>/<action_type>/skip                     — skip action
 *   POST /actions/<slug>/<action_type>/restart                  — restart walkthrough
 *   POST /actions/<slug>/faq/<faq_id>/approve                   — approve a FAQ
 *   POST /actions/<slug>/faq/<faq_id>/edit                      — edit a FAQ answer
 *   POST /actions/<slug>/faq/<faq_id>/reject                    — reject a FAQ
 *   POST /actions/<slug>/faq/<faq_id>/restore                   — restore rejected
 *   POST /actions/<slug>/faq/<faq_id>/remove                    — remove from live
 *   POST /actions/<slug>/inline/<field>                         — inline data capture
 *
 * Customer-accessible (anyone with canAccessClient). Admin override
 * via the admin view at /admin/actions/<slug>.
 */

import type { Env, User } from "../types";
import { html, layout, esc, redirect } from "../render";
import { canAccessClient } from "../agency";
import { ACTION_REGISTRY, V1_ACTIVE_ACTIONS, type ActionType, type ActionStep, type ActionDefinition } from "../client-actions/registry";
import { getProgress, markStepComplete, markActionComplete, skipAction } from "../client-actions/progress";
import { getActionMetric } from "../client-actions/metrics";
import {
  getClientFAQs,
  approveFAQ,
  editFAQAnswer,
  rejectFAQ,
  removeFAQFromLive,
  restoreRejectedFAQ,
  type RejectionCategory,
} from "../client-actions/faqs";

interface BusinessCtx {
  business_name: string | null;
  business_url: string | null;
  business_description: string | null;
  business_phone: string | null;
  business_email: string | null;
  business_address: string | null;
}

async function loadBusinessCtx(env: Env, slug: string): Promise<BusinessCtx> {
  const row = await env.DB.prepare(
    `SELECT business_name, business_url, business_description,
            business_phone, business_email, business_address
       FROM injection_configs WHERE client_slug = ?`,
  ).bind(slug).first<BusinessCtx>();
  return row || {
    business_name: null,
    business_url: null,
    business_description: null,
    business_phone: null,
    business_email: null,
    business_address: null,
  };
}

interface ParsedAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
}

function parseAddress(json: string | null): ParsedAddress {
  if (!json) return {};
  try { return JSON.parse(json) as ParsedAddress; } catch { return {}; }
}

/**
 * Resolve a value_ref against the business context. Returns null when
 * the data isn't on file -- the renderer then shows an inline capture
 * input for the missing field.
 */
function resolveValueRef(ctx: BusinessCtx, ref: string): string | null {
  const addr = parseAddress(ctx.business_address);
  switch (ref) {
    case "business_name": return ctx.business_name;
    case "business_url": return ctx.business_url;
    case "business_description": return ctx.business_description;
    case "business_phone": return ctx.business_phone;
    case "business_email": return ctx.business_email;
    case "business_address_street": return addr.street ?? null;
    case "business_address_city": return addr.city ?? null;
    case "business_address_state": return addr.state ?? null;
    case "business_address_zip": return addr.zip ?? null;
    default: return null;
  }
}

// ===========================================================================
// /actions/<slug> -- the index
// ===========================================================================

export async function handleActionsIndex(slug: string, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, slug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }

  const cards: string[] = [];
  for (const actionType of V1_ACTIVE_ACTIONS) {
    const def = ACTION_REGISTRY[actionType];
    cards.push(await renderActionCard(env, slug, def));
  }

  const body = `
    <div style="margin-bottom:32px;max-width:760px">
      <h1>Things <em>to do</em></h1>
      <p style="color:var(--text);margin-top:14px;line-height:1.7;font-size:15px">
        Heavy lifting is done. The clicks are yours.
      </p>
      <p style="color:var(--text-mute);margin-top:10px;line-height:1.65;font-size:13px">
        Each task below moves the needle on how often AI engines cite your business. We've handled the prep work. Your data is pre-filled, every step is explained, every field has a Copy button. The clicks are yours because they require your authentication or your physical verification.
      </p>
    </div>
    ${cards.join("\n")}
  `;

  return html(layout("Things to do", body, user, slug));
}

async function renderActionCard(env: Env, slug: string, def: ActionDefinition): Promise<string> {
  let badge = "";
  let status_label = "Not started";
  let status_color = "var(--text-faint)";

  if (def.progress_shape === "item_driven" && def.type === "faq_review") {
    const faqs = await getClientFAQs(env, slug);
    const proposed = faqs.filter((f) => f.status === "proposed").length;
    const approved = faqs.filter((f) => f.status === "approved").length;
    if (proposed > 0) {
      badge = `<span style="background:var(--gold);color:#1a1814;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${proposed} to review</span>`;
      status_label = `${proposed} proposed · ${approved} live`;
      status_color = "var(--gold)";
    } else if (approved > 0) {
      status_label = `${approved} live · all reviewed`;
      status_color = "#7fc99a";
    }
  } else {
    const progress = await getProgress(env, slug, def.type);
    if (progress) {
      if (progress.status === "complete") {
        status_label = "Complete";
        status_color = "#7fc99a";
      } else if (progress.status === "submitted") {
        status_label = "Submitted (awaiting verification)";
        status_color = "var(--gold)";
        badge = `<span style="background:var(--gold);color:#1a1814;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">awaiting verification</span>`;
      } else if (progress.status === "in_progress") {
        const completed = progress.completed_steps.length;
        const total = def.steps.length;
        status_label = `In progress (${completed} of ${total} steps)`;
        status_color = "var(--gold)";
        badge = `<span style="background:var(--gold);color:#1a1814;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">in progress</span>`;
      } else if (progress.status === "skipped") {
        status_label = "Skipped";
        status_color = "var(--text-faint)";
      }
    }
  }

  // Pull per-client concrete data line if we have one for this action.
  // Example for HTC's FAQ review card:
  //   "1 from a tracked AI query where you weren't cited
  //    · 4 from queries with competitor pressure
  //    · 2 from cited Reddit threads"
  // Example for Bing card:
  //   "Currently missing from 11 of 17 tracked Microsoft Copilot and
  //    ChatGPT answers (65%)"
  const metric = await getActionMetric(env, slug, def.type);
  const metricLine = metric
    ? `<p style="color:var(--gold);margin:0 0 14px;font-size:13px;line-height:1.55;font-family:var(--mono)">${esc(metric)}</p>`
    : "";

  return `
    <a href="/actions/${esc(slug)}/${esc(def.type)}"
       style="display:block;text-decoration:none;color:inherit;margin-bottom:18px;padding:24px 28px;
              background:var(--bg-lift);border:1px solid var(--line);border-radius:6px;
              transition:border-color 0.15s">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:10px">
        <h2 style="margin:0;font-size:18px;line-height:1.35;color:var(--text)">${esc(def.title)}</h2>
        ${badge}
      </div>
      <p style="color:var(--text-mute);margin:0 0 10px;font-size:14px;line-height:1.55">${esc(def.one_liner)}</p>
      ${metricLine}
      <div style="display:flex;justify-content:space-between;align-items:center;gap:14px;font-size:12px;font-family:var(--mono)">
        <span style="color:${status_color}">${status_label}</span>
        <span style="color:var(--text-faint)">${def.time_estimate_minutes} min · ${def.progress_shape === "step_driven" ? `${def.steps.length} steps` : "review and approve"}</span>
      </div>
    </a>
  `;
}

// ===========================================================================
// /actions/<slug>/<action_type> -- detail view
// ===========================================================================

export async function handleActionDetail(
  slug: string,
  actionType: string,
  user: User,
  env: Env,
): Promise<Response> {
  if (!(await canAccessClient(env, user, slug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }
  const def = ACTION_REGISTRY[actionType as ActionType];
  if (!def || !V1_ACTIVE_ACTIONS.includes(actionType as ActionType)) {
    return html(layout("Not Found", `<div class="empty"><h3>Action not found</h3></div>`, user), 404);
  }
  const ctx = await loadBusinessCtx(env, slug);

  if (def.progress_shape === "item_driven" && def.type === "faq_review") {
    return renderFAQReview(slug, user, env, def, ctx);
  }
  return renderWalkthrough(slug, user, env, def, ctx);
}

// ---------------------------------------------------------------------------
// Walkthrough viewer (step-driven actions)
// ---------------------------------------------------------------------------

async function renderWalkthrough(
  slug: string,
  user: User,
  env: Env,
  def: ActionDefinition,
  ctx: BusinessCtx,
): Promise<Response> {
  const progress = await getProgress(env, slug, def.type);
  const completedSet = new Set(progress?.completed_steps ?? []);

  const stepBlocks = def.steps.map((step, i) => renderStep(slug, def.type, step, i, def.steps.length, completedSet, ctx));

  const cardStyle = "margin-bottom:18px;padding:22px 26px;background:var(--bg-lift);border:1px solid var(--line);border-radius:6px";

  const headerNote = progress?.status === "submitted"
    ? `<div style="${cardStyle};border-color:var(--gold);background:rgba(191,160,77,0.08)">
         <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--gold);margin-bottom:8px">Submitted</div>
         <p style="margin:0;color:var(--text);line-height:1.6;font-size:14px">You marked this submitted. We'll check back in 7 days to see if your verification postcard arrived. When it does, come back here and click <strong>Mark complete</strong>.</p>
         <form method="POST" action="/actions/${esc(slug)}/${esc(def.type)}/complete" style="margin-top:14px">
           <button type="submit" class="btn">Mark complete</button>
         </form>
       </div>`
    : progress?.status === "complete"
    ? `<div style="${cardStyle};border-color:#7fc99a;background:rgba(127,201,154,0.08)">
         <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#7fc99a;margin-bottom:8px">Complete</div>
         <p style="margin:0;color:var(--text);line-height:1.6;font-size:14px">This action is complete. Nothing more to do here.</p>
       </div>`
    : "";

  const body = `
    <div style="margin-bottom:8px">
      <div class="label" style="margin-bottom:8px"><a href="/actions/${esc(slug)}" style="color:var(--text-mute)">Things to do</a> / ${esc(def.title)}</div>
      <h1>${esc(def.title)}</h1>
    </div>

    <div style="${cardStyle};margin-top:18px">
      <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--gold);margin-bottom:10px">Why this matters</div>
      <p style="margin:0 0 14px;color:var(--text);line-height:1.65;font-size:14px">${esc(def.why_this_matters)}</p>
      <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--gold);margin-bottom:10px;margin-top:18px">Heavy lifting is done. The clicks are yours.</div>
      <p style="margin:0;color:var(--text-mute);line-height:1.65;font-size:13px">${esc(def.boundary_framing)}</p>
    </div>

    ${headerNote}

    ${stepBlocks.join("\n")}

    ${COPY_BUTTON_SCRIPT}
  `;

  return html(layout(def.title, body, user, slug));
}

// Copy-to-clipboard handler shared by every walkthrough step. Briefly
// flashes "Copied" feedback on the clicked button.
const COPY_BUTTON_SCRIPT = `<script>
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('.copy-btn');
    if (!btn) return;
    e.preventDefault();
    const value = btn.getAttribute('data-copy') || '';
    if (!value) return;
    const originalText = btn.textContent;
    function flash() {
      btn.textContent = 'Copied';
      btn.style.background = 'var(--gold)';
      btn.style.color = '#1a1814';
      setTimeout(function() {
        btn.textContent = originalText;
        btn.style.background = '';
        btn.style.color = '';
      }, 1400);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(flash).catch(function() {
        // Fallback: textarea + execCommand for older browsers
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); flash(); } catch (err) {}
        document.body.removeChild(ta);
      });
    } else {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); flash(); } catch (err) {}
      document.body.removeChild(ta);
    }
  });
</script>`;

function renderStep(
  slug: string,
  actionType: ActionType,
  step: ActionStep,
  index: number,
  total: number,
  completedSet: Set<string>,
  ctx: BusinessCtx,
): string {
  const isComplete = completedSet.has(step.id);
  const borderColor = isComplete ? "#7fc99a" : "var(--line)";
  const stepNumber = index + 1;

  // External URL row
  const urlRow = step.external_url
    ? `<div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
         <a href="${esc(step.external_url)}" target="_blank" rel="noopener"
            style="display:inline-block;padding:10px 18px;background:var(--gold);color:#1a1814;
                   text-decoration:none;font-weight:600;font-size:13px;border-radius:4px;border:0">
           ${esc(step.external_url_label || step.external_url.replace(/^https?:\/\//, ""))} ↗
         </a>
         <button type="button" class="copy-btn" data-copy="${esc(step.external_url)}"
                 style="padding:9px 16px;background:transparent;color:var(--gold);
                        border:1px solid var(--gold);font-weight:600;font-size:13px;
                        border-radius:4px;cursor:pointer;font-family:inherit">
           Copy URL
         </button>
       </div>`
    : "";

  // Goal line
  const goalLine = step.goal_line
    ? `<p style="margin:0 0 14px;color:var(--text-mute);font-size:13px;line-height:1.55">${esc(step.goal_line)}</p>`
    : "";

  // Actions list (numbered bullets)
  const actionsList = step.actions.length > 0
    ? `<div style="margin-bottom:14px">
         <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--text-faint);margin-bottom:8px">What to do</div>
         <ol style="margin:0 0 0 22px;padding:0;color:var(--text);line-height:1.7;font-size:14px">
           ${step.actions.map((a) => `<li style="margin-bottom:4px">${esc(a)}</li>`).join("")}
         </ol>
       </div>`
    : "";

  // Copy fields
  let copyFieldsBlock = "";
  if (step.copy_fields && step.copy_fields.length > 0) {
    const rows = step.copy_fields.map((f) => {
      const value = resolveValueRef(ctx, f.value_ref);
      if (value === null) {
        // Missing data -> inline capture input
        return `<tr>
            <td style="padding:8px 12px;color:var(--text-faint);font-size:12px;width:30%;vertical-align:top">${esc(f.label)}</td>
            <td style="padding:8px 12px">
              <form method="POST" action="/actions/${esc(slug)}/inline/${esc(f.value_ref)}" style="display:flex;gap:8px;flex-wrap:wrap;margin:0">
                <input type="text" name="value" placeholder="Add this once and we'll remember"
                       style="flex:1;min-width:200px;background:var(--bg-edge);color:var(--text);
                              border:1px solid var(--line);padding:6px 10px;border-radius:3px;font-family:inherit;font-size:13px" />
                <button type="submit" style="padding:6px 14px;background:var(--gold);color:#1a1814;
                                              border:0;font-weight:600;font-size:12px;
                                              border-radius:3px;cursor:pointer;font-family:inherit">Save</button>
              </form>
            </td>
          </tr>`;
      }
      return `<tr>
          <td style="padding:8px 12px;color:var(--text-faint);font-size:12px;width:30%;vertical-align:top">${esc(f.label)}</td>
          <td style="padding:8px 12px;color:var(--text);font-size:13.5px;font-family:var(--mono)">${esc(value)}</td>
          <td style="padding:8px 12px;width:90px;text-align:right">
            <button type="button" class="copy-btn" data-copy="${esc(value)}"
                    style="padding:5px 12px;background:transparent;color:var(--gold);
                           border:1px solid var(--gold);font-size:11px;font-weight:600;
                           border-radius:3px;cursor:pointer;font-family:inherit">Copy</button>
          </td>
        </tr>`;
    }).join("");
    copyFieldsBlock = `<div style="margin-bottom:14px">
        <table style="width:100%;border-collapse:separate;border-spacing:0;border:1px solid var(--line);border-radius:4px;background:var(--bg-edge)">
          ${rows}
        </table>
      </div>`;
  }

  // Copy blob (long-form, e.g. description)
  let copyBlobBlock = "";
  if (step.copy_blob) {
    const value = resolveValueRef(ctx, step.copy_blob.value_ref);
    if (value !== null) {
      copyBlobBlock = `<div style="margin-bottom:14px">
          <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--text-faint);margin-bottom:8px">${esc(step.copy_blob.label)}</div>
          ${step.copy_blob.helper ? `<p style="color:var(--text-faint);font-size:12px;margin:0 0 8px">${esc(step.copy_blob.helper)}</p>` : ""}
          <div style="background:var(--bg-edge);border:1px solid var(--line);border-radius:4px;padding:14px;color:var(--text);font-size:13.5px;line-height:1.6">${esc(value)}</div>
          <div style="margin-top:8px;text-align:right">
            <button type="button" class="copy-btn" data-copy="${esc(value)}"
                    style="padding:6px 14px;background:transparent;color:var(--gold);
                           border:1px solid var(--gold);font-size:12px;font-weight:600;
                           border-radius:3px;cursor:pointer;font-family:inherit">Copy text</button>
          </div>
        </div>`;
    }
  }

  const closingNote = step.closing_note
    ? `<p style="margin:14px 0 0;color:var(--text-mute);font-size:13px;line-height:1.6">${esc(step.closing_note)}</p>`
    : "";

  // Step completion button
  const completionBtn = isComplete
    ? `<div style="margin-top:18px;color:#7fc99a;font-size:13px;font-weight:600">✓ Step complete</div>`
    : `<form method="POST" action="/actions/${esc(slug)}/${esc(actionType)}/step/${esc(step.id)}/complete" style="margin-top:18px">
         <button type="submit" style="padding:10px 22px;background:var(--gold);color:#1a1814;
                                       border:0;font-weight:600;font-size:13px;
                                       border-radius:4px;cursor:pointer;font-family:inherit">
           ${step.optional ? "Done, continue" : "Done, continue →"}
         </button>
         ${step.optional ? `<a href="#" onclick="event.preventDefault();this.closest('form').querySelector('button').click()" style="margin-left:14px;color:var(--text-faint);font-size:12px;text-decoration:underline">or skip this step</a>` : ""}
       </form>`;

  return `
    <div style="margin-bottom:18px;padding:22px 26px;background:var(--bg-lift);border:1px solid ${borderColor};border-radius:6px">
      <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--text-faint);margin-bottom:8px">Step ${stepNumber} of ${total}${step.optional ? " · optional" : ""}</div>
      <h3 style="margin:0 0 12px;font-size:16px;line-height:1.4;color:var(--text)">${esc(step.title)}</h3>
      ${goalLine}
      ${urlRow}
      ${actionsList}
      ${copyFieldsBlock}
      ${copyBlobBlock}
      ${closingNote}
      ${completionBtn}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// FAQ review viewer (item-driven action)
// ---------------------------------------------------------------------------

async function renderFAQReview(
  slug: string,
  user: User,
  env: Env,
  def: ActionDefinition,
  ctx: BusinessCtx,
): Promise<Response> {
  void user; void ctx;
  const faqs = await getClientFAQs(env, slug);
  const proposed = faqs.filter((f) => f.status === "proposed");
  const approved = faqs.filter((f) => f.status === "approved");
  const rejected = faqs.filter((f) => f.status === "rejected");

  const cardStyle = "margin-bottom:14px;padding:20px 22px;background:var(--bg-lift);border:1px solid var(--line);border-radius:6px";

  function renderFAQCard(f: typeof faqs[number]): string {
    let evidence: { sources_by_type?: Record<string, number> } = {};
    try { evidence = JSON.parse(f.evidence_json || "{}"); } catch { /* skip */ }
    const sbt = evidence.sources_by_type || {};
    const trackedGap = sbt.tracked_prompt_gap || 0;
    const trackedDef = sbt.tracked_prompt_defense || 0;
    const reddit = sbt.reddit_thread || 0;
    const whyParts: string[] = [];
    if (trackedGap) whyParts.push(`${trackedGap} tracked AI ${trackedGap === 1 ? "query where you weren't cited" : "queries where you weren't cited"}`);
    if (trackedDef) whyParts.push(`${trackedDef} tracked ${trackedDef === 1 ? "query" : "queries"} with competitor pressure`);
    if (reddit) whyParts.push(`${reddit} cited Reddit ${reddit === 1 ? "thread" : "threads"}`);
    const whyLine = whyParts.length > 0 ? `From ${whyParts.join(" + ")}` : "";

    if (f.status === "proposed") {
      return `
        <div style="${cardStyle}">
          <div style="font-size:15.5px;font-weight:600;color:var(--text);margin-bottom:10px;line-height:1.45">${esc(f.question)}</div>
          <div id="faq-answer-${f.id}" style="color:var(--text);font-size:14px;line-height:1.65;margin-bottom:12px">${esc(f.answer_current)}</div>
          ${whyLine ? `<div style="color:var(--text-faint);font-size:12px;font-family:var(--mono);margin-bottom:14px">${esc(whyLine)}</div>` : ""}
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <form method="POST" action="/actions/${esc(slug)}/faq/${f.id}/approve" style="margin:0">
              <button type="submit" style="padding:9px 18px;background:var(--gold);color:#1a1814;border:0;font-weight:600;font-size:13px;border-radius:4px;cursor:pointer;font-family:inherit">Approve and deploy</button>
            </form>
            <button type="button" onclick="document.getElementById('faq-edit-${f.id}').style.display='block';this.style.display='none'"
                    style="padding:9px 18px;background:transparent;color:var(--gold);border:1px solid var(--gold);font-weight:600;font-size:13px;border-radius:4px;cursor:pointer;font-family:inherit">Edit answer</button>
            <button type="button" onclick="document.getElementById('faq-reject-${f.id}').style.display='block';this.style.display='none'"
                    style="padding:9px 18px;background:transparent;color:var(--text-mute);border:1px solid var(--line);font-weight:600;font-size:13px;border-radius:4px;cursor:pointer;font-family:inherit">Reject</button>
          </div>
          <form id="faq-edit-${f.id}" method="POST" action="/actions/${esc(slug)}/faq/${f.id}/edit" style="display:none;margin-top:14px">
            <textarea name="answer" rows="4" style="width:100%;background:var(--bg-edge);color:var(--text);border:1px solid var(--gold);padding:10px 12px;border-radius:4px;font-family:inherit;font-size:14px;line-height:1.6;resize:vertical">${esc(f.answer_current)}</textarea>
            <div style="display:flex;gap:8px;margin-top:10px">
              <button type="submit" style="padding:9px 18px;background:var(--gold);color:#1a1814;border:0;font-weight:600;font-size:13px;border-radius:4px;cursor:pointer;font-family:inherit">Save and approve</button>
              <button type="button" onclick="document.getElementById('faq-edit-${f.id}').style.display='none'"
                      style="padding:9px 18px;background:transparent;color:var(--text-mute);border:1px solid var(--line);font-weight:600;font-size:13px;border-radius:4px;cursor:pointer;font-family:inherit">Cancel</button>
            </div>
          </form>
          <form id="faq-reject-${f.id}" method="POST" action="/actions/${esc(slug)}/faq/${f.id}/reject" style="display:none;margin-top:14px;padding:14px;background:var(--bg-edge);border:1px solid var(--line);border-radius:4px">
            <div style="font-size:13px;color:var(--text);margin-bottom:10px">Why are you rejecting this?</div>
            <label style="display:block;margin-bottom:6px;font-size:13px;color:var(--text-mute);cursor:pointer">
              <input type="radio" name="category" value="off_topic" required> Off-topic for our business
            </label>
            <label style="display:block;margin-bottom:6px;font-size:13px;color:var(--text-mute);cursor:pointer">
              <input type="radio" name="category" value="voice"> Phrasing doesn't fit our voice
            </label>
            <label style="display:block;margin-bottom:6px;font-size:13px;color:var(--text-mute);cursor:pointer">
              <input type="radio" name="category" value="category"> We don't want this category framing
            </label>
            <label style="display:block;margin-bottom:10px;font-size:13px;color:var(--text-mute);cursor:pointer">
              <input type="radio" name="category" value="other"> Other
            </label>
            <input type="text" name="reason" placeholder="Optional: brief note" style="width:100%;background:var(--bg-lift);color:var(--text);border:1px solid var(--line);padding:8px 10px;border-radius:3px;font-family:inherit;font-size:13px;margin-bottom:10px">
            <div style="display:flex;gap:8px">
              <button type="submit" style="padding:9px 18px;background:var(--red);color:#fff;border:0;font-weight:600;font-size:13px;border-radius:4px;cursor:pointer;font-family:inherit">Reject and remove</button>
              <button type="button" onclick="document.getElementById('faq-reject-${f.id}').style.display='none'"
                      style="padding:9px 18px;background:transparent;color:var(--text-mute);border:1px solid var(--line);font-weight:600;font-size:13px;border-radius:4px;cursor:pointer;font-family:inherit">Cancel</button>
            </div>
          </form>
        </div>`;
    }

    if (f.status === "approved") {
      const editedNote = f.edited_at
        ? `<div style="color:var(--text-faint);font-size:11px;margin-top:6px;font-family:var(--mono)">Edited by you</div>`
        : "";
      return `
        <div style="${cardStyle};border-color:#7fc99a">
          <div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:8px;line-height:1.45">${esc(f.question)}</div>
          <div style="color:var(--text);font-size:14px;line-height:1.65;margin-bottom:10px">${esc(f.answer_current)}</div>
          ${editedNote}
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
            <button type="button" onclick="document.getElementById('faq-edit-${f.id}').style.display='block';this.style.display='none'"
                    style="padding:7px 14px;background:transparent;color:var(--gold);border:1px solid var(--gold);font-weight:600;font-size:12px;border-radius:3px;cursor:pointer;font-family:inherit">Edit answer</button>
            <form method="POST" action="/actions/${esc(slug)}/faq/${f.id}/remove" style="margin:0">
              <button type="submit" style="padding:7px 14px;background:transparent;color:var(--text-mute);border:1px solid var(--line);font-weight:600;font-size:12px;border-radius:3px;cursor:pointer;font-family:inherit">Remove from live</button>
            </form>
          </div>
          <form id="faq-edit-${f.id}" method="POST" action="/actions/${esc(slug)}/faq/${f.id}/edit" style="display:none;margin-top:14px">
            <textarea name="answer" rows="4" style="width:100%;background:var(--bg-edge);color:var(--text);border:1px solid var(--gold);padding:10px 12px;border-radius:4px;font-family:inherit;font-size:14px;line-height:1.6;resize:vertical">${esc(f.answer_current)}</textarea>
            <div style="display:flex;gap:8px;margin-top:10px">
              <button type="submit" style="padding:8px 16px;background:var(--gold);color:#1a1814;border:0;font-weight:600;font-size:13px;border-radius:4px;cursor:pointer;font-family:inherit">Save changes</button>
              <button type="button" onclick="document.getElementById('faq-edit-${f.id}').style.display='none'"
                      style="padding:8px 16px;background:transparent;color:var(--text-mute);border:1px solid var(--line);font-weight:600;font-size:13px;border-radius:4px;cursor:pointer;font-family:inherit">Cancel</button>
            </div>
          </form>
        </div>`;
    }

    // rejected
    return `
      <div style="${cardStyle};border-color:var(--line);opacity:0.7">
        <div style="font-size:14px;color:var(--text);margin-bottom:6px;line-height:1.5">${esc(f.question)}</div>
        <div style="color:var(--text-faint);font-size:12px;margin-bottom:10px;font-style:italic">Rejected${f.rejection_category ? ` — ${esc(f.rejection_category.replace("_", " "))}` : ""}${f.rejection_reason ? ` — "${esc(f.rejection_reason)}"` : ""}</div>
        <form method="POST" action="/actions/${esc(slug)}/faq/${f.id}/restore" style="margin:0">
          <button type="submit" style="padding:6px 12px;background:transparent;color:var(--text-mute);border:1px solid var(--line);font-weight:600;font-size:11px;border-radius:3px;cursor:pointer;font-family:inherit">Restore for review</button>
        </form>
      </div>`;
  }

  const proposedSection = proposed.length > 0
    ? `<div style="margin-bottom:32px">
         <div style="font-family:var(--label);font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:var(--gold);margin-bottom:14px">${proposed.length} awaiting review</div>
         ${proposed.map(renderFAQCard).join("\n")}
       </div>`
    : "";

  const approvedSection = approved.length > 0
    ? `<div style="margin-bottom:32px">
         <div style="font-family:var(--label);font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#7fc99a;margin-bottom:14px">${approved.length} live on your site</div>
         ${approved.map(renderFAQCard).join("\n")}
       </div>`
    : "";

  const rejectedSection = rejected.length > 0
    ? `<details style="margin-bottom:32px">
         <summary style="cursor:pointer;font-family:var(--label);font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:var(--text-faint);margin-bottom:14px">${rejected.length} rejected (click to expand)</summary>
         <div style="margin-top:14px">${rejected.map(renderFAQCard).join("\n")}</div>
       </details>`
    : "";

  const emptyState = proposed.length === 0 && approved.length === 0 && rejected.length === 0
    ? `<div style="${cardStyle};text-align:center;color:var(--text-mute)">
         <p style="margin:0 0 8px;font-size:15px">No FAQ proposals yet.</p>
         <p style="margin:0;color:var(--text-faint);font-size:13px">The system generates new proposals every Monday based on tracked AI citation data. Check back after the next regen cycle.</p>
       </div>`
    : "";

  const body = `
    <div style="margin-bottom:18px">
      <div class="label" style="margin-bottom:8px"><a href="/actions/${esc(slug)}" style="color:var(--text-mute)">Things to do</a> / ${esc(def.title)}</div>
      <h1>${esc(def.title)}</h1>
    </div>

    <div style="${cardStyle};margin-bottom:24px">
      <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--gold);margin-bottom:10px">Why this matters</div>
      <p style="margin:0 0 14px;color:var(--text);line-height:1.65;font-size:14px">${esc(def.why_this_matters)}</p>
      <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--gold);margin-bottom:10px;margin-top:18px">Heavy lifting is done. The clicks are yours.</div>
      <p style="margin:0;color:var(--text-mute);line-height:1.65;font-size:13px">${esc(def.boundary_framing)}</p>
    </div>

    ${proposedSection}
    ${approvedSection}
    ${rejectedSection}
    ${emptyState}
  `;

  return html(layout(def.title, body, user as unknown as User, slug));
}

// ===========================================================================
// POST handlers
// ===========================================================================

export async function handleStepComplete(
  slug: string, actionType: string, stepId: string, user: User, env: Env,
): Promise<Response> {
  if (!(await canAccessClient(env, user, slug))) return redirect("/");
  const def = ACTION_REGISTRY[actionType as ActionType];
  if (!def) return redirect(`/actions/${slug}`);
  await markStepComplete(env, slug, actionType as ActionType, stepId);
  return redirect(`/actions/${encodeURIComponent(slug)}/${encodeURIComponent(actionType)}`);
}

export async function handleActionComplete(
  slug: string, actionType: string, user: User, env: Env,
): Promise<Response> {
  if (!(await canAccessClient(env, user, slug))) return redirect("/");
  await markActionComplete(env, slug, actionType as ActionType);
  return redirect(`/actions/${encodeURIComponent(slug)}/${encodeURIComponent(actionType)}`);
}

export async function handleActionSkip(
  slug: string, actionType: string, user: User, env: Env,
): Promise<Response> {
  if (!(await canAccessClient(env, user, slug))) return redirect("/");
  await skipAction(env, slug, actionType as ActionType);
  return redirect(`/actions/${encodeURIComponent(slug)}`);
}

export async function handleInlineFieldSave(
  slug: string, field: string, request: Request, user: User, env: Env,
): Promise<Response> {
  if (!(await canAccessClient(env, user, slug))) return redirect("/");
  const form = await request.formData();
  const value = String(form.get("value") || "").trim();
  if (!value) return redirect(request.headers.get("referer") || `/actions/${encodeURIComponent(slug)}`);

  // Map value_ref -> injection_configs column. Address sub-fields write
  // into the address JSON blob; everything else writes directly.
  const addressSubFields = new Set([
    "business_address_street",
    "business_address_city",
    "business_address_state",
    "business_address_zip",
  ]);
  if (addressSubFields.has(field)) {
    const current = await env.DB.prepare(
      `SELECT business_address FROM injection_configs WHERE client_slug = ?`,
    ).bind(slug).first<{ business_address: string | null }>();
    let addr: Record<string, string> = {};
    try { addr = JSON.parse(current?.business_address || "{}") as Record<string, string>; } catch { /* skip */ }
    const subKey = field.replace("business_address_", "");
    addr[subKey] = value;
    await env.DB.prepare(
      `UPDATE injection_configs SET business_address = ?, updated_at = unixepoch() WHERE client_slug = ?`,
    ).bind(JSON.stringify(addr), slug).run();
  } else {
    const columnMap: Record<string, string> = {
      business_name: "business_name",
      business_url: "business_url",
      business_phone: "business_phone",
      business_email: "business_email",
      business_description: "business_description",
    };
    const col = columnMap[field];
    if (col) {
      await env.DB.prepare(
        `UPDATE injection_configs SET ${col} = ?, updated_at = unixepoch() WHERE client_slug = ?`,
      ).bind(value, slug).run();
    }
  }
  return redirect(request.headers.get("referer") || `/actions/${encodeURIComponent(slug)}`);
}

export async function handleFAQApprove(
  slug: string, faqId: number, user: User, env: Env,
): Promise<Response> {
  if (!(await canAccessClient(env, user, slug))) return redirect("/");
  await approveFAQ(env, faqId, user.id);
  return redirect(`/actions/${encodeURIComponent(slug)}/faq_review`);
}

export async function handleFAQEdit(
  slug: string, faqId: number, request: Request, user: User, env: Env,
): Promise<Response> {
  if (!(await canAccessClient(env, user, slug))) return redirect("/");
  const form = await request.formData();
  const answer = String(form.get("answer") || "").trim();
  if (answer) await editFAQAnswer(env, faqId, answer, user.id);
  return redirect(`/actions/${encodeURIComponent(slug)}/faq_review`);
}

export async function handleFAQReject(
  slug: string, faqId: number, request: Request, user: User, env: Env,
): Promise<Response> {
  if (!(await canAccessClient(env, user, slug))) return redirect("/");
  const form = await request.formData();
  const category = String(form.get("category") || "other") as RejectionCategory;
  const reason = (form.get("reason") as string)?.trim() || null;
  await rejectFAQ(env, faqId, category, reason, user.id);
  return redirect(`/actions/${encodeURIComponent(slug)}/faq_review`);
}

export async function handleFAQRestore(
  slug: string, faqId: number, user: User, env: Env,
): Promise<Response> {
  if (!(await canAccessClient(env, user, slug))) return redirect("/");
  await restoreRejectedFAQ(env, faqId, user.id);
  return redirect(`/actions/${encodeURIComponent(slug)}/faq_review`);
}

export async function handleFAQRemove(
  slug: string, faqId: number, user: User, env: Env,
): Promise<Response> {
  if (!(await canAccessClient(env, user, slug))) return redirect("/");
  await removeFAQFromLive(env, faqId, user.id);
  return redirect(`/actions/${encodeURIComponent(slug)}/faq_review`);
}
