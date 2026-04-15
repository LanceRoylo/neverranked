/**
 * Dashboard -- User settings
 *
 * Account info, billing, email prefs, competitors, GSC connection.
 */

import type { Env, User, Domain } from "../types";
import { layout, html, redirect, esc } from "../render";
import { getGoogleAuthUrl, getValidToken, listSites } from "../gsc";

function buildToggleRow(name: string, label: string, description: string, checked: number): string {
  const isOn = !!checked;
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:var(--bg-edge);border-radius:4px;margin-bottom:12px">
      <div>
        <div style="font-size:14px;color:var(--text)">${esc(label)}</div>
        <div style="font-size:12px;color:var(--text-faint);margin-top:4px">${esc(description)}</div>
      </div>
      <label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;flex-shrink:0">
        <input type="checkbox" name="${name}" value="1" ${isOn ? 'checked' : ''} style="opacity:0;width:0;height:0">
        <span style="position:absolute;inset:0;background:${isOn ? 'var(--gold)' : 'var(--line)'};border-radius:12px;transition:background .2s"></span>
        <span style="position:absolute;top:2px;left:${isOn ? '22px' : '2px'};width:20px;height:20px;background:var(--bg);border-radius:50%;transition:left .2s"></span>
      </label>
    </div>
  `;
}

export async function handleSettings(user: User, env: Env, flashMessage?: string, url?: URL): Promise<Response> {
  // Check for GSC connection status from URL params
  const gscParam = url?.searchParams.get("gsc");
  const gscLinkParam = url?.searchParams.get("link");
  const gscError = url?.searchParams.get("error");

  let derivedFlash = flashMessage || "";
  if (gscParam === "connected" && !gscLinkParam) {
    derivedFlash = "Google Search Console connected and linked. Search data will appear on your next weekly pull.";
  } else if (gscParam === "connected" && gscLinkParam === "manual") {
    derivedFlash = "Google account connected, but we could not auto-link a property. Please contact us to complete the setup.";
  } else if (gscError) {
    derivedFlash = "Google connection failed: " + gscError;
  }

  const flash = derivedFlash
    ? `<div style="margin-bottom:24px;padding:14px 20px;background:var(--gold-wash);border:1px solid var(--gold-dim);border-radius:4px;font-size:13px;color:var(--gold)">${esc(derivedFlash)}</div>`
    : "";

  // Load competitors for this client
  const competitors = user.client_slug ? (await env.DB.prepare(
    "SELECT * FROM domains WHERE client_slug = ? AND is_competitor = 1 AND active = 1 ORDER BY domain"
  ).bind(user.client_slug).all<Domain>()).results : [];

  // Check GSC connection status for this client
  const gscProperty = user.client_slug ? await env.DB.prepare(
    "SELECT * FROM gsc_properties WHERE client_slug = ? LIMIT 1"
  ).bind(user.client_slug).first<{ id: number; site_url: string }>() : null;

  // For the connect button, we need the origin
  const origin = url ? url.origin : "https://app.neverranked.com";
  const gscAuthUrl = getGoogleAuthUrl(env, origin);

  const body = `
    <div style="margin-bottom:40px">
      <div class="label" style="margin-bottom:8px">
        <a href="/" style="color:var(--text-mute)">Dashboard</a>
      </div>
      <h1><em>Settings</em></h1>
    </div>

    ${flash}

    <!-- Account info -->
    <div class="card" style="margin-bottom:24px">
      <div class="label" style="margin-bottom:16px">Account</div>
      <div style="display:grid;grid-template-columns:120px 1fr;gap:12px;font-size:14px">
        <div style="color:var(--text-faint)">Email</div>
        <div style="color:var(--text)">${esc(user.email)}</div>
        ${user.name ? `
          <div style="color:var(--text-faint)">Name</div>
          <div style="color:var(--text)">${esc(user.name)}</div>
        ` : ""}
        <div style="color:var(--text-faint)">Role</div>
        <div><span class="status status-${user.role === 'admin' ? 'in_progress' : 'pending'}">${user.role}</span></div>
        ${user.client_slug ? `
          <div style="color:var(--text-faint)">Client</div>
          <div style="color:var(--text)">${esc(user.client_slug)}</div>
        ` : ""}
      </div>
    </div>

    <!-- Billing -->
    ${user.stripe_customer_id ? `
    <div class="card" style="margin-bottom:24px">
      <div class="label" style="margin-bottom:16px">Billing</div>
      <div style="display:grid;grid-template-columns:120px 1fr;gap:12px;font-size:14px;margin-bottom:20px">
        <div style="color:var(--text-faint)">Plan</div>
        <div><span class="status status-${user.plan === 'churned' || user.plan === 'none' ? 'blocked' : 'done'}">${esc(user.plan || 'none')}</span></div>
        ${user.stripe_subscription_id ? `
          <div style="color:var(--text-faint)">Status</div>
          <div style="color:var(--text)">Active subscription</div>
        ` : `
          <div style="color:var(--text-faint)">Status</div>
          <div style="color:var(--text-faint)">One-time purchase</div>
        `}
      </div>
      <form method="POST" action="/billing/portal">
        <button type="submit" class="btn">Manage billing</button>
        <span style="font-size:12px;color:var(--text-faint);margin-left:12px">Update payment method, view invoices, or cancel</span>
      </form>
    </div>
    ` : ""}

    <!-- Competitors -->
    ${user.client_slug ? `
    <div class="card" style="margin-bottom:24px">
      <div class="label" style="margin-bottom:16px">Competitors</div>
      ${competitors.length > 0 ? `
        <div style="margin-bottom:16px">
          ${competitors.map(c => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(251,248,239,.08)">
              <span style="font-size:13px;color:var(--text)">${esc(c.domain)}${c.competitor_label ? ` <span style="color:var(--text-faint)">(${esc(c.competitor_label)})</span>` : ''}</span>
              <form method="POST" action="/competitors/${esc(user.client_slug)}/remove" style="display:inline">
                <input type="hidden" name="domain_id" value="${c.id}">
                <button type="submit" style="font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint);background:none;border:1px solid var(--line);padding:3px 8px;border-radius:2px;cursor:pointer">Remove</button>
              </form>
            </div>
          `).join("")}
        </div>
      ` : `
        <div style="font-size:13px;color:var(--text-faint);margin-bottom:16px">No competitors tracked yet.</div>
      `}
      <form method="POST" action="/competitors/${esc(user.client_slug)}/add" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
        <div class="form-group" style="margin-bottom:0;flex:1;min-width:160px">
          <label>Domain</label>
          <input type="text" name="domain" placeholder="competitor.com" required style="width:100%">
        </div>
        <div class="form-group" style="margin-bottom:0;flex:1;min-width:120px">
          <label>Label (optional)</label>
          <input type="text" name="label" placeholder="Main competitor">
        </div>
        <button type="submit" class="btn" style="white-space:nowrap">Add</button>
      </form>
    </div>
    ` : ""}

    <!-- Google Search Console -->
    ${user.client_slug ? `
    <div class="card" style="margin-bottom:24px">
      <div class="label" style="margin-bottom:16px">Google Search Console</div>
      ${gscProperty ? `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <div style="width:8px;height:8px;border-radius:50%;background:var(--green)"></div>
          <div style="font-size:14px;color:var(--text)">Connected</div>
        </div>
        <div style="font-size:13px;color:var(--text-faint);margin-bottom:12px">
          Linked property: <span style="color:var(--text)">${esc(gscProperty.site_url)}</span>
        </div>
        <div style="font-size:12px;color:var(--text-faint);line-height:1.6">
          Search data is pulled automatically every week. You can view your search performance on the <a href="/search/${esc(user.client_slug)}" style="color:var(--gold)">Search page</a>.
        </div>
      ` : `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <div style="width:8px;height:8px;border-radius:50%;background:var(--text-faint)"></div>
          <div style="font-size:14px;color:var(--text-faint)">Not connected</div>
        </div>
        <div style="font-size:13px;color:var(--text-faint);line-height:1.6;margin-bottom:16px">
          Connect Google Search Console to see how your site performs in traditional search alongside your AEO data. We pull clicks, impressions, top queries, and average position weekly.
        </div>
        <a href="${esc(gscAuthUrl)}&state=client:${esc(user.client_slug)}" class="btn">Connect Search Console</a>
        <div style="font-size:11px;color:var(--text-faint);margin-top:8px">
          We only request read-only access. You can disconnect at any time.
        </div>
      `}
    </div>
    ` : ""}

    <!-- Email preferences -->
    <div class="card">
      <div class="label" style="margin-bottom:16px">Email Preferences</div>

      <form method="POST" action="/settings/emails">
        ${buildToggleRow("email_digest", "Weekly AEO digest", "Score, changes, citations, and top action items every Monday", user.email_digest)}
        ${buildToggleRow("email_regression", "Score drop alerts", "Immediate email when your AEO score drops 5 or more points", user.email_regression ?? 1)}
        ${buildToggleRow("email_alerts", "Activity alerts", "Milestone achievements, competitor changes, and roadmap updates", user.email_alerts ?? 1)}

        <div style="display:flex;gap:12px;align-items:center">
          <button type="submit" class="btn">Save preferences</button>
          <span style="font-size:12px;color:var(--text-faint)">Changes take effect on the next scan cycle</span>
        </div>
      </form>
    </div>
  `;

  return html(layout("Settings", body, user));
}

export async function handleUpdateEmailPrefs(request: Request, user: User, env: Env): Promise<Response> {
  const form = await request.formData();
  const emailDigest = form.get("email_digest") === "1" ? 1 : 0;
  const emailAlerts = form.get("email_alerts") === "1" ? 1 : 0;
  const emailRegression = form.get("email_regression") === "1" ? 1 : 0;

  await env.DB.prepare(
    "UPDATE users SET email_digest = ?, email_alerts = ?, email_regression = ? WHERE id = ?"
  ).bind(emailDigest, emailAlerts, emailRegression, user.id).run();

  const message = "Email preferences saved.";

  // Re-fetch user with updated preferences
  const updatedUser = { ...user, email_digest: emailDigest, email_alerts: emailAlerts, email_regression: emailRegression };
  return handleSettings(updatedUser, env, message);
}
