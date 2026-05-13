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
import { canAccessClient } from "../agency";
import { buildGlossary } from "../glossary";
import { buildCitationGapReport, renderCitationGapPanel, buildSourceTypeRollup, renderSourceTypeRollupPanel } from "../citation-gap";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * 12-week share-of-voice trend. Inline SVG, no client JS. Lines per
 * top-N entity, client line bolded + gold. Empty buckets render as
 * gaps so a flat 0%-on-zero-data doesn't read as "we lost share."
 */
function renderSovTrend(
  trend: import("../share-of-voice").VoiceShareTrend,
  clientSlug: string,
  _env: import("../types").Env,
): string {
  if (trend.buckets.length < 2) return "";
  // We don't actually need env here -- it's a placeholder so callers
  // that wanted to lookup client domain can do so later if needed.
  void clientSlug; void _env;

  const w = 520;
  const h = 120;
  const padX = 10;
  const padY = 12;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const stepX = trend.buckets.length > 1 ? innerW / (trend.buckets.length - 1) : 0;

  // Compute each entity's per-bucket share fraction.
  const series = trend.topNames.map((name) => {
    const points = trend.buckets.map((b, i) => {
      if (b.totalMentions === 0) return null;
      const share = (b.perEntity[name] ?? 0) / b.totalMentions;
      return { i, share };
    });
    return { name, points };
  });

  // Highlight client's domain visually if it shows up in topNames -- we
  // don't have a direct client flag in trend, but the styling below
  // colors all lines uniformly except gold for the highest-mentioned
  // entity. The dashboard chart is meant for at-a-glance trend reading,
  // not pixel-precise per-entity attribution -- the bar chart above
  // already handles that exactly.
  const colors = ["var(--gold)", "rgba(251,248,239,.6)", "rgba(251,248,239,.45)", "rgba(251,248,239,.35)", "rgba(251,248,239,.25)", "rgba(251,248,239,.18)"];

  const paths = series.map((s, idx) => {
    const color = colors[idx] ?? "rgba(251,248,239,.18)";
    const widthPx = idx === 0 ? 2 : 1.25;
    let d = "";
    let lastY: number | null = null;
    for (const p of s.points) {
      if (!p) { lastY = null; continue; }
      const x = padX + p.i * stepX;
      const y = padY + (1 - p.share) * innerH;
      d += (lastY === null ? "M " : " L ") + x.toFixed(1) + " " + y.toFixed(1);
      lastY = y;
    }
    return `<path d="${d}" stroke="${color}" stroke-width="${widthPx}" fill="none" stroke-linejoin="round" stroke-linecap="round" />`;
  }).join("");

  // X-axis labels: first / mid / last week boundaries.
  const labelIdx = [0, Math.floor(trend.buckets.length / 2), trend.buckets.length - 1];
  const xLabels = labelIdx.map((i) => {
    const b = trend.buckets[i];
    if (!b) return "";
    const x = padX + i * stepX;
    const anchor = i === 0 ? "start" : i === trend.buckets.length - 1 ? "end" : "middle";
    const date = new Date(b.weekStart * 1000).toISOString().slice(5, 10);
    return `<text x="${x.toFixed(1)}" y="${(h + 14).toFixed(0)}" fill="var(--text-faint)" font-family="var(--mono)" font-size="9" text-anchor="${anchor}">${date}</text>`;
  }).join("");

  const legendItems = trend.topNames.slice(0, 6).map((n, i) => {
    const c = colors[i] ?? "rgba(251,248,239,.18)";
    return `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px"><span style="display:inline-block;width:10px;height:2px;background:${c}"></span><span style="font-family:var(--mono);font-size:10px;color:var(--text-mute)">${esc(n)}</span></span>`;
  }).join("");

  return `
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--line)">
      <div class="label" style="margin-bottom:10px;color:var(--text-faint)">12-week trend &middot; share of all mentions</div>
      <svg viewBox="0 0 ${w} ${h + 18}" preserveAspectRatio="none" style="width:100%;height:auto;display:block">
        ${paths}
        ${xLabels}
      </svg>
      <div style="margin-top:10px;line-height:1.8">${legendItems}</div>
    </div>
  `;
}

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

  // Pull open roadmap items so we can annotate each gap card with "on
  // roadmap" when a related work order exists. Matching is fuzzy: we look
  // for roadmap item titles/descriptions that contain any substantive word
  // from the gap keyword. This closes the loop between "you are not cited
  // for X" and "we are working on X" without requiring a foreign key.
  const openItems = (await env.DB.prepare(
    `SELECT id, title, description, status FROM roadmap_items
     WHERE client_slug = ? AND status IN ('pending','in_progress')`
  ).bind(slug).all<{ id: number; title: string; description: string | null; status: string }>()).results;

  function findMatchingRoadmapItem(keyword: string): { id: number; title: string; status: string } | null {
    const words = keyword
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length >= 4 && !["near", "best", "cost", "vs"].includes(w));
    if (words.length === 0) return null;
    for (const item of openItems) {
      const hay = (item.title + " " + (item.description || "")).toLowerCase();
      if (words.some(w => hay.includes(w))) {
        return { id: item.id, title: item.title, status: item.status };
      }
    }
    return null;
  }

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
  // Pull the current user role from the ambient context via closure.
  // buildContentRecommendations doesn't receive the user object directly,
  // but since the draft-in-voice button is shown to everyone who can
  // see this page (admin + agency_admin + client), we gate on a feature
  // signal rather than role here: the draft endpoint itself enforces
  // role. So the button can always render.
  const cards = insights.map(ins => {
    const match = findMatchingRoadmapItem(ins.keyword);
    const roadmapBadge = match
      ? `<a href="/roadmap/${esc(slug)}" style="display:inline-block;margin-top:8px;margin-right:6px;padding:4px 10px;background:rgba(106,154,106,.14);color:var(--green,#6a9a6a);font-family:var(--label);text-transform:uppercase;letter-spacing:.12em;font-size:9px;font-weight:500;border-radius:2px;text-decoration:none" title="A matching roadmap item exists: '${esc(match.title)}' (${match.status === 'in_progress' ? 'in progress' : 'to do'}). Click to open your roadmap.">\u2713 On roadmap \u00b7 ${match.status === 'in_progress' ? 'in progress' : 'to do'}</a>`
      : `<span style="display:inline-block;margin-top:8px;margin-right:6px;padding:4px 10px;background:rgba(201,168,76,.10);color:var(--gold);font-family:var(--label);text-transform:uppercase;letter-spacing:.12em;font-size:9px;font-weight:500;border-radius:2px" title="Nothing specifically tied to this keyword on your roadmap yet. It will be added after the next scan's review, or during the next monthly content planning cycle.">Not yet scheduled</span>`;

    // Draft-in-voice button. POSTs to the create-and-generate endpoint
    // with the keyword as the title and the recommendation as the brief
    // so the voice engine has real context to work with.
    const draftTitle = `Pillar article: ${ins.keyword}`;
    const draftBrief = `This article should answer the query "${ins.keyword}" and compete for AI citations on it. ${ins.recommendation}`;
    const draftButton = `
      <form method="POST" action="/drafts/${esc(slug)}/new-generated" style="display:inline-block;margin-top:8px" title="Create a new draft on this keyword in your voice" onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='Drafting\u2026';">
        <input type="hidden" name="title" value="${esc(draftTitle)}">
        <input type="hidden" name="brief" value="${esc(draftBrief)}">
        <input type="hidden" name="kind" value="article">
        <button type="submit" style="display:inline-block;padding:4px 10px;background:rgba(201,168,76,.18);color:var(--gold);font-family:var(--label);text-transform:uppercase;letter-spacing:.12em;font-size:9px;font-weight:500;border:none;border-radius:2px;cursor:pointer">Draft in voice &rarr;</button>
      </form>`;

    const competitorList = ins.citedBy.length > 0
      ? '<div style="margin-top:10px;font-size:11px;color:var(--text-faint)">Currently cited: ' +
        ins.citedBy.map(c => '<span style="color:var(--text-mute)">' + esc(c) + '</span>').join(", ") + '</div>'
      : '';

    return '<div style="padding:16px;background:var(--bg-edge);border-radius:4px;border-left:3px solid var(--gold)">' +
      '<div style="font-size:13px;color:var(--text);font-style:italic;margin-bottom:6px">"' + esc(ins.keyword) + '"</div>' +
      '<div style="font-size:12px;color:var(--text-soft);line-height:1.6">' + esc(ins.recommendation) + '</div>' +
      '<div>' + roadmapBadge + draftButton + '</div>' +
      competitorList +
      '</div>';
  }).join("");

  return `
    <div class="card">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:4px">
        <div class="label">Content Opportunities</div>
        <div style="font-size:12px;color:var(--text-faint)">${gaps.length} uncited keyword${gaps.length !== 1 ? "s" : ""}</div>
      </div>
      <div style="font-size:13px;color:var(--text-faint);line-height:1.6;margin-bottom:14px">
        These are queries where AI engines do not cite your brand. Each one is a content opportunity. The recommendations below show what to create and who currently owns the citation.
      </div>

      <!-- How these gaps actually get closed. Spells out the service flow
           so clients know the work is happening rather than assuming the
           matrix is just a diagnosis with no action behind it. -->
      <div style="margin-bottom:18px;padding:14px 16px;background:var(--bg-lift);border-left:2px solid var(--gold-dim);border-radius:0 3px 3px 0;font-size:12px;color:var(--text-soft);line-height:1.65;max-width:780px">
        <strong style="color:var(--text);font-weight:500">How these gaps get closed.</strong>
        Each gap is translated into a roadmap item. On the Signal retainer we fix the schema and draft the content brief; you ship the content. On Amplify we also draft the content for you to approve and publish. Next Monday's citation run re-verifies. The badge under each card below shows whether a matching roadmap item already exists.
      </div>

      <div style="display:flex;flex-direction:column;gap:10px">
        ${cards}
      </div>

      <div style="margin-top:14px;font-size:11px;color:var(--text-faint);line-height:1.6">
        See the full list of current work on your <a href="/roadmap/${esc(slug)}" style="color:var(--gold);text-decoration:none;border-bottom:1px solid var(--gold-dim)">roadmap &rarr;</a>
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

  const chartHtml = chartData.length > 1 ? (() => {
    const firstShare = (chartData[0].citation_share * 100).toFixed(1);
    const lastShare = (chartData[chartData.length - 1].citation_share * 100).toFixed(1);
    const direction = chartData[chartData.length - 1].citation_share - chartData[0].citation_share;
    const trendWord = direction > 0.01 ? "trending up" : direction < -0.01 ? "trending down" : "roughly flat";
    return `
    <div class="card">
      <div class="label">Citation share trend (${chartData.length} weeks)</div>
      <div class="narrative-context" style="margin-bottom:12px">
        The line below is the percentage of AI answers that cite your site, measured weekly. ${chartData.length} weeks ago it was ${firstShare}%. This week it is ${lastShare}%. The series is ${trendWord}. Each dot is one Monday's citation run.
      </div>
      <div class="chart-container" style="height:200px;margin-top:16px;position:relative">
        <svg viewBox="0 0 ${chartData.length * 80} 200" style="width:100%;height:100%" preserveAspectRatio="none" role="img" aria-label="Citation share trend over ${chartData.length} weeks, from ${firstShare}% to ${lastShare}%">
          ${[0, 25, 50, 75, 100].map(v =>
            '<line x1="0" y1="' + (200 - v * 2) + '" x2="' + (chartData.length * 80) + '" y2="' + (200 - v * 2) + '" stroke="rgba(251,248,239,0.08)" stroke-width="1"/>'
          ).join("")}
          <polyline fill="none" stroke="#e8c767" stroke-width="2"
            points="${chartData.map((s, i) => (i * 80 + 40) + "," + (200 - s.citation_share * 200)).join(" ")}"/>
          ${chartData.map((s, i) =>
            '<circle cx="' + (i * 80 + 40) + '" cy="' + (200 - s.citation_share * 200) + '" r="4" fill="#e8c767"><title>Week of ' + new Date(s.week_start * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ': ' + (s.citation_share * 100).toFixed(1) + '%</title></circle>'
          ).join("")}
        </svg>
      </div>
      <div style="font-size:11px;color:var(--text-faint);margin-top:10px;line-height:1.6">
        The y-axis runs 0 to 100 percent. Bottom of the chart is zero citations, top is cited on every query. Hover any dot for the exact percentage that week.
      </div>
    </div>
  `;
  })() : "";

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
  // Access check: admins see all, agency admins see their agency's clients,
  // clients see only their own slug.
  if (!(await canAccessClient(env, user, slug))) {
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
    "SELECT id, domain FROM domains WHERE client_slug = ? AND is_competitor = 0 AND active = 1 LIMIT 1"
  ).bind(slug).first<{ id: number; domain: string }>();
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

  // Citation lift block (engagement baseline vs current). Surfaces
  // the proof case at the top of the citations view.
  const { computeCitationLift, renderCitationLiftBlock } = await import("../citation-lift");
  const lift = await computeCitationLift(slug, env);
  const liftHtml = renderCitationLiftBlock(lift);

  // Share of voice: % of all business mentions in tracked queries
  // that went to client vs competitors. Different from citation_share.
  const { computeShareOfVoice, computeShareOfVoiceTrend } = await import("../share-of-voice");
  const sov = await computeShareOfVoice(env, slug, 90);
  const sovTrend = sov.totalMentions > 0
    ? await computeShareOfVoiceTrend(env, slug, 12)
    : { topNames: [], buckets: [] };
  const sovHtml = sov.totalMentions === 0 ? "" : (() => {
    const top = sov.entries.slice(0, 8);
    const maxShare = top[0]?.share ?? 1;
    const bars = top.map(e => {
      const widthPct = (e.share / maxShare) * 100;
      const labelPct = (e.share * 100).toFixed(1);
      const color = e.isClient ? "var(--gold)" : e.isCompetitor ? "var(--text-mute)" : "var(--text-faint)";
      const labelColor = e.isClient ? "var(--gold)" : "var(--text-soft)";
      const tag = e.isClient
        ? `<span style="font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);margin-left:8px">You</span>`
        : e.isCompetitor
        ? `<span style="font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint);margin-left:8px">Competitor</span>`
        : "";
      return `
        <div style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;font-size:12.5px">
            <span style="color:${labelColor}">${esc(e.name)}${tag}</span>
            <span style="font-family:var(--mono);font-size:11px;color:var(--text-mute)">${labelPct}% &middot; ${e.mentions}</span>
          </div>
          <div style="height:6px;background:var(--bg-edge);border-radius:2px;overflow:hidden">
            <div style="width:${widthPct.toFixed(1)}%;height:100%;background:${color}"></div>
          </div>
        </div>`;
    }).join("");

    const verdict = sov.clientRank === null
      ? `<strong style="color:var(--red)">You don't appear in any of the AI mentions for your tracked queries.</strong> Competitors are claiming the entire conversation. The roadmap items below address this directly.`
      : sov.clientRank === 1
      ? `<strong style="color:var(--green)">You hold the most mentions in your category.</strong> Ranked #1 across ${sov.totalMentions} business mentions in the last 90 days.`
      : sov.clientRank <= 3
      ? `Ranked <strong style="color:var(--text)">#${sov.clientRank}</strong> across ${sov.totalMentions} business mentions in your category. Competitive with the leaders.`
      : `Ranked <strong style="color:var(--text)">#${sov.clientRank}</strong> across ${sov.totalMentions} business mentions in your category. Top three are pulling away. See the per-keyword gaps below for where to focus.`;

    const trendChart = sovTrend.buckets.length > 0 ? renderSovTrend(sovTrend, slug, env) : "";

    return `
      <div style="margin-bottom:28px;padding:20px 24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="label" style="color:var(--gold)">§ Share of voice (90 days)</div>
          <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint)">${sov.totalMentions} mentions across ${sov.totalRuns} AI responses</div>
        </div>
        <div style="font-size:12.5px;color:var(--text-soft);line-height:1.6;margin-bottom:18px">${verdict}</div>
        <div>${bars}</div>
        ${trendChart}
        <div style="font-size:11px;color:var(--text-faint);margin-top:14px;line-height:1.6">Different from citation share. Citation share is "% of YOUR queries where YOU were cited." Share of voice is "% of ALL business mentions across your queries that went to YOU vs everyone else AI keeps naming."</div>
      </div>
    `;
  })();

  // Negative-mention monitor -- defensive framing of the sentiment data.
  //
  // Why this is framed as a monitor not a scoreboard: scoreboards die
  // on bad numbers ("78% positive, why isn't it 90?"), monitors survive
  // them ("the alarm fired, that's the system working"). Sentiment is
  // not something we can directly move the way schema or content can,
  // so positioning it as an alert layer (defensive) protects the
  // relationship better than positioning it as a metric (offensive).
  //
  // Sample-size discipline: percentages stay hidden until n>=10 scored
  // mentions. Below that, small-sample noise (1 negative out of 3 = 33%
  // negative) reads worse than the underlying data warrants. Same
  // discipline as industry benchmarks (n<5 hidden) and citation-lift
  // attribution (n<50 low-confidence flag).
  const SENTIMENT_MIN_N = 10;
  const { getSentimentRollup } = await import("../sentiment-scorer");
  const { getDepthRollup } = await import("../conversation-depth");
  const { generateDepthFindings } = await import("../citation-narrative");
  const { getKeywordDeepBreakdown, getRedditCitationSurface } = await import("../citations");
  const sentiment = await getSentimentRollup(env, slug, 90);
  const depthRollup = await getDepthRollup(env, slug, 90);
  const depth = generateDepthFindings(depthRollup, slug);
  const keywordDeep = await getKeywordDeepBreakdown(env, slug, 30);
  const reddit = await getRedditCitationSurface(env, slug, 90);
  const sentimentScored = sentiment.positive + sentiment.neutral + sentiment.negative;
  const sentimentHtml = sentimentScored === 0 ? "" : (() => {
    const pos = sentiment.positive, neu = sentiment.neutral, neg = sentiment.negative;
    const buildingBaseline = sentimentScored < SENTIMENT_MIN_N;

    // Below threshold: surface only the negative-mention count if any,
    // skip the percentage breakdown that would mislead at small n.
    if (buildingBaseline) {
      const baselineMsg = neg > 0
        ? `<strong style="color:var(--red)">${neg} negative mention${neg === 1 ? "" : "s"} flagged.</strong> Review in <a href="/admin/inbox" style="color:var(--text);text-decoration:underline">your inbox</a>. Percentages stay hidden until ${SENTIMENT_MIN_N}+ mentions to avoid small-sample noise.`
        : `No negative mentions detected. Percentages will surface once ${SENTIMENT_MIN_N}+ mentions are scored (currently ${sentimentScored}).`;
      return `
        <div style="margin-bottom:28px;padding:20px 24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
            <div class="label" style="color:var(--gold)">§ Negative mention monitor</div>
            <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint)">Building baseline &middot; ${sentimentScored}/${SENTIMENT_MIN_N} mentions${sentiment.unscored > 0 ? ` &middot; ${sentiment.unscored} pending` : ""}</div>
          </div>
          <div style="font-size:12.5px;color:var(--text-soft);line-height:1.6">${baselineMsg}</div>
        </div>
      `;
    }

    const posPct = Math.round((pos / sentimentScored) * 100);
    const neuPct = Math.round((neu / sentimentScored) * 100);
    const negPct = Math.max(0, 100 - posPct - neuPct);

    // Verdict is framed around alerts, not scores. "% positive" is
    // shown as context, not as the headline number.
    const verdict = neg > 0
      ? `<strong style="color:var(--red)">${neg} negative mention${neg === 1 ? "" : "s"} flagged in the last 90 days.</strong> Review them in <a href="/admin/inbox" style="color:var(--text);text-decoration:underline">your inbox</a> for fixable issues. Negatives are usually addressable -- often a stale review, a competitor's takedown thread, or a content gap on your own site.`
      : `No negative mentions in the last 90 days. AI engines are describing you neutrally or favorably across all ${sentimentScored} scored mentions.`;
    return `
      <div style="margin-bottom:28px;padding:20px 24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="label" style="color:var(--gold)">§ Negative mention monitor</div>
          <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint)">${sentimentScored} mentions scored${sentiment.unscored > 0 ? ` &middot; ${sentiment.unscored} pending` : ""}</div>
        </div>
        <div style="display:flex;height:8px;border-radius:2px;overflow:hidden;margin-bottom:12px">
          <div style="width:${posPct}%;background:var(--green)" title="Positive ${pos} (${posPct}%)"></div>
          <div style="width:${neuPct}%;background:var(--text-faint);opacity:0.5" title="Neutral ${neu} (${neuPct}%)"></div>
          <div style="width:${negPct}%;background:var(--red)" title="Negative ${neg} (${negPct}%)"></div>
        </div>
        <div style="display:flex;gap:24px;font-size:12px;color:var(--text-mute);margin-bottom:10px">
          <span><span style="display:inline-block;width:8px;height:8px;background:var(--green);border-radius:50%;margin-right:6px;vertical-align:middle"></span>Favorable ${posPct}% (${pos})</span>
          <span><span style="display:inline-block;width:8px;height:8px;background:var(--text-faint);opacity:0.5;border-radius:50%;margin-right:6px;vertical-align:middle"></span>Neutral ${neuPct}% (${neu})</span>
          <span><span style="display:inline-block;width:8px;height:8px;background:var(--red);border-radius:50%;margin-right:6px;vertical-align:middle"></span>Negative ${negPct}% (${neg})</span>
        </div>
        <div style="font-size:12.5px;color:var(--text-soft);line-height:1.6">${verdict}</div>
      </div>
    `;
  })();

  // Citation depth findings — how AI engines describe the client beyond
  // the binary cited/not-cited and the pos/neu/neg sentiment. Surfaces
  // framing distribution (value/premium/specialist/etc.), competitive
  // position (sole/primary/secondary/listed/footnote), and the named
  // competitors AI engines most often pair the client with. Populated
  // by conversation-depth.ts; narrative built by citation-narrative.ts.
  const depthHtml = depth.scoredCount === 0 ? "" : (() => {
    const baselineNote = depth.hasBaseline
      ? `${depth.scoredCount} depth-scored mentions in last 90 days`
      : `Building baseline · ${depth.scoredCount}/${depth.baselineThreshold} scored mentions`;
    return `
      <div style="margin-bottom:28px;padding:20px 24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="label" style="color:var(--gold)">§ Citation depth — how engines describe you</div>
          <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint)">${baselineNote}</div>
        </div>
        <div style="font-size:13px;color:var(--text-soft);line-height:1.7;margin-bottom:14px">
          <div style="margin-bottom:8px"><strong style="color:var(--text)">${esc(depth.framingHeadline)}</strong></div>
          ${depth.framingDistribution ? `<div style="font-family:var(--mono);font-size:11.5px;color:var(--text-faint);margin-bottom:10px">${esc(depth.framingDistribution)}</div>` : ""}
          ${depth.positionHeadline ? `<div style="margin-bottom:8px">${esc(depth.positionHeadline)}</div>` : ""}
          ${depth.prominenceHeadline ? `<div style="font-family:var(--mono);font-size:11.5px;color:var(--text-faint);margin-bottom:10px">${esc(depth.prominenceHeadline)}</div>` : ""}
          ${depth.competitorContext ? `<div style="margin-bottom:10px">${esc(depth.competitorContext)}</div>` : ""}
        </div>
        ${depth.actionableInsight ? `<div style="padding-top:12px;border-top:1px dashed var(--line);font-size:12.5px;color:var(--text-soft);line-height:1.6"><span style="color:var(--gold);font-family:var(--mono);font-size:10px;letter-spacing:0.1em;text-transform:uppercase;margin-right:8px">Insight</span>${esc(depth.actionableInsight)}</div>` : ""}
      </div>
    `;
  })();

  // Title-case helper for competitor names (which are stored lowercased
  // by the depth scorer to deduplicate "Bank of Hawaii" vs "bank of hawaii").
  const titleCaseName = (s: string): string => s
    .split(/\s+/)
    .map((w) => w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w)
    .join(" ");

  // Per-keyword fidelity table. The summary table elsewhere on the page
  // shows "was the client cited on this keyword." This table shows the
  // depth: citation rate per keyword, top competitor on each, dominant
  // framing, sample framing phrase. The detail buyers need to know
  // "where am I winning, where am I losing, who am I losing to."
  const keywordDeepHtml = keywordDeep.length === 0 ? "" : (() => {
    const ENGINE_LABEL_SHORT: Record<string, string> = {
      openai: "GPT",
      perplexity: "PPLX",
      anthropic: "Claude",
      gemini: "Gem",
      bing: "Cop",
      google_ai_overview: "AIO",
      gemma: "Gma",
    };
    const FRAMING_LABEL_SHORT: Record<string, string> = {
      value: "value",
      premium: "premium",
      specialist: "specialist",
      established: "established",
      niche: "niche",
      budget: "budget",
      balanced: "balanced",
      unclear: "unclear",
    };
    const winners = keywordDeep.filter(k => k.citation_rate > 0).length;
    const losers = keywordDeep.length - winners;
    const headlineLine = `${keywordDeep.length} tracked keywords · ${winners} winning, ${losers} unconverted · 30-day window.`;
    return `
      <div style="margin-bottom:28px;padding:20px 24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="label" style="color:var(--gold)">§ Per-keyword fidelity — where you win, where you lose</div>
          <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint)">${esc(headlineLine)}</div>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12.5px">
            <thead>
              <tr style="border-bottom:1px solid var(--line)">
                <th style="text-align:left;padding:10px 8px;font-family:var(--label);text-transform:uppercase;letter-spacing:0.15em;font-size:10px;color:var(--text-faint);font-weight:500">Keyword</th>
                <th style="text-align:right;padding:10px 8px;font-family:var(--label);text-transform:uppercase;letter-spacing:0.15em;font-size:10px;color:var(--text-faint);font-weight:500">Cite rate</th>
                <th style="text-align:left;padding:10px 8px;font-family:var(--label);text-transform:uppercase;letter-spacing:0.15em;font-size:10px;color:var(--text-faint);font-weight:500">Engines cited</th>
                <th style="text-align:left;padding:10px 8px;font-family:var(--label);text-transform:uppercase;letter-spacing:0.15em;font-size:10px;color:var(--text-faint);font-weight:500">Top competitor</th>
                <th style="text-align:left;padding:10px 8px;font-family:var(--label);text-transform:uppercase;letter-spacing:0.15em;font-size:10px;color:var(--text-faint);font-weight:500">Your framing</th>
              </tr>
            </thead>
            <tbody>
              ${keywordDeep.map(k => {
                const ratePct = Math.round(k.citation_rate * 100);
                const rateColor = ratePct >= 60 ? "#7fc99a" : ratePct >= 20 ? "var(--gold)" : ratePct > 0 ? "var(--text-mute)" : "var(--text-faint)";
                const enginesCitedShort = k.engines_cited.map(e => ENGINE_LABEL_SHORT[e] || e).join(", ") || "—";
                const competitorCell = k.top_competitor
                  ? `<span style="color:var(--text-soft)">${esc(titleCaseName(k.top_competitor))}</span> <span style="color:var(--text-faint);font-size:11px">×${k.top_competitor_count}</span>`
                  : `<span style="color:var(--text-faint)">—</span>`;
                const framingCell = k.dominant_framing
                  ? `<span style="color:var(--text-soft)">${esc(FRAMING_LABEL_SHORT[k.dominant_framing] || k.dominant_framing)}</span>${k.dominant_position && k.dominant_position !== "listed" ? `<span style="color:var(--text-faint);font-size:11px"> · ${esc(k.dominant_position)}</span>` : ""}`
                  : `<span style="color:var(--text-faint)">—</span>`;
                return `
                  <tr style="border-bottom:1px solid var(--line)">
                    <td style="padding:11px 8px;color:var(--text-soft);max-width:280px">${esc(k.keyword)}</td>
                    <td style="text-align:right;padding:11px 8px;font-family:var(--mono);color:${rateColor};font-weight:500">${ratePct}%<span style="font-size:10.5px;color:var(--text-faint);margin-left:6px">(${k.cited_runs}/${k.total_runs})</span></td>
                    <td style="padding:11px 8px;font-family:var(--mono);font-size:11px;color:var(--text-soft)">${esc(enginesCitedShort)}</td>
                    <td style="padding:11px 8px">${competitorCell}</td>
                    <td style="padding:11px 8px">${framingCell}</td>
                  </tr>
                  ${k.sample_framing_phrase ? `
                  <tr>
                    <td colspan="5" style="padding:0 8px 12px;color:var(--text-faint);font-size:11.5px;font-style:italic;line-height:1.5">"${esc(k.sample_framing_phrase.length > 200 ? k.sample_framing_phrase.slice(0, 200) + "..." : k.sample_framing_phrase)}"</td>
                  </tr>
                  ` : ""}
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
        <div style="padding-top:14px;margin-top:14px;border-top:1px dashed var(--line);font-size:11.5px;color:var(--text-faint);line-height:1.6">
          Cite rate is the percentage of engine runs that cited your site for this keyword in the last 30 days. Engines cited shows which of the seven engines gave you a citation. Top competitor is the most-named alternative on this keyword. Your framing is how engines describe you when they do cite — value, premium, specialist, etc.
        </div>
      </div>
    `;
  })();

  // Reddit citation surface — break out Reddit as a first-class panel.
  // AI engines pull "best X for Y" answers heavily from Reddit, so the
  // subreddits where the client's category is discussed are an
  // actionable content roadmap on their own. Renders only when there
  // is at least one Reddit citation in the last 90 days.
  const redditHtml = !reddit.has_signal ? "" : (() => {
    const overallPct = Math.round(reddit.client_named_ratio * 100);
    return `
      <div style="margin-bottom:28px;padding:20px 24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:12px;flex-wrap:wrap">
          <div class="label" style="color:var(--gold)">§ Reddit citation surface — where AI pulls "best X for Y" answers from</div>
          <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint)">${reddit.total_reddit_mentions} reddit mentions · you named in ${reddit.client_named_in_reddit} (${overallPct}%) · ${reddit.briefs_drafted} briefs drafted</div>
        </div>

        <div style="font-size:12px;color:var(--text-mute);line-height:1.6;max-width:780px;margin-bottom:18px">
          Each row is a subreddit where AI engines cited a Reddit thread when answering one of your tracked queries. "You named" is how often the engine mentioned you alongside the Reddit citation. Subreddits where you're at 0% are content opportunities — that's where your category is being discussed without you in the conversation.
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:12.5px">
          <thead>
            <tr style="border-bottom:1px solid var(--line)">
              <th style="text-align:left;padding:10px 8px;font-family:var(--label);text-transform:uppercase;letter-spacing:0.15em;font-size:10px;color:var(--text-faint);font-weight:500">Subreddit</th>
              <th style="text-align:right;padding:10px 8px;font-family:var(--label);text-transform:uppercase;letter-spacing:0.15em;font-size:10px;color:var(--text-faint);font-weight:500">Mentions</th>
              <th style="text-align:right;padding:10px 8px;font-family:var(--label);text-transform:uppercase;letter-spacing:0.15em;font-size:10px;color:var(--text-faint);font-weight:500">You named</th>
              <th style="text-align:left;padding:10px 8px;font-family:var(--label);text-transform:uppercase;letter-spacing:0.15em;font-size:10px;color:var(--text-faint);font-weight:500">Top competitor</th>
              <th style="text-align:left;padding:10px 8px;font-family:var(--label);text-transform:uppercase;letter-spacing:0.15em;font-size:10px;color:var(--text-faint);font-weight:500">Example query</th>
            </tr>
          </thead>
          <tbody>
            ${reddit.subreddits.map((s) => {
              const namedPct = Math.round(s.client_named_ratio * 100);
              const namedColor = s.client_named_ratio >= 0.5 ? "#7fc99a" : s.client_named_ratio > 0 ? "var(--text-soft)" : "var(--text-faint)";
              const competitorCell = s.top_competitor
                ? `<span style="color:var(--text-soft)">${esc(titleCaseName(s.top_competitor))}</span> <span style="color:var(--text-faint);font-size:11px">×${s.top_competitor_count}</span>`
                : `<span style="color:var(--text-faint)">—</span>`;
              return `
                <tr style="border-bottom:1px solid var(--line)">
                  <td style="padding:11px 8px"><a href="https://www.reddit.com/r/${esc(s.subreddit)}/" target="_blank" rel="noopener" style="color:var(--text-soft);text-decoration:none;border-bottom:1px dashed var(--line)">r/${esc(s.subreddit)}</a></td>
                  <td style="text-align:right;padding:11px 8px;font-family:var(--mono);color:var(--text-soft);font-weight:500">${s.mention_count}</td>
                  <td style="text-align:right;padding:11px 8px;font-family:var(--mono);color:${namedColor};font-weight:500">${namedPct}%<span style="font-size:10.5px;color:var(--text-faint);margin-left:6px">(${s.client_named_count})</span></td>
                  <td style="padding:11px 8px">${competitorCell}</td>
                  <td style="padding:11px 8px;color:var(--text-faint);max-width:280px;font-size:11.5px">${esc(s.example_keyword || "—")}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>

        <div style="padding-top:14px;margin-top:14px;border-top:1px dashed var(--line);font-size:12px;color:var(--text-soft);line-height:1.65">
          <span style="color:var(--gold);font-family:var(--mono);font-size:10px;letter-spacing:0.1em;text-transform:uppercase;margin-right:8px">Reddit content roadmap</span>${
            reddit.subreddits.filter(s => s.client_named_ratio === 0).length > 0
              ? `${reddit.subreddits.filter(s => s.client_named_ratio === 0).length} subreddit${reddit.subreddits.filter(s => s.client_named_ratio === 0).length === 1 ? "" : "s"} cite your category but never mention you. ${reddit.subreddits.filter(s => s.client_named_ratio === 0).slice(0,3).map(s => "r/" + s.subreddit).join(", ")}${reddit.subreddits.filter(s => s.client_named_ratio === 0).length > 3 ? "..." : ""} are the highest-leverage threads to engage in. ${reddit.briefs_drafted > 0 ? `NeverRanked has drafted ${reddit.briefs_drafted} thread-specific reply briefs for you on the <a href="/admin/reddit-briefs/${esc(slug)}" style="color:var(--gold)">briefs page</a>.` : "On Amplify, NeverRanked drafts thread-specific reply briefs telling your team what to write."}`
              : "You're named in every subreddit that cites your category. Defense mode."
          }
        </div>
      </div>
    `;
  })();

  const body = `
    <div class="section-header">
      <h1>AI Citation Share</h1>
      <div class="section-sub">${esc(slug)}${latest ? ' -- last updated ' + new Date(latest.created_at * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : ''}</div>
    </div>

    ${liftHtml ? `<div style="margin-bottom:28px">${liftHtml}</div>` : ""}

    ${sovHtml}

    ${sentimentHtml}

    ${depthHtml}

    ${keywordDeepHtml}

    ${redditHtml}

    <!-- How the page works. Answers "what is citation share and what do
         these numbers mean" once, at the top, so every reader has a frame
         before they see a percentage. -->
    <div style="margin-bottom:28px;padding:16px 20px;background:var(--bg-lift);border-left:2px solid var(--gold-dim);border-radius:0 3px 3px 0">
      <div class="label" style="margin-bottom:8px;color:var(--gold)">\u00a7 What this page shows</div>
      <div style="font-size:12px;color:var(--text-soft);line-height:1.7;max-width:780px">
        Every Monday we run a fixed set of questions about your industry through ChatGPT, Perplexity, Claude, Gemini, Microsoft Copilot, Google AI Overviews, and Gemma. Your <strong style="color:var(--text);font-weight:500">citation share</strong> is the percentage of answers that cite your site. 10% means one in ten answers names you. Numbers below come from real AI responses this past week, not simulated traffic.
      </div>
    </div>

    ${!latest ? `
    <div class="empty" style="padding:28px 24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
      <h3 style="margin-bottom:10px;font-style:italic">No citation data yet</h3>
      <p style="color:var(--text-faint);font-size:13px;line-height:1.7;max-width:680px;margin:0">
        ${keywords.length === 0
          ? 'Citation tracking starts once keywords are configured. Your account manager adds these during onboarding based on the questions your prospects are actually asking AI assistants.'
          : 'Citation tracking runs automatically every Monday at 6am UTC. Your first results will appear here after the next Monday scan.'}
      </p>
      ${user.role === "admin" && !user._viewAsClient ? `
        <div style="margin-top:16px">
          <a href="/admin/citations/${esc(slug)}" class="btn">Manage keywords</a>
        </div>
      ` : ""}
    </div>
    ` : buildCitationDataSection(
      latest, previous, shareNow, deltaHtml, chartData,
      topCompetitors, keywordBreakdown, enginesBreakdown, slug, aeoContext
    )}

    <!-- Competitor citation comparison matrix (entity-level) -->
    ${await buildCompetitorCitationMatrix(slug, keywordBreakdown, env)}

    <!-- Source-level gaps (which sources AI engines pull from, where you're missing).
         Fetches ALL active domains for the client so multi-domain brands
         (example.com + app.example.com + docs.example.com) get every
         domain marked as client-owned. Single-domain clients are unaffected. -->
    ${await (async () => {
      const allDomains = (await env.DB.prepare(
        "SELECT domain FROM domains WHERE client_slug = ? AND is_competitor = 0 AND active = 1"
      ).bind(slug).all<{ domain: string }>()).results.map(r => r.domain);
      const gapReport = await buildCitationGapReport(slug, allDomains, env, 90);
      // Strategic rollup by source TYPE first (Reddit + news + Wikipedia
      // as content categories), then the existing domain-level panel
      // (TripAdvisor + reddit.com + staradvertiser.com as specific surfaces).
      const rollupHtml = renderSourceTypeRollupPanel(buildSourceTypeRollup(gapReport));
      const domainHtml = renderCitationGapPanel(gapReport);
      return rollupHtml + domainHtml;
    })()}

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
      ${user.role === "admin" && !user._viewAsClient ? `
      <div style="margin-top:16px">
        <a href="/admin/citations/${esc(slug)}" class="btn">Manage keywords</a>
      </div>
      ` : ""}
    </div>

    ${buildGlossary()}

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
  let kwRunningId = url?.searchParams.get("kw_running");
  const keywords = (
    await env.DB.prepare(
      "SELECT * FROM citation_keywords WHERE client_slug = ? ORDER BY active DESC, category, keyword"
    )
      .bind(slug)
      .all<CitationKeyword>()
  ).results;

  const activeCount = keywords.filter(k => k.active).length;

  // Server-side belt-and-suspenders: if the URL still says a keyword is
  // running but the keyword already has fresh citation_runs rows
  // (>=5 engines in the last 10 min), clear the running state. This
  // prevents the page from being stuck on "Running..." across refreshes
  // when the workflow has actually completed. The JS poller below
  // handles the real-time case where the user stays on the page.
  if (kwRunningId) {
    const tenMinAgo = Math.floor(Date.now() / 1000) - 600;
    const recentRow = await env.DB.prepare(
      "SELECT COUNT(DISTINCT engine) as n FROM citation_runs WHERE keyword_id = ? AND run_at > ?"
    ).bind(parseInt(kwRunningId, 10), tenMinAgo).first<{ n: number }>();
    if ((recentRow?.n ?? 0) >= 5) {
      kwRunningId = null;
    }
  }
  const kwRunStartedAt = Math.floor(Date.now() / 1000) - 30; // poll window starts 30s ago for safety

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
          <div id="scan-sub" style="color:var(--text-faint);font-size:12px;margin-top:4px">All 7 engines (Perplexity, ChatGPT, Gemini, Claude, Bing/Copilot, Google AIO, Gemma), all keywords, parallel workflows. Takes 2-4 minutes. This page will update automatically when the scan finishes.</div>
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

    ${kwRunningId ? `
    <div id="kw-scan-banner" class="card" style="border:1px solid var(--gold);background:rgba(232,199,103,0.06)">
      <div style="display:flex;align-items:center;gap:12px">
        <div id="kw-scan-dot" style="width:8px;height:8px;border-radius:50%;background:var(--gold);animation:pulse 1.5s infinite"></div>
        <div>
          <div id="kw-scan-title" style="color:var(--text);font-size:14px">Single-keyword scan running across 7 engines</div>
          <div id="kw-scan-sub" style="color:var(--text-faint);font-size:12px;margin-top:4px">Workflow dispatched. <span id="kw-engines-count">0</span> of 7 engines complete. <b style="color:var(--text)">Usually finishes in 30 to 90 seconds, occasionally up to 2 minutes if an engine is slow to respond.</b> Page will update automatically when at least 5 engines have produced rows (Google AI Overviews doesn't render for every query, which is normal).</div>
        </div>
      </div>
    </div>
    <style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}</style>
    <script>
    (function(){
      var started = Date.now();
      var slug = "${esc(slug)}";
      var keywordId = "${esc(kwRunningId)}";
      var sinceTs = ${kwRunStartedAt};
      // Scroll the banner into view on initial load so users who clicked
      // Run from deep in the keyword list don't miss it. Smooth scroll
      // so the motion itself confirms something happened.
      try {
        var bannerEl = document.getElementById("kw-scan-banner");
        if (bannerEl && bannerEl.scrollIntoView) {
          bannerEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      } catch(e){}
      function check(){
        fetch("/api/citation-keyword-status/" + slug + "/" + keywordId + "?since=" + sinceTs)
          .then(function(r){return r.json()})
          .then(function(d){
            var countEl = document.getElementById("kw-engines-count");
            if(countEl && typeof d.enginesComplete === "number") countEl.textContent = d.enginesComplete;
            if(d.done){
              document.getElementById("kw-scan-dot").style.animation="none";
              document.getElementById("kw-scan-dot").style.background="var(--green)";
              document.getElementById("kw-scan-title").textContent="Single-keyword scan complete (" + d.enginesComplete + " of 7 engines)";
              document.getElementById("kw-scan-sub").innerHTML='Results landed. <a href="/admin/citations/'+slug+'" style="color:var(--gold);font-weight:500">Refresh to see updated state</a> or <a href="/citations/'+slug+'" style="color:var(--gold);font-weight:500">view citation dashboard</a>.';
              document.getElementById("kw-scan-banner").style.borderColor="var(--green)";
              document.getElementById("kw-scan-banner").style.background="rgba(94,199,106,0.06)";
              // Auto-reload after 2 seconds so the Run button comes back without manual refresh.
              setTimeout(function(){ window.location.href = "/admin/citations/" + slug; }, 2000);
            } else if(Date.now()-started < 300000){
              setTimeout(check, 4000);
            } else {
              document.getElementById("kw-scan-title").textContent="Scan taking longer than expected";
              document.getElementById("kw-scan-sub").innerHTML='Reached the 5-minute poll window. <a href="/admin/citations/'+slug+'" style="color:var(--gold);font-weight:500">Refresh manually</a> to check current state.';
            }
          }).catch(function(){
            if(Date.now()-started < 300000) setTimeout(check, 6000);
          });
      }
      setTimeout(check, 5000);
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
      ${isRunning ? `
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:8px;height:8px;border-radius:50%;background:var(--gold);animation:pulse 1.5s infinite"></div>
          <button type="button" disabled class="btn" style="background:var(--line);color:var(--text-faint);cursor:not-allowed;border-color:var(--line)">Scan running...</button>
          <span style="font-size:12px;color:var(--text-faint)">All 7 engines, one workflow per keyword. Takes 2-4 min. Banner at top will update.</span>
        </div>
        <style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}</style>
      ` : `
        <form method="POST" action="/admin/citations/${esc(slug)}/run" id="full-scan-form">
          <button type="submit" class="btn" id="full-scan-btn" style="background:var(--gold);color:var(--bg)" onclick="this.disabled=true;this.textContent='Starting scan...';this.style.background='var(--line)';this.style.color='var(--text-faint)';this.form.submit();">Run citation scan now</button>
          <span style="font-size:12px;color:var(--text-faint);margin-left:8px">All keywords across all 7 engines (Perplexity, ChatGPT, Claude, Gemini, Microsoft Copilot, Google AIO, Gemma)</span>
        </form>
      `}
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
                  <div style="display:flex;gap:6px;align-items:center">
                    ${kwRunningId === String(k.id) ? `
                      <button type="button" disabled class="btn-sm" style="background:var(--line);color:var(--text-faint);border:1px solid var(--line);min-width:64px;cursor:not-allowed">Running...</button>
                    ` : `
                      <form method="POST" action="/admin/citations/${esc(slug)}/keyword/${k.id}/run" style="margin:0">
                        <button type="submit" class="btn-sm" style="background:var(--gold);color:var(--bg);border:1px solid var(--gold);min-width:64px" onclick="this.disabled=true;this.textContent='Starting...';this.style.background='var(--line)';this.style.color='var(--text-faint)';this.form.submit();">Run</button>
                      </form>
                    `}
                    <form method="POST" action="/admin/citations/${esc(slug)}/delete/${k.id}" style="margin:0">
                      <button type="submit" class="btn-sm" style="background:transparent;color:var(--text-faint);border:1px solid var(--line);min-width:64px">Remove</button>
                    </form>
                  </div>
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
  // Dispatch one CitationKeywordWorkflow per active keyword for this
  // client, then dispatch WeeklyExtrasWorkflow with slugFilter for
  // the same-day snapshot. This matches the daily cron path so we're
  // exercising the same architecture in production.
  //
  // Each per-keyword workflow gets its own 1000-subrequest budget,
  // which avoids the shared-budget exhaustion that killed earlier
  // multi-step approaches at ~2 keywords.
  const { planCitationRun } = await import("../citations");
  const plan = await planCitationRun(env, slug);
  let dispatched = 0;
  for (const item of plan.items) {
    try {
      await env.CITATION_KEYWORD_WORKFLOW.create({
        params: { clientSlug: item.clientSlug, keywordId: item.keywordId },
      });
      dispatched++;
    } catch (e) {
      console.log(`[manual citations] dispatch failed for ${item.clientSlug}/${item.keywordId}: ${e}`);
    }
  }
  // Snapshot follows. lookback=1 so the snapshot reflects only today's
  // run (the one we just kicked off + any earlier same-day rows),
  // giving the user fresh dashboard feedback without waiting until
  // Monday's weekly rollup.
  try {
    await env.WEEKLY_EXTRAS_WORKFLOW.create({
      params: {
        slugFilter: slug,
        runSnapshot: true,
        snapshotLookbackDays: 1,
        runGscAndBackup: false,
      },
    });
  } catch (e) {
    console.log(`[manual citations] snapshot dispatch failed for ${slug}: ${e}`);
  }
  console.log(`[manual citations] ${slug}: ${dispatched}/${plan.items.length} keyword workflows dispatched`);
  return redirect(`/admin/citations/${slug}?running=1`);
}

// Per-keyword "Run" button. Dispatches a CitationKeywordWorkflow
// instance for the single keyword, which gets its own 1000-subrequest
// budget. Earlier this used ctx.waitUntil(runOneKeywordCitations(...))
// which got cancelled by Workers' wall-time budget before all 7
// engines finished (~half the engines silently lost). Verified
// empirically 2026-05-11 ~01:20 HST: manual runs produced 3-5 row
// keyword runs with Gemma + AIO consistently missing. The workflow
// path is the same architecture the daily cron uses for full roster
// runs.
export async function handleManualKeywordRun(
  slug: string,
  keywordId: number,
  env: Env,
  _ctx: ExecutionContext
): Promise<Response> {
  await env.CITATION_KEYWORD_WORKFLOW.create({
    params: { clientSlug: slug, keywordId },
  });
  return redirect(`/admin/citations/${slug}?kw_running=${keywordId}`);
}
