/**
 * Dashboard — Competitive comparison view
 *
 * Shows client's domain(s) side-by-side with competitor domains,
 * comparing AEO scores, grades, schema coverage, and red flags.
 */

import type { Env, User, Domain, ScanResult } from "../types";
import { layout, html, esc } from "../render";

interface ComparisonRow {
  domain: Domain;
  scan: ScanResult | null;
  schemaTypes: string[];
  redFlagCount: number;
}

export async function handleCompetitors(clientSlug: string, user: User, env: Env): Promise<Response> {
  // Get all domains for this client (primary + competitors)
  const domains = (await env.DB.prepare(
    "SELECT * FROM domains WHERE client_slug = ? AND active = 1 ORDER BY is_competitor, domain"
  ).bind(clientSlug).all<Domain>()).results;

  if (domains.length === 0) {
    return html(layout("Competitors", `<div class="empty"><h3>No domains found</h3></div>`, user), 404);
  }

  // Get latest scan for each domain
  const rows: ComparisonRow[] = [];
  for (const d of domains) {
    const scan = await env.DB.prepare(
      "SELECT * FROM scan_results WHERE domain_id = ? ORDER BY scanned_at DESC LIMIT 1"
    ).bind(d.id).first<ScanResult>();

    const schemaTypes = scan && !scan.error ? JSON.parse(scan.schema_types) as string[] : [];
    const redFlagCount = scan && !scan.error ? (JSON.parse(scan.red_flags) as string[]).length : 0;

    rows.push({ domain: d, scan, schemaTypes, redFlagCount });
  }

  const primary = rows.filter(r => !r.domain.is_competitor);
  const competitors = rows.filter(r => r.domain.is_competitor);

  // Collect all schema types across all domains
  const allSchemaTypes = new Set<string>();
  rows.forEach(r => r.schemaTypes.forEach(t => allSchemaTypes.add(t)));
  const schemaColumns = [...allSchemaTypes].sort();

  // Build comparison bars
  const maxScore = 100;
  const barColor = (score: number) =>
    score >= 80 ? "var(--green)" : score >= 60 ? "var(--yellow)" : "var(--red)";

  // Score comparison chart
  const allRows = [...primary, ...competitors];
  const scoreChart = allRows.map(r => {
    const score = r.scan && !r.scan.error ? r.scan.aeo_score : 0;
    const grade = r.scan && !r.scan.error ? r.scan.grade : "?";
    const pct = (score / maxScore) * 100;
    const isPrimary = !r.domain.is_competitor;
    const label = isPrimary ? r.domain.domain : `${r.domain.domain}${r.domain.competitor_label ? ` (${r.domain.competitor_label})` : ""}`;
    const tag = isPrimary
      ? '<span style="font-family:var(--label);font-size:8px;font-weight:500;letter-spacing:.15em;text-transform:uppercase;color:var(--gold);border:1px solid var(--gold-dim);padding:1px 6px;border-radius:2px;margin-left:6px;vertical-align:middle">YOU</span>'
      : '<span style="font-family:var(--label);font-size:8px;font-weight:500;letter-spacing:.15em;text-transform:uppercase;color:var(--text-faint);border:1px solid var(--line);padding:1px 6px;border-radius:2px;margin-left:6px;vertical-align:middle">COMPETITOR</span>';

    return `
      <div style="display:grid;grid-template-columns:260px 1fr auto;gap:16px;align-items:center;padding:12px 0;border-bottom:1px solid rgba(251,248,239,.06)">
        <div style="font-size:13px;${isPrimary ? 'color:var(--gold);font-weight:400' : 'color:var(--text-faint)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(label)}">${esc(label)}${tag}</div>
        <div style="position:relative;height:28px;background:rgba(251,248,239,.04);border-radius:3px;overflow:hidden">
          <div style="position:absolute;left:0;top:0;bottom:0;width:${pct}%;background:${isPrimary ? 'var(--gold-wash)' : 'rgba(251,248,239,.06)'};border-right:2px solid ${isPrimary ? 'var(--gold)' : barColor(score)};transition:width .3s var(--ease)"></div>
          <div style="position:relative;padding:0 12px;line-height:28px;font-size:12px;color:var(--text-soft)">${score}/100</div>
        </div>
        <div class="grade grade-${grade}" style="width:32px;height:32px;font-size:16px;flex-shrink:0">${grade}</div>
      </div>
    `;
  }).join("");

  // Win/loss summary
  const primaryScore = primary[0]?.scan?.aeo_score || 0;
  const wins = competitors.filter(c => (c.scan?.aeo_score || 0) < primaryScore).length;
  const losses = competitors.filter(c => (c.scan?.aeo_score || 0) > primaryScore).length;
  const ties = competitors.filter(c => (c.scan?.aeo_score || 0) === primaryScore).length;

  // Advantage areas
  const primarySchemas = new Set(primary[0]?.schemaTypes || []);
  const advantages: string[] = [];
  const gaps: string[] = [];

  for (const schema of schemaColumns) {
    const clientHas = primarySchemas.has(schema);
    const anyCompHas = competitors.some(c => c.schemaTypes.includes(schema));
    const allCompMiss = competitors.every(c => !c.schemaTypes.includes(schema));

    if (clientHas && allCompMiss) {
      advantages.push(schema);
    } else if (!clientHas && anyCompHas) {
      gaps.push(schema);
    }
  }

  // Schema comparison matrix
  let schemaMatrix = "";
  if (schemaColumns.length > 0) {
    schemaMatrix = `
      <div style="margin-top:48px">
        <div class="label" style="margin-bottom:16px">Schema Comparison</div>
        <div style="overflow-x:auto;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
          <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:${Math.max(400, 180 + schemaColumns.length * 80)}px">
            <thead>
              <tr style="border-bottom:1px solid var(--line)">
                <th style="text-align:left;padding:12px 16px;font-family:var(--label);font-weight:500;letter-spacing:.1em;text-transform:uppercase;font-size:10px;color:var(--text-faint);position:sticky;left:0;background:var(--bg-lift);min-width:160px">Domain</th>
                ${schemaColumns.map(col => `
                  <th style="text-align:center;padding:12px 6px;font-family:var(--label);font-weight:500;letter-spacing:.1em;text-transform:uppercase;font-size:9px;color:var(--text-faint);white-space:nowrap">${esc(col)}</th>
                `).join("")}
              </tr>
            </thead>
            <tbody>
              ${allRows.map(r => {
                const isPrimary = !r.domain.is_competitor;
                return `
                  <tr style="border-bottom:1px solid rgba(251,248,239,.06)">
                    <td style="padding:10px 16px;font-size:12px;${isPrimary ? 'color:var(--gold)' : 'color:var(--text-faint)'};position:sticky;left:0;background:var(--bg-lift)">${esc(r.domain.domain)} ${isPrimary ? '<span style="font-family:var(--label);font-size:7px;letter-spacing:.1em;color:var(--gold);border:1px solid var(--gold-dim);padding:0 4px;border-radius:2px;vertical-align:middle">YOU</span>' : ''}</td>
                    ${schemaColumns.map(col => {
                      const has = r.schemaTypes.includes(col);
                      return `<td style="text-align:center;padding:10px 6px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;${has ? 'background:var(--green)' : 'background:rgba(251,248,239,.08);border:1px solid rgba(251,248,239,.12)'}"></span></td>`;
                    }).join("")}
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // Red flag comparison
  const flagBars = allRows.map(r => {
    const isPrimary = !r.domain.is_competitor;
    const count = r.redFlagCount;
    const barPct = Math.min((count / 10) * 100, 100);
    const nameColor = isPrimary ? "color:var(--gold)" : "color:var(--text-faint)";
    const barBg = count > 4 ? "rgba(232,84,84,.2)" : "rgba(94,199,106,.1)";
    const barBorder = count > 4 ? "var(--red)" : count > 0 ? "var(--yellow)" : "var(--green)";
    const countColor = count > 4 ? "var(--red)" : "var(--text)";
    const youTag = isPrimary ? ' <span style="font-family:var(--label);font-size:7px;letter-spacing:.1em;color:var(--gold);border:1px solid var(--gold-dim);padding:0 4px;border-radius:2px;vertical-align:middle">YOU</span>' : '';
    return `
      <div style="display:grid;grid-template-columns:260px 1fr auto;gap:16px;align-items:center">
        <div style="font-size:12px;${nameColor};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.domain.domain)}${youTag}</div>
        <div style="position:relative;height:20px;background:rgba(251,248,239,.04);border-radius:3px;overflow:hidden">
          <div style="position:absolute;left:0;top:0;bottom:0;width:${barPct}%;background:${barBg};border-right:2px solid ${barBorder}"></div>
        </div>
        <div style="font-size:13px;font-weight:400;color:${countColor};min-width:20px;text-align:right">${count}</div>
      </div>
    `;
  }).join("");

  const flagComparison = `
    <div style="margin-top:48px">
      <div class="label" style="margin-bottom:16px">Red Flag Count</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${flagBars}
      </div>
    </div>
  `;

  const body = `
    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:40px">
      <div>
        <div class="label" style="margin-bottom:8px">
          <a href="/" style="color:var(--text-mute)">Dashboard</a> / ${esc(clientSlug)}
        </div>
        <h1>Competitive <em>comparison</em></h1>
      </div>
    </div>

    <!-- Win/Loss Summary -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:48px">
      <div style="padding:20px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;text-align:center">
        <div style="font-size:32px;font-family:var(--serif);color:var(--green);margin-bottom:4px">${wins}</div>
        <div style="font-family:var(--label);font-size:10px;text-transform:uppercase;letter-spacing:.15em;color:var(--text-faint)">Outperforming</div>
      </div>
      <div style="padding:20px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;text-align:center">
        <div style="font-size:32px;font-family:var(--serif);color:var(--text-faint);margin-bottom:4px">${ties}</div>
        <div style="font-family:var(--label);font-size:10px;text-transform:uppercase;letter-spacing:.15em;color:var(--text-faint)">Tied</div>
      </div>
      <div style="padding:20px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;text-align:center">
        <div style="font-size:32px;font-family:var(--serif);color:var(--red);margin-bottom:4px">${losses}</div>
        <div style="font-family:var(--label);font-size:10px;text-transform:uppercase;letter-spacing:.15em;color:var(--text-faint)">Behind</div>
      </div>
    </div>

    ${advantages.length > 0 || gaps.length > 0 ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:48px">
      ${advantages.length > 0 ? `
        <div style="padding:16px 20px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
          <div class="label" style="margin-bottom:12px;color:var(--green)">Your Advantages</div>
          <div style="font-size:13px;color:var(--text-soft);line-height:1.8">
            Schema types you have that no competitor does:<br>
            ${advantages.map(a => `<span style="display:inline-block;padding:2px 8px;margin:2px 4px 2px 0;font-size:11px;font-family:var(--label);text-transform:uppercase;letter-spacing:.1em;color:var(--green);border:1px solid var(--green);border-radius:2px">${esc(a)}</span>`).join("")}
          </div>
        </div>
      ` : ''}
      ${gaps.length > 0 ? `
        <div style="padding:16px 20px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
          <div class="label" style="margin-bottom:12px;color:var(--red)">Gaps to Close</div>
          <div style="font-size:13px;color:var(--text-soft);line-height:1.8">
            Schema types competitors have that you don't:<br>
            ${gaps.map(g => `<span style="display:inline-block;padding:2px 8px;margin:2px 4px 2px 0;font-size:11px;font-family:var(--label);text-transform:uppercase;letter-spacing:.1em;color:var(--red);border:1px solid var(--red);border-radius:2px">${esc(g)}</span>`).join("")}
          </div>
        </div>
      ` : ''}
    </div>
    ` : ''}

    <!-- Score Comparison -->
    <div style="margin-bottom:48px">
      <div class="label" style="margin-bottom:16px">AEO Score Comparison</div>
      <div style="background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;padding:16px 20px">
        ${scoreChart}
      </div>
    </div>

    ${schemaMatrix}
    ${flagComparison}
  `;

  return html(layout("Competitors", body, user));
}
