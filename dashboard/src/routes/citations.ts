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

import type { Env, User, CitationKeyword, CitationSnapshot, Domain, ScanResult } from "../types";
import { html, layout, esc, redirect } from "../render";
import { generateKeywordSuggestions, runWeeklyCitations } from "../citations";
import { generateCitationNarrative, type AeoContext } from "../citation-narrative";

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

async function buildContentRecommendations(
  slug: string,
  keywordBreakdown: { keyword: string; keyword_id: number; cited: boolean; engines: string[] }[],
  env: Env
): Promise<string> {
  // Find keywords where client is NOT cited
  const gaps = keywordBreakdown.filter(k => !k.cited);
  if (gaps.length === 0) return "";

  // For each gap keyword, find who IS being cited (from citation_runs)
  interface GapInsight {
    keyword: string;
    citedBy: string[];
    recommendation: string;
  }

  const insights: GapInsight[] = [];

  for (const gap of gaps.slice(0, 8)) {
    // Get recent citation runs for this keyword across all engines
    const runs = (await env.DB.prepare(
      `SELECT cited_entities FROM citation_runs
       WHERE keyword_id = ? AND client_cited = 0
       ORDER BY run_at DESC LIMIT 8`
    ).bind(gap.keyword_id).all<{ cited_entities: string }>()).results;

    // Collect all entities cited across runs
    const entityCounts = new Map<string, number>();
    for (const run of runs) {
      try {
        const entities: { name: string; url?: string | null }[] = JSON.parse(run.cited_entities);
        for (const e of entities) {
          const name = e.name.trim();
          if (name.length > 2 && name.length < 80) {
            entityCounts.set(name, (entityCounts.get(name) || 0) + 1);
          }
        }
      } catch {}
    }

    // Sort by frequency, take top 3
    const topCited = [...entityCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);

    // Generate recommendation based on keyword type
    const kw = gap.keyword.toLowerCase();
    let rec = "";
    if (kw.includes("best") || kw.includes("top") || kw.includes("recommend")) {
      rec = "Create a comprehensive guide or comparison piece that directly answers this query. AI engines cite sources that provide structured, authoritative comparisons.";
    } else if (kw.includes("how") || kw.includes("what is") || kw.includes("guide")) {
      rec = "Write an in-depth explainer article with clear structure, FAQ schema, and step-by-step breakdowns. AI models favor sources with detailed, well-organized answers.";
    } else if (kw.includes("vs") || kw.includes("compare") || kw.includes("difference")) {
      rec = "Publish a detailed comparison page with structured data. Side-by-side comparisons with clear criteria get cited more often by AI engines.";
    } else if (kw.includes("cost") || kw.includes("price") || kw.includes("pricing")) {
      rec = "Create a transparent pricing or cost breakdown page. AI engines cite sources that provide specific, structured pricing information.";
    } else if (kw.includes("near me") || kw.includes("local") || kw.includes("city")) {
      rec = "Strengthen local schema markup (LocalBusiness, address, serviceArea) and create location-specific content pages.";
    } else {
      rec = "Create authoritative content that directly addresses this query. Use structured data, clear headings, and factual detail to increase citation likelihood.";
    }

    insights.push({ keyword: gap.keyword, citedBy: topCited, recommendation: rec });
  }

  if (insights.length === 0) return "";

  // Build the HTML
  const cards = insights.map(ins => {
    const competitorList = ins.citedBy.length > 0
      ? '<div style="margin-top:8px;font-size:11px;color:var(--text-faint)">Currently cited: ' +
        ins.citedBy.map(c => '<span style="color:var(--text-mute)">' + esc(c) + '</span>').join(", ") + '</div>'
      : '';

    return '<div style="padding:16px;background:var(--bg-edge);border-radius:4px;border-left:3px solid var(--gold)">' +
      '<div style="font-size:13px;color:var(--text);font-style:italic;margin-bottom:6px">"' + esc(ins.keyword) + '"</div>' +
      '<div style="font-size:12px;color:var(--text-soft);line-height:1.6">' + esc(ins.recommendation) + '</div>' +
      competitorList +
      '</div>';
  }).join("");

  return `
    <div class="card">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:4px">
        <div class="label">Content Opportunities</div>
        <div style="font-size:12px;color:var(--text-faint)">${gaps.length} uncited keyword${gaps.length !== 1 ? "s" : ""}</div>
      </div>
      <div style="font-size:13px;color:var(--text-faint);line-height:1.6;margin-bottom:16px">
        These are queries where AI engines do not cite your brand. Each one is a content opportunity. The recommendations below show what to create and who currently owns the citation.
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${cards}
      </div>
    </div>
  `;
}

/** Competitor citation comparison matrix */
async function buildCompetitorCitationMatrix(
  slug: string,
  keywordBreakdown: { keyword: string; keyword_id: number; cited: boolean; engines: string[] }[],
  env: Env
): Promise<string> {
  if (keywordBreakdown.length === 0) return "";

  // Collect competitor citation data per keyword
  interface KeywordRow {
    keyword: string;
    clientCited: boolean;
    competitors: Map<string, string[]>; // competitor name -> engines that cite them
  }

  const kwRows: KeywordRow[] = [];
  const allCompetitors = new Map<string, number>(); // name -> total citation count

  for (const kb of keywordBreakdown.slice(0, 15)) {
    const runs = (await env.DB.prepare(
      "SELECT engine, cited_entities FROM citation_runs WHERE keyword_id = ? ORDER BY run_at DESC LIMIT 8"
    ).bind(kb.keyword_id).all<{ engine: string; cited_entities: string }>()).results;

    const compMap = new Map<string, string[]>();

    for (const run of runs) {
      try {
        const entities: { name: string }[] = JSON.parse(run.cited_entities);
        for (const e of entities) {
          const name = e.name.trim();
          if (name.length > 2 && name.length < 60) {
            const existing = compMap.get(name) || [];
            if (!existing.includes(run.engine)) existing.push(run.engine);
            compMap.set(name, existing);
            allCompetitors.set(name, (allCompetitors.get(name) || 0) + 1);
          }
        }
      } catch {}
    }

    kwRows.push({ keyword: kb.keyword, clientCited: kb.cited, competitors: compMap });
  }

  if (allCompetitors.size === 0) return "";

  // Top 6 competitors by total mentions
  const topComps = [...allCompetitors.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name]) => name);

  // Build the matrix table
  const headerCells = topComps.map(c =>
    `<th style="text-align:center;padding:8px 6px;font-family:var(--label);font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint);max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(c)}">${esc(c.length > 12 ? c.slice(0, 11) + '...' : c)}</th>`
  ).join("");

  const rows = kwRows.map(kr => {
    const youCell = kr.clientCited
      ? '<td style="text-align:center;padding:8px 6px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--green)"></span></td>'
      : '<td style="text-align:center;padding:8px 6px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(232,84,84,.3);border:1px solid rgba(232,84,84,.5)"></span></td>';

    const compCells = topComps.map(comp => {
      const engines = kr.competitors.get(comp);
      if (engines && engines.length > 0) {
        return `<td style="text-align:center;padding:8px 6px" title="${esc(comp)}: ${engines.join(', ')}"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--gold)"></span></td>`;
      }
      return '<td style="text-align:center;padding:8px 6px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(251,248,239,.06)"></span></td>';
    }).join("");

    return `
      <tr style="border-bottom:1px solid rgba(251,248,239,.06)">
        <td style="padding:8px 12px;font-size:12px;color:var(--text-soft);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(kr.keyword)}">${esc(kr.keyword)}</td>
        ${youCell}
        ${compCells}
      </tr>`;
  }).join("");

  return `
    <div class="card">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:4px">
        <div class="label">Citation Matrix</div>
        <div style="font-size:11px;color:var(--text-faint)">You vs competitors per keyword</div>
      </div>
      <div style="font-size:12px;color:var(--text-faint);line-height:1.6;margin-bottom:16px">
        Each cell shows whether the source gets cited by AI engines for that keyword. Green = cited, gold = competitor cited, empty = not cited.
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;min-width:${400 + topComps.length * 80}px">
          <thead>
            <tr style="border-bottom:1px solid var(--line)">
              <th style="text-align:left;padding:8px 12px;font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">Keyword</th>
              <th style="text-align:center;padding:8px 6px;font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--green)">You</th>
              ${headerCells}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="margin-top:12px;font-size:11px;color:var(--text-faint);display:flex;gap:16px">
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--green);vertical-align:middle;margin-right:4px"></span> You cited</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--gold);vertical-align:middle;margin-right:4px"></span> Competitor cited</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(232,84,84,.3);border:1px solid rgba(232,84,84,.5);vertical-align:middle;margin-right:4px"></span> Gap</span>
      </div>
    </div>
  `;
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
  slug: string,
  aeoContext?: AeoContext | null
): string {
  const narrative = generateCitationNarrative(
    latest.citation_share,
    previous ? previous.citation_share : null,
    latest.total_queries,
    latest.client_citations,
    topCompetitors,
    keywordBreakdown,
    enginesBreakdown,
    slug,
    aeoContext
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
    ${narrative.outlook ? `
    <div class="card">
      <div class="label">Outlook</div>
      <div style="font-size:14px;line-height:1.9;color:var(--text-soft);margin-top:12px">${esc(narrative.outlook)}</div>
    </div>
    ` : ""}
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

  // Fetch AEO score data for cross-reference
  let aeoContext: AeoContext | null = null;
  const domain = await env.DB.prepare(
    "SELECT id FROM domains WHERE client_slug = ? AND is_competitor = 0 AND active = 1 LIMIT 1"
  ).bind(slug).first<{ id: number }>();
  if (domain) {
    const scan = await env.DB.prepare(
      "SELECT aeo_score, grade, red_flags, schema_types FROM scan_results WHERE domain_id = ? AND error IS NULL ORDER BY scanned_at DESC LIMIT 1"
    ).bind(domain.id).first<{ aeo_score: number; grade: string; red_flags: string; schema_types: string }>();
    if (scan) {
      const redFlags: string[] = JSON.parse(scan.red_flags);
      const schemaTypes: string[] = JSON.parse(scan.schema_types);
      aeoContext = {
        aeoScore: scan.aeo_score,
        grade: scan.grade,
        redFlagCount: redFlags.length,
        schemaCount: schemaTypes.length,
      };
    }
  }

  const body = `
    <div class="section-header">
      <h1>AI Citation Share</h1>
      <div class="section-sub">${esc(slug)}${latest ? ' -- last updated ' + new Date(latest.created_at * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : ''}</div>
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
      topCompetitors, keywordBreakdown, enginesBreakdown, slug, aeoContext
    )}

    <!-- Competitor citation comparison matrix -->
    ${await buildCompetitorCitationMatrix(slug, keywordBreakdown, env)}

    <!-- Content recommendations from citation gaps -->
    ${await buildContentRecommendations(slug, keywordBreakdown, env)}

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
    <div id="scan-banner" class="card" style="border:1px solid var(--gold);background:rgba(232,199,103,0.06)">
      <div style="display:flex;align-items:center;gap:12px">
        <div id="scan-dot" style="width:8px;height:8px;border-radius:50%;background:var(--gold);animation:pulse 1.5s infinite"></div>
        <div>
          <div id="scan-title" style="color:var(--text);font-size:14px">Citation scan running in the background</div>
          <div id="scan-sub" style="color:var(--text-faint);font-size:12px;margin-top:4px">This takes 3-5 minutes. This page will update automatically when the scan finishes.</div>
        </div>
      </div>
    </div>
    <style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}</style>
    <script>
    (function(){
      var started = Date.now();
      var slug = "${esc(slug)}";
      function check(){
        fetch("/api/citation-status/" + slug).then(function(r){return r.json()}).then(function(d){
          if(d.done){
            document.getElementById("scan-dot").style.animation="none";
            document.getElementById("scan-dot").style.background="var(--green)";
            document.getElementById("scan-title").textContent="Citation scan complete";
            document.getElementById("scan-sub").innerHTML='Results are ready. <a href="/citations/'+slug+'" style="color:var(--gold);font-weight:500">View citation dashboard</a>';
            document.getElementById("scan-banner").style.borderColor="var(--green)";
            document.getElementById("scan-banner").style.background="rgba(94,199,106,0.06)";
          } else if(Date.now()-started < 600000){
            setTimeout(check, 8000);
          }
        }).catch(function(){
          if(Date.now()-started < 600000) setTimeout(check, 10000);
        });
      }
      setTimeout(check, 15000);
    })();
    </script>
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
        <span style="font-size:12px;color:var(--text-faint);margin-left:8px">Runs all keywords against Perplexity, ChatGPT, Gemini, and Claude</span>
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
