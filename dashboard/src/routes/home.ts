/**
 * Dashboard — Home route (domain overview)
 */

import type { Env, User, Domain, ScanResult } from "../types";
import { layout, html, esc } from "../render";

export async function handleHome(user: User, env: Env): Promise<Response> {
  const clientSlug = user.role === "admin" ? null : user.client_slug;

  // Get domains (client sees own, admin sees all)
  let domains: Domain[];
  if (clientSlug) {
    domains = (await env.DB.prepare(
      "SELECT * FROM domains WHERE client_slug = ? AND active = 1 AND is_competitor = 0 ORDER BY domain"
    ).bind(clientSlug).all<Domain>()).results;
  } else {
    domains = (await env.DB.prepare(
      "SELECT * FROM domains WHERE active = 1 AND is_competitor = 0 ORDER BY client_slug, domain"
    ).all<Domain>()).results;
  }

  // Get latest scan + previous scan for each domain
  const domainCards: string[] = [];
  for (const d of domains) {
    const recent = (await env.DB.prepare(
      "SELECT * FROM scan_results WHERE domain_id = ? ORDER BY scanned_at DESC LIMIT 2"
    ).bind(d.id).all<ScanResult>()).results;

    const scan = recent[0] || null;
    const prev = recent[1] || null;
    const score = scan ? scan.aeo_score : null;
    const grade = scan ? scan.grade : "?";
    const redFlagCount = scan ? JSON.parse(scan.red_flags).length : 0;
    const scanDate = scan ? new Date(scan.scanned_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "No scans yet";

    // Score delta vs previous scan
    let deltaHtml = "";
    if (scan && prev && !scan.error && !prev.error) {
      const diff = scan.aeo_score - prev.aeo_score;
      if (diff > 0) {
        deltaHtml = `<span style="color:var(--green);font-size:11px;font-weight:500">+${diff}</span>`;
      } else if (diff < 0) {
        deltaHtml = `<span style="color:var(--red);font-size:11px;font-weight:500">${diff}</span>`;
      } else {
        deltaHtml = `<span style="color:var(--text-faint);font-size:11px">--</span>`;
      }
    }

    domainCards.push(`
      <a href="/domain/${d.id}" class="card" style="display:block;text-decoration:none">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px">
          <div>
            <div class="label" style="margin-bottom:6px">${esc(d.client_slug)}</div>
            <h3 style="font-style:italic">${esc(d.domain)}</h3>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
            ${deltaHtml}
            <div class="grade grade-${grade}">${grade}</div>
          </div>
        </div>
        <div style="display:flex;gap:24px;font-size:12px;color:var(--text-faint)">
          ${score !== null ? `<span>Score: <strong style="color:var(--text);font-weight:400">${score}/100</strong></span>` : ''}
          <span>Red flags: <strong style="color:${redFlagCount > 4 ? 'var(--red)' : 'var(--text)'};font-weight:400">${redFlagCount}</strong></span>
          <span>Last scan: ${scanDate}</span>
        </div>
      </a>
    `);
  }

  // Check which client slugs have competitors (for showing comparison links)
  const slugsWithCompetitors = new Set<string>();
  const compCheck = clientSlug
    ? (await env.DB.prepare("SELECT DISTINCT client_slug FROM domains WHERE client_slug = ? AND is_competitor = 1 AND active = 1").bind(clientSlug).all<{ client_slug: string }>()).results
    : (await env.DB.prepare("SELECT DISTINCT client_slug FROM domains WHERE is_competitor = 1 AND active = 1").all<{ client_slug: string }>()).results;
  compCheck.forEach(r => slugsWithCompetitors.add(r.client_slug));

  // Group domain cards by client_slug for admin view
  const clientSlugs = [...new Set(domains.map(d => d.client_slug))];

  // Competitor comparison links per client
  const compLinks = clientSlugs
    .filter(slug => slugsWithCompetitors.has(slug))
    .map(slug => `<a href="/competitors/${encodeURIComponent(slug)}" class="btn btn-ghost" style="font-size:11px">Competitors: ${esc(slug)}</a>`)
    .join(" ");

  const body = `
    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:40px">
      <div>
        <div class="label" style="margin-bottom:8px">Dashboard</div>
        <h1>Your <em>domains</em></h1>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        ${compLinks}
        ${user.role === "admin" ? '<a href="/admin" class="btn btn-ghost">Admin</a>' : ''}
      </div>
    </div>

    ${domainCards.length > 0
      ? `<div style="display:flex;flex-direction:column;gap:16px">${domainCards.join('')}</div>`
      : `<div class="empty">
          <h3>No domains yet</h3>
          <p>${user.role === 'admin' ? 'Add a client and their domains from the admin panel.' : 'Your account is being set up. Check back soon.'}</p>
        </div>`
    }
  `;

  return html(layout("Dashboard", body, user));
}
