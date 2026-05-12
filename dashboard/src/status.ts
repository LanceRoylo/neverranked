/**
 * Dashboard -- Status Card system
 *
 * Every time a user opens the dashboard they should instantly answer three
 * questions without clicking anything:
 *
 *   1. What did the system just do for me?        -> "Recent activity"
 *   2. What will it do next and when?             -> "Next scheduled"
 *   3. Do I need to do anything?                  -> "Your turn"
 *
 * This module builds that three-column card. It's the antidote to the
 * "is something happening? am I waiting? is it broken?" anxiety that every
 * opaque SaaS dashboard creates.
 *
 * Data comes from:
 *   - scan_results (latest scanned_at per client domain)
 *   - citation_snapshots (latest week_start per client)
 *   - gsc_snapshots (latest date_end per client)
 *   - roadmap_items (open items awaiting user action)
 *   - gsc_properties (whether GSC is connected)
 *   - admin_alerts (unread for admins)
 *   - domain_suggestions (pending competitor suggestions for admins)
 *   - agency_applications (pending apps for admins)
 *
 * The cron schedule is static and known in advance:
 *   - Daily tasks: 06:00 UTC every day
 *   - Weekly scans + digests: 06:00 UTC every Monday
 *   - Monthly recap: day 1-2 of month
 *   - Annual recap: Jan 1-3
 */

import type { Env, User } from "./types";
import { esc } from "./render";

export interface StatusEntry {
  label: string;
  detail?: string;
  timeHint?: string; // "2 hours ago", "in 3 days"
}

export interface StatusAction {
  label: string;
  detail: string;
  href: string;
  cta: string;
}

export interface StatusSnapshot {
  recent: StatusEntry[];
  next: StatusEntry[];
  actions: StatusAction[];
}

// ---------- time helpers ----------

function timeAgo(unixSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - unixSeconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + " min ago";
  if (diff < 86400) return Math.floor(diff / 3600) + " hr ago";
  const days = Math.floor(diff / 86400);
  if (days === 1) return "yesterday";
  if (days < 7) return days + " days ago";
  if (days < 30) return Math.floor(days / 7) + " wk ago";
  return Math.floor(days / 30) + " mo ago";
}

function nextWeeklyScan(): { date: Date; inDays: number; hint: string } {
  // Next Monday at 06:00 UTC. If we're past 06:00 UTC on Monday today, roll to
  // next Monday.
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(6, 0, 0, 0);
  const dayOfWeek = target.getUTCDay(); // 0=Sun, 1=Mon, ... 6=Sat
  let daysUntilMon = (8 - dayOfWeek) % 7; // 0 if today is Mon
  if (daysUntilMon === 0 && now.getTime() >= target.getTime()) {
    daysUntilMon = 7;
  }
  target.setUTCDate(target.getUTCDate() + daysUntilMon);
  const ms = target.getTime() - now.getTime();
  const inDays = Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  const weekday = target.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const dateLabel = target.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const hint = inDays === 0
    ? "today at 6am UTC"
    : inDays === 1
      ? "tomorrow at 6am UTC"
      : weekday + ", " + dateLabel + " at 6am UTC";
  return { date: target, inDays, hint };
}

// ---------- status computation ----------

/**
 * Compute the full status snapshot for a user. Clients see their own scope;
 * admins see global scope. Every entry must include enough context that a
 * human reading it alone knows what's happening -- no naked statuses.
 */
export async function computeStatus(user: User, env: Env): Promise<StatusSnapshot> {
  const recent: StatusEntry[] = [];
  const next: StatusEntry[] = [];
  const actions: StatusAction[] = [];

  const isClient = user.role === "client" && !!user.client_slug;
  const slug = user.client_slug;

  // ---------- RECENT ACTIVITY ----------

  if (isClient && slug) {
    // Most recent scan
    const scan = await env.DB.prepare(
      `SELECT sr.scanned_at, sr.aeo_score, d.domain
       FROM scan_results sr JOIN domains d ON sr.domain_id = d.id
       WHERE d.client_slug = ? AND d.is_competitor = 0
       ORDER BY sr.scanned_at DESC LIMIT 1`
    ).bind(slug).first<{ scanned_at: number; aeo_score: number; domain: string }>();

    if (scan) {
      recent.push({
        label: "Site scanned",
        detail: scan.domain + " scored " + scan.aeo_score + "/100",
        timeHint: timeAgo(scan.scanned_at),
      });
    }

    // Latest citation snapshot
    const cit = await env.DB.prepare(
      `SELECT week_start, client_citations, total_queries
       FROM citation_snapshots WHERE client_slug = ?
       ORDER BY week_start DESC LIMIT 1`
    ).bind(slug).first<{ week_start: number; client_citations: number; total_queries: number }>();

    if (cit) {
      recent.push({
        label: "Citation run completed",
        detail: "You were cited on " + cit.client_citations + " of " + cit.total_queries + " AI queries",
        timeHint: timeAgo(cit.week_start),
      });
    }

    // Latest GSC pull
    const gsc = await env.DB.prepare(
      `SELECT created_at, clicks, impressions FROM gsc_snapshots
       WHERE client_slug = ? ORDER BY created_at DESC LIMIT 1`
    ).bind(slug).first<{ created_at: number; clicks: number; impressions: number }>();

    if (gsc) {
      recent.push({
        label: "Search Console data pulled",
        detail: gsc.clicks.toLocaleString() + " clicks, " + gsc.impressions.toLocaleString() + " impressions this week",
        timeHint: timeAgo(gsc.created_at),
      });
    }
  } else {
    // Admin view: global recent activity
    const lastScan = await env.DB.prepare(
      "SELECT MAX(scanned_at) as ts FROM scan_results"
    ).first<{ ts: number | null }>();
    if (lastScan?.ts) {
      recent.push({
        label: "Last scan",
        detail: "Most recent scan across all domains",
        timeHint: timeAgo(lastScan.ts),
      });
    }

    const lastCit = await env.DB.prepare(
      "SELECT MAX(week_start) as ts FROM citation_snapshots"
    ).first<{ ts: number | null }>();
    if (lastCit?.ts) {
      recent.push({
        label: "Last citation run",
        detail: "Weekly run across ChatGPT, Perplexity, Claude, Gemini, Microsoft Copilot, Google AIO, Gemma",
        timeHint: timeAgo(lastCit.ts),
      });
    }

    const lastGsc = await env.DB.prepare(
      "SELECT MAX(created_at) as ts FROM gsc_snapshots"
    ).first<{ ts: number | null }>();
    if (lastGsc?.ts) {
      recent.push({
        label: "Last Search Console pull",
        detail: "Across all connected properties",
        timeHint: timeAgo(lastGsc.ts),
      });
    }
  }

  if (recent.length === 0) {
    recent.push({
      label: "Waiting for first run",
      detail: "The system has not logged any activity for your account yet. Your first scan fires automatically on the next scheduled run below.",
    });
  }

  // ---------- NEXT SCHEDULED ----------

  const weekly = nextWeeklyScan();
  next.push({
    label: "Weekly AEO update",
    detail: "Full site scan, citation run across five AI engines, Search Console pull, and a fresh brief.",
    timeHint: weekly.hint,
  });
  next.push({
    label: "Daily maintenance",
    detail: "Stale-roadmap checks, drip emails, snippet verification, and regression alerts.",
    timeHint: "every day at 6am UTC",
  });

  // ---------- YOUR TURN ----------

  if (isClient && slug) {
    // GSC not connected
    const gscProp = await env.DB.prepare(
      "SELECT 1 FROM gsc_properties WHERE client_slug = ? LIMIT 1"
    ).bind(slug).first();
    if (!gscProp) {
      actions.push({
        label: "Connect Google Search Console",
        detail: "Powers the search clicks, impressions, and top questions panels. Read-only access, disconnect anytime.",
        href: "/gsc",
        cta: "Connect",
      });
    }

    // Pending roadmap items that are specifically awaiting user proof
    const awaitingProof = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM roadmap_items
       WHERE client_slug = ? AND status = 'in_progress'`
    ).bind(slug).first<{ cnt: number }>();
    if (awaitingProof && awaitingProof.cnt > 0) {
      actions.push({
        label: awaitingProof.cnt + " roadmap " + (awaitingProof.cnt === 1 ? "item" : "items") + " in progress",
        detail: "These are items you started. Mark them done when you ship the change, or reopen if you paused.",
        href: "/roadmap/" + slug,
        cta: "Review",
      });
    }

    // No domains yet
    const hasDomain = await env.DB.prepare(
      "SELECT 1 FROM domains WHERE client_slug = ? AND active = 1 LIMIT 1"
    ).bind(slug).first();
    if (!hasDomain) {
      actions.push({
        label: "No domains yet",
        detail: "Your account manager will add your primary domain during onboarding. Email hello@neverranked.com if this hasn't happened.",
        href: "mailto:hello@neverranked.com",
        cta: "Email us",
      });
    }
  } else if (user.role === "admin") {
    // Unread alerts
    const alerts = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM admin_alerts WHERE read_at IS NULL"
    ).first<{ cnt: number }>();
    if (alerts && alerts.cnt > 0) {
      actions.push({
        label: alerts.cnt + " unread " + (alerts.cnt === 1 ? "alert" : "alerts"),
        detail: "Regression, stall, or snippet issues flagged by automations. Review before the week starts.",
        href: "/admin",
        cta: "Open cockpit",
      });
    }

    // Pending competitor suggestions
    const suggs = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM competitor_suggestions WHERE status = 'pending'"
    ).first<{ cnt: number }>().catch(() => null);
    if (suggs && suggs.cnt > 0) {
      actions.push({
        label: suggs.cnt + " competitor " + (suggs.cnt === 1 ? "suggestion" : "suggestions") + " awaiting review",
        detail: "Clients submitted these via the competitor form. Approve to add them to the client's tracking.",
        href: "/admin",
        cta: "Review",
      });
    }

    // Pending agency applications
    const apps = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM agency_applications WHERE status = 'pending'"
    ).first<{ cnt: number }>().catch(() => null);
    if (apps && apps.cnt > 0) {
      actions.push({
        label: apps.cnt + " agency " + (apps.cnt === 1 ? "application" : "applications") + " awaiting review",
        detail: "Agencies submitted these from the reseller form. Approve to grant reseller access.",
        href: "/admin",
        cta: "Review",
      });
    }
  }

  return { recent, next, actions };
}

// ---------- HTML rendering ----------

/**
 * Render the status snapshot as a three-column card. Designed to sit at the
 * very top of the dashboard home so every user sees the same clarity before
 * anything else on the page.
 */
export function renderStatusCard(snapshot: StatusSnapshot): string {
  const col = (title: string, subtitle: string, body: string, accent: string) => `
    <div style="flex:1;min-width:220px;padding:20px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;border-top:2px solid ${accent}">
      <div style="font-family:var(--label);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${accent};margin-bottom:4px">${title}</div>
      <div style="font-size:11px;color:var(--text-faint);margin-bottom:14px;line-height:1.5">${subtitle}</div>
      ${body}
    </div>
  `;

  const recentBody = snapshot.recent.map(entry => `
    <div style="padding:10px 0;border-top:1px solid rgba(251,248,239,.06);font-size:12px;line-height:1.5">
      <div style="color:var(--text);font-weight:500">${entry.label}${entry.timeHint ? ' <span style="color:var(--text-faint);font-weight:300">&middot; ' + entry.timeHint + '</span>' : ''}</div>
      ${entry.detail ? `<div style="color:var(--text-faint);font-size:11px;margin-top:3px;line-height:1.5">${entry.detail}</div>` : ''}
    </div>
  `).join("");

  const nextBody = snapshot.next.map(entry => `
    <div style="padding:10px 0;border-top:1px solid rgba(251,248,239,.06);font-size:12px;line-height:1.5">
      <div style="color:var(--text);font-weight:500">${entry.label}${entry.timeHint ? ' <span style="color:var(--gold);font-weight:300">&middot; ' + entry.timeHint + '</span>' : ''}</div>
      ${entry.detail ? `<div style="color:var(--text-faint);font-size:11px;margin-top:3px;line-height:1.5">${entry.detail}</div>` : ''}
    </div>
  `).join("");

  const actionsBody = snapshot.actions.length === 0
    ? `<div style="padding:14px 0 6px;font-size:12px;color:var(--text-faint);line-height:1.6">
         <div style="font-family:var(--serif);font-style:italic;color:var(--text);font-size:15px;margin-bottom:6px">You're clear.</div>
         Nothing is waiting on you right now. The system will do its next run at the scheduled time in the middle column.
       </div>`
    : snapshot.actions.map(a => `
        <div style="padding:12px 0;border-top:1px solid rgba(251,248,239,.06);font-size:12px;line-height:1.5">
          <div style="color:var(--text);font-weight:500;margin-bottom:3px">${a.label}</div>
          <div style="color:var(--text-faint);font-size:11px;margin-bottom:8px;line-height:1.5">${a.detail}</div>
          <a href="${a.href}" style="display:inline-block;padding:6px 12px;background:var(--gold);color:#080808;font-family:var(--label);text-transform:uppercase;letter-spacing:.12em;font-size:10px;font-weight:500;text-decoration:none;border-radius:2px">${a.cta} &rarr;</a>
        </div>
      `).join("");

  return `
    <div style="margin-bottom:28px">
      <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:14px;gap:16px;flex-wrap:wrap">
        <div>
          <div class="label" style="margin-bottom:4px">\u00a7 Status</div>
          <h3 style="font-style:italic;margin:0;font-size:20px">What's <em style="color:var(--gold)">happening</em></h3>
          <div style="font-size:12px;color:var(--text-faint);margin-top:6px;line-height:1.5;max-width:640px">
            The dashboard runs mostly on autopilot. This panel shows what just happened, what's next, and anything that's actually waiting on you. If the right column is empty, you don't need to do anything.
          </div>
        </div>
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        ${col(
          "Recent",
          "What the system did for you lately",
          recentBody,
          "var(--text-faint)"
        )}
        ${col(
          "Next scheduled",
          "Automations that run on a fixed clock",
          nextBody,
          "var(--gold-dim)"
        )}
        ${col(
          "Your turn",
          snapshot.actions.length === 0 ? "Nothing to do right now" : "Action required from you to move forward",
          actionsBody,
          snapshot.actions.length === 0 ? "var(--green,#6a9a6a)" : "var(--gold)"
        )}
      </div>
    </div>
  `;
}

export async function buildStatusCard(user: User, env: Env): Promise<string> {
  const snapshot = await computeStatus(user, env);
  return renderStatusCard(snapshot);
}

// ---------- per-domain status (for /domain detail page) ----------

/**
 * A compact, domain-scoped status strip for the top of /domain/:id. Unlike
 * the big three-column card on /home, this is a single-line summary so the
 * detail page stays focused on the scan report itself. It answers:
 *
 *   - How healthy is THIS domain?
 *   - When was it last scanned, when is the next scan?
 *   - Is anything specifically waiting on the user for this domain?
 *
 * Called with the domain row and the latest scan (both already loaded by
 * the caller, so no redundant DB reads).
 */
export interface DomainStatusInputs {
  domainName: string;
  scannedAt: number | null; // unix seconds, null if never scanned
  aeoScore: number | null;
  redFlagCount: number;
  scanError: string | null;
  snippetDetected?: boolean; // if the caller has this info
  domainId: number;
}

export function buildDomainStatusStrip(d: DomainStatusInputs, userRole: string): string {
  const now = Math.floor(Date.now() / 1000);
  const scanAgeDays = d.scannedAt ? Math.floor((now - d.scannedAt) / 86400) : null;
  const weekly = nextWeeklyScan();

  // Health classification mirrors the /home card logic so a user who sees
  // "Healthy" on the home card sees the same word here. Consistency of
  // language is the entire point of the clarity pass.
  let healthDot: string;
  let healthLabel: string;
  let healthReason: string;

  if (d.scanError) {
    healthDot = "var(--red,#c96a6a)";
    healthLabel = "Last scan failed";
    healthReason = `<span style="color:var(--red,#c96a6a)">Error:</span> ${esc(d.scanError)}. A fresh attempt will fire on the next weekly run. If this keeps happening, email <a href="mailto:hello@neverranked.com" style="color:var(--gold)">hello@neverranked.com</a>.`;
  } else if (d.scannedAt === null) {
    healthDot = "var(--gold)";
    healthLabel = "First scan pending";
    healthReason = "This domain has not been scanned yet. The first scan fires automatically on the next weekly run, or you can trigger a manual scan from the button above.";
  } else if (scanAgeDays !== null && scanAgeDays > 10) {
    healthDot = "var(--gold)";
    healthLabel = "Scan is stale";
    healthReason = "Last scan was " + scanAgeDays + " days ago. A fresh scan fires on the next Monday 6am UTC run. The Rescan button triggers one sooner.";
  } else if (d.redFlagCount > 4 || (d.aeoScore !== null && d.aeoScore < 50)) {
    healthDot = "var(--red,#c96a6a)";
    healthLabel = "Needs attention";
    healthReason = "Multiple red flags or a low AEO score. Scroll to the roadmap below to see the prioritized fixes the system has queued.";
  } else if (d.redFlagCount > 2 || (d.aeoScore !== null && d.aeoScore < 70)) {
    healthDot = "var(--gold)";
    healthLabel = "Watch";
    healthReason = "A few signals are weak. The next weekly scan will re-check and the roadmap will update accordingly.";
  } else {
    healthDot = "var(--green,#6a9a6a)";
    healthLabel = "Healthy";
    healthReason = "AEO score is solid, red flags are minimal, and the scan is fresh. The system keeps watch and re-scans this domain every Monday.";
  }

  const scanAgeLabel = scanAgeDays === null
    ? "Not yet scanned"
    : scanAgeDays === 0
      ? "Scanned today"
      : scanAgeDays === 1
        ? "Scanned yesterday"
        : "Scanned " + scanAgeDays + " days ago";

  return `
    <div style="margin-bottom:28px;padding:18px 20px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;border-left:3px solid ${healthDot}">
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:8px">
        <span style="width:10px;height:10px;border-radius:50%;background:${healthDot};flex-shrink:0"></span>
        <span style="font-family:var(--mono);font-size:13px;color:var(--text);font-weight:500">${healthLabel}</span>
        <span style="color:var(--line-strong)">&middot;</span>
        <span style="font-family:var(--mono);font-size:12px;color:var(--text-faint)">${scanAgeLabel}</span>
        <span style="color:var(--line-strong)">&middot;</span>
        <span style="font-family:var(--mono);font-size:12px;color:var(--text-faint)">Next scan: <span style="color:var(--gold)">${weekly.hint}</span></span>
      </div>
      <div style="font-size:12px;color:var(--text-soft);line-height:1.65;max-width:820px">${healthReason}</div>
    </div>
  `;
}
