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

/**
 * Render a snippet install status pill for one client domain.
 * Sources of truth on the domains row:
 *   snippet_email_sent_at      -> we sent the install instructions
 *   snippet_last_checked_at    -> last cron probe
 *   snippet_last_detected_at   -> first time we saw the snippet live
 *   snippet_nudge_day7_at      -> day-7 nudge fired
 *   snippet_nudge_day14_at     -> day-14 nudge fired
 */
function snippetStatusPill(d: Domain): string {
  const now = Math.floor(Date.now() / 1000);
  const DAY = 86400;

  if (d.snippet_last_detected_at) {
    return `<span class="status status-complete" title="Snippet detected on the homepage. Daily drift checks are on.">Installed</span>`;
  }
  if (!d.snippet_email_sent_at) {
    return `<span class="status status-pending" title="Install instructions have not been sent yet.">Not delivered</span>`;
  }
  const ageDays = Math.floor((now - d.snippet_email_sent_at) / DAY);
  if (ageDays >= 30) {
    return `<span class="status" style="background:#3a1f1f;color:#ef9999;border-color:#7a3f3f" title="No install detected after 30+ days. Ops has been alerted.">Stalled (${ageDays}d)</span>`;
  }
  if (ageDays >= 14) {
    return `<span class="status status-in_progress" title="Two nudges sent. Concierge install offered.">Nudged (${ageDays}d)</span>`;
  }
  if (ageDays >= 7) {
    return `<span class="status status-in_progress" title="First nudge sent. Probing daily.">Nudged (${ageDays}d)</span>`;
  }
  return `<span class="status status-pending" title="Email delivered. We re-check daily for ~7 days before the first nudge.">Pending (${ageDays}d)</span>`;
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
            <th>Snippet</th>
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
              <td>${snippetStatusPill(domain)}</td>
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

  // First-run checklist. Shown until all required steps are done. The
  // checks read live from the database; once each is complete the row
  // disappears, and once everything is done the whole card vanishes
  // automatically -- no dismiss state to track.
  const hasInvitedTeammate = !!(await env.DB.prepare(
    "SELECT 1 FROM agency_invites WHERE agency_id = ? AND role = 'agency_admin' LIMIT 1"
  ).bind(agency.id).first());
  const hasInvitedClient = !!(await env.DB.prepare(
    "SELECT 1 FROM agency_invites WHERE agency_id = ? AND role = 'client' LIMIT 1"
  ).bind(agency.id).first());
  const hasBranding = !!(agency.logo_url || (agency.primary_color && agency.primary_color !== "#c9a84c"));
  const hasBilling = agency.status === "active" && !!agency.stripe_subscription_id;
  const hasClient = clients.length > 0;
  const hasTeamOrClient = hasInvitedTeammate || hasInvitedClient;

  const checklistSteps: { label: string; done: boolean; href: string; cta: string }[] = [
    { label: "Set your branding (logo + color)", done: hasBranding, href: "/agency/settings", cta: "Open settings" },
    { label: "Activate your subscription", done: hasBilling, href: "/agency/billing", cta: "Activate billing" },
    { label: "Add your first client", done: hasClient, href: "mailto:hello@neverranked.com?subject=Add+a+client", cta: "Email ops to add" },
    { label: "Invite a teammate or client", done: hasTeamOrClient, href: "/agency/invites", cta: "Send invites" },
  ];
  const stepsDone = checklistSteps.filter((s) => s.done).length;
  const stepsTotal = checklistSteps.length;
  const checklistBlock = stepsDone < stepsTotal && user.role === "agency_admin"
    ? `
      <div class="card" style="margin-bottom:24px;border-color:var(--gold-dim)">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px">
          <h3 style="margin:0">Get set up</h3>
          <span class="label" style="font-size:11px">${stepsDone} of ${stepsTotal} done</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${checklistSteps.map((s) => `
            <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--line)">
              <span style="font-family:var(--mono);width:18px;color:${s.done ? 'var(--green)' : 'var(--text-faint)'}">
                ${s.done ? '&check;' : '&middot;'}
              </span>
              <span style="flex:1;${s.done ? 'color:var(--text-faint);text-decoration:line-through' : ''}">${esc(s.label)}</span>
              ${s.done ? '' : `<a href="${esc(s.href)}" class="btn btn-ghost" style="padding:4px 10px;font-size:11px">${esc(s.cta)}</a>`}
            </div>
          `).join("")}
        </div>
      </div>
    `
    : "";

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
    ${checklistBlock}
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
