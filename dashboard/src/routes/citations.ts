/**
 * Dashboard -- Citation tracking routes
 *
 * Client view: /citations/:slug -- citation share chart, keyword breakdown, competitor table
 * Admin: /admin/citations/:slug -- keyword management (add/remove/generate)
 * Admin: POST /admin/citations/:slug/add -- add keyword
 * Admin: POST /admin/citations/:slug/delete/:id -- deactivate keyword
 * Admin: POST /admin/citations/:slug/generate -- auto-generate keywords via AI
 * Admin: POST /admin/citations/:slug/run -- manual citation scan trigger
 */

import type { Env, User, CitationKeyword, CitationSnapshot } from "../types";
import { html, layout, esc, redirect } from "../render";
import { generateKeywordSuggestions, runWeeklyCitations } from "../citations";
import { generateCitationNarrative } from "../citation-narrative";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildEngineRows(enginesBreakdown: Record<string, { queries: number; citations: number }>): string {
  return Object.entries(enginesBreakdown).map(([engine, data]) => {
    const share = data.queries > 0 ? ((data.citations / data.queries) * 100).toFixed(0) : "0";
    const displayName = engine === "openai" ? "ChatGPT" : engine === "perplexity" ? "Perplexity" : engine === "anthropic" ? "Claude" : engine === "gemini" ? "Gemini" : engine;
    return "<tr><td>" + esc(displayName) + "</td><td>" + data.queries + "</td><td>" + data.citations + "</td><td>" + share + "%</td></tr>";
  }).join("");
}

function buildCitationDataSection(
  latest: CitationSnapshot,
  previous: CitationSnapshot | null,
  shareNow: string,
  deltaHtml: string,
  chartData: CitationSnapshot[],
  topCompetitors: { name: string; count: number }[],
  keywordBreakdown: { keyword: string; keyword_id: number; cited: boolean; engines: string[] }[],
  enginesBreakdown: Record<string, { queries: number; citations: number }>,
  slug: string
): string {
  const narrative = generateCitationNarrative(
    latest.citation_share,
    previous ? previous.citation_share : null,
    latest.total_queries,
    latest.client_citations,
    topCompetitors,
    keywordBreakdown,
    enginesBreakdown,
    slug
  );

  const chartHtml = chartData.length > 1 ? `
    <div class="card">
      <div class="label">Citation share trend (${chartData.length} weeks)</div>
      <div class="chart-container" style="height:200px;margin-top:16px;position:relative">
        <svg viewBox="0 0 ${chartData.length * 80} 200" style="width:100%;height:100%" preserveAspectRatio="none">
          ${[0, 25, 50, 75, 100].map(v =>
            '<line x1="0" y1="' + (200 - v * 2) + '" x2="' + (chartData.length * 80) + '" y2="' + (200 - v * 2) + '" stroke="rgba(251,248,239,0.08)" stroke-width="1"/>'
          ).join("")}
          <polyline fill="none" stroke="#e8c767" stroke-width="2"
            points="${chartData.map((s, i) => (i * 80 + 40) + "," + (200 - s.citation_share * 200)).join(" ")}"/>
          ${chartData.map((s, i) =>
            '<circle cx="' + (i * 80 + 40) + '" cy="' + (200 - s.citation_share * 200) + '" r="4" fill="#e8c767"/>'
          ).join("")}
        </svg>
      </div>
    </div>
  ` : "";

  const engineHtml = Object.keys(enginesBreakdown).length > 0 ? `
    <div class="card">
      <div class="label">By engine</div>
      <div class="narrative-context">${esc(narrative.engineInsight)}</div>
      <table class="data-table" style="margin-top:12px">
        <thead>
          <tr><th>Engine</th><th>Queries</th><th>Citations</th><th>Share</th></tr>
        </thead>
        <tbody>${buildEngineRows(enginesBreakdown)}</tbody>
      </table>
    </div>
  ` : "";

  const keywordHtml = keywordBreakdown.length > 0 ? `
    <div class="card">
      <div class="label">Keyword results</div>
      <div class="narrative-context">${esc(narrative.keywordInsight)}</div>
      <table class="data-table" style="margin-top:12px">
        <thead>
          <tr><th>Keyword</th><th>Status</th><th>Engines</th></tr>
        </thead>
        <tbody>
          ${keywordBreakdown.map(kb => `
            <tr>
              <td>${esc(kb.keyword)}</td>
              <td>${kb.cited
                ? '<span style="color:#27ae60">Cited</span>'
                : '<span style="color:#c0392b">Not cited</span>'
              }</td>
              <td>${kb.engines.length > 0 ? kb.engines.map(e => '<span class="tag">' + esc(e) + '</span>').join(" ") : '<span style="color:#888">none</span>'}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  ` : "";

  const competitorHtml = topCompetitors.length > 0 ? `
    <div class="card">
      <div class="label">Who AI is citing instead</div>
      <div class="narrative-context">${esc(narrative.competitorInsight)}</div>
      <table class="data-table" style="margin-top:12px">
        <thead>
          <tr><th>Source</th><th>Mentions</th></tr>
        </thead>
        <tbody>
          ${topCompetitors.slice(0, 10).map(c => `
            <tr>
              <td>${esc(c.name)}</td>
              <td>${c.count}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  ` : "";

  const stepsHtml = narrative.nextSteps.length > 0 ? `
    <div class="card">
      <div class="label">What to do next</div>
      ${narrative.nextSteps.map((step, i) => `
        <div style="padding:16px;${i > 0 ? 'border-top:1px solid var(--line);' : ''}">
          <div style="font-size:14px;color:var(--text);margin-bottom:6px">${esc(step.action)}</div>
          <div style="font-size:12px;color:var(--text-faint);line-height:1.7">${esc(step.reason)}</div>
        </div>
      `).join("")}
    </div>
  ` : "";

  return `
    <div class="card" style="padding:40px 24px">
      <div style="text-align:center;margin-bottom:24px">
        <div class="label">Citation share</div>
        <div style="font-size:48px;font-family:var(--mono);color:var(--text);letter-spacing:-2px;margin:8px 0">
          ${shareNow}<span style="font-size:20px;color:var(--text-faint)">%</span>
        </div>
        ${deltaHtml}
        <div style="font-family:var(--serif);font-size:18px;font-style:italic;color:var(--text);margin-top:12px">${esc(narrative.headline)}</div>
      </div>
      <div style="border-top:1px solid var(--line);padding-top:20px;font-size:13px;line-height:1.85;color:var(--text-soft)">
        ${esc(narrative.summary)}
      </div>
    </div>
    ${chartHtml}
    ${engineHtml}
    ${keywordHtml}
    ${competitorHtml}
    ${stepsHtml}
  `;
}

// ---------------------------------------------------------------------------
// Client-facing citation dashboard
// ---------------------------------------------------------------------------

export async function handleCitations(
  slug: string,
  user: User,
  env: Env
): Promise<Response> {
  // Access check: client can only see their own slug
  if (user.role === "client" && user.client_slug !== slug) {
    return redirect("/");
  }

  // Get snapshots (last 12 weeks)
  const snapshots = (
    await env.DB.prepare(
      "SELECT * FROM citation_snapshots WHERE client_slug = ? ORDER BY week_start DESC LIMIT 12"
    )
      .bind(slug)
      .all<CitationSnapshot>()
  ).results;

  // Get active keywords
  const keywords = (
    await env.DB.prepare(
      "SELECT * FROM citation_keywords WHERE client_slug = ? AND active = 1 ORDER BY category, keyword"
    )
      .bind(slug)
      .all<CitationKeyword>()
  ).results;

  const latest = snapshots[0] || null;
  const previous = snapshots[1] || null;

  // Build chart data (oldest first)
  const chartData = [...snapshots].reverse();

  const shareNow = latest ? (latest.citation_share * 100).toFixed(1) : "0";
  const sharePrev = previous ? (previous.citation_share * 100).toFixed(1) : null;

  let deltaHtml = "";
  if (sharePrev !== null) {
    const diff = parseFloat(shareNow) - parseFloat(sharePrev);
    if (diff > 0) deltaHtml = `<span class="delta up">+${diff.toFixed(1)} pts</span>`;
    else if (diff < 0) deltaHtml = `<span class="delta down">${diff.toFixed(1)} pts</span>`;
    else deltaHtml = `<span class="delta flat">no change</span>`;
  }

  // Parse keyword breakdown from latest snapshot
  let keywordBreakdown: { keyword: string; keyword_id: number; cited: boolean; engines: string[] }[] = [];
  if (latest) {
    try {
      keywordBreakdown = JSON.parse(latest.keyword_breakdown);
    } catch { /* ignore */ }
  }

  // Parse top competitors
  let topCompetitors: { name: string; count: number }[] = [];
  if (latest) {
    try {
      topCompetitors = JSON.parse(latest.top_competitors);
    } catch { /* ignore */ }
  }

  // Parse engine breakdown
  let enginesBreakdown: Record<string, { queries: number; citations: number }> = {};
  if (latest) {
    try {
      enginesBreakdown = JSON.parse(latest.engines_breakdown);
    } catch { /* ignore */ }
  }

  const body = `
    <div class="section-header">
      <h1>AI Citation Share</h1>
      <div class="section-sub">${esc(slug)}</div>
    </div>

    ${!latest ? `
    <div class="empty">
      <h3>No citation data yet</h3>
      <p>Citation tracking runs weekly on Mondays. ${keywords.length === 0 ? 'Add keywords first to start tracking.' : 'Your first scan will run next Monday.'}</p>
      ${user.role === "admin" ? `
        <div style="margin-top:16px">
          <a href="/admin/citations/${esc(slug)}" class="btn">Manage keywords</a>
        </div>
      ` : ""}
    </div>
    ` : buildCitationDataSection(
      latest, previous, shareNow, deltaHtml, chartData,
      topCompetitors, keywordBreakdown, enginesBreakdown, slug
    )}

    <!-- Active keywords -->
    <div class="card">
      <div class="label">Tracked keywords (${keywords.length})</div>
      ${keywords.length > 0 ? `
      <div style="margin-top:12px">
        ${keywords.map(k => `
          <div class="keyword-pill">
            <span class="keyword-cat">${esc(k.category)}</span>
            ${esc(k.keyword)}
          </div>
        `).join("")}
      </div>
      ` : `<p style="color:var(--text-faint);margin-top:12px">No keywords configured yet.</p>`}
      ${user.role === "admin" ? `
      <div style="margin-top:16px">
        <a href="/admin/citations/${esc(slug)}" class="btn">Manage keywords</a>
      </div>
      ` : ""}
    </div>

    <style>
      .delta { font-size:14px; margin-top:4px; display:inline-block }
      .delta.up { color:#27ae60 }
      .delta.down { color:#c0392b }
      .delta.flat { color:#888888 }
      .keyword-pill { display:inline-block; padding:6px 12px; margin:4px; background:var(--bg-lift); border:1px solid var(--line); border-radius:3px; font-size:12px; color:var(--text-soft) }
      .keyword-cat { font-family:var(--label); text-transform:uppercase; letter-spacing:.1em; font-size:9px; color:var(--gold); margin-right:8px }
      .tag { display:inline-block; padding:2px 8px; background:var(--bg-lift); border:1px solid var(--line); border-radius:2px; font-size:10px; text-transform:capitalize }
      .chart-container { overflow:hidden; border-radius:4px; background:var(--bg-lift) }
    </style>
  `;

  return html(layout("Citations", body, user, slug));
}

// ---------------------------------------------------------------------------
// Admin: keyword management
// ---------------------------------------------------------------------------

export async function handleAdminCitations(
  slug: string,
  user: User,
  env: Env,
  url?: URL
): Promise<Response> {
  const isRunning = url?.searchParams.get("running") === "1";
  const keywords = (
    await env.DB.prepare(
      "SELECT * FROM citation_keywords WHERE client_slug = ? ORDER BY active DESC, category, keyword"
    )
      .bind(slug)
      .all<CitationKeyword>()
  ).results;

  const activeCount = keywords.filter(k => k.active).length;

  const body = `
    <div class="section-header">
      <h1>Citation Keywords</h1>
      <div class="section-sub">${esc(slug)} -- ${activeCount} active</div>
    </div>

    ${isRunning ? `
    <div class="card" style="border:1px solid var(--gold);background:rgba(232,199,103,0.06)">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:8px;height:8px;border-radius:50%;background:var(--gold);animation:pulse 1.5s infinite"></div>
        <div>
          <div style="color:var(--text);font-size:14px">Citation scan running in the background</div>
          <div style="color:var(--text-faint);font-size:12px;margin-top:4px">This takes 1-2 minutes. Refresh the <a href="/citations/${esc(slug)}" style="color:var(--gold)">citations page</a> to see results when complete.</div>
        </div>
      </div>
    </div>
    <style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}</style>
    ` : ""}

    <!-- Add keyword form -->
    <div class="card">
      <div class="label">Add keyword</div>
      <form method="POST" action="/admin/citations/${esc(slug)}/add" style="margin-top:12px">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <input type="text" name="keyword" placeholder="e.g., best dentist in Austin TX" required
            style="flex:1;min-width:240px;padding:10px 14px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:13px;border-radius:3px">
          <select name="category" style="padding:10px 14px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:13px;border-radius:3px">
            <option value="primary">Primary</option>
            <option value="long_tail">Long tail</option>
            <option value="competitor">Competitor</option>
            <option value="brand">Brand</option>
          </select>
          <button type="submit" class="btn">Add</button>
        </div>
      </form>
    </div>

    <!-- Bulk add -->
    <div class="card">
      <div class="label">Bulk add (one per line)</div>
      <form method="POST" action="/admin/citations/${esc(slug)}/bulk" style="margin-top:12px">
        <textarea name="keywords" rows="6" placeholder="best dentist in Austin TX&#10;top rated dental practice Austin&#10;dentist recommendations near me Austin"
          style="width:100%;padding:10px 14px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:13px;border-radius:3px;resize:vertical"></textarea>
        <div style="display:flex;gap:8px;margin-top:8px">
          <select name="category" style="padding:10px 14px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:13px;border-radius:3px">
            <option value="primary">Primary</option>
            <option value="long_tail">Long tail</option>
            <option value="competitor">Competitor</option>
            <option value="brand">Brand</option>
          </select>
          <button type="submit" class="btn">Add all</button>
        </div>
      </form>
    </div>

    <!-- AI-generated keywords -->
    <div class="card">
      <div class="label">Auto-generate keywords with AI</div>
      <form method="POST" action="/admin/citations/${esc(slug)}/generate" style="margin-top:12px">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <input type="text" name="industry" placeholder="Industry (e.g., dentistry)" required
            style="flex:1;min-width:160px;padding:10px 14px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:13px;border-radius:3px">
          <input type="text" name="location" placeholder="Location (e.g., Austin TX)" required
            style="flex:1;min-width:160px;padding:10px 14px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:13px;border-radius:3px">
          <button type="submit" class="btn">Generate</button>
        </div>
      </form>
    </div>

    <!-- Manual scan trigger -->
    <div class="card">
      <form method="POST" action="/admin/citations/${esc(slug)}/run">
        <button type="submit" class="btn" style="background:var(--gold);color:var(--bg)">Run citation scan now</button>
        <span style="font-size:12px;color:var(--text-faint);margin-left:8px">Runs all keywords against Perplexity + OpenAI</span>
      </form>
    </div>

    <!-- Current keywords -->
    <div class="card">
      <div class="label">All keywords</div>
      ${keywords.length > 0 ? `
      <table class="data-table" style="margin-top:12px">
        <thead>
          <tr><th>Keyword</th><th>Category</th><th>Status</th><th>Action</th></tr>
        </thead>
        <tbody>
          ${keywords.map(k => `
            <tr${!k.active ? ' style="opacity:0.4"' : ""}>
              <td>${esc(k.keyword)}</td>
              <td><span class="keyword-cat">${esc(k.category)}</span></td>
              <td>${k.active ? '<span style="color:#27ae60">Active</span>' : '<span style="color:#888">Inactive</span>'}</td>
              <td>
                ${k.active ? `
                  <form method="POST" action="/admin/citations/${esc(slug)}/delete/${k.id}" style="display:inline">
                    <button type="submit" class="btn-sm" style="color:#c0392b;border-color:#c0392b">Remove</button>
                  </form>
                ` : ""}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      ` : `<p style="color:var(--text-faint);margin-top:12px">No keywords yet. Add some above or auto-generate them.</p>`}
    </div>

    <div style="margin-top:16px">
      <a href="/citations/${esc(slug)}" style="color:var(--gold);font-size:13px">View citation dashboard</a>
    </div>

    <style>
      .keyword-cat { font-family:var(--label); text-transform:uppercase; letter-spacing:.1em; font-size:9px; color:var(--gold) }
      .btn-sm { padding:4px 10px; font-size:11px; background:none; border:1px solid var(--line); color:var(--text-faint); cursor:pointer; border-radius:2px; font-family:var(--mono) }
      .btn-sm:hover { border-color:var(--text-faint) }
    </style>
  `;

  return html(layout("Citation Keywords", body, user, slug));
}

// ---------------------------------------------------------------------------
// POST handlers
// ---------------------------------------------------------------------------

export async function handleAddKeyword(
  slug: string,
  request: Request,
  env: Env
): Promise<Response> {
  const form = await request.formData();
  const keyword = (form.get("keyword") as string || "").trim();
  const category = (form.get("category") as string) || "primary";

  if (keyword) {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      "INSERT INTO citation_keywords (client_slug, keyword, category, active, created_at) VALUES (?, ?, ?, 1, ?)"
    ).bind(slug, keyword, category, now).run();
  }

  return redirect(`/admin/citations/${slug}`);
}

export async function handleBulkAddKeywords(
  slug: string,
  request: Request,
  env: Env
): Promise<Response> {
  const form = await request.formData();
  const raw = (form.get("keywords") as string || "").trim();
  const category = (form.get("category") as string) || "primary";

  if (raw) {
    const now = Math.floor(Date.now() / 1000);
    const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
    for (const keyword of lines) {
      await env.DB.prepare(
        "INSERT INTO citation_keywords (client_slug, keyword, category, active, created_at) VALUES (?, ?, ?, 1, ?)"
      ).bind(slug, keyword, category, now).run();
    }
  }

  return redirect(`/admin/citations/${slug}`);
}

export async function handleDeleteKeyword(
  slug: string,
  keywordId: number,
  env: Env
): Promise<Response> {
  await env.DB.prepare(
    "UPDATE citation_keywords SET active = 0 WHERE id = ? AND client_slug = ?"
  ).bind(keywordId, slug).run();

  return redirect(`/admin/citations/${slug}`);
}

export async function handleGenerateKeywords(
  slug: string,
  request: Request,
  env: Env
): Promise<Response> {
  const form = await request.formData();
  const industry = (form.get("industry") as string || "").trim();
  const location = (form.get("location") as string || "").trim();

  if (!industry || !location) {
    return redirect(`/admin/citations/${slug}`);
  }

  // Get business info
  const config = await env.DB.prepare(
    "SELECT * FROM injection_configs WHERE client_slug = ?"
  ).bind(slug).first<{ business_name: string | null; business_url: string | null }>();

  const suggestions = await generateKeywordSuggestions(
    slug,
    config?.business_name || slug,
    config?.business_url || "",
    industry,
    location,
    env
  );

  if (suggestions.length > 0) {
    const now = Math.floor(Date.now() / 1000);
    for (const keyword of suggestions) {
      await env.DB.prepare(
        "INSERT INTO citation_keywords (client_slug, keyword, category, active, created_at) VALUES (?, ?, 'primary', 1, ?)"
      ).bind(slug, keyword, now).run();
    }
  }

  return redirect(`/admin/citations/${slug}`);
}

export async function handleManualCitationRun(
  slug: string,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  // Run in background via waitUntil so the page responds immediately
  ctx.waitUntil(runWeeklyCitations(env));
  return redirect(`/admin/citations/${slug}?running=1`);
}
