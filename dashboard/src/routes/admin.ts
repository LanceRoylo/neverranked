/**
 * Dashboard — Admin routes
 */

import type { Env, User, Domain, ScanResult } from "../types";
import { layout, html, redirect, esc } from "../render";
import { scanDomain } from "../scanner";
import { scanDomainPages } from "../pages";
import { checkAndAlertRegression } from "../regression";

/** Admin overview: list all clients and domains */
export async function handleAdminHome(user: User, env: Env): Promise<Response> {
  const domains = (await env.DB.prepare(
    "SELECT * FROM domains WHERE active = 1 ORDER BY client_slug, is_competitor, domain"
  ).all<Domain>()).results;

  const users = (await env.DB.prepare(
    "SELECT * FROM users ORDER BY role DESC, email"
  ).all<User>()).results;

  // Pending competitor suggestions
  const suggestions = (await env.DB.prepare(
    "SELECT cs.*, u.email as suggested_by_email FROM competitor_suggestions cs JOIN users u ON cs.suggested_by = u.id WHERE cs.status = 'pending' ORDER BY cs.created_at DESC"
  ).all<{ id: number; client_slug: string; domain: string; label: string | null; suggested_by_email: string; created_at: number }>()).results;

  // Group domains by client_slug
  const clientMap = new Map<string, Domain[]>();
  for (const d of domains) {
    const arr = clientMap.get(d.client_slug) || [];
    arr.push(d);
    clientMap.set(d.client_slug, arr);
  }

  let clientSections = "";
  for (const [slug, doms] of clientMap) {
    const primary = doms.filter(d => !d.is_competitor);
    const competitors = doms.filter(d => d.is_competitor);

    clientSections += `
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <h3 style="font-style:italic">${esc(slug)}</h3>
        </div>
        <div class="label" style="margin-bottom:8px">Domains</div>
        ${primary.map(d => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)">
            <span style="font-size:13px">${esc(d.domain)}</span>
            <div style="display:flex;gap:8px">
              <form method="POST" action="/admin/scan/${d.id}" style="display:inline">
                <button type="submit" class="btn" style="padding:6px 12px;font-size:9px">Scan</button>
              </form>
            </div>
          </div>
        `).join('')}
        ${competitors.length > 0 ? `
          <div class="label" style="margin-top:16px;margin-bottom:8px">Competitors</div>
          ${competitors.map(d => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)">
              <span style="font-size:13px;color:var(--text-faint)">${esc(d.domain)}${d.competitor_label ? ` <span style="color:var(--text-mute);font-size:11px">(${esc(d.competitor_label)})</span>` : ''}</span>
              <form method="POST" action="/admin/scan/${d.id}" style="display:inline">
                <button type="submit" class="btn btn-ghost" style="padding:6px 12px;font-size:9px">Scan</button>
              </form>
            </div>
          `).join('')}
        ` : ''}
      </div>
    `;
  }

  if (!clientSections) {
    clientSections = `<div class="empty"><h3>No clients yet</h3><p>Add your first client below.</p></div>`;
  }

  const body = `
    <div style="margin-bottom:40px">
      <div class="label" style="margin-bottom:8px">Admin</div>
      <h1>Manage <em>clients</em></h1>
    </div>

    ${clientSections}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:48px">
      <div class="card">
        <h3 style="margin-bottom:20px">Add <em>domain</em></h3>
        <form method="POST" action="/admin/domain">
          <div class="form-group">
            <label>Client slug</label>
            <input type="text" name="client_slug" required placeholder="montaic">
          </div>
          <div class="form-group">
            <label>Domain</label>
            <input type="text" name="domain" required placeholder="montaic.com">
          </div>
          <div class="form-group">
            <label>Type</label>
            <select name="is_competitor" style="width:100%;max-width:400px;padding:12px 16px;background:var(--bg-edge);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:14px">
              <option value="0">Client domain</option>
              <option value="1">Competitor</option>
            </select>
          </div>
          <div class="form-group">
            <label>Competitor label (optional)</label>
            <input type="text" name="competitor_label" placeholder="Main competitor">
          </div>
          <button type="submit" class="btn">Add domain</button>
        </form>
      </div>

      <div class="card">
        <h3 style="margin-bottom:20px">Add <em>user</em></h3>
        <form method="POST" action="/admin/users">
          <div class="form-group">
            <label>Email</label>
            <input type="email" name="email" required placeholder="client@company.com">
          </div>
          <div class="form-group">
            <label>Name</label>
            <input type="text" name="name" placeholder="Jane Smith">
          </div>
          <div class="form-group">
            <label>Client slug</label>
            <input type="text" name="client_slug" placeholder="montaic">
          </div>
          <div class="form-group">
            <label>Role</label>
            <select name="role" style="width:100%;max-width:400px;padding:12px 16px;background:var(--bg-edge);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:14px">
              <option value="client">Client</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button type="submit" class="btn">Add user</button>
        </form>
      </div>
    </div>

    ${suggestions.length > 0 ? `
    <div class="card" style="margin-top:24px;border:1px solid var(--gold-dim)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h3>Competitor <em>suggestions</em></h3>
        <span style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);background:var(--gold-wash);padding:4px 10px;border-radius:2px">${suggestions.length} pending</span>
      </div>
      <table class="data-table">
        <thead><tr><th>Client</th><th>Domain</th><th>Label</th><th>Suggested by</th><th>Actions</th></tr></thead>
        <tbody>
          ${suggestions.map(s => `
            <tr>
              <td>${esc(s.client_slug)}</td>
              <td style="font-weight:400">${esc(s.domain)}</td>
              <td style="color:var(--text-faint)">${s.label ? esc(s.label) : '-'}</td>
              <td style="color:var(--text-faint);font-size:12px">${esc(s.suggested_by_email)}</td>
              <td>
                <div style="display:flex;gap:6px">
                  <form method="POST" action="/admin/suggestion/${s.id}/approve" style="display:inline">
                    <button type="submit" class="btn" style="padding:6px 12px;font-size:9px">Approve</button>
                  </form>
                  <form method="POST" action="/admin/suggestion/${s.id}/dismiss" style="display:inline">
                    <button type="submit" class="btn btn-ghost" style="padding:6px 12px;font-size:9px">Dismiss</button>
                  </form>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <div class="card" style="margin-top:24px">
      <h3 style="margin-bottom:16px">Users</h3>
      <table class="data-table">
        <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Client</th><th>Last login</th></tr></thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td>${esc(u.email)}</td>
              <td>${u.name ? esc(u.name) : '<span style="color:var(--text-faint)">-</span>'}</td>
              <td><span class="status status-${u.role === 'admin' ? 'in_progress' : 'pending'}">${u.role}</span></td>
              <td>${u.client_slug ? esc(u.client_slug) : '<span style="color:var(--text-faint)">-</span>'}</td>
              <td style="color:var(--text-faint)">${u.last_login_at ? new Date(u.last_login_at * 1000).toLocaleDateString() : 'Never'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  return html(layout("Admin", body, user));
}

/** Add a domain */
export async function handleAddDomain(request: Request, user: User, env: Env): Promise<Response> {
  const form = await request.formData();
  const clientSlug = (form.get("client_slug") as string || "").trim().toLowerCase();
  const domain = (form.get("domain") as string || "").trim().toLowerCase();
  const isCompetitor = (form.get("is_competitor") as string) === "1" ? 1 : 0;
  const competitorLabel = (form.get("competitor_label") as string || "").trim() || null;

  if (!clientSlug || !domain) {
    return redirect("/admin");
  }

  const now = Math.floor(Date.now() / 1000);
  try {
    await env.DB.prepare(
      "INSERT INTO domains (client_slug, domain, is_competitor, competitor_label, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)"
    ).bind(clientSlug, domain, isCompetitor, competitorLabel, now, now).run();
  } catch {
    // Likely unique constraint violation
  }

  return redirect("/admin");
}

/** Add a user */
export async function handleAddUser(request: Request, user: User, env: Env): Promise<Response> {
  const form = await request.formData();
  const email = (form.get("email") as string || "").trim().toLowerCase();
  const name = (form.get("name") as string || "").trim() || null;
  const clientSlug = (form.get("client_slug") as string || "").trim().toLowerCase() || null;
  const role = (form.get("role") as string || "client");

  if (!email) {
    return redirect("/admin");
  }

  const now = Math.floor(Date.now() / 1000);
  try {
    await env.DB.prepare(
      "INSERT INTO users (email, name, role, client_slug, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(email, name, role, clientSlug, now).run();
  } catch {
    // Likely duplicate email
  }

  return redirect("/admin");
}

/** Trigger a manual scan */
export async function handleManualScan(domainId: number, user: User, env: Env): Promise<Response> {
  const domain = await env.DB.prepare(
    "SELECT * FROM domains WHERE id = ? AND active = 1"
  ).bind(domainId).first<Domain>();

  if (!domain) {
    return redirect("/admin");
  }

  const url = `https://${domain.domain}/`;
  await scanDomain(domain.id, url, "manual", env);

  // Also scan individual pages for schema coverage matrix
  await scanDomainPages(domain.id, domain.domain, env);

  // Check for regression and alert if needed
  await checkAndAlertRegression(domain, env);

  // Redirect to domain detail if coming from there, otherwise admin
  return redirect(`/domain/${domain.id}`);
}

/** Approve a competitor suggestion -- adds it as a competitor domain and triggers a scan */
export async function handleApproveSuggestion(suggestionId: number, user: User, env: Env): Promise<Response> {
  const suggestion = await env.DB.prepare(
    "SELECT * FROM competitor_suggestions WHERE id = ? AND status = 'pending'"
  ).bind(suggestionId).first<{ id: number; client_slug: string; domain: string; label: string | null }>();

  if (!suggestion) return redirect("/admin");

  const now = Math.floor(Date.now() / 1000);

  // Add as competitor domain
  try {
    await env.DB.prepare(
      "INSERT INTO domains (client_slug, domain, is_competitor, competitor_label, active, created_at, updated_at) VALUES (?, ?, 1, ?, 1, ?, ?)"
    ).bind(suggestion.client_slug, suggestion.domain, suggestion.label, now, now).run();
  } catch {
    // Likely duplicate
  }

  // Mark suggestion as approved
  await env.DB.prepare(
    "UPDATE competitor_suggestions SET status = 'approved' WHERE id = ?"
  ).bind(suggestionId).run();

  // Trigger initial scan of the new competitor
  const newDomain = await env.DB.prepare(
    "SELECT * FROM domains WHERE domain = ? AND client_slug = ? AND is_competitor = 1"
  ).bind(suggestion.domain, suggestion.client_slug).first<Domain>();

  if (newDomain) {
    const url = `https://${newDomain.domain}/`;
    await scanDomain(newDomain.id, url, "onboard", env);
  }

  return redirect("/admin");
}

/** Dismiss a competitor suggestion */
export async function handleDismissSuggestion(suggestionId: number, user: User, env: Env): Promise<Response> {
  await env.DB.prepare(
    "UPDATE competitor_suggestions SET status = 'rejected' WHERE id = ? AND status = 'pending'"
  ).bind(suggestionId).run();

  return redirect("/admin");
}
