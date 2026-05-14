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
    // Static generated values used by walkthrough steps. Not pulled
    // from injection_configs; always returns the same string.
    case "faq_marker_html": return '<div data-nr-faq></div>';
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
        if (def.progress_shape === "checklist_driven") {
          // For checklist actions, completed_steps_json isn't used.
          // Count directory_states in metadata_json instead.
          const items = def.checklist_items || [];
          const checkedCount = await countChecklistChecked(env, slug, def.type, items.length);
          status_label = `In progress (${checkedCount} of ${items.length} directories)`;
        } else {
          const completed = progress.completed_steps.length;
          const total = def.steps.length;
          status_label = `In progress (${completed} of ${total} steps)`;
        }
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
        <span style="color:var(--text-faint)">${def.time_estimate_minutes} min · ${
          def.progress_shape === "step_driven" ? `${def.steps.length} steps`
            : def.progress_shape === "checklist_driven" ? `${(def.checklist_items || []).length} directories`
            : "review and approve"
        }</span>
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
  if (def.progress_shape === "checklist_driven") {
    return renderChecklist(slug, user, env, def, ctx);
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
// Checklist viewer (checklist_driven actions like NAP audit)
//
// Different from the linear walkthrough renderer. Each row in the
// checklist is a directory to check. Per-row state lives in
// client_action_progress.metadata_json as a directory_states object:
//   { "yelp": { status: "checked_clean", checked_at: ... },
//     "yellow_pages": { status: "checked_mismatch", details: "..." } }
// Once every required item has a status, the action is complete.
// ---------------------------------------------------------------------------

interface ChecklistItemState {
  status: "not_checked" | "checked_clean" | "checked_mismatch";
  checked_at?: number;
  details?: string;
}

async function renderChecklist(
  slug: string,
  user: User,
  env: Env,
  def: ActionDefinition,
  ctx: BusinessCtx,
): Promise<Response> {
  const items = def.checklist_items || [];
  const progress = await env.DB.prepare(
    `SELECT status, metadata_json FROM client_action_progress
      WHERE client_slug = ? AND action_type = ?`,
  ).bind(slug, def.type).first<{ status: string; metadata_json: string | null }>();

  let directoryStates: Record<string, ChecklistItemState> = {};
  if (progress?.metadata_json) {
    try {
      const meta = JSON.parse(progress.metadata_json) as { directory_states?: Record<string, ChecklistItemState> };
      directoryStates = meta.directory_states || {};
    } catch { /* skip */ }
  }

  const addr = parseAddress(ctx.business_address);
  const businessName = ctx.business_name || slug;
  const city = addr.city || "";
  const nameUrl = encodeURIComponent(businessName);
  const cityUrl = encodeURIComponent(city);

  function expandUrl(template: string): string {
    return template
      .replace(/\{business_name_url\}/g, nameUrl)
      .replace(/\{city_url\}/g, cityUrl);
  }

  const totalRequired = items.length;
  const checkedCount = items.filter((it) => directoryStates[it.id]?.status && directoryStates[it.id].status !== "not_checked").length;
  const mismatchCount = items.filter((it) => directoryStates[it.id]?.status === "checked_mismatch").length;

  const cardStyle = "margin-bottom:18px;padding:20px 24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:6px";

  const headerBlock = `
    <div style="${cardStyle}">
      <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--gold);margin-bottom:10px">Why this matters</div>
      <p style="margin:0 0 14px;color:var(--text);line-height:1.65;font-size:14px">${esc(def.why_this_matters)}</p>
      <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--gold);margin-bottom:10px;margin-top:18px">Heavy lifting is done. The clicks are yours.</div>
      <p style="margin:0;color:var(--text-mute);line-height:1.65;font-size:13px">${esc(def.boundary_framing)}</p>
    </div>
  `;

  // The NAP to verify against. Shown once at the top, with copy
  // buttons per field, so the user can keep a single tab open
  // for the comparison work.
  const napCard = `
    <div style="${cardStyle}">
      <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--gold);margin-bottom:14px">Your verified NAP — confirm each directory shows this exactly</div>
      <table style="width:100%;border-collapse:separate;border-spacing:0;border:1px solid var(--line);border-radius:4px;background:var(--bg-edge)">
        ${renderNapRow("Name", ctx.business_name, slug, "business_name")}
        ${renderNapRow("Address", addr.street || null, slug, "business_address_street")}
        ${renderNapRow("City", addr.city || null, slug, "business_address_city")}
        ${renderNapRow("State", addr.state || null, slug, "business_address_state")}
        ${renderNapRow("ZIP", addr.zip || null, slug, "business_address_zip")}
        ${renderNapRow("Phone", ctx.business_phone, slug, "business_phone")}
        ${renderNapRow("Website", ctx.business_url, slug, "business_url")}
      </table>
    </div>
  `;

  const checklistRows = items.map((it) => {
    const state = directoryStates[it.id] || { status: "not_checked" };
    const url = expandUrl(it.url_template);
    let statusPill = "";
    let actionsHtml = "";

    if (state.status === "checked_clean") {
      statusPill = `<span style="display:inline-block;padding:3px 9px;background:rgba(127,201,154,0.15);color:#7fc99a;font-family:var(--mono);font-size:11px;font-weight:600;border-radius:10px">Looks good</span>`;
      actionsHtml = `
        <form method="POST" action="/actions/${esc(slug)}/${esc(def.type)}/check/${esc(it.id)}/reset" style="margin:0">
          <button type="submit" style="padding:6px 12px;background:transparent;color:var(--text-mute);border:1px solid var(--line);font-size:11px;font-weight:600;border-radius:3px;cursor:pointer;font-family:inherit">Re-check</button>
        </form>`;
    } else if (state.status === "checked_mismatch") {
      statusPill = `<span style="display:inline-block;padding:3px 9px;background:rgba(220,108,108,0.18);color:#dc6c6c;font-family:var(--mono);font-size:11px;font-weight:600;border-radius:10px">Mismatch</span>`;
      actionsHtml = `
        <form method="POST" action="/actions/${esc(slug)}/${esc(def.type)}/check/${esc(it.id)}/reset" style="margin:0">
          <button type="submit" style="padding:6px 12px;background:transparent;color:var(--text-mute);border:1px solid var(--line);font-size:11px;font-weight:600;border-radius:3px;cursor:pointer;font-family:inherit">Re-check</button>
        </form>`;
    } else {
      statusPill = `<span style="display:inline-block;padding:3px 9px;background:transparent;color:var(--text-faint);font-family:var(--mono);font-size:11px;border:1px solid var(--line);border-radius:10px">Not checked</span>`;
      actionsHtml = `
        <form method="POST" action="/actions/${esc(slug)}/${esc(def.type)}/check/${esc(it.id)}/clean" style="margin:0">
          <button type="submit" style="padding:7px 13px;background:var(--gold);color:#1a1814;border:0;font-size:11.5px;font-weight:600;border-radius:3px;cursor:pointer;font-family:inherit">Looks good</button>
        </form>
        <button type="button" onclick="document.getElementById('mismatch-${esc(it.id)}').style.display='block';this.style.display='none'"
                style="padding:7px 13px;background:transparent;color:var(--red);border:1px solid var(--red);font-size:11.5px;font-weight:600;border-radius:3px;cursor:pointer;font-family:inherit">Found mismatch</button>`;
    }

    const detailsLine = state.status === "checked_mismatch" && state.details
      ? `<div style="color:var(--text-faint);font-size:12px;margin-top:6px;font-style:italic">${esc(state.details)}</div>`
      : "";

    const mismatchForm = `
      <form id="mismatch-${esc(it.id)}" method="POST" action="/actions/${esc(slug)}/${esc(def.type)}/check/${esc(it.id)}/mismatch" style="display:none;margin-top:10px">
        <input type="text" name="details" placeholder="What's wrong? e.g. 'Phone is (808) 555-XXXX, should be (808) 555-YYYY'"
               style="width:100%;background:var(--bg-edge);color:var(--text);border:1px solid var(--line);padding:7px 10px;border-radius:3px;font-family:inherit;font-size:12.5px;margin-bottom:8px">
        <div style="display:flex;gap:8px">
          <button type="submit" style="padding:6px 14px;background:var(--red);color:#fff;border:0;font-size:11.5px;font-weight:600;border-radius:3px;cursor:pointer;font-family:inherit">Save mismatch</button>
          <button type="button" onclick="document.getElementById('mismatch-${esc(it.id)}').style.display='none'"
                  style="padding:6px 14px;background:transparent;color:var(--text-mute);border:1px solid var(--line);font-size:11.5px;font-weight:600;border-radius:3px;cursor:pointer;font-family:inherit">Cancel</button>
        </div>
      </form>`;

    return `
      <tr style="border-bottom:1px solid var(--line)">
        <td style="padding:14px 12px;vertical-align:top">
          <div style="font-size:14px;color:var(--text);font-weight:600;margin-bottom:4px">${esc(it.label)}</div>
          <div style="color:var(--text-faint);font-size:11.5px;line-height:1.5;margin-bottom:8px">${esc(it.helper || "")}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <a href="${esc(url)}" target="_blank" rel="noopener"
               style="display:inline-block;padding:6px 12px;background:var(--bg-edge);color:var(--gold);text-decoration:none;font-size:11px;font-weight:600;border:1px solid var(--gold);border-radius:3px">Search ${esc(it.label)} ↗</a>
            <button type="button" class="copy-btn" data-copy="${esc(url)}"
                    style="padding:6px 12px;background:transparent;color:var(--text-faint);border:1px solid var(--line);font-size:11px;font-weight:600;border-radius:3px;cursor:pointer;font-family:inherit">Copy URL</button>
          </div>
        </td>
        <td style="padding:14px 12px;vertical-align:top;width:120px;text-align:right">${statusPill}${detailsLine}</td>
        <td style="padding:14px 12px;vertical-align:top;width:200px;text-align:right">
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${actionsHtml}</div>
          ${mismatchForm}
        </td>
      </tr>`;
  }).join("");

  const checklistTable = `
    <div style="${cardStyle}">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--gold)">Directories — ${checkedCount} of ${totalRequired} checked${mismatchCount > 0 ? ` · ${mismatchCount} mismatch${mismatchCount === 1 ? "" : "es"}` : ""}</div>
      </div>
      <table style="width:100%;border-collapse:collapse">${checklistRows}</table>
    </div>
  `;

  const allChecked = checkedCount === totalRequired;
  const completionCard = allChecked && progress?.status !== "complete"
    ? `<div style="${cardStyle};border-color:#7fc99a">
         <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#7fc99a;margin-bottom:10px">All ${totalRequired} directories checked</div>
         <p style="margin:0 0 14px;color:var(--text);line-height:1.6;font-size:14px">${mismatchCount === 0 ? "No mismatches found. Your NAP is consistent across the directories AI engines cross-reference." : `${mismatchCount} mismatch${mismatchCount === 1 ? "" : "es"} flagged. Work through them at your own pace — engines re-crawl directory listings on 30 to 90 day cycles, so fixes compound over time.`}</p>
         <form method="POST" action="/actions/${esc(slug)}/${esc(def.type)}/complete" style="margin:0">
           <button type="submit" style="padding:10px 22px;background:var(--gold);color:#1a1814;border:0;font-weight:600;font-size:13px;border-radius:4px;cursor:pointer;font-family:inherit">Mark audit complete</button>
         </form>
       </div>`
    : progress?.status === "complete"
    ? `<div style="${cardStyle};border-color:#7fc99a;background:rgba(127,201,154,0.06)">
         <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#7fc99a;margin-bottom:8px">Complete</div>
         <p style="margin:0;color:var(--text);line-height:1.6;font-size:14px">Audit complete. Re-run this any time your business info changes.</p>
       </div>`
    : "";

  const body = `
    <div style="margin-bottom:8px">
      <div class="label" style="margin-bottom:8px"><a href="/actions/${esc(slug)}" style="color:var(--text-mute)">Things to do</a> / ${esc(def.title)}</div>
      <h1>${esc(def.title)}</h1>
    </div>
    ${headerBlock}
    ${napCard}
    ${checklistTable}
    ${completionCard}
    ${COPY_BUTTON_SCRIPT}
  `;

  return html(layout(def.title, body, user, slug));
}

async function countChecklistChecked(
  env: Env,
  slug: string,
  actionType: ActionType,
  _maxItems: number,
): Promise<number> {
  void _maxItems;
  const row = await env.DB.prepare(
    `SELECT metadata_json FROM client_action_progress
      WHERE client_slug = ? AND action_type = ?`,
  ).bind(slug, actionType).first<{ metadata_json: string | null }>();
  if (!row?.metadata_json) return 0;
  try {
    const meta = JSON.parse(row.metadata_json) as { directory_states?: Record<string, { status?: string }> };
    const states = meta.directory_states || {};
    return Object.values(states).filter((s) => s?.status && s.status !== "not_checked").length;
  } catch {
    return 0;
  }
}

function renderNapRow(label: string, value: string | null, slug: string, valueRef: string): string {
  if (value === null) {
    return `<tr>
      <td style="padding:8px 12px;color:var(--text-faint);font-size:12px;width:30%;vertical-align:top">${esc(label)}</td>
      <td colspan="2" style="padding:8px 12px">
        <form method="POST" action="/actions/${esc(slug)}/inline/${esc(valueRef)}" style="display:flex;gap:8px;flex-wrap:wrap;margin:0">
          <input type="text" name="value" placeholder="We don't have this on file. Add it once and we'll remember."
                 style="flex:1;min-width:200px;background:var(--bg-lift);color:var(--text);border:1px solid var(--line);padding:6px 10px;border-radius:3px;font-family:inherit;font-size:13px" />
          <button type="submit" style="padding:6px 14px;background:var(--gold);color:#1a1814;border:0;font-weight:600;font-size:12px;border-radius:3px;cursor:pointer;font-family:inherit">Save</button>
        </form>
      </td>
    </tr>`;
  }
  return `<tr>
      <td style="padding:8px 12px;color:var(--text-faint);font-size:12px;width:30%;vertical-align:top">${esc(label)}</td>
      <td style="padding:8px 12px;color:var(--text);font-size:13.5px;font-family:var(--mono)">${esc(value)}</td>
      <td style="padding:8px 12px;width:90px;text-align:right">
        <button type="button" class="copy-btn" data-copy="${esc(value)}"
                style="padding:5px 12px;background:transparent;color:var(--gold);border:1px solid var(--gold);font-size:11px;font-weight:600;border-radius:3px;cursor:pointer;font-family:inherit">Copy</button>
      </td>
    </tr>`;
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

/**
 * Mark a checklist item (e.g. a NAP audit directory) with a status.
 * Status is one of: 'clean', 'mismatch', 'reset'.
 * Stores per-item state in client_action_progress.metadata_json.
 * Once every required item has a non-reset status, the action's
 * overall status flips to 'submitted' (the user clicks 'Mark audit
 * complete' to finalize).
 */
export async function handleChecklistMark(
  slug: string,
  actionType: string,
  itemId: string,
  outcome: "clean" | "mismatch" | "reset",
  request: Request,
  user: User,
  env: Env,
): Promise<Response> {
  if (!(await canAccessClient(env, user, slug))) return redirect("/");
  const def = ACTION_REGISTRY[actionType as ActionType];
  if (!def || def.progress_shape !== "checklist_driven") {
    return redirect(`/actions/${encodeURIComponent(slug)}`);
  }
  const items = def.checklist_items || [];
  if (!items.find((it) => it.id === itemId)) {
    return redirect(`/actions/${encodeURIComponent(slug)}/${encodeURIComponent(actionType)}`);
  }

  let details: string | null = null;
  if (outcome === "mismatch") {
    const form = await request.formData();
    details = (form.get("details") as string)?.trim() || null;
  }

  const now = Math.floor(Date.now() / 1000);
  const existing = await env.DB.prepare(
    `SELECT id, metadata_json FROM client_action_progress
      WHERE client_slug = ? AND action_type = ?`,
  ).bind(slug, actionType).first<{ id: number; metadata_json: string | null }>();

  let directoryStates: Record<string, ChecklistItemState> = {};
  if (existing?.metadata_json) {
    try {
      const meta = JSON.parse(existing.metadata_json) as { directory_states?: Record<string, ChecklistItemState> };
      directoryStates = meta.directory_states || {};
    } catch { /* skip */ }
  }

  if (outcome === "reset") {
    delete directoryStates[itemId];
  } else {
    directoryStates[itemId] = {
      status: outcome === "clean" ? "checked_clean" : "checked_mismatch",
      checked_at: now,
      ...(details ? { details } : {}),
    };
  }

  const checkedCount = items.filter((it) => directoryStates[it.id]?.status && directoryStates[it.id].status !== "not_checked").length;
  const newStatus = checkedCount === items.length ? "submitted" : "in_progress";
  const metadataJson = JSON.stringify({ directory_states: directoryStates });

  if (existing) {
    await env.DB.prepare(
      `UPDATE client_action_progress
          SET status = ?, metadata_json = ?, last_activity_at = ?
        WHERE id = ?`,
    ).bind(newStatus, metadataJson, now, existing.id).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO client_action_progress
         (client_slug, action_type, status, metadata_json, last_activity_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(slug, actionType, newStatus, metadataJson, now, now).run();
  }

  return redirect(`/actions/${encodeURIComponent(slug)}/${encodeURIComponent(actionType)}`);
}

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
