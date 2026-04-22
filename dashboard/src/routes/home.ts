/**
 * Dashboard — Home route (domain overview)
 */

import type { Env, User, Domain, ScanResult, GscSnapshot, CitationSnapshot } from "../types";
import { layout, html, esc, safeParse } from "../render";
import { getGoogleAuthUrl } from "../gsc";
import { buildStatusCard } from "../status";
import { buildGlossary } from "../glossary";

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
    viewsThisWeek: number;
    lastActivity: number | null;
    healthStatus: "healthy" | "warning" | "critical";
  }

  const rows: ClientRow[] = [];
  const fourteenDaysAgo = now - 14 * 86400;
  const sevenDaysAgo = now - 7 * 86400;

  // Batch queries: fetch all data upfront instead of N+1 per client
  const domainIds = allDomains.map(d => d.id);

  // 1. All recent scans (ranked by domain, limited by window function emulation)
  const allScans = (await env.DB.prepare(
    `SELECT sr.domain_id, sr.aeo_score, sr.grade, sr.scanned_at
     FROM scan_results sr
     JOIN domains d ON sr.domain_id = d.id
     WHERE d.active = 1 AND d.is_competitor = 0 AND sr.error IS NULL
     ORDER BY sr.domain_id, sr.scanned_at DESC`
  ).all<{ domain_id: number; aeo_score: number; grade: string; scanned_at: number }>()).results;

  // Group scans by domain_id (take first 2 per domain)
  const scansByDomain = new Map<number, { aeo_score: number; grade: string; scanned_at: number }[]>();
  for (const s of allScans) {
    const arr = scansByDomain.get(s.domain_id) || [];
    if (arr.length < 2) arr.push(s);
    scansByDomain.set(s.domain_id, arr);
  }

  // 2. All roadmap items
  const allRoadmapItems = (await env.DB.prepare(
    "SELECT client_slug, status, updated_at FROM roadmap_items"
  ).all<{ client_slug: string; status: string; updated_at: number }>()).results;

  const roadmapBySlug = new Map<string, typeof allRoadmapItems>();
  for (const item of allRoadmapItems) {
    const arr = roadmapBySlug.get(item.client_slug) || [];
    arr.push(item);
    roadmapBySlug.set(item.client_slug, arr);
  }

  // 3. Latest citation snapshot per client (one query)
  const allCitSnaps = (await env.DB.prepare(
    `SELECT cs.client_slug, cs.citation_share FROM citation_snapshots cs
     INNER JOIN (SELECT client_slug, MAX(week_start) as max_ws FROM citation_snapshots GROUP BY client_slug) mx
     ON cs.client_slug = mx.client_slug AND cs.week_start = mx.max_ws`
  ).all<{ client_slug: string; citation_share: number }>()).results;
  const citBySlug = new Map(allCitSnaps.map(c => [c.client_slug, c.citation_share]));

  // 4. Unread alert counts per client (one query)
  const allAlertCounts = (await env.DB.prepare(
    "SELECT client_slug, COUNT(*) as cnt FROM admin_alerts WHERE read_at IS NULL GROUP BY client_slug"
  ).all<{ client_slug: string; cnt: number }>()).results;
  const alertsBySlug = new Map(allAlertCounts.map(a => [a.client_slug, a.cnt]));

  // 5. Page views this week + last activity (two queries)
  const allViewCounts = (await env.DB.prepare(
    "SELECT client_slug, COUNT(*) as cnt FROM page_views WHERE created_at >= ? GROUP BY client_slug"
  ).bind(sevenDaysAgo).all<{ client_slug: string; cnt: number }>()).results;
  const viewsBySlug = new Map(allViewCounts.map(v => [v.client_slug, v.cnt]));

  const allLastViews = (await env.DB.prepare(
    "SELECT client_slug, MAX(created_at) as last_at FROM page_views GROUP BY client_slug"
  ).all<{ client_slug: string; last_at: number | null }>()).results;
  const lastViewBySlug = new Map(allLastViews.map(v => [v.client_slug, v.last_at]));

  // Build rows from pre-fetched data (no queries in loop)
  for (const slug of slugs) {
    const clientDomains = allDomains.filter(d => d.client_slug === slug);
    const primaryDomain = clientDomains[0];
    const scans = scansByDomain.get(primaryDomain.id) || [];

    const latest = scans[0] || null;
    const prev = scans[1] || null;
    const score = latest ? latest.aeo_score : null;
    const grade = latest ? latest.grade : "?";
    const scoreDelta = latest && prev ? latest.aeo_score - prev.aeo_score : 0;
    const daysSinceScan = latest ? Math.floor((now - latest.scanned_at) / 86400) : 999;

    const rmItems = roadmapBySlug.get(slug) || [];
    const roadmapTotal = rmItems.length;
    const roadmapDone = rmItems.filter(i => i.status === "done").length;
    const roadmapStale = rmItems.filter(i => i.status === "in_progress" && i.updated_at < fourteenDaysAgo).length;

    const citationShare = citBySlug.get(slug) ?? null;
    const unreadAlerts = alertsBySlug.get(slug) || 0;
    const viewsThisWeek = viewsBySlug.get(slug) || 0;
    const lastActivity = lastViewBySlug.get(slug) || null;

    let healthStatus: ClientRow["healthStatus"] = "healthy";
    if (daysSinceScan > 14 || (score !== null && score < 40) || roadmapStale > 3 || scoreDelta < -10) {
      healthStatus = "critical";
    } else if (daysSinceScan > 9 || roadmapStale > 0 || scoreDelta < -3 || unreadAlerts > 3) {
      healthStatus = "warning";
    }

    rows.push({ slug, score, grade, scoreDelta, daysSinceScan, roadmapTotal, roadmapDone, roadmapStale, citationShare, unreadAlerts, viewsThisWeek, lastActivity, healthStatus });
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
        <td style="padding:12px 8px;text-align:center;font-family:var(--mono);font-size:12px;color:${r.viewsThisWeek > 0 ? 'var(--text)' : 'var(--red)'}">${r.viewsThisWeek}</td>
        <td style="padding:12px 8px;text-align:center;font-size:11px;color:var(--text-faint)">${r.lastActivity ? (() => { const d = Math.floor((now - r.lastActivity) / 86400); return d === 0 ? 'today' : d === 1 ? '1d ago' : d + 'd ago'; })() : 'never'}</td>
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
        <table style="width:100%;border-collapse:collapse;min-width:850px">
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
              <th style="text-align:center;padding:10px 8px;font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">Views/wk</th>
              <th style="text-align:center;padding:10px 8px;font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">Last Seen</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>
  `;
}

/**
 * ROI Counter card — sits at the top of the client dashboard home. The job
 * of this card is to answer "is this paying off?" every time a client logs
 * in. We only show numbers we can honestly back up:
 *
 *   - Days since signup: earliest users.created_at for this slug.
 *   - AI citations earned since signup: SUM(client_cited) from citation_runs
 *     across all keywords belonging to this client, scoped to runs after
 *     the signup date.
 *   - Search clicks in the last reporting window (and delta vs the first
 *     reporting window we have on file, so a client who grew from 400 to
 *     2,400 clicks sees "+2,000 since signup").
 *   - Estimated revenue: only rendered when client_settings.avg_deal_value
 *     is set. We multiply (citations + search-click lift) by deal value and
 *     a conservative conversion assumption (1% of new traffic becomes a
 *     deal). The conversion rate is conservative on purpose — we would
 *     rather under-promise and let the client tell us it's higher than
 *     over-claim and lose trust.
 *
 * If avg_deal_value is null, we show a prompt pointing admins to set it,
 * instead of fabricating a number. Same principle as the HTTP-526 fix: we
 * tell the truth about what we know and we name what we don't.
 */
async function buildRoiCard(user: User, env: Env): Promise<string> {
  if (!user.client_slug) return "";
  const slug = user.client_slug;

  // Signup date: earliest user.created_at for this slug. Fallback: earliest
  // domain row. If neither, skip the card entirely.
  const signupRow = await env.DB.prepare(
    "SELECT MIN(created_at) as signup_at FROM users WHERE client_slug = ?"
  ).bind(slug).first<{ signup_at: number | null }>();
  let signupAt = signupRow?.signup_at || null;
  if (!signupAt) {
    const domainRow = await env.DB.prepare(
      "SELECT MIN(created_at) as signup_at FROM domains WHERE client_slug = ?"
    ).bind(slug).first<{ signup_at: number | null }>();
    signupAt = domainRow?.signup_at || null;
  }
  if (!signupAt) return "";

  const now = Math.floor(Date.now() / 1000);
  const daysSince = Math.max(0, Math.floor((now - signupAt) / 86400));

  // Citations earned since signup. Returns 0 if there are no keywords or
  // runs yet, which is a valid "brand-new client" state.
  const citationRow = await env.DB.prepare(
    `SELECT COALESCE(SUM(client_cited), 0) as total FROM citation_runs
     WHERE keyword_id IN (SELECT id FROM citation_keywords WHERE client_slug = ?)
       AND run_at >= ?`
  ).bind(slug, signupAt).first<{ total: number }>();
  const citationsEarned = citationRow?.total || 0;

  // Search clicks: latest weekly snapshot vs the earliest snapshot we have
  // on file after signup. If we only have one snapshot, show current only.
  const latestGsc = await env.DB.prepare(
    "SELECT clicks, impressions FROM gsc_snapshots WHERE client_slug = ? ORDER BY date_end DESC LIMIT 1"
  ).bind(slug).first<{ clicks: number; impressions: number }>();
  const earliestGsc = await env.DB.prepare(
    "SELECT clicks FROM gsc_snapshots WHERE client_slug = ? AND created_at >= ? ORDER BY date_end ASC LIMIT 1"
  ).bind(slug, signupAt).first<{ clicks: number }>();
  const currentClicks = latestGsc?.clicks || 0;
  const earliestClicks = earliestGsc?.clicks || 0;
  const clicksDelta = currentClicks - earliestClicks;

  // Optional $ estimate. We use a conservative 1% conversion on the
  // combined lift (citations + click growth) as an *illustrative* number,
  // not a guaranteed one. The hover label spells that out.
  const settings = await env.DB.prepare(
    "SELECT avg_deal_value FROM client_settings WHERE client_slug = ?"
  ).bind(slug).first<{ avg_deal_value: number | null }>();
  const dealValueCents = settings?.avg_deal_value ?? null;

  let estimatedValueHtml = "";
  if (dealValueCents && dealValueCents > 0) {
    const conversionRate = 0.01;
    const lift = Math.max(0, citationsEarned) + Math.max(0, clicksDelta);
    const estDollars = Math.round((lift * conversionRate * dealValueCents) / 100);
    const estDisplay = estDollars >= 1000
      ? "$" + (estDollars / 1000).toFixed(1) + "k"
      : "$" + estDollars.toLocaleString();
    estimatedValueHtml = `
      <div style="flex:1;min-width:140px">
        <div style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);margin-bottom:6px" title="Illustrative: (new citations + new clicks) x 1% conservative conversion x your average deal value.">Est. value earned</div>
        <div style="font-family:var(--serif);font-style:italic;font-size:32px;color:var(--gold);line-height:1">${estDisplay}</div>
        <div style="font-size:10px;color:var(--text-faint);margin-top:6px">at $${(dealValueCents/100).toLocaleString()} avg deal &middot; 1% conv. est.</div>
      </div>
    `;
  } else {
    // Don't fabricate a number. Tell the truth: we need their deal value
    // to compute this honestly, and surface the path to set it.
    estimatedValueHtml = `
      <div style="flex:1;min-width:160px;border-left:1px solid var(--line);padding-left:20px">
        <div style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);margin-bottom:6px">Est. value earned</div>
        <div style="font-size:12px;color:var(--text-soft);line-height:1.5">
          ${user.role === "admin"
            ? '<a href="/admin/manage#client-settings" style="color:var(--gold);text-decoration:none;border-bottom:1px solid var(--gold-dim)">Set avg deal value &rarr;</a> to show revenue estimate.'
            : 'Your account manager can set an average deal value to show an estimated revenue figure here.'}
        </div>
      </div>
    `;
  }

  const clicksDeltaHtml = (() => {
    if (clicksDelta === 0 || !earliestGsc) return "";
    const color = clicksDelta > 0 ? "var(--green)" : "var(--red)";
    const sign = clicksDelta > 0 ? "+" : "";
    return `<span style="color:${color};font-size:11px;margin-left:6px">${sign}${clicksDelta.toLocaleString()}</span>`;
  })();

  return `
    <div class="card" style="margin-bottom:24px;background:linear-gradient(135deg,var(--bg-lift) 0%,var(--bg-edge) 100%);border-color:var(--gold-dim)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;gap:16px;flex-wrap:wrap">
        <div>
          <div class="label" style="margin-bottom:4px;color:var(--gold)">§ Progress to date</div>
          <h3 style="margin:0;font-style:italic">Since you <em style="color:var(--gold)">started</em></h3>
        </div>
        <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint);white-space:nowrap">
          ${daysSince} day${daysSince === 1 ? '' : 's'} tracked
        </div>
      </div>
      <div style="display:flex;gap:32px;flex-wrap:wrap;align-items:flex-end">
        <div style="flex:1;min-width:140px">
          <div style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);margin-bottom:6px">AI citations earned</div>
          <div style="font-family:var(--serif);font-style:italic;font-size:32px;color:var(--text);line-height:1">${citationsEarned.toLocaleString()}</div>
          <div style="font-size:10px;color:var(--text-faint);margin-top:6px">across ChatGPT, Perplexity, Gemini, Claude</div>
        </div>
        <div style="flex:1;min-width:140px;border-left:1px solid var(--line);padding-left:20px">
          <div style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);margin-bottom:6px">Search clicks / wk</div>
          <div style="font-family:var(--serif);font-style:italic;font-size:32px;color:var(--text);line-height:1">${currentClicks.toLocaleString()}${clicksDeltaHtml}</div>
          <div style="font-size:10px;color:var(--text-faint);margin-top:6px">${earliestGsc ? 'vs. ' + earliestClicks.toLocaleString() + ' when you started' : 'latest GSC reporting window'}</div>
        </div>
        ${estimatedValueHtml}
      </div>
    </div>
  `;
}

/**
 * Detects whether a search query is phrased as a question. Matches queries
 * starting with common interrogative words or containing "?". Deliberately
 * generous on the prefix list so we catch natural variations ("should i...",
 * "do i need...", "how much for...").
 */
function isQuestionQuery(query: string): boolean {
  if (!query) return false;
  const q = query.toLowerCase().trim();
  if (q.indexOf("?") !== -1) return true;
  const starters = /^(how|what|why|when|where|who|whose|which|can|could|does|do|did|is|are|was|were|will|would|should|has|have|had|am)\s+/;
  return starters.test(q);
}

interface GscQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/**
 * "Top Questions" panel — surfaces question-format queries from the latest
 * Google Search Console snapshot. These are real queries from real users
 * that impressed the client's site. No simulation, no guessing.
 *
 * Empty states:
 *  - GSC not connected: caller decides whether to render this panel at all
 *  - GSC connected but no question queries in latest snapshot: show friendly
 *    empty copy rather than hiding the panel (the absence is itself a signal
 *    worth surfacing — their audience isn't asking questions that reach them)
 */
async function buildTopQuestionsPanel(user: User, env: Env): Promise<string> {
  if (!user.client_slug) return "";

  const snap = await env.DB.prepare(
    "SELECT top_queries, date_start, date_end FROM gsc_snapshots WHERE client_slug = ? ORDER BY date_end DESC LIMIT 1"
  ).bind(user.client_slug).first<{ top_queries: string; date_start: string; date_end: string }>();

  if (!snap || !snap.top_queries) return "";

  const allQueries = safeParse<GscQueryRow[]>(snap.top_queries, []);
  if (allQueries.length === 0) return "";

  const questions = allQueries
    .filter(q => isQuestionQuery(q.query))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, 8);

  const rangeLabel = (() => {
    try {
      const start = new Date(snap.date_start).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const end = new Date(snap.date_end).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return `${start} – ${end}`;
    } catch {
      return "latest reporting period";
    }
  })();

  let bodyHtml: string;
  if (questions.length === 0) {
    bodyHtml = `
      <div style="padding:20px 0;font-size:13px;color:var(--text-faint);line-height:1.6">
        No question-format queries reached your site in this reporting window.
        That isn't always bad — it can mean people already know your brand and
        search by name. But it's worth watching: AI engines favor sites that
        answer questions, so if nobody asks anything on the way to you, you're
        not positioned to be cited.
      </div>
    `;
  } else {
    const rows = questions.map(q => {
      const ctrPct = (q.ctr * 100).toFixed(1);
      const pos = q.position ? q.position.toFixed(1) : "—";
      return `
        <div style="padding:12px 0;border-top:1px solid rgba(251,248,239,.06);display:grid;grid-template-columns:1fr auto auto auto;gap:20px;align-items:baseline">
          <div style="font-size:13px;color:var(--text);line-height:1.5">${esc(q.query)}</div>
          <div style="font-family:var(--mono);font-size:12px;color:var(--text-soft);text-align:right;min-width:60px">${q.clicks.toLocaleString()} <span style="color:var(--text-faint);font-size:10px">clicks</span></div>
          <div style="font-family:var(--mono);font-size:12px;color:var(--text-faint);text-align:right;min-width:70px">${q.impressions.toLocaleString()} <span style="font-size:10px">imp</span></div>
          <div style="font-family:var(--mono);font-size:12px;color:var(--gold);text-align:right;min-width:50px">pos ${pos}</div>
        </div>
      `;
    }).join("");
    bodyHtml = `<div style="margin-top:4px">${rows}</div>`;
  }

  return `
    <div class="card" style="margin-bottom:24px">
      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:16px;flex-wrap:wrap">
        <div>
          <div class="label" style="margin-bottom:6px">§ Top Questions</div>
          <h3 style="font-style:italic;margin:0">What people <em style="color:var(--gold);font-style:italic">ask</em> on the way to your site</h3>
          <div style="font-size:12px;color:var(--text-faint);margin-top:6px;line-height:1.5">
            Real question-format queries from Google Search Console. These are the conversations you're already in — and a starting point for the answers AI engines will cite.
          </div>
        </div>
        <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint);white-space:nowrap">${esc(rangeLabel)}</div>
      </div>
      ${bodyHtml}
    </div>
  `;
}

function buildGscNudge(user: User, env: Env): string {
  const authUrl = getGoogleAuthUrl(env, "https://app.neverranked.com");
  const state = `client:${user.client_slug}`;
  return `
    <div style="margin-bottom:24px;padding:18px 20px;background:var(--bg-lift);border:1px solid var(--line-strong);border-radius:4px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
      <div>
        <div style="font-size:14px;color:var(--text);margin-bottom:4px">See what people search to find you</div>
        <div style="font-size:12px;color:var(--text-faint);line-height:1.5">Connect Google Search Console for clicks, top queries, and traffic trends alongside your AEO data. Read-only access, disconnect anytime.</div>
      </div>
      <a href="${esc(authUrl)}&state=${esc(state)}" class="btn" style="white-space:nowrap;flex-shrink:0">Connect Search Console</a>
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
    const redFlagCount = scan ? safeParse<string[]>(scan.red_flags, []).length : 0;
    const scanDate = scan ? new Date(scan.scanned_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "No scans yet";
    const nowSec = Math.floor(Date.now() / 1000);
    const scanAgeDays = scan ? Math.floor((nowSec - scan.scanned_at) / 86400) : null;

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

    // Domain health classification. Logic:
    //   - no scan yet -> "First scan pending"
    //   - scan within 10 days AND red flags <= 2 AND (score >= 70 OR score null) -> Healthy
    //   - scan stale (>10 days) -> Stale (will self-heal on next Monday)
    //   - red flags > 4 OR score < 50 -> Needs attention
    //   - otherwise -> Watch
    //
    // Status is used both for the colored dot and the short reason line so
    // the agency owner can skim a list of 10 domains and instantly see which
    // ones are on fire vs which are fine.
    let healthDot = "var(--text-faint)";
    let healthLabel = "";
    let healthReason = "";
    if (!scan) {
      healthDot = "var(--gold)";
      healthLabel = "First scan pending";
      healthReason = "Your first scan will run automatically on the next weekly update (see Status at the top of the page).";
    } else if (scanAgeDays !== null && scanAgeDays > 10) {
      healthDot = "var(--gold)";
      healthLabel = "Scan is stale";
      healthReason = "Last scan was " + scanAgeDays + " days ago. A fresh scan fires on the next Monday 6am UTC run. You can also trigger a manual re-scan from the domain page.";
    } else if (redFlagCount > 4 || (score !== null && score < 50)) {
      healthDot = "var(--red,#c96a6a)";
      healthLabel = "Needs attention";
      healthReason = "Multiple red flags or a low AEO score. Open the domain to see the fixes the system has queued on the roadmap.";
    } else if (redFlagCount > 2 || (score !== null && score < 70)) {
      healthDot = "var(--gold)";
      healthLabel = "Watch";
      healthReason = "A few signals are weak. The next weekly scan will re-check and the roadmap will update accordingly.";
    } else {
      healthDot = "var(--green,#6a9a6a)";
      healthLabel = "Healthy";
      healthReason = "AEO score is solid, red flags are minimal, and the scan is fresh. The system keeps watch and re-scans weekly.";
    }

    const scanAgeLabel = scanAgeDays === null
      ? "No scan yet"
      : scanAgeDays === 0
        ? "Scanned today"
        : scanAgeDays === 1
          ? "Scanned yesterday"
          : "Scanned " + scanAgeDays + " days ago";

    domainCards.push(`
      <a href="/domain/${d.id}" class="card" style="display:block;text-decoration:none">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px">
          <div>
            <div class="label" style="margin-bottom:6px">${esc(d.client_slug)}</div>
            <h3 style="font-style:italic">${esc(d.domain)}</h3>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
            ${deltaHtml}
            <div class="grade grade-${grade}">${grade}</div>
          </div>
        </div>

        <!-- Domain health strip: single-line status so a reader skimming
             a list of 10 client domains can triage at a glance. The reason
             text below explains the dot in plain English. -->
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg-edge);border-radius:3px;margin-bottom:12px">
          <span style="width:8px;height:8px;border-radius:50%;background:${healthDot};flex-shrink:0"></span>
          <span style="font-family:var(--mono);font-size:12px;color:var(--text);font-weight:500">${healthLabel}</span>
          <span style="color:var(--line-strong)">&middot;</span>
          <span style="font-family:var(--mono);font-size:12px;color:var(--text-faint)">${scanAgeLabel}</span>
        </div>
        <div style="font-size:11px;color:var(--text-faint);line-height:1.55;margin-bottom:14px;max-width:680px">${healthReason}</div>

        <div style="display:flex;gap:24px;font-size:12px;color:var(--text-faint);flex-wrap:wrap">
          ${score !== null ? `<span title="AEO Readiness score. Higher is better. 90+ is an A grade, 75-89 is B, 60-74 is C.">Score: <strong style="color:var(--text);font-weight:400">${score}/100</strong></span>` : ''}
          <span title="Signals the scanner flagged as structural issues (missing schema, bad canonical, etc). Fewer is better.">Red flags: <strong style="color:${redFlagCount > 4 ? 'var(--red)' : 'var(--text)'};font-weight:400">${redFlagCount}</strong></span>
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
            return '<span style="border-left:1px solid var(--line);padding-left:12px" title="Clicks and impressions from Google Search in the last reporting week.">Search: <strong style="color:var(--text);font-weight:400">' + gsc.clicks + ' clicks</strong>' + clicksDelta + ' / ' + gsc.impressions.toLocaleString() + ' imp</span>';
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

    ${await buildStatusCard(user, env)}
    ${user.role === "client" && user.client_slug ? await buildRoiCard(user, env) : ""}
    ${changeBanner}
    ${user.role === "client" && user.client_slug && !gscMap.has(user.client_slug) ? buildGscNudge(user, env) : ""}
    ${user.role === "admin" ? await buildClientHealth(env) : await buildWeeklySummary(user, env)}
    ${user.role === "client" && user.client_slug && gscMap.has(user.client_slug) ? await buildTopQuestionsPanel(user, env) : ""}

    ${domainCards.length > 0
      ? `<div class="narrative-context" style="margin-bottom:24px">${esc(homeNarrative)}</div>
         <div style="display:flex;flex-direction:column;gap:16px">${domainCards.join('')}</div>`
      : `<div class="empty" style="padding:40px 28px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
          <h3 style="margin-bottom:10px;font-style:italic">No domains yet</h3>
          <p style="color:var(--text-faint);font-size:13px;line-height:1.65;max-width:600px;margin:0">${user.role === 'admin'
            ? 'Add a client and their domains from the admin panel. Each domain gets scanned weekly, citation-tracked across four AI engines, and given a live roadmap.'
            : 'Your account manager is setting up your domain tracking. The first scan fires on the next Monday at 6am UTC once your domain is added. If this has not happened within 24 hours, email <a href="mailto:hello@neverranked.com" style="color:var(--gold)">hello@neverranked.com</a>.'}</p>
        </div>`
    }

    ${buildGlossary()}
  `;

  return html(layout("Dashboard", body, user));
}
