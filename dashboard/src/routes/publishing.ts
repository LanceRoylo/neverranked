/**
 * Publishing settings -- WordPress connection setup per client.
 *
 * Customer journey:
 *   1. GET  /publishing/:slug      -> status + guided setup
 *   2. POST /publishing/:slug/save -> test credentials, encrypt, store
 *   3. POST /publishing/:slug/test -> re-test an existing connection
 *   4. POST /publishing/:slug/delete -> remove the connection
 *
 * Amplify-gated (canUseDraftingFeature). Admins and agency admins can
 * manage on behalf of any client they have access to.
 */

import type { Env, User } from "../types";
import { layout, html, esc, redirect } from "../render";
import { canAccessClient } from "../agency";
import { canUseDraftingFeature } from "../gating";
import { getConnection, saveConnection, testConnection, deleteConnection, decryptSecret } from "../wordpress";

function renderUpgradeNudge(slug: string, user: User): string {
  return layout("Publishing", `
    <div style="margin-bottom:32px">
      <div class="label" style="margin-bottom:8px"><a href="/" style="color:var(--text-mute)">Dashboard</a> / ${esc(slug)}</div>
      <h1>Publishing</h1>
    </div>
    <div class="empty-hero">
      <div class="empty-hero-eyebrow">Amplify feature</div>
      <h2 class="empty-hero-title">Auto-publish drafts to WordPress.</h2>
      <p class="empty-hero-body">On the Amplify plan, every approved draft publishes straight to your WordPress site on its scheduled date -- no copy-paste. Connect your site once, then forget it exists. Upgrade to Amplify to enable publishing.</p>
      <div class="empty-hero-actions">
        <a href="/settings" class="btn">See plans &rarr;</a>
      </div>
    </div>
  `, user, slug);
}

export async function handlePublishingGet(clientSlug: string, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }
  if (!canUseDraftingFeature(user)) {
    return html(renderUpgradeNudge(clientSlug, user));
  }

  const conn = await getConnection(clientSlug, env);
  const url = new URL("http://dummy?" + "");
  const flash = new URLSearchParams().get("flash"); // placeholder for later flash wiring

  const body = `
    <div style="margin-bottom:32px">
      <div class="label" style="margin-bottom:8px">
        <a href="/" style="color:var(--text-mute)">Dashboard</a> / ${esc(clientSlug)}
      </div>
      <h1>Publishing <em>settings</em></h1>
      <p class="section-sub" style="margin-top:8px;max-width:720px">Connect the WordPress site we'll publish approved drafts to. One-time setup. Drafts land in WordPress as scheduled posts on their calendar date.</p>
    </div>

    ${conn ? `
      <div class="card" style="margin-bottom:24px;border-color:var(--gold-dim)">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px;flex-wrap:wrap">
          <div>
            <div class="label" style="margin-bottom:4px;color:var(--gold)">Connected</div>
            <div style="font-family:var(--serif);font-size:20px;font-style:italic;color:var(--text)">${esc(conn.site_url)}</div>
            <div style="font-family:var(--mono);font-size:12px;color:var(--text-faint);margin-top:4px">User: ${esc(conn.wp_username)}${conn.seo_plugin ? ` &middot; SEO plugin: <strong style="color:var(--gold)">${esc(conn.seo_plugin)}</strong>` : ""}</div>
          </div>
          <div style="display:flex;gap:8px">
            <form method="POST" action="/publishing/${esc(clientSlug)}/test" style="display:inline">
              <button type="submit" class="btn btn-ghost">Re-test connection</button>
            </form>
            <form method="POST" action="/publishing/${esc(clientSlug)}/delete" style="display:inline" onsubmit="return confirm('Disconnect WordPress? Scheduled drafts will hold until reconnected.')">
              <button type="submit" class="btn btn-ghost" style="border-color:var(--red);color:var(--red)">Disconnect</button>
            </form>
          </div>
        </div>
        ${conn.last_test_status ? `
          <div style="font-family:var(--mono);font-size:12px;color:${conn.last_test_status === "ok" ? "var(--green)" : "var(--red)"};border-top:1px solid var(--line);padding-top:12px">
            ${conn.last_test_status === "ok" ? "&check; Last test passed" : "! Last test: " + esc(conn.last_test_status)}
            ${conn.last_tested_at ? ` &middot; ${new Date(conn.last_tested_at * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}
          </div>
        ` : ""}
      </div>
    ` : ""}

    <div class="card">
      <h2 style="margin:0 0 12px;font-family:var(--serif);font-size:22px;font-style:italic">${conn ? "Update" : "Connect"} your WordPress site</h2>

      <div style="margin-bottom:24px;padding:18px 22px;background:var(--bg-edge);border-left:2px solid var(--gold-dim);border-radius:0 3px 3px 0">
        <div class="label" style="margin-bottom:10px;color:var(--gold)">How to get an Application Password</div>
        <ol style="margin:0;padding-left:20px;font-size:13px;color:var(--text-soft);line-height:1.75">
          <li>Sign in to your WordPress admin.</li>
          <li>Go to <strong>Users &rarr; Profile</strong> (or Profile in the sidebar).</li>
          <li>Scroll to <strong>Application Passwords</strong>. Type <code style="background:var(--bg);padding:1px 6px;border-radius:2px">NeverRanked</code> as the name and click <strong>Add New Application Password</strong>.</li>
          <li>WordPress shows a password like <code style="background:var(--bg);padding:1px 6px;border-radius:2px">xxxx xxxx xxxx xxxx xxxx xxxx</code>. Copy it (spaces don't matter, we strip them).</li>
          <li>Paste it below along with your WordPress username and site URL.</li>
        </ol>
        <div style="margin-top:12px;font-size:12px;color:var(--text-faint)">Application Passwords are per-app, revocable, and never expose your real login. We store this encrypted with AES-GCM.</div>
      </div>

      <form method="POST" action="/publishing/${esc(clientSlug)}/save" style="display:flex;flex-direction:column;gap:14px;max-width:560px">
        <div class="form-group" style="margin:0">
          <label>WordPress site URL</label>
          <input type="text" name="site_url" value="${esc(conn?.site_url || "")}" placeholder="https://yoursite.com" required style="width:100%">
        </div>
        <div class="form-group" style="margin:0">
          <label>WordPress username</label>
          <input type="text" name="wp_username" value="${esc(conn?.wp_username || "")}" placeholder="your-wp-login" required style="width:100%">
        </div>
        <div class="form-group" style="margin:0">
          <label>Application Password</label>
          <input type="password" name="wp_app_password" placeholder="${conn ? "Leave blank to keep current" : "xxxx xxxx xxxx xxxx xxxx xxxx"}" ${conn ? "" : "required"} style="width:100%">
          ${conn ? `<div style="font-size:11px;color:var(--text-faint);margin-top:4px">Only fill this if you're rotating the password. Leave blank to keep the existing one.</div>` : ""}
        </div>
        <div class="form-group" style="margin:0">
          <label>Default post status</label>
          <select name="default_post_status" style="width:100%">
            <option value="future" ${(conn?.default_post_status || "future") === "future" ? "selected" : ""}>Scheduled (posts on calendar date)</option>
            <option value="publish" ${conn?.default_post_status === "publish" ? "selected" : ""}>Publish immediately on approval</option>
            <option value="draft" ${conn?.default_post_status === "draft" ? "selected" : ""}>Save as WordPress draft (manual publish)</option>
          </select>
          <div style="font-size:11px;color:var(--text-faint);margin-top:4px">Scheduled is the recommended default -- posts appear on the day we planned.</div>
        </div>
        <div style="display:flex;gap:10px;margin-top:6px">
          <button type="submit" class="btn">${conn ? "Update connection" : "Connect & test"}</button>
        </div>
      </form>
    </div>

    <!-- Safety net: if the customer's stack doesn't support app passwords -->
    <div style="margin-top:32px;padding:18px 22px;background:var(--bg-lift);border:1px solid var(--line);border-radius:3px;max-width:720px">
      <div class="label" style="margin-bottom:8px">Not on self-hosted WordPress?</div>
      <div style="font-size:13px;color:var(--text-soft);line-height:1.7">
        WordPress.com hosted sites don't support Application Passwords directly. Custom CMS integrations (Webflow, Ghost, Shopify) are on the roadmap. In the meantime, we can email you the finished draft plus a one-click copy-to-clipboard -- reach out at <a href="mailto:hello@neverranked.com" style="color:var(--gold)">hello@neverranked.com</a>.
      </div>
    </div>
  `;

  return html(layout("Publishing", body, user, clientSlug));
}

export async function handlePublishingSave(clientSlug: string, request: Request, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) {
    return redirect("/");
  }
  if (!canUseDraftingFeature(user)) {
    return redirect("/settings");
  }

  const form = await request.formData();
  const site_url = String(form.get("site_url") || "").trim();
  const wp_username = String(form.get("wp_username") || "").trim();
  const wp_app_password_raw = String(form.get("wp_app_password") || "").trim();
  const default_post_status = String(form.get("default_post_status") || "future") as "future" | "publish" | "draft";

  if (!site_url || !wp_username) {
    return redirect(`/publishing/${encodeURIComponent(clientSlug)}?error=${encodeURIComponent("Site URL and username are required.")}`);
  }

  // If the customer left the password blank on an existing connection,
  // reuse the current one rather than force re-entry.
  let wp_app_password = wp_app_password_raw;
  if (!wp_app_password) {
    const existing = await getConnection(clientSlug, env);
    if (!existing) {
      return redirect(`/publishing/${encodeURIComponent(clientSlug)}?error=${encodeURIComponent("Application password is required.")}`);
    }
    wp_app_password = await decryptSecret(existing.wp_app_password, env);
  }

  const result = await saveConnection({
    client_slug: clientSlug,
    site_url,
    wp_username,
    wp_app_password,
    default_post_status,
  }, env);

  if (!result.ok) {
    return redirect(`/publishing/${encodeURIComponent(clientSlug)}?error=${encodeURIComponent(result.detail)}`);
  }
  return redirect(`/publishing/${encodeURIComponent(clientSlug)}?flash=${encodeURIComponent("Connection saved.")}`);
}

export async function handlePublishingTest(clientSlug: string, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) return redirect("/");
  const conn = await getConnection(clientSlug, env);
  if (!conn) return redirect(`/publishing/${encodeURIComponent(clientSlug)}`);

  const pw = await decryptSecret(conn.wp_app_password, env);
  const r = await testConnection({ site_url: conn.site_url, wp_username: conn.wp_username, wp_app_password: pw });
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE wp_connections SET last_tested_at = ?, last_test_status = ?, seo_plugin = COALESCE(?, seo_plugin), updated_at = ? WHERE client_slug = ?",
  ).bind(now, r.ok ? "ok" : ("error: " + r.detail), r.seoPlugin, now, clientSlug).run();
  return redirect(`/publishing/${encodeURIComponent(clientSlug)}`);
}

export async function handlePublishingDelete(clientSlug: string, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) return redirect("/");
  await deleteConnection(clientSlug, env);
  return redirect(`/publishing/${encodeURIComponent(clientSlug)}?flash=${encodeURIComponent("Disconnected.")}`);
}
