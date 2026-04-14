/**
 * Dashboard — Competitive comparison view
 *
 * Shows client's domain(s) side-by-side with competitor domains,
 * comparing AEO scores, grades, schema coverage, and red flags.
 */

import type { Env, User, Domain, ScanResult, CitationSnapshot } from "../types";
import { layout, html, esc } from "../render";

interface ComparisonRow {
  domain: Domain;
  scan: ScanResult | null;
  schemaTypes: string[];
  redFlagCount: number;
}

function buildCompetitorNarrative(
  primaryScore: number,
  wins: number,
  losses: number,
  ties: number,
  totalCompetitors: number,
  advantages: string[],
  gaps: string[]
): string {
  const parts: string[] = [];

  if (primaryScore === 0) {
    parts.push("Your site has not been scanned yet, so there is no score to compare. Once a scan runs, this page will show how your AEO readiness compares to the competitors being tracked.");
    return esc(parts.join(" "));
  }

  if (wins === totalCompetitors && totalCompetitors > 0) {
    parts.push("You are outperforming every tracked competitor on AEO readiness. That is a strong position, but scores shift as competitors improve their structured data and content.");
  } else if (losses === totalCompetitors && totalCompetitors > 0) {
    parts.push("Every tracked competitor currently scores higher on AEO readiness. The gap is closable. The schema comparison and red flag breakdown below show exactly where to focus.");
  } else if (losses > wins) {
    parts.push("More competitors are scoring above you than below. The score comparison chart shows the gap, and the schema matrix reveals the specific markup and signals you are missing that they have.");
  } else if (wins > losses) {
    parts.push("You are ahead of most tracked competitors, which means AI engines are more likely to see your site as a credible source. Maintaining this lead requires monitoring for when competitors close their gaps.");
  } else {
    parts.push("The field is tight. You and your competitors have similar AEO readiness scores, so small improvements in schema coverage or content quality can shift the competitive balance.");
  }

  if (gaps.length > 0) {
    parts.push("The schema comparison below highlights " + gaps.length + " schema type" + (gaps.length > 1 ? "s" : "") + " that competitors have and you do not. These are the highest-leverage items to add.");
  }
  if (advantages.length > 0) {
    parts.push("You have " + advantages.length + " schema type" + (advantages.length > 1 ? "s" : "") + " that no competitor has implemented yet. That is a defensible advantage worth protecting.");
  }

  return esc(parts.join(" "));
}

export async function handleCompetitors(clientSlug: string, user: User, env: Env): Promise<Response> {
  // Access check: client can only see their own slug
  if (user.role === "client" && user.client_slug !== clientSlug) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }

  // Get all domains for this client (primary + competitors)
  const domains = (await env.DB.prepare(
    "SELECT * FROM domains WHERE client_slug = ? AND active = 1 ORDER BY is_competitor, domain"
  ).bind(clientSlug).all<Domain>()).results;

  if (domains.length === 0) {
    return html(layout("Competitors", `<div class="empty"><h3>No domains found</h3></div>`, user, clientSlug), 404);
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

  // If no competitors yet, show helpful empty state
  if (competitors.length === 0) {
    const pendingSuggestions = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM competitor_suggestions WHERE client_slug = ? AND status = 'pending'"
    ).bind(clientSlug).first<{ count: number }>();
    const pendingCount = pendingSuggestions?.count || 0;

    const emptyMessage = pendingCount > 0
      ? `<p style="color:var(--text-faint);font-size:14px;line-height:1.7;max-width:440px;margin:0 auto 24px">You submitted ${pendingCount} competitor${pendingCount > 1 ? 's' : ''} for review. We are setting them up and will run initial scans shortly. Check back soon.</p>`
      : `<p style="color:var(--text-faint);font-size:14px;line-height:1.7;max-width:440px;margin:0 auto 24px">No competitors are being tracked yet. Add competitors during onboarding or ask your account manager to set them up.</p>`;

    return html(layout("Competitors", `      <div style="margin-bottom:40px">
        <div class="label" style="margin-bottom:8px">Dashboard / ${esc(clientSlug)}</div>
        <h1>Competitor <em>comparison</em></h1>
      </div>
      <div class="empty">
        <h3>Competitors coming soon</h3>
        ${emptyMessage}
      </div>
    `, user, clientSlug));
  }

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

    <!-- Context -->
    <div class="narrative-context" style="margin-bottom:32px">
      ${buildCompetitorNarrative(primaryScore, wins, losses, ties, competitors.length, advantages, gaps)}
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
    ${await buildCitationComparison(clientSlug, primary, competitors, env)}
  `;

  return html(layout("Competitors", body, user, clientSlug));
}

/** Build the AI citation comparison section */
async function buildCitationComparison(
  clientSlug: string,
  primary: ComparisonRow[],
  competitors: ComparisonRow[],
  env: Env
): Promise<string> {
  // Get latest citation snapshot
  const snapshot = await env.DB.prepare(
    "SELECT * FROM citation_snapshots WHERE client_slug = ? ORDER BY week_start DESC LIMIT 1"
  ).bind(clientSlug).first<CitationSnapshot>();

  if (!snapshot) return "";

  const topCompetitors: { name: string; count: number }[] = JSON.parse(snapshot.top_competitors || "[]");
  if (topCompetitors.length === 0 && snapshot.client_citations === 0) return "";

  // Build the comparison data: client + top cited competitors
  const clientDomain = primary[0]?.domain.domain || clientSlug;
  const totalQueries = snapshot.total_queries;
  const clientCitations = snapshot.client_citations;
  const clientPct = totalQueries > 0 ? Math.round((clientCitations / totalQueries) * 100) : 0;

  // Build ranked list: client + competitors sorted by citation count
  interface CitationEntry { name: string; count: number; pct: number; isClient: boolean }
  const entries: CitationEntry[] = [];
  entries.push({ name: clientDomain, count: clientCitations, pct: clientPct, isClient: true });

  for (const c of topCompetitors.slice(0, 8)) {
    const pct = totalQueries > 0 ? Math.round((c.count / totalQueries) * 100) : 0;
    entries.push({ name: c.name, count: c.count, pct, isClient: false });
  }

  // Sort by count descending
  entries.sort((a, b) => b.count - a.count);

  const maxCount = Math.max(...entries.map(e => e.count), 1);

  // Build bars
  const bars = entries.map(e => {
    const barPct = (e.count / maxCount) * 100;
    const nameColor = e.isClient ? "color:var(--gold)" : "color:var(--text-faint)";
    const barBg = e.isClient ? "var(--gold-wash)" : "rgba(251,248,239,.06)";
    const barBorder = e.isClient ? "var(--gold)" : "rgba(251,248,239,.15)";
    const youTag = e.isClient ? ' <span style="font-family:var(--label);font-size:7px;letter-spacing:.1em;color:var(--gold);border:1px solid var(--gold-dim);padding:0 4px;border-radius:2px;vertical-align:middle">YOU</span>' : '';

    return '<div style="display:grid;grid-template-columns:260px 1fr auto;gap:16px;align-items:center;padding:8px 0;border-bottom:1px solid rgba(251,248,239,.06)">' +
      '<div style="font-size:12px;' + nameColor + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(e.name) + youTag + '</div>' +
      '<div style="position:relative;height:22px;background:rgba(251,248,239,.04);border-radius:3px;overflow:hidden">' +
      '<div style="position:absolute;left:0;top:0;bottom:0;width:' + barPct + '%;background:' + barBg + ';border-right:2px solid ' + barBorder + '"></div>' +
      '<div style="position:relative;padding:0 10px;line-height:22px;font-size:11px;color:var(--text-soft)">' + e.count + ' citations (' + e.pct + '%)</div>' +
      '</div>' +
      '<div style="font-size:13px;color:var(--text-faint);min-width:32px;text-align:right">' + e.pct + '%</div>' +
      '</div>';
  }).join("");

  // Engine breakdown if available
  let engineBreakdown = "";
  if (snapshot.engines_breakdown) {
    try {
      const engines: { engine: string; total: number; client_cited: number }[] = JSON.parse(snapshot.engines_breakdown);
      if (engines.length > 0) {
        const engineRows = engines.map(e => {
          const pct = e.total > 0 ? Math.round((e.client_cited / e.total) * 100) : 0;
          const engineLabel = e.engine === "perplexity" ? "Perplexity" : e.engine === "chatgpt" ? "ChatGPT" : e.engine === "gemini" ? "Gemini" : e.engine === "anthropic" ? "Claude" : e.engine;
          return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(251,248,239,.06)">' +
            '<div style="font-size:13px;color:var(--text-soft)">' + esc(engineLabel) + '</div>' +
            '<div style="display:flex;align-items:center;gap:12px">' +
            '<div style="width:80px;height:6px;background:rgba(251,248,239,.06);border-radius:3px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:var(--gold);border-radius:3px"></div></div>' +
            '<div style="font-size:12px;color:var(--text-faint);min-width:60px;text-align:right">' + e.client_cited + '/' + e.total + ' (' + pct + '%)</div>' +
            '</div></div>';
        }).join("");

        engineBreakdown = '<div style="margin-top:24px">' +
          '<div style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);margin-bottom:12px">Your citation rate by engine</div>' +
          engineRows + '</div>';
      }
    } catch {}
  }

  // Client ranking insight
  const clientRank = entries.findIndex(e => e.isClient) + 1;
  const totalEntries = entries.length;
  let rankInsight = "";
  if (clientRank === 1) {
    rankInsight = '<div style="margin-top:16px;padding:12px 16px;background:rgba(94,199,106,0.06);border:1px solid rgba(94,199,106,0.15);border-radius:4px;font-size:13px;color:var(--text-soft)">You are the most-cited source across your tracked keywords. AI engines reference you more than any competitor.</div>';
  } else if (clientRank <= 3 && totalEntries > 3) {
    rankInsight = '<div style="margin-top:16px;padding:12px 16px;background:rgba(232,199,103,0.06);border:1px solid rgba(232,199,103,0.15);border-radius:4px;font-size:13px;color:var(--text-soft)">You rank #' + clientRank + ' in AI citations among tracked competitors. Closing the gap means improving the content signals the top-cited sources have that you do not.</div>';
  } else if (entries.length > 1) {
    rankInsight = '<div style="margin-top:16px;padding:12px 16px;background:rgba(232,84,84,0.06);border:1px solid rgba(232,84,84,0.15);border-radius:4px;font-size:13px;color:var(--text-soft)">You rank #' + clientRank + ' of ' + totalEntries + ' in AI citations. The competitive gap is an opportunity. Improving schema coverage, content authority, and AEO fundamentals will move your citation share upward.</div>';
  }

  return `
    <div style="margin-top:48px">
      <div class="label" style="margin-bottom:4px">AI Citation Share</div>
      <div style="font-size:12px;color:var(--text-faint);margin-bottom:16px">Who gets cited when AI engines answer questions about your industry (${totalQueries} tracked queries)</div>
      <div style="background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;padding:16px 20px">
        ${bars}
        ${engineBreakdown}
        ${rankInsight}
      </div>
    </div>
  `;
}
