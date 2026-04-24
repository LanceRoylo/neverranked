/**
 * Dashboard -- Admin view for the public free check tool (check.neverranked.com)
 *
 * Reads anonymous scan events from the LEADS KV namespace written by the
 * schema-check Worker on every /api/check hit. Deduplicates unique humans
 * (ip_hash + UA) and filters obvious bot traffic so Lance can see actual
 * top-of-funnel activity.
 *
 * ip_hash + ua fields are only present on events created after the
 * 2026-04-24 logging enrichment. Older events contribute to total-scan
 * counts and domain counts but cannot count toward unique_ips.
 */

import type { Env, User } from "../types";
import { layout, html, esc } from "../render";

interface ScanEvent {
  type: string;
  domain: string;
  score: number;
  grade: string;
  ts: string;
  ip_hash?: string;
  ua?: string;
  referrer?: string;
  utm?: Record<string, string>;
}

const BOT_UA_RE = /playwright|headlesschrome|puppeteer|bot|crawler|spider|curl|wget|python-requests|axios|fetch\//i;

export async function handleAdminFreeCheckStats(user: User | null, env: Env): Promise<Response> {
  if (!user || user.role !== "admin") return new Response("Forbidden", { status: 403 });

  const list = await env.LEADS.list({ prefix: "event:scan:", limit: 1000 });

  // Parallelize KV reads — sequential get() on 300+ keys blocks for many seconds.
  const rawValues = await Promise.all(list.keys.map((k) => env.LEADS.get(k.name)));

  const uniqueIps = new Set<string>();
  const uniqueIpUa = new Set<string>();
  const uniqueDomains = new Set<string>();
  const byDomain: Record<string, number> = {};
  const byReferrer: Record<string, number> = {};
  const real: ScanEvent[] = [];
  let excludedBot = 0;
  let enrichedEvents = 0;
  let earliest: string | null = null;
  let latest: string | null = null;

  for (const raw of rawValues) {
    if (!raw) continue;
    let evt: ScanEvent;
    try {
      evt = JSON.parse(raw) as ScanEvent;
    } catch {
      continue;
    }

    const ua = evt.ua || "";
    if (ua && BOT_UA_RE.test(ua)) {
      excludedBot++;
      continue;
    }

    real.push(evt);
    if (evt.ip_hash) {
      enrichedEvents++;
      uniqueIps.add(evt.ip_hash);
      uniqueIpUa.add(`${evt.ip_hash}|${ua.slice(0, 120)}`);
    }
    if (evt.domain) {
      uniqueDomains.add(evt.domain);
      byDomain[evt.domain] = (byDomain[evt.domain] || 0) + 1;
    }

    const ref = evt.referrer || "";
    let refHost = "(direct)";
    if (ref) {
      try { refHost = new URL(ref).hostname; } catch { refHost = ref; }
    }
    byReferrer[refHost] = (byReferrer[refHost] || 0) + 1;

    if (evt.ts) {
      if (!earliest || evt.ts < earliest) earliest = evt.ts;
      if (!latest || evt.ts > latest) latest = evt.ts;
    }
  }

  const topDomains = Object.entries(byDomain).sort((a, b) => b[1] - a[1]).slice(0, 30);
  const topReferrers = Object.entries(byReferrer).sort((a, b) => b[1] - a[1]).slice(0, 15);

  const stat = (label: string, value: string | number, sub?: string, color = "var(--text)") => `
    <div class="card" style="text-align:center;padding:18px">
      <div class="label" style="margin-bottom:6px">${esc(label)}</div>
      <div style="font-size:28px;font-weight:600;color:${color}">${value}</div>
      ${sub ? `<div class="muted" style="font-size:11px;margin-top:4px">${esc(sub)}</div>` : ""}
    </div>
  `;

  const fmtDate = (iso: string | null) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return iso; }
  };

  const domainRows = topDomains.length === 0
    ? `<tr class="empty-row"><td colspan="2" style="padding:24px;text-align:center;color:var(--text-faint)">No scans yet.</td></tr>`
    : topDomains.map(([domain, count]) => `<tr>
        <td><a href="https://${esc(domain)}" target="_blank" rel="noopener" style="color:var(--text)">${esc(domain)}</a></td>
        <td style="text-align:right;font-variant-numeric:tabular-nums">${count}</td>
      </tr>`).join("");

  const refRows = topReferrers.length === 0
    ? `<tr class="empty-row"><td colspan="2" style="padding:24px;text-align:center;color:var(--text-faint)">No referrer data yet.</td></tr>`
    : topReferrers.map(([src, count]) => `<tr>
        <td>${esc(src)}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums">${count}</td>
      </tr>`).join("");

  const enrichedPct = real.length > 0 ? Math.round((enrichedEvents / real.length) * 100) : 0;

  const body = `
    <div class="section-header">
      <h1>Free check tool <em>activity</em></h1>
      <p class="section-sub">
        Who is using <a href="https://check.neverranked.com" target="_blank" rel="noopener" style="color:var(--gold)">check.neverranked.com</a> — the public, no-signup AEO audit on your landing page.
        Every time someone hits "Run check" on a URL we log an anonymous event to KV. No personal data, just a SHA-256 hash of their IP so we can count unique people, the domain they scanned, their score, and where they came from.
      </p>
    </div>

    <div class="card" style="padding:16px;margin-bottom:20px;background:var(--bg-mute)">
      <div class="label" style="margin-bottom:8px">How to read these numbers</div>
      <ul style="margin:0;padding-left:20px;line-height:1.7;font-size:13px;color:var(--text-mute)">
        <li><strong>Scans</strong> counts every successful check run. Same person scanning 3 URLs = 3 scans.</li>
        <li><strong>Unique domains</strong> is the floor on real interest — one per distinct website tested.</li>
        <li><strong>Unique visitors</strong> dedupes by IP hash. Only works for events logged after 2026-04-24; older events aren't counted here.</li>
        <li><strong>Bot-filtered</strong> excludes anything with Playwright, curl, wget, headless, or obvious crawler in its user-agent.</li>
        <li>KV retention is 90 days. Events older than that fall off automatically.</li>
      </ul>
    </div>

    <div class="stats" style="grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px">
      ${stat("Total scans", real.length)}
      ${stat("Unique domains", uniqueDomains.size, "Distinct websites tested")}
      ${stat("Unique visitors", uniqueIps.size, enrichedPct < 100 ? `${enrichedPct}% of events enriched` : "All events enriched", "var(--gold)")}
      ${stat("Bot-filtered", excludedBot)}
      ${stat("Window", `${fmtDate(earliest)} → ${fmtDate(latest)}`, "90-day KV TTL")}
    </div>

    <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:20px;margin-bottom:24px">
      <div class="card">
        <div style="padding:14px 16px;border-bottom:1px solid var(--line)">
          <div class="label">Top domains scanned</div>
          <div class="muted" style="font-size:11px;margin-top:4px">The websites real people are running through the tool</div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Domain</th><th style="text-align:right">Scans</th></tr></thead>
            <tbody>${domainRows}</tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div style="padding:14px 16px;border-bottom:1px solid var(--line)">
          <div class="label">Where visitors came from</div>
          <div class="muted" style="font-size:11px;margin-top:4px">Referrer on the page that loaded the check tool</div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Source</th><th style="text-align:right">Scans</th></tr></thead>
            <tbody>${refRows}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  return html(layout("Free check activity", body, user));
}
