/**
 * Dashboard -- Phased AEO roadmap tracker
 *
 * Each client has multiple phases (Foundation, Growth, Dominance, etc).
 * When all items in a phase are done, the phase completes and the next unlocks.
 * AEO is a moving target -- there is always a next phase.
 */

import type { Env, User, RoadmapItem, RoadmapPhase } from "../types";
import { layout, html, redirect, esc } from "../render";

const CATEGORIES: Record<string, string> = {
  schema: "Schema Markup",
  content: "Content",
  technical: "Technical SEO",
  authority: "Authority",
  custom: "Custom",
};

const STATUSES: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "var(--text-faint)" },
  in_progress: { label: "In Progress", color: "var(--yellow)" },
  done: { label: "Done", color: "var(--green)" },
  blocked: { label: "Blocked", color: "var(--red)" },
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
async function checkPhaseCompletion(clientSlug: string, env: Env): Promise<void> {
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
}

export async function handleRoadmap(clientSlug: string, user: User, env: Env): Promise<Response> {
  // Access check: client can only see their own slug
  if (user.role === "client" && user.client_slug !== clientSlug) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }

  const phases = await ensurePhases(clientSlug, env);

  // Check for auto-completion
  await checkPhaseCompletion(clientSlug, env);

  // Re-fetch after potential completion
  const updatedPhases = (await env.DB.prepare(
    "SELECT * FROM roadmap_phases WHERE client_slug = ? ORDER BY phase_number"
  ).bind(clientSlug).all<RoadmapPhase>()).results;

  // Get all items grouped by phase
  const allItems = (await env.DB.prepare(
    "SELECT * FROM roadmap_items WHERE client_slug = ? ORDER BY sort_order, created_at"
  ).bind(clientSlug).all<RoadmapItem>()).results;

  const now = Math.floor(Date.now() / 1000);

  // Overall progress across all phases
  const totalItems = allItems.length;
  const totalDone = allItems.filter(i => i.status === "done").length;
  const completedPhases = updatedPhases.filter(p => p.status === "completed").length;

  // Build the phase journey indicator
  const journeyHtml = buildPhaseJourney(updatedPhases);

  // Build each phase section
  let phaseSections = "";
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
        <div class="card" style="margin-bottom:16px;opacity:.7">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:16px">
              <div style="width:32px;height:32px;border-radius:50%;background:var(--green);display:flex;align-items:center;justify-content:center;font-size:14px;color:#080808;flex-shrink:0">&#10003;</div>
              <div>
                <div style="font-family:var(--serif);font-size:18px;font-style:italic;color:var(--text)">Phase ${phase.phase_number}: ${esc(phase.title)}</div>
                ${phase.subtitle ? `<div style="font-size:12px;color:var(--text-faint);margin-top:2px">${esc(phase.subtitle)}</div>` : ""}
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--green)">Completed</div>
              ${completedDate ? `<div style="font-size:11px;color:var(--text-faint);margin-top:2px">${completedDate}</div>` : ""}
              <div style="font-size:12px;color:var(--text-faint);margin-top:2px">${phaseDone} items delivered</div>
            </div>
          </div>
        </div>
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

          ${buildItemList(phaseItems, clientSlug, user, now)}
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

  // Admin: add item form (scoped to active phase)
  const activePhase = updatedPhases.find(p => p.status === "active");
  const addForm = user.role === "admin" ? `
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
      <div style="text-align:right">
        <div style="font-size:12px;color:var(--text-faint)">${completedPhases} of ${updatedPhases.length} phases complete</div>
        <div style="font-size:12px;color:var(--text-faint);margin-top:2px">${totalDone} of ${totalItems} items delivered</div>
      </div>
    </div>

    <!-- Context -->
    <div class="narrative-context" style="margin-bottom:32px">
      ${buildRoadmapNarrative(totalItems, totalDone, completedPhases, updatedPhases.length, allItems)}
    </div>

    ${journeyHtml}
    ${phaseSections}
    ${movingTargetCallout}
    ${addForm}
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
function buildItemList(items: RoadmapItem[], clientSlug: string, user: User, now: number): string {
  if (items.length === 0) {
    return `
      <div class="empty" style="padding:24px">
        <p style="color:var(--text-faint)">${user.role === "admin" ? "Add items below to build this phase." : "Items for this phase are being prepared."}</p>
      </div>
    `;
  }

  const grouped = new Map<string, RoadmapItem[]>();
  for (const item of items) {
    const arr = grouped.get(item.category) || [];
    arr.push(item);
    grouped.set(item.category, arr);
  }

  let sections = "";
  for (const [cat, catItems] of grouped) {
    const catLabel = CATEGORIES[cat] || cat;
    sections += `
      <div style="margin-bottom:20px">
        <div style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);margin-bottom:10px">${esc(catLabel)}</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${catItems.map(item => {
            const st = STATUSES[item.status] || STATUSES.pending;
            const dueStr = item.due_date
              ? new Date(item.due_date * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : null;
            const overdue = item.due_date && item.due_date < now && item.status !== "done";

            return `
              <div style="display:flex;align-items:center;gap:14px;padding:12px 16px;background:var(--bg-edge);border-radius:4px;${item.status === 'done' ? 'opacity:.6' : ''}">
                <div style="width:10px;height:10px;border-radius:50%;background:${st.color};flex-shrink:0"></div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:13px;color:var(--text);${item.status === 'done' ? 'text-decoration:line-through;color:var(--text-faint)' : ''}">${esc(item.title)}</div>
                  ${item.description ? `<div style="font-size:11px;color:var(--text-faint);margin-top:3px">${esc(item.description)}</div>` : ''}
                </div>
                <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
                  ${dueStr ? `<span style="font-size:10px;font-family:var(--label);letter-spacing:.1em;${overdue ? 'color:var(--red)' : 'color:var(--text-faint)'}">${overdue ? 'OVERDUE ' : ''}${dueStr}</span>` : ''}
                  ${user.role === "admin" ? `
                    <form method="POST" action="/roadmap/${clientSlug}/update/${item.id}" style="display:flex;gap:4px">
                      ${item.status !== "done" ? `<button type="submit" name="status" value="done" class="btn btn-ghost" style="padding:4px 8px;font-size:9px" title="Mark done">Done</button>` : ''}
                      ${item.status === "pending" ? `<button type="submit" name="status" value="in_progress" class="btn btn-ghost" style="padding:4px 8px;font-size:9px" title="Start">Start</button>` : ''}
                      ${item.status === "in_progress" ? `<button type="submit" name="status" value="blocked" class="btn btn-ghost" style="padding:4px 8px;font-size:9px;color:var(--red)" title="Block">Block</button>` : ''}
                      ${item.status === "done" ? `<button type="submit" name="status" value="pending" class="btn btn-ghost" style="padding:4px 8px;font-size:9px" title="Reopen">Reopen</button>` : ''}
                    </form>
                  ` : `
                    <span class="status status-${item.status === 'in_progress' ? 'in_progress' : item.status === 'done' ? 'done' : 'pending'}" style="font-size:9px">${st.label}</span>
                  `}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  return sections;
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

/** Update a roadmap item status (admin only) */
export async function handleUpdateRoadmapItem(clientSlug: string, itemId: number, request: Request, user: User, env: Env): Promise<Response> {
  const form = await request.formData();
  const status = (form.get("status") as string || "pending");
  const now = Math.floor(Date.now() / 1000);

  const completedAt = status === "done" ? now : null;

  await env.DB.prepare(
    "UPDATE roadmap_items SET status = ?, completed_at = ?, updated_at = ? WHERE id = ? AND client_slug = ?"
  ).bind(status, completedAt, now, itemId, clientSlug).run();

  // Check if this completes the phase
  await checkPhaseCompletion(clientSlug, env);

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
