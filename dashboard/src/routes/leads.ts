/**
 * Dashboard — Leads panel (admin only)
 *
 * Reads from the shared LEADS KV namespace to show
 * free scan leads, their scores, drip status, and age.
 */

import type { Env, User } from "../types";
import { layout, html, esc } from "../render";

interface LeadScan {
  domain: string;
  score: number;
  grade: string;
  date: string;
}

interface LeadData {
  email: string;
  scans: LeadScan[];
  created: string;
  lastScan: string;
  drip_day3_sent?: boolean;
  drip_day7_sent?: boolean;
  converted?: boolean;
  converted_at?: string;
  converted_plan?: string;
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

function gradeColor(grade: string): string {
  if (grade === "A") return "#27ae60";
  if (grade === "B") return "var(--gold)";
  if (grade === "C") return "#e67e22";
  return "#c0392b";
}

/**
 * GET /api/admin/leads.json
 *
 * Machine-readable version of the leads page for the outreach repo to
 * pull as warm-fuel. Auth via ADMIN_SECRET in the `X-Admin-Secret`
 * header (the same secret used by /api/admin/referrers on the schema
 * check worker). Returns every lead:* entry from the shared LEADS KV
 * with basic fields the outreach script can import as prospects.
 *
 * Optional filters:
 *   ?since=<unix_ts>          only leads created after this ts
 *   ?not_converted=1          only leads where converted !== true
 */
export async function handleLeadsJson(request: Request, env: Env): Promise<Response> {
  const provided = request.headers.get("x-admin-secret") || "";
  if (!env.ADMIN_SECRET || provided !== env.ADMIN_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const sinceRaw = url.searchParams.get("since");
  const sinceMs = sinceRaw ? Number(sinceRaw) * 1000 : 0;
  const onlyUnconverted = url.searchParams.get("not_converted") === "1";

  const list = await env.LEADS.list({ prefix: "lead:", limit: 1000 });
  const out: Array<{
    email: string;
    latest_domain: string | null;
    latest_score: number | null;
    latest_grade: string | null;
    created_at: number;
    last_scan_at: number | null;
    scan_count: number;
    converted: boolean;
  }> = [];

  for (const key of list.keys) {
    const raw = await env.LEADS.get(key.name);
    if (!raw) continue;
    try {
      const d = JSON.parse(raw) as LeadData;
      const createdMs = Date.parse(d.created || "");
      if (Number.isNaN(createdMs)) continue;
      if (sinceMs > 0 && createdMs < sinceMs) continue;
      if (onlyUnconverted && d.converted === true) continue;
      const latest = (d.scans || [])[d.scans?.length - 1] || null;
      out.push({
        email: d.email,
        latest_domain: latest?.domain ?? null,
        latest_score: typeof latest?.score === "number" ? latest.score : null,
        latest_grade: latest?.grade ?? null,
        created_at: Math.floor(createdMs / 1000),
        last_scan_at: d.lastScan ? Math.floor(Date.parse(d.lastScan) / 1000) : null,
        scan_count: d.scans?.length ?? 0,
        converted: d.converted === true,
      });
    } catch {
      // corrupt KV row — skip
    }
  }

  // Newest first
  out.sort((a, b) => b.created_at - a.created_at);

  return Response.json({
    count: out.length,
    leads: out,
    as_of: Math.floor(Date.now() / 1000),
  });
}

interface DeliveryRecord {
  status: "sent" | "failed" | "unknown";
  resend_id?: string | null;
  http_status?: number;
  error?: string | null;
  ts?: string;
  note?: string;
}

export async function handleLeads(user: User, env: Env): Promise<Response> {
  // Fetch all leads from KV
  const list = await env.LEADS.list({ prefix: "lead:" });
  const rawLeads = await Promise.all(list.keys.map((k) => env.LEADS.get(k.name)));
  const leads: LeadData[] = [];
  for (const raw of rawLeads) {
    if (!raw) continue;
    try { leads.push(JSON.parse(raw)); } catch {}
  }

  // Fetch delivery records in parallel
  const deliveryRaws = await Promise.all(
    leads.flatMap((l) => [
      env.LEADS.get(`drip_delivery:${l.email}:day3`),
      env.LEADS.get(`drip_delivery:${l.email}:day7`),
    ])
  );
  const deliveryByEmail = new Map<string, { day3: DeliveryRecord | null; day7: DeliveryRecord | null }>();
  leads.forEach((l, i) => {
    const parse = (raw: string | null): DeliveryRecord | null => {
      try { return raw ? JSON.parse(raw) : null; } catch { return null; }
    };
    deliveryByEmail.set(l.email, {
      day3: parse(deliveryRaws[i * 2]),
      day7: parse(deliveryRaws[i * 2 + 1]),
    });
  });

  // Sort by most recent first
  leads.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());

  // Stats
  const total = leads.length;
  const last7 = leads.filter(l => daysSince(l.created) <= 7).length;
  const last30 = leads.filter(l => daysSince(l.created) <= 30).length;
  const avgScore = leads.length > 0
    ? Math.round(leads.reduce((sum, l) => sum + (l.scans[l.scans.length - 1]?.score || 0), 0) / leads.length)
    : 0;

  const drip3Sent = leads.filter(l => l.drip_day3_sent).length;
  const drip7Sent = leads.filter(l => l.drip_day7_sent).length;
  const converted = leads.filter(l => l.converted).length;

  const statsRow = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:16px;margin-bottom:32px">
      <div class="card" style="text-align:center;padding:20px">
        <div style="font-family:var(--serif);font-size:28px;font-style:italic;color:var(--gold)">${total}</div>
        <div class="label" style="margin-top:4px">Total leads</div>
      </div>
      <div class="card" style="text-align:center;padding:20px">
        <div style="font-family:var(--serif);font-size:28px;font-style:italic;color:var(--text-soft)">${last7}</div>
        <div class="label" style="margin-top:4px">Last 7 days</div>
      </div>
      <div class="card" style="text-align:center;padding:20px">
        <div style="font-family:var(--serif);font-size:28px;font-style:italic;color:var(--text-soft)">${last30}</div>
        <div class="label" style="margin-top:4px">Last 30 days</div>
      </div>
      <div class="card" style="text-align:center;padding:20px">
        <div style="font-family:var(--serif);font-size:28px;font-style:italic;color:var(--text-soft)">${avgScore}</div>
        <div class="label" style="margin-top:4px">Avg score</div>
      </div>
      <div class="card" style="text-align:center;padding:20px">
        <div style="font-family:var(--serif);font-size:28px;font-style:italic;color:var(--text-soft)">${drip3Sent}</div>
        <div class="label" style="margin-top:4px">Day 3 sent</div>
      </div>
      <div class="card" style="text-align:center;padding:20px">
        <div style="font-family:var(--serif);font-size:28px;font-style:italic;color:var(--text-soft)">${drip7Sent}</div>
        <div class="label" style="margin-top:4px">Day 7 sent</div>
      </div>
      <div class="card" style="text-align:center;padding:20px">
        <div style="font-family:var(--serif);font-size:28px;font-style:italic;color:#4ade80">${converted}</div>
        <div class="label" style="margin-top:4px">Converted</div>
      </div>
    </div>
  `;

  let tableRows = "";
  for (const lead of leads) {
    const latest = lead.scans[lead.scans.length - 1];
    const age = daysSince(lead.created);
    const scanCount = lead.scans.length;

    // Drip status, grounded in actual Resend delivery records when present.
    // Pre-2026-04-24 leads have a flag but no record, so we mark those
    // "unverified" rather than overstating delivery.
    const delivery = deliveryByEmail.get(lead.email);
    const day3Rec = delivery?.day3 ?? null;
    const day7Rec = delivery?.day7 ?? null;

    const pill = (label: string, color: string, bg: string, title: string) =>
      `<span style="color:${color};background:${bg};font-family:var(--label);font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:2px 8px;border-radius:2px" title="${esc(title)}">${esc(label)}</span>`;

    const statusFor = (rec: DeliveryRecord | null, flag: boolean, day: number): string => {
      if (rec?.status === "sent") {
        return pill(`D${day} sent`, "#4ade80", "rgba(74,222,128,.1)", `Resend confirmed delivery${rec.resend_id ? ` (id ${rec.resend_id})` : ""} at ${rec.ts || ""}`);
      }
      if (rec?.status === "failed") {
        return pill(`D${day} failed`, "#f87171", "rgba(248,113,113,.12)", `Resend rejected: HTTP ${rec.http_status || "?"} ${rec.error || ""}`);
      }
      if (flag && !rec) {
        return pill(`D${day} unverified`, "#fbbf24", "rgba(251,191,36,.12)", "Flag set before delivery tracking was added (2026-04-24). Cannot confirm Resend actually delivered.");
      }
      if (age >= day && !flag) {
        return pill(`D${day} overdue`, "#f87171", "rgba(248,113,113,.12)", `Day ${day} email should have fired by now.`);
      }
      if (!flag) {
        return pill(`D${day} queued`, "var(--text-faint)", "rgba(255,255,255,.04)", `Will send on day ${day}. Currently day ${age}.`);
      }
      return "";
    };

    const dripStatus = `<div style="display:flex;flex-direction:column;gap:4px;align-items:center">${statusFor(day3Rec, !!lead.drip_day3_sent, 3)}${statusFor(day7Rec, !!lead.drip_day7_sent, 7)}</div>`;

    tableRows += `
      <tr>
        <td style="font-size:13px">${esc(lead.email)}</td>
        <td>${latest ? esc(latest.domain) : '-'}</td>
        <td style="text-align:center">
          ${latest ? `<span style="color:${gradeColor(latest.grade)};font-weight:500">${latest.score}</span>` : '-'}
        </td>
        <td style="text-align:center">${latest ? `<span style="color:${gradeColor(latest.grade)}">${latest.grade}</span>` : '-'}</td>
        <td style="text-align:center">${scanCount}</td>
        <td style="text-align:center">${dripStatus}</td>
        <td style="text-align:center">${lead.converted ? `<span style="color:#4ade80;font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;background:rgba(74,222,128,.1);padding:2px 8px;border-radius:2px">${esc(lead.converted_plan || 'paid')}</span>` : ''}</td>
        <td style="color:var(--text-faint);font-size:12px">${age}d ago</td>
      </tr>
    `;
  }

  const emptyState = leads.length === 0
    ? `<div class="empty"><h3>No leads yet</h3><p>Leads appear here when someone enters their email on <a href="https://check.neverranked.com" style="color:var(--gold)">check.neverranked.com</a></p></div>`
    : "";

  const body = `
    <div style="margin-bottom:40px">
      <div class="label" style="margin-bottom:8px">Admin</div>
      <h1>Free scan <em>leads</em></h1>
      <p style="color:var(--text-faint);font-size:13px;margin-top:8px">
        Every email captured from check.neverranked.com. Drip sequence: Day 1 (report), Day 3 (competitor comparison), Day 7 (re-scan nudge).
      </p>
    </div>

    ${statsRow}

    ${emptyState}

    ${leads.length > 0 ? `
    <div class="card">
      <table class="data-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Domain</th>
            <th style="text-align:center">Score</th>
            <th style="text-align:center">Grade</th>
            <th style="text-align:center">Scans</th>
            <th style="text-align:center">Drip</th>
            <th style="text-align:center">Status</th>
            <th>Age</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>
    ` : ''}
  `;

  return html(layout("Leads", body, user));
}
