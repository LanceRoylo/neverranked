/**
 * Dashboard -- Weekly Summary page
 *
 * One-page "state of your brand" combining AEO score, citations,
 * search performance, roadmap progress, and key events.
 * The single view clients open every week.
 */

import type { Env, User, Domain, ScanResult, CitationSnapshot, GscSnapshot, RoadmapItem, RoadmapPhase } from "../types";
import { layout, html, esc, redirect } from "../render";
import { canAccessClient } from "../agency";

export async function handleSummary(
  slug: string,
  user: User,
  env: Env
): Promise<Response> {
  if (!(await canAccessClient(env, user, slug))) {
    return redirect("/");
  }

  // --- Fetch all data ---

  // Primary domains for this client
  const domains = (await env.DB.prepare(
    "SELECT * FROM domains WHERE client_slug = ? AND active = 1 AND is_competitor = 0 ORDER BY domain"
  ).bind(slug).all<Domain>()).results;

  if (domains.length === 0) {
    const body = `
      <div class="section-header">
        <h1>Weekly Summary</h1>
        <div class="section-sub">${esc(slug)}</div>
      </div>
      <div class="empty-hero">
        <div class="empty-hero-eyebrow">Your audit is on its way</div>
        <h2 class="empty-hero-title">We're getting ready to measure your AI visibility.</h2>
        <p class="empty-hero-body">Your AEO score, grade, and what's hurting your visibility will land here once your first scan runs. Scans fire every Monday at 6am UTC. The fastest way to get moving: install the tracking snippet on your site.</p>
        <div class="empty-hero-actions">
          <a href="/install" class="btn">Install the snippet &rarr;</a>
        </div>
      </div>
    `;
    return html(layout("Summary", body, user, slug));
  }

  // Latest + previous scans for each domain
  interface DomainSummary {
    domain: Domain;
    latest: ScanResult | null;
    previous: ScanResult | null;
  }
  const domainSummaries: DomainSummary[] = [];
  for (const d of domains) {
    const scans = (await env.DB.prepare(
      "SELECT * FROM scan_results WHERE domain_id = ? AND error IS NULL ORDER BY scanned_at DESC LIMIT 2"
    ).bind(d.id).all<ScanResult>()).results;
    domainSummaries.push({ domain: d, latest: scans[0] || null, previous: scans[1] || null });
  }

  // Citation snapshot
  const citationSnap = await env.DB.prepare(
    "SELECT * FROM citation_snapshots WHERE client_slug = ? ORDER BY week_start DESC LIMIT 2"
  ).bind(slug).all<CitationSnapshot>();
  const latestCitation = citationSnap.results[0] || null;
  const prevCitation = citationSnap.results[1] || null;

  // GSC snapshot
  const gscSnap = await env.DB.prepare(
    "SELECT * FROM gsc_snapshots WHERE client_slug = ? ORDER BY date_end DESC LIMIT 2"
  ).bind(slug).all<GscSnapshot>();
  const latestGsc = gscSnap.results[0] || null;
  const prevGsc = gscSnap.results[1] || null;

  // Roadmap progress
  const phases = (await env.DB.prepare(
    "SELECT * FROM roadmap_phases WHERE client_slug = ? ORDER BY phase_number"
  ).bind(slug).all<RoadmapPhase>()).results;
  const allItems = (await env.DB.prepare(
    "SELECT * FROM roadmap_items WHERE client_slug = ? ORDER BY sort_order"
  ).bind(slug).all<RoadmapItem>()).results;
  const totalItems = allItems.length;
  const doneItems = allItems.filter(i => i.status === "done").length;
  const inProgressItems = allItems.filter(i => i.status === "in_progress").length;
  const roadmapPct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  // Recent alerts (milestones and wins)
  const recentAlerts = (await env.DB.prepare(
    "SELECT type, title, detail, created_at FROM admin_alerts WHERE client_slug = ? ORDER BY created_at DESC LIMIT 5"
  ).bind(slug).all<{ type: string; title: string; detail: string | null; created_at: number }>()).results;

  // Recently completed roadmap items (last 2 weeks)
  const twoWeeksAgo = Math.floor(Date.now() / 1000) - 14 * 86400;
  const recentCompleted = (await env.DB.prepare(
    "SELECT title, category, completed_at FROM roadmap_items WHERE client_slug = ? AND status = 'done' AND completed_at > ? ORDER BY completed_at DESC LIMIT 5"
  ).bind(slug, twoWeeksAgo).all<{ title: string; category: string; completed_at: number }>()).results;

  // --- Build the page ---

  const reportDate = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  // AEO Score hero
  const primaryDomain = domainSummaries[0];
  const score = primaryDomain?.latest?.aeo_score || 0;
  const grade = primaryDomain?.latest?.grade || "?";
  const prevScore = primaryDomain?.previous?.aeo_score || null;
  let scoreDelta = "";
  if (prevScore !== null) {
    const diff = score - prevScore;
    if (diff > 0) scoreDelta = '<span style="color:var(--green);font-size:14px;margin-left:8px">+' + diff + '</span>';
    else if (diff < 0) scoreDelta = '<span style="color:var(--red);font-size:14px;margin-left:8px">' + diff + '</span>';
  }

  // Citation metrics
  let citationHtml = "";
  if (latestCitation) {
    const sharePct = (latestCitation.citation_share * 100).toFixed(0);
    let citDelta = "";
    if (prevCitation) {
      const diff = Math.round((latestCitation.citation_share - prevCitation.citation_share) * 100);
      if (diff > 0) citDelta = '<span style="color:var(--green);font-size:12px;margin-left:6px">+' + diff + ' pts</span>';
      else if (diff < 0) citDelta = '<span style="color:var(--red);font-size:12px;margin-left:6px">' + diff + ' pts</span>';
    }
    citationHtml = `
      <div class="card" style="text-align:center">
        <div class="label">Citation Share</div>
        <div style="font-size:32px;font-family:var(--serif);color:var(--text);margin-top:8px">${sharePct}%${citDelta}</div>
        <div style="font-size:12px;color:var(--text-faint);margin-top:4px">${latestCitation.client_citations} of ${latestCitation.total_queries} queries</div>
      </div>
    `;
  }

  // GSC metrics
  let gscHtml = "";
  if (latestGsc) {
    let clicksDelta = "";
    if (prevGsc) {
      const diff = latestGsc.clicks - prevGsc.clicks;
      if (diff > 0) clicksDelta = '<span style="color:var(--green);font-size:12px;margin-left:6px">+' + diff + '</span>';
      else if (diff < 0) clicksDelta = '<span style="color:var(--red);font-size:12px;margin-left:6px">' + diff + '</span>';
    }
    gscHtml = `
      <div class="card" style="text-align:center">
        <div class="label">Search Clicks</div>
        <div style="font-size:32px;font-family:var(--serif);color:var(--text);margin-top:8px">${latestGsc.clicks.toLocaleString()}${clicksDelta}</div>
        <div style="font-size:12px;color:var(--text-faint);margin-top:4px">${latestGsc.impressions.toLocaleString()} impressions</div>
      </div>
      <div class="card" style="text-align:center">
        <div class="label">Avg Position</div>
        <div style="font-size:32px;font-family:var(--serif);color:var(--text);margin-top:8px">${latestGsc.position.toFixed(1)}</div>
        <div style="font-size:12px;color:var(--text-faint);margin-top:4px">${(latestGsc.ctr * 100).toFixed(1)}% CTR</div>
      </div>
    `;
  }

  // Determine grid columns based on available data
  const metricCount = 2 + (latestCitation ? 1 : 0) + (latestGsc ? 2 : 0);
  const gridCols = Math.min(metricCount, 5);

  // Roadmap progress bar
  const activePhase = phases.find(p => p.status === "active");
  const roadmapHtml = totalItems > 0 ? `
    <div class="card">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px">
        <div class="label">Roadmap Progress</div>
        <div style="font-size:13px;color:var(--text-faint)">${doneItems} of ${totalItems} items (${roadmapPct}%)</div>
      </div>
      <div style="height:10px;background:rgba(251,248,239,.06);border-radius:5px;overflow:hidden;margin-bottom:16px">
        <div style="height:100%;width:${roadmapPct}%;background:var(--gold);border-radius:5px"></div>
      </div>
      <div style="display:flex;gap:20px;font-size:12px">
        <span style="color:var(--green)">${doneItems} done</span>
        <span style="color:var(--yellow)">${inProgressItems} in progress</span>
        <span style="color:var(--text-faint)">${totalItems - doneItems - inProgressItems} pending</span>
      </div>
      ${activePhase ? '<div style="margin-top:12px;font-size:12px;color:var(--text-faint)">Active phase: <span style="color:var(--gold)">' + esc(activePhase.title) + '</span></div>' : ""}
    </div>
  ` : "";

  // Recent wins / milestones
  const milestones = recentAlerts.filter(a => a.type === "milestone" || a.type === "auto_completed");
  const winsHtml = milestones.length > 0 || recentCompleted.length > 0 ? (() => {
    const items: string[] = [];
    for (const m of milestones.slice(0, 3)) {
      const d = new Date(m.created_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const icon = m.type === "milestone" ? "^^" : "ok";
      const color = m.type === "milestone" ? "var(--gold)" : "var(--green)";
      items.push('<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)">' +
        '<div style="width:24px;height:24px;border-radius:4px;background:var(--bg-edge);display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:9px;color:' + color + '">' + icon + '</div>' +
        '<div style="flex:1;font-size:13px;color:var(--text)">' + esc(m.title) + '</div>' +
        '<div style="font-size:11px;color:var(--text-faint);flex-shrink:0">' + d + '</div></div>');
    }
    for (const r of recentCompleted.slice(0, 3)) {
      const d = new Date(r.completed_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      items.push('<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)">' +
        '<div style="width:24px;height:24px;border-radius:4px;background:var(--bg-edge);display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:9px;color:var(--green)">//</div>' +
        '<div style="flex:1;font-size:13px;color:var(--text)">Completed: ' + esc(r.title) + '</div>' +
        '<div style="font-size:11px;color:var(--text-faint);flex-shrink:0">' + d + '</div></div>');
    }
    if (items.length === 0) return "";
    return '<div class="card"><div class="label" style="margin-bottom:12px">Recent Wins</div>' + items.slice(0, 5).join("") + '</div>';
  })() : "";

  // Top queries from GSC
  let topQueriesHtml = "";
  if (latestGsc) {
    try {
      const queries: { query: string; clicks: number; impressions: number; position: number }[] = JSON.parse(latestGsc.top_queries);
      if (queries.length > 0) {
        const rows = queries.slice(0, 5).map(q =>
          '<tr><td style="font-size:13px;color:var(--text)">' + esc(q.query) + '</td>' +
          '<td style="text-align:right;font-size:12px;color:var(--text-faint)">' + q.clicks + '</td>' +
          '<td style="text-align:right;font-size:12px;color:var(--text-faint)">' + q.position.toFixed(1) + '</td></tr>'
        ).join("");
        topQueriesHtml = `
          <div class="card">
            <div class="label" style="margin-bottom:12px">Top Search Queries</div>
            <table class="data-table">
              <thead><tr><th>Query</th><th style="text-align:right">Clicks</th><th style="text-align:right">Position</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        `;
      }
    } catch {}
  }

  // Top cited competitors
  let topCompetitorsHtml = "";
  if (latestCitation) {
    try {
      const comps: { name: string; count: number }[] = JSON.parse(latestCitation.top_competitors);
      if (comps.length > 0) {
        const maxCount = Math.max(...comps.slice(0, 5).map(c => c.count), 1);
        const rows = comps.slice(0, 5).map(c => {
          const pct = (c.count / maxCount) * 100;
          return '<div style="display:flex;align-items:center;gap:12px;padding:6px 0">' +
            '<div style="width:140px;font-size:12px;color:var(--text-faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(c.name) + '</div>' +
            '<div style="flex:1;height:6px;background:rgba(251,248,239,.06);border-radius:3px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:rgba(251,248,239,.15);border-radius:3px"></div></div>' +
            '<div style="font-size:11px;color:var(--text-faint);min-width:24px;text-align:right">' + c.count + '</div></div>';
        }).join("");
        topCompetitorsHtml = `
          <div class="card">
            <div class="label" style="margin-bottom:12px">Top Cited Competitors</div>
            ${rows}
          </div>
        `;
      }
    } catch {}
  }

  // Build the narrative
  const narrative = buildSummaryNarrative(slug, score, prevScore, latestCitation, prevCitation, latestGsc, prevGsc, roadmapPct, doneItems, totalItems);

  // Multi-domain scores (if more than one)
  let multiDomainHtml = "";
  if (domainSummaries.length > 1) {
    const rows = domainSummaries.map(ds => {
      const s = ds.latest;
      if (!s) return "";
      let delta = "";
      if (ds.previous) {
        const diff = s.aeo_score - ds.previous.aeo_score;
        if (diff > 0) delta = '<span style="color:var(--green);font-size:11px;margin-left:6px">+' + diff + '</span>';
        else if (diff < 0) delta = '<span style="color:var(--red);font-size:11px;margin-left:6px">' + diff + '</span>';
      }
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)">' +
        '<a href="/domain/' + ds.domain.id + '" style="font-size:13px;color:var(--text);text-decoration:none;font-style:italic">' + esc(ds.domain.domain) + '</a>' +
        '<div style="display:flex;align-items:center;gap:8px">' + delta +
        '<span class="grade grade-' + s.grade + '" style="width:24px;height:24px;font-size:11px">' + s.grade + '</span>' +
        '<span style="font-size:13px;color:var(--text-faint)">' + s.aeo_score + '/100</span></div></div>';
    }).join("");
    multiDomainHtml = `
      <div class="card">
        <div class="label" style="margin-bottom:12px">All Domains</div>
        ${rows}
      </div>
    `;
  }

  const body = `
    <div class="section-header">
      <h1>Weekly Summary</h1>
      <div class="section-sub">${esc(slug)} -- ${reportDate}</div>
    </div>

    <!-- Narrative -->
    <div class="narrative-context" style="margin-bottom:28px">
      ${esc(narrative)}
    </div>

    <!-- Hero KPIs -->
    <div style="display:grid;grid-template-columns:repeat(${gridCols},1fr);gap:16px;margin-bottom:28px">
      <div class="card" style="text-align:center">
        <div class="label">AEO Score</div>
        <div style="font-size:32px;font-family:var(--serif);color:var(--text);margin-top:8px">${score}${scoreDelta}</div>
        <div style="margin-top:4px"><span class="grade grade-${grade}" style="width:28px;height:28px;font-size:14px">${grade}</span></div>
      </div>
      <div class="card" style="text-align:center">
        <div class="label">Red Flags</div>
        <div style="font-size:32px;font-family:var(--serif);color:var(--text);margin-top:8px">${primaryDomain?.latest ? JSON.parse(primaryDomain.latest.red_flags).length : 0}</div>
        <div style="font-size:12px;color:var(--text-faint);margin-top:4px">issues to fix</div>
      </div>
      ${citationHtml}
      ${gscHtml}
    </div>

    <!-- Two-column layout: left = roadmap + wins, right = queries + competitors -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px">
      <div style="display:flex;flex-direction:column;gap:16px">
        ${roadmapHtml}
        ${winsHtml}
        ${multiDomainHtml}
      </div>
      <div style="display:flex;flex-direction:column;gap:16px">
        ${topQueriesHtml}
        ${topCompetitorsHtml}
      </div>
    </div>

    <!-- Quick links -->
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">
      ${domainSummaries.length > 0 ? '<a href="/domain/' + domainSummaries[0].domain.id + '" class="btn btn-ghost" style="font-size:11px">Full AEO Report</a>' : ""}
      <a href="/citations/${encodeURIComponent(slug)}" class="btn btn-ghost" style="font-size:11px">Citations</a>
      <a href="/search/${encodeURIComponent(slug)}" class="btn btn-ghost" style="font-size:11px">Search Performance</a>
      <a href="/competitors/${encodeURIComponent(slug)}" class="btn btn-ghost" style="font-size:11px">Competitors</a>
      <a href="/roadmap/${encodeURIComponent(slug)}" class="btn btn-ghost" style="font-size:11px">Roadmap</a>
    </div>
  `;

  return html(layout("Summary", body, user, slug));
}

function buildSummaryNarrative(
  slug: string,
  score: number,
  prevScore: number | null,
  citation: CitationSnapshot | null,
  prevCitation: CitationSnapshot | null,
  gsc: GscSnapshot | null,
  prevGsc: GscSnapshot | null,
  roadmapPct: number,
  doneItems: number,
  totalItems: number
): string {
  const parts: string[] = [];

  parts.push("This is the weekly snapshot for " + slug + ", pulling together AEO readiness, AI citations, search performance, and roadmap progress into one view.");

  // Score narrative
  if (score === 0) {
    parts.push("No AEO scan has completed yet. Once the first scan runs, the score and grade will appear here.");
  } else if (prevScore !== null) {
    const diff = score - prevScore;
    if (diff > 5) {
      parts.push("The AEO score jumped " + diff + " points this week to " + score + "/100. That is strong forward momentum.");
    } else if (diff > 0) {
      parts.push("The AEO score ticked up " + diff + " points to " + score + "/100. Steady progress.");
    } else if (diff < -5) {
      parts.push("The AEO score dropped " + Math.abs(diff) + " points to " + score + "/100. The full report shows what changed and what to do about it.");
    } else if (diff < 0) {
      parts.push("The AEO score dipped " + Math.abs(diff) + " points to " + score + "/100. Small fluctuations are normal week to week.");
    } else {
      parts.push("The AEO score held steady at " + score + "/100.");
    }
  } else {
    parts.push("Current AEO score is " + score + "/100.");
  }

  // Citation narrative
  if (citation) {
    const pct = Math.round(citation.citation_share * 100);
    if (prevCitation) {
      const prevPct = Math.round(prevCitation.citation_share * 100);
      const diff = pct - prevPct;
      if (diff > 0) {
        parts.push("AI citation share grew to " + pct + "%, up " + diff + " points. More AI engines are recommending the brand.");
      } else if (diff < 0) {
        parts.push("AI citation share is " + pct + "%, down " + Math.abs(diff) + " points. Citation share fluctuates as AI models update their responses.");
      } else {
        parts.push("AI citation share is holding at " + pct + "%.");
      }
    } else {
      parts.push("AI citation share is " + pct + "% across " + citation.total_queries + " tracked queries.");
    }
  }

  // GSC narrative
  if (gsc && (gsc.clicks > 0 || gsc.impressions > 0)) {
    if (prevGsc) {
      const clickDiff = gsc.clicks - prevGsc.clicks;
      if (clickDiff > 0) {
        parts.push("Google search clicks are up to " + gsc.clicks + " (+" + clickDiff + " vs last week).");
      } else if (clickDiff < 0) {
        parts.push("Google search clicks came in at " + gsc.clicks + " (" + clickDiff + " vs last week).");
      }
    } else if (gsc.clicks > 0) {
      parts.push(gsc.clicks + " clicks from Google search this period.");
    }
  }

  // Roadmap narrative
  if (totalItems > 0) {
    if (roadmapPct === 100) {
      parts.push("Every roadmap item is complete. The next phase of optimization opportunities will be identified.");
    } else if (roadmapPct >= 75) {
      parts.push("The roadmap is " + roadmapPct + "% complete with " + doneItems + " of " + totalItems + " items delivered. The finish line is close.");
    } else if (doneItems > 0) {
      parts.push(doneItems + " of " + totalItems + " roadmap items delivered (" + roadmapPct + "%). Work is progressing.");
    }
  }

  return parts.join(" ");
}
