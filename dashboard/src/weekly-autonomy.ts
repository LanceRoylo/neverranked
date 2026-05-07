/**
 * Weekly Autonomy Panel — Layer 3 of the "system always working" UX.
 *
 * Quantifies work the platform did over the last 7 days so the
 * customer (and Lance, in admin scope) can see at a glance how much
 * happened without anyone clicking anything. Same data sources as the
 * activity feed, but rolled up as counts rather than line items.
 *
 * Big-number-first layout: each metric is a single tile with the
 * count in serif type and a one-line label. Empty metrics drop out
 * silently rather than rendering "0" tiles that read as broken.
 */

import type { Env, User } from "./types";

export interface AutonomyStats {
  scansRun: number;
  itemsAutoResolved: number;
  citationsCaught: number;
  enginesCited: number;       // distinct engines that cited the client
  botCrawls: number;
  enginesCrawled: number;     // distinct engines that crawled
  scope: "client" | "admin";
  clientsActive?: number;     // admin scope only
}

export async function getAutonomyStats(user: User, env: Env): Promise<AutonomyStats> {
  // Effective scope (mirrors computePulse / activity feed).
  const isPreview = !!user._viewAsClient;
  const isAdminScope = user.role === "admin" && !isPreview && !user._contextSlug;
  const slug = isAdminScope ? null : (user._contextSlug || user.client_slug);
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;

  const stats: AutonomyStats = {
    scansRun: 0,
    itemsAutoResolved: 0,
    citationsCaught: 0,
    enginesCited: 0,
    botCrawls: 0,
    enginesCrawled: 0,
    scope: isAdminScope ? "admin" : "client",
  };

  // Scans
  try {
    const q = slug
      ? `SELECT COUNT(*) AS n FROM scan_results sr JOIN domains d ON sr.domain_id = d.id
         WHERE d.client_slug = ? AND d.is_competitor = 0 AND sr.scanned_at >= ? AND sr.error IS NULL`
      : `SELECT COUNT(*) AS n FROM scan_results sr JOIN domains d ON sr.domain_id = d.id
         WHERE d.is_competitor = 0 AND sr.scanned_at >= ? AND sr.error IS NULL`;
    const r = slug
      ? await env.DB.prepare(q).bind(slug, sevenDaysAgo).first<{ n: number }>()
      : await env.DB.prepare(q).bind(sevenDaysAgo).first<{ n: number }>();
    stats.scansRun = r?.n || 0;
  } catch { /* skip */ }

  // Auto-resolved roadmap items
  try {
    const q = slug
      ? `SELECT COUNT(*) AS n FROM roadmap_items
         WHERE client_slug = ? AND status = 'done' AND completed_at >= ? AND completed_by IN ('scan','snippet')`
      : `SELECT COUNT(*) AS n FROM roadmap_items
         WHERE status = 'done' AND completed_at >= ? AND completed_by IN ('scan','snippet')`;
    const r = slug
      ? await env.DB.prepare(q).bind(slug, sevenDaysAgo).first<{ n: number }>()
      : await env.DB.prepare(q).bind(sevenDaysAgo).first<{ n: number }>();
    stats.itemsAutoResolved = r?.n || 0;
  } catch { /* skip */ }

  // Citations (client_cited = 1) + distinct engines
  try {
    const q = slug
      ? `SELECT COUNT(*) AS n, COUNT(DISTINCT cr.engine) AS engines
         FROM citation_runs cr JOIN citation_keywords ck ON cr.keyword_id = ck.id
         WHERE ck.client_slug = ? AND cr.client_cited = 1 AND cr.run_at >= ?`
      : `SELECT COUNT(*) AS n, COUNT(DISTINCT cr.engine) AS engines
         FROM citation_runs cr JOIN citation_keywords ck ON cr.keyword_id = ck.id
         WHERE cr.client_cited = 1 AND cr.run_at >= ?`;
    const r = slug
      ? await env.DB.prepare(q).bind(slug, sevenDaysAgo).first<{ n: number; engines: number }>()
      : await env.DB.prepare(q).bind(sevenDaysAgo).first<{ n: number; engines: number }>();
    stats.citationsCaught = r?.n || 0;
    stats.enginesCited = r?.engines || 0;
  } catch { /* skip */ }

  // Bot crawls + distinct engines
  try {
    const q = slug
      ? `SELECT COUNT(*) AS n, COUNT(DISTINCT engine) AS engines FROM referrer_hits
         WHERE client_slug = ? AND hit_at >= ?`
      : `SELECT COUNT(*) AS n, COUNT(DISTINCT engine) AS engines FROM referrer_hits
         WHERE hit_at >= ?`;
    const r = slug
      ? await env.DB.prepare(q).bind(slug, sevenDaysAgo).first<{ n: number; engines: number }>()
      : await env.DB.prepare(q).bind(sevenDaysAgo).first<{ n: number; engines: number }>();
    stats.botCrawls = r?.n || 0;
    stats.enginesCrawled = r?.engines || 0;
  } catch { /* skip */ }

  if (isAdminScope) {
    try {
      const r = await env.DB.prepare(
        `SELECT COUNT(DISTINCT client_slug) AS n FROM domains WHERE active = 1 AND is_competitor = 0`
      ).first<{ n: number }>();
      stats.clientsActive = r?.n || 0;
    } catch { /* skip */ }
  }

  return stats;
}

export function renderAutonomyPanel(s: AutonomyStats): string {
  const tiles: { value: string; label: string }[] = [];
  if (s.scansRun > 0) tiles.push({ value: String(s.scansRun), label: `scan${s.scansRun === 1 ? "" : "s"} run` });
  if (s.itemsAutoResolved > 0) tiles.push({ value: String(s.itemsAutoResolved), label: `item${s.itemsAutoResolved === 1 ? "" : "s"} auto-resolved` });
  if (s.citationsCaught > 0) tiles.push({
    value: String(s.citationsCaught),
    label: `citation${s.citationsCaught === 1 ? "" : "s"} detected${s.enginesCited ? ` · ${s.enginesCited} engine${s.enginesCited === 1 ? "" : "s"}` : ""}`,
  });
  if (s.botCrawls > 0) tiles.push({
    value: String(s.botCrawls),
    label: `bot crawl${s.botCrawls === 1 ? "" : "s"}${s.enginesCrawled ? ` · ${s.enginesCrawled} engine${s.enginesCrawled === 1 ? "" : "s"}` : ""}`,
  });
  if (s.scope === "admin" && s.clientsActive) {
    tiles.push({ value: String(s.clientsActive), label: `client${s.clientsActive === 1 ? "" : "s"} monitored` });
  }

  // If everything is zero, show a clear "warming up" tile rather than
  // hide the panel entirely -- the customer should still see that the
  // system is on, even if data hasn't accumulated yet.
  if (tiles.length === 0) {
    tiles.push({ value: "—", label: "monitoring · first signals landing within 24h" });
  }

  const tileHtml = tiles.map(t => `
    <div style="flex:1 1 140px;min-width:140px;padding:14px 16px;background:var(--bg);border:1px solid var(--line);border-radius:3px">
      <div style="font-family:var(--serif);font-size:28px;font-style:italic;color:var(--gold);line-height:1;margin-bottom:6px">${t.value}</div>
      <div style="font-size:11px;color:var(--text-faint);line-height:1.4">${t.label}</div>
    </div>`).join("");

  const headline = s.scope === "admin"
    ? "This week, NeverRanked ran on autopilot across the platform."
    : "This week, NeverRanked ran on autopilot for your account.";

  return `
    <section style="margin-bottom:32px;padding:20px 24px;background:rgba(232,199,103,.04);border:1px solid var(--gold-dim);border-radius:4px">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px;gap:12px;flex-wrap:wrap">
        <div>
          <div class="label" style="margin-bottom:4px">7-day autonomy report</div>
          <div style="font-size:13px;color:var(--text);line-height:1.5">${headline}</div>
        </div>
        <div style="font-size:10px;color:var(--text-faint);font-family:var(--label);letter-spacing:.08em">no input required</div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">${tileHtml}</div>
    </section>`;
}
