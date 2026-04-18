/**
 * Dashboard -- Agency admin dashboard
 *
 * Home screen for users with role='agency_admin'. Lists every client
 * domain owned by their agency with the key at-a-glance signal
 * (latest AEO score, plan, client_access mode, status) and quick
 * links to drill into any client's full report.
 *
 * Access: admin (any agency, via ?agency=<slug>), agency_admin (own agency only).
 * Anyone else gets redirected home.
 */

import type { Env, User, Domain, ScanResult, Agency } from "../types";
import { layout, html, esc, redirect, shortDate } from "../render";
import { getAgency, getAgencyBySlug, listAgencyClients, countActiveSlots } from "../agency";

interface ClientRow {
  domain: Domain;
  latestScan: ScanResult | null;
}

function planLabel(plan: string | null): string {
  if (plan === "signal") return "Signal";
  if (plan === "amplify") return "Amplify";
  return "--";
}

function accessLabel(access: string): string {
  if (access === "full") return "Client Portal";
  return "Internal";
}

function scoreCell(scan: ScanResult | null): string {
  if (!scan) return `<span style="color:var(--text-faint)">--</span>`;
  const color =
    scan.grade === "A" || scan.grade === "B" ? "var(--green)" :
    scan.grade === "C" ? "var(--yellow)" :
    "var(--red)";
  return `<span style="color:${color};font-weight:500">${scan.aeo_score}</span>
          <span style="color:var(--text-faint);font-size:11px;margin-left:6px">${esc(scan.grade)}</span>`;
}

function statusPill(status: string): string {
  const cls =
    status === "active" ? "status status-complete" :
    status === "paused" ? "status status-in_progress" :
    "status status-pending";
  return `<span class="${cls}">${esc(status)}</span>`;
}

export async function handleAgencyDashboard(
  user: User,
  env: Env,
  url: URL
): Promise<Response> {
  // Resolve which agency we're viewing. agency_admins always see their
  // own agency. Admins can pass ?agency=<slug> to impersonate any agency
  // for ops work; otherwise they get sent back to ops cockpit.
  let agency: Agency | null = null;
  if (user.role === "agency_admin") {
    if (!user.agency_id) return redirect("/");
    agency = await getAgency(env, user.agency_id);
  } else if (user.role === "admin") {
    const slug = url.searchParams.get("agency");
    if (!slug) return redirect("/admin");
    agency = await getAgencyBySlug(env, slug);
  } else {
    return redirect("/");
  }

  if (!agency) {
    return html(layout("Agency", `<div class="empty"><h3>Agency not found</h3></div>`, user), 404);
  }

  const clients = await listAgencyClients(env, agency.id);
  const slots = await countActiveSlots(env, agency.id);

  // Fetch latest scan per client in one pass, scoped to the agency's
  // own domain IDs so we don't leak anyone else's scan history.
  const domainIds = clients.map((c) => c.id);
  const scansByDomain = new Map<number, ScanResult>();
  if (domainIds.length > 0) {
    const placeholders = domainIds.map(() => "?").join(",");
    const rows = await env.DB.prepare(
      `SELECT s.*
         FROM scan_results s
         INNER JOIN (
           SELECT domain_id, MAX(scanned_at) AS max_ts
             FROM scan_results
            WHERE domain_id IN (${placeholders})
            GROUP BY domain_id
         ) latest ON latest.domain_id = s.domain_id AND latest.max_ts = s.scanned_at`
    ).bind(...domainIds).all<ScanResult>();
    for (const row of rows.results || []) {
      scansByDomain.set(row.domain_id, row);
    }
  }

  const clientRows: ClientRow[] = clients.map((d) => ({
    domain: d,
    latestScan: scansByDomain.get(d.id) || null,
  }));

  const totalActive = clients.filter((c) => c.active === 1).length;
  const totalPaused = clients.filter((c) => c.active === 0).length;

  const clientsTable = clientRows.length === 0
    ? `<div class="empty"><h3>No clients yet</h3><p>Add your first client to get started. Each active client counts as one slot on your agency plan.</p></div>`
    : `
      <table class="data-table">
        <thead>
          <tr>
            <th>Client</th>
            <th>Plan</th>
            <th>Access</th>
            <th>Status</th>
            <th>AEO</th>
            <th>Activated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${clientRows.map(({ domain, latestScan }) => `
            <tr>
              <td>
                <div style="font-weight:500">${esc(domain.client_slug)}</div>
                <div style="color:var(--text-faint);font-size:12px">${esc(domain.domain)}</div>
              </td>
              <td>${esc(planLabel(domain.plan))}</td>
              <td>${esc(accessLabel(domain.client_access))}</td>
              <td>${statusPill(domain.active === 1 ? "active" : "paused")}</td>
              <td>${scoreCell(latestScan)}</td>
              <td style="color:var(--text-faint);font-size:12px">
                ${domain.activated_at ? esc(shortDate(domain.activated_at)) : "--"}
              </td>
              <td style="text-align:right;white-space:nowrap">
                ${domain.active === 1
                  ? `<form method="POST" action="/agency/clients/${domain.id}/pause" style="display:inline;margin:0"
                          onsubmit="return confirm('Pause ${esc(domain.client_slug).replace(/'/g, "\\'")}?\\n\\nThis will reduce your ${esc(planLabel(domain.plan)).replace(/'/g, "\\'")} slot count by 1. Your next invoice will be prorated.');">
                      <button type="submit" class="btn btn-ghost" style="padding:4px 10px;font-size:11px">Pause</button>
                    </form>`
                  : `<form method="POST" action="/agency/clients/${domain.id}/resume" style="display:inline;margin:0"
                          onsubmit="return confirm('Resume ${esc(domain.client_slug).replace(/'/g, "\\'")}?\\n\\nThis will add 1 ${esc(planLabel(domain.plan)).replace(/'/g, "\\'")} slot. Your next invoice will be prorated.');">
                      <button type="submit" class="btn btn-ghost" style="padding:4px 10px;font-size:11px">Resume</button>
                    </form>`}
                <a href="/domain/${domain.id}" class="btn btn-ghost" style="margin-left:6px">Open</a>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

  const adminPreview = user.role === "admin"
    ? `<div class="card" style="border-color:var(--gold-dim);margin-bottom:16px">
         <div style="font-family:var(--label);text-transform:uppercase;letter-spacing:.16em;font-size:11px;color:var(--gold)">Ops view</div>
         Viewing as ops: <strong>${esc(agency.name)}</strong> (${esc(agency.slug)}).
         <a href="/admin" style="margin-left:8px">Back to cockpit</a>
       </div>`
    : "";

  const stat = (label: string, value: string | number) => `
    <div class="card" style="padding:20px;margin-bottom:0">
      <div class="label">${esc(label)}</div>
      <div style="font-family:var(--serif);font-size:32px;margin-top:6px">${value}</div>
    </div>`;

  const flash = url.searchParams.get("flash");
  const flashError = url.searchParams.get("error");
  const flashBlock = flash
    ? `<div class="flash">${esc(flash)}</div>`
    : flashError
    ? `<div class="flash flash-error">${esc(flashError)}</div>`
    : "";

  const body = `
    ${adminPreview}
    ${flashBlock}
    <div class="section-header" style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
      <div>
        <h1>${esc(agency.name)}</h1>
        <p class="section-sub">Agency dashboard. All clients you manage in one view.</p>
      </div>
      <div style="display:flex;gap:8px">
        <a href="/agency/invites" class="btn btn-ghost">Invites</a>
        <a href="/agency/settings" class="btn btn-ghost">Settings</a>
        <a href="/agency/billing" class="btn btn-ghost">Billing</a>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-bottom:24px">
      ${stat("Active clients", totalActive)}
      ${stat("Paused", totalPaused)}
      ${stat("Signal slots", slots.signal)}
      ${stat("Amplify slots", slots.amplify)}
    </div>

    <div class="card">
      <div class="section-header" style="margin-bottom:16px">
        <h2 style="margin:0">Clients</h2>
      </div>
      ${clientsTable}
    </div>
  `;

  return html(layout(agency.name + " -- Agency", body, user));
}
