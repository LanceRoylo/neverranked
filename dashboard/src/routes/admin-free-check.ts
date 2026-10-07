/**
 * Admin view for the public free check (check.neverranked.com).
 *
 * REWRITTEN 2026-10-07 to read D1 (free_check_events, free_check_leads,
 * migration 0131) instead of the LEADS KV namespace.
 *
 * What changed and why:
 *   - Counts are PEOPLE: distinct check-page sessions, with internal callers
 *     and bots excluded at write time by the scan Worker and shown below by
 *     source. The old page filtered with a bot pattern that missed our own
 *     MCP tool, the audit template, Node scripts and the keyed Montaic lane.
 *   - The funnel has the step that was missing: who SAW the email ask.
 *   - Attribution reads utm_source. The old page read `evt.utm.source`
 *     while the Worker stored `utm.utm_source`, so tagged traffic was never
 *     attributed.
 *   - Every lead is listed with its consent version, attribution and
 *     follow-up status.
 *   - The canned narratives are gone ("industry benchmark 5-15%", "most
 *     people running this tool already know they have a problem", "whatever
 *     you did last week is working"). They read as findings and were not.
 */

import type { Env, User } from "../types";
import { layout, html, esc } from "../render";
import {
  countWindow, isPersonEvent, excludedBucket, attribution, conversionPhrase, hst, ymdHst,
  DAY, type FcEventRow,
} from "../lib/free-check-counts";

interface LeadDetail {
  id: number;
  email: string;
  domain: string;
  score: number | null;
  grade: string | null;
  source: string;
  is_internal: number;
  internal_reason: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  referrer: string | null;
  consent_version: string;
  followup_ok: number;
  ai_run_id: number | null;
  outreach_prospect_id: number | null;
  followup_hold_reason: string | null;
  unsubscribed_at: number | null;
  report_email_status: string | null;
  created_at: number;
}

function outreachStatus(l: LeadDetail): string {
  if (l.unsubscribed_at) return "unsubscribed";
  if (l.outreach_prospect_id) return `prospect #${l.outreach_prospect_id}`;
  if (l.followup_hold_reason) return `held: ${l.followup_hold_reason}`;
  if (!l.followup_ok) return "no follow-up (consent)";
  return "not imported yet";
}

export async function handleAdminFreeCheckStats(user: User | null, env: Env, _url?: URL): Promise<Response> {
  if (!user || user.role !== "admin") return new Response("Forbidden", { status: 403 });

  const now = Math.floor(Date.now() / 1000);
  const since30 = now - 30 * DAY;

  let events: FcEventRow[] = [];
  let leads: LeadDetail[] = [];
  let countingFrom: number | null = null;
  let loadError: string | null = null;
  try {
    const [first, ev, ld] = await env.DB.batch([
      env.DB.prepare("SELECT MIN(created_at) AS t FROM free_check_events WHERE source = 'page' AND session_id IS NOT NULL"),
      env.DB.prepare(
        `SELECT type, source, is_internal, is_bot, session_id, ip_hash, domain, utm_source, utm_campaign, referrer, created_at
           FROM free_check_events WHERE created_at >= ? ORDER BY created_at DESC LIMIT 20000`,
      ).bind(since30),
      env.DB.prepare(
        `SELECT id, email, domain, score, grade, source, is_internal, internal_reason, utm_source, utm_medium,
                utm_campaign, utm_content, referrer, consent_version, followup_ok, ai_run_id, outreach_prospect_id,
                followup_hold_reason, unsubscribed_at, report_email_status, created_at
           FROM free_check_leads ORDER BY created_at DESC LIMIT 300`,
      ),
    ]);
    const t = (first.results?.[0] as { t: number | null } | undefined)?.t;
    countingFrom = typeof t === "number" ? t : null;
    events = (ev.results ?? []) as unknown as FcEventRow[];
    leads = (ld.results ?? []) as unknown as LeadDetail[];
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  const leadRowsForCounts = leads.map((l) => ({ ...l }));
  const windowFrom = (secs: number) => Math.max(now - secs, countingFrom ?? now + 1);
  const windows = [
    { label: "Last 24 hours", c: countWindow(events, leadRowsForCounts, windowFrom(DAY), now) },
    { label: "Last 7 days", c: countWindow(events, leadRowsForCounts, windowFrom(7 * DAY), now) },
    { label: "Last 30 days", c: countWindow(events, leadRowsForCounts, windowFrom(30 * DAY), now) },
  ];

  const funnelCards = windows.map(({ label, c }) => `
    <div class="card" style="padding:16px">
      <div class="label" style="margin-bottom:10px">${esc(label)}</div>
      <div style="display:grid;grid-template-columns:1fr auto;gap:6px 12px;font-size:13px">
        <div>Ran a check</div><div style="text-align:right;font-variant-numeric:tabular-nums;font-weight:600">${c.ranCheck}</div>
        <div>Saw the email ask</div><div style="text-align:right;font-variant-numeric:tabular-nums;font-weight:600">${c.sawAsk}</div>
        <div>Gave an email</div><div style="text-align:right;font-variant-numeric:tabular-nums;font-weight:600">${c.gaveEmail}</div>
        <div class="muted" style="grid-column:1 / -1;font-size:11px">${esc(conversionPhrase(c.gaveEmail, c.sawAsk))}</div>
        <div class="muted">Excluded calls</div><div class="muted" style="text-align:right;font-variant-numeric:tabular-nums">${c.excluded}</div>
      </div>
    </div>`).join("");

  // Excluded by source, 30 days (rows, not people: these are calls).
  const excluded = new Map<string, number>();
  const attributionCounts = new Map<string, number>();
  const recentPeople: { domain: string; at: number }[] = [];
  const from30 = windowFrom(30 * DAY);
  for (const e of events as (FcEventRow & { utm_source?: string | null; utm_campaign?: string | null; referrer?: string | null })[]) {
    if (e.created_at < from30) continue;
    if (!isPersonEvent(e)) {
      const b = excludedBucket(e);
      excluded.set(b, (excluded.get(b) || 0) + 1);
      continue;
    }
    if (e.type === "scan") {
      const a = attribution({ utm_source: e.utm_source ?? null, utm_campaign: e.utm_campaign ?? null, utm_content: null, referrer: e.referrer ?? null });
      attributionCounts.set(a, (attributionCounts.get(a) || 0) + 1);
      if (recentPeople.length < 30 && e.domain) recentPeople.push({ domain: e.domain, at: e.created_at });
    }
  }

  const tableCard = (title: string, sub: string, head: string, rows: string, empty: string, cols: number) => `
    <div class="card">
      <div style="padding:14px 16px;border-bottom:1px solid var(--line)">
        <div class="label">${esc(title)}</div>
        ${sub ? `<div class="muted" style="font-size:11px;margin-top:4px">${esc(sub)}</div>` : ""}
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>${head}</tr></thead>
          <tbody>${rows || `<tr class="empty-row"><td colspan="${cols}" style="padding:20px;text-align:center;color:var(--text-faint)">${esc(empty)}</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;

  const leadRows = leads.map((l) => `<tr>
      <td style="white-space:nowrap">${esc(hst(l.created_at))}</td>
      <td>${esc(l.email)}${l.is_internal ? ` <span class="muted" style="font-size:10px">internal${l.internal_reason ? `: ${esc(l.internal_reason)}` : ""}</span>` : ""}</td>
      <td><a href="https://${esc(l.domain)}" target="_blank" rel="noopener" style="color:var(--text)">${esc(l.domain)}</a></td>
      <td style="text-align:right;font-variant-numeric:tabular-nums">${l.score ?? "?"}${l.grade ? ` ${esc(l.grade)}` : ""}</td>
      <td>${esc(attribution(l))}</td>
      <td>${esc(l.consent_version)}${l.source === "kv_backfill" ? ` <span class="muted" style="font-size:10px">backfill</span>` : ""}</td>
      <td>${l.ai_run_id ? `run #${l.ai_run_id}` : `<span class="muted">not run</span>`}</td>
      <td>${esc(outreachStatus(l))}</td>
      <td class="muted" style="font-size:11px">${esc(l.report_email_status ?? "")}</td>
    </tr>`).join("");

  const excludedRows = [...excluded.entries()].sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `<tr><td>${esc(k)}</td><td style="text-align:right;font-variant-numeric:tabular-nums">${n}</td></tr>`).join("");
  const attributionRows = [...attributionCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
    .map(([k, n]) => `<tr><td>${esc(k)}</td><td style="text-align:right;font-variant-numeric:tabular-nums">${n}</td></tr>`).join("");
  const recentRows = recentPeople
    .map((r) => `<tr><td>${esc(r.domain)}</td><td style="text-align:right;color:var(--text-mute)">${esc(hst(r.at))}</td></tr>`).join("");

  const basis = countingFrom === null
    ? "No page-tagged rows yet. Counting starts with the first check-page visit after the scan Worker deploy."
    : `Counting from ${ymdHst(countingFrom)}. Rows before that (including backfilled history) are not in these counts.`;

  const body = `
    <div class="section-header">
      <h1>Free check tool <em>activity</em></h1>
      <p class="section-sub">
        People using <a href="https://check.neverranked.com" target="_blank" rel="noopener" style="color:var(--gold)">check.neverranked.com</a>.
        A row counts as a person only when it came from the check page's own script (it carries a session id), is not one of our callers and is not a bot.
        Everything else is listed under excluded, by source.
      </p>
    </div>

    ${loadError ? `<div class="card" style="padding:16px;margin-bottom:20px;border-left:3px solid var(--red)">Could not read the free-check tables: ${esc(loadError)}</div>` : ""}
    <div class="muted" style="font-size:12px;margin-bottom:16px">${esc(basis)}</div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:24px">
      ${funnelCards}
    </div>

    <div style="margin-bottom:24px">
      ${tableCard("Leads", "Every capture, newest first. Internal and backfilled rows are marked.",
        `<th>When</th><th>Email</th><th>Domain</th><th style="text-align:right">Score</th><th>Attribution</th><th>Consent</th><th>AI check</th><th>Outreach</th><th>Report email</th>`,
        leadRows, "No leads yet.", 9)}
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;margin-bottom:24px">
      ${tableCard("Where people came from", "People's scans, last 30 days. utm_source / utm_campaign, else the referrer.", `<th>Source</th><th style="text-align:right">Scans</th>`, attributionRows, "No tagged scans yet.", 2)}
      ${tableCard("Excluded, by source", "Calls in the last 30 days that are not a person.", `<th>Source</th><th style="text-align:right">Calls</th>`, excludedRows, "Nothing excluded.", 2)}
      ${tableCard("Recent checks by people", "Newest first.", `<th>Domain</th><th style="text-align:right">When</th>`, recentRows, "No checks yet.", 2)}
    </div>
  `;

  return html(layout("Free check activity", body, user));
}
