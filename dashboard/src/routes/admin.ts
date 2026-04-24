/**
 * Dashboard — Admin routes
 */

import type { Env, User, Domain, ScanResult, Agency } from "../types";
import { layout, html, redirect, esc } from "../render";
import { scanDomain } from "../scanner";
import { scanDomainPages } from "../pages";
import { checkAndAlertRegression } from "../regression";
import { autoGenerateRoadmap } from "../auto-provision";
import { autoCompleteRoadmapItems } from "../auto-complete";
import { reconcileAgencySlots } from "../agency-slots";
import { countActiveSlots, getAgency } from "../agency";
import { sendSnippetDeliveryEmail, sendAgencyOnboardingEmail } from "../agency-emails";

/** Admin overview: list all clients and domains */
export async function handleAdminHome(user: User, env: Env, url?: URL): Promise<Response> {
  const flash = url?.searchParams.get("flash") || null;
  const errorMsg = url?.searchParams.get("error") || null;
  const flashBlock = flash
    ? `<div class="flash" style="margin-bottom:16px">${esc(flash)}</div>`
    : errorMsg
    ? `<div class="flash flash-error" style="margin-bottom:16px">${esc(errorMsg)}</div>`
    : "";
  const domains = (await env.DB.prepare(
    "SELECT * FROM domains WHERE active = 1 ORDER BY client_slug, is_competitor, domain"
  ).all<Domain>()).results;

  const users = (await env.DB.prepare(
    "SELECT * FROM users ORDER BY role DESC, email"
  ).all<User>()).results;

  // Active competitor suggestions (auto-approved, editable/removable)
  const suggestions = (await env.DB.prepare(
    "SELECT cs.*, u.email as suggested_by_email FROM competitor_suggestions cs JOIN users u ON cs.suggested_by = u.id WHERE cs.status = 'approved' ORDER BY cs.created_at DESC"
  ).all<{ id: number; client_slug: string; domain: string; label: string | null; suggested_by_email: string; created_at: number }>()).results;

  // Agencies -- feeds the "Assign to agency" dropdown in the add-domain
  // form and the manual slot-reconcile UI.
  const agencies = (await env.DB.prepare(
    "SELECT id, slug, name, status, stripe_subscription_id, amplify_slot_item_id, trial_used FROM agencies ORDER BY status DESC, name"
  ).all<Pick<Agency, "id" | "slug" | "name" | "status" | "stripe_subscription_id" | "amplify_slot_item_id" | "trial_used">>()).results;

  // Trial funnel snapshot: active trials in progress, conversions in
  // last 30d, expirations in last 30d. Keeps the feature observable
  // without building a separate admin page.
  const trialStatsRaw = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(DISTINCT a.id) FROM agencies a
          JOIN domains d ON d.agency_id = a.id AND d.trial = 1 AND d.active = 1
         WHERE a.stripe_subscription_id IS NULL) AS active_trials,
       (SELECT COUNT(*) FROM agencies
         WHERE trial_used = 1 AND stripe_subscription_id IS NOT NULL
           AND updated_at > strftime('%s','now') - 30*86400) AS converted_30d,
       (SELECT COUNT(DISTINCT type) FROM admin_alerts
         WHERE type LIKE 'trial_expired_%' AND created_at > strftime('%s','now') - 30*86400) AS expired_30d`
  ).first<{ active_trials: number; converted_30d: number; expired_30d: number }>();
  const trialStats = trialStatsRaw || { active_trials: 0, converted_30d: 0, expired_30d: 0 };

  // Live slot counts for each agency (DB source of truth) -- shown next
  // to the reconcile button so admins can spot drift at a glance.
  const agencySlots = new Map<number, { signal: number; amplify: number }>();
  for (const a of agencies) {
    agencySlots.set(a.id, await countActiveSlots(env, a.id));
  }

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

  // Build the agencies card. One row per agency with the DB-side slot
  // counts and a "Reconcile slots" button so admins can push the
  // numbers to Stripe on demand. Hidden entirely when there are no
  // agencies to avoid clutter on a fresh install.
  const agencyRows = agencies.map(a => {
    const slots = agencySlots.get(a.id) || { signal: 0, amplify: 0 };
    const statusColor = a.status === "active" ? "#4ade80" : a.status === "paused" ? "#f59e0b" : "var(--text-faint)";
    const amplifyBadge = a.amplify_slot_item_id
      ? `<span style="color:var(--text-faint);font-size:10px">item:${esc(String(a.amplify_slot_item_id).slice(-6))}</span>`
      : `<span style="color:var(--text-faint);font-size:10px">(lazy)</span>`;
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)">
        <div style="min-width:0;flex:1">
          <div style="font-size:13px;font-weight:500">${esc(a.name)}</div>
          <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint);margin-top:2px">
            ${esc(a.slug)} <span style="color:${statusColor}">&middot; ${esc(a.status)}</span>
            ${a.stripe_subscription_id ? "" : ` <span style="color:var(--text-faint)">&middot; no sub</span>`}
          </div>
        </div>
        <div style="text-align:right;font-family:var(--mono);font-size:11px;color:var(--text-mute);white-space:nowrap">
          <div>Signal: <strong style="color:var(--text)">${slots.signal}</strong></div>
          <div style="margin-top:2px">Amplify: <strong style="color:var(--text)">${slots.amplify}</strong> ${amplifyBadge}</div>
        </div>
        <form method="POST" action="/admin/agencies/${a.id}/reconcile" style="margin:0">
          <button type="submit" class="btn btn-ghost" style="padding:6px 12px;font-size:9px" title="Push DB slot counts to Stripe">Reconcile slots</button>
        </form>
        ${a.trial_used ? `
        <form method="POST" action="/admin/agencies/${a.id}/trial-reset" style="margin:0"
              onsubmit="return confirm('Reset trial for ${esc(a.slug)}? This lets them add another free trial client.')">
          <button type="submit" class="btn btn-ghost" style="padding:6px 12px;font-size:9px;border-color:var(--gold-dim)" title="Clear trial_used so this agency can start another trial">Reset trial</button>
        </form>
        ` : ""}
      </div>
    `;
  }).join("");

  const agenciesSection = agencies.length > 0 ? `
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;gap:16px;flex-wrap:wrap">
        <h3 style="margin:0;font-style:italic">Agencies</h3>
        <span class="label" style="font-size:10px">${agencies.length} total</span>
      </div>
      <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint);margin-bottom:14px">
        Trial funnel (last 30d): <strong style="color:var(--text)">${trialStats.active_trials}</strong> active
        &middot; <strong style="color:var(--text)">${trialStats.converted_30d}</strong> converted
        &middot; <strong style="color:var(--text)">${trialStats.expired_30d}</strong> expired
      </div>
      ${agencyRows}
    </div>
  ` : "";

  const body = `
    <div style="margin-bottom:40px">
      <div class="label" style="margin-bottom:8px">Admin</div>
      <h1>Manage <em>clients</em></h1>
    </div>

    ${flashBlock}

    ${agenciesSection}

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

          <div class="form-group">
            <label>Agency (optional, primary clients only)</label>
            <select name="agency_id" style="width:100%;max-width:400px;padding:12px 16px;background:var(--bg-edge);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:14px">
              <option value="">-- none / direct client --</option>
              ${agencies.map(a => `<option value="${a.id}">${esc(a.name)} (${esc(a.slug)}) -- ${esc(a.status)}</option>`).join('')}
            </select>
            <p style="font-size:11px;color:var(--text-faint);margin-top:6px;line-height:1.5">
              If set, this client will count toward the agency's Stripe slot billing. Stripe quantities reconcile automatically on save.
            </p>
          </div>
          <div class="form-group">
            <label>Plan (agency clients only)</label>
            <select name="plan" style="width:100%;max-width:400px;padding:12px 16px;background:var(--bg-edge);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:14px">
              <option value="signal">Signal</option>
              <option value="amplify">Amplify</option>
            </select>
          </div>
          <div class="form-group">
            <label>Client access (agency clients only)</label>
            <select name="client_access" style="width:100%;max-width:400px;padding:12px 16px;background:var(--bg-edge);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:14px">
              <option value="internal">Internal (agency-only view)</option>
              <option value="full">Full (client portal access)</option>
            </select>
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

      <div class="card" id="client-settings" style="grid-column:1 / -1">
        <h3 style="margin-bottom:8px">Client <em>settings</em></h3>
        <p style="font-size:12px;color:var(--text-faint);margin-bottom:20px;line-height:1.6">
          Average deal value powers the ROI estimate on the client dashboard. Stored per client slug. If blank, the dashboard shows a prompt instead of a fabricated revenue figure.
        </p>
        ${await (async () => {
          const rows = (await env.DB.prepare(
            `SELECT d.client_slug, COALESCE(cs.avg_deal_value, 0) as avg_deal_value
             FROM (SELECT DISTINCT client_slug FROM domains WHERE active = 1 AND is_competitor = 0) d
             LEFT JOIN client_settings cs ON cs.client_slug = d.client_slug
             ORDER BY d.client_slug`
          ).all<{ client_slug: string; avg_deal_value: number }>()).results;
          if (rows.length === 0) {
            return '<div style="font-size:12px;color:var(--text-faint)">No clients yet.</div>';
          }
          return rows.map(r => {
            const dollars = r.avg_deal_value ? (r.avg_deal_value / 100) : "";
            return `
              <form method="POST" action="/admin/client-settings" style="display:flex;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--line)">
                <input type="hidden" name="client_slug" value="${esc(r.client_slug)}">
                <div style="flex:1;font-family:var(--mono);font-size:13px;color:var(--text)">${esc(r.client_slug)}</div>
                <label style="font-size:11px;color:var(--text-faint)">Avg deal value</label>
                <div style="display:flex;align-items:center;gap:4px">
                  <span style="color:var(--text-faint);font-size:13px">$</span>
                  <input type="number" name="avg_deal_value" value="${dollars}" placeholder="5000" min="0" step="1" style="width:120px;background:var(--bg-edge);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:13px;padding:6px 10px;border-radius:2px">
                </div>
                <button type="submit" class="btn" style="padding:6px 14px;font-size:11px">Save</button>
              </form>
            `;
          }).join("");
        })()}
      </div>
    </div>

    ${suggestions.length > 0 ? `
    <div class="card" style="margin-top:24px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h3>Client-submitted <em>competitors</em></h3>
        <span style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint)">${suggestions.length} active</span>
      </div>
      <table class="data-table">
        <thead><tr><th>Client</th><th>Domain</th><th>Label</th><th>Suggested by</th><th>Actions</th></tr></thead>
        <tbody>
          ${suggestions.map(s => `
            <tr>
              <td>${esc(s.client_slug)}</td>
              <td>
                <form method="POST" action="/admin/suggestion/${s.id}/edit" style="display:flex;gap:6px;align-items:center">
                  <input type="text" name="domain" value="${esc(s.domain)}" style="background:var(--bg-edge);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:12px;padding:4px 8px;border-radius:2px;width:160px">
                  <input type="text" name="label" value="${s.label ? esc(s.label) : ''}" placeholder="Label" style="background:var(--bg-edge);border:1px solid var(--line);color:var(--text-faint);font-family:var(--mono);font-size:12px;padding:4px 8px;border-radius:2px;width:120px">
                  <button type="submit" class="btn" style="padding:4px 10px;font-size:9px">Save</button>
                </form>
              </td>
              <td style="color:var(--text-faint);font-size:12px">${esc(s.suggested_by_email)}</td>
              <td>
                <form method="POST" action="/admin/suggestion/${s.id}/remove" style="display:inline">
                  <button type="submit" class="btn btn-ghost" style="padding:4px 10px;font-size:9px;color:var(--red,#c85050)">Remove</button>
                </form>
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
        <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Client</th><th>Last login</th><th>Actions</th></tr></thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td>${esc(u.email)}</td>
              <td>${u.name ? esc(u.name) : '<span style="color:var(--text-faint)">-</span>'}</td>
              <td><span class="status status-${u.role === 'admin' ? 'in_progress' : 'pending'}">${u.role}</span></td>
              <td>${u.client_slug ? esc(u.client_slug) : '<span style="color:var(--text-faint)">-</span>'}</td>
              <td style="color:var(--text-faint)">${u.last_login_at ? new Date(u.last_login_at * 1000).toLocaleDateString() : 'Never'}</td>
              <td>
                <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                  ${u.totp_enabled_at ? `
                    <form method="POST" action="/admin/users/${u.id}/reset-2fa" style="display:inline;margin:0" onsubmit="return confirm('Reset 2FA for ${esc(u.email)}? They will be emailed and need to re-enroll.');">
                      <button type="submit" class="btn btn-ghost" style="padding:4px 10px;font-size:9px;color:var(--red,#c85050)" title="Clear TOTP secret and recovery codes">Reset 2FA</button>
                    </form>
                  ` : ''}
                  ${u.role === 'agency_admin' && u.agency_id ? `
                    <form method="POST" action="/admin/users/${u.id}/resend-onboarding" style="display:inline;margin:0" onsubmit="return confirm('Resend onboarding email to ${esc(u.email)}?');">
                      <button type="submit" class="btn btn-ghost" style="padding:4px 10px;font-size:9px" title="Regenerate magic link + resend welcome email">Resend onboarding</button>
                    </form>
                  ` : ''}
                  ${!u.totp_enabled_at && (u.role !== 'agency_admin' || !u.agency_id) ? '<span style="color:var(--text-faint);font-size:11px">-</span>' : ''}
                </div>
              </td>
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

  // Agency assignment -- only meaningful for primary (non-competitor)
  // clients. Competitors are attributed via client_slug, not an agency
  // relationship, and don't count against slot billing.
  const rawAgencyId = (form.get("agency_id") as string || "").trim();
  const agencyId = !isCompetitor && rawAgencyId ? Number(rawAgencyId) : null;
  const rawPlan = (form.get("plan") as string || "").trim().toLowerCase();
  const plan = agencyId && (rawPlan === "signal" || rawPlan === "amplify") ? rawPlan : null;
  const rawAccess = (form.get("client_access") as string || "").trim().toLowerCase();
  const clientAccess = agencyId && (rawAccess === "full" || rawAccess === "internal") ? rawAccess : (agencyId ? "internal" : null);

  if (!clientSlug || !domain) {
    return redirect("/admin/manage");
  }

  const now = Math.floor(Date.now() / 1000);
  let newDomainId: number | null = null;
  try {
    const result = await env.DB.prepare(
      `INSERT INTO domains
         (client_slug, domain, is_competitor, competitor_label, active,
          agency_id, plan, client_access, activated_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`
    ).bind(
      clientSlug,
      domain,
      isCompetitor,
      competitorLabel,
      agencyId,
      plan,
      clientAccess,
      agencyId ? now : null,
      now,
      now,
    ).run();
    newDomainId = result.meta.last_row_id as number || null;
  } catch {
    // Likely unique constraint violation
  }

  // If this client is attached to an agency, sync Stripe slot quantities
  // to match the DB (lazy-creates the Amplify subscription_item on the
  // first Amplify client). We don't want to block the redirect on a
  // Stripe hiccup, so we swallow errors and log them -- the admin can
  // re-run reconcile from the cockpit if needed.
  if (agencyId && newDomainId && !isCompetitor) {
    try {
      const result = await reconcileAgencySlots(env, agencyId);
      if (result.signal.updated || result.amplify.updated) {
        console.log(
          `[agency-slots] reconciled agency ${agencyId} after domain ${domain} add: ` +
          `signal ${result.signal.stripeQuantity}, amplify ${result.amplify.stripeQuantity}` +
          (result.amplify.lazyCreated ? " (amplify lazy-created)" : "")
        );
      }
    } catch (e) {
      console.log(`[agency-slots] reconcile failed for agency ${agencyId}: ${e}`);
    }

    // Snippet delivery email: send ONCE per domain, the moment the
    // agency provisions the client. Guards on snippet_email_sent_at
    // so retries (race, 2nd submit) don't double-send.
    try {
      const agencyRow = await getAgency(env, agencyId);
      const domainRow = await env.DB.prepare(
        "SELECT * FROM domains WHERE id = ?"
      ).bind(newDomainId).first<Domain>();
      if (agencyRow && domainRow && !domainRow.snippet_email_sent_at) {
        const sent = await sendSnippetDeliveryEmail(env, { agency: agencyRow, domain: domainRow });
        if (sent) {
          await env.DB.prepare(
            "UPDATE domains SET snippet_email_sent_at = ? WHERE id = ?"
          ).bind(now, newDomainId).run();
          console.log(
            `[agency-emails] snippet email sent to ${agencyRow.contact_email} for ${domain}`
          );
        }
      }
    } catch (e) {
      console.log(`[agency-emails] snippet email failed for domain ${domain}: ${e}`);
    }
  }

  // Auto-provision for primary (non-competitor) domains
  if (newDomainId && !isCompetitor) {
    // Run first scan in background
    try {
      const scanResult = await scanDomain(newDomainId, `https://${domain}/`, "onboarding", env);

      // Auto-generate roadmap from scan
      if (scanResult && !scanResult.error) {
        await autoGenerateRoadmap(clientSlug, env);
        await autoCompleteRoadmapItems(clientSlug, scanResult, env);
      }

      // Create admin alert for the new client
      await env.DB.prepare(
        "INSERT INTO admin_alerts (client_slug, type, title, detail, created_at) VALUES (?, 'onboarding', ?, ?, ?)"
      ).bind(clientSlug, `New client domain added: ${domain}`, `Auto-provisioned: scan + roadmap generated`, now).run();
    } catch (e) {
      console.log(`Auto-provision failed for ${domain}: ${e}`);
    }
  }

  return redirect("/admin/manage");
}

/** Add a user */
export async function handleAddUser(request: Request, user: User, env: Env): Promise<Response> {
  const form = await request.formData();
  const email = (form.get("email") as string || "").trim().toLowerCase();
  const name = (form.get("name") as string || "").trim() || null;
  const clientSlug = (form.get("client_slug") as string || "").trim().toLowerCase() || null;
  const role = (form.get("role") as string || "client");

  if (!email) {
    return redirect("/admin/manage");
  }

  const now = Math.floor(Date.now() / 1000);
  try {
    await env.DB.prepare(
      "INSERT INTO users (email, name, role, client_slug, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(email, name, role, clientSlug, now).run();
  } catch {
    // Likely duplicate email
  }

  return redirect("/admin/manage");
}

/**
 * Upsert per-client settings. Currently supports avg_deal_value only. Stored
 * in cents to avoid floating-point drift. Empty/zero input is treated as
 * "unset" and blanks out the row so the dashboard falls back to the prompt
 * state rather than computing ROI off a $0 deal value.
 */
export async function handleClientSettings(request: Request, user: User, env: Env): Promise<Response> {
  const form = await request.formData();
  const clientSlug = (form.get("client_slug") as string || "").trim().toLowerCase();
  const rawDealValue = (form.get("avg_deal_value") as string || "").trim();

  if (!clientSlug) {
    return redirect("/admin/manage#client-settings");
  }

  let dealValueCents: number | null = null;
  if (rawDealValue) {
    const parsed = parseInt(rawDealValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      dealValueCents = parsed * 100;
    }
  }

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO client_settings (client_slug, avg_deal_value, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(client_slug) DO UPDATE SET avg_deal_value = excluded.avg_deal_value, updated_at = excluded.updated_at`
  ).bind(clientSlug, dealValueCents, now, now).run();

  return redirect("/admin/manage#client-settings");
}

/** Trigger a manual scan */
export async function handleManualScan(domainId: number, user: User, env: Env): Promise<Response> {
  const domain = await env.DB.prepare(
    "SELECT * FROM domains WHERE id = ? AND active = 1"
  ).bind(domainId).first<Domain>();

  if (!domain) {
    return redirect("/admin/manage");
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

/**
 * Trigger a scan that records itself as scan_type='cron' instead of
 * 'manual'. This is a diagnostic tool -- it's what you use to prove a
 * scanner fix works without waiting for Monday's natural cron. The
 * scan still runs in Request context so it won't reproduce any bug
 * that's specific to the scheduled-event runtime, but it exercises the
 * same scanner code path (retries, fallbacks, error capture) and
 * persists a distinguishable row in scan_results for inspection.
 */
export async function handleCronTestScan(domainId: number, user: User, env: Env): Promise<Response> {
  const domain = await env.DB.prepare(
    "SELECT * FROM domains WHERE id = ? AND active = 1"
  ).bind(domainId).first<Domain>();

  if (!domain) {
    return redirect("/admin/manage");
  }

  const url = `https://${domain.domain}/`;
  await scanDomain(domain.id, url, "cron", env);

  return redirect(`/domain/${domain.id}?flash=cron_test_complete`);
}

/** Edit a competitor suggestion — updates both the suggestion record and the domains table */
export async function handleEditSuggestion(suggestionId: number, request: Request, user: User, env: Env): Promise<Response> {
  const suggestion = await env.DB.prepare(
    "SELECT * FROM competitor_suggestions WHERE id = ? AND status = 'approved'"
  ).bind(suggestionId).first<{ id: number; client_slug: string; domain: string; label: string | null }>();

  if (!suggestion) return redirect("/admin/manage");

  const form = await request.formData();
  const newDomain = (form.get("domain") as string || "").trim().toLowerCase()
    .replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  const newLabel = (form.get("label") as string || "").trim() || null;

  if (!newDomain || newDomain.length < 3 || !newDomain.includes(".")) {
    return redirect("/admin/manage");
  }

  const now = Math.floor(Date.now() / 1000);
  const oldDomain = suggestion.domain;

  // Update the suggestion record
  await env.DB.prepare(
    "UPDATE competitor_suggestions SET domain = ?, label = ? WHERE id = ?"
  ).bind(newDomain, newLabel, suggestionId).run();

  // Update the domains table entry
  if (newDomain !== oldDomain) {
    // Domain changed — remove old, add new
    await env.DB.prepare(
      "DELETE FROM domains WHERE domain = ? AND client_slug = ? AND is_competitor = 1"
    ).bind(oldDomain, suggestion.client_slug).run();

    try {
      await env.DB.prepare(
        "INSERT INTO domains (client_slug, domain, is_competitor, competitor_label, active, created_at, updated_at) VALUES (?, ?, 1, ?, 1, ?, ?)"
      ).bind(suggestion.client_slug, newDomain, newLabel, now, now).run();

      // Trigger scan of the corrected domain
      const dom = await env.DB.prepare(
        "SELECT * FROM domains WHERE domain = ? AND client_slug = ? AND is_competitor = 1"
      ).bind(newDomain, suggestion.client_slug).first<Domain>();
      if (dom) {
        await scanDomain(dom.id, `https://${newDomain}/`, "manual", env);
      }
    } catch {
      // Duplicate domain
    }
  } else {
    // Just update the label
    await env.DB.prepare(
      "UPDATE domains SET competitor_label = ?, updated_at = ? WHERE domain = ? AND client_slug = ? AND is_competitor = 1"
    ).bind(newLabel, now, newDomain, suggestion.client_slug).run();
  }

  return redirect("/admin/manage");
}

/** Remove a competitor suggestion — deletes from domains and marks suggestion as rejected */
export async function handleRemoveSuggestion(suggestionId: number, user: User, env: Env): Promise<Response> {
  const suggestion = await env.DB.prepare(
    "SELECT * FROM competitor_suggestions WHERE id = ? AND status = 'approved'"
  ).bind(suggestionId).first<{ id: number; client_slug: string; domain: string }>();

  if (!suggestion) return redirect("/admin/manage");

  // Remove from domains table
  await env.DB.prepare(
    "DELETE FROM domains WHERE domain = ? AND client_slug = ? AND is_competitor = 1"
  ).bind(suggestion.domain, suggestion.client_slug).run();

  // Mark suggestion as rejected
  await env.DB.prepare(
    "UPDATE competitor_suggestions SET status = 'rejected' WHERE id = ?"
  ).bind(suggestionId).run();

  return redirect("/admin/manage");
}

/**
 * POST /admin/agencies/:id/reconcile
 *
 * Admin-triggered Stripe slot reconciliation. Pushes the DB's active
 * client counts (by plan) into the agency's Stripe subscription
 * quantities, lazy-creating the Amplify subscription_item if needed.
 * Idempotent: running repeatedly with no drift is a no-op Stripe-side.
 *
 * Surfaces a success or error message via an admin_alerts row so the
 * admin cockpit shows the outcome without needing a query-string flag.
 */
export async function handleReconcileAgency(agencyId: number, user: User, env: Env): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  try {
    const result = await reconcileAgencySlots(env, agencyId);
    const skipNote = result.skipped === "no-subscription"
      ? " (no Stripe subscription yet -- skipped)"
      : result.skipped === "missing-env"
      ? " (STRIPE_SECRET_KEY missing -- skipped)"
      : "";
    const signalNote = `Signal ${result.signal.stripeQuantity} (expected ${result.signal.expected})`;
    const amplifyNote =
      `Amplify ${result.amplify.stripeQuantity} (expected ${result.amplify.expected})` +
      (result.amplify.lazyCreated ? ", item lazy-created" : "");
    await env.DB.prepare(
      "INSERT INTO admin_alerts (client_slug, type, title, detail, created_at) VALUES (?, 'slot_reconcile', ?, ?, ?)"
    ).bind(
      `agency:${agencyId}`,
      `Slot reconcile run for agency ${agencyId}${skipNote}`,
      `${signalNote}. ${amplifyNote}.`,
      now,
    ).run();
  } catch (e: any) {
    const msg = String(e?.message || e);
    console.log(`[agency-slots] reconcile failed for agency ${agencyId}: ${msg}`);
    await env.DB.prepare(
      "INSERT INTO admin_alerts (client_slug, type, title, detail, created_at) VALUES (?, 'slot_reconcile_error', ?, ?, ?)"
    ).bind(
      `agency:${agencyId}`,
      `Slot reconcile FAILED for agency ${agencyId}`,
      msg,
      now,
    ).run();
  }
  return redirect("/admin/manage");
}

// ---------------------------------------------------------------------------
// POST /admin/users/:id/resend-onboarding
//
// Regenerates a fresh 7-day magic-link token for an agency_admin and
// re-fires the onboarding welcome email. Used when the original send
// bounced, the 7-day link lapsed, or the agency lost the email.
// ---------------------------------------------------------------------------

export async function handleAdminResendOnboarding(
  targetId: number,
  actor: User,
  env: Env,
): Promise<Response> {
  if (actor.role !== "admin") return redirect("/");

  const target = await env.DB.prepare(
    "SELECT id, email, name, role, agency_id FROM users WHERE id = ?"
  ).bind(targetId).first<{ id: number; email: string; name: string | null; role: string; agency_id: number | null }>();

  if (!target) {
    return redirect("/admin/manage?error=" + encodeURIComponent("User not found."));
  }
  if (target.role !== "agency_admin" || !target.agency_id) {
    return redirect("/admin/manage?error=" + encodeURIComponent("Resend onboarding only applies to agency admins."));
  }

  const agency = await env.DB.prepare(
    "SELECT name FROM agencies WHERE id = ?"
  ).bind(target.agency_id).first<{ name: string }>();
  if (!agency) {
    return redirect("/admin/manage?error=" + encodeURIComponent("Agency not found."));
  }

  try {
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const now = Math.floor(Date.now() / 1000);
    const expires = now + 86400 * 7;
    await env.DB.prepare(
      "INSERT INTO magic_links (email, token, expires_at, used, created_at) VALUES (?, ?, ?, 0, ?)"
    ).bind(target.email, token, expires, now).run();

    await sendAgencyOnboardingEmail(env, {
      to: target.email,
      contactName: target.name || "",
      agencyName: agency.name,
      magicLinkToken: token,
    });
  } catch (e) {
    console.log(`[admin-resend-onboarding] failed for user ${targetId}: ${e}`);
    return redirect("/admin/manage?error=" + encodeURIComponent("Failed to send onboarding email. Check logs."));
  }

  console.log(`[admin-resend-onboarding] actor=${actor.email} target=${target.email}`);
  return redirect("/admin/manage?flash=" + encodeURIComponent(`Onboarding email re-sent to ${target.email}.`));
}

/**
 * POST /admin/agencies/:id/trial-reset
 *
 * Clears trial_used on an agency so they can start another trial
 * client. Use cases: test account cleanup, customer hit the trial with
 * the wrong domain and needs a do-over. Does NOT delete any existing
 * trial domains -- those keep their trial=1 flag until the agency
 * activates billing or the dormancy sweep deactivates them.
 */
export async function handleAdminTrialReset(agencyId: number, env: Env): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const agency = await env.DB.prepare(
    "SELECT id, slug FROM agencies WHERE id = ?"
  ).bind(agencyId).first<{ id: number; slug: string }>();
  if (!agency) {
    return redirect("/admin?error=" + encodeURIComponent("Agency not found."));
  }
  await env.DB.prepare(
    "UPDATE agencies SET trial_used = 0, updated_at = ? WHERE id = ?"
  ).bind(now, agencyId).run();
  console.log(`[admin-trial-reset] agency=${agency.slug} (${agencyId}) trial_used cleared`);
  return redirect("/admin?flash=" + encodeURIComponent(`Trial reset for ${agency.slug}. They can add another trial client.`));
}
