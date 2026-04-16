/**
 * Dashboard -- Agency settings (white-label branding)
 *
 * Routes:
 *   GET  /agency/settings  -> form + live preview
 *   POST /agency/settings  -> validate + optional R2 logo upload + update row
 *   GET  /_assets/agency/:slug/:filename -> public R2 proxy for logos
 *
 * Logos are stored in R2 under:
 *   agency/<slug>/logo-<unix_ts>.<ext>
 * and served via /_assets/agency/<slug>/logo-<unix_ts>.<ext> so the URL
 * stays on our domain (no branding leak, no CORS dance) and cache-busts
 * automatically on replace via the timestamp.
 */

import type { Env, User, Agency } from "../types";
import { layout, html, esc, redirect } from "../render";
import { getAgency } from "../agency";

// ---------------------------------------------------------------------------
// Asset storage
// ---------------------------------------------------------------------------

const ALLOWED_LOGO_TYPES: Record<string, { ext: string; contentType: string }> = {
  "image/png":   { ext: "png", contentType: "image/png" },
  "image/jpeg":  { ext: "jpg", contentType: "image/jpeg" },
  "image/svg+xml": { ext: "svg", contentType: "image/svg+xml" },
  "image/webp":  { ext: "webp", contentType: "image/webp" },
};

const MAX_LOGO_BYTES = 500 * 1024; // 500 KB

function assetKey(slug: string, filename: string): string {
  // Keep the namespace flat: agency/<slug>/<filename>. Slug is already
  // alphanumeric + dash (enforced at agency creation), filename is
  // assembled by us below so there's no path-traversal surface.
  return `agency/${slug}/${filename}`;
}

function assetPublicUrl(slug: string, filename: string): string {
  return `/_assets/agency/${slug}/${filename}`;
}

/** Public proxy that streams an R2 object. Logos are public by intent. */
export async function handleAgencyAsset(
  slug: string,
  filename: string,
  env: Env
): Promise<Response> {
  // Reject anything that doesn't fit our naming pattern. Prevents someone
  // probing arbitrary keys in the bucket.
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]?$/.test(slug)) return new Response("Not found", { status: 404 });
  if (!/^logo-\d+\.(png|jpg|svg|webp)$/.test(filename)) return new Response("Not found", { status: 404 });

  const obj = await env.AGENCY_ASSETS.get(assetKey(slug, filename));
  if (!obj) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  // Logos are stable per filename thanks to the timestamp, so we can
  // cache them aggressively at the edge and in the browser.
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("etag", obj.httpEtag);
  return new Response(obj.body, { headers });
}

// ---------------------------------------------------------------------------
// Settings page (GET)
// ---------------------------------------------------------------------------

function renderSettingsPage(
  agency: Agency,
  user: User,
  flash: { ok?: string; error?: string } = {}
): Response {
  const color = agency.primary_color || "#c9a84c";
  const flashBlock = flash.ok
    ? `<div class="flash">${esc(flash.ok)}</div>`
    : flash.error
    ? `<div class="flash flash-error">${esc(flash.error)}</div>`
    : "";

  // Live preview: a mini mock of the topbar the client will see.
  // Driven by the color input so the user gets immediate feedback.
  const preview = `
    <div class="card" style="padding:0;overflow:hidden">
      <div class="label" style="padding:14px 20px;border-bottom:1px solid var(--line)">What your clients see</div>
      <div id="brand-preview" style="
          padding:16px 20px;display:flex;align-items:center;gap:16px;
          background:var(--bg-edge);border-bottom:1px solid var(--line)">
        ${agency.logo_url
          ? `<img src="${esc(agency.logo_url)}" alt="${esc(agency.name)}"
                  style="height:24px;max-width:180px;object-fit:contain" />`
          : `<span id="preview-name" style="font-family:var(--serif);font-size:18px">${esc(agency.name)}</span>`}
        <span style="margin-left:auto;font-family:var(--mono);font-size:12px;color:var(--text-faint)">topbar</span>
      </div>
      <div style="padding:20px">
        <a class="btn" id="preview-btn" style="pointer-events:none">Sample CTA</a>
      </div>
    </div>
  `;

  const body = `
    <div class="section-header">
      <h1>Agency Settings</h1>
      <p class="section-sub">Customize how your clients see the dashboard.</p>
    </div>

    ${flashBlock}

    <div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:24px;align-items:start">
      <div class="card">
        <form method="POST" action="/agency/settings" enctype="multipart/form-data">
          <div class="form-group">
            <label for="name">Agency name</label>
            <input id="name" name="name" type="text" maxlength="80" required value="${esc(agency.name)}" />
          </div>

          <div class="form-group">
            <label for="contact_email">Contact email</label>
            <input id="contact_email" name="contact_email" type="email" maxlength="200" required value="${esc(agency.contact_email)}" />
          </div>

          <div class="form-group">
            <label for="primary_color">Primary color</label>
            <div style="display:flex;gap:12px;align-items:center">
              <input id="primary_color" name="primary_color" type="color" value="${esc(color)}" />
              <input id="primary_color_text" type="text" value="${esc(color)}" maxlength="9"
                     style="font-family:var(--mono);max-width:140px" readonly />
            </div>
          </div>

          <div class="form-group">
            <label for="logo">Logo (PNG, JPG, SVG, or WebP; 500 KB max)</label>
            <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" />
            ${agency.logo_url ? `
              <p style="color:var(--text-faint);font-size:12px;margin-top:8px">
                Current: <a href="${esc(agency.logo_url)}" target="_blank">${esc(agency.logo_url)}</a>
              </p>` : ""}
          </div>

          <div style="display:flex;gap:12px;margin-top:24px">
            <button type="submit" class="btn">Save changes</button>
            <a href="/agency" class="btn btn-ghost">Cancel</a>
          </div>
        </form>
      </div>

      <div>${preview}</div>
    </div>

    <script>
      (function(){
        var color = document.getElementById('primary_color');
        var colorText = document.getElementById('primary_color_text');
        var name = document.getElementById('name');
        var preview = document.getElementById('brand-preview');
        var btn = document.getElementById('preview-btn');
        var previewName = document.getElementById('preview-name');
        function sync(){
          colorText.value = color.value;
          // Live CSS var override for the preview card only.
          btn.style.color = color.value;
          btn.style.borderColor = color.value;
          if (previewName) previewName.textContent = name.value;
        }
        color.addEventListener('input', sync);
        name.addEventListener('input', sync);
        sync();
      })();
    </script>
  `;

  return html(layout("Agency Settings", body, user));
}

export async function handleAgencySettingsGet(
  user: User,
  env: Env,
  url: URL
): Promise<Response> {
  // agency_admin only. Admins who want to edit an agency should use the
  // ops cockpit (or /agency?agency=slug to see the dashboard view).
  if (user.role !== "agency_admin" || !user.agency_id) return redirect("/");
  const agency = await getAgency(env, user.agency_id);
  if (!agency) return redirect("/");

  const flash: { ok?: string; error?: string } = {};
  if (url.searchParams.get("saved") === "1") flash.ok = "Settings saved.";
  const err = url.searchParams.get("error");
  if (err) flash.error = err;

  return renderSettingsPage(agency, user, flash);
}

// ---------------------------------------------------------------------------
// Settings submit (POST)
// ---------------------------------------------------------------------------

function sanitizeColor(raw: string): string | null {
  const m = /^#?([0-9a-fA-F]{6,8})$/.exec(raw.trim());
  if (!m) return null;
  return "#" + m[1].toLowerCase();
}

function sanitizeEmail(raw: string): string | null {
  const v = raw.trim();
  if (v.length === 0 || v.length > 200) return null;
  // Minimal validation -- good enough for a contact field; Stripe /
  // invite flow does the authoritative check later.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return null;
  return v;
}

export async function handleAgencySettingsPost(
  request: Request,
  user: User,
  env: Env
): Promise<Response> {
  if (user.role !== "agency_admin" || !user.agency_id) return redirect("/");
  const agency = await getAgency(env, user.agency_id);
  if (!agency) return redirect("/");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirect("/agency/settings?error=" + encodeURIComponent("Malformed form submission"));
  }

  const name = ((form.get("name") as string) || "").trim().slice(0, 80);
  const emailRaw = (form.get("contact_email") as string) || "";
  const colorRaw = (form.get("primary_color") as string) || "";
  const logoFile = form.get("logo");

  if (!name) return redirect("/agency/settings?error=" + encodeURIComponent("Name is required"));

  const email = sanitizeEmail(emailRaw);
  if (!email) return redirect("/agency/settings?error=" + encodeURIComponent("Contact email is invalid"));

  const color = sanitizeColor(colorRaw) || agency.primary_color;

  // Optional logo upload. We accept a typed File; empty file inputs
  // come through as a File with size=0, which we treat as "no change".
  let nextLogoUrl: string | null = agency.logo_url;

  if (logoFile && logoFile instanceof File && logoFile.size > 0) {
    const type = logoFile.type;
    const spec = ALLOWED_LOGO_TYPES[type];
    if (!spec) {
      return redirect("/agency/settings?error=" + encodeURIComponent("Logo type not supported. Use PNG, JPG, SVG, or WebP."));
    }
    if (logoFile.size > MAX_LOGO_BYTES) {
      return redirect("/agency/settings?error=" + encodeURIComponent("Logo is too large. Max 500 KB."));
    }

    const ts = Math.floor(Date.now() / 1000);
    const filename = `logo-${ts}.${spec.ext}`;
    const key = assetKey(agency.slug, filename);

    const buf = await logoFile.arrayBuffer();
    try {
      await env.AGENCY_ASSETS.put(key, buf, {
        httpMetadata: { contentType: spec.contentType },
      });
    } catch {
      return redirect("/agency/settings?error=" + encodeURIComponent("Upload failed. Try again."));
    }

    nextLogoUrl = assetPublicUrl(agency.slug, filename);
  }

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE agencies
        SET name = ?, contact_email = ?, primary_color = ?, logo_url = ?, updated_at = ?
      WHERE id = ?`
  ).bind(name, email, color, nextLogoUrl, now, agency.id).run();

  return redirect("/agency/settings?saved=1");
}
