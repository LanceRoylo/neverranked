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

export async function handleAdminFreeCheckStats(user: User | null, env: Env, url?: URL): Promise<Response> {
  if (!user || user.role !== "admin") return new Response("Forbidden", { status: 403 });

  // Toggle: ?view=most-recent shows individual scan events sorted by
  // timestamp desc; default ?view=most-scanned shows the per-domain
  // rollup sorted by scan count desc.
  const view: "most-scanned" | "most-recent" =
    url?.searchParams.get("view") === "most-recent" ? "most-recent" : "most-scanned";

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

  const allDomains = [...byDomain.entries()]
    .map(([domain, v]) => ({ domain, count: v.count, avgScore: Math.round(v.scoreSum / v.count) }));
  const topDomains = [...allDomains].sort((a, b) => b.count - a.count).slice(0, 30);
  const handRaisers = allDomains
    .filter((d) => d.avgScore < 60 && d.count >= 2)
    .sort((a, b) => a.avgScore - b.avgScore || b.count - a.count)
    .slice(0, 8);

  const totalGraded = Object.values(gradeCounts).reduce((s, n) => s + n, 0);
  const lowGradeCount = gradeCounts.D + gradeCounts.F;
  const lowGradePct = totalGraded > 0 ? Math.round((lowGradeCount / totalGraded) * 100) : 0;
  const directRefCount = byReferrer.get("(direct)") || 0;
  const directRefPct = real.length > 0 ? Math.round((directRefCount / real.length) * 100) : 0;
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
  const gradeNarrative = totalGraded === 0
    ? "No scans yet."
    : lowGradePct >= 50
      ? `${lowGradePct}% of scanned sites scored D or F. Most people running this tool already know they have an AEO problem. That is your wedge.`
      : lowGradePct >= 20
        ? `${lowGradePct}% scored D or F (${lowGradeCount} sites). Solid pool of warm leads who already know they have a problem.`
        : `Only ${lowGradePct}% scored D or F. Most scanners have decent AEO already, so they may be evaluating tools rather than urgently shopping.`;
  const gradeCard = `
    <div class="card" style="padding:16px">
      <div class="label">Grade distribution</div>
      <div class="muted" style="font-size:11px;margin-top:4px;margin-bottom:12px">${esc(gradeNarrative)}</div>
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
  const funnelNarrative = real.length === 0
    ? "No scans yet."
    : captureCount === 0
      ? "Zero email captures so far. Either nobody is scrolling to the report, or the email-me CTA needs work. Worth a manual run to see where it sits."
      : scanToCapturePct >= 10
        ? `${scanToCapturePct}% of scans convert to email capture. Healthy. Industry benchmark for ungated tools is 5-15%.`
        : scanToCapturePct >= 5
          ? `${scanToCapturePct}% scan-to-capture rate. In the healthy band (5-15%). Worth A/B testing the CTA copy to push higher.`
          : `${scanToCapturePct}% scan-to-capture rate. Below the 5-15% healthy band. Test the email CTA placement and copy.`;
  const funnelCard = `
    <div class="card" style="padding:16px">
      <div class="label">Conversion funnel</div>
      <div class="muted" style="font-size:11px;margin-top:4px;margin-bottom:8px">${esc(funnelNarrative)}</div>
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
  const trendNarrative = trend14 === 0
    ? "No scans in the last 14 days. The tool is live but nothing is hitting it. Likely a discovery or CTA problem on the landing page."
    : wow === null
      ? `${trend7} scans this week. Not enough history yet for a trend read.`
      : wow >= 25
        ? `Up ${wow}% week over week. Whatever you did last week is working. Worth documenting and doubling down.`
        : wow >= 0
          ? `Up ${wow}% week over week. Steady growth. Keep current outreach pace.`
          : wow >= -25
            ? `Down ${Math.abs(wow)}% week over week. Slight dip. Watch for another week before reacting.`
            : `Down ${Math.abs(wow)}% week over week. Material drop. Check whether outreach paused or a referrer dried up.`;
  const trendCard = `
    <div class="card" style="padding:16px;margin-bottom:24px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;gap:16px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div class="label">14-day scan trend</div>
          <div class="muted" style="font-size:11px;margin-top:4px">${trend14} scans in last 14 days. ${trend7} in last 7. ${wowLabel}</div>
        </div>
        <div style="flex:2;min-width:240px;font-size:12px;color:var(--text-mute);line-height:1.6">${esc(trendNarrative)}</div>
      </div>
      <div style="display:flex;gap:4px;align-items:flex-end;height:110px">
        ${trendBars}
      </div>
    </div>
  `;

  // ---- domain table: most-scanned (rollup) OR most-recent (event list) ----
  const recentScans = [...real]
    .filter(e => !!e.ts)
    .sort((a, b) => (b.ts || "").localeCompare(a.ts || ""))
    .slice(0, 30);

  const fmtDateTime = (iso: string | null | undefined) => {
    if (!iso) return "";
    try { return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
    catch { return iso; }
  };
  const fmtRel = (iso: string | null | undefined) => {
    if (!iso) return "";
    const ms = Date.now() - new Date(iso).getTime();
    if (isNaN(ms)) return "";
    const m = Math.floor(ms / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  };

  const domainRows = view === "most-scanned"
    ? (topDomains.length === 0
        ? `<tr class="empty-row"><td colspan="3" style="padding:24px;text-align:center;color:var(--text-faint)">No scans yet.</td></tr>`
        : topDomains.map((d) => `<tr>
            <td><a href="https://${esc(d.domain)}" target="_blank" rel="noopener" style="color:var(--text)">${esc(d.domain)}</a></td>
            <td style="text-align:right;font-variant-numeric:tabular-nums;color:${scoreColor(d.avgScore)}">${d.avgScore}</td>
            <td style="text-align:right;font-variant-numeric:tabular-nums">${d.count}</td>
          </tr>`).join(""))
    : (recentScans.length === 0
        ? `<tr class="empty-row"><td colspan="3" style="padding:24px;text-align:center;color:var(--text-faint)">No scans yet.</td></tr>`
        : recentScans.map((e) => `<tr>
            <td>${e.domain ? `<a href="https://${esc(e.domain)}" target="_blank" rel="noopener" style="color:var(--text)">${esc(e.domain)}</a>` : `<span style="color:var(--text-faint)">(unknown)</span>`}</td>
            <td style="text-align:right;font-variant-numeric:tabular-nums;color:${typeof e.score === "number" ? scoreColor(e.score) : "var(--text-faint)"}">${typeof e.score === "number" ? e.score : "—"}</td>
            <td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--text-mute)" title="${esc(fmtDateTime(e.ts))}">${esc(fmtRel(e.ts))}</td>
          </tr>`).join(""));

  const toggleHtml = `
    <div style="display:inline-flex;gap:0;border:1px solid var(--line);border-radius:4px;overflow:hidden;margin-top:6px">
      <a href="?view=most-scanned" style="padding:5px 10px;font-family:var(--label);font-size:10px;letter-spacing:.1em;text-transform:uppercase;text-decoration:none;color:${view === "most-scanned" ? "var(--text)" : "var(--text-mute)"};background:${view === "most-scanned" ? "var(--gold-wash)" : "transparent"};border-right:1px solid var(--line)">Most scanned</a>
      <a href="?view=most-recent" style="padding:5px 10px;font-family:var(--label);font-size:10px;letter-spacing:.1em;text-transform:uppercase;text-decoration:none;color:${view === "most-recent" ? "var(--text)" : "var(--text-mute)"};background:${view === "most-recent" ? "var(--gold-wash)" : "transparent"}">Most recent</a>
    </div>
  `;

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
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <div>
              <div class="label">${view === "most-scanned" ? "Top domains scanned" : "Most recent scans"}</div>
              <div class="muted" style="font-size:11px;margin-top:4px">${view === "most-scanned" ? "Domains with avg score under 60 and 2+ scans are hand-raisers. Someone there ran your tool more than once." : "Last 30 scans, newest first. Spot real-time interest as it happens."}</div>
            </div>
            ${toggleHtml}
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Domain</th><th style="text-align:right">${view === "most-scanned" ? "Avg score" : "Score"}</th><th style="text-align:right">${view === "most-scanned" ? "Scans" : "When"}</th></tr></thead>
            <tbody>${domainRows}</tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div style="padding:14px 16px;border-bottom:1px solid var(--line)">
          <div class="label">Where visitors came from</div>
          <div class="muted" style="font-size:11px;margin-top:4px">${directRefPct >= 60 ? `${directRefPct}% direct. Most traffic is typed-URL or untagged outreach. Add UTM tags to attribute it properly.` : directRefPct >= 30 ? `${directRefPct}% direct. Mix of typed-URL and untagged sources. UTM your outreach links to clean this up.` : `${directRefPct}% direct. Most traffic is referred from a tracked source. Good attribution.`}</div>
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

  // ---- headline (auto-generated state-of-things) ----
  const headlineParts: string[] = [];
  if (real.length === 0) {
    headlineParts.push("No scans yet. The tool is live but nothing is hitting it.");
  } else {
    headlineParts.push(`${real.length} scan${real.length === 1 ? "" : "s"} across ${uniqueDomains.size} unique domain${uniqueDomains.size === 1 ? "" : "s"}.`);
    if (wow !== null) {
      if (wow >= 25) headlineParts.push(`Up ${wow}% week over week.`);
      else if (wow > 0) headlineParts.push(`Up ${wow}% week over week.`);
      else if (wow === 0) headlineParts.push(`Flat week over week.`);
      else headlineParts.push(`Down ${Math.abs(wow)}% week over week.`);
    }
    if (handRaisers.length > 0) {
      headlineParts.push(`${handRaisers.length} hand-raiser domain${handRaisers.length === 1 ? "" : "s"} (avg score under 60, multiple scans).`);
    }
    if (captureCount === 0 && real.length >= 10) {
      headlineParts.push(`Zero email captures so far. CTA worth investigating.`);
    } else if (captureCount > 0) {
      headlineParts.push(`${captureCount} email capture${captureCount === 1 ? "" : "s"}.`);
    }
  }
  const headline = `
    <div class="card" style="padding:18px;margin-bottom:24px;border-left:3px solid var(--gold)">
      <div class="label" style="margin-bottom:8px">Right now</div>
      <div style="font-size:15px;line-height:1.6;color:var(--text)">${esc(headlineParts.join(" "))}</div>
    </div>
  `;

  // ---- next steps panel ----
  const actions: string[] = [];
  if (handRaisers.length > 0) {
    const list = handRaisers.map((d) => `<a href="https://${esc(d.domain)}" target="_blank" rel="noopener" style="color:var(--text)">${esc(d.domain)}</a> <span class="muted" style="font-size:11px">(${d.avgScore}, ${d.count} scans)</span>`).join(", ");
    actions.push(`<strong>Reach out to hand-raisers.</strong> ${list}. They scored low on your tool more than once. Personal outreach with a teardown of their result is the move.`);
  }
  if (captureCount === 0 && real.length >= 10) {
    actions.push(`<strong>Email capture is broken or invisible.</strong> ${real.length} scans run, zero captures. Run the tool yourself end to end and check whether the email field is reachable, working, and offering enough to gate the full report.`);
  } else if (real.length > 0 && scanToCapturePct > 0 && scanToCapturePct < 5) {
    actions.push(`<strong>Capture rate is below benchmark.</strong> You are at ${scanToCapturePct}%, healthy is 5-15%. Test stronger CTA copy or move the email gate higher up the report.`);
  }
  if (wow !== null && wow <= -25) {
    actions.push(`<strong>Scan velocity dropped ${Math.abs(wow)}%.</strong> Check whether last week's outreach paused, a referrer broke, or a paid campaign ended.`);
  } else if (wow !== null && wow >= 25 && trend7 >= 5) {
    actions.push(`<strong>Document what worked last week.</strong> Up ${wow}% week over week. Whatever you did is working. Capture it before you forget.`);
  }
  if (directRefPct >= 60 && real.length >= 10) {
    actions.push(`<strong>Add UTM tags to your outreach.</strong> ${directRefPct}% of traffic shows as direct. You are losing attribution on most of your inbound.`);
  }
  if (real.length >= 1 && uniqueIps.size === 0) {
    actions.push(`<strong>Wait for unique-visitor data to fill in.</strong> IP-hash logging started 2026-04-24. Older events are not deduped. Number will grow over the next week.`);
  }
  const nextStepsCard = actions.length > 0 ? `
    <div class="card" style="padding:18px;margin-bottom:24px">
      <div class="label" style="margin-bottom:10px">What to do next</div>
      <ol style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:10px;line-height:1.6;font-size:13px;color:var(--text-mute)">
        ${actions.map((a) => `<li>${a}</li>`).join("")}
      </ol>
    </div>
  ` : `
    <div class="card" style="padding:18px;margin-bottom:24px">
      <div class="label" style="margin-bottom:8px">What to do next</div>
      <div class="muted" style="font-size:13px">Numbers look healthy. Keep current outreach cadence. Check this page weekly to catch shifts early.</div>
    </div>
  `;

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

    ${headline}

    ${stats}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px">
      ${gradeCard}
      ${funnelCard}
    </div>

    ${trendCard}

    ${nextStepsCard}

    ${tablesRow}

    ${explainer}

    ${footer}
  `;

  return html(layout("Free check activity", body, user));
}
