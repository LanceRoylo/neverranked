/**
 * Dashboard -- Admin cockpit (morning view)
 *
 * Single page showing revenue, leads, client health, action queue.
 * GET /admin
 */

import type { Env, User, Domain, ScanResult } from "../types";
import { layout, html, esc, redirect } from "../render";
import { getAnalyticsSummary } from "../analytics";
import { getAutomationSettings, setAutomationPaused, setDailyDigestEnabled } from "../automation";

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
    pendingApps,
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
    env.DB.prepare(
      "SELECT COUNT(*) as count FROM agency_applications WHERE status = 'pending'"
    ).first<{ count: number }>(),
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

  // Automation pause state -- rendered as a pill + toggle form on the
  // header so Lance can kill all autonomous decisions in one click
  // without leaving the cockpit. Recent automation_log entries render
  // below for visibility into what the system actually did.
  const automation = await getAutomationSettings(env);
  const recentAutomationLog = (await env.DB.prepare(
    `SELECT kind, target_slug, reason, created_at
       FROM automation_log
       ORDER BY id DESC
       LIMIT 12`
  ).all<{ kind: string; target_slug: string | null; reason: string; created_at: number }>()).results;

  const automationBadge = automation.paused
    ? `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid #ef4444;border-radius:999px;font-family:var(--label);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#ef4444"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#ef4444"></span> Automation paused</span>`
    : `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--gold-dim);border-radius:999px;font-family:var(--label);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold)"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--gold)"></span> Automation live</span>`;
  const automationToggleForm = `
    <form method="POST" action="/admin/automation/toggle" style="margin:0">
      <button type="submit" class="btn btn-ghost" style="padding:6px 12px;font-size:9px">
        ${automation.paused ? "Resume automation" : "Pause all automation"}
      </button>
    </form>
    <form method="POST" action="/admin/automation/digest" style="margin:0" title="Toggle daily 9am digest email">
      <button type="submit" class="btn btn-ghost" style="padding:6px 12px;font-size:9px">
        ${automation.dailyDigestEnabled ? "Digest on" : "Digest off"}
      </button>
    </form>
  `;

  // Cross-agency activity feed: applications, slot changes, invites
  // (sent + accepted), regression alerts, support tickets. Pulls last
  // 30 days, sorts newest, caps at 15. Complements the automation log
  // (which is system-driven) with human-driven events across every
  // agency. Cheap queries, all bound by indexed created_at columns.
  type AdminActivity = { ts: number; kind: string; html: string };
  const ACTIVITY_LIMIT = 15;
  const activitySinceTs = now - 30 * 86400;
  const adminActivity: AdminActivity[] = [];

  const recentApplications = (await env.DB.prepare(
    `SELECT agency_name, contact_email, status, created_at
       FROM agency_applications
      WHERE created_at > ?
      ORDER BY created_at DESC LIMIT ?`
  ).bind(activitySinceTs, ACTIVITY_LIMIT).all<{
    agency_name: string; contact_email: string; status: string; created_at: number;
  }>()).results;
  for (const r of recentApplications) {
    adminActivity.push({
      ts: r.created_at,
      kind: "application",
      html: `<strong>Application</strong> ${esc(r.agency_name)} <span class="muted">&middot; ${esc(r.contact_email)} &middot; ${esc(r.status)}</span>`,
    });
  }

  const recentSlotEvents = (await env.DB.prepare(
    `SELECT s.event_type, s.plan, s.quantity_before, s.quantity_after, s.created_at,
            d.client_slug, a.name AS agency_name
       FROM agency_slot_events s
       LEFT JOIN domains d ON d.id = s.domain_id
       LEFT JOIN agencies a ON a.id = s.agency_id
      WHERE s.created_at > ?
      ORDER BY s.created_at DESC LIMIT ?`
  ).bind(activitySinceTs, ACTIVITY_LIMIT).all<{
    event_type: string; plan: string; quantity_before: number | null; quantity_after: number | null;
    created_at: number; client_slug: string | null; agency_name: string | null;
  }>()).results;
  for (const r of recentSlotEvents) {
    const verb = r.event_type.charAt(0).toUpperCase() + r.event_type.slice(1);
    const slotChange = r.quantity_before !== null && r.quantity_after !== null
      ? ` ${r.quantity_before}&rarr;${r.quantity_after}`
      : "";
    adminActivity.push({
      ts: r.created_at,
      kind: "slot",
      html: `<strong>${verb}</strong> ${esc(r.client_slug || "client")} <span class="muted">&middot; ${esc(r.agency_name || "agency")} &middot; ${esc(r.plan)}${slotChange}</span>`,
    });
  }

  const recentInvites = (await env.DB.prepare(
    `SELECT i.email, i.role, i.client_slug, i.used_at, i.created_at, a.name AS agency_name
       FROM agency_invites i
       LEFT JOIN agencies a ON a.id = i.agency_id
      WHERE i.created_at > ?
      ORDER BY i.created_at DESC LIMIT ?`
  ).bind(activitySinceTs, ACTIVITY_LIMIT).all<{
    email: string; role: string; client_slug: string | null; used_at: number | null;
    created_at: number; agency_name: string | null;
  }>()).results;
  for (const r of recentInvites) {
    const target = r.role === "client" ? `to ${esc(r.client_slug || "?")}` : "as teammate";
    adminActivity.push({
      ts: r.created_at,
      kind: "invite",
      html: `<strong>Invite</strong> ${esc(r.email)} ${target} <span class="muted">&middot; ${esc(r.agency_name || "agency")}</span>`,
    });
    if (r.used_at) {
      adminActivity.push({
        ts: r.used_at,
        kind: "invite_accept",
        html: `<strong>Accepted</strong> ${esc(r.email)} <span class="muted">&middot; ${esc(r.agency_name || "agency")}</span>`,
      });
    }
  }

  adminActivity.sort((a, b) => b.ts - a.ts);
  const adminActivitySection = adminActivity.length === 0 ? "" : `
    <div class="card" style="margin-bottom:32px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <h3 style="margin:0">Recent activity</h3>
        <span class="label" style="font-size:10px">Last ${Math.min(adminActivity.length, ACTIVITY_LIMIT)}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${adminActivity.slice(0, ACTIVITY_LIMIT).map(r => {
          const diff = now - r.ts;
          const ago = diff < 60 ? "just now"
            : diff < 3600 ? `${Math.floor(diff/60)}m ago`
            : diff < 86400 ? `${Math.floor(diff/3600)}h ago`
            : `${Math.floor(diff/86400)}d ago`;
          return `
            <div style="display:flex;justify-content:space-between;gap:16px;padding:6px 0;border-bottom:1px solid var(--line);font-size:13px">
              <span>${r.html}</span>
              <span class="muted" style="white-space:nowrap;font-size:12px">${ago}</span>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;

  // Agency picker for "preview as agency" — saves typing
  // ?agency=slug into the URL bar.
  const allAgencies = (await env.DB.prepare(
    "SELECT slug, name, status FROM agencies ORDER BY name"
  ).all<{ slug: string; name: string; status: string }>()).results;
  const agencyPickerHtml = allAgencies.length === 0 ? "" : `
    <select onchange="if(this.value)window.location.href='/agency?agency='+encodeURIComponent(this.value)"
            style="background:var(--bg-edge);color:var(--text);border:1px solid var(--line);padding:5px 10px;font-family:var(--label);font-size:10px;letter-spacing:.1em;text-transform:uppercase">
      <option value="">Preview agency...</option>
      ${allAgencies.map(a => `<option value="${esc(a.slug)}">${esc(a.name)} (${esc(a.status)})</option>`).join("")}
    </select>
  `;

  const automationLogSection = recentAutomationLog.length > 0 ? `
    <div class="card" style="margin-bottom:32px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <h3 style="margin:0">Automation log</h3>
        <span class="label" style="font-size:10px">Last ${recentAutomationLog.length}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${recentAutomationLog.map(r => {
          const ago = (() => {
            const diff = now - r.created_at;
            if (diff < 3600) return Math.floor(diff / 60) + "m ago";
            if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
            return Math.floor(diff / 86400) + "d ago";
          })();
          return `
            <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:8px 12px;background:var(--bg-edge);border-radius:4px;font-family:var(--mono);font-size:11px">
              <div style="flex:1;min-width:0">
                <span style="color:var(--gold);text-transform:uppercase;letter-spacing:.12em;font-size:10px">${esc(r.kind)}</span>
                ${r.target_slug ? `<span style="color:var(--text-faint);margin-left:8px">${esc(r.target_slug)}</span>` : ""}
                <div style="color:var(--text-soft);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.reason)}</div>
              </div>
              <div style="color:var(--text-faint);font-size:10px;white-space:nowrap">${ago}</div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  ` : "";

  const body = `
    <div style="margin-bottom:40px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap">
      <div>
        <div class="label" style="margin-bottom:8px">Cockpit</div>
        <h1>Good morning</h1>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap">
        ${agencyPickerHtml}
        <a href="/admin/email-test" class="btn btn-ghost" style="padding:6px 12px;font-size:9px">Email test</a>
        <a href="/admin/email-log" class="btn btn-ghost" style="padding:6px 12px;font-size:9px">Email log</a>
        ${automationBadge}
        ${automationToggleForm}
      </div>
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
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-bottom:32px">
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
        <div class="label" style="margin-bottom:8px">Pending apps</div>
        <div style="font-size:28px;font-weight:600;${(pendingApps?.count || 0) > 0 ? "color:var(--gold)" : "color:var(--text-faint)"}">${pendingApps?.count || 0}</div>
        <div style="font-size:11px;color:var(--text-faint);margin-top:4px">${(pendingApps?.count || 0) > 0 ? `<a href="/admin/inbox" style="color:var(--gold)">Review &rarr;</a>` : "&nbsp;"}</div>
      </div>
      <div class="card" style="text-align:center">
        <div class="label" style="margin-bottom:8px">Free leads</div>
        <div style="font-size:28px;font-weight:600">${totalLeads}</div>
        <div style="font-size:11px;color:var(--text-faint);margin-top:4px">${leads7d} this week / ${leads30d} this month</div>
      </div>
    </div>

    ${adminActivitySection}

    ${automationLogSection}

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
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;gap:16px;flex-wrap:wrap">
        <h3>Client <em>health</em></h3>
        <div style="display:flex;align-items:center;gap:12px">
          <input id="client-health-search" type="search" placeholder="Filter by slug, domain, plan..."
                 style="background:var(--bg-edge);color:var(--text);border:1px solid var(--line);padding:5px 10px;font-family:var(--mono);font-size:12px;width:220px"
                 oninput="(function(q){
                   q=q.toLowerCase();
                   document.querySelectorAll('#client-health-table tbody tr').forEach(function(row){
                     row.style.display = !q || row.textContent.toLowerCase().indexOf(q) !== -1 ? '' : 'none';
                   });
                 })(this.value)" />
          <span style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint)">${clientHealthData.length} domains</span>
        </div>
      </div>
      ${clientHealthData.length > 0 ? `
      <table class="data-table" id="client-health-table">
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
      <a href="/admin/inbox" class="btn">Inbox</a>
      <a href="/admin/manage" class="btn btn-ghost">Manage clients</a>
      <a href="/admin/scans" class="btn btn-ghost">Scan health</a>
      <a href="/admin/engagement" class="btn btn-ghost">Engagement</a>
      <a href="/admin/leads" class="btn btn-ghost">View leads</a>
    </div>
  `;

  return html(layout("Admin", body, user));
}

/**
 * POST /admin/automation/toggle
 *
 * Flips the global automation pause switch. Admin-only. No form body
 * needed -- we just read the current state and flip it. Reason defaults
 * to "toggled via admin cockpit" but could be extended later to accept
 * a custom note.
 */
export async function handleAutomationToggle(user: User, env: Env): Promise<Response> {
  const current = await getAutomationSettings(env);
  await setAutomationPaused(env, !current.paused, current.paused ? null : "toggled via admin cockpit");
  return redirect("/admin");
}

/** POST /admin/automation/digest — toggle the daily digest email on/off. */
export async function handleAutomationDigestToggle(user: User, env: Env): Promise<Response> {
  const current = await getAutomationSettings(env);
  await setDailyDigestEnabled(env, !current.dailyDigestEnabled);
  return redirect("/admin");
}
