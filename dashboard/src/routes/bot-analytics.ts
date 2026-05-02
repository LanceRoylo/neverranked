/**
 * Bot Analytics dashboard.
 *
 * GET /admin/bots/:slug -- shows which AI + search bots have fetched
 * the customer's schema injection script in the last 30 days.
 *
 * Coverage: training crawlers that scrape raw HTML do NOT fetch the
 * schema script. The most accurate signal is for citation-time
 * crawlers (ChatGPT-User, Perplexity, Claude-Web). The page surfaces
 * this caveat in plain English so customers understand the partial
 * picture.
 */

import type { Env, User } from "../types";
import { layout, html, esc, redirect } from "../render";
import { canAccessClient } from "../agency";
import { botLabel, isAiBot } from "../bot-analytics";

interface BotRow {
  bot_pattern: string;
  hits_7d: number;
  hits_30d: number;
  last_seen: number;
}

interface DayBucket {
  day: string;       // YYYY-MM-DD
  total: number;
  ai: number;
}

export async function handleBotAnalytics(
  slug: string,
  user: User,
  env: Env,
): Promise<Response> {
  if (!(await canAccessClient(env, user, slug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }

  const now = Math.floor(Date.now() / 1000);
  const day = 86400;
  const sevenAgo = now - 7 * day;
  const thirtyAgo = now - 30 * day;

  // Per-bot rollup for 7d / 30d windows.
  const rollup = (await env.DB.prepare(
    `SELECT bot_pattern,
            SUM(CASE WHEN hit_at >= ? THEN 1 ELSE 0 END) AS hits_7d,
            SUM(CASE WHEN hit_at >= ? THEN 1 ELSE 0 END) AS hits_30d,
            MAX(hit_at) AS last_seen
       FROM bot_hits
       WHERE client_slug = ? AND hit_at >= ?
       GROUP BY bot_pattern
       ORDER BY hits_30d DESC, last_seen DESC`
  ).bind(sevenAgo, thirtyAgo, slug, thirtyAgo).all<BotRow>()).results;

  const totals = {
    aiHits7d: rollup.filter(r => isAiBot(r.bot_pattern)).reduce((s, r) => s + r.hits_7d, 0),
    searchHits7d: rollup.filter(r => !isAiBot(r.bot_pattern)).reduce((s, r) => s + r.hits_7d, 0),
    aiHits30d: rollup.filter(r => isAiBot(r.bot_pattern)).reduce((s, r) => s + r.hits_30d, 0),
    searchHits30d: rollup.filter(r => !isAiBot(r.bot_pattern)).reduce((s, r) => s + r.hits_30d, 0),
    distinctAiBots: rollup.filter(r => isAiBot(r.bot_pattern) && r.hits_30d > 0).length,
  };

  // Daily buckets for the trend chart (last 30 days).
  const daily = (await env.DB.prepare(
    `SELECT date(hit_at, 'unixepoch') AS day,
            COUNT(*) AS total,
            SUM(CASE WHEN bot_pattern IN ('openai_train','openai_browse','openai_search','anthropic_browse','anthropic_train','perplexity','perplexity_user','google_extended','apple_extended','meta','bytedance','commoncrawl','cohere','other_ai') THEN 1 ELSE 0 END) AS ai
       FROM bot_hits
       WHERE client_slug = ? AND hit_at >= ?
       GROUP BY day
       ORDER BY day ASC`
  ).bind(slug, thirtyAgo).all<DayBucket>()).results;

  // Render the chart as inline SVG so it doesn't need any client JS.
  const chartHtml = renderTrendChart(daily, thirtyAgo, day);

  // Per-bot table rows.
  const rowsHtml = rollup.length === 0
    ? `<tr><td colspan="4" class="empty-row">No bot hits logged yet. Bots fetch the schema script when they encounter your snippet on a live page. The first hit usually shows within 24-48 hours of install.</td></tr>`
    : rollup.map(r => `
        <tr>
          <td>
            <span class="bot-dot ${isAiBot(r.bot_pattern) ? "ai" : "search"}"></span>
            <strong>${esc(botLabel(r.bot_pattern))}</strong>
          </td>
          <td class="num">${r.hits_7d.toLocaleString()}</td>
          <td class="num">${r.hits_30d.toLocaleString()}</td>
          <td class="muted">${formatRelative(now - r.last_seen)}</td>
        </tr>`).join("");

  const body = `
    <style>
      .bot-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:32px}
      .bot-stat{padding:18px 20px;background:var(--bg-edge);border:1px solid var(--line);border-radius:4px}
      .bot-stat-num{font-family:var(--serif);font-size:32px;font-weight:400;color:var(--text);line-height:1;margin-bottom:6px}
      .bot-stat-num.ai{color:var(--gold)}
      .bot-stat-label{font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:var(--text-faint)}
      .bot-table{width:100%;border-collapse:collapse;margin-top:8px}
      .bot-table th{text-align:left;font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:var(--text-faint);font-weight:500;padding:10px 12px;border-bottom:1px solid var(--line)}
      .bot-table td{padding:12px;border-bottom:1px solid var(--line);font-size:13.5px;color:var(--text-soft)}
      .bot-table td.num{font-family:var(--mono);text-align:right;color:var(--text)}
      .bot-table td.muted{color:var(--text-faint);font-size:12px}
      .bot-table .empty-row{text-align:center;color:var(--text-faint);padding:24px;font-size:13px}
      .bot-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:10px;vertical-align:middle}
      .bot-dot.ai{background:var(--gold)}
      .bot-dot.search{background:var(--text-faint)}
      .bot-chart{margin:8px 0 24px;padding:24px;background:var(--bg-edge);border:1px solid var(--line);border-radius:4px}
      .coverage-note{margin-top:24px;padding:16px 20px;background:var(--bg-edge);border-left:2px solid var(--gold-dim);font-size:12px;color:var(--text-soft);line-height:1.7}
    </style>

    <div style="margin-bottom:32px">
      <div class="label" style="margin-bottom:8px">
        <a href="/" style="color:var(--text-mute)">Dashboard</a> / ${esc(slug)} / Bot Analytics
      </div>
      <h1>Which bots are <em>reading your site?</em></h1>
      <p class="section-sub" style="margin-top:8px;max-width:680px">
        Every fetch of <code style="background:var(--bg-edge);padding:2px 6px;border-radius:2px;font-size:13px">/inject/${esc(slug)}.js</code> is a real page load on your site by a real client. We log AI and search bot user-agents here so you can see who's reading you, when, and how often.
      </p>
    </div>

    <!-- Top-line stats -->
    <div class="bot-stats">
      <div class="bot-stat">
        <div class="bot-stat-num ai">${totals.aiHits7d.toLocaleString()}</div>
        <div class="bot-stat-label">AI bot hits, 7d</div>
      </div>
      <div class="bot-stat">
        <div class="bot-stat-num ai">${totals.aiHits30d.toLocaleString()}</div>
        <div class="bot-stat-label">AI bot hits, 30d</div>
      </div>
      <div class="bot-stat">
        <div class="bot-stat-num">${totals.distinctAiBots}</div>
        <div class="bot-stat-label">Distinct AI bots, 30d</div>
      </div>
      <div class="bot-stat">
        <div class="bot-stat-num">${totals.searchHits30d.toLocaleString()}</div>
        <div class="bot-stat-label">Search bot hits, 30d</div>
      </div>
    </div>

    <!-- Trend chart -->
    <div class="bot-chart">
      <div class="label" style="margin-bottom:14px;color:var(--text-faint)">Last 30 days &middot; <span style="color:var(--gold)">AI bots</span> vs <span style="color:var(--text-mute)">all bots</span></div>
      ${chartHtml}
    </div>

    <!-- Per-bot rollup -->
    <div style="margin-top:32px">
      <h2 style="margin:0 0 16px;font-family:var(--serif);font-size:24px;font-style:italic">Per-bot breakdown</h2>
      <table class="bot-table">
        <thead>
          <tr>
            <th>Bot</th>
            <th style="text-align:right">7-day hits</th>
            <th style="text-align:right">30-day hits</th>
            <th>Last seen</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>

    <!-- AI referrer traffic (humans who arrived from AI engines) -->
    ${await renderReferrerSection(slug, env)}

    <!-- Coverage caveat -->
    <div class="coverage-note">
      <strong style="color:var(--text)">Coverage note:</strong> we count bots that fetch your schema injection script. AI training crawlers that scrape raw HTML without executing JS may not appear here. The most accurate signal is for citation-time crawlers (ChatGPT-User, Perplexity, Claude-Web) that fetch external resources during live answers. Coverage improves as your snippet ships across more pages on your site.
    </div>
  `;

  return html(layout("Bot Analytics", body, user, slug));
}

/** Build a simple bar-chart SVG showing all-bots vs AI-bots per day.
 *  No client JS required -- the SVG is fully static. */
function renderTrendChart(daily: DayBucket[], rangeStart: number, daySec: number): string {
  // Ensure all 30 days are represented even if zero.
  const days: { day: string; total: number; ai: number }[] = [];
  for (let i = 0; i < 30; i++) {
    const t = rangeStart + i * daySec;
    const d = new Date(t * 1000).toISOString().slice(0, 10);
    const found = daily.find(x => x.day === d);
    days.push({ day: d, total: found?.total ?? 0, ai: found?.ai ?? 0 });
  }

  const maxVal = Math.max(1, ...days.map(d => d.total));
  const w = 16;
  const gap = 4;
  const chartW = days.length * (w + gap);
  const chartH = 160;
  const padBottom = 24;
  const totalH = chartH + padBottom;

  const bars = days.map((d, i) => {
    const x = i * (w + gap);
    const totalH_bar = (d.total / maxVal) * chartH;
    const aiH = (d.ai / maxVal) * chartH;
    const yTotal = chartH - totalH_bar;
    const yAi = chartH - aiH;
    return `
      <rect x="${x}" y="${yTotal}" width="${w}" height="${totalH_bar}" fill="rgba(251,248,239,.18)" />
      <rect x="${x}" y="${yAi}" width="${w}" height="${aiH}" fill="var(--gold)" opacity=".85" />
    `;
  }).join("");

  // X-axis labels: first day, midpoint, last day.
  const labelDays = [days[0]?.day, days[Math.floor(days.length / 2)]?.day, days[days.length - 1]?.day];
  const labels = labelDays.map((d, i) => {
    const positions = [0, chartW / 2, chartW];
    const anchors = ["start", "middle", "end"];
    const short = d ? d.slice(5) : "";
    return `<text x="${positions[i]}" y="${chartH + 18}" fill="var(--text-faint)" font-family="var(--mono)" font-size="10" text-anchor="${anchors[i]}">${short}</text>`;
  }).join("");

  return `
    <svg viewBox="0 0 ${chartW} ${totalH}" preserveAspectRatio="none" style="width:100%;height:${totalH}px;display:block">
      ${bars}
      ${labels}
    </svg>
  `;
}

async function renderReferrerSection(slug: string, env: Env): Promise<string> {
  const { getReferrerStats, engineLabel } = await import("../referrer-tracking");
  const stats = await getReferrerStats(env, slug);

  const empty = stats.totals.hits_30d === 0;
  const perEngineRows = stats.perEngine.length === 0
    ? `<tr><td colspan="3" class="empty-row">No human visits from AI engines logged yet. The first hit usually shows within a week of the snippet shipping, once your site is cited in a live answer and someone clicks through.</td></tr>`
    : stats.perEngine.map(e => `
        <tr>
          <td><span class="bot-dot ai"></span><strong>${esc(engineLabel(e.engine))}</strong></td>
          <td class="num">${e.hits_7d.toLocaleString()}</td>
          <td class="num">${e.hits_30d.toLocaleString()}</td>
        </tr>`).join("");

  const topPagesHtml = stats.topLandingPages.length === 0
    ? ""
    : `
      <div style="margin-top:24px">
        <div class="label" style="margin-bottom:10px">Top landing pages from AI</div>
        <table class="bot-table">
          <thead><tr><th>Page</th><th style="text-align:right">30-day hits</th></tr></thead>
          <tbody>
            ${stats.topLandingPages.map(p => `
              <tr>
                <td style="font-family:var(--mono);font-size:12px">${esc(p.path)}</td>
                <td class="num">${p.hits_30d.toLocaleString()}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;

  return `
    <div style="margin-top:48px;border-top:1px solid var(--line);padding-top:32px">
      <h2 style="margin:0 0 8px;font-family:var(--serif);font-size:24px;font-style:italic">Real visits from AI engines</h2>
      <p style="color:var(--text-mute);font-size:13px;margin:0 0 20px;max-width:680px">
        Humans who clicked through from an AI answer. Captured by the inject snippet reading <code style="background:var(--bg-edge);padding:1px 5px;border-radius:2px;font-size:12px">document.referrer</code> on every page load. Closes the loop: bots crawl &rarr; model cites &rarr; <strong style="color:var(--text)">visitor lands</strong>.
      </p>

      <div class="bot-stats" style="margin-bottom:24px">
        <div class="bot-stat">
          <div class="bot-stat-num ai">${stats.totals.hits_7d.toLocaleString()}</div>
          <div class="bot-stat-label">AI visits, 7d</div>
        </div>
        <div class="bot-stat">
          <div class="bot-stat-num ai">${stats.totals.hits_30d.toLocaleString()}</div>
          <div class="bot-stat-label">AI visits, 30d</div>
        </div>
        <div class="bot-stat">
          <div class="bot-stat-num">${stats.totals.distinctEngines}</div>
          <div class="bot-stat-label">Distinct engines, 30d</div>
        </div>
      </div>

      <table class="bot-table">
        <thead><tr><th>Engine</th><th style="text-align:right">7d</th><th style="text-align:right">30d</th></tr></thead>
        <tbody>${perEngineRows}</tbody>
      </table>

      ${topPagesHtml}

      ${empty ? "" : `<p style="color:var(--text-faint);font-size:11.5px;margin-top:14px;line-height:1.6">Captured client-side via the snippet. Visitors with privacy tools that strip the Referer header won't appear; counts are conservative.</p>`}
    </div>
  `;
}

function formatRelative(secsAgo: number): string {
  if (secsAgo < 60) return "just now";
  if (secsAgo < 3600) return `${Math.floor(secsAgo / 60)}m ago`;
  if (secsAgo < 86400) return `${Math.floor(secsAgo / 3600)}h ago`;
  if (secsAgo < 30 * 86400) return `${Math.floor(secsAgo / 86400)}d ago`;
  return `${Math.floor(secsAgo / (30 * 86400))}mo ago`;
}
