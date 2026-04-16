/**
 * Dashboard -- Admin cockpit (morning view)
 *
 * Single page showing revenue, leads, client health, action queue.
 * GET /admin
 */

import type { Env, User, Domain, ScanResult } from "../types";
import { layout, html, esc } from "../render";
import { getAnalyticsSummary } from "../analytics";

interface ClientHealth {
  slug: string;
  domain: string;
  domainId: number;
  latestScore: number;
  latestGrade: string;
  previousScore: number | null;
  plan: string | null;
  email: string;
  lastLogin: number | null;
  onboarded: number;
}

interface RecentPurchase {
  email: string;
  plan: string;
  created_at: number;
}

export async function handleCockpit(user: User, env: Env): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const sevenDaysAgo = now - 7 * 86400;
  const thirtyDaysAgo = now - 30 * 86400;

  // --- Parallel data fetches ---

  const [
    allUsers,
    allDomains,
    recentPurchases,
    pendingSuggestions,
    unreadAlerts,
    pulse,
  ] = await Promise.all([
    env.DB.prepare(
      "SELECT id, email, name, role, client_slug, plan, onboarded, stripe_subscription_id, onboarding_drip_start, onboarding_drip_day3, onboarding_drip_day7, last_login_at, created_at FROM users ORDER BY created_at DESC"
    ).all<User>(),
    env.DB.prepare(
      "SELECT * FROM domains WHERE active = 1 AND is_competitor = 0 ORDER BY client_slug"
    ).all<Domain>(),
    env.DB.prepare(
      "SELECT email, plan, created_at FROM users WHERE plan IS NOT NULL AND plan != 'none' AND plan != 'churned' AND created_at > ? ORDER BY created_at DESC"
    ).bind(thirtyDaysAgo).all<RecentPurchase>(),
    env.DB.prepare(
      "SELECT COUNT(*) as count FROM competitor_suggestions WHERE status = 'pending'"
    ).first<{ count: number }>(),
    env.DB.prepare(
      "SELECT * FROM admin_alerts WHERE read_at IS NULL ORDER BY created_at DESC LIMIT 50"
    ).all<{ id: number; client_slug: string; type: string; title: string; detail: string | null; roadmap_item_id: number | null; created_at: number }>(),
    getAnalyticsSummary(env),
  ]);

  const users = allUsers.results;
  const domains = allDomains.results;

  // --- Revenue pulse ---

  const activeSubscriptions = users.filter(u =>
    u.stripe_subscription_id && u.plan && u.plan !== "churned" && u.plan !== "none"
  );

  const signalCount = activeSubscriptions.filter(u => u.plan === "signal").length;
  const amplifyCount = activeSubscriptions.filter(u => u.plan === "amplify").length;
  const mrr = signalCount * 2000 + amplifyCount * 4500;

  const recentPurchaseList = recentPurchases.results;
  const purchases7d = recentPurchaseList.filter(p => p.created_at > sevenDaysAgo);

  // --- Client health ---

  const clientHealthData: ClientHealth[] = [];
  for (const d of domains) {
    const scans = (await env.DB.prepare(
      "SELECT aeo_score, grade, scanned_at FROM scan_results WHERE domain_id = ? AND error IS NULL ORDER BY scanned_at DESC LIMIT 2"
    ).bind(d.id).all<{ aeo_score: number; grade: string; scanned_at: number }>()).results;

    const clientUser = users.find(u => u.client_slug === d.client_slug && u.role === "client");

    if (scans.length > 0) {
      clientHealthData.push({
        slug: d.client_slug,
        domain: d.domain,
        domainId: d.id,
        latestScore: scans[0].aeo_score,
        latestGrade: scans[0].grade,
        previousScore: scans.length > 1 ? scans[1].aeo_score : null,
        plan: clientUser?.plan || null,
        email: clientUser?.email || "-",
        lastLogin: clientUser?.last_login_at || null,
        onboarded: clientUser?.onboarded || 0,
      });
    }
  }

  // --- Action queue ---

  const pendingAudits = users.filter(u => u.plan === "audit" && !u.onboarded);
  const regressions = clientHealthData.filter(c =>
    c.previousScore !== null && c.latestScore < c.previousScore - 5
  );
  const neverLoggedIn = users.filter(u =>
    u.role === "client" && u.plan && u.plan !== "none" && u.plan !== "churned" && !u.last_login_at
  );
  const dripInProgress = users.filter(u =>
    u.onboarding_drip_start && (!u.onboarding_drip_day3 || !u.onboarding_drip_day7)
  );

  // --- Leads from KV ---

  let totalLeads = 0;
  let leads7d = 0;
  let leads30d = 0;
  let freeScansTotal = 0;
  let freeCaptures = 0;
  try {
    const listed = await env.LEADS.list({ prefix: "lead:" });
    totalLeads = listed.keys.length;
    for (const key of listed.keys) {
      const raw = await env.LEADS.get(key.name);
      if (raw) {
        const data = JSON.parse(raw);
        const ts = data.first_seen || 0;
        if (ts > sevenDaysAgo) leads7d++;
        if (ts > thirtyDaysAgo) leads30d++;
      }
    }
    // Count free scan and capture events from KV
    const scanEvents = await env.LEADS.list({ prefix: "event:scan:" });
    freeScansTotal = scanEvents.keys.length;
    const captureEvents = await env.LEADS.list({ prefix: "event:capture:" });
    freeCaptures = captureEvents.keys.length;
  } catch {}

  // --- Build HTML ---

  const trendArrow = (current: number, previous: number | null): string => {
    if (previous === null) return '<span style="color:var(--text-faint)">--</span>';
    const diff = current - previous;
    if (diff > 2) return `<span style="color:#4ade80">+${diff}</span>`;
    if (diff < -2) return `<span style="color:#ef4444">${diff}</span>`;
    return `<span style="color:var(--text-faint)">0</span>`;
  };

  const timeAgo = (ts: number | null): string => {
    if (!ts) return "Never";
    const diff = now - ts;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(ts * 1000).toLocaleDateString();
  };

  const planBadge = (plan: string | null): string => {
    if (!plan || plan === "none") return '<span style="color:var(--text-faint)">--</span>';
    const colors: Record<string, string> = {
      audit: "#888",
      signal: "#c8a850",
      amplify: "#4ade80",
      churned: "#ef4444",
    };
    const color = colors[plan] || "#888";
    return `<span style="color:${color};font-weight:500;text-transform:uppercase;font-size:10px;letter-spacing:.1em">${esc(plan)}</span>`;
  };

  const body = `
    <div style="margin-bottom:40px">
      <div class="label" style="margin-bottom:8px">Cockpit</div>
      <h1>Good morning</h1>
    </div>

    <!-- Pulse: traffic + activity -->
    <div class="card" style="margin-bottom:32px;border:1px solid var(--line)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h3>Pulse</h3>
        <span style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint)">Live tracking</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:12px">
        <div style="text-align:center;padding:12px;background:var(--bg-edge);border-radius:4px">
          <div style="font-family:var(--serif);font-size:24px;font-style:italic;color:var(--text)">${pulse.visits24h}</div>
          <div class="label" style="margin-top:4px;font-size:9px">Visits (24h)</div>
        </div>
        <div style="text-align:center;padding:12px;background:var(--bg-edge);border-radius:4px">
          <div style="font-family:var(--serif);font-size:24px;font-style:italic;color:var(--text)">${pulse.visits7d}</div>
          <div class="label" style="margin-top:4px;font-size:9px">Visits (7d)</div>
        </div>
        <div style="text-align:center;padding:12px;background:var(--bg-edge);border-radius:4px">
          <div style="font-family:var(--serif);font-size:24px;font-style:italic;color:var(--text)">${pulse.visits30d}</div>
          <div class="label" style="margin-top:4px;font-size:9px">Visits (30d)</div>
        </div>
        <div style="text-align:center;padding:12px;background:var(--bg-edge);border-radius:4px">
          <div style="font-family:var(--serif);font-size:24px;font-style:italic;color:var(--gold)">${freeScansTotal + pulse.scans30d}</div>
          <div class="label" style="margin-top:4px;font-size:9px">Scans (all)</div>
        </div>
        <div style="text-align:center;padding:12px;background:var(--bg-edge);border-radius:4px">
          <div style="font-family:var(--serif);font-size:24px;font-style:italic;color:var(--gold)">${freeCaptures + pulse.captures30d}</div>
          <div class="label" style="margin-top:4px;font-size:9px">Captures</div>
        </div>
        <div style="text-align:center;padding:12px;background:var(--bg-edge);border-radius:4px">
          <div style="font-family:var(--serif);font-size:24px;font-style:italic;color:var(--text)">${pulse.checkoutStarts7d}</div>
          <div class="label" style="margin-top:4px;font-size:9px">Checkouts (7d)</div>
        </div>
        <div style="text-align:center;padding:12px;background:var(--bg-edge);border-radius:4px">
          <div style="font-family:var(--serif);font-size:24px;font-style:italic;color:var(--text)">${pulse.logins7d}</div>
          <div class="label" style="margin-top:4px;font-size:9px">Logins (7d)</div>
        </div>
      </div>
    </div>

    <!-- Revenue pulse -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:32px">
      <div class="card" style="text-align:center">
        <div class="label" style="margin-bottom:8px">MRR</div>
        <div style="font-size:28px;font-weight:600;color:var(--gold)">$${mrr.toLocaleString()}</div>
      </div>
      <div class="card" style="text-align:center">
        <div class="label" style="margin-bottom:8px">Active subs</div>
        <div style="font-size:28px;font-weight:600">${activeSubscriptions.length}</div>
        <div style="font-size:11px;color:var(--text-faint);margin-top:4px">${signalCount} Signal / ${amplifyCount} Amplify</div>
      </div>
      <div class="card" style="text-align:center">
        <div class="label" style="margin-bottom:8px">New (7d)</div>
        <div style="font-size:28px;font-weight:600">${purchases7d.length}</div>
      </div>
      <div class="card" style="text-align:center">
        <div class="label" style="margin-bottom:8px">Free leads</div>
        <div style="font-size:28px;font-weight:600">${totalLeads}</div>
        <div style="font-size:11px;color:var(--text-faint);margin-top:4px">${leads7d} this week / ${leads30d} this month</div>
      </div>
    </div>

    <!-- Action queue -->
    ${(pendingAudits.length > 0 || regressions.length > 0 || neverLoggedIn.length > 0 || (pendingSuggestions?.count || 0) > 0) ? `
    <div class="card" style="margin-bottom:32px;border:1px solid var(--gold-dim)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h3>Action <em>queue</em></h3>
        <span style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);background:var(--gold-wash);padding:4px 10px;border-radius:2px">${pendingAudits.length + regressions.length + neverLoggedIn.length + (pendingSuggestions?.count || 0)} items</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${pendingAudits.map(u => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--bg-edge);border-radius:4px">
            <div>
              <span style="color:#f59e0b;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin-right:8px">AUDIT</span>
              <span style="font-size:13px">${esc(u.email)} -- audit pending delivery</span>
            </div>
          </div>
        `).join('')}
        ${regressions.map(c => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--bg-edge);border-radius:4px">
            <div>
              <span style="color:#ef4444;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin-right:8px">REGRESSION</span>
              <span style="font-size:13px"><a href="/domain/${c.domainId}" style="color:var(--gold);text-decoration:none">${esc(c.domain)}</a> dropped ${c.previousScore! - c.latestScore} points (${c.previousScore} to ${c.latestScore})</span>
            </div>
          </div>
        `).join('')}
        ${neverLoggedIn.map(u => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--bg-edge);border-radius:4px">
            <div>
              <span style="color:#888;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin-right:8px">INACTIVE</span>
              <span style="font-size:13px">${esc(u.email)} (${u.plan}) paid but never logged in</span>
            </div>
          </div>
        `).join('')}
        ${(pendingSuggestions?.count || 0) > 0 ? `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--bg-edge);border-radius:4px">
            <div>
              <span style="color:var(--gold);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin-right:8px">REVIEW</span>
              <span style="font-size:13px"><a href="/admin/manage" style="color:var(--gold);text-decoration:none">${pendingSuggestions?.count} competitor suggestions</a> awaiting approval</span>
            </div>
          </div>
        ` : ''}
      </div>
    </div>
    ` : ''}

    <!-- Alert feed -->
    ${(unreadAlerts?.results?.length || 0) > 0 ? `
    <div class="card" style="margin-bottom:32px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h3>What's <em>new</em></h3>
        <div style="display:flex;align-items:center;gap:12px">
          <span style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint)">${unreadAlerts.results.length} unread</span>
          <form method="POST" action="/admin/alerts/read-all" style="display:inline">
            <button type="submit" class="btn btn-ghost" style="padding:4px 10px;font-size:9px">Mark all read</button>
          </form>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${unreadAlerts.results.map(a => {
          const typeColors: Record<string, string> = {
            auto_completed: "#4ade80",
            regression: "#ef4444",
            milestone: "#c8a850",
            needs_review: "#f59e0b",
            score_change: "#888",
          };
          const typeLabels: Record<string, string> = {
            auto_completed: "DONE",
            regression: "REGRESSION",
            milestone: "MILESTONE",
            needs_review: "REVIEW",
            score_change: "SCORE",
          };
          const color = typeColors[a.type] || "#888";
          const label = typeLabels[a.type] || a.type.toUpperCase();
          // Build action buttons based on alert type
          let actions = '';
          if (a.type === 'needs_review') {
            actions = `
              <div style="display:flex;gap:6px;align-items:center;margin-left:12px;white-space:nowrap">
                <form method="POST" action="/admin/alert/${a.id}/complete" style="display:inline"><button type="submit" class="btn" style="padding:4px 10px;font-size:9px">Done</button></form>
                <form method="POST" action="/admin/alert/${a.id}/dismiss" style="display:inline"><button type="submit" class="btn btn-ghost" style="padding:4px 10px;font-size:9px">Not yet</button></form>
                <a href="/roadmap/${a.client_slug}" style="font-size:10px;color:var(--gold);margin-left:4px">View</a>
              </div>`;
          } else if (a.type === 'auto_completed') {
            actions = `
              <div style="display:flex;gap:6px;align-items:center;margin-left:12px;white-space:nowrap">
                <form method="POST" action="/admin/alert/${a.id}/dismiss" style="display:inline"><button type="submit" class="btn btn-ghost" style="padding:4px 10px;font-size:9px">Got it</button></form>
              </div>`;
          } else if (a.type === 'regression' || a.type === 'score_change') {
            actions = `
              <div style="display:flex;gap:6px;align-items:center;margin-left:12px;white-space:nowrap">
                <a href="/competitors/${a.client_slug}" class="btn btn-ghost" style="padding:4px 10px;font-size:9px;text-decoration:none">View</a>
                <form method="POST" action="/admin/alert/${a.id}/dismiss" style="display:inline"><button type="submit" class="btn btn-ghost" style="padding:4px 10px;font-size:9px">Got it</button></form>
              </div>`;
          } else {
            actions = `
              <div style="display:flex;gap:6px;align-items:center;margin-left:12px;white-space:nowrap">
                <form method="POST" action="/admin/alert/${a.id}/dismiss" style="display:inline"><button type="submit" class="btn btn-ghost" style="padding:4px 10px;font-size:9px">Got it</button></form>
              </div>`;
          }

          return `
            <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:10px 12px;background:var(--bg-edge);border-radius:4px;border-left:3px solid ${color}">
              <div style="flex:1;min-width:0">
                <span style="color:${color};font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin-right:6px">${label}</span>
                <span style="font-size:10px;color:var(--text-faint);margin-right:8px">${esc(a.client_slug)}</span>
                <span style="font-size:13px;color:var(--text)">${esc(a.title)}</span>
                ${a.detail ? `<div style="font-size:12px;color:var(--text-faint);margin-top:2px">${esc(a.detail)}</div>` : ''}
              </div>
              ${actions}
            </div>`;
        }).join('')}
      </div>
    </div>
    ` : ''}

    <!-- Client health -->
    <div class="card" style="margin-bottom:32px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h3>Client <em>health</em></h3>
        <span style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint)">${clientHealthData.length} domains</span>
      </div>
      ${clientHealthData.length > 0 ? `
      <table class="data-table">
        <thead>
          <tr>
            <th>Client</th>
            <th>Domain</th>
            <th style="text-align:center">Score</th>
            <th style="text-align:center">Trend</th>
            <th style="text-align:center">Grade</th>
            <th>Plan</th>
            <th>Last login</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${clientHealthData.map(c => {
            const gradeColor = c.latestGrade === "A" ? "#4ade80" : c.latestGrade === "B" ? "#c8a850" : c.latestGrade === "C" ? "#f59e0b" : "#ef4444";
            return `
            <tr>
              <td style="font-weight:500">${esc(c.slug)}</td>
              <td><a href="/domain/${c.domainId}" style="color:var(--gold);text-decoration:none;border-bottom:1px solid var(--gold-dim)">${esc(c.domain)}</a></td>
              <td style="text-align:center;font-weight:600">${c.latestScore}</td>
              <td style="text-align:center;font-family:var(--mono);font-size:12px">${trendArrow(c.latestScore, c.previousScore)}</td>
              <td style="text-align:center;color:${gradeColor};font-weight:600">${c.latestGrade}</td>
              <td>${planBadge(c.plan)}</td>
              <td style="color:var(--text-faint);font-size:12px">${timeAgo(c.lastLogin)}</td>
              <td><a href="/admin/inject/${esc(c.slug)}" style="font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);text-decoration:none">Inject</a></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      ` : `
        <div style="text-align:center;padding:24px;color:var(--text-faint);font-size:13px">No client domains yet. <a href="/admin/manage" style="color:var(--gold)">Add one</a></div>
      `}
    </div>

    <!-- Recent purchases -->
    ${recentPurchaseList.length > 0 ? `
    <div class="card" style="margin-bottom:32px">
      <h3 style="margin-bottom:16px">Recent <em>purchases</em></h3>
      <table class="data-table">
        <thead><tr><th>Email</th><th>Plan</th><th>When</th></tr></thead>
        <tbody>
          ${recentPurchaseList.map(p => `
            <tr>
              <td>${esc(p.email)}</td>
              <td>${planBadge(p.plan)}</td>
              <td style="color:var(--text-faint);font-size:12px">${timeAgo(p.created_at)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- Onboarding drip status -->
    ${dripInProgress.length > 0 ? `
    <div class="card" style="margin-bottom:32px">
      <h3 style="margin-bottom:16px">Onboarding <em>drip</em></h3>
      <table class="data-table">
        <thead><tr><th>Email</th><th>Plan</th><th>Day 3</th><th>Day 7</th><th>Started</th></tr></thead>
        <tbody>
          ${dripInProgress.map(u => `
            <tr>
              <td>${esc(u.email)}</td>
              <td>${planBadge(u.plan)}</td>
              <td>${u.onboarding_drip_day3 ? '<span style="color:#4ade80">Sent</span>' : '<span style="color:var(--text-faint)">Pending</span>'}</td>
              <td>${u.onboarding_drip_day7 ? '<span style="color:#4ade80">Sent</span>' : '<span style="color:var(--text-faint)">Pending</span>'}</td>
              <td style="color:var(--text-faint);font-size:12px">${timeAgo(u.onboarding_drip_start)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- Quick actions -->
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      <a href="/admin/manage" class="btn">Manage clients</a>
      <a href="/admin/scans" class="btn btn-ghost">Scan health</a>
      <a href="/admin/engagement" class="btn btn-ghost">Engagement</a>
      <a href="/admin/leads" class="btn btn-ghost">View leads</a>
    </div>
  `;

  return html(layout("Admin", body, user));
}
