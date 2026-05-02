/**
 * Weekly AEO Brief routes.
 *
 *   GET /weekly                  -- public archive list
 *   GET /weekly/<slug>           -- public detail page
 *   GET /admin/weekly-brief/<id> -- admin review surface (drafts visible)
 *   POST /admin/weekly-brief/<id>/approve  -- publishes
 *   POST /admin/weekly-brief/<id>/reject   -- soft-deletes
 *   POST /admin/weekly-brief/regenerate    -- triggers a fresh draft for current week
 *
 * The public pages are SEO-relevant -- JSON-LD Article schema, clean
 * meta tags, indexable. Same layout as /changelog (no dashboard chrome,
 * no auth gate).
 */

import type { Env, User } from "../types";
import { layout, html, esc, redirect } from "../render";
import { CSS } from "../styles";
import {
  getPublishedBrief, listPublishedBriefs,
  publishBrief, rejectBrief,
  generateWeeklyBrief,
} from "../weekly-brief-generator";

// ---------- Markdown -> HTML (lightweight, same approach as other public pages) ----------

function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** Minimal Markdown renderer: H2/H3, paragraphs, bullet lists, **bold**,
 *  *italic*, `code`, links. Sufficient for what the brief generator emits. */
function renderMarkdown(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inUl = false;
  const inline = (s: string) => escHtml(s)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
  const flushUl = () => { if (inUl) { out.push("</ul>"); inUl = false; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushUl(); continue; }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^###\s+(.*)$/))) { flushUl(); out.push(`<h3>${inline(m[1])}</h3>`); continue; }
    if ((m = line.match(/^##\s+(.*)$/)))  { flushUl(); out.push(`<h2>${inline(m[1])}</h2>`); continue; }
    if ((m = line.match(/^\*\s+(.*)$|^-\s+(.*)$/))) {
      if (!inUl) { out.push("<ul>"); inUl = true; }
      out.push(`<li>${inline(m[1] ?? m[2])}</li>`);
      continue;
    }
    flushUl();
    out.push(`<p>${inline(line)}</p>`);
  }
  flushUl();
  return out.join("\n");
}

function fmtDate(unixTs: number): string {
  return new Date(unixTs * 1000).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

// ---------- Public archive ----------

export async function handleWeeklyList(env: Env): Promise<Response> {
  const briefs = await listPublishedBriefs(env, 50);

  const items = briefs.length === 0
    ? `<p style="color:var(--text-mute);font-size:14px;line-height:1.6">No briefs published yet. The first weekly observation feed lands soon.</p>`
    : briefs.map(b => `
        <article style="border-bottom:1px solid var(--line);padding:24px 0">
          <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint);margin-bottom:6px">${fmtDate(b.published_at)}</div>
          <h2 style="margin:0 0 8px;font-family:var(--serif);font-size:22px;font-weight:400;font-style:italic"><a href="/weekly/${esc(b.slug)}" style="color:var(--text);text-decoration:none">${esc(b.title)}</a></h2>
          <p style="color:var(--text-soft);font-size:14px;line-height:1.6;margin:0">${esc(b.summary)}</p>
        </article>`).join("");

  const body = `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Weekly AEO Brief — Never Ranked</title>
<meta name="description" content="What we observed across AI engine citations this week. Published every Friday by Never Ranked.">
<link rel="canonical" href="https://app.neverranked.com/weekly">
<meta property="og:type" content="website">
<meta property="og:title" content="Weekly AEO Brief — Never Ranked">
<meta property="og:description" content="What we observed across AI engine citations this week. Published every Friday by Never Ranked.">
<style>${CSS}</style>
</head>
<body>
<main style="max-width:760px;margin:0 auto;padding:64px 24px">
  <header style="margin-bottom:48px">
    <div class="label" style="margin-bottom:12px">Never Ranked</div>
    <h1 style="font-family:var(--serif);font-size:clamp(36px,5vw,52px);font-weight:400;line-height:1.1;margin:0">The Weekly <em>AEO Brief</em></h1>
    <p style="color:var(--text-mute);font-size:15px;line-height:1.6;margin-top:16px;max-width:600px">Anonymized observations from across our tracked clients on what AI engines (ChatGPT, Perplexity, Gemini, Claude) are citing, what's surging on Reddit, and where the share is shifting. Published Fridays.</p>
  </header>
  <section>${items}</section>
  <footer style="margin-top:64px;padding-top:24px;border-top:1px solid var(--line);font-size:12px;color:var(--text-faint)">
    <a href="/" style="color:var(--text-mute)">Dashboard</a> &middot; <a href="/changelog" style="color:var(--text-mute)">Changelog</a> &middot; <a href="https://neverranked.com" style="color:var(--text-mute)">neverranked.com</a>
  </footer>
</main>
</body>
</html>`;

  return new Response(body, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300, s-maxage=600" },
  });
}

// ---------- Public detail ----------

export async function handleWeeklyDetail(slug: string, env: Env): Promise<Response> {
  const brief = await getPublishedBrief(env, slug);
  if (!brief) {
    return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  }

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: brief.title,
    description: brief.summary,
    datePublished: new Date(brief.published_at * 1000).toISOString(),
    author: { "@type": "Organization", name: "Never Ranked", url: "https://neverranked.com" },
    publisher: { "@type": "Organization", name: "Never Ranked", url: "https://neverranked.com" },
    url: `https://app.neverranked.com/weekly/${slug}`,
  };

  const body = `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(brief.title)} — Never Ranked Weekly Brief</title>
<meta name="description" content="${escHtml(brief.summary)}">
<link rel="canonical" href="https://app.neverranked.com/weekly/${escHtml(slug)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escHtml(brief.title)}">
<meta property="og:description" content="${escHtml(brief.summary)}">
<meta property="article:published_time" content="${new Date(brief.published_at * 1000).toISOString()}">
<script type="application/ld+json">${JSON.stringify(articleSchema)}</script>
<style>${CSS}
.brief-body h2 { font-family: var(--serif); font-size: 24px; font-weight: 400; font-style: italic; margin: 36px 0 14px; color: var(--text); }
.brief-body h3 { font-family: var(--serif); font-size: 18px; font-weight: 400; margin: 28px 0 10px; color: var(--text-soft); }
.brief-body p  { font-size: 15px; line-height: 1.7; color: var(--text-soft); margin: 0 0 16px; }
.brief-body ul { padding-left: 20px; margin: 0 0 16px; }
.brief-body li { font-size: 15px; line-height: 1.7; color: var(--text-soft); margin-bottom: 6px; }
.brief-body code { background: var(--bg-edge); padding: 1px 6px; border-radius: 2px; font-size: 13px; font-family: var(--mono); }
.brief-body strong { color: var(--text); font-weight: 500; }
.brief-body a { color: var(--gold); }
</style>
</head>
<body>
<main style="max-width:740px;margin:0 auto;padding:48px 24px 64px">
  <header style="margin-bottom:32px">
    <div class="label" style="margin-bottom:10px"><a href="/weekly" style="color:var(--text-mute)">Weekly Brief</a> &middot; <span style="color:var(--text-faint)">${fmtDate(brief.published_at)}</span></div>
    <h1 style="font-family:var(--serif);font-size:clamp(28px,4vw,40px);font-weight:400;line-height:1.15;margin:0">${escHtml(brief.title)}</h1>
    <p style="color:var(--text-mute);font-size:16px;line-height:1.55;margin-top:14px">${escHtml(brief.summary)}</p>
  </header>
  <article class="brief-body">${renderMarkdown(brief.body_markdown)}</article>
  <footer style="margin-top:64px;padding-top:24px;border-top:1px solid var(--line);font-size:12px;color:var(--text-faint)">
    <a href="/weekly" style="color:var(--text-mute)">&larr; All briefs</a> &middot; <a href="/" style="color:var(--text-mute)">Dashboard</a> &middot; <a href="https://neverranked.com" style="color:var(--text-mute)">neverranked.com</a>
  </footer>
</main>
</body>
</html>`;

  return new Response(body, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=600, s-maxage=1800" },
  });
}

// ---------- Admin review ----------

export async function handleAdminBriefView(briefId: number, user: User, env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT id, slug, title, summary, body_markdown, status, generated_at, approved_at,
            data_snapshot
       FROM weekly_briefs WHERE id = ?`,
  ).bind(briefId).first<{
    id: number; slug: string; title: string; summary: string; body_markdown: string;
    status: string; generated_at: number; approved_at: number | null; data_snapshot: string | null;
  }>();

  if (!row) {
    return html(layout("Brief not found", `<div class="empty"><h3>Brief not found</h3></div>`, user), 404);
  }

  const isDraft = row.status === "draft";
  const actions = isDraft ? `
    <div style="border:1px solid var(--line);border-radius:6px;padding:20px;margin-top:24px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <form method="POST" action="/admin/weekly-brief/${row.id}/approve" style="margin:0">
        <button type="submit" class="btn">Approve &amp; publish</button>
      </form>
      <form method="POST" action="/admin/weekly-brief/${row.id}/reject" style="margin:0">
        <button type="submit" class="btn btn-ghost">Reject</button>
      </form>
      <form method="POST" action="/admin/weekly-brief/regenerate" style="margin:0">
        <input type="hidden" name="overwrite_id" value="${row.id}">
        <button type="submit" class="btn btn-ghost">Regenerate</button>
      </form>
      <span style="color:var(--text-mute);font-size:12px;margin-left:auto">Approving publishes to <a href="/weekly/${esc(row.slug)}" style="color:var(--text)">/weekly/${esc(row.slug)}</a></span>
    </div>
  ` : `
    <div style="border:1px solid var(--line);border-radius:6px;padding:16px;margin-top:24px;color:var(--text-mute);font-size:13px">
      Status: <strong style="color:${row.status === "published" ? "var(--green)" : "var(--red)"}">${esc(row.status)}</strong>
      ${row.approved_at ? ` &middot; ${new Date(row.approved_at * 1000).toLocaleString()}` : ""}
      ${row.status === "published" ? ` &middot; <a href="/weekly/${esc(row.slug)}" style="color:var(--text);text-decoration:underline">View public</a>` : ""}
    </div>
  `;

  const body = `
    <div style="margin-bottom:24px">
      <div class="label" style="margin-bottom:8px"><a href="/admin" style="color:var(--text-mute)">Admin</a> / Weekly Brief / ${esc(row.slug)}</div>
      <h1>${esc(row.title)}</h1>
      <p style="color:var(--text-mute);margin-top:8px">${esc(row.summary)}</p>
    </div>

    ${actions}

    <div style="margin-top:32px;padding:24px;border:1px solid var(--line);border-radius:6px;background:var(--bg-lift)">
      <div class="brief-body" style="font-size:15px;line-height:1.7;color:var(--text-soft)">${renderMarkdown(row.body_markdown)}</div>
    </div>

    <details style="margin-top:24px;border:1px solid var(--line);border-radius:6px;padding:16px">
      <summary style="cursor:pointer;font-family:var(--label);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-mute)">Data snapshot fed to the generator</summary>
      <pre style="margin-top:12px;font-family:var(--mono);font-size:12px;color:var(--text-soft);background:var(--bg-edge);padding:14px;border-radius:4px;overflow-x:auto">${esc(row.data_snapshot ?? "(none)")}</pre>
    </details>

    <style>
      .brief-body h2 { font-family: var(--serif); font-size: 22px; font-weight: 400; font-style: italic; margin: 28px 0 12px; color: var(--text); }
      .brief-body h3 { font-family: var(--serif); font-size: 16px; font-weight: 400; margin: 24px 0 8px; color: var(--text-soft); }
      .brief-body p  { margin: 0 0 14px; }
      .brief-body ul { padding-left: 20px; margin: 0 0 14px; }
      .brief-body strong { color: var(--text); }
      .brief-body code { background: var(--bg-edge); padding: 1px 5px; border-radius: 2px; font-size: 13px; }
    </style>
  `;

  return html(layout("Weekly brief", body, user));
}

export async function handleAdminBriefApprove(briefId: number, user: User, env: Env): Promise<Response> {
  await publishBrief(env, briefId, user.id);
  return redirect(`/admin/weekly-brief/${briefId}`);
}

export async function handleAdminBriefReject(briefId: number, user: User, env: Env): Promise<Response> {
  await rejectBrief(env, briefId, user.id);
  return redirect(`/admin/weekly-brief/${briefId}`);
}

export async function handleAdminBriefRegenerate(env: Env, request: Request): Promise<Response> {
  const form = await request.formData();
  const overwriteIdRaw = form.get("overwrite_id");
  if (overwriteIdRaw) {
    const id = parseInt(String(overwriteIdRaw), 10);
    if (Number.isFinite(id)) {
      await env.DB.prepare(`DELETE FROM weekly_briefs WHERE id = ? AND status = 'draft'`).bind(id).run();
    }
  }
  const result = await generateWeeklyBrief(env);
  if (result.briefId) return redirect(`/admin/weekly-brief/${result.briefId}`);
  return new Response(JSON.stringify(result, null, 2), {
    status: result.ok ? 200 : 400,
    headers: { "content-type": "application/json" },
  });
}

// ---------- Admin list ----------

export async function handleAdminBriefList(user: User, env: Env): Promise<Response> {
  const rows = (await env.DB.prepare(
    `SELECT id, slug, title, status, generated_at, published_at FROM weekly_briefs
       ORDER BY generated_at DESC LIMIT 50`,
  ).all<{ id: number; slug: string; title: string; status: string; generated_at: number; published_at: number | null }>()).results;

  const items = rows.length === 0
    ? `<div class="empty"><h3>No briefs generated yet</h3><p style="color:var(--text-mute)">The Thursday cron will generate the first draft. Or trigger one manually below.</p></div>`
    : rows.map(b => {
        const color = b.status === "published" ? "var(--green)" : b.status === "rejected" ? "var(--red)" : "var(--yellow)";
        return `
          <div style="border:1px solid var(--line);border-radius:6px;padding:16px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:16px">
            <div>
              <div style="display:flex;gap:10px;align-items:center;margin-bottom:4px">
                <span style="font-family:var(--label);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:${color};border:1px solid ${color};padding:1px 6px;border-radius:2px">${esc(b.status)}</span>
                <span style="color:var(--text-faint);font-size:11px">${esc(b.slug)}</span>
              </div>
              <a href="/admin/weekly-brief/${b.id}" style="color:var(--text);text-decoration:none;font-size:14px;font-weight:500">${esc(b.title)}</a>
            </div>
            <div style="color:var(--text-faint);font-size:11px">${new Date(b.generated_at * 1000).toLocaleDateString()}</div>
          </div>`;
      }).join("");

  const body = `
    <div style="margin-bottom:24px">
      <div class="label" style="margin-bottom:8px"><a href="/admin" style="color:var(--text-mute)">Admin</a> / Weekly Briefs</div>
      <h1>Weekly <em>Briefs</em></h1>
      <p style="color:var(--text-mute);max-width:680px;margin-top:8px">Auto-generated Thursday morning, anonymized across all clients, tone-guarded. Approve to publish to the public archive at /weekly.</p>
    </div>
    <form method="POST" action="/admin/weekly-brief/regenerate" style="margin-bottom:24px">
      <button type="submit" class="btn">Generate brief for current week</button>
    </form>
    ${items}
  `;

  return html(layout("Weekly briefs", body, user));
}
