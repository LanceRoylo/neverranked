/**
 * Dashboard -- User settings
 *
 * Email preferences and account settings.
 */

import type { Env, User } from "../types";
import { layout, html, redirect, esc } from "../render";

export async function handleSettings(user: User, env: Env, flashMessage?: string): Promise<Response> {
  const flash = flashMessage
    ? `<div style="margin-bottom:24px;padding:14px 20px;background:var(--gold-wash);border:1px solid var(--gold-dim);border-radius:4px;font-size:13px;color:var(--gold)">${esc(flashMessage)}</div>`
    : "";

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

    <!-- Email preferences -->
    <div class="card">
      <div class="label" style="margin-bottom:16px">Email Preferences</div>

      <form method="POST" action="/settings/emails">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:var(--bg-edge);border-radius:4px;margin-bottom:12px">
          <div>
            <div style="font-size:14px;color:var(--text)">Weekly AEO digest</div>
            <div style="font-size:12px;color:var(--text-faint);margin-top:4px">Score, changes, and top action items every Monday</div>
          </div>
          <label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer">
            <input type="checkbox" name="email_digest" value="1" ${user.email_digest ? 'checked' : ''} style="opacity:0;width:0;height:0">
            <span style="position:absolute;inset:0;background:${user.email_digest ? 'var(--gold)' : 'var(--line)'};border-radius:12px;transition:background .2s"></span>
            <span style="position:absolute;top:2px;left:${user.email_digest ? '22px' : '2px'};width:20px;height:20px;background:var(--bg);border-radius:50%;transition:left .2s"></span>
          </label>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:var(--bg-edge);border-radius:4px;margin-bottom:16px">
          <div>
            <div style="font-size:14px;color:var(--text)">Score drop alerts</div>
            <div style="font-size:12px;color:var(--text-faint);margin-top:4px">Immediate notification when your score drops 5+ points</div>
          </div>
          <div style="font-size:12px;color:var(--text-faint);font-style:italic">Included with digest</div>
        </div>

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
  const now = Math.floor(Date.now() / 1000);

  await env.DB.prepare(
    "UPDATE users SET email_digest = ? WHERE id = ?"
  ).bind(emailDigest, user.id).run();

  // Return settings page with flash
  const message = emailDigest
    ? "Weekly digest enabled. You'll receive scan reports every Monday."
    : "Weekly digest disabled. You won't receive scan emails.";

  // Re-fetch user with updated preference
  const updatedUser = { ...user, email_digest: emailDigest };
  return handleSettings(updatedUser, env, message);
}
