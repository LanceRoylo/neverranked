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
  buildAutonomousPreview,
} from "../preview/generator";
import { getProspectWarmth } from "../outreach/warmth";

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
  // Fail-closed: only graded-and-cleared statuses are ever served. A
  // Preview the output-grader held ('held') -- or any unexpected
  // status -- must NOT render to a prospect even via a direct slug
  // hit, because the outreach email already contains this URL.
  if (preview.status !== "draft" && preview.status !== "published") {
    return new Response(renderNotFound(), {
      status: 404,
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
  // Visual shell ported from the hand-crafted /pitch/<slug>/ pages
  // (Playfair/DM Mono/Barlow, #121212 + gold, grain + vignette,
  // numbered legal-section device, signed footer, print-to-PDF).
  // `body` carries the generator's page-hero + numbered legal-sections
  // + signed close. Marketing-site nav/hamburger intentionally omitted
  // — a Preview is one focused brief, not the full site.
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#080808">
  <meta name="robots" content="noindex, nofollow">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=DM+Mono:ital,wght@0,300;0,400;0,500&family=Barlow+Condensed:wght@300;400;500;600&display=swap">
  <style>
    :root{
      --bg:#121212;--bg-lift:#1c1c1c;--bg-edge:#242424;
      --gold:#e8c767;--gold-dim:#bfa04d;--gold-wash:rgba(232,199,103,.14);
      --text:#fbf8ef;--text-soft:rgba(251,248,239,.98);--text-mute:rgba(251,248,239,.86);
      --text-faint:rgba(251,248,239,.78);--line:rgba(251,248,239,.28);--line-strong:rgba(251,248,239,.44);
      --serif:"Playfair Display",Georgia,serif;
      --mono:"DM Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
      --label:"Barlow Condensed","Arial Narrow",sans-serif;
      --gutter:clamp(20px,4vw,64px);--max:1080px;
    }
    *,*::before,*::after{box-sizing:border-box}
    html,body{margin:0;padding:0}
    html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
    body{background:var(--bg);color:var(--text);font-family:var(--mono);font-size:14px;line-height:1.65;font-weight:400;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;overflow-x:hidden}
    a{color:inherit;text-decoration:none}
    ::selection{background:var(--gold);color:var(--bg)}
    .grain{position:fixed;inset:-50%;width:200%;height:200%;pointer-events:none;z-index:100;opacity:.14;mix-blend-mode:overlay;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .55 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");background-size:260px 260px;animation:grain 1.2s steps(6) infinite}
    @keyframes grain{0%{transform:translate(0,0)}20%{transform:translate(-3%,2%)}40%{transform:translate(2%,-3%)}60%{transform:translate(-2%,-2%)}80%{transform:translate(3%,3%)}100%{transform:translate(0,0)}}
    body::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:99;background:radial-gradient(120% 80% at 50% 0%,transparent 40%,rgba(0,0,0,.45) 100%),radial-gradient(80% 60% at 50% 100%,transparent 45%,rgba(0,0,0,.4) 100%)}
    .wrap{width:100%;max-width:var(--max);margin:0 auto;padding:0 var(--gutter);position:relative}
    .nav{position:fixed;top:0;left:0;right:0;z-index:80;padding:22px var(--gutter);display:flex;align-items:center;mix-blend-mode:difference;color:#f0ece3}
    .nav .mark{font-family:var(--serif);font-style:italic;font-size:20px;letter-spacing:-.01em}
    .nav .mark sup{font-family:var(--label);font-style:normal;font-size:11px;letter-spacing:.2em;margin-left:4px;vertical-align:super;opacity:.78}
    .page-hero{padding:180px 0 80px;border-bottom:1px solid var(--line)}
    .page-hero h1{font-family:var(--serif);font-weight:400;font-size:clamp(32px,5vw,56px);line-height:1.1;letter-spacing:-.02em;margin:0 0 16px}
    .page-hero .updated{font-family:var(--label);text-transform:uppercase;letter-spacing:.18em;font-size:11px;color:var(--text-faint)}
    .legal-section{padding:60px 0;border-bottom:1px solid var(--line)}
    .section-label{display:flex;align-items:center;gap:14px;font-family:var(--label);text-transform:uppercase;letter-spacing:.22em;font-size:11px;color:var(--text-mute);margin-bottom:32px}
    .section-label .num{color:var(--gold);font-weight:500}
    .section-label .rule{flex:1;height:1px;background:var(--line)}
    .compare{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line);border:1px solid var(--line);margin:28px 0;border-radius:2px;overflow:hidden}
    .compare .col{background:var(--bg);padding:24px 22px}
    .compare .col:last-child{background:var(--gold-wash)}
    .compare .col-h{font-family:var(--label);text-transform:uppercase;letter-spacing:.18em;font-size:11px;color:var(--gold);border-bottom:1px solid var(--line);padding-bottom:10px;margin-bottom:14px}
    .compare ul{margin:0;padding-left:18px;max-width:none}
    .compare li{margin-bottom:10px;font-size:13px;color:var(--text-mute)}
    @media (max-width:640px){.compare{grid-template-columns:1fr}}
    h2{font-family:var(--serif);font-weight:400;font-size:clamp(22px,3vw,32px);line-height:1.2;letter-spacing:-.01em;margin:0 0 18px;color:var(--text)}
    h3{font-family:var(--serif);font-weight:500;font-size:18px;margin:24px 0 10px;color:var(--text)}
    p{color:var(--text-soft);max-width:62ch;line-height:1.7;margin:0 0 16px}
    ul{color:var(--text-soft);max-width:62ch;line-height:1.7;margin:0 0 16px;padding-left:20px}
    li{margin-bottom:8px}
    p a,ul a,li a{color:var(--gold);text-decoration:underline;text-underline-offset:3px}
    p a:hover,ul a:hover{opacity:.8}
    strong,b{color:var(--text);font-weight:600}
    em{color:var(--gold);font-style:italic}
    pre{background:var(--bg-edge);color:var(--text-soft);border:1px solid var(--line);font-size:12px;line-height:1.5;padding:14px;margin:14px 0;white-space:pre-wrap;word-break:break-word;overflow:auto;font-family:var(--mono);border-radius:2px}
    code{background:var(--bg-edge);padding:1px 5px;border-radius:2px;font-size:12px;font-family:var(--mono)}
    .sign{font-family:var(--serif);font-style:italic;font-size:20px;color:var(--text);margin:6px 0 2px}
    .legal-footer{border-top:1px solid var(--line);padding:40px 0;display:flex;justify-content:space-between;align-items:center;font-family:var(--label);text-transform:uppercase;letter-spacing:.18em;font-size:10px;color:var(--text-faint)}
    .legal-footer a:hover{color:var(--gold)}
    .print-btn{position:fixed;bottom:24px;right:24px;background:var(--gold);color:var(--bg);border:none;padding:12px 18px;font-family:var(--label);text-transform:uppercase;letter-spacing:.18em;font-size:11px;cursor:pointer;border-radius:2px;box-shadow:0 6px 24px rgba(0,0,0,.4);z-index:50}
    .print-btn:hover{background:var(--gold-dim)}
    @page{size:letter;margin:.5in}
    @media print{
      html,body{background:#fff !important;color:#0a0a0a !important;font-size:10pt;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{font-family:"Playfair Display",Georgia,serif !important}
      body::before,.grain,.no-print,.print-btn,.nav{display:none !important}
      .wrap{max-width:none !important;padding:0 !important;width:100% !important}
      *{position:static !important;box-shadow:none !important}
      .page-hero{padding:0 0 14pt !important;border-bottom:1px solid #999;margin-bottom:14pt}
      .page-hero h1{font-size:20pt !important;line-height:1.15 !important;margin:0 0 8pt !important;color:#0a0a0a !important;font-family:"Playfair Display",Georgia,serif !important}
      .page-hero h1 em{color:#9c7a1f !important;font-style:italic}
      .page-hero .updated{color:#666 !important;font-family:Arial,sans-serif !important;font-size:8pt !important;letter-spacing:.12em}
      .legal-section{padding:12pt 0 !important;border-bottom:1px solid #ccc !important;break-inside:auto}
      .legal-section:last-child{border-bottom:none !important}
      .section-label{margin-bottom:8pt !important;color:#444 !important;font-family:Arial,sans-serif !important;font-size:8pt !important;letter-spacing:.16em}
      .section-label .num{color:#9c7a1f !important;font-weight:600}
      .section-label .rule{background:#ccc !important}
      h2{font-size:13pt !important;color:#0a0a0a !important;margin:0 0 6pt !important;font-family:"Playfair Display",Georgia,serif !important}
      h3{font-size:11pt !important;color:#0a0a0a !important;margin:0 0 4pt !important;font-family:"Playfair Display",Georgia,serif !important;font-weight:500}
      p,ul,ol{color:#1a1a1a !important;max-width:none !important;margin:0 0 6pt !important;orphans:3;widows:3;font-family:Georgia,"Times New Roman",serif !important}
      ul,ol{padding-left:18pt !important}
      li{margin-bottom:3pt !important;color:#1a1a1a !important}
      b,strong{color:#0a0a0a !important;font-weight:600}
      p a,ul a,li a,a{color:#9c7a1f !important;text-decoration:underline}
      .sign{color:#0a0a0a !important}
      .compare{display:grid !important;grid-template-columns:1fr 1fr !important;gap:0 !important;border:1px solid #ccc !important;background:#fff !important;page-break-inside:avoid;break-inside:avoid;margin:8pt 0 !important}
      .compare .col{background:#fff !important;padding:8pt !important;border-right:1px solid #ccc}
      .compare .col:last-child{background:#faf7ec !important;border-right:none}
      .compare .col-h{color:#9c7a1f !important;font-family:Arial,sans-serif !important;font-size:8pt !important;border-bottom:1px solid #ccc !important}
      .compare li{color:#1a1a1a !important;font-size:8.5pt !important;font-family:Georgia,serif !important}
      .legal-footer{display:none !important}
      a[href^="http"]:after{content:" (" attr(href) ")";font-size:7pt;color:#666;font-family:"DM Mono",monospace;word-break:break-all}
      a[href^="mailto:"]:after{content:""}
    }
  </style>
</head>
<body>
  <div class="grain"></div>
  <nav class="nav"><span class="mark">Never Ranked<sup>app</sup></span></nav>
  <div class="wrap">
    ${body}
    <div class="legal-footer"><span>Private brief. Built for one recipient.</span><a href="https://neverranked.com">neverranked.com</a></div>
  </div>
  <button class="print-btn no-print" onclick="window.print()">Save as PDF</button>
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

/**
 * Autonomous Build Preview.
 *
 * POST only. No form. The flow:
 *   1. Look up prospect metadata from outreach_prospects (synced via
 *      /api/admin/sync-prospects from the local outreach tool)
 *   2. Pull the prospect's signal tier from the warmth scoring
 *   3. Auto-enrich the domain via a lightweight homepage scan
 *   4. Sonnet generates the Preview with depth scaled to tier
 *   5. Redirect to the editor for any final tweaks
 *
 * Failures redirect back to the warm-prospect detail page with an
 * explanation surfaced via query string (so we don't hit a dead-end
 * page when sync hasn't happened yet).
 */
export async function handlePreviewBuildForProspectPost(
  prospect_id: number, _request: Request, user: User, env: Env,
): Promise<Response> {
  if (user.role !== "admin") return redirect("/");

  // Existing Preview? Skip straight to editor.
  const existing = await getPreviewByProspectId(env, prospect_id);
  if (existing && (existing.status === "draft" || existing.status === "published")) {
    return redirect(`/admin/preview/${encodeURIComponent(existing.slug)}/edit`);
  }

  // Look up the prospect's signal tier so the Preview depth scales.
  const allWarmth = await getProspectWarmth(env);
  const warmth = allWarmth.find((p) => p.prospect_id === prospect_id);
  if (!warmth) {
    return redirect(`/admin/warm-prospects/${prospect_id}?build_error=${encodeURIComponent("Prospect is not in the warmth list (needs at least 2 opens)")}`);
  }

  const result = await buildAutonomousPreview(env, prospect_id, warmth.tier === "cold" ? "warm" : warmth.tier, warmth.open_count);
  if ("error" in result) {
    return redirect(`/admin/warm-prospects/${prospect_id}?build_error=${encodeURIComponent(result.error)}`);
  }
  return redirect(`/admin/preview/${encodeURIComponent(result.slug)}/edit`);
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
