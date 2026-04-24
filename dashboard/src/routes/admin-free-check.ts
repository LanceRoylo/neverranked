/**
 * Dashboard. Admin view for the public free check tool (check.neverranked.com).
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

interface CaptureEvent {
  type: string;
  domain: string;
  score: number;
  ts: string;
}

const BOT_UA_RE = /playwright|headlesschrome|puppeteer|bot|crawler|spider|curl|wget|python-requests|axios|fetch\//i;
const KV_LIST_LIMIT = 1000;

export async function handleAdminFreeCheckStats(user: User | null, env: Env): Promise<Response> {
  if (!user || user.role !== "admin") return new Response("Forbidden", { status: 403 });

  // Load scans, captures, and leads in parallel.
  const [scanList, captureList, leadList] = await Promise.all([
    env.LEADS.list({ prefix: "event:scan:", limit: KV_LIST_LIMIT }),
    env.LEADS.list({ prefix: "event:capture:", limit: KV_LIST_LIMIT }),
    env.LEADS.list({ prefix: "lead:", limit: KV_LIST_LIMIT }),
  ]);

  const [scanRaws, captureRaws] = await Promise.all([
    Promise.all(scanList.keys.map((k) => env.LEADS.get(k.name))),
    Promise.all(captureList.keys.map((k) => env.LEADS.get(k.name))),
  ]);

  const uniqueIps = new Set<string>();
  const uniqueDomains = new Set<string>();
  const byDomain = new Map<string, { count: number; scoreSum: number }>();
  const byReferrer = new Map<string, number>();
  const gradeCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  const scansByDay = new Map<string, number>();

  const real: ScanEvent[] = [];
  let excludedBot = 0;
  let enrichedEvents = 0;
  let earliest: string | null = null;
  let latest: string | null = null;

  for (const raw of scanRaws) {
    if (!raw) continue;
    let evt: ScanEvent;
    try { evt = JSON.parse(raw) as ScanEvent; } catch { continue; }

    const ua = evt.ua || "";
    if (ua && BOT_UA_RE.test(ua)) { excludedBot++; continue; }

    real.push(evt);
    if (evt.ip_hash) {
      enrichedEvents++;
      uniqueIps.add(evt.ip_hash);
    }
    if (evt.domain) {
      uniqueDomains.add(evt.domain);
      const cur = byDomain.get(evt.domain) || { count: 0, scoreSum: 0 };
      cur.count++;
      cur.scoreSum += typeof evt.score === "number" ? evt.score : 0;
      byDomain.set(evt.domain, cur);
    }
    if (evt.grade && gradeCounts[evt.grade] !== undefined) gradeCounts[evt.grade]++;

    let refHost = "(direct)";
    if (evt.referrer) {
      try { refHost = new URL(evt.referrer).hostname; } catch { refHost = evt.referrer; }
    }
    byReferrer.set(refHost, (byReferrer.get(refHost) || 0) + 1);

    if (evt.ts) {
      if (!earliest || evt.ts < earliest) earliest = evt.ts;
      if (!latest || evt.ts > latest) latest = evt.ts;
      const day = evt.ts.slice(0, 10);
      scansByDay.set(day, (scansByDay.get(day) || 0) + 1);
    }
  }

  let captureCount = 0;
  for (const raw of captureRaws) {
    if (!raw) continue;
    try {
      const evt = JSON.parse(raw) as CaptureEvent;
      if (evt.type === "email_captured") captureCount++;
    } catch {}
  }

  const leadCount = leadList.keys.length;
  const enrichedPct = real.length > 0 ? Math.round((enrichedEvents / real.length) * 100) : 0;
  const scanToCapturePct = real.length > 0 ? Math.round((captureCount / real.length) * 100) : 0;
  const captureToLeadPct = captureCount > 0 ? Math.round((leadCount / captureCount) * 100) : 0;

  const topDomains = [...byDomain.entries()]
    .map(([domain, v]) => ({ domain, count: v.count, avgScore: Math.round(v.scoreSum / v.count) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);
  const topReferrers = [...byReferrer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

  // Build 14-day trend.
  const today = new Date();
  const trendDays: { label: string; key: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    trendDays.push({ label, key, count: scansByDay.get(key) || 0 });
  }
  const trendMax = Math.max(1, ...trendDays.map((d) => d.count));
  const trend14 = trendDays.reduce((s, d) => s + d.count, 0);
  const trend7 = trendDays.slice(-7).reduce((s, d) => s + d.count, 0);
  const trendPrior7 = trendDays.slice(0, 7).reduce((s, d) => s + d.count, 0);
  const wow = trendPrior7 > 0 ? Math.round(((trend7 - trendPrior7) / trendPrior7) * 100) : null;

  // ---- helpers ----

  const fmtDateShort = (iso: string | null) => {
    if (!iso) return "";
    try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return ""; }
  };
  const yearOf = (iso: string | null) => {
    if (!iso) return "";
    try { return String(new Date(iso).getUTCFullYear()); } catch { return ""; }
  };
  const scoreColor = (score: number) => {
    if (score >= 80) return "var(--green)";
    if (score >= 60) return "var(--gold)";
    if (score >= 40) return "var(--text-mute)";
    return "var(--red)";
  };
  const gradeColor = (grade: string) => {
    if (grade === "A") return "var(--green)";
    if (grade === "B") return "var(--gold)";
    if (grade === "C") return "var(--text-mute)";
    return "var(--red)";
  };

  const stat = (label: string, value: string, sub: string, valueSize = 28, color = "var(--text)") => `
    <div class="card" style="text-align:center;padding:18px">
      <div class="label" style="margin-bottom:6px">${esc(label)}</div>
      <div style="font-size:${valueSize}px;font-weight:600;color:${color};line-height:1.1">${value}</div>
      ${sub ? `<div class="muted" style="font-size:11px;margin-top:6px">${esc(sub)}</div>` : ""}
    </div>
  `;

  const windowValue = earliest && latest
    ? `${esc(fmtDateShort(earliest))} <span style="color:var(--text-faint)">→</span> ${esc(fmtDateShort(latest))}`
    : "—";
  const windowSub = earliest && latest ? `${yearOf(earliest)}. 90-day retention.` : "";

  // ---- stat row ----
  const stats = `
    <div class="stats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:12px">
      ${stat("Unique visitors", String(uniqueIps.size), enrichedPct < 100 ? `${enrichedPct}% of scans tagged since 2026-04-24` : "All scans tagged", 32, "var(--gold)")}
      ${stat("Unique domains", String(uniqueDomains.size), "Distinct websites tested")}
      ${stat("Total scans", String(real.length), "Every successful check run")}
      ${stat("Window", windowValue, windowSub, 18)}
    </div>
    <div class="muted" style="font-size:11px;margin-bottom:24px">
      ${excludedBot} bot/scripted request${excludedBot === 1 ? "" : "s"} excluded from these counts. Approaching ${KV_LIST_LIMIT}-event KV list ceiling at ${real.length + excludedBot}; pagination needed before that fills.
    </div>
  `;

  // ---- grade distribution ----
  const totalGraded = Object.values(gradeCounts).reduce((s, n) => s + n, 0);
  const gradeBars = ["A", "B", "C", "D", "F"].map((g) => {
    const n = gradeCounts[g];
    const pct = totalGraded > 0 ? Math.round((n / totalGraded) * 100) : 0;
    return `
      <div style="display:grid;grid-template-columns:24px 1fr 64px;gap:10px;align-items:center;padding:6px 0">
        <div style="font-weight:600;color:${gradeColor(g)};font-size:14px">${g}</div>
        <div style="position:relative;height:8px;background:var(--bg-mute);border-radius:4px;overflow:hidden">
          <div style="position:absolute;inset:0 auto 0 0;width:${pct}%;background:${gradeColor(g)};opacity:.7"></div>
        </div>
        <div style="text-align:right;font-variant-numeric:tabular-nums;font-size:12px;color:var(--text-mute)">${n} <span style="color:var(--text-faint)">(${pct}%)</span></div>
      </div>
    `;
  }).join("");
  const gradeCard = `
    <div class="card" style="padding:16px">
      <div class="label">Grade distribution</div>
      <div class="muted" style="font-size:11px;margin-top:4px;margin-bottom:12px">Where the websites being scanned land. Low grades are warm leads.</div>
      ${gradeBars}
    </div>
  `;

  // ---- conversion funnel ----
  const funnelStep = (label: string, value: number, conv: string | null) => `
    <div style="display:flex;justify-content:space-between;align-items:baseline;padding:10px 0;border-bottom:1px solid var(--line)">
      <div>
        <div style="font-size:13px">${esc(label)}</div>
        ${conv ? `<div class="muted" style="font-size:11px;margin-top:2px">${esc(conv)}</div>` : ""}
      </div>
      <div style="font-size:22px;font-weight:600;font-variant-numeric:tabular-nums">${value}</div>
    </div>
  `;
  const funnelCard = `
    <div class="card" style="padding:16px">
      <div class="label">Conversion funnel</div>
      <div class="muted" style="font-size:11px;margin-top:4px;margin-bottom:8px">Scans land. Some convert to email captures. Some captures become leads.</div>
      ${funnelStep("Scans run", real.length, null)}
      ${funnelStep("Email captures", captureCount, real.length > 0 ? `${scanToCapturePct}% of scans` : null)}
      ${funnelStep("Leads stored", leadCount, captureCount > 0 ? `${captureToLeadPct}% of captures` : null)}
    </div>
  `;

  // ---- 14-day trend ----
  const trendBars = trendDays.map((d) => {
    const h = Math.max(2, Math.round((d.count / trendMax) * 80));
    const isToday = d.key === trendDays[trendDays.length - 1].key;
    return `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0">
        <div style="font-size:10px;color:var(--text-mute);font-variant-numeric:tabular-nums">${d.count || ""}</div>
        <div style="width:100%;height:${h}px;background:${d.count > 0 ? "var(--gold)" : "var(--bg-mute)"};opacity:${isToday ? 1 : 0.65};border-radius:2px"></div>
        <div style="font-size:9px;color:var(--text-faint);white-space:nowrap;text-overflow:ellipsis;overflow:hidden;width:100%;text-align:center">${esc(d.label)}</div>
      </div>
    `;
  }).join("");
  const wowLabel = wow === null
    ? `<span class="muted">no prior week to compare</span>`
    : wow >= 0
      ? `<span style="color:var(--green)">+${wow}%</span> vs prior 7 days`
      : `<span style="color:var(--red)">${wow}%</span> vs prior 7 days`;
  const trendCard = `
    <div class="card" style="padding:16px;margin-bottom:24px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
        <div>
          <div class="label">14-day scan trend</div>
          <div class="muted" style="font-size:11px;margin-top:4px">${trend14} scans in last 14 days. ${trend7} in last 7. ${wowLabel}</div>
        </div>
      </div>
      <div style="display:flex;gap:4px;align-items:flex-end;height:110px">
        ${trendBars}
      </div>
    </div>
  `;

  // ---- top domains (with avg score) ----
  const domainRows = topDomains.length === 0
    ? `<tr class="empty-row"><td colspan="3" style="padding:24px;text-align:center;color:var(--text-faint)">No scans yet.</td></tr>`
    : topDomains.map((d) => `<tr>
        <td><a href="https://${esc(d.domain)}" target="_blank" rel="noopener" style="color:var(--text)">${esc(d.domain)}</a></td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;color:${scoreColor(d.avgScore)}">${d.avgScore}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums">${d.count}</td>
      </tr>`).join("");

  const refRows = topReferrers.length === 0
    ? `<tr class="empty-row"><td colspan="2" style="padding:24px;text-align:center;color:var(--text-faint)">No referrer data yet.</td></tr>`
    : topReferrers.map(([src, count]) => `<tr>
        <td>${esc(src)}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums">${count}</td>
      </tr>`).join("");

  const tablesRow = `
    <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:20px;margin-bottom:24px">
      <div class="card">
        <div style="padding:14px 16px;border-bottom:1px solid var(--line)">
          <div class="label">Top domains scanned</div>
          <div class="muted" style="font-size:11px;margin-top:4px">Avg score colored by health. Red and orange are the warmest leads.</div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Domain</th><th style="text-align:right">Avg score</th><th style="text-align:right">Scans</th></tr></thead>
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

  const explainer = `
    <details style="margin-bottom:24px">
      <summary style="cursor:pointer;font-size:12px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.08em">How to read these numbers</summary>
      <div class="card" style="padding:16px;margin-top:10px;background:var(--bg-mute)">
        <ul style="margin:0;padding-left:20px;line-height:1.7;font-size:13px;color:var(--text-mute)">
          <li><strong>Scans</strong>: every successful check run. Same person scanning 3 URLs counts as 3 scans.</li>
          <li><strong>Unique domains</strong>: floor on real interest. One per distinct website tested.</li>
          <li><strong>Unique visitors</strong>: dedupe by SHA-256 IP hash. Only counts events logged on or after 2026-04-24.</li>
          <li><strong>Conversion funnel</strong>: scans run, then email captures (people who hit "email me the report"), then leads stored.</li>
          <li><strong>Avg score</strong> per domain is averaged across every scan of that domain. Low scores indicate the site has the AEO problem you fix.</li>
          <li>Bot user-agents (Playwright, curl, headless, crawlers) are excluded from every count above.</li>
          <li>KV retention is 90 days. Older events fall off automatically.</li>
        </ul>
      </div>
    </details>
  `;

  const renderedAt = new Date().toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const footer = `
    <div class="muted" style="font-size:11px;text-align:right">Loaded ${esc(renderedAt)}. Refresh for fresh data.</div>
  `;

  const body = `
    <div class="section-header">
      <h1>Free check tool <em>activity</em></h1>
      <p class="section-sub">
        Who is using <a href="https://check.neverranked.com" target="_blank" rel="noopener" style="color:var(--gold)">check.neverranked.com</a>, the public no-signup AEO audit on your landing page. Every successful run logs an anonymous event. We hash the IP so we can count unique people without storing personal data.
      </p>
    </div>

    ${stats}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px">
      ${gradeCard}
      ${funnelCard}
    </div>

    ${trendCard}

    ${tablesRow}

    ${explainer}

    ${footer}
  `;

  return html(layout("Free check activity", body, user));
}
