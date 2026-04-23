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
import { snippetTag } from "../agency-emails";
import { getAgencyChecklist, renderChecklistCard, shouldShowChecklist } from "../getting-started";
import { renderImpactStrip } from "../impact-strip";

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
 *
 * driftedAt is sourced separately from admin_alerts (type='snippet_drift')
 * because there's no snippet_drift_at column on domains.
 */
function snippetStatusPill(d: Domain, driftedAt?: number | null): string {
  const now = Math.floor(Date.now() / 1000);
  const DAY = 86400;

  // Drift is a special case: the snippet WAS live (snippet_last_detected_at
  // is set) but a recent probe failed to find it. Surfaced ahead of the
  // "Installed" branch so the agency sees the regression.
  if (driftedAt && d.snippet_last_detected_at) {
    const driftDays = Math.max(0, Math.floor((now - driftedAt) / DAY));
    return `<span class="status" style="background:#3a1f1f;color:#ef9999;border-color:#7a3f3f" title="Snippet was previously live but a recent probe didn't find it. The agency contact has been emailed.">Drifted (${driftDays}d)</span>`;
  }
  if (d.snippet_last_detected_at) {
    const days = Math.floor((now - d.snippet_last_detected_at) / DAY);
    const ageLabel = days < 1 ? "today"
      : days === 1 ? "1d ago"
      : `${days}d ago`;
    return `<span class="status status-complete" title="Snippet first detected ${ageLabel}. Daily drift checks are on.">Installed</span>`;
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

  // Drift alerts: most-recent snippet_drift admin_alert per client_slug
  // in the last 30 days. We then filter out any drift alert where the
  // domain's snippet_last_detected_at is AFTER the alert (meaning the
  // snippet has been re-detected since the drift fired -- the issue is
  // resolved). Without this filter, the dashboard would keep showing
  // "Drifted" for up to 30 days even after the snippet is back.
  const driftBySlug = new Map<string, number>();
  if (clients.length > 0) {
    const slugs = Array.from(new Set(clients.map((c) => c.client_slug)));
    const placeholders = slugs.map(() => "?").join(",");
    const cutoff = Math.floor(Date.now() / 1000) - 30 * 86400;
    const driftRows = await env.DB.prepare(
      `SELECT client_slug, MAX(created_at) AS ts
         FROM admin_alerts
        WHERE type = 'snippet_drift' AND client_slug IN (${placeholders}) AND created_at > ?
        GROUP BY client_slug`
    ).bind(...slugs, cutoff).all<{ client_slug: string; ts: number }>();
    const lastDetectedBySlug = new Map<string, number>();
    for (const c of clients) {
      if (c.snippet_last_detected_at) lastDetectedBySlug.set(c.client_slug, c.snippet_last_detected_at);
    }
    for (const r of driftRows.results || []) {
      const lastDetected = lastDetectedBySlug.get(r.client_slug);
      // Drift is resolved if the snippet has been seen live AFTER the
      // drift alert fired.
      if (lastDetected && lastDetected > r.ts) continue;
      driftBySlug.set(r.client_slug, r.ts);
    }
  }

  // Last-login per Mode-2 client. We pull the most recent login among
  // any client-role users bound to this client_slug. Mode 1 (internal)
  // has no client users so the map stays empty for those slugs.
  const lastLoginBySlug = new Map<string, number>();
  if (clients.length > 0) {
    const slugs = clients.filter((c) => c.client_access === "full").map((c) => c.client_slug);
    if (slugs.length > 0) {
      const placeholders = slugs.map(() => "?").join(",");
      const loginRows = await env.DB.prepare(
        `SELECT client_slug, MAX(last_login_at) AS ts
           FROM users
          WHERE role = 'client' AND client_slug IN (${placeholders}) AND last_login_at IS NOT NULL
          GROUP BY client_slug`
      ).bind(...slugs).all<{ client_slug: string; ts: number }>();
      for (const r of loginRows.results || []) {
        if (r.ts) lastLoginBySlug.set(r.client_slug, r.ts);
      }
    }
  }

  const clientRows: ClientRow[] = clients.map((d) => ({
    domain: d,
    latestScan: scansByDomain.get(d.id) || null,
  }));

  const totalActive = clients.filter((c) => c.active === 1).length;
  const totalPaused = clients.filter((c) => c.active === 0).length;

  // Roster-wide content-pipeline rollup. Aggregates outcomes across
  // every scheduled_drafts row whose client_slug belongs to this
  // agency so the agency admin sees "what is my roster producing?"
  // in one place instead of clicking into each client's calendar.
  const rosterSlugs = clients.map(c => c.client_slug);
  let rosterPublished = 0;
  let rosterCitationsEarned = 0;
  let rosterDraftsInReview = 0;
  if (rosterSlugs.length > 0) {
    const placeholders = rosterSlugs.map(() => "?").join(",");
    const published = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(earned_citations_count), 0) AS earned
         FROM scheduled_drafts
         WHERE status = 'published' AND client_slug IN (${placeholders})`,
    ).bind(...rosterSlugs).first<{ cnt: number; earned: number }>();
    rosterPublished = published?.cnt || 0;
    rosterCitationsEarned = published?.earned || 0;
    const inReview = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM content_drafts
         WHERE status = 'in_review' AND client_slug IN (${placeholders})`,
    ).bind(...rosterSlugs).first<{ cnt: number }>();
    rosterDraftsInReview = inReview?.cnt || 0;
  }

  const clientsTable = clientRows.length === 0
    ? `<div class="empty">
         <h3>No clients yet</h3>
         <p>Add your first client to get started. Each active client counts as one slot on your agency plan.</p>
         ${user.role === "agency_admin" ? `<p style="margin-top:18px"><a href="/agency/clients/new" class="btn">Add a client</a></p>` : ""}
       </div>`
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
            <th>Last login</th>
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
              <td style="white-space:nowrap">
                ${snippetStatusPill(domain, driftBySlug.get(domain.client_slug))}
                <button type="button" class="btn btn-ghost copy-snippet-btn"
                        data-snippet="${esc(snippetTag(domain.client_slug))}"
                        style="padding:2px 8px;font-size:10px;margin-left:6px"
                        title="Copy the install snippet for ${esc(domain.domain)}">Copy</button>
                <a href="/install?slug=${esc(domain.client_slug)}" target="_blank" rel="noopener"
                   class="btn btn-ghost"
                   style="padding:2px 8px;font-size:10px;margin-left:4px"
                   title="Open install guides (WordPress, Shopify, etc.) with the snippet pre-filled. Forwardable to your client.">Guide</a>
                ${!domain.snippet_last_detected_at && domain.snippet_email_sent_at ? `
                  <form method="POST" action="/agency/clients/${domain.id}/resend-snippet" style="display:inline;margin:0;margin-left:6px"
                        onsubmit="return confirm('Resend snippet install email to your contact email?');">
                    <button type="submit" class="btn btn-ghost" style="padding:2px 8px;font-size:10px"
                            title="Re-send the install instructions to your agency contact email and reset the nudge timer">Resend</button>
                  </form>
                ` : ""}
              </td>
              <td>${scoreCell(latestScan)}</td>
              <td style="color:var(--text-faint);font-size:12px;white-space:nowrap">
                ${(() => {
                  if (domain.client_access !== "full") return `<span title="Mode 1 (internal): clients don't log in">--</span>`;
                  const ts = lastLoginBySlug.get(domain.client_slug);
                  if (!ts) return `<span title="No client has logged in yet">never</span>`;
                  const diff = Math.floor(Date.now() / 1000) - ts;
                  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
                  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
                  return `${Math.floor(diff/86400)}d ago`;
                })()}
              </td>
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

  // Recent activity: interleave slot events + invite events from the
  // last 30 days, newest first, capped at 10 entries. Useful for
  // "what changed lately?" without diving into the DB. The two queries
  // are cheap (indexed on agency_id + created_at) so we run them
  // in parallel and merge in JS.
  const ACTIVITY_LIMIT = 10;
  const activitySinceTs = Math.floor(Date.now() / 1000) - 30 * 86400;
  type ActivityRow = { ts: number; html: string };
  const activityRows: ActivityRow[] = [];

  const slotEvents = (await env.DB.prepare(
    `SELECT s.event_type, s.plan, s.quantity_before, s.quantity_after, s.created_at,
            d.client_slug, d.domain
       FROM agency_slot_events s
       LEFT JOIN domains d ON d.id = s.domain_id
      WHERE s.agency_id = ? AND s.created_at > ?
      ORDER BY s.created_at DESC
      LIMIT ?`
  ).bind(agency.id, activitySinceTs, ACTIVITY_LIMIT).all<{
    event_type: string;
    plan: string;
    quantity_before: number | null;
    quantity_after: number | null;
    created_at: number;
    client_slug: string | null;
    domain: string | null;
  }>()).results;

  for (const e of slotEvents) {
    const verb = e.event_type === "paused" ? "Paused"
      : e.event_type === "resumed" ? "Resumed"
      : e.event_type === "activated" ? "Activated"
      : e.event_type === "removed" ? "Removed"
      : e.event_type;
    const target = e.client_slug ? esc(e.client_slug) : "client";
    const slotChange = e.quantity_before !== null && e.quantity_after !== null
      ? ` &middot; ${esc(planLabel(e.plan))} slots ${e.quantity_before} &rarr; ${e.quantity_after}`
      : "";
    activityRows.push({
      ts: e.created_at,
      html: `<strong>${verb}</strong> ${target}<span class="muted">${slotChange}</span>`,
    });
  }

  const inviteEvents = (await env.DB.prepare(
    `SELECT email, role, client_slug, used_at, created_at
       FROM agency_invites
      WHERE agency_id = ? AND created_at > ?
      ORDER BY created_at DESC
      LIMIT ?`
  ).bind(agency.id, activitySinceTs, ACTIVITY_LIMIT).all<{
    email: string;
    role: string;
    client_slug: string | null;
    used_at: number | null;
    created_at: number;
  }>()).results;

  for (const i of inviteEvents) {
    const target = i.role === "client"
      ? `${esc(i.email)} <span class="muted">to ${esc(i.client_slug || "?")}</span>`
      : `${esc(i.email)} <span class="muted">as teammate</span>`;
    activityRows.push({
      ts: i.created_at,
      html: `<strong>Invited</strong> ${target}`,
    });
    if (i.used_at) {
      activityRows.push({
        ts: i.used_at,
        html: `<strong>Accepted</strong> ${esc(i.email)}`,
      });
    }
  }

  activityRows.sort((a, b) => b.ts - a.ts);
  const activitySection = activityRows.length === 0 ? "" : `
    <div class="card" style="margin-top:24px">
      <div class="section-header" style="margin-bottom:12px">
        <h2 style="margin:0">Recent activity</h2>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${activityRows.slice(0, ACTIVITY_LIMIT).map(r => {
          const ago = (() => {
            const diff = Math.floor(Date.now() / 1000) - r.ts;
            if (diff < 60) return "just now";
            if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
            if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
            return `${Math.floor(diff / 86400)}d ago`;
          })();
          return `
            <div style="display:flex;justify-content:space-between;gap:16px;padding:6px 0;border-bottom:1px solid var(--line);font-size:13px">
              <span>${r.html}</span>
              <span class="muted" style="white-space:nowrap;font-size:12px">${ago}</span>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;

  // Getting Started checklist -- unified with the client Dashboard
  // card. Auto-completes from live DB state; respects per-user
  // dismissal (user.checklist_dismissed_at). Only shown for agency
  // admins viewing their own agency home.
  let checklistBlock = "";
  if (user.role === "agency_admin") {
    const steps = await getAgencyChecklist(user, env);
    if (shouldShowChecklist(user, steps)) {
      checklistBlock = renderChecklistCard(steps);
    }
  }

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
        <p class="section-sub">
          Agency dashboard. All clients you manage in one view.
          ${agency.contact_email ? `<br><span class="muted" style="font-size:12px">Contact email: <strong>${esc(agency.contact_email)}</strong> &middot; snippet emails and invoices land here.</span>` : ""}
        </p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${user.role === "agency_admin" ? `<a href="/agency/clients/new" class="btn">Add a client</a>` : ""}
        <a href="/agency/clients.csv" class="btn btn-ghost" title="Download client list as CSV">CSV</a>
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

    ${rosterPublished > 0 || rosterDraftsInReview > 0 ? renderImpactStrip([
      { value: rosterPublished, label: "pieces shipped across roster" },
      { value: rosterCitationsEarned, label: "citations earned", accent: rosterCitationsEarned > 0 ? "var(--green)" : "var(--text)" },
      { value: rosterDraftsInReview, label: "drafts awaiting review", accent: rosterDraftsInReview > 0 ? "var(--gold)" : "var(--text)" },
      { value: slots.amplify, label: "active Amplify clients" },
    ], { eyebrow: "Roster impact" }) : ""}

    <div class="card">
      <div class="section-header" style="margin-bottom:16px">
        <h2 style="margin:0">Clients</h2>
      </div>
      ${clientsTable}
    </div>
    ${activitySection}

    <script>
      // Copy the install snippet for one client to the clipboard.
      // Same pattern as the invite-link copy: clipboard API with
      // textarea fallback for older browsers.
      document.querySelectorAll('.copy-snippet-btn').forEach(function(btn){
        btn.addEventListener('click', function(){
          var snippet = btn.getAttribute('data-snippet');
          if (!snippet) return;
          var done = function(){
            var orig = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(function(){ btn.textContent = orig; }, 1500);
          };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(snippet).then(done).catch(function(){
              window.prompt('Copy this snippet:', snippet);
            });
          } else {
            var ta = document.createElement('textarea');
            ta.value = snippet;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); done(); } catch(e) {
              window.prompt('Copy this snippet:', snippet);
            }
            document.body.removeChild(ta);
          }
        });
      });
    </script>
  `;

  return html(layout(agency.name + " -- Agency", body, user));
}

// ---------------------------------------------------------------------------
// CSV export of agency clients
// ---------------------------------------------------------------------------

function csvEscape(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  const str = String(s);
  // Quote if contains comma, quote, or newline. Double internal quotes.
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function snippetStatusText(d: Domain, driftedAt?: number | null): string {
  const now = Math.floor(Date.now() / 1000);
  const DAY = 86400;
  if (driftedAt && d.snippet_last_detected_at) return "drifted";
  if (d.snippet_last_detected_at) return "installed";
  if (!d.snippet_email_sent_at) return "not_delivered";
  const ageDays = Math.floor((now - d.snippet_email_sent_at) / DAY);
  if (ageDays >= 30) return `stalled_${ageDays}d`;
  if (ageDays >= 7) return `nudged_${ageDays}d`;
  return `pending_${ageDays}d`;
}

/**
 * GET /agency/clients.csv
 *
 * Downloads the agency's client list as CSV with the same data the
 * dashboard table shows: slug, domain, plan, access mode, status,
 * snippet status, AEO score + grade, last login (ISO), activated_at
 * (ISO). Useful for monthly reporting or pasting into the agency's
 * own CRM.
 */
export async function handleAgencyClientsCsv(
  user: User,
  env: Env,
  url: URL
): Promise<Response> {
  let agency: Agency | null = null;
  if (user.role === "agency_admin") {
    if (!user.agency_id) return new Response("Forbidden", { status: 403 });
    agency = await getAgency(env, user.agency_id);
  } else if (user.role === "admin") {
    const slug = url.searchParams.get("agency");
    if (!slug) return new Response("agency query param required for admin", { status: 400 });
    agency = await getAgencyBySlug(env, slug);
  } else {
    return new Response("Forbidden", { status: 403 });
  }
  if (!agency) return new Response("Agency not found", { status: 404 });

  const clients = await listAgencyClients(env, agency.id);

  // Latest scan per client (single query, mirrors the dashboard).
  const scansByDomain = new Map<number, ScanResult>();
  if (clients.length > 0) {
    const ids = clients.map((c) => c.id);
    const placeholders = ids.map(() => "?").join(",");
    const rows = await env.DB.prepare(
      `SELECT s.* FROM scan_results s
         INNER JOIN (
           SELECT domain_id, MAX(scanned_at) AS max_ts
             FROM scan_results WHERE domain_id IN (${placeholders})
            GROUP BY domain_id
         ) latest ON latest.domain_id = s.domain_id AND latest.max_ts = s.scanned_at`
    ).bind(...ids).all<ScanResult>();
    for (const r of rows.results || []) scansByDomain.set(r.domain_id, r);
  }

  // Drift alerts -- only retain rows where the snippet has NOT been
  // re-detected since the alert (otherwise drift is resolved).
  const driftBySlug = new Map<string, number>();
  if (clients.length > 0) {
    const slugs = Array.from(new Set(clients.map((c) => c.client_slug)));
    const placeholders = slugs.map(() => "?").join(",");
    const cutoff = Math.floor(Date.now() / 1000) - 30 * 86400;
    const driftRows = await env.DB.prepare(
      `SELECT client_slug, MAX(created_at) AS ts
         FROM admin_alerts
        WHERE type = 'snippet_drift' AND client_slug IN (${placeholders}) AND created_at > ?
        GROUP BY client_slug`
    ).bind(...slugs, cutoff).all<{ client_slug: string; ts: number }>();
    const lastDetectedBySlug = new Map<string, number>();
    for (const c of clients) {
      if (c.snippet_last_detected_at) lastDetectedBySlug.set(c.client_slug, c.snippet_last_detected_at);
    }
    for (const r of driftRows.results || []) {
      const lastDetected = lastDetectedBySlug.get(r.client_slug);
      if (lastDetected && lastDetected > r.ts) continue;
      driftBySlug.set(r.client_slug, r.ts);
    }
  }

  // Last login per Mode-2 client.
  const lastLoginBySlug = new Map<string, number>();
  if (clients.length > 0) {
    const slugs = clients.filter((c) => c.client_access === "full").map((c) => c.client_slug);
    if (slugs.length > 0) {
      const placeholders = slugs.map(() => "?").join(",");
      const loginRows = await env.DB.prepare(
        `SELECT client_slug, MAX(last_login_at) AS ts
           FROM users
          WHERE role = 'client' AND client_slug IN (${placeholders}) AND last_login_at IS NOT NULL
          GROUP BY client_slug`
      ).bind(...slugs).all<{ client_slug: string; ts: number }>();
      for (const r of loginRows.results || []) {
        if (r.ts) lastLoginBySlug.set(r.client_slug, r.ts);
      }
    }
  }

  const isoOrEmpty = (ts: number | null | undefined): string =>
    ts ? new Date(ts * 1000).toISOString().slice(0, 10) : "";

  const headers = [
    "client_slug", "domain", "plan", "access", "status",
    "snippet_status", "aeo_score", "grade", "last_login", "activated_at",
  ];
  const rows = clients.map((d) => {
    const scan = scansByDomain.get(d.id);
    return [
      d.client_slug,
      d.domain,
      d.plan || "",
      d.client_access || "",
      d.active === 1 ? "active" : "paused",
      snippetStatusText(d, driftBySlug.get(d.client_slug)),
      scan?.aeo_score ?? "",
      scan?.grade ?? "",
      d.client_access === "full" ? isoOrEmpty(lastLoginBySlug.get(d.client_slug)) : "",
      isoOrEmpty(d.activated_at),
    ];
  });

  const csv = [headers, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n") + "\n";

  const filename = `${agency.slug}-clients-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * GET /agency/clients.json
 *
 * JSON mirror of /agency/clients.csv. Same data, structured for
 * programmatic consumption (agency CRM imports, custom dashboards,
 * Zapier-style integrations). Mode 1 / Mode 2 distinction preserved
 * via the access field; last_login is null for Mode 1.
 */
export async function handleAgencyClientsJson(
  user: User,
  env: Env,
  url: URL
): Promise<Response> {
  let agency: Agency | null = null;
  if (user.role === "agency_admin") {
    if (!user.agency_id) return new Response("Forbidden", { status: 403 });
    agency = await getAgency(env, user.agency_id);
  } else if (user.role === "admin") {
    const slug = url.searchParams.get("agency");
    if (!slug) return new Response(JSON.stringify({ error: "agency query param required" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
    agency = await getAgencyBySlug(env, slug);
  } else {
    return new Response("Forbidden", { status: 403 });
  }
  if (!agency) return new Response(JSON.stringify({ error: "Agency not found" }), {
    status: 404, headers: { "Content-Type": "application/json" },
  });

  const clients = await listAgencyClients(env, agency.id);

  const scansByDomain = new Map<number, ScanResult>();
  if (clients.length > 0) {
    const ids = clients.map((c) => c.id);
    const placeholders = ids.map(() => "?").join(",");
    const rows = await env.DB.prepare(
      `SELECT s.* FROM scan_results s
         INNER JOIN (
           SELECT domain_id, MAX(scanned_at) AS max_ts
             FROM scan_results WHERE domain_id IN (${placeholders})
            GROUP BY domain_id
         ) latest ON latest.domain_id = s.domain_id AND latest.max_ts = s.scanned_at`
    ).bind(...ids).all<ScanResult>();
    for (const r of rows.results || []) scansByDomain.set(r.domain_id, r);
  }

  const driftBySlug = new Map<string, number>();
  if (clients.length > 0) {
    const slugs = Array.from(new Set(clients.map((c) => c.client_slug)));
    const placeholders = slugs.map(() => "?").join(",");
    const cutoff = Math.floor(Date.now() / 1000) - 30 * 86400;
    const driftRows = await env.DB.prepare(
      `SELECT client_slug, MAX(created_at) AS ts
         FROM admin_alerts
        WHERE type = 'snippet_drift' AND client_slug IN (${placeholders}) AND created_at > ?
        GROUP BY client_slug`
    ).bind(...slugs, cutoff).all<{ client_slug: string; ts: number }>();
    for (const r of driftRows.results || []) driftBySlug.set(r.client_slug, r.ts);
  }

  const lastLoginBySlug = new Map<string, number>();
  if (clients.length > 0) {
    const slugs = clients.filter((c) => c.client_access === "full").map((c) => c.client_slug);
    if (slugs.length > 0) {
      const placeholders = slugs.map(() => "?").join(",");
      const loginRows = await env.DB.prepare(
        `SELECT client_slug, MAX(last_login_at) AS ts
           FROM users
          WHERE role = 'client' AND client_slug IN (${placeholders}) AND last_login_at IS NOT NULL
          GROUP BY client_slug`
      ).bind(...slugs).all<{ client_slug: string; ts: number }>();
      for (const r of loginRows.results || []) {
        if (r.ts) lastLoginBySlug.set(r.client_slug, r.ts);
      }
    }
  }

  const isoOrNull = (ts: number | null | undefined): string | null =>
    ts ? new Date(ts * 1000).toISOString() : null;

  const data = clients.map((d) => {
    const scan = scansByDomain.get(d.id);
    return {
      client_slug: d.client_slug,
      domain: d.domain,
      plan: d.plan,
      access: d.client_access,
      status: d.active === 1 ? "active" : "paused",
      snippet_status: snippetStatusText(d, driftBySlug.get(d.client_slug)),
      aeo_score: scan?.aeo_score ?? null,
      grade: scan?.grade ?? null,
      last_login: d.client_access === "full" ? isoOrNull(lastLoginBySlug.get(d.client_slug)) : null,
      activated_at: isoOrNull(d.activated_at),
    };
  });

  return new Response(JSON.stringify({
    agency: { slug: agency.slug, name: agency.name },
    generated_at: new Date().toISOString(),
    clients: data,
  }, null, 2), {
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
