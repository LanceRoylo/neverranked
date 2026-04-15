/**
 * Dashboard — Home route (domain overview)
 */

import type { Env, User, Domain, ScanResult, GscSnapshot, RoadmapItem, CitationSnapshot } from "../types";
import { layout, html, esc } from "../render";

interface HomeGscData {
  clicks: number;
  impressions: number;
  prevClicks: number | null;
}

function buildHomeNarrative(user: User, domainCount: number, clientCount: number, gscMap: Map<string, HomeGscData>): string {
  if (user.role === "admin") {
    if (domainCount === 0) return "No client domains are being tracked yet. Add clients and their primary domains from the admin panel to start monitoring AEO readiness.";
    let base = "This is the overview of all " + domainCount + " tracked domains across " + clientCount + " client" + (clientCount > 1 ? "s" : "") + ". Each card shows the current AEO readiness grade and score. Click any domain for the full report with technical signals, schema coverage, and recommended actions.";
    if (gscMap.size > 0) {
      let totalClicks = 0;
      let totalImpressions = 0;
      for (const g of gscMap.values()) { totalClicks += g.clicks; totalImpressions += g.impressions; }
      if (totalClicks > 0 || totalImpressions > 0) {
        base += " Across all connected Search Console properties, there were " + totalClicks.toLocaleString() + " clicks and " + totalImpressions.toLocaleString() + " impressions in the latest reporting period.";
      }
    }
    return base;
  }
  if (domainCount === 0) return "Your account is being set up. Once your domains are added, this dashboard will show your AEO readiness scores, track progress over time, and highlight exactly what needs attention.";
  if (domainCount === 1) {
    let base = "This is your AEO readiness dashboard. The score and grade below reflect how well your site is optimized for AI engine visibility. Click through for the full breakdown of technical signals, schema coverage, and what to improve next.";
    if (gscMap.size > 0) {
      const g = [...gscMap.values()][0];
      if (g.clicks > 0) {
        base += " Your site received " + g.clicks.toLocaleString() + " clicks from Google search this past week.";
      } else if (g.impressions > 0) {
        base += " Your site appeared " + g.impressions.toLocaleString() + " times in Google search results this past week.";
      }
    }
    return base;
  }
  return "These are your tracked domains. Each one is scored independently for AEO readiness. Click any domain to see its full report, including schema coverage, technical signals, and prioritized recommendations.";
}

/** Build a "what changed" banner for clients based on activity since last login */
async function buildChangeBanner(user: User, env: Env): Promise<string> {
  if (user.role === "admin" || !user.client_slug || !user.last_login_at) return "";

  const since = user.last_login_at;
  const changes: string[] = [];

  // Score changes since last login
  const latestScan = await env.DB.prepare(
    "SELECT sr.aeo_score, sr.grade, d.domain FROM scan_results sr JOIN domains d ON sr.domain_id = d.id WHERE d.client_slug = ? AND d.is_competitor = 0 AND sr.scanned_at > ? ORDER BY sr.scanned_at DESC LIMIT 1"
  ).bind(user.client_slug, since).first<{ aeo_score: number; grade: string; domain: string }>();

  const prevScan = await env.DB.prepare(
    "SELECT sr.aeo_score FROM scan_results sr JOIN domains d ON sr.domain_id = d.id WHERE d.client_slug = ? AND d.is_competitor = 0 AND sr.scanned_at <= ? ORDER BY sr.scanned_at DESC LIMIT 1"
  ).bind(user.client_slug, since).first<{ aeo_score: number }>();

  if (latestScan && prevScan) {
    const diff = latestScan.aeo_score - prevScan.aeo_score;
    if (diff > 0) {
      changes.push(`AEO score rose <span style="color:var(--green)">+${diff}</span> to ${latestScan.aeo_score}`);
    } else if (diff < 0) {
      changes.push(`AEO score dropped <span style="color:var(--red)">${diff}</span> to ${latestScan.aeo_score}`);
    }
  }

  // Roadmap items completed since last login
  const completedItems = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM roadmap_items WHERE client_slug = ? AND status = 'done' AND completed_at > ?"
  ).bind(user.client_slug, since).first<{ cnt: number }>();
  if (completedItems && completedItems.cnt > 0) {
    changes.push(`${completedItems.cnt} roadmap item${completedItems.cnt > 1 ? 's' : ''} completed`);
  }

  // New alerts since last login
  const newAlerts = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM admin_alerts WHERE client_slug = ? AND created_at > ? AND read_at IS NULL"
  ).bind(user.client_slug, since).first<{ cnt: number }>();
  if (newAlerts && newAlerts.cnt > 0) {
    changes.push(`${newAlerts.cnt} new alert${newAlerts.cnt > 1 ? 's' : ''}`);
  }

  // New competitor scans since last login
  const compScans = await env.DB.prepare(
    "SELECT COUNT(DISTINCT d.id) as cnt FROM scan_results sr JOIN domains d ON sr.domain_id = d.id WHERE d.client_slug = ? AND d.is_competitor = 1 AND sr.scanned_at > ?"
  ).bind(user.client_slug, since).first<{ cnt: number }>();
  if (compScans && compScans.cnt > 0) {
    changes.push(`${compScans.cnt} competitor${compScans.cnt > 1 ? 's' : ''} re-scanned`);
  }

  if (changes.length === 0) return "";

  const lastVisit = new Date(since * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return `
    <div style="margin-bottom:24px;padding:16px 20px;background:var(--bg-lift);border:1px solid var(--gold-dim);border-radius:4px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold)">Since ${lastVisit}</div>
      </div>
      <div style="display:flex;gap:20px;flex-wrap:wrap;font-size:13px;color:var(--text-soft)">
        ${changes.map(c => `<span>${c}</span>`).join('<span style="color:var(--line)">|</span>')}
      </div>
    </div>
  `;
}

/** Weekly performance summary for clients */
async function buildWeeklySummary(user: User, env: Env): Promise<string> {
  if (!user.client_slug) return "";

  const slug = user.client_slug;
  const metrics: { label: string; value: string; delta: string; deltaColor: string; icon: string }[] = [];

  // AEO Score (latest vs previous)
  const primaryDomain = await env.DB.prepare(
    "SELECT id FROM domains WHERE client_slug = ? AND is_competitor = 0 AND active = 1 LIMIT 1"
  ).bind(slug).first<{ id: number }>();

  if (primaryDomain) {
    const scans = (await env.DB.prepare(
      "SELECT aeo_score, grade FROM scan_results WHERE domain_id = ? AND error IS NULL ORDER BY scanned_at DESC LIMIT 2"
    ).bind(primaryDomain.id).all<{ aeo_score: number; grade: string }>()).results;

    if (scans.length > 0) {
      const current = scans[0];
      const prev = scans[1];
      const diff = prev ? current.aeo_score - prev.aeo_score : 0;
      const deltaText = prev ? (diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : "no change") : "first scan";
      const deltaColor = diff > 0 ? "var(--green)" : diff < 0 ? "var(--red)" : "var(--text-faint)";
      metrics.push({
        label: "AEO Score",
        value: `${current.aeo_score}/100`,
        delta: deltaText,
        deltaColor,
        icon: current.grade,
      });
    }
  }

  // Citation share
  const citSnaps = (await env.DB.prepare(
    "SELECT citation_share, client_citations, total_queries FROM citation_snapshots WHERE client_slug = ? ORDER BY week_start DESC LIMIT 2"
  ).bind(slug).all<{ citation_share: number; client_citations: number; total_queries: number }>()).results;

  if (citSnaps.length > 0) {
    const current = citSnaps[0];
    const prev = citSnaps[1];
    const pct = (current.citation_share * 100).toFixed(0);
    const diff = prev ? (current.citation_share - prev.citation_share) * 100 : 0;
    const deltaText = prev ? (diff > 0.5 ? `+${diff.toFixed(0)}%` : diff < -0.5 ? `${diff.toFixed(0)}%` : "steady") : "first week";
    const deltaColor = diff > 0.5 ? "var(--green)" : diff < -0.5 ? "var(--red)" : "var(--text-faint)";
    metrics.push({
      label: "Citation Share",
      value: `${pct}%`,
      delta: deltaText,
      deltaColor,
      icon: "Ai",
    });
  }

  // GSC clicks
  const gscSnaps = (await env.DB.prepare(
    "SELECT clicks, impressions FROM gsc_snapshots WHERE client_slug = ? ORDER BY date_end DESC LIMIT 2"
  ).bind(slug).all<{ clicks: number; impressions: number }>()).results;

  if (gscSnaps.length > 0) {
    const current = gscSnaps[0];
    const prev = gscSnaps[1];
    const diff = prev ? current.clicks - prev.clicks : 0;
    const deltaText = prev ? (diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : "no change") : "first week";
    const deltaColor = diff > 0 ? "var(--green)" : diff < 0 ? "var(--red)" : "var(--text-faint)";
    metrics.push({
      label: "Search Clicks",
      value: current.clicks.toLocaleString(),
      delta: deltaText,
      deltaColor,
      icon: "G",
    });
  }

  // Roadmap progress
  const rmStats = await env.DB.prepare(
    "SELECT COUNT(*) as total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done FROM roadmap_items WHERE client_slug = ?"
  ).bind(slug).first<{ total: number; done: number }>();

  if (rmStats && rmStats.total > 0) {
    const pct = Math.round(((rmStats.done || 0) / rmStats.total) * 100);
    metrics.push({
      label: "Roadmap",
      value: `${pct}%`,
      delta: `${rmStats.done || 0}/${rmStats.total} done`,
      deltaColor: "var(--text-faint)",
      icon: `${pct}`,
    });
  }

  if (metrics.length === 0) return "";

  const cards = metrics.map(m => `
    <div style="flex:1;min-width:140px;padding:16px 20px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span style="font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">${esc(m.label)}</span>
        <span style="font-family:var(--mono);font-size:11px;color:rgba(251,248,239,.3)">${esc(m.icon)}</span>
      </div>
      <div style="font-family:var(--mono);font-size:22px;color:var(--text);margin-bottom:4px">${esc(m.value)}</div>
      <div style="font-size:11px;color:${m.deltaColor}">${esc(m.delta)}</div>
    </div>
  `).join("");

  return `
    <div style="margin-bottom:32px">
      <div class="label" style="margin-bottom:12px">This Week</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        ${cards}
      </div>
    </div>
  `;
}

/** Admin-only: client health overview table */
async function buildClientHealth(env: Env): Promise<string> {
  // Get all client slugs with their primary domains
  const allDomains = (await env.DB.prepare(
    "SELECT * FROM domains WHERE active = 1 AND is_competitor = 0 ORDER BY client_slug"
  ).all<Domain>()).results;

  if (allDomains.length === 0) return "";

  const slugs = [...new Set(allDomains.map(d => d.client_slug))];
  const now = Math.floor(Date.now() / 1000);

  interface ClientRow {
    slug: string;
    score: number | null;
    grade: string;
    scoreDelta: number;
    daysSinceScan: number;
    roadmapTotal: number;
    roadmapDone: number;
    roadmapStale: number;
    citationShare: number | null;
    unreadAlerts: number;
    healthStatus: "healthy" | "warning" | "critical";
  }

  const rows: ClientRow[] = [];

  for (const slug of slugs) {
    const clientDomains = allDomains.filter(d => d.client_slug === slug);
    const primaryDomain = clientDomains[0];

    // Latest scan
    const recentScans = (await env.DB.prepare(
      "SELECT aeo_score, grade, scanned_at FROM scan_results WHERE domain_id = ? AND error IS NULL ORDER BY scanned_at DESC LIMIT 2"
    ).bind(primaryDomain.id).all<{ aeo_score: number; grade: string; scanned_at: number }>()).results;

    const latest = recentScans[0] || null;
    const prev = recentScans[1] || null;
    const score = latest ? latest.aeo_score : null;
    const grade = latest ? latest.grade : "?";
    const scoreDelta = latest && prev ? latest.aeo_score - prev.aeo_score : 0;
    const daysSinceScan = latest ? Math.floor((now - latest.scanned_at) / 86400) : 999;

    // Roadmap
    const roadmapStats = await env.DB.prepare(
      "SELECT status, updated_at FROM roadmap_items WHERE client_slug = ?"
    ).bind(slug).all<{ status: string; updated_at: number }>();
    const rmItems = roadmapStats.results;
    const roadmapTotal = rmItems.length;
    const roadmapDone = rmItems.filter(i => i.status === "done").length;
    const fourteenDaysAgo = now - 14 * 86400;
    const roadmapStale = rmItems.filter(i => i.status === "in_progress" && i.updated_at < fourteenDaysAgo).length;

    // Citation share (latest)
    const citSnap = await env.DB.prepare(
      "SELECT citation_share FROM citation_snapshots WHERE client_slug = ? ORDER BY week_start DESC LIMIT 1"
    ).bind(slug).first<{ citation_share: number }>();
    const citationShare = citSnap ? citSnap.citation_share : null;

    // Unread alerts
    const alertCount = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM admin_alerts WHERE client_slug = ? AND read_at IS NULL"
    ).bind(slug).first<{ cnt: number }>();
    const unreadAlerts = alertCount?.cnt || 0;

    // Health status
    let healthStatus: ClientRow["healthStatus"] = "healthy";
    if (daysSinceScan > 14 || (score !== null && score < 40) || roadmapStale > 3 || scoreDelta < -10) {
      healthStatus = "critical";
    } else if (daysSinceScan > 9 || roadmapStale > 0 || scoreDelta < -3 || unreadAlerts > 3) {
      healthStatus = "warning";
    }

    rows.push({ slug, score, grade, scoreDelta, daysSinceScan, roadmapTotal, roadmapDone, roadmapStale, citationShare, unreadAlerts, healthStatus });
  }

  // Sort: critical first, then warning, then healthy
  const order = { critical: 0, warning: 1, healthy: 2 };
  rows.sort((a, b) => order[a.healthStatus] - order[b.healthStatus]);

  const statusDot = (s: ClientRow["healthStatus"]) => {
    const color = s === "healthy" ? "var(--green)" : s === "warning" ? "var(--yellow)" : "var(--red)";
    return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color}"></span>`;
  };

  const tableRows = rows.map(r => {
    const deltaHtml = r.scoreDelta > 0
      ? `<span style="color:var(--green);font-size:11px">+${r.scoreDelta}</span>`
      : r.scoreDelta < 0
      ? `<span style="color:var(--red);font-size:11px">${r.scoreDelta}</span>`
      : `<span style="color:var(--text-faint);font-size:11px">--</span>`;

    const scanAge = r.daysSinceScan >= 999 ? "never" : r.daysSinceScan === 0 ? "today" : `${r.daysSinceScan}d ago`;
    const scanAgeColor = r.daysSinceScan > 14 ? "var(--red)" : r.daysSinceScan > 9 ? "var(--yellow)" : "var(--text-faint)";

    const rmPct = r.roadmapTotal > 0 ? Math.round((r.roadmapDone / r.roadmapTotal) * 100) : 0;
    const rmWidth = Math.max(2, rmPct);

    const citText = r.citationShare !== null ? `${(r.citationShare * 100).toFixed(0)}%` : "--";

    return `
      <tr style="border-bottom:1px solid rgba(251,248,239,.06)">
        <td style="padding:12px 16px">
          <div style="display:flex;align-items:center;gap:8px">
            ${statusDot(r.healthStatus)}
            <a href="/roadmap/${encodeURIComponent(r.slug)}" style="color:var(--text);font-size:13px;text-decoration:none">${esc(r.slug)}</a>
          </div>
        </td>
        <td style="padding:12px 8px;text-align:center">
          <span class="grade grade-${r.grade}" style="width:28px;height:28px;font-size:12px">${r.grade}</span>
        </td>
        <td style="padding:12px 8px;text-align:center;font-family:var(--mono);font-size:13px;color:var(--text)">${r.score !== null ? r.score : '--'}</td>
        <td style="padding:12px 8px;text-align:center">${deltaHtml}</td>
        <td style="padding:12px 8px;text-align:center;font-size:12px;color:${scanAgeColor}">${scanAge}</td>
        <td style="padding:12px 8px">
          <div style="display:flex;align-items:center;gap:6px">
            <div style="flex:1;height:6px;background:var(--bg-edge);border-radius:3px;overflow:hidden;min-width:40px">
              <div style="width:${rmWidth}%;height:100%;background:var(--gold);border-radius:3px"></div>
            </div>
            <span style="font-family:var(--mono);font-size:10px;color:var(--text-faint);white-space:nowrap">${r.roadmapDone}/${r.roadmapTotal}</span>
          </div>
        </td>
        <td style="padding:12px 8px;text-align:center;font-family:var(--mono);font-size:12px;color:var(--text-faint)">
          ${r.roadmapStale > 0 ? `<span style="color:var(--yellow)">${r.roadmapStale}</span>` : '0'}
        </td>
        <td style="padding:12px 8px;text-align:center;font-family:var(--mono);font-size:12px;color:var(--text-faint)">${citText}</td>
        <td style="padding:12px 8px;text-align:center">
          ${r.unreadAlerts > 0 ? `<span style="font-family:var(--mono);font-size:11px;color:var(--gold);background:var(--gold-wash);padding:2px 8px;border-radius:10px">${r.unreadAlerts}</span>` : '<span style="color:var(--text-faint);font-size:11px">0</span>'}
        </td>
      </tr>`;
  }).join("");

  const critCount = rows.filter(r => r.healthStatus === "critical").length;
  const warnCount = rows.filter(r => r.healthStatus === "warning").length;
  const healthyCount = rows.filter(r => r.healthStatus === "healthy").length;

  return `
    <div style="margin-bottom:48px">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:16px">
        <div class="label">Client Health</div>
        <div style="display:flex;gap:16px;font-size:11px">
          <span style="color:var(--green)">${healthyCount} healthy</span>
          ${warnCount > 0 ? `<span style="color:var(--yellow)">${warnCount} warning</span>` : ''}
          ${critCount > 0 ? `<span style="color:var(--red)">${critCount} needs attention</span>` : ''}
        </div>
      </div>
      <div style="overflow-x:auto;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
        <table style="width:100%;border-collapse:collapse;min-width:700px">
          <thead>
            <tr style="border-bottom:1px solid var(--line)">
              <th style="text-align:left;padding:10px 16px;font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">Client</th>
              <th style="text-align:center;padding:10px 8px;font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">Grade</th>
              <th style="text-align:center;padding:10px 8px;font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">Score</th>
              <th style="text-align:center;padding:10px 8px;font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">Delta</th>
              <th style="text-align:center;padding:10px 8px;font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">Last Scan</th>
              <th style="padding:10px 8px;font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">Roadmap</th>
              <th style="text-align:center;padding:10px 8px;font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">Stale</th>
              <th style="text-align:center;padding:10px 8px;font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">Citations</th>
              <th style="text-align:center;padding:10px 8px;font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">Alerts</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>
  `;
}

export async function handleHome(user: User, env: Env): Promise<Response> {
  const clientSlug = user.role === "admin" ? null : user.client_slug;

  // Get domains (client sees own, admin sees all)
  let domains: Domain[];
  if (clientSlug) {
    domains = (await env.DB.prepare(
      "SELECT * FROM domains WHERE client_slug = ? AND active = 1 AND is_competitor = 0 ORDER BY domain"
    ).bind(clientSlug).all<Domain>()).results;
  } else {
    domains = (await env.DB.prepare(
      "SELECT * FROM domains WHERE active = 1 AND is_competitor = 0 ORDER BY client_slug, domain"
    ).all<Domain>()).results;
  }

  // Get GSC data per client_slug
  const gscMap = new Map<string, HomeGscData>();
  const gscSlugsChecked = new Set<string>();
  for (const d of domains) {
    if (gscSlugsChecked.has(d.client_slug)) continue;
    gscSlugsChecked.add(d.client_slug);
    const snaps = (await env.DB.prepare(
      "SELECT * FROM gsc_snapshots WHERE client_slug = ? ORDER BY date_end DESC LIMIT 2"
    ).bind(d.client_slug).all<GscSnapshot>()).results;
    if (snaps.length > 0) {
      gscMap.set(d.client_slug, {
        clicks: snaps[0].clicks,
        impressions: snaps[0].impressions,
        prevClicks: snaps[1] ? snaps[1].clicks : null,
      });
    }
  }

  // Get latest scan + previous scan for each domain
  const domainCards: string[] = [];
  for (const d of domains) {
    const recent = (await env.DB.prepare(
      "SELECT * FROM scan_results WHERE domain_id = ? ORDER BY scanned_at DESC LIMIT 2"
    ).bind(d.id).all<ScanResult>()).results;

    const scan = recent[0] || null;
    const prev = recent[1] || null;
    const score = scan ? scan.aeo_score : null;
    const grade = scan ? scan.grade : "?";
    const redFlagCount = scan ? JSON.parse(scan.red_flags).length : 0;
    const scanDate = scan ? new Date(scan.scanned_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "No scans yet";

    // Score delta vs previous scan
    let deltaHtml = "";
    if (scan && prev && !scan.error && !prev.error) {
      const diff = scan.aeo_score - prev.aeo_score;
      if (diff > 0) {
        deltaHtml = `<span style="color:var(--green);font-size:11px;font-weight:500">+${diff}</span>`;
      } else if (diff < 0) {
        deltaHtml = `<span style="color:var(--red);font-size:11px;font-weight:500">${diff}</span>`;
      } else {
        deltaHtml = `<span style="color:var(--text-faint);font-size:11px">--</span>`;
      }
    }

    domainCards.push(`
      <a href="/domain/${d.id}" class="card" style="display:block;text-decoration:none">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px">
          <div>
            <div class="label" style="margin-bottom:6px">${esc(d.client_slug)}</div>
            <h3 style="font-style:italic">${esc(d.domain)}</h3>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
            ${deltaHtml}
            <div class="grade grade-${grade}">${grade}</div>
          </div>
        </div>
        <div style="display:flex;gap:24px;font-size:12px;color:var(--text-faint);flex-wrap:wrap">
          ${score !== null ? `<span>Score: <strong style="color:var(--text);font-weight:400">${score}/100</strong></span>` : ''}
          <span>Red flags: <strong style="color:${redFlagCount > 4 ? 'var(--red)' : 'var(--text)'};font-weight:400">${redFlagCount}</strong></span>
          <span>Last scan: ${scanDate}</span>
          ${(() => {
            const gsc = gscMap.get(d.client_slug);
            if (!gsc) return "";
            let clicksDelta = "";
            if (gsc.prevClicks !== null) {
              const diff = gsc.clicks - gsc.prevClicks;
              if (diff > 0) clicksDelta = ' <span style="color:var(--green)">+' + diff + '</span>';
              else if (diff < 0) clicksDelta = ' <span style="color:var(--red)">' + diff + '</span>';
            }
            return '<span style="border-left:1px solid var(--line);padding-left:12px">Search: <strong style="color:var(--text);font-weight:400">' + gsc.clicks + ' clicks</strong>' + clicksDelta + ' / ' + gsc.impressions.toLocaleString() + ' imp</span>';
          })()}
        </div>
      </a>
    `);
  }

  // Check which client slugs have competitors (for showing comparison links)
  const slugsWithCompetitors = new Set<string>();
  const compCheck = clientSlug
    ? (await env.DB.prepare("SELECT DISTINCT client_slug FROM domains WHERE client_slug = ? AND is_competitor = 1 AND active = 1").bind(clientSlug).all<{ client_slug: string }>()).results
    : (await env.DB.prepare("SELECT DISTINCT client_slug FROM domains WHERE is_competitor = 1 AND active = 1").all<{ client_slug: string }>()).results;
  compCheck.forEach(r => slugsWithCompetitors.add(r.client_slug));

  // Group domain cards by client_slug for admin view
  const clientSlugs = [...new Set(domains.map(d => d.client_slug))];

  // Competitor comparison links per client
  const compLinks = clientSlugs
    .filter(slug => slugsWithCompetitors.has(slug))
    .map(slug => `<a href="/competitors/${encodeURIComponent(slug)}" class="btn btn-ghost" style="font-size:11px">Competitors: ${esc(slug)}</a>`)
    .join(" ");

  // Roadmap links per client
  const roadmapLinks = clientSlugs
    .map(slug => `<a href="/roadmap/${encodeURIComponent(slug)}" class="btn btn-ghost" style="font-size:11px">Roadmap: ${esc(slug)}</a>`)
    .join(" ");

  // Build home narrative
  const homeNarrative = buildHomeNarrative(user, domains.length, clientSlugs.length, gscMap);

  // "What changed" banner for clients returning after absence
  const changeBanner = await buildChangeBanner(user, env);

  const body = `
    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:40px">
      <div>
        <div class="label" style="margin-bottom:8px">Dashboard</div>
        <h1>Your <em>domains</em></h1>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
        ${roadmapLinks}
        ${compLinks}
        ${user.role === "admin" ? '<a href="/admin" class="btn btn-ghost">Admin</a>' : ''}
      </div>
    </div>

    ${changeBanner}
    ${user.role === "admin" ? await buildClientHealth(env) : await buildWeeklySummary(user, env)}

    ${domainCards.length > 0
      ? `<div class="narrative-context" style="margin-bottom:24px">${esc(homeNarrative)}</div>
         <div style="display:flex;flex-direction:column;gap:16px">${domainCards.join('')}</div>`
      : `<div class="empty">
          <h3>No domains yet</h3>
          <p>${user.role === 'admin' ? 'Add a client and their domains from the admin panel.' : 'Your account is being set up. Check back soon.'}</p>
        </div>`
    }
  `;

  return html(layout("Dashboard", body, user));
}
