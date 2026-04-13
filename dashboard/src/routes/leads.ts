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

export async function handleLeads(user: User, env: Env): Promise<Response> {
  // Fetch all leads from KV
  const list = await env.LEADS.list({ prefix: "lead:" });
  const leads: LeadData[] = [];

  for (const key of list.keys) {
    const raw = await env.LEADS.get(key.name);
    if (!raw) continue;
    try {
      leads.push(JSON.parse(raw));
    } catch {
      // skip corrupt entries
    }
  }

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

    // Drip status
    let dripStatus = "";
    if (lead.drip_day7_sent) {
      dripStatus = `<span class="status status-done">Complete</span>`;
    } else if (lead.drip_day3_sent) {
      dripStatus = `<span class="status status-in_progress">Day 3 sent</span>`;
    } else if (age >= 3) {
      dripStatus = `<span class="status status-pending">Pending</span>`;
    } else {
      dripStatus = `<span style="color:var(--text-faint);font-size:11px">Day ${age}</span>`;
    }

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
