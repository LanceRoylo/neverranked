/**
 * GET  /free            -- the free-tier dashboard
 * POST /free/scan       -- manual rescan, 1/day cap
 * POST /free/settings   -- toggle email_alerts or public_history
 *
 * Intentionally narrow: one domain, one score, the sparkline, a
 * State of AEO link, the public-page toggle, and a single upgrade
 * CTA. The narrowness is the design -- it makes the paid upgrade
 * obviously bigger.
 *
 * Spec: content/strategy/free-monitoring-tier.md
 */

import type { Env } from "../types";
import { html, layout, esc, redirect } from "../render";
import { getFreeUser, type FreeUser } from "../free-auth";

interface ScanRow {
  id: number;
  aeo_score: number;
  grade: string;
  scanned_at: number;
}

function emptyStatePage(domain: string): string {
  return layout("Your AEO score", `
    <div style="max-width:560px;margin:80px auto;text-align:center">
      <h1 style="margin-bottom:8px"><em>${esc(domain)}</em></h1>
      <p style="color:var(--text-faint);margin:0 0 32px;font-size:13px">
        Your first scan is running. Refresh this page in a minute or two.
      </p>
      <p style="margin:32px 0 0;font-size:12px;color:var(--text-faint)">
        Your weekly score email starts the Monday after the first scan completes.
      </p>
    </div>
  `);
}

function sparkline(scans: ScanRow[]): string {
  if (scans.length < 2) return "";
  const max = 100;
  const w = 280;
  const h = 60;
  const points = scans
    .slice()
    .reverse()
    .map((s, i) => {
      const x = (i / (scans.length - 1)) * w;
      const y = h - (s.aeo_score / max) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return `
    <svg viewBox="0 0 ${w} ${h}" style="width:100%;max-width:${w}px;height:${h}px;display:block;margin:0 auto">
      <polyline fill="none" stroke="var(--gold,#e8c767)" stroke-width="2" points="${points}"/>
    </svg>
  `;
}

function dashboardPage(user: FreeUser, latest: ScanRow | null, history: ScanRow[]): string {
  const score = latest ? latest.aeo_score : null;
  const grade = latest ? latest.grade : "?";
  const lastScanDate = latest
    ? new Date(latest.scanned_at * 1000).toISOString().slice(0, 10)
    : null;

  const weekCount = history.length;
  const trend = history.length >= 2
    ? history[0].aeo_score - history[history.length - 1].aeo_score
    : 0;
  const trendLabel = trend > 0 ? `+${trend}` : trend < 0 ? `${trend}` : "no change";

  const scoreBlock = score !== null ? `
    <div style="text-align:center;margin:48px 0 32px">
      <div style="font-family:Georgia,serif;font-style:italic;font-size:88px;line-height:1;color:#1a1a1a">${score}</div>
      <div style="margin-top:8px;font-family:monospace;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">
        Grade ${esc(grade)} &middot; ${weekCount > 1 ? `Trend ${esc(trendLabel)} over ${weekCount} wk` : "First scan"}
      </div>
      ${lastScanDate ? `<div style="margin-top:6px;font-size:11px;color:var(--text-faint)">Last scanned ${esc(lastScanDate)}</div>` : ""}
    </div>
    <div style="margin:0 auto 48px;max-width:280px">${sparkline(history)}</div>
  ` : `
    <p style="text-align:center;color:var(--text-faint);margin:48px 0">Scan in progress. Refresh shortly.</p>
  `;

  const publicHistoryToggle = `
    <form method="POST" action="/free/settings" style="margin:0">
      <input type="hidden" name="field" value="public_history">
      <input type="hidden" name="value" value="${user.public_history ? 0 : 1}">
      <button type="submit" style="background:none;border:none;padding:0;color:var(--gold,#e8c767);font-family:monospace;font-size:12px;text-decoration:underline;cursor:pointer">
        ${user.public_history ? "Hide my public score page" : "Publish my score history page"}
      </button>
    </form>
  `;

  const publicHistoryNote = user.public_history
    ? `Your score history is published at <a href="/score/${esc(user.domain)}" style="color:var(--gold,#e8c767)">/score/${esc(user.domain)}</a>. Hidden if score drops below 40; noindex until 4 weeks of history accumulate.`
    : "Optional: publish your score history at a shareable URL. Default off, one-click revoke.";

  const emailsToggle = `
    <form method="POST" action="/free/settings" style="margin:0">
      <input type="hidden" name="field" value="email_alerts">
      <input type="hidden" name="value" value="${user.email_alerts ? 0 : 1}">
      <button type="submit" style="background:none;border:none;padding:0;color:var(--gold,#e8c767);font-family:monospace;font-size:12px;text-decoration:underline;cursor:pointer">
        ${user.email_alerts ? "Pause email alerts" : "Resume email alerts"}
      </button>
    </form>
  `;

  const rescanForm = `
    <form method="POST" action="/free/scan" style="margin:0">
      <button type="submit" class="btn btn-ghost" style="font-size:12px">Rescan now</button>
    </form>
  `;

  return layout("Your AEO score", `
    <div style="max-width:560px;margin:48px auto;padding:0 20px">
      <div style="text-align:center;margin-bottom:8px">
        <div style="font-family:monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--text-faint)">Free weekly AEO score</div>
        <h1 style="font-family:Georgia,serif;font-style:italic;font-size:36px;margin:8px 0 0">${esc(user.domain)}</h1>
      </div>

      ${scoreBlock}

      <div style="border-top:1px solid var(--line,#e5e5e5);border-bottom:1px solid var(--line,#e5e5e5);padding:24px 0;margin:32px 0">
        <div style="font-family:monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--text-faint);margin-bottom:8px">The Citation Tape, this week</div>
        <p style="margin:0 0 12px;font-size:13px;color:var(--text-soft)">
          NeverRanked's standing measurement of what AI engines cite when answering questions about brands we track. The same engines that score your domain are the ones returning answers about your category.
        </p>
        <a href="https://neverranked.com/state-of-aeo/" style="font-family:monospace;font-size:12px;color:var(--gold,#e8c767);text-decoration:underline">Read this week's report &rarr;</a>
      </div>

      <div style="background:var(--bg-lift,#fafafa);padding:24px;border-radius:6px;margin:32px 0;text-align:center">
        <h2 style="font-family:Georgia,serif;font-style:italic;font-size:22px;margin:0 0 8px">Want to fix the score?</h2>
        <p style="font-size:13px;color:var(--text-soft);margin:0 0 16px">
          Free shows the score. Paid shows <em>what to fix and the citation tracking across all seven engines</em>. Pulse is $497/mo, Signal $2,000/mo. Audit credits toward the first month.
        </p>
        <a href="https://neverranked.com/pricing" class="btn" style="font-size:13px">See paid tiers</a>
      </div>

      <div style="margin:32px 0">
        <div style="font-family:monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--text-faint);margin-bottom:12px">Settings</div>
        <div style="display:flex;flex-direction:column;gap:12px;font-size:12px;color:var(--text-soft)">
          <div>
            <div style="margin-bottom:4px">Public score page</div>
            <div style="color:var(--text-faint);font-size:11px;margin-bottom:6px">${publicHistoryNote}</div>
            ${publicHistoryToggle}
          </div>
          <div>
            <div style="margin-bottom:4px">Weekly digest + score-drop alerts</div>
            <div style="color:var(--text-faint);font-size:11px;margin-bottom:6px">${user.email_alerts ? "Active. Weekly Monday digest plus an alert when your score drops 5+ points or crosses a band." : "Paused. You will not receive emails."}</div>
            ${emailsToggle}
          </div>
          <div>
            <div style="margin-bottom:4px">Manual rescan</div>
            <div style="color:var(--text-faint);font-size:11px;margin-bottom:6px">One free rescan per day. The cron runs every Monday automatically.</div>
            ${rescanForm}
          </div>
        </div>
      </div>

      <p style="text-align:center;margin:48px 0 0;font-size:11px;color:var(--text-faint)">
        Signed in as ${esc(user.email)}.
      </p>
    </div>
  `);
}

export async function handleFreeDashboard(request: Request, env: Env): Promise<Response> {
  const user = await getFreeUser(request, env);
  if (!user) return redirect("/free/signup");

  const latest = await env.DB.prepare(
    `SELECT sr.id, sr.aeo_score, sr.grade, sr.scanned_at
     FROM scan_results sr
     JOIN domains d ON sr.domain_id = d.id
     WHERE d.free_user_id = ?
     ORDER BY sr.scanned_at DESC
     LIMIT 1`
  ).bind(user.id).first<ScanRow>();

  if (!latest) {
    return html(emptyStatePage(user.domain));
  }

  const historyResult = await env.DB.prepare(
    `SELECT sr.id, sr.aeo_score, sr.grade, sr.scanned_at
     FROM scan_results sr
     JOIN domains d ON sr.domain_id = d.id
     WHERE d.free_user_id = ?
     ORDER BY sr.scanned_at DESC
     LIMIT 12`
  ).bind(user.id).all<ScanRow>();

  const history = historyResult.results || [];

  return html(dashboardPage(user, latest, history));
}

const SCAN_RATE_LIMIT_SEC = 24 * 60 * 60; // 1/day

export async function handleFreeScan(request: Request, env: Env): Promise<Response> {
  const user = await getFreeUser(request, env);
  if (!user) return redirect("/free/signup");

  const now = Math.floor(Date.now() / 1000);
  if (user.last_scan_at && now - user.last_scan_at < SCAN_RATE_LIMIT_SEC) {
    return html(layout("Rescan throttled", `
      <div style="max-width:440px;margin:80px auto;text-align:center">
        <h1 style="margin-bottom:12px"><em>One scan per day</em></h1>
        <p style="color:var(--text-faint);margin-bottom:32px;font-size:13px">
          Try again in a few hours, or wait for the weekly cron Monday.
        </p>
        <a href="/free" class="btn btn-ghost">Back to my score</a>
      </div>
    `), 429);
  }

  const domain = await env.DB.prepare(
    "SELECT id FROM domains WHERE free_user_id = ? AND active = 1 LIMIT 1"
  ).bind(user.id).first<{ id: number }>();

  if (!domain) {
    // Defensive: shouldn't happen, but if the domain row is missing
    // recreate it so the user isn't stuck.
    const insertResult = await env.DB.prepare(
      `INSERT INTO domains (client_slug, domain, active, free_user_id, created_at, updated_at)
       VALUES (?, ?, 1, ?, ?, ?)`
    ).bind(`free-${user.id}`, user.domain, user.id, now, now).run();
    const domainId = Number(insertResult.meta?.last_row_id ?? 0);
    if (domainId > 0 && env.SCAN_DOMAIN_WORKFLOW) {
      await env.SCAN_DOMAIN_WORKFLOW.create({ params: { domainId } });
    }
  } else if (env.SCAN_DOMAIN_WORKFLOW) {
    await env.SCAN_DOMAIN_WORKFLOW.create({ params: { domainId: domain.id } });
  }

  await env.DB.prepare("UPDATE free_users SET last_scan_at = ? WHERE id = ?")
    .bind(now, user.id)
    .run();

  return redirect("/free");
}

export async function handleFreeSettings(request: Request, env: Env): Promise<Response> {
  const user = await getFreeUser(request, env);
  if (!user) return redirect("/free/signup");

  const formData = await request.formData();
  const field = (formData.get("field") as string) || "";
  const valueRaw = (formData.get("value") as string) || "0";
  const value = valueRaw === "1" ? 1 : 0;

  if (field === "public_history") {
    await env.DB.prepare("UPDATE free_users SET public_history = ? WHERE id = ?")
      .bind(value, user.id)
      .run();
  } else if (field === "email_alerts") {
    await env.DB.prepare("UPDATE free_users SET email_alerts = ? WHERE id = ?")
      .bind(value, user.id)
      .run();
  } else {
    return html("Unknown setting", 400);
  }

  return redirect("/free");
}
