/**
 * Dashboard — 90-day AEO roadmap tracker
 *
 * Prioritized improvement plan for each client. Admin adds items,
 * both admin and client can see progress. Admin can update status.
 */

import type { Env, User, RoadmapItem } from "../types";
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

export async function handleRoadmap(clientSlug: string, user: User, env: Env): Promise<Response> {
  const items = (await env.DB.prepare(
    "SELECT * FROM roadmap_items WHERE client_slug = ? ORDER BY sort_order, created_at"
  ).bind(clientSlug).all<RoadmapItem>()).results;

  const now = Math.floor(Date.now() / 1000);
  const total = items.length;
  const done = items.filter(i => i.status === "done").length;
  const inProgress = items.filter(i => i.status === "in_progress").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  // Group by category
  const grouped = new Map<string, RoadmapItem[]>();
  for (const item of items) {
    const arr = grouped.get(item.category) || [];
    arr.push(item);
    grouped.set(item.category, arr);
  }

  // Progress bar
  const progressBar = `
    <div style="margin-bottom:48px">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px">
        <div class="label">Progress</div>
        <div style="font-size:13px;color:var(--text-faint)">${done} of ${total} complete (${pct}%)</div>
      </div>
      <div style="height:8px;background:rgba(251,248,239,.06);border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:var(--gold);border-radius:4px;transition:width .3s var(--ease)"></div>
      </div>
      <div style="display:flex;gap:20px;margin-top:12px;font-size:12px">
        <span style="color:var(--green)">${done} done</span>
        <span style="color:var(--yellow)">${inProgress} in progress</span>
        <span style="color:var(--text-faint)">${total - done - inProgress} pending</span>
      </div>
    </div>
  `;

  // Category sections
  let itemSections = "";
  for (const [cat, catItems] of grouped) {
    const catLabel = CATEGORIES[cat] || cat;
    itemSections += `
      <div style="margin-bottom:32px">
        <div class="label" style="margin-bottom:12px">${esc(catLabel)}</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${catItems.map(item => {
            const st = STATUSES[item.status] || STATUSES.pending;
            const dueStr = item.due_date
              ? new Date(item.due_date * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : null;
            const overdue = item.due_date && item.due_date < now && item.status !== "done";

            return `
              <div style="display:flex;align-items:center;gap:16px;padding:14px 20px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;${item.status === 'done' ? 'opacity:.6' : ''}">
                <div style="width:10px;height:10px;border-radius:50%;background:${st.color};flex-shrink:0"></div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:14px;color:var(--text);${item.status === 'done' ? 'text-decoration:line-through;color:var(--text-faint)' : ''}">${esc(item.title)}</div>
                  ${item.description ? `<div style="font-size:12px;color:var(--text-faint);margin-top:4px">${esc(item.description)}</div>` : ''}
                </div>
                <div style="display:flex;align-items:center;gap:12px;flex-shrink:0">
                  ${dueStr ? `<span style="font-size:11px;font-family:var(--label);letter-spacing:.1em;${overdue ? 'color:var(--red)' : 'color:var(--text-faint)'}">${overdue ? 'OVERDUE ' : ''}${dueStr}</span>` : ''}
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

  if (!itemSections) {
    itemSections = `
      <div class="empty" style="padding:40px">
        <h3>No roadmap items yet</h3>
        <p>${user.role === "admin" ? "Add items below to build the 90-day improvement plan." : "Your AEO improvement roadmap is being prepared."}</p>
      </div>
    `;
  }

  // Admin: add item form
  const addForm = user.role === "admin" ? `
    <div class="card" style="margin-top:48px">
      <h3 style="margin-bottom:20px">Add roadmap <em>item</em></h3>
      <form method="POST" action="/roadmap/${clientSlug}/add">
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
            <input type="number" name="sort_order" value="${total + 1}" min="1" style="width:100%;padding:12px 16px;background:var(--bg-edge);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:14px">
          </div>
        </div>
        <button type="submit" class="btn">Add item</button>
      </form>
    </div>
  ` : "";

  const body = `
    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:40px">
      <div>
        <div class="label" style="margin-bottom:8px">
          <a href="/" style="color:var(--text-mute)">Dashboard</a> / ${esc(clientSlug)}
        </div>
        <h1>90-Day <em>Roadmap</em></h1>
      </div>
    </div>

    ${progressBar}
    ${itemSections}
    ${addForm}
  `;

  return html(layout("Roadmap", body, user));
}

/** Add a roadmap item (admin only) */
export async function handleAddRoadmapItem(clientSlug: string, request: Request, user: User, env: Env): Promise<Response> {
  const form = await request.formData();
  const title = (form.get("title") as string || "").trim();
  const description = (form.get("description") as string || "").trim() || null;
  const category = (form.get("category") as string || "custom");
  const sortOrder = parseInt(form.get("sort_order") as string || "0", 10);
  const dueDateStr = (form.get("due_date") as string || "").trim();

  if (!title) return redirect(`/roadmap/${clientSlug}`);

  const now = Math.floor(Date.now() / 1000);
  let dueDate: number | null = null;
  if (dueDateStr) {
    const d = new Date(dueDateStr);
    if (!isNaN(d.getTime())) dueDate = Math.floor(d.getTime() / 1000);
  }

  await env.DB.prepare(
    "INSERT INTO roadmap_items (client_slug, title, description, category, status, sort_order, due_date, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)"
  ).bind(clientSlug, title, description, category, sortOrder, dueDate, now, now).run();

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

  return redirect(`/roadmap/${clientSlug}`);
}
