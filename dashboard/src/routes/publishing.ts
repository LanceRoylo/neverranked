/**
 * Publishing settings -- multi-CMS connection setup per client.
 *
 * Customer journey:
 *   1. GET  /publishing/:slug                       -> status + guided setup
 *   2. POST /publishing/:slug/save                  -> test credentials, encrypt, store
 *   3. POST /publishing/:slug/test                  -> re-test an existing connection
 *   4. POST /publishing/:slug/delete                -> remove the connection
 *   5. POST /publishing/:slug/restrictions          -> save brand-safety rules
 *   6. POST /publishing/:slug/unpause               -> resume a paused pipeline
 *
 * Amplify-gated (canUseDraftingFeature). Admins and agency admins can
 * manage on behalf of any client they have access to.
 *
 * Supported platforms: WordPress, Webflow, Shopify. Each platform has
 * its own form section -- a platform <select> at the top of the form
 * shows the right fields, all routed through the unified cms module.
 */

import type { Env, User } from "../types";
import { layout, html, esc, redirect } from "../render";
import { canAccessClient } from "../agency";
import { canUseDraftingFeature } from "../gating";
import {
  getConnection,
  getConnectionPublic,
  saveConnection,
  testConnection,
  deleteConnection,
  type CmsPlatform,
} from "../cms";

// ---------- per-platform form field rendering ----------

interface PlatformFormProps {
  slug: string;
  /** Current platform if a connection exists, used to preselect the
   *  picker. */
  currentPlatform: CmsPlatform | null;
  /** Existing redacted config so we can prefill what we know. */
  existingConfig: Record<string, unknown> | null;
}

function platformPicker(currentPlatform: CmsPlatform | null): string {
  const options: Array<{ value: CmsPlatform; label: string }> = [
    { value: "wordpress", label: "WordPress" },
    { value: "webflow", label: "Webflow" },
    { value: "shopify", label: "Shopify" },
  ];
  return `
    <div class="form-group" style="margin:0">
      <label>CMS platform</label>
      <select name="platform" id="cms-platform" style="width:100%" onchange="(function(picked){document.querySelectorAll('[data-platform-form]').forEach(function(el){el.style.display = (el.dataset.platformForm===picked)?'flex':'none'});})(this.value)">
        ${options.map(o => `<option value="${o.value}" ${currentPlatform === o.value ? "selected" : ""}>${o.label}</option>`).join("")}
      </select>
      <div style="font-size:11px;color:var(--text-faint);margin-top:4px">Pick the system your site runs on. We support self-hosted WordPress (with Application Passwords), Webflow CMS, and Shopify (custom apps).</div>
    </div>
  `;
}

function wpFormFields(props: PlatformFormProps, show: boolean): string {
  const cfg = (props.currentPlatform === "wordpress" ? props.existingConfig : null) as
    | { site_url?: string; wp_username?: string }
    | null;
  return `
    <div data-platform-form="wordpress" style="display:${show ? "flex" : "none"};flex-direction:column;gap:14px;margin-top:14px">
      <div style="padding:18px 22px;background:var(--bg-edge);border-left:2px solid var(--gold-dim);border-radius:0 3px 3px 0">
        <div class="label" style="margin-bottom:10px;color:var(--gold)">How to get an Application Password</div>
        <ol style="margin:0;padding-left:20px;font-size:13px;color:var(--text-soft);line-height:1.75">
          <li>Sign in to your WordPress admin.</li>
          <li>Go to <strong>Users &rarr; Profile</strong>.</li>
          <li>Scroll to <strong>Application Passwords</strong>. Type <code style="background:var(--bg);padding:1px 6px;border-radius:2px">NeverRanked</code> as the name and click <strong>Add New Application Password</strong>.</li>
          <li>WordPress shows a password like <code style="background:var(--bg);padding:1px 6px;border-radius:2px">xxxx xxxx xxxx xxxx xxxx xxxx</code>. Copy it (spaces are cosmetic).</li>
          <li>Paste it below along with your WordPress username and site URL.</li>
        </ol>
        <div style="margin-top:12px;font-size:12px;color:var(--text-faint)">Application Passwords are per-app, revocable, and never expose your real login. We store this encrypted with AES-GCM.</div>
      </div>
      <div class="form-group" style="margin:0">
        <label>WordPress site URL</label>
        <input type="text" name="wp_site_url" value="${esc(cfg?.site_url || "")}" placeholder="https://yoursite.com" style="width:100%">
      </div>
      <div class="form-group" style="margin:0">
        <label>WordPress username</label>
        <input type="text" name="wp_username" value="${esc(cfg?.wp_username || "")}" placeholder="your-wp-login" style="width:100%">
      </div>
      <div class="form-group" style="margin:0">
        <label>Application Password</label>
        <input type="password" name="wp_app_password" placeholder="${cfg ? "Leave blank to keep current" : "xxxx xxxx xxxx xxxx xxxx xxxx"}" style="width:100%">
        ${cfg ? `<div style="font-size:11px;color:var(--text-faint);margin-top:4px">Only fill this if you're rotating the password.</div>` : ""}
      </div>
    </div>
  `;
}

function webflowFormFields(props: PlatformFormProps, show: boolean): string {
  const cfg = (props.currentPlatform === "webflow" ? props.existingConfig : null) as
    | { site_id?: string; collection_id?: string }
    | null;
  return `
    <div data-platform-form="webflow" style="display:${show ? "flex" : "none"};flex-direction:column;gap:14px;margin-top:14px">
      <div style="padding:18px 22px;background:var(--bg-edge);border-left:2px solid var(--gold-dim);border-radius:0 3px 3px 0">
        <div class="label" style="margin-bottom:10px;color:var(--gold)">How to get a Webflow API token + IDs</div>
        <ol style="margin:0;padding-left:20px;font-size:13px;color:var(--text-soft);line-height:1.75">
          <li>In your Webflow Designer, open <strong>Site settings &rarr; Apps &amp; integrations</strong>.</li>
          <li>Under <strong>API access</strong>, click <strong>Generate API token</strong>. Give it CMS read &amp; write scopes. Copy it.</li>
          <li>Your <strong>Site ID</strong> is in the same panel (or at the end of the Webflow URL when editing the site).</li>
          <li>Open the CMS &rarr; pick the collection you want drafts to land in (typically "Blog posts"). The <strong>Collection ID</strong> is in Settings panel for that collection.</li>
          <li>Paste all three below.</li>
        </ol>
        <div style="margin-top:12px;font-size:12px;color:var(--text-faint)">Webflow tokens are revocable per site. We store encrypted (AES-GCM).</div>
      </div>
      <div class="form-group" style="margin:0">
        <label>Webflow Site ID</label>
        <input type="text" name="wf_site_id" value="${esc(cfg?.site_id || "")}" placeholder="abc123def456" style="width:100%">
      </div>
      <div class="form-group" style="margin:0">
        <label>Webflow Collection ID</label>
        <input type="text" name="wf_collection_id" value="${esc(cfg?.collection_id || "")}" placeholder="The CMS collection drafts publish to" style="width:100%">
      </div>
      <div class="form-group" style="margin:0">
        <label>Webflow API Token</label>
        <input type="password" name="wf_api_token" placeholder="${cfg ? "Leave blank to keep current" : "Site API token from Apps & integrations"}" style="width:100%">
        ${cfg ? `<div style="font-size:11px;color:var(--text-faint);margin-top:4px">Only fill this if you're rotating the token.</div>` : ""}
      </div>
    </div>
  `;
}

function shopifyFormFields(props: PlatformFormProps, show: boolean): string {
  const cfg = (props.currentPlatform === "shopify" ? props.existingConfig : null) as
    | { shop_domain?: string; blog_id?: string }
    | null;
  return `
    <div data-platform-form="shopify" style="display:${show ? "flex" : "none"};flex-direction:column;gap:14px;margin-top:14px">
      <div style="padding:18px 22px;background:var(--bg-edge);border-left:2px solid var(--gold-dim);border-radius:0 3px 3px 0">
        <div class="label" style="margin-bottom:10px;color:var(--gold)">How to get a Shopify access token</div>
        <ol style="margin:0;padding-left:20px;font-size:13px;color:var(--text-soft);line-height:1.75">
          <li>In Shopify Admin: <strong>Settings &rarr; Apps and sales channels &rarr; Develop apps</strong>.</li>
          <li>Click <strong>Create an app</strong>. Name it <code style="background:var(--bg);padding:1px 6px;border-radius:2px">NeverRanked</code>.</li>
          <li>Click <strong>Configure Admin API scopes</strong>. Enable <code style="background:var(--bg);padding:1px 6px;border-radius:2px">read_content</code> and <code style="background:var(--bg);padding:1px 6px;border-radius:2px">write_content</code>. Save.</li>
          <li>Click <strong>Install app</strong>. Shopify shows the <strong>Admin API access token</strong> once -- copy it.</li>
          <li>Your <strong>Blog ID</strong> is in <strong>Online Store &rarr; Blog posts</strong>; click into the blog and copy the numeric id from the URL.</li>
        </ol>
        <div style="margin-top:12px;font-size:12px;color:var(--text-faint)">The token is revocable. We store it encrypted (AES-GCM).</div>
      </div>
      <div class="form-group" style="margin:0">
        <label>Shopify shop domain</label>
        <input type="text" name="sh_shop_domain" value="${esc(cfg?.shop_domain || "")}" placeholder="yourshop.myshopify.com" style="width:100%">
      </div>
      <div class="form-group" style="margin:0">
        <label>Blog ID</label>
        <input type="text" name="sh_blog_id" value="${esc(cfg?.blog_id || "")}" placeholder="123456789" style="width:100%">
      </div>
      <div class="form-group" style="margin:0">
        <label>Admin API access token</label>
        <input type="password" name="sh_access_token" placeholder="${cfg ? "Leave blank to keep current" : "shpat_xxxxxxxx... from your custom app"}" style="width:100%">
        ${cfg ? `<div style="font-size:11px;color:var(--text-faint);margin-top:4px">Only fill this if you're rotating the token.</div>` : ""}
      </div>
    </div>
  `;
}

function renderUpgradeNudge(slug: string, user: User): string {
  return layout("Publishing", `
    <div style="margin-bottom:32px">
      <div class="label" style="margin-bottom:8px"><a href="/" style="color:var(--text-mute)">Dashboard</a> / ${esc(slug)}</div>
      <h1>Publishing</h1>
    </div>
    <div class="empty-hero">
      <div class="empty-hero-eyebrow">Amplify feature</div>
      <h2 class="empty-hero-title">Auto-publish drafts to your CMS.</h2>
      <p class="empty-hero-body">On the Amplify plan, every approved draft publishes straight to your CMS on its scheduled date -- no copy-paste. We support WordPress, Webflow, and Shopify. Connect once, then forget it exists. Upgrade to Amplify to enable publishing.</p>
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

  const conn = await getConnectionPublic(clientSlug, env);
  const settings = await env.DB.prepare(
    "SELECT content_restrictions, pipeline_paused_at, pipeline_pause_reason FROM client_settings WHERE client_slug = ?",
  ).bind(clientSlug).first<{ content_restrictions: string | null; pipeline_paused_at: number | null; pipeline_pause_reason: string | null }>();

  const formProps: PlatformFormProps = {
    slug: clientSlug,
    currentPlatform: conn?.platform || null,
    existingConfig: conn?.config_redacted || null,
  };
  // The picker preselects to current; if no connection yet, default WordPress.
  const initialPlatform: CmsPlatform = conn?.platform || "wordpress";

  const body = `
    <div style="margin-bottom:32px">
      <div class="label" style="margin-bottom:8px">
        <a href="/" style="color:var(--text-mute)">Dashboard</a> / ${esc(clientSlug)}
      </div>
      <h1>Publishing <em>settings</em></h1>
      <p class="section-sub" style="margin-top:8px;max-width:720px">Connect the CMS we'll publish approved drafts to. One-time setup. Drafts land as scheduled posts on their calendar date. Supports WordPress, Webflow, and Shopify.</p>
    </div>

    ${conn ? `
      <div class="card" style="margin-bottom:24px;border-color:var(--gold-dim)">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px;flex-wrap:wrap">
          <div>
            <div class="label" style="margin-bottom:4px;color:var(--gold)">Connected via ${esc(conn.platform.charAt(0).toUpperCase() + conn.platform.slice(1))}</div>
            <div style="font-family:var(--serif);font-size:20px;font-style:italic;color:var(--text)">${esc(conn.summary)}</div>
          </div>
          <div style="display:flex;gap:8px">
            <form method="POST" action="/publishing/${esc(clientSlug)}/test" style="display:inline">
              <button type="submit" class="btn btn-ghost">Re-test connection</button>
            </form>
            <form method="POST" action="/publishing/${esc(clientSlug)}/delete" style="display:inline" onsubmit="return confirm('Disconnect this CMS? Scheduled drafts will hold until reconnected.')">
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
      <h2 style="margin:0 0 12px;font-family:var(--serif);font-size:22px;font-style:italic">${conn ? "Update or switch CMS" : "Connect your CMS"}</h2>

      <form method="POST" action="/publishing/${esc(clientSlug)}/save" style="display:flex;flex-direction:column;gap:14px;max-width:640px">
        ${platformPicker(initialPlatform)}
        ${wpFormFields(formProps, initialPlatform === "wordpress")}
        ${webflowFormFields(formProps, initialPlatform === "webflow")}
        ${shopifyFormFields(formProps, initialPlatform === "shopify")}
        <div class="form-group" style="margin:14px 0 0">
          <label>Default post status</label>
          <select name="default_post_status" style="width:100%">
            <option value="future" ${(conn?.default_post_status || "future") === "future" ? "selected" : ""}>Scheduled (publish on calendar date)</option>
            <option value="publish" ${conn?.default_post_status === "publish" ? "selected" : ""}>Publish immediately on approval</option>
            <option value="draft" ${conn?.default_post_status === "draft" ? "selected" : ""}>Save as draft (manual publish)</option>
          </select>
          <div style="font-size:11px;color:var(--text-faint);margin-top:4px">Scheduled is the recommended default -- posts appear on the day we planned.</div>
        </div>
        <div style="display:flex;gap:10px;margin-top:6px">
          <button type="submit" class="btn">${conn ? "Update connection" : "Connect & test"}</button>
        </div>
      </form>
    </div>

    ${settings?.pipeline_paused_at ? `
      <div style="margin-top:32px;padding:16px 20px;background:rgba(201,168,76,.08);border:1px solid var(--gold-dim);border-radius:3px;max-width:720px">
        <div class="label" style="margin-bottom:8px;color:var(--gold)">Pipeline paused</div>
        <div style="font-size:13px;color:var(--text-soft);line-height:1.65;margin-bottom:12px">
          Your content pipeline is paused ${settings.pipeline_pause_reason === "two_rejections_in_a_row" ? "because you rejected two drafts in a row" : `(${esc(settings.pipeline_pause_reason || "manual")})`}. We've stopped generating new drafts until you're ready to resume. Approve any queued draft to automatically resume, or resume manually below.
        </div>
        <form method="POST" action="/publishing/${esc(clientSlug)}/unpause">
          <button type="submit" class="btn">Resume pipeline</button>
        </form>
      </div>
    ` : ""}

    <div class="card" style="margin-top:32px">
      <h2 style="margin:0 0 10px;font-family:var(--serif);font-size:22px;font-style:italic">Content rules</h2>
      <p style="font-size:13px;color:var(--text-soft);line-height:1.7;margin:0 0 14px;max-width:640px">Topics or phrasings the AI should never use in your drafts -- compliance requirements, brand guardrails, names of competitors we shouldn't mention, etc. These get injected into both the generation prompt and the QA scan, so anything that slips through still gets flagged.</p>
      <form method="POST" action="/publishing/${esc(clientSlug)}/restrictions" style="max-width:720px">
        <textarea name="content_restrictions" rows="6" placeholder="One rule per line. Examples:&#10;- Never recommend specific medications or dosages&#10;- Don't mention competitors by name&#10;- Avoid pricing claims; always link to /pricing instead&#10;- Never take political positions" style="width:100%;padding:12px 14px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:13px;line-height:1.6;border-radius:3px;resize:vertical">${esc(settings?.content_restrictions || "")}</textarea>
        <div style="display:flex;gap:10px;margin-top:10px;align-items:center">
          <button type="submit" class="btn btn-ghost">Save rules</button>
          <span style="font-size:11px;color:var(--text-faint)">Applied to every new draft and every QA scan.</span>
        </div>
      </form>
    </div>

    <div style="margin-top:32px;padding:18px 22px;background:var(--bg-lift);border:1px solid var(--line);border-radius:3px;max-width:720px">
      <div class="label" style="margin-bottom:8px">On Squarespace, Wix, or a custom CMS?</div>
      <div style="font-size:13px;color:var(--text-soft);line-height:1.7">
        Those platforms don't expose publishing APIs we can integrate cleanly. We'll deliver every approved draft as a publish-ready file (Markdown + HTML + meta + schema) and either you paste it or we publish on your behalf -- reach out at <a href="mailto:hello@neverranked.com" style="color:var(--gold)">hello@neverranked.com</a>.
      </div>
    </div>
  `;

  return html(layout("Publishing", body, user, clientSlug));
}

export async function handlePublishingRestrictions(clientSlug: string, request: Request, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) return redirect("/");
  if (!canUseDraftingFeature(user)) return redirect("/settings");

  const form = await request.formData();
  const text = String(form.get("content_restrictions") || "").trim();
  const value = text.length > 0 ? text : null;
  const now = Math.floor(Date.now() / 1000);

  await env.DB.prepare(
    `INSERT INTO client_settings (client_slug, content_restrictions, created_at, updated_at)
       VALUES (?, ?, ?, ?)
     ON CONFLICT(client_slug) DO UPDATE SET
       content_restrictions = excluded.content_restrictions,
       updated_at = excluded.updated_at`,
  ).bind(clientSlug, value, now, now).run();

  return redirect(`/publishing/${encodeURIComponent(clientSlug)}?flash=${encodeURIComponent("Content rules saved.")}`);
}

export async function handlePublishingUnpause(clientSlug: string, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) return redirect("/");
  if (!canUseDraftingFeature(user)) return redirect("/settings");
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE client_settings SET pipeline_paused_at = NULL, pipeline_pause_reason = NULL, updated_at = ? WHERE client_slug = ?",
  ).bind(now, clientSlug).run();
  return redirect(`/publishing/${encodeURIComponent(clientSlug)}?flash=${encodeURIComponent("Pipeline resumed.")}`);
}

export async function handlePublishingSave(clientSlug: string, request: Request, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) return redirect("/");
  if (!canUseDraftingFeature(user)) return redirect("/settings");

  const form = await request.formData();
  const platform = String(form.get("platform") || "wordpress") as CmsPlatform;
  const default_post_status = String(form.get("default_post_status") || "future") as "future" | "publish" | "draft";

  // Build platform-specific config from the submitted form. For the
  // password/token field we allow blank to mean "keep existing" -- we
  // copy the current encrypted value over instead of asking the
  // customer to retype on every settings save.
  const existing = await getConnection(clientSlug, env);
  const existingConfig = existing && existing.platform === platform
    ? (() => { try { return JSON.parse(existing.config_json); } catch { return {}; } })()
    : {};

  let config: any;
  if (platform === "wordpress") {
    const site_url = String(form.get("wp_site_url") || "").trim();
    const wp_username = String(form.get("wp_username") || "").trim();
    const newPw = String(form.get("wp_app_password") || "").trim();
    if (!site_url || !wp_username) {
      return redirect(`/publishing/${encodeURIComponent(clientSlug)}?error=${encodeURIComponent("Site URL and username are required.")}`);
    }
    config = {
      site_url,
      wp_username,
      wp_app_password: newPw || existingConfig.wp_app_password || "",
      seo_plugin: existingConfig.seo_plugin ?? null,
      default_category_id: existingConfig.default_category_id ?? null,
    };
    if (!config.wp_app_password) {
      return redirect(`/publishing/${encodeURIComponent(clientSlug)}?error=${encodeURIComponent("Application password is required.")}`);
    }
  } else if (platform === "webflow") {
    const site_id = String(form.get("wf_site_id") || "").trim();
    const collection_id = String(form.get("wf_collection_id") || "").trim();
    const newToken = String(form.get("wf_api_token") || "").trim();
    if (!site_id || !collection_id) {
      return redirect(`/publishing/${encodeURIComponent(clientSlug)}?error=${encodeURIComponent("Site ID and Collection ID are required.")}`);
    }
    config = {
      site_id,
      collection_id,
      api_token: newToken || existingConfig.api_token || "",
      field_map: existingConfig.field_map ?? null,
    };
    if (!config.api_token) {
      return redirect(`/publishing/${encodeURIComponent(clientSlug)}?error=${encodeURIComponent("API token is required.")}`);
    }
  } else if (platform === "shopify") {
    const shop_domain = String(form.get("sh_shop_domain") || "").trim();
    const blog_id = String(form.get("sh_blog_id") || "").trim();
    const newToken = String(form.get("sh_access_token") || "").trim();
    if (!shop_domain || !blog_id) {
      return redirect(`/publishing/${encodeURIComponent(clientSlug)}?error=${encodeURIComponent("Shop domain and blog ID are required.")}`);
    }
    config = {
      shop_domain,
      blog_id,
      access_token: newToken || existingConfig.access_token || "",
    };
    if (!config.access_token) {
      return redirect(`/publishing/${encodeURIComponent(clientSlug)}?error=${encodeURIComponent("Admin API access token is required.")}`);
    }
  } else {
    return redirect(`/publishing/${encodeURIComponent(clientSlug)}?error=${encodeURIComponent("Unsupported platform.")}`);
  }

  // If switching platforms, drop the existing connection first so the
  // new row replaces it (cms_connections is keyed by client_slug for
  // a single connection-per-client model).
  if (existing && existing.platform !== platform) {
    await deleteConnection(clientSlug, env);
  }

  const result = await saveConnection({
    client_slug: clientSlug,
    platform,
    config,
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
  await testConnection(clientSlug, env);
  return redirect(`/publishing/${encodeURIComponent(clientSlug)}`);
}

export async function handlePublishingDelete(clientSlug: string, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) return redirect("/");
  await deleteConnection(clientSlug, env);
  return redirect(`/publishing/${encodeURIComponent(clientSlug)}?flash=${encodeURIComponent("Disconnected.")}`);
}
