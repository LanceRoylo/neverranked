/**
 * Preview routes.
 *
 *   GET  /preview/<slug>                              — public, no auth, renders the brief
 *   POST /admin/warm-prospects/<id>/preview/build     — admin, generates a draft Preview
 *   GET  /admin/preview/<slug>/edit                   — admin, shows the editor
 *   POST /admin/preview/<slug>/edit                   — admin, saves edits
 *   POST /admin/preview/<slug>/publish                — admin, flips draft to published
 */

import type { Env, User } from "../types";
import { html, layout, esc, redirect } from "../render";
import {
  generatePreview,
  savePreviewDraft,
  getPreviewBySlug,
  getPreviewByProspectId,
  publishPreview,
  updatePreviewBody,
  recordPreviewView,
} from "../preview/generator";

// ===========================================================================
// Public Preview render. No auth. Logs a view on every load.
// ===========================================================================

export async function handlePreviewPublic(slug: string, env: Env): Promise<Response> {
  const preview = await getPreviewBySlug(env, slug);
  if (!preview) {
    return new Response(renderNotFound(), {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  if (preview.status === "archived") {
    return new Response(renderArchived(), {
      status: 410,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  // Log the view (best-effort).
  try { await recordPreviewView(env, slug); } catch { /* skip */ }

  return new Response(renderPreviewHtml(preview.meta_title || "Preview", preview.meta_description || "", preview.body_html), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Don't let search engines index Previews even if someone shares one.
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

function renderPreviewHtml(title: string, description: string, body: string): string {
  // Visual shell matches the look-and-feel of the existing /pitch/<slug>/
  // pages: dark background, serif headings, gold accent, generous spacing.
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <style>
    :root {
      --bg: #1a1814;
      --bg-lift: #221f1a;
      --line: #2f2a23;
      --text: #f5f1e6;
      --text-mute: #b3a99a;
      --text-faint: #7a7165;
      --gold: #bfa04d;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Georgia, "Source Serif Pro", serif;
      font-size: 17px;
      line-height: 1.65;
      -webkit-font-smoothing: antialiased;
    }
    .wrap {
      max-width: 720px;
      margin: 0 auto;
      padding: 64px 32px 96px;
    }
    .brand {
      font-family: Georgia, serif;
      font-style: italic;
      font-size: 18px;
      color: var(--gold);
      margin-bottom: 56px;
      letter-spacing: 0.02em;
    }
    .brand .small {
      font-style: normal;
      font-size: 11px;
      color: var(--text-faint);
      text-transform: uppercase;
      letter-spacing: 0.18em;
      margin-left: 6px;
      vertical-align: super;
    }
    h1, h2, h3 {
      font-family: Georgia, serif;
      font-weight: 600;
      color: var(--text);
      line-height: 1.25;
    }
    h1 { font-size: 32px; margin: 0 0 24px; }
    h2 { font-size: 22px; margin: 48px 0 16px; }
    h3 { font-size: 17px; margin: 28px 0 12px; }
    section { margin-bottom: 48px; }
    section.hero { margin-bottom: 56px; }
    section.proof {
      background: var(--bg-lift);
      border: 1px solid var(--line);
      border-radius: 4px;
      padding: 24px 28px;
    }
    section.next {
      border-top: 1px solid var(--line);
      padding-top: 32px;
    }
    a { color: var(--gold); text-decoration: underline; text-underline-offset: 3px; }
    strong { color: var(--text); }
    em { color: var(--gold); font-style: normal; font-weight: 600; }
    .footer {
      margin-top: 96px;
      padding-top: 24px;
      border-top: 1px dashed var(--line);
      font-family: monospace;
      font-size: 11px;
      color: var(--text-faint);
      letter-spacing: 0.06em;
    }
    .footer a { color: var(--text-faint); text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="brand">Never Ranked <span class="small">app</span></div>
    ${body}
    <div class="footer">
      Private brief. Built for one recipient. <a href="https://neverranked.com">neverranked.com</a>
    </div>
  </div>
</body>
</html>`;
}

function renderNotFound(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Not found</title><style>body{font-family:Georgia,serif;background:#1a1814;color:#b3a99a;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:32px}h1{color:#f5f1e6;font-weight:600;font-size:22px;margin:0 0 12px}p{margin:0;line-height:1.6}a{color:#bfa04d}</style></head><body><div><h1>Brief not found</h1><p>This Preview either does not exist or the link is wrong.<br><a href="https://neverranked.com">neverranked.com</a></p></div></body></html>`;
}

function renderArchived(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Archived</title><style>body{font-family:Georgia,serif;background:#1a1814;color:#b3a99a;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:32px}h1{color:#f5f1e6;font-weight:600;font-size:22px;margin:0 0 12px}p{margin:0;line-height:1.6}a{color:#bfa04d}</style></head><body><div><h1>This brief has been archived</h1><p>If you need a current version, reach out to Lance directly.<br><a href="https://neverranked.com">neverranked.com</a></p></div></body></html>`;
}

// ===========================================================================
// Admin: build a Preview for a prospect
//
// Two-step flow: GET shows a form collecting the prospect intel
// (name, company, domain, angle, finding). POST kicks off the
// generator with rich inputs so the output is personalized like the
// existing pitch/<slug>/ pages, not generic.
// ===========================================================================

export async function handlePreviewBuildForProspectGet(
  prospect_id: number, user: User, env: Env,
): Promise<Response> {
  if (user.role !== "admin") {
    return html(layout("Not authorized", `<div class="empty"><h3>Admin only</h3></div>`, user), 403);
  }
  // Existing Preview? Redirect straight to editor instead of re-collecting input.
  const existing = await getPreviewByProspectId(env, prospect_id);
  if (existing && (existing.status === "draft" || existing.status === "published")) {
    return redirect(`/admin/preview/${encodeURIComponent(existing.slug)}/edit`);
  }

  const cardStyle = "margin-bottom:18px;padding:22px 26px;background:var(--bg-lift);border:1px solid var(--line);border-radius:6px";

  const body = `
    <div style="margin-bottom:18px">
      <div class="label" style="margin-bottom:8px"><a href="/admin/warm-prospects/${prospect_id}" style="color:var(--text-mute)">Warm prospect #${prospect_id}</a> / Build Preview</div>
      <h1>Build <em>Preview</em></h1>
      <p style="color:var(--text-mute);margin-top:10px;line-height:1.6;font-size:14px;max-width:680px">
        Give the generator real prospect intel so the Preview reads like the pages you built for Greg, Shawn, and MVNP. The more specific you make these inputs, the more personalized the page. Lance can edit any line before publishing.
      </p>
    </div>

    <form method="POST" action="/admin/warm-prospects/${prospect_id}/preview/build" style="margin:0">
      <div style="${cardStyle}">
        <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--gold);margin-bottom:14px">Who is this for</div>

        <div style="margin-bottom:14px">
          <label style="display:block;font-size:12px;color:var(--text-mute);margin-bottom:6px">Recipient name</label>
          <input type="text" name="recipient_name" placeholder="e.g. Mark Cunningham" required style="width:100%;background:var(--bg-edge);color:var(--text);border:1px solid var(--line);padding:9px 12px;border-radius:3px;font-family:inherit;font-size:14px">
        </div>

        <div style="margin-bottom:14px">
          <label style="display:block;font-size:12px;color:var(--text-mute);margin-bottom:6px">Company name</label>
          <input type="text" name="company_name" placeholder="e.g. American Savings Bank" required style="width:100%;background:var(--bg-edge);color:var(--text);border:1px solid var(--line);padding:9px 12px;border-radius:3px;font-family:inherit;font-size:14px">
        </div>

        <div style="margin-bottom:14px">
          <label style="display:block;font-size:12px;color:var(--text-mute);margin-bottom:6px">Domain</label>
          <input type="text" name="domain" placeholder="e.g. asbhawaii.com" required style="width:100%;background:var(--bg-edge);color:var(--text);border:1px solid var(--line);padding:9px 12px;border-radius:3px;font-family:inherit;font-size:14px">
        </div>
      </div>

      <div style="${cardStyle}">
        <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--gold);margin-bottom:14px">What's the angle</div>
        <p style="color:var(--text-faint);font-size:12px;margin:0 0 14px;line-height:1.55">
          The headline finding or angle the Preview should lead with. Be specific. The Sonnet pass uses this verbatim as the page's hero claim.
        </p>
        <div style="margin-bottom:14px">
          <label style="display:block;font-size:12px;color:var(--text-mute);margin-bottom:6px">Headline finding (one sentence)</label>
          <textarea name="headline_finding" rows="2" placeholder="e.g. ASB is named in 0% of AI engine citations across the Hawaii community banking query set. FHB and BOH get named by default." required style="width:100%;background:var(--bg-edge);color:var(--text);border:1px solid var(--line);padding:10px 12px;border-radius:3px;font-family:inherit;font-size:14px;line-height:1.55;resize:vertical"></textarea>
        </div>

        <div style="margin-bottom:14px">
          <label style="display:block;font-size:12px;color:var(--text-mute);margin-bottom:6px">What we'd do for them (two or three sentences)</label>
          <textarea name="what_we_would_do" rows="3" placeholder="e.g. Deploy FinancialService and AggregateRating schema first month. Reddit FAQ generation cycle two. Citation tracking weekly from day one." required style="width:100%;background:var(--bg-edge);color:var(--text);border:1px solid var(--line);padding:10px 12px;border-radius:3px;font-family:inherit;font-size:14px;line-height:1.55;resize:vertical"></textarea>
        </div>

        <div style="margin-bottom:14px">
          <label style="display:block;font-size:12px;color:var(--text-mute);margin-bottom:6px">Anything else they should know (optional)</label>
          <textarea name="extra_context" rows="2" placeholder="Background on the conversation, specific competitors mentioned, time-sensitive context, etc." style="width:100%;background:var(--bg-edge);color:var(--text);border:1px solid var(--line);padding:10px 12px;border-radius:3px;font-family:inherit;font-size:14px;line-height:1.55;resize:vertical"></textarea>
        </div>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="submit" style="padding:10px 22px;background:var(--gold);color:#1a1814;border:0;font-weight:600;font-size:13px;border-radius:4px;cursor:pointer;font-family:inherit">Generate Preview</button>
        <a href="/admin/warm-prospects/${prospect_id}" style="padding:10px 22px;background:transparent;color:var(--text-mute);text-decoration:none;border:1px solid var(--line);font-weight:600;font-size:13px;border-radius:4px">Cancel</a>
      </div>
    </form>
  `;
  return html(layout("Build Preview", body, user));
}

export async function handlePreviewBuildForProspectPost(
  prospect_id: number, request: Request, user: User, env: Env,
): Promise<Response> {
  if (user.role !== "admin") return redirect("/");

  const existing = await getPreviewByProspectId(env, prospect_id);
  if (existing && (existing.status === "draft" || existing.status === "published")) {
    return redirect(`/admin/preview/${encodeURIComponent(existing.slug)}/edit`);
  }

  const form = await request.formData();
  const recipient_name = String(form.get("recipient_name") || "").trim();
  const company_name = String(form.get("company_name") || "").trim();
  const domain = String(form.get("domain") || "").trim();
  const headline_finding = String(form.get("headline_finding") || "").trim();
  const what_we_would_do = String(form.get("what_we_would_do") || "").trim();
  const extra_context = String(form.get("extra_context") || "").trim();

  const generated = await generatePreview(env, {
    prospect_id,
    recipient_name,
    company_name,
    domain,
    audit_findings: headline_finding,
    what_we_would_do,
    extra_context,
  });
  if (!generated) {
    return html(layout("Preview build failed", `<div class="empty"><h3>Preview generation failed</h3><p>Check that ANTHROPIC_API_KEY is set and try again.</p></div>`, user), 500);
  }
  const slug = await savePreviewDraft(env, {
    prospect_id, recipient_name, company_name, domain,
  }, generated);
  return redirect(`/admin/preview/${encodeURIComponent(slug)}/edit`);
}

// ===========================================================================
// Admin: edit + publish
// ===========================================================================

export async function handlePreviewEditGet(
  slug: string, user: User, env: Env,
): Promise<Response> {
  if (user.role !== "admin") {
    return html(layout("Not authorized", `<div class="empty"><h3>Admin only</h3></div>`, user), 403);
  }
  const preview = await getPreviewBySlug(env, slug);
  if (!preview) {
    return html(layout("Not found", `<div class="empty"><h3>Preview not found</h3></div>`, user), 404);
  }

  const cardStyle = "margin-bottom:18px;padding:20px 22px;background:var(--bg-lift);border:1px solid var(--line);border-radius:6px";
  const publicUrl = `https://app.neverranked.com/preview/${preview.slug}`;
  const isPublished = preview.status === "published";

  const body = `
    <div style="margin-bottom:8px">
      <div class="label" style="margin-bottom:8px">
        ${preview.prospect_id ? `<a href="/admin/warm-prospects/${preview.prospect_id}" style="color:var(--text-mute)">Warm prospect #${preview.prospect_id}</a> / ` : ""}
        Preview
      </div>
      <h1>Edit <em>Preview</em></h1>
    </div>

    <div style="${cardStyle}">
      <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:12px;margin-bottom:14px">
        <div>
          <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--gold);margin-bottom:6px">Status: ${esc(preview.status)}</div>
          <div style="color:var(--text-mute);font-size:13px;line-height:1.55">${preview.viewed_count > 0 ? `Viewed ${preview.viewed_count} time${preview.viewed_count === 1 ? "" : "s"}` : "Not viewed yet"}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <a href="${esc(publicUrl)}" target="_blank" rel="noopener" style="padding:8px 14px;background:transparent;color:var(--gold);text-decoration:none;font-size:12px;font-weight:600;border:1px solid var(--gold);border-radius:3px">Open public URL ↗</a>
          <button type="button" class="copy-btn" data-copy="${esc(publicUrl)}"
                  style="padding:8px 14px;background:transparent;color:var(--text-mute);border:1px solid var(--line);font-size:12px;font-weight:600;border-radius:3px;cursor:pointer;font-family:inherit">Copy URL</button>
        </div>
      </div>
      <div style="font-family:var(--mono);font-size:12px;color:var(--text-faint);padding:8px 12px;background:var(--bg-edge);border:1px solid var(--line);border-radius:3px">${esc(publicUrl)}</div>
    </div>

    <form method="POST" action="/admin/preview/${esc(preview.slug)}/edit" style="margin:0">
      <div style="${cardStyle}">
        <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--gold);margin-bottom:10px">Page title</div>
        <input type="text" name="meta_title" value="${esc(preview.meta_title || "")}" style="width:100%;background:var(--bg-edge);color:var(--text);border:1px solid var(--line);padding:8px 12px;border-radius:3px;font-family:inherit;font-size:14px;margin-bottom:14px">
        <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--gold);margin-bottom:10px">Meta description</div>
        <input type="text" name="meta_description" value="${esc(preview.meta_description || "")}" style="width:100%;background:var(--bg-edge);color:var(--text);border:1px solid var(--line);padding:8px 12px;border-radius:3px;font-family:inherit;font-size:14px">
      </div>
      <div style="${cardStyle}">
        <div style="font-family:var(--label);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--gold);margin-bottom:10px">Body (inner HTML)</div>
        <p style="color:var(--text-faint);font-size:12px;margin:0 0 10px;line-height:1.55">Edit the HTML directly. Sections are styled via the public template's CSS. Use &lt;section class="hero"&gt;, &lt;section class="proof"&gt;, &lt;section class="what-happens"&gt;, &lt;section class="next"&gt;.</p>
        <textarea name="body_html" rows="22" style="width:100%;background:var(--bg-edge);color:var(--text);border:1px solid var(--line);padding:12px;border-radius:3px;font-family:var(--mono);font-size:12.5px;line-height:1.55;resize:vertical">${esc(preview.body_html || "")}</textarea>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="submit" style="padding:10px 22px;background:var(--gold);color:#1a1814;border:0;font-weight:600;font-size:13px;border-radius:4px;cursor:pointer;font-family:inherit">Save changes</button>
        ${!isPublished ? `<button type="submit" formaction="/admin/preview/${esc(preview.slug)}/publish" style="padding:10px 22px;background:transparent;color:#7fc99a;border:1px solid #7fc99a;font-weight:600;font-size:13px;border-radius:4px;cursor:pointer;font-family:inherit">Save and publish</button>` : ""}
      </div>
    </form>

    <script>
      document.addEventListener('click', function(e) {
        const btn = e.target.closest('.copy-btn');
        if (!btn) return;
        e.preventDefault();
        const value = btn.getAttribute('data-copy') || '';
        if (!value || !navigator.clipboard) return;
        const orig = btn.textContent;
        navigator.clipboard.writeText(value).then(() => {
          btn.textContent = 'Copied';
          setTimeout(() => { btn.textContent = orig; }, 1400);
        });
      });
    </script>
  `;
  return html(layout("Preview · Edit", body, user));
}

export async function handlePreviewEditPost(
  slug: string, request: Request, user: User, env: Env,
): Promise<Response> {
  if (user.role !== "admin") return redirect("/");
  const preview = await getPreviewBySlug(env, slug);
  if (!preview) return redirect("/admin/warm-prospects");
  const form = await request.formData();
  const body_html = String(form.get("body_html") || preview.body_html);
  const meta_title = String(form.get("meta_title") || preview.meta_title || "");
  const meta_description = String(form.get("meta_description") || preview.meta_description || "");
  await env.DB.prepare(
    `UPDATE previews SET body_html = ?, meta_title = ?, meta_description = ?, updated_at = unixepoch() WHERE id = ?`,
  ).bind(body_html.trim(), meta_title.trim(), meta_description.trim(), preview.id).run();
  return redirect(`/admin/preview/${encodeURIComponent(slug)}/edit`);
}

export async function handlePreviewPublishPost(
  slug: string, request: Request, user: User, env: Env,
): Promise<Response> {
  if (user.role !== "admin") return redirect("/");
  const preview = await getPreviewBySlug(env, slug);
  if (!preview) return redirect("/admin/warm-prospects");
  // Also save any pending edits on the same form post.
  const form = await request.formData();
  const body_html = form.get("body_html");
  if (body_html !== null) {
    await updatePreviewBody(env, preview.id, String(body_html));
  }
  await publishPreview(env, preview.id);
  return redirect(`/admin/preview/${encodeURIComponent(slug)}/edit`);
}
