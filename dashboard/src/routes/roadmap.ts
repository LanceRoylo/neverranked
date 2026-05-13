/**
 * Dashboard -- Phased AEO roadmap tracker
 *
 * Each client has multiple phases (Foundation, Growth, Dominance, etc).
 * When all items in a phase are done, the phase completes and the next unlocks.
 * AEO is a moving target -- there is always a next phase.
 */

import type { Env, User, RoadmapItem, RoadmapPhase } from "../types";
import { layout, html, redirect, esc } from "../render";
import { regenerateRoadmap } from "../auto-provision";
import { canAccessClient } from "../agency";
import { buildGlossary } from "../glossary";
import { renderImpactStrip } from "../impact-strip";

const CATEGORIES: Record<string, string> = {
  schema: "Schema Markup",
  content: "Content",
  technical: "Technical SEO",
  authority: "Authority",
  custom: "Custom",
};

// Status labels used on roadmap item rows. "Pending" was the original value
// but it read as ambiguous to clients ("pending what? a decision? a scan?")
// so we use "To do" which is unmistakable. "In Progress" stays because
// clients already understand it from task managers. Tooltip text on each
// label explains exactly what it means so agency owners forwarding the
// roadmap never have to answer "what's in progress?" for their clients.
const STATUSES: Record<string, { label: string; color: string; hint: string }> = {
  pending: { label: "To do", color: "var(--text-faint)", hint: "Not started. The system added this fix to your roadmap after a scan." },
  in_progress: { label: "In progress", color: "var(--yellow)", hint: "You started this item. Mark it done when the change is shipped, or reopen later." },
  done: { label: "Done", color: "var(--green)", hint: "Completed. The next weekly scan will re-verify the fix is still in place." },
  blocked: { label: "Blocked", color: "var(--red)", hint: "Paused because something external is in the way. Leave a note so we can help unblock." },
};

const PHASE_TEMPLATES: { title: string; subtitle: string; description: string }[] = [
  {
    title: "Foundation",
    subtitle: "Get the basics right",
    description: "Core technical SEO, essential schema markup, and content fundamentals that AI models need to understand and cite your site.",
  },
  {
    title: "Growth",
    subtitle: "Expand your visibility",
    description: "Advanced schema coverage, content authority signals, entity optimization, and competitive gap closure.",
  },
  {
    title: "Dominance",
    subtitle: "Own your category",
    description: "Featured snippet capture, cross-platform entity presence, competitive displacement, and sustained authority building.",
  },
  {
    title: "Maintenance",
    subtitle: "Protect what you've built",
    description: "Ongoing monitoring, regression prevention, algorithm adaptation, and emerging opportunity capture.",
  },
];

function buildRoadmapNarrative(
  totalItems: number,
  totalDone: number,
  completedPhases: number,
  totalPhases: number,
  allItems: RoadmapItem[]
): string {
  const parts: string[] = [];

  if (totalItems === 0) {
    parts.push("Your AEO roadmap is being built. Once items are added, this page will track every optimization task from start to finish, organized into phases that build on each other.");
    return esc(parts.join(" "));
  }

  const pctDone = Math.round((totalDone / totalItems) * 100);
  const inProgress = allItems.filter(i => i.status === "in_progress").length;
  const blocked = allItems.filter(i => i.status === "blocked").length;

  if (pctDone === 100) {
    parts.push("Every item in the current roadmap is complete. " + completedPhases + " of " + totalPhases + " phases delivered. If there are locked phases ahead, the next one will activate automatically. If all phases are done, new optimization opportunities will be added as AI engines evolve.");
  } else if (pctDone >= 75) {
    parts.push("The roadmap is " + pctDone + "% complete with " + totalDone + " of " + totalItems + " items delivered. The finish line for the current phase is close. Each completed item compounds, because AI models reward sites that get multiple authority signals right, not just one.");
  } else if (pctDone >= 40) {
    parts.push("Progress is steady at " + pctDone + "% (" + totalDone + " of " + totalItems + " items done). The active phase shows what is being worked on now and what is coming next. AEO improvements take 2-4 weeks to reflect in AI model responses, so results from recently completed items may not show in scores yet.");
  } else if (totalDone > 0) {
    parts.push("The roadmap is " + pctDone + "% complete. Early-phase work focuses on the foundational signals AI models check first: structured data, entity consistency, and content quality. These are the building blocks everything else depends on.");
  } else {
    parts.push("Work has not started yet on the " + totalItems + " items in the roadmap. The items are organized by priority, with the most impactful optimizations first. Each completed item strengthens the signals AI engines look for when deciding whether to cite a source.");
  }

  if (inProgress > 0) {
    parts.push(inProgress + " item" + (inProgress > 1 ? "s are" : " is") + " currently in progress.");
  }
  if (blocked > 0) {
    parts.push(blocked + " item" + (blocked > 1 ? "s are" : " is") + " blocked and may need attention.");
  }

  return esc(parts.join(" "));
}

/** Ensure a client has at least Phase 1. Returns all phases. */
async function ensurePhases(clientSlug: string, env: Env): Promise<RoadmapPhase[]> {
  let phases = (await env.DB.prepare(
    "SELECT * FROM roadmap_phases WHERE client_slug = ? ORDER BY phase_number"
  ).bind(clientSlug).all<RoadmapPhase>()).results;

  if (phases.length === 0) {
    const now = Math.floor(Date.now() / 1000);
    const tpl = PHASE_TEMPLATES[0];
    await env.DB.prepare(
      "INSERT INTO roadmap_phases (client_slug, phase_number, title, subtitle, description, status, created_at, updated_at) VALUES (?, 1, ?, ?, ?, 'active', ?, ?)"
    ).bind(clientSlug, tpl.title, tpl.subtitle, tpl.description, now, now).run();

    // Link any orphaned items to this new phase
    const phase = await env.DB.prepare(
      "SELECT * FROM roadmap_phases WHERE client_slug = ? AND phase_number = 1"
    ).bind(clientSlug).first<RoadmapPhase>();

    if (phase) {
      await env.DB.prepare(
        "UPDATE roadmap_items SET phase_id = ? WHERE client_slug = ? AND phase_id IS NULL"
      ).bind(phase.id, clientSlug).run();
      phases = [phase];
    }
  }

  return phases;
}

/** Check if active phase is complete, and auto-complete + unlock next */
export async function checkPhaseCompletion(clientSlug: string, env: Env): Promise<void> {
  const activePhase = await env.DB.prepare(
    "SELECT * FROM roadmap_phases WHERE client_slug = ? AND status = 'active' ORDER BY phase_number LIMIT 1"
  ).bind(clientSlug).first<RoadmapPhase>();

  if (!activePhase) return;

  const items = (await env.DB.prepare(
    "SELECT * FROM roadmap_items WHERE phase_id = ?"
  ).bind(activePhase.id).all<RoadmapItem>()).results;

  if (items.length === 0) return;

  const allDone = items.every(i => i.status === "done");
  if (!allDone) return;

  const now = Math.floor(Date.now() / 1000);

  // Complete the active phase
  await env.DB.prepare(
    "UPDATE roadmap_phases SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?"
  ).bind(now, now, activePhase.id).run();

  // Unlock the next phase (if locked)
  const nextPhase = await env.DB.prepare(
    "SELECT * FROM roadmap_phases WHERE client_slug = ? AND phase_number = ? AND status = 'locked'"
  ).bind(clientSlug, activePhase.phase_number + 1).first<RoadmapPhase>();

  if (nextPhase) {
    await env.DB.prepare(
      "UPDATE roadmap_phases SET status = 'active', updated_at = ? WHERE id = ?"
    ).bind(now, nextPhase.id).run();
  }

  // Celebration email for the milestone. Guard via admin_alerts so a
  // re-completion (e.g., admin reopens then re-closes an item) won't
  // re-fire. Cumulative effort wins like this are a real retention
  // moment -- the user's first instinct is "we're making progress."
  try {
    const alertType = `phase_completed_${activePhase.phase_number}`;
    const already = await env.DB.prepare(
      "SELECT id FROM admin_alerts WHERE client_slug = ? AND type = ? LIMIT 1"
    ).bind(clientSlug, alertType).first<{ id: number }>();
    if (!already) {
      const domain = await env.DB.prepare(
        "SELECT * FROM domains WHERE client_slug = ? AND is_competitor = 0 LIMIT 1"
      ).bind(clientSlug).first<Domain>();
      if (domain) {
        // Was: per-event phase-complete email blast. Now: log to
        // client_events; Monday digest renders.
        const { logClientEvent } = await import("../client-events");
        await logClientEvent(env, {
          client_slug: clientSlug,
          kind: "phase_complete",
          title: `Phase ${activePhase.phase_number} complete: ${activePhase.title}`,
          body: `${items.length} items delivered${nextPhase ? `. Phase ${activePhase.phase_number + 1} unlocked.` : "."}`,
          payload: {
            domain: domain.domain,
            phaseTitle: activePhase.title,
            phaseNumber: activePhase.phase_number,
            itemsCompleted: items.length,
            nextPhaseTitle: nextPhase?.title || null,
          },
        });
        await env.DB.prepare(
          "INSERT INTO admin_alerts (client_slug, type, title, detail, created_at) VALUES (?, ?, ?, ?, ?)"
        ).bind(
          clientSlug, alertType,
          `${domain.domain}: Phase ${activePhase.phase_number} (${activePhase.title}) completed`,
          `${items.length} items delivered. Event logged for next digest.${nextPhase ? ` Phase ${activePhase.phase_number + 1} unlocked.` : ""}`,
          now,
        ).run();
      }
    }
  } catch (e) {
    console.log(`[phase-complete] celebration failed for ${clientSlug}: ${e}`);
  }
}

export async function handleRoadmap(clientSlug: string, user: User, env: Env, url?: URL): Promise<Response> {
  // Access check: admins see all, agency admins see their agency's clients,
  // clients see only their own slug.
  if (!(await canAccessClient(env, user, clientSlug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }

  const phases = await ensurePhases(clientSlug, env);

  // Load the client's tier so per-item ownership badges can be
  // tier-aware (content is "We ship this" only at Amplify; at
  // Signal it shows as "Available at Amplify" upsell).
  const planRow = await env.DB.prepare(
    "SELECT plan FROM domains WHERE client_slug = ? AND active = 1 AND is_competitor = 0 LIMIT 1"
  ).bind(clientSlug).first<{ plan: string | null }>();
  const clientPlan = planRow?.plan || null;

  // Check for auto-completion
  await checkPhaseCompletion(clientSlug, env);

  // Re-fetch after potential completion
  const updatedPhases = (await env.DB.prepare(
    "SELECT * FROM roadmap_phases WHERE client_slug = ? ORDER BY phase_number"
  ).bind(clientSlug).all<RoadmapPhase>()).results;

  // Get all items grouped by phase. Hide stale items from the
  // active view; they remain in the table for history.
  const allItems = (await env.DB.prepare(
    "SELECT * FROM roadmap_items WHERE client_slug = ? AND COALESCE(stale, 0) = 0 ORDER BY sort_order, created_at"
  ).bind(clientSlug).all<RoadmapItem & { refresh_source?: string; stale?: number }>()).results;

  // Quarterly refresh banner. Surfaces when the client is past the
  // 90-day window since their last refresh (or engagement start).
  // Uses the daysUntilRefresh helper so we know whether to show
  // "due now" vs "due in N days" framing.
  const { daysUntilRefresh } = await import("../roadmap-refresh");
  const daysUntil = await daysUntilRefresh(clientSlug, env);
  const refreshBanner = (daysUntil !== null && daysUntil <= 0)
    ? `<div style="margin:0 0 24px;padding:14px 18px;background:rgba(201,168,76,.08);border:1px solid var(--gold-dim);border-radius:6px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
         <div style="font-size:13px;color:var(--text-soft);line-height:1.55;max-width:680px">
           <strong style="color:var(--gold)">Quarterly refresh due.</strong>
           AI models retrain every 60-90 days. Click <em>Refresh from drift</em> to scan the last 90 days of citation data, surface new competitors + lost citations + emerging gaps, and add roadmap items for what changed. In-flight items aren't touched.
         </div>
         <form method="POST" action="/roadmap/${encodeURIComponent(clientSlug)}/refresh" style="margin:0">
           <button type="submit" class="btn" style="padding:8px 16px;font-size:11px">Refresh now</button>
         </form>
       </div>`
    : "";

  // Map roadmap_item_id -> schema_injection. When present, the item is
  // "handled by NeverRanked" -- we ship the fix via the snippet rather
  // than asking the user to do anything. Drives the autonomous-vs-action
  // visual split below.
  const injectionByItemId = new Map<number, { status: string }>();
  const injectionRows = (await env.DB.prepare(
    "SELECT roadmap_item_id, status FROM schema_injections WHERE client_slug = ? AND roadmap_item_id IS NOT NULL"
  ).bind(clientSlug).all<{ roadmap_item_id: number; status: string }>()).results;
  for (const r of injectionRows) {
    injectionByItemId.set(r.roadmap_item_id, { status: r.status });
  }

  const now = Math.floor(Date.now() / 1000);

  // Overall progress across all phases
  const totalItems = allItems.length;
  const totalDone = allItems.filter(i => i.status === "done").length;
  const totalInProgress = allItems.filter(i => i.status === "in_progress").length;
  const completedPhases = updatedPhases.filter(p => p.status === "completed").length;

  // Velocity: items delivered in the last 30 days, and median days-to-
  // ship from when an item moved to in_progress (if we have the data).
  const THIRTY_DAYS_AGO = Math.floor(Date.now() / 1000) - 30 * 86400;
  const recentlyDelivered = allItems.filter(i => i.status === "done" && i.completed_at && i.completed_at > THIRTY_DAYS_AGO).length;
  // Stalled = in_progress but not touched in 14 days.
  const FOURTEEN_DAYS_AGO = Math.floor(Date.now() / 1000) - 14 * 86400;
  const stalledCount = allItems.filter(i => i.status === "in_progress" && i.updated_at < FOURTEEN_DAYS_AGO).length;

  // Build the phase journey indicator
  const journeyHtml = buildPhaseJourney(updatedPhases);

  // Build each phase section
  let phaseSections = `
    <style>
      details.phase-done { margin-bottom:16px }
      details.phase-done > summary { cursor:pointer; list-style:none; outline:none }
      details.phase-done > summary::-webkit-details-marker { display:none }
      details.phase-done > summary::marker { content:"" }
      details.phase-done:not([open]) { opacity:.75 }
      details.phase-done[open] .phase-chev { transform:rotate(180deg) }
      .phase-chev { display:inline-block; transition:transform .2s var(--ease); font-size:12px; color:var(--text-faint) }
    </style>
  `;
  for (const phase of updatedPhases) {
    const phaseItems = allItems.filter(i => i.phase_id === phase.id);
    const phaseDone = phaseItems.filter(i => i.status === "done").length;
    const phaseInProgress = phaseItems.filter(i => i.status === "in_progress").length;
    const phasePct = phaseItems.length > 0 ? Math.round((phaseDone / phaseItems.length) * 100) : 0;

    if (phase.status === "completed") {
      // Collapsed completed phase
      const completedDate = phase.completed_at
        ? new Date(phase.completed_at * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
        : "";
      phaseSections += `
        <details class="card phase-done">
          <summary>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:16px">
              <div style="display:flex;align-items:center;gap:16px;min-width:0">
                <div style="width:32px;height:32px;border-radius:50%;background:var(--green);display:flex;align-items:center;justify-content:center;font-size:14px;color:#080808;flex-shrink:0">&#10003;</div>
                <div style="min-width:0">
                  <div style="font-family:var(--serif);font-size:18px;font-style:italic;color:var(--text)">Phase ${phase.phase_number}: ${esc(phase.title)}</div>
                  ${phase.subtitle ? `<div style="font-size:12px;color:var(--text-faint);margin-top:2px">${esc(phase.subtitle)}</div>` : ""}
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:16px;flex-shrink:0">
                <div style="text-align:right">
                  <div style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--green)">Completed</div>
                  ${completedDate ? `<div style="font-size:11px;color:var(--text-faint);margin-top:2px">${completedDate}</div>` : ""}
                  <div style="font-size:12px;color:var(--text-faint);margin-top:2px">${phaseDone} items delivered</div>
                </div>
                <span class="phase-chev" aria-hidden="true">&#9662;</span>
              </div>
            </div>
          </summary>
          <div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--line)">
            ${buildItemList(phaseItems, clientSlug, user, now, injectionByItemId, clientPlan)}
          </div>
        </details>
      `;
    } else if (phase.status === "active") {
      // Expanded active phase with full item list
      phaseSections += `
        <div class="card" style="margin-bottom:16px;border:1px solid var(--gold-dim)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
            <div style="display:flex;align-items:center;gap:16px">
              <div style="width:32px;height:32px;border-radius:50%;border:2px solid var(--gold);display:flex;align-items:center;justify-content:center;font-family:var(--label);font-size:12px;font-weight:600;color:var(--gold);flex-shrink:0">${phase.phase_number}</div>
              <div>
                <div style="font-family:var(--serif);font-size:18px;font-style:italic;color:var(--text)">Phase ${phase.phase_number}: ${esc(phase.title)}</div>
                ${phase.subtitle ? `<div style="font-size:12px;color:var(--text-faint);margin-top:2px">${esc(phase.subtitle)}</div>` : ""}
              </div>
            </div>
            <span style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);background:var(--gold-wash);padding:4px 12px;border-radius:2px">Active</span>
          </div>

          ${phase.description ? `<div style="font-size:13px;color:var(--text-faint);line-height:1.7;margin-bottom:24px;padding:16px 20px;background:var(--bg-edge);border-radius:4px">${esc(phase.description)}</div>` : ""}

          <!-- Phase progress bar -->
          <div style="margin-bottom:28px">
            <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px">
              <div style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint)">Phase progress</div>
              <div style="font-size:13px;color:var(--text-faint)">${phaseDone} of ${phaseItems.length} complete (${phasePct}%)</div>
            </div>
            <div style="height:8px;background:rgba(251,248,239,.06);border-radius:4px;overflow:hidden">
              <div style="height:100%;width:${phasePct}%;background:var(--gold);border-radius:4px;transition:width .3s var(--ease)"></div>
            </div>
            <div style="display:flex;gap:20px;margin-top:10px;font-size:12px">
              <span style="color:var(--green)">${phaseDone} done</span>
              <span style="color:var(--yellow)">${phaseInProgress} in progress</span>
              <span style="color:var(--text-faint)">${phaseItems.length - phaseDone - phaseInProgress} pending</span>
            </div>
          </div>

          ${buildItemList(phaseItems, clientSlug, user, now, injectionByItemId, clientPlan)}
        </div>
      `;
    } else {
      // Locked future phase
      phaseSections += `
        <div class="card" style="margin-bottom:16px;opacity:.45">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:16px">
              <div style="width:32px;height:32px;border-radius:50%;border:1.5px solid var(--line);display:flex;align-items:center;justify-content:center;font-family:var(--label);font-size:12px;color:var(--text-faint);flex-shrink:0">${phase.phase_number}</div>
              <div>
                <div style="font-family:var(--serif);font-size:18px;font-style:italic;color:var(--text-mute)">Phase ${phase.phase_number}: ${esc(phase.title)}</div>
                ${phase.subtitle ? `<div style="font-size:12px;color:var(--text-faint);margin-top:2px">${esc(phase.subtitle)}</div>` : ""}
              </div>
            </div>
            <span style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint)">Locked</span>
          </div>
          ${phase.description ? `<div style="font-size:13px;color:var(--text-faint);line-height:1.7;margin-top:16px">${esc(phase.description)}</div>` : ""}
        </div>
      `;
    }
  }

  // The "AEO is a moving target" callout
  const movingTargetCallout = `
    <div style="margin-top:48px;padding:24px 28px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
      <div style="display:flex;align-items:flex-start;gap:16px">
        <div style="font-size:20px;flex-shrink:0;margin-top:2px">&#8635;</div>
        <div>
          <div style="font-family:var(--serif);font-size:16px;font-style:italic;color:var(--text);margin-bottom:8px">AEO is a moving target</div>
          <div style="font-size:13px;color:var(--text-faint);line-height:1.7">AI models retrain. Competitors improve. Search algorithms evolve. A strong score today can slip tomorrow without ongoing monitoring and optimization. Each phase builds on the last, and there is always work that moves the needle.</div>
        </div>
      </div>
    </div>
  `;

  // Admin: add item form (scoped to active phase). The auto-generator
  // (autoGenerateRoadmap, runMissingRoadmapSweep, Regenerate button)
  // covers the happy path -- new clients get a roadmap without anyone
  // touching this form. Manual add is reserved for the rare edge cases:
  // off-site work the scanner can't see (backlinks, press), client
  // requests for page-specific items, or custom service work an agency
  // wants tracked. To keep the page clean by default, the form only
  // renders when ?advanced=1 is in the URL.
  const advancedMode = url?.searchParams.get("advanced") === "1";
  const activePhase = updatedPhases.find(p => p.status === "active");
  const addForm = user.role === "admin" && !user._viewAsClient && advancedMode ? `
    <div class="card" style="margin-top:32px">
      <h3 style="margin-bottom:20px">Add roadmap <em>item</em></h3>
      <form method="POST" action="/roadmap/${clientSlug}/add">
        ${activePhase ? `<input type="hidden" name="phase_id" value="${activePhase.id}">` : ""}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div class="form-group">
            <label>Title</label>
            <input type="text" name="title" required placeholder="Add Organization schema to homepage">
          </div>
          <div class="form-group">
            <label>Category</label>
            <select name="category" style="width:100%;padding:12px 16px;background:var(--bg-edge);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:14px">
              ${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Description (optional)</label>
          <input type="text" name="description" placeholder="Brief explanation of what this involves and why it matters">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div class="form-group">
            <label>Due date (optional)</label>
            <input type="date" name="due_date" style="width:100%;padding:12px 16px;background:var(--bg-edge);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:14px">
          </div>
          <div class="form-group">
            <label>Priority order</label>
            <input type="number" name="sort_order" value="${totalItems + 1}" min="1" style="width:100%;padding:12px 16px;background:var(--bg-edge);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:14px">
          </div>
        </div>
        <button type="submit" class="btn">Add item</button>
      </form>
    </div>

    <div class="card" style="margin-top:16px">
      <h3 style="margin-bottom:20px">Add <em>phase</em></h3>
      <form method="POST" action="/roadmap/${clientSlug}/add-phase">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div class="form-group">
            <label>Title</label>
            <input type="text" name="title" required placeholder="Growth" value="${PHASE_TEMPLATES[updatedPhases.length] ? PHASE_TEMPLATES[updatedPhases.length].title : ''}">
          </div>
          <div class="form-group">
            <label>Subtitle</label>
            <input type="text" name="subtitle" placeholder="Expand your visibility" value="${PHASE_TEMPLATES[updatedPhases.length] ? PHASE_TEMPLATES[updatedPhases.length].subtitle : ''}">
          </div>
        </div>
        <div class="form-group">
          <label>Description</label>
          <input type="text" name="description" placeholder="What this phase focuses on" value="${PHASE_TEMPLATES[updatedPhases.length] ? esc(PHASE_TEMPLATES[updatedPhases.length].description) : ''}">
        </div>
        <button type="submit" class="btn btn-ghost">Add phase (locked)</button>
      </form>
    </div>
  ` : "";

  const body = `
    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:40px">
      <div>
        <div class="label" style="margin-bottom:8px">
          <a href="/" style="color:var(--text-mute)">Dashboard</a> / ${esc(clientSlug)}
        </div>
        <h1>AEO <em>Roadmap</em></h1>
      </div>
      <div style="display:flex;align-items:flex-end;gap:16px">
        ${user.role === "admin" && !user._viewAsClient ? `
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <form method="POST" action="/roadmap/${encodeURIComponent(clientSlug)}/refresh" title="Run drift detection against the last 90 days of citation data and add new items for new competitors, lost citations, and emerging gaps. Doesn't touch existing in-flight items.">
              <button type="submit" class="btn btn-ghost" style="padding:6px 12px;font-size:9px">Refresh from drift</button>
            </form>
            <form method="POST" action="/roadmap/${encodeURIComponent(clientSlug)}/regenerate" onsubmit="return confirm('This will replace all existing roadmap items with a fresh plan based on the latest scan. Continue?')">
              <button type="submit" class="btn btn-ghost" style="padding:6px 12px;font-size:9px">Regenerate</button>
            </form>
            ${allItems.some(i => i.status === "pending") ? `
              <form method="POST" action="/roadmap/${encodeURIComponent(clientSlug)}/bulk-start" onsubmit="return confirm('Mark every To-do item in the active phase as In-progress?')">
                <button type="submit" class="btn btn-ghost" style="padding:6px 12px;font-size:9px" title="Flips every To-do item in the active phase to In-progress so the client can start checking them off.">Start all to-dos</button>
              </form>
            ` : ''}
          </div>
        ` : ''}
        <div style="text-align:right">
          <div style="font-size:12px;color:var(--text-faint)">${completedPhases} of ${updatedPhases.length} phases complete</div>
          <div style="font-size:12px;color:var(--text-faint);margin-top:2px">${totalDone} of ${totalItems} items delivered</div>
        </div>
      </div>
    </div>

    ${refreshBanner}

    ${totalItems > 0 ? renderImpactStrip([
      { value: totalDone, suffix: `/ ${totalItems}`, label: "items delivered", accent: "var(--text)" },
      { value: recentlyDelivered, label: "delivered last 30 days", accent: recentlyDelivered > 0 ? "var(--green)" : "var(--text)" },
      // Hide "actively in progress" when zero. Empty roadmap-state
      // tiles read as "nothing's happening" even when the rest of
      // the dashboard is showing real momentum, so we only surface
      // this tile when there's actual in-flight work.
      ...(totalInProgress > 0 ? [{ value: totalInProgress, label: "actively in progress", accent: "var(--gold)" }] : []),
      // Same logic for the stalled tile -- only show when something
      // is actually stalled. A clean dashboard with zero stalls
      // shouldn't broadcast a zero next to a "stalled" label.
      ...(stalledCount > 0 ? [{ value: stalledCount, label: "stalled 14+ days", accent: "var(--red)" }] : []),
    ], { eyebrow: "Momentum", caption: `${completedPhases} of ${updatedPhases.length} phases complete` }) : ""}

    <!-- Context -->
    <div class="narrative-context" style="margin-bottom:24px">
      ${buildRoadmapNarrative(totalItems, totalDone, completedPhases, updatedPhases.length, allItems)}
    </div>

    <!-- How this page works. Every roadmap opens with the same question:
         "what am I looking at and what am I supposed to do?" This card
         answers that in one read so users stop guessing at status labels. -->
    <div style="margin-bottom:32px;padding:16px 20px;background:var(--bg-lift);border-left:2px solid var(--gold-dim);border-radius:0 3px 3px 0">
      <div class="label" style="margin-bottom:8px;color:var(--gold)">\u00a7 How this roadmap works</div>
      <div style="font-size:12px;color:var(--text-soft);line-height:1.65;max-width:780px">
        Every item here was added by the system based on scans of your site. Work through them in phase order. Click the checkbox to mark an item <strong style="color:var(--text);font-weight:500">done</strong> once you ship the fix. The next weekly scan will re-verify it. Items you start but haven't shipped are <strong style="color:var(--text);font-weight:500">in progress</strong>. Items you can't complete right now stay in <strong style="color:var(--text);font-weight:500">to do</strong> until you're ready. Phases unlock sequentially so you can focus without being overwhelmed.
      </div>
    </div>

    ${journeyHtml}
    ${phaseSections}
    ${movingTargetCallout}
    ${addForm}
    ${user.role === "admin" && !user._viewAsClient ? `
      <div style="margin-top:24px;text-align:right">
        ${advancedMode
          ? `<a href="/roadmap/${esc(clientSlug)}" style="font-size:11px;color:var(--text-faint);text-decoration:none">Hide advanced</a>`
          : `<a href="/roadmap/${esc(clientSlug)}?advanced=1" style="font-size:11px;color:var(--text-faint);text-decoration:none" title="Adds a form to manually create custom roadmap items or phases. Rarely needed -- the auto-generator handles the normal path.">Show advanced (manual add)</a>`}
      </div>
    ` : ""}

    ${buildGlossary()}
  `;

  return html(layout("Roadmap", body, user, clientSlug));
}

/** Build the horizontal phase journey indicator */
function buildPhaseJourney(phases: RoadmapPhase[]): string {
  if (phases.length <= 1) return "";

  const steps = phases.map((p, i) => {
    const isCompleted = p.status === "completed";
    const isActive = p.status === "active";
    const circleStyle = isCompleted
      ? "background:var(--green);color:#080808"
      : isActive
        ? "border:2px solid var(--gold);color:var(--gold)"
        : "border:1.5px solid var(--line);color:var(--text-faint)";
    const circleContent = isCompleted ? "&#10003;" : `${p.phase_number}`;
    const labelColor = isActive ? "color:var(--gold)" : isCompleted ? "color:var(--green)" : "color:var(--text-faint)";

    return `
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px;flex:0 0 auto">
        <div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--label);font-size:11px;font-weight:600;${circleStyle}">${circleContent}</div>
        <div style="font-family:var(--label);font-size:9px;letter-spacing:.12em;text-transform:uppercase;${labelColor};white-space:nowrap">${esc(p.title)}</div>
      </div>
    `;
  });

  // Connect with lines
  const connected: string[] = [];
  for (let i = 0; i < steps.length; i++) {
    connected.push(steps[i]);
    if (i < steps.length - 1) {
      const prevDone = phases[i].status === "completed";
      const lineColor = prevDone ? "var(--green)" : "var(--line)";
      connected.push(`<div style="flex:1;height:2px;background:${lineColor};margin-top:14px;min-width:24px"></div>`);
    }
  }

  return `
    <div style="display:flex;align-items:flex-start;gap:0;margin-bottom:32px;padding:16px 20px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;overflow-x:auto">
      ${connected.join("")}
    </div>
  `;
}

/** Build item list grouped by category */
/**
 * Determine an item's "verification mode" -- the actor responsible
 * for getting it done and the way completion is confirmed. Drives
 * how the item renders in the list:
 *
 *   system     -> NeverRanked ships this via the snippet. NO checkbox.
 *                 Status pill shows "Live" or "Pending publish".
 *   auto       -> User does the work, scanner confirms on next Monday.
 *                 Checkbox is optional ("mark complete or wait for scan").
 *   manual     -> Honor system. User does the work and marks it themselves.
 */
type VerificationMode = "system" | "auto" | "manual";

function getVerificationMode(item: RoadmapItem, injection?: { status: string }): VerificationMode {
  if (injection) return "system";
  // The scanner can verify schema, content, and technical fixes by re-reading
  // the page on the next scan. Authority and custom-category work isn't
  // automatically detectable.
  if (item.category === "schema" || item.category === "content" || item.category === "technical") {
    return "auto";
  }
  return "manual";
}

/** Ownership badge: who actually does the work for this item.
 *  Tier-aware -- content items are "We ship this" only at Amplify;
 *  at Signal they show as "Available at Amplify" upsell. Schema is
 *  always us at any paid tier; technical and authority work is
 *  inherently customer-side (theme edits, GBP claims, real
 *  backlinks, NAP consistency across directories).
 *
 *  Important: this is independent of completion verification mode.
 *  An item can be "We ship this" AND "auto-verified" (we ship it,
 *  the scanner confirms). Or "You ship this" AND "auto-verified"
 *  (customer ships it, scanner confirms). Or "You ship this" AND
 *  "self-reported" (customer ships it, honor system). All
 *  combinations are valid. */
function ownershipBadge(category: string, plan: string | null): string {
  // Schema is always shipped by NeverRanked at any paid tier.
  if (category === "schema") {
    return ownerPill("We ship this", "var(--green)");
  }
  // Content writing is included only in Amplify. At Signal/Audit
  // we surface it as the upsell trigger.
  if (category === "content") {
    if (plan === "amplify") return ownerPill("We ship this", "var(--green)");
    return ownerPill("Available at Amplify", "var(--gold)");
  }
  // Technical changes touch the customer's CMS / theme / server.
  // We don't have direct access to make these (og:image, robots.txt,
  // page speed, canonical URLs, HTTPS).
  if (category === "technical") {
    return ownerPill("You ship this", "var(--text-faint)");
  }
  // Authority (GBP claims, NAP consistency, backlink building,
  // industry-directory listings) is inherently customer-side -- we
  // can't claim a Google Business Profile on behalf of a business
  // we don't own, and real backlinks require real relationships.
  return ownerPill("You ship this", "var(--text-faint)");
}

function ownerPill(label: string, color: string): string {
  return `<span style="display:inline-block;padding:2px 8px;border:1px solid ${color};border-radius:999px;font-family:var(--label);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:${color}">${label}</span>`;
}

function modeBadge(mode: VerificationMode, injectionStatus?: string): string {
  if (mode === "system") {
    const live = injectionStatus === "approved";
    const color = live ? "var(--green)" : "var(--gold)";
    const label = live ? "Live -- handled by NeverRanked" : "Pending publish";
    return `<span style="display:inline-block;padding:2px 8px;border:1px solid ${color};border-radius:999px;font-family:var(--label);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:${color}">${label}</span>`;
  }
  if (mode === "auto") {
    return `<span style="display:inline-block;padding:2px 8px;border:1px solid var(--line);border-radius:999px;font-family:var(--label);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint)" title="The scanner will verify this on Monday's scan. You can also mark it complete yourself.">Auto-verified</span>`;
  }
  return `<span style="display:inline-block;padding:2px 8px;border:1px solid var(--line);border-radius:999px;font-family:var(--label);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint)" title="Honor system. Mark complete when you (or your team) have actually done the work.">Self-reported</span>`;
}

function completionSourceLabel(item: RoadmapItem): string {
  if (item.status !== "done") return "";
  const when = item.completed_at
    ? new Date(item.completed_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "";
  if (item.completed_by === "scan") return `Verified by scan${when ? ` on ${when}` : ""}`;
  if (item.completed_by === "admin") return `Marked by ops${when ? ` on ${when}` : ""}`;
  if (item.completed_by === "user") return `Marked complete${when ? ` on ${when}` : ""}`;
  return when ? `Completed ${when}` : "Completed";
}

function buildItemList(items: RoadmapItem[], clientSlug: string, user: User, now: number, injectionByItemId: Map<number, { status: string }>, plan: string | null): string {
  if (items.length === 0) {
    return `
      <div class="empty" style="padding:20px 24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
        <p style="color:var(--text-soft);font-size:12px;line-height:1.7;margin:0;max-width:680px">
          ${user.role === "admin" && !user._viewAsClient
            ? "No items added for this phase yet. Use the admin panel to add items manually, or trigger an auto-provision from the latest scan."
            : "Items for this phase are being prepared. The system generates phase items automatically from each weekly scan. If this phase stays empty after your next Monday scan, email your account manager."}
        </p>
      </div>
    `;
  }

  // Bucket items into "system handles this" vs "someone needs to do
  // this" so each renders with the right affordances and we never
  // confuse a checkbox-as-action with a checkbox-as-status.
  const systemItems: RoadmapItem[] = [];
  const actionItems: RoadmapItem[] = [];
  for (const item of items) {
    const mode = getVerificationMode(item, injectionByItemId.get(item.id));
    if (mode === "system") systemItems.push(item);
    else actionItems.push(item);
  }

  const renderSystemItem = (item: RoadmapItem): string => {
    const injection = injectionByItemId.get(item.id);
    const isLive = injection?.status === "approved";
    return `
      <div style="padding:12px 16px;background:var(--bg-edge);border-left:3px solid ${isLive ? 'var(--green)' : 'var(--gold)'};border-radius:0 4px 4px 0">
        <div style="display:flex;align-items:center;gap:14px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <div style="font-size:13px;color:var(--text)">${esc(item.title)}</div>
              ${ownershipBadge(item.category, plan)}
              ${modeBadge("system", injection?.status)}
            </div>
            ${item.description ? `<div style="font-size:11px;color:var(--text-faint);margin-top:4px;white-space:pre-wrap;line-height:1.65">${esc(item.description)}</div>` : ''}
          </div>
        </div>
      </div>
    `;
  };

  const renderActionItem = (item: RoadmapItem): string => {
    const mode = getVerificationMode(item, injectionByItemId.get(item.id));
    const st = STATUSES[item.status] || STATUSES.pending;
    const dueStr = item.due_date
      ? new Date(item.due_date * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : null;
    const overdue = item.due_date && item.due_date < now && item.status !== "done";
    const hasNote = item.client_note && item.client_note.trim();
    const sourceLabel = completionSourceLabel(item);
    const checkboxTitle = mode === "auto"
      ? "Mark complete. The next Monday scan will also auto-verify this if you'd rather wait."
      : "Mark complete. Honor system -- only check when you've actually done the work.";

    return `
      <div style="padding:12px 16px;background:var(--bg-edge);border-radius:4px;${item.status === 'done' ? 'opacity:.6' : ''}">
        <div style="display:flex;align-items:center;gap:14px">
          ${item.status !== "done" && (user.role === "client" || user.role === "admin" || user.role === "agency_admin") ? `
            <form method="POST" action="/roadmap/${clientSlug}/update/${item.id}" style="display:flex;flex-shrink:0">
              <button type="submit" name="status" value="done" style="width:20px;height:20px;border-radius:4px;border:1.5px solid var(--line);background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:border-color .2s,background .2s" title="${checkboxTitle}" onmouseover="this.style.borderColor='var(--gold)';this.style.background='var(--gold-wash)'" onmouseout="this.style.borderColor='var(--line)';this.style.background='none'"></button>
            </form>
          ` : item.status === "done" ? `
            <div style="width:20px;height:20px;border-radius:4px;background:var(--green);display:flex;align-items:center;justify-content:center;font-size:11px;color:#080808;flex-shrink:0" title="${esc(sourceLabel)}">&#10003;</div>
          ` : `<div style="width:20px;height:20px;flex-shrink:0"></div>`}
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <div style="font-size:13px;color:var(--text);${item.status === 'done' ? 'text-decoration:line-through;color:var(--text-faint)' : ''}">${esc(item.title)}</div>
              ${ownershipBadge(item.category, plan)}
              ${item.status !== "done" ? modeBadge(mode) : ""}
            </div>
            ${item.description ? `<div style="font-size:11px;color:var(--text-faint);margin-top:3px;white-space:pre-wrap;line-height:1.65">${esc(item.description)}</div>` : ''}
            ${item.status === "done" && sourceLabel ? `<div style="font-size:10px;color:var(--text-faint);margin-top:4px;font-family:var(--label);letter-spacing:.06em">${esc(sourceLabel)}</div>` : ""}
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
            ${dueStr && item.status !== "done" ? `<span style="font-size:10px;font-family:var(--label);letter-spacing:.1em;${overdue ? 'color:var(--red)' : 'color:var(--text-faint)'}">${overdue ? 'OVERDUE ' : ''}${dueStr}</span>` : ''}
            ${item.status !== "done" && (user._viewAsClient || (user.role !== "admin" && user.role !== "agency_admin")) ? `
              <span class="status status-${item.status === 'in_progress' ? 'in_progress' : 'pending'}" style="font-size:9px" title="${esc(st.hint)}">${st.label}</span>
            ` : ""}
          </div>
        </div>
        ${hasNote ? `
          <div style="margin-top:8px;margin-left:34px;padding:8px 12px;background:rgba(232,199,103,.04);border-left:2px solid var(--gold-dim);font-size:11px;color:var(--text-faint);line-height:1.5;border-radius:0 2px 2px 0">
            ${esc(item.client_note!)}
          </div>
        ` : ''}
        ${item.status !== "done" ? `
          <details style="margin-top:6px;margin-left:34px">
            <summary style="cursor:pointer;font-size:10px;color:var(--text-faint);font-family:var(--label);letter-spacing:.1em;text-transform:uppercase">${hasNote ? 'Edit note' : 'Add note'}</summary>
            <form method="POST" action="/roadmap/${clientSlug}/update/${item.id}" style="margin-top:6px;display:flex;gap:6px">
              <input type="text" name="client_note" value="${hasNote ? esc(item.client_note!) : ''}" placeholder="Leave a note (e.g., done on our end, waiting on dev, need help)" style="flex:1;padding:6px 10px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:11px;border-radius:2px">
              <button type="submit" class="btn" style="padding:6px 12px;font-size:9px">Save</button>
            </form>
          </details>
        ` : ''}
        ${(user.role === "admin" || user.role === "agency_admin") && !user._viewAsClient && item.status !== "done" ? `
          <details style="margin-top:6px;margin-left:34px;opacity:.55" data-admin-only>
            <summary style="cursor:pointer;font-size:10px;color:var(--text-faint);font-family:var(--label);letter-spacing:.1em;text-transform:uppercase">Admin &middot; ${st.label}</summary>
            <div style="margin-top:8px;padding:8px 10px;background:rgba(232,199,103,.04);border-left:2px solid var(--gold-dim);border-radius:0 2px 2px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              <form method="POST" action="/drafts/${clientSlug}/new-generated" style="display:inline" title="Create a new draft in your voice using this item's title and description as the brief" onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='Drafting…';">
                <input type="hidden" name="title" value="${esc(item.title)}">
                <input type="hidden" name="brief" value="${esc(item.description || "")}">
                <input type="hidden" name="kind" value="article">
                <input type="hidden" name="roadmap_item_id" value="${item.id}">
                <button type="submit" class="btn btn-ghost" style="padding:4px 8px;font-size:9px;color:var(--gold)">Draft in voice</button>
              </form>
              ${user.role === "admin" ? `
                <form method="POST" action="/roadmap/${clientSlug}/update/${item.id}" style="display:flex;gap:4px">
                  ${item.status === "pending" ? `<button type="submit" name="status" value="in_progress" class="btn btn-ghost" style="padding:4px 8px;font-size:9px" title="Move to in-progress">Start</button>` : ''}
                  ${item.status === "in_progress" ? `<button type="submit" name="status" value="blocked" class="btn btn-ghost" style="padding:4px 8px;font-size:9px;color:var(--red)" title="Block">Block</button>` : ''}
                </form>
              ` : ''}
            </div>
          </details>
        ` : (user.role === "admin" && !user._viewAsClient && item.status === "done") ? `
          <details style="margin-top:6px;margin-left:34px;opacity:.55" data-admin-only>
            <summary style="cursor:pointer;font-size:10px;color:var(--text-faint);font-family:var(--label);letter-spacing:.1em;text-transform:uppercase">Admin &middot; done</summary>
            <div style="margin-top:8px;padding:8px 10px;background:rgba(232,199,103,.04);border-left:2px solid var(--gold-dim);border-radius:0 2px 2px 0">
              <form method="POST" action="/roadmap/${clientSlug}/update/${item.id}">
                <button type="submit" name="status" value="pending" class="btn btn-ghost" style="padding:4px 8px;font-size:9px" title="Reopen">Reopen</button>
              </form>
            </div>
          </details>
        ` : ''}
      </div>
    `;
  };

  // Render system section first if there are any. The visual frame
  // (different border, tagline) is what makes "no action needed"
  // unmissable.
  let html = "";
  if (systemItems.length > 0) {
    html += `
      <div style="margin-bottom:24px;padding:16px 20px;background:rgba(74,222,128,.04);border:1px solid rgba(74,222,128,.18);border-radius:4px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:16px;flex-wrap:wrap">
          <div>
            <div style="font-family:var(--label);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--green);margin-bottom:4px">Handled by NeverRanked</div>
            <div style="font-size:12px;color:var(--text-faint)">These run on autopilot via your installed snippet. No action needed from you.</div>
          </div>
          <span style="font-family:var(--label);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">${systemItems.length} item${systemItems.length === 1 ? "" : "s"}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${systemItems.map(renderSystemItem).join("")}
        </div>
      </div>
    `;
  }

  // Group action items by category for the existing layout convention.
  const grouped = new Map<string, RoadmapItem[]>();
  for (const item of actionItems) {
    const arr = grouped.get(item.category) || [];
    arr.push(item);
    grouped.set(item.category, arr);
  }

  if (actionItems.length > 0) {
    html += `
      <div style="font-family:var(--label);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-faint);margin-bottom:6px">For you (or your agency) to complete</div>
      <div style="font-size:12px;color:var(--text-faint);margin-bottom:14px">Each item shows whether the scanner can verify completion automatically (auto-verified) or if you need to mark it done yourself (self-reported). Clicking the checkbox does not trigger any work.</div>
    `;
  }

  for (const [cat, catItems] of grouped) {
    const catLabel = CATEGORIES[cat] || cat;
    html += `
      <div style="margin-bottom:20px">
        <div style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);margin-bottom:10px">${esc(catLabel)}</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${catItems.map(renderActionItem).join("")}
        </div>
      </div>
    `;
  }

  return html;
}

/** Add a roadmap item (admin only) */
export async function handleAddRoadmapItem(clientSlug: string, request: Request, user: User, env: Env): Promise<Response> {
  const form = await request.formData();
  const title = (form.get("title") as string || "").trim();
  const description = (form.get("description") as string || "").trim() || null;
  const category = (form.get("category") as string || "custom");
  const sortOrder = parseInt(form.get("sort_order") as string || "0", 10);
  const dueDateStr = (form.get("due_date") as string || "").trim();
  const phaseId = form.get("phase_id") ? parseInt(form.get("phase_id") as string, 10) : null;

  if (!title) return redirect(`/roadmap/${clientSlug}`);

  const now = Math.floor(Date.now() / 1000);
  let dueDate: number | null = null;
  if (dueDateStr) {
    const d = new Date(dueDateStr);
    if (!isNaN(d.getTime())) dueDate = Math.floor(d.getTime() / 1000);
  }

  await env.DB.prepare(
    "INSERT INTO roadmap_items (client_slug, phase_id, title, description, category, status, sort_order, due_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)"
  ).bind(clientSlug, phaseId, title, description, category, sortOrder, dueDate, now, now).run();

  return redirect(`/roadmap/${clientSlug}`);
}

/** Update a roadmap item status or note */
export async function handleUpdateRoadmapItem(clientSlug: string, itemId: number, request: Request, user: User, env: Env): Promise<Response> {
  // Access check: admins see all, agency admins see their agency's clients,
  // clients update only their own slug.
  if (!(await canAccessClient(env, user, clientSlug))) {
    return redirect("/roadmap");
  }

  const form = await request.formData();
  const status = form.get("status") as string | null;
  const clientNote = form.get("client_note") as string | null;
  const now = Math.floor(Date.now() / 1000);

  // Clients can only mark items as "done" or save notes -- not start/block/reopen
  if (user.role === "client") {
    if (status && status !== "done") {
      return redirect(`/roadmap/${clientSlug}`);
    }
  }

  if (status) {
    const completedAt = status === "done" ? now : null;
    // Stamp who completed it so the UI can show provenance: 'admin' for
    // ops actions, 'user' for client + agency_admin actions. Cleared
    // back to NULL when the item is reopened.
    const completedBy = status === "done" ? (user.role === "admin" ? "admin" : "user") : null;
    await env.DB.prepare(
      "UPDATE roadmap_items SET status = ?, completed_at = ?, updated_at = ?, completed_by = ? WHERE id = ? AND client_slug = ?"
    ).bind(status, completedAt, now, completedBy, itemId, clientSlug).run();

    // Check if this completes the phase
    await checkPhaseCompletion(clientSlug, env);
  }

  if (clientNote !== null) {
    const noteValue = clientNote.trim() || null;
    await env.DB.prepare(
      "UPDATE roadmap_items SET client_note = ?, updated_at = ? WHERE id = ? AND client_slug = ?"
    ).bind(noteValue, now, itemId, clientSlug).run();
  }

  return redirect(`/roadmap/${clientSlug}`);
}

/** Add a new phase (admin only) */
export async function handleAddPhase(clientSlug: string, request: Request, user: User, env: Env): Promise<Response> {
  const form = await request.formData();
  const title = (form.get("title") as string || "").trim();
  const subtitle = (form.get("subtitle") as string || "").trim() || null;
  const description = (form.get("description") as string || "").trim() || null;

  if (!title) return redirect(`/roadmap/${clientSlug}`);

  const now = Math.floor(Date.now() / 1000);

  // Get next phase number
  const last = await env.DB.prepare(
    "SELECT MAX(phase_number) as max_num FROM roadmap_phases WHERE client_slug = ?"
  ).bind(clientSlug).first<{ max_num: number | null }>();
  const nextNum = (last?.max_num || 0) + 1;

  await env.DB.prepare(
    "INSERT INTO roadmap_phases (client_slug, phase_number, title, subtitle, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'locked', ?, ?)"
  ).bind(clientSlug, nextNum, title, subtitle, description, now, now).run();

  return redirect(`/roadmap/${clientSlug}`);
}

/** Bulk start all pending items in active phase (admin only) */
export async function handleBulkStartItems(clientSlug: string, user: User, env: Env): Promise<Response> {
  if (user.role !== "admin") return redirect(`/roadmap/${clientSlug}`);

  const activePhase = await env.DB.prepare(
    "SELECT id FROM roadmap_phases WHERE client_slug = ? AND status = 'active' LIMIT 1"
  ).bind(clientSlug).first<{ id: number }>();

  if (activePhase) {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      "UPDATE roadmap_items SET status = 'in_progress', updated_at = ? WHERE client_slug = ? AND phase_id = ? AND status = 'pending'"
    ).bind(now, clientSlug, activePhase.id).run();
  }

  return redirect(`/roadmap/${clientSlug}`);
}

/** Regenerate roadmap from latest scan (admin only) */
export async function handleRegenerateRoadmap(clientSlug: string, user: User, env: Env): Promise<Response> {
  if (user.role !== "admin") return redirect(`/roadmap/${clientSlug}`);

  const result = await regenerateRoadmap(clientSlug, env);
  if (!result) {
    console.log(`Regenerate failed for ${clientSlug}: no scan data found`);
  }

  return redirect(`/roadmap/${clientSlug}`);
}

/** Run the 90-day citation-drift refresh on demand. Adds new roadmap
 *  items based on what's changed in the citation landscape since the
 *  last refresh (or since engagement start). Doesn't touch existing
 *  in-flight items. */
export async function handleRefreshRoadmap(clientSlug: string, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) return redirect("/");
  // Admins + agency_admins can trigger a refresh on behalf of a
  // client. Clients can trigger their own refresh.
  const { runRoadmapRefresh } = await import("../roadmap-refresh");
  const result = await runRoadmapRefresh(clientSlug, env);
  const flash = result.itemsAdded > 0
    ? `Quarterly refresh complete. Added ${result.itemsAdded} new item${result.itemsAdded === 1 ? "" : "s"} based on citation drift.`
    : `Quarterly refresh ran. ${result.reason}`;
  return redirect(`/roadmap/${clientSlug}?flash=${encodeURIComponent(flash)}`);
}
