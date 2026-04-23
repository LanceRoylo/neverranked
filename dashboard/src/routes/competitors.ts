/**
 * Dashboard — Competitive comparison view
 *
 * Shows client's domain(s) side-by-side with competitor domains,
 * comparing AEO scores, grades, schema coverage, and red flags.
 */

import type { Env, User, Domain, ScanResult, CitationSnapshot } from "../types";
import { layout, html, redirect, esc } from "../render";
import { scanDomain } from "../scanner";
import { canAccessClient } from "../agency";
import { validateCompetitorSuggestion } from "../competitor-sanity";
import { logAutomation } from "../automation";
import { buildGlossary } from "../glossary";

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
  // Access check: admins see all, agency admins see their agency's clients,
  // clients see only their own slug.
  if (!(await canAccessClient(env, user, clientSlug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }

  // Get all domains for this client (primary + competitors).
  // Order: primary first (is_competitor = 0), then competitors by the
  // user's drag-and-drop order (sort_order), with domain as a tiebreaker
  // for rows that haven't been explicitly reordered yet (new competitors
  // land with sort_order = max + 1, so ties only happen for the initial
  // seed or concurrent inserts).
  const domains = (await env.DB.prepare(
    "SELECT * FROM domains WHERE client_slug = ? AND active = 1 ORDER BY is_competitor, sort_order, domain"
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

  // If no competitors yet, show helpful empty state with add form
  if (competitors.length === 0) {
    return html(layout("Competitors", `
      <div style="margin-bottom:40px">
        <div class="label" style="margin-bottom:8px">Dashboard / ${esc(clientSlug)}</div>
        <h1>Competitive <em>comparison</em></h1>
      </div>
      <div class="empty-hero">
        <div class="empty-hero-eyebrow">Benchmark your visibility</div>
        <h2 class="empty-hero-title">Add the sites you lose business to.</h2>
        <p class="empty-hero-body">Once you add competitor domains, we scan them on the same weekly Monday schedule as your own site. You'll see side-by-side AEO scores, citation share, schema coverage, and score trends over time. Start with the two or three sites you lose business to most often &mdash; the comparison gets more useful with each addition.</p>
        <div class="empty-hero-actions">
          <a href="#add-competitor-form" class="btn">Add your first competitor &rarr;</a>
        </div>
      </div>
      <div id="add-competitor-form">${buildAddCompetitorForm(clientSlug)}</div>
    `, user, clientSlug));
  }

  // Gather score history for trend chart (last 8 scans per domain)
  interface TrendPoint { date: number; score: number }
  const trendData = new Map<number, { domain: Domain; points: TrendPoint[] }>();
  for (const d of domains) {
    const scans = (await env.DB.prepare(
      "SELECT aeo_score, scanned_at FROM scan_results WHERE domain_id = ? AND error IS NULL ORDER BY scanned_at DESC LIMIT 8"
    ).bind(d.id).all<{ aeo_score: number; scanned_at: number }>()).results;
    if (scans.length >= 2) {
      trendData.set(d.id, {
        domain: d,
        points: scans.map(s => ({ date: s.scanned_at, score: s.aeo_score })).reverse(),
      });
    }
  }

  // Collect all schema types across all domains
  const allSchemaTypes = new Set<string>();
  rows.forEach(r => r.schemaTypes.forEach(t => allSchemaTypes.add(t)));
  const schemaColumns = [...allSchemaTypes].sort();

  // Build comparison bars
  const maxScore = 100;
  const barColor = (score: number) =>
    score >= 80 ? "var(--green)" : score >= 60 ? "var(--yellow)" : "var(--red)";

  // Score comparison chart. The primary (YOU) row is pinned at the top
  // and is NOT draggable. Competitor rows are reorderable via native
  // HTML5 drag-and-drop; the handle (::) on the left owns the drag.
  // On drop, the inline script POSTs the new order to /competitors/
  // {slug}/reorder. If the POST fails the page is reloaded so the user
  // sees the server-authoritative order instead of stale local state.
  //
  // Grid columns change between the primary and competitor rows so the
  // drag handle lines up with (but does not displace) the domain text.
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

    // Drag handle: only competitors get a functional grip. The primary
    // row keeps a spacer cell so grid columns align across all rows.
    // Using a 2x3 dot grid (standard "grip dots" pattern) in a 20px
    // column so the handle is an obvious affordance and easy to grab
    // without being visually loud. draggable="true" lives on the
    // HANDLE only (not the row) so grabbing the score bar, domain
    // label, or grade does not accidentally start a drag.
    const handle = isPrimary
      ? '<div style="width:20px" aria-hidden="true"></div>'
      : '<div class="drag-handle" draggable="true" style="width:20px;display:grid;grid-template-columns:4px 4px;grid-auto-rows:4px;justify-content:center;align-content:center;gap:3px;color:var(--text-faint);cursor:grab;user-select:none;padding:4px 0;opacity:.55;transition:opacity .15s var(--ease)" title="Drag to reorder" aria-label="Drag to reorder">'
      + '<span style="width:4px;height:4px;border-radius:50%;background:currentColor"></span>'
      + '<span style="width:4px;height:4px;border-radius:50%;background:currentColor"></span>'
      + '<span style="width:4px;height:4px;border-radius:50%;background:currentColor"></span>'
      + '<span style="width:4px;height:4px;border-radius:50%;background:currentColor"></span>'
      + '<span style="width:4px;height:4px;border-radius:50%;background:currentColor"></span>'
      + '<span style="width:4px;height:4px;border-radius:50%;background:currentColor"></span>'
      + '</div>';

    // data-domain-id stays on the row (the script reads it to build the
    // reorder payload). draggable moved to the handle above.
    const rowAttrs = isPrimary ? "" : ` data-domain-id="${r.domain.id}"`;
    const rowClass = isPrimary ? "score-row score-row-primary" : "score-row score-row-competitor";

    return `
      <div class="${rowClass}"${rowAttrs} style="display:grid;grid-template-columns:20px 240px 1fr auto;gap:16px;align-items:center;padding:12px 0;border-bottom:1px solid rgba(251,248,239,.06);transition:background .15s var(--ease)">
        ${handle}
        <div style="font-size:13px;${isPrimary ? 'color:var(--gold);font-weight:400' : 'color:var(--text-faint)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(label)}">${esc(label)}${tag}</div>
        <div style="position:relative;height:28px;background:rgba(251,248,239,.04);border-radius:3px;overflow:hidden">
          <div style="position:absolute;left:0;top:0;bottom:0;width:${pct}%;background:${isPrimary ? 'var(--gold-wash)' : 'rgba(251,248,239,.06)'};border-right:2px solid ${isPrimary ? 'var(--gold)' : barColor(score)};transition:width .3s var(--ease)"></div>
          <div style="position:relative;padding:0 12px;line-height:28px;font-size:12px;color:var(--text-soft)">${score}/100</div>
        </div>
        <div class="grade grade-${grade}" style="width:32px;height:32px;font-size:16px;flex-shrink:0">${grade}</div>
      </div>
    `;
  }).join("");

  // Hint: only show the reorder hint when the user actually has
  // multiple competitors -- single-competitor lists have nothing to
  // reorder, and showing a hint there would be clutter.
  const reorderHint = competitors.length >= 2
    ? `<div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:8px;font-family:var(--mono);font-size:10px;color:var(--text-faint);letter-spacing:.05em">
         <span>Drag rows to reorder</span>
       </div>`
    : "";

  // Inline reorder script. Native HTML5 DnD so there's no extra bundle.
  // Drop indicator uses box-shadow (no layout shift) instead of
  // border-top so rows don't jump as the user drags across them.
  // Using dragenter for highlight + dragover only to preventDefault
  // is more stable than driving highlight off dragover directly,
  // which fires many times per second and can cause flicker.
  //
  // On drop we optimistically reorder in the DOM, POST the new order,
  // and reload on failure so the user sees the server-authoritative
  // order. Keyboard a11y (arrow keys on a focused row) is a TODO v2.
  const reorderScript = competitors.length >= 2 ? `
    <script>
      (function() {
        var container = document.querySelector('[data-reorder-container]');
        if (!container) return;
        var dragEl = null;
        var DROP_BEFORE = 'inset 0 2px 0 0 var(--gold)';
        var DROP_AFTER  = 'inset 0 -2px 0 0 var(--gold)';

        function getRow(el) {
          while (el && el !== container) {
            if (el.classList && el.classList.contains('score-row-competitor')) return el;
            el = el.parentNode;
          }
          return null;
        }

        function clearHighlights() {
          container.querySelectorAll('.score-row-competitor').forEach(function(r) {
            r.style.boxShadow = '';
          });
        }

        container.addEventListener('dragstart', function(e) {
          var row = getRow(e.target);
          if (!row) return;
          dragEl = row;
          row.style.opacity = '0.45';
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            // Firefox requires setData() to actually start a drag.
            try { e.dataTransfer.setData('text/plain', row.getAttribute('data-domain-id') || ''); } catch (_) {}
          }
        });

        container.addEventListener('dragend', function() {
          if (dragEl) dragEl.style.opacity = '';
          clearHighlights();
          dragEl = null;
        });

        // dragover must preventDefault for drop to fire. We also refresh
        // the top/bottom highlight here so it tracks the cursor even if
        // the mouse moves within a single row (top half -> bottom half).
        container.addEventListener('dragover', function(e) {
          if (!dragEl) return;
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
          var target = getRow(e.target);
          if (!target || target === dragEl) { clearHighlights(); return; }
          var rect = target.getBoundingClientRect();
          var before = e.clientY < rect.top + rect.height / 2;
          clearHighlights();
          target.style.boxShadow = before ? DROP_BEFORE : DROP_AFTER;
        });

        // dragleave only clears when we're leaving the container entirely
        // (not when moving between rows inside it).
        container.addEventListener('dragleave', function(e) {
          if (e.target === container || !container.contains(e.relatedTarget)) {
            clearHighlights();
          }
        });

        container.addEventListener('drop', function(e) {
          if (!dragEl) return;
          e.preventDefault();
          var target = getRow(e.target);
          clearHighlights();
          if (target && target !== dragEl) {
            var rect = target.getBoundingClientRect();
            var before = e.clientY < rect.top + rect.height / 2;
            target.parentNode.insertBefore(dragEl, before ? target : target.nextSibling);
            persistOrder();
          }
        });

        function persistOrder() {
          var ids = [];
          container.querySelectorAll('.score-row-competitor').forEach(function(r) {
            var id = r.getAttribute('data-domain-id');
            if (id) ids.push(Number(id));
          });
          fetch(${JSON.stringify(`/competitors/${clientSlug}/reorder`)}, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order: ids }),
            credentials: 'same-origin'
          }).then(function(res) {
            if (!res.ok) window.location.reload();
          }).catch(function() { window.location.reload(); });
        }
      })();
    </script>
  ` : "";

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
      <div data-reorder-container style="background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;padding:16px 20px">
        ${scoreChart}
      </div>
      ${reorderHint}
    </div>
    ${reorderScript}

    ${buildTrendChart(trendData)}

    ${schemaMatrix}
    ${flagComparison}
    ${await buildCitationComparison(clientSlug, primary, competitors, env)}
    ${user.role === "admin" ? await buildCompetitorDiscovery(clientSlug, allRows, env) : ""}

    <!-- Add / manage competitors -->
    ${buildAddCompetitorForm(clientSlug)}
    ${buildManageCompetitors(competitors, clientSlug)}
    ${buildGlossary()}
  `;

  return html(layout("Competitors", body, user, clientSlug));
}

/** Build SVG trend chart showing score over time for all domains */
function buildTrendChart(trendData: Map<number, { domain: Domain; points: { date: number; score: number }[] }>): string {
  if (trendData.size === 0) return "";

  const W = 640;
  const H = 260;
  const PAD_L = 40;
  const PAD_R = 20;
  const PAD_T = 20;
  const PAD_B = 36;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  // Collect all dates and find range
  let minDate = Infinity;
  let maxDate = -Infinity;
  for (const { points } of trendData.values()) {
    for (const p of points) {
      if (p.date < minDate) minDate = p.date;
      if (p.date > maxDate) maxDate = p.date;
    }
  }
  const dateRange = maxDate - minDate || 1;

  const x = (ts: number) => PAD_L + ((ts - minDate) / dateRange) * chartW;
  const y = (score: number) => PAD_T + chartH - (score / 100) * chartH;

  // Competitor line colors (muted palette)
  const compColors = ["rgba(251,248,239,.35)", "rgba(180,170,150,.4)", "rgba(150,165,175,.4)", "rgba(170,155,140,.35)", "rgba(145,160,150,.35)", "rgba(160,150,170,.35)"];
  let colorIdx = 0;

  // Grid lines at 0, 25, 50, 75, 100
  const gridLines = [0, 25, 50, 75, 100].map(v => {
    const yy = y(v);
    return `<line x1="${PAD_L}" x2="${W - PAD_R}" y1="${yy}" y2="${yy}" stroke="rgba(251,248,239,.06)" stroke-width="1"/>` +
      `<text x="${PAD_L - 8}" y="${yy + 4}" text-anchor="end" fill="rgba(251,248,239,.3)" font-size="10" font-family="var(--mono)">${v}</text>`;
  }).join("");

  // Date labels (first and last)
  const fmtDate = (ts: number) => new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const dateLabels = `
    <text x="${PAD_L}" y="${H - 4}" fill="rgba(251,248,239,.3)" font-size="10" font-family="var(--mono)">${fmtDate(minDate)}</text>
    <text x="${W - PAD_R}" y="${H - 4}" text-anchor="end" fill="rgba(251,248,239,.3)" font-size="10" font-family="var(--mono)">${fmtDate(maxDate)}</text>
  `;

  // Lines + dots
  const lines: string[] = [];
  const legendItems: string[] = [];

  for (const [, { domain: d, points }] of trendData) {
    const isPrimary = !d.is_competitor;
    const color = isPrimary ? "var(--gold)" : compColors[colorIdx++ % compColors.length];
    const strokeW = isPrimary ? "2.5" : "1.5";
    const opacity = isPrimary ? "1" : "0.8";

    const pathPoints = points.map(p => `${x(p.date).toFixed(1)},${y(p.score).toFixed(1)}`);
    const pathD = "M" + pathPoints.join("L");
    lines.push(`<path d="${pathD}" fill="none" stroke="${color}" stroke-width="${strokeW}" opacity="${opacity}" stroke-linejoin="round" stroke-linecap="round"/>`);

    // End dot
    const last = points[points.length - 1];
    const dotR = isPrimary ? "4" : "3";
    lines.push(`<circle cx="${x(last.date).toFixed(1)}" cy="${y(last.score).toFixed(1)}" r="${dotR}" fill="${color}" opacity="${opacity}"/>`);

    // Legend
    const label = isPrimary ? d.domain : (d.competitor_label || d.domain);
    const tag = isPrimary ? ' <span style="font-family:var(--label);font-size:7px;letter-spacing:.1em;color:var(--gold);border:1px solid var(--gold-dim);padding:0 4px;border-radius:2px;vertical-align:middle">YOU</span>' : '';
    legendItems.push(
      `<span style="display:inline-flex;align-items:center;gap:6px;margin-right:16px;margin-bottom:4px">` +
      `<span style="display:inline-block;width:16px;height:2px;background:${color};border-radius:1px${isPrimary ? '' : ';opacity:.7'}"></span>` +
      `<span style="font-size:11px;color:${isPrimary ? 'var(--gold)' : 'var(--text-faint)'}">${esc(label)}${tag}</span>` +
      `</span>`
    );
  }

  return `
    <div style="margin-bottom:48px">
      <div class="label" style="margin-bottom:4px">Score Trend</div>
      <div style="font-size:12px;color:var(--text-faint);margin-bottom:16px">AEO readiness over time across all tracked domains</div>
      <div style="background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;padding:20px">
        <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block">
          ${gridLines}
          ${dateLabels}
          ${lines.join("")}
        </svg>
        <div style="display:flex;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid rgba(251,248,239,.06)">
          ${legendItems.join("")}
        </div>
      </div>
    </div>
  `;
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

/** Inline form to add a competitor */
function buildAddCompetitorForm(clientSlug: string): string {
  return `
    <div style="margin-top:48px">
      <div class="label" style="margin-bottom:12px">Add a competitor</div>
      <form method="POST" action="/competitors/${esc(clientSlug)}/add" style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
        <div class="form-group" style="margin-bottom:0;flex:1;min-width:180px">
          <label>Domain</label>
          <input type="text" name="domain" placeholder="competitor.com" required style="width:100%">
        </div>
        <div class="form-group" style="margin-bottom:0;flex:1;min-width:140px">
          <label>Label (optional)</label>
          <input type="text" name="label" placeholder="Main competitor, etc.">
        </div>
        <button type="submit" class="btn" style="margin-bottom:0;white-space:nowrap">Add competitor</button>
      </form>
      <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint);margin-top:8px">
        We'll run an initial scan immediately. Weekly scans follow the same schedule as your site.
      </div>
    </div>
  `;
}

/** List of current competitors with remove option */
function buildManageCompetitors(competitors: ComparisonRow[], clientSlug: string): string {
  if (competitors.length === 0) return "";

  const rows = competitors.map(c => {
    const label = c.domain.competitor_label ? ` <span style="color:var(--text-faint)">(${esc(c.domain.competitor_label)})</span>` : '';
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(251,248,239,.06)">
        <span style="font-size:13px;color:var(--text)">${esc(c.domain.domain)}${label}</span>
        <form method="POST" action="/competitors/${esc(clientSlug)}/remove" style="display:inline">
          <input type="hidden" name="domain_id" value="${c.domain.id}">
          <button type="submit" style="font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint);background:none;border:1px solid var(--line);padding:4px 10px;border-radius:2px;cursor:pointer;transition:color .2s,border-color .2s" onmouseover="this.style.color='var(--red)';this.style.borderColor='var(--red)'" onmouseout="this.style.color='var(--text-faint)';this.style.borderColor='var(--line)'">Remove</button>
        </form>
      </div>
    `;
  }).join("");

  return `
    <div style="margin-top:24px">
      <div class="label" style="margin-bottom:12px">Tracked competitors</div>
      <div style="background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;padding:8px 20px">
        ${rows}
      </div>
    </div>
  `;
}

/** Handle POST to add a new competitor from the competitors page */
export async function handleAddCompetitorFromPage(
  clientSlug: string,
  request: Request,
  user: User,
  env: Env
): Promise<Response> {
  // Access check
  if (!(await canAccessClient(env, user, clientSlug))) {
    return redirect("/competitors");
  }

  const form = await request.formData();
  const domain = (form.get("domain") as string || "").trim().toLowerCase()
    .replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  const label = (form.get("label") as string || "").trim() || null;

  if (!domain || domain.length < 3 || !domain.includes(".")) {
    return redirect(`/competitors/${clientSlug}`);
  }

  const now = Math.floor(Date.now() / 1000);

  // Check if already tracked
  const existing = await env.DB.prepare(
    "SELECT id FROM domains WHERE domain = ? AND client_slug = ? AND is_competitor = 1"
  ).bind(domain, clientSlug).first();

  // Sanity-check the proposed competitor. If any gate fails, route the
  // suggestion to status='pending' so the admin sees it in the cockpit
  // instead of silently tracking garbage. Auto-approval only happens
  // when every gate passes.
  const sanity = await validateCompetitorSuggestion(env, clientSlug, domain);
  if (!existing && !sanity.ok) {
    try {
      await env.DB.prepare(
        "INSERT INTO competitor_suggestions (client_slug, suggested_by, domain, label, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)"
      ).bind(clientSlug, user.id, domain, label, now).run();
      await env.DB.prepare(
        "INSERT INTO admin_alerts (client_slug, type, title, detail, created_at) VALUES (?, 'needs_review', ?, ?, ?)"
      ).bind(
        clientSlug,
        `Competitor suggestion needs review: ${domain}`,
        `Auto-add blocked. Reason: ${sanity.reason}`,
        now,
      ).run();
    } catch { /* duplicate suggestion is fine */ }
    return redirect(`/competitors/${clientSlug}`);
  }

  if (!existing) {
    // Figure out the current max sort_order among this client's
    // competitors so the new row lands at the bottom of the list
    // instead of the top. Defensive coalesce to 0 for the first add.
    const maxOrder = await env.DB.prepare(
      "SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM domains WHERE client_slug = ? AND is_competitor = 1"
    ).bind(clientSlug).first<{ max_order: number }>();
    const nextOrder = (maxOrder?.max_order || 0) + 1;

    // Add domain
    await env.DB.prepare(
      "INSERT INTO domains (client_slug, domain, is_competitor, competitor_label, active, sort_order, created_at, updated_at) VALUES (?, ?, 1, ?, 1, ?, ?, ?)"
    ).bind(clientSlug, domain, label, nextOrder, now, now).run();

    // Record as suggestion for audit trail
    try {
      await env.DB.prepare(
        "INSERT INTO competitor_suggestions (client_slug, suggested_by, domain, label, status, created_at) VALUES (?, ?, ?, ?, 'approved', ?)"
      ).bind(clientSlug, user.id, domain, label, now).run();
    } catch {
      // Duplicate suggestion, fine
    }

    // Automation log: auto-approved competitor additions show up in the
    // cockpit's automation log so admins can see what the system did
    // without being asked to approve it each time.
    try {
      await logAutomation(env, {
        kind: "auto_competitor_add",
        targetType: "client",
        targetSlug: clientSlug,
        reason: `Auto-approved competitor suggestion: ${domain}${label ? " (" + label + ")" : ""}`,
        detail: { domain, label, suggested_by: user.id },
      });
    } catch { /* non-fatal */ }

    // Trigger initial scan
    const newDomain = await env.DB.prepare(
      "SELECT id FROM domains WHERE domain = ? AND client_slug = ? AND is_competitor = 1"
    ).bind(domain, clientSlug).first<{ id: number }>();
    if (newDomain) {
      try {
        await scanDomain(newDomain.id, `https://${domain}/`, "manual", env);
      } catch (e) {
        console.log(`Competitor scan failed for ${domain}: ${e}`);
      }
    }
  }

  return redirect(`/competitors/${clientSlug}`);
}

/**
 * Handle POST /competitors/:slug/reorder with JSON body { order: [id, id, ...] }.
 *
 * We accept the client's proposed order, but only apply sort_order to
 * rows that actually match (client_slug AND is_competitor = 1 AND active
 * = 1 AND id IN the payload). That means a malicious or stale payload
 * can't touch rows from another client or bring a soft-deleted row
 * back to life. Rows not in the payload keep their existing sort_order.
 *
 * Returns JSON { ok: true } on success so the client's fetch can
 * distinguish real success from a 2xx-with-redirect auth bounce.
 */
export async function handleReorderCompetitors(
  clientSlug: string,
  request: Request,
  user: User,
  env: Env
): Promise<Response> {
  // Access check: same rules as the GET page. A user who can't see the
  // comparison can't reorder it.
  if (!(await canAccessClient(env, user, clientSlug))) {
    return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: { order?: unknown } = {};
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "invalid json" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const raw = Array.isArray(payload.order) ? payload.order : [];
  // Coerce and de-dupe. Anything non-numeric or <= 0 is dropped.
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const v of raw) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0 && !seen.has(n)) {
      seen.add(n);
      ids.push(n);
    }
  }
  if (ids.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: "empty order" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Cap the payload so a pathological client can't DOS us. 200 competitors
  // per client is already far beyond any real usage.
  if (ids.length > 200) {
    return new Response(JSON.stringify({ ok: false, error: "too many ids" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Build a single batched update. Each statement scopes to client_slug
  // AND is_competitor = 1 so cross-client or primary-row writes are
  // impossible even if someone forges ids in the payload.
  const stmts = ids.map((id, index) =>
    env.DB.prepare(
      "UPDATE domains SET sort_order = ?, updated_at = ? WHERE id = ? AND client_slug = ? AND is_competitor = 1 AND active = 1"
    ).bind(index + 1, Math.floor(Date.now() / 1000), id, clientSlug)
  );
  await env.DB.batch(stmts);

  return new Response(JSON.stringify({ ok: true, count: ids.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** Handle POST to remove a competitor */
export async function handleRemoveCompetitorFromPage(
  clientSlug: string,
  request: Request,
  user: User,
  env: Env
): Promise<Response> {
  // Access check
  if (!(await canAccessClient(env, user, clientSlug))) {
    return redirect("/competitors");
  }

  const form = await request.formData();
  const domainId = Number(form.get("domain_id") || 0);

  if (domainId > 0) {
    // Verify it belongs to this client and is a competitor
    await env.DB.prepare(
      "UPDATE domains SET active = 0 WHERE id = ? AND client_slug = ? AND is_competitor = 1"
    ).bind(domainId, clientSlug).run();
  }

  return redirect(`/competitors/${clientSlug}`);
}

/** Discover potential competitors from citation data */
async function buildCompetitorDiscovery(
  clientSlug: string,
  trackedRows: ComparisonRow[],
  env: Env
): Promise<string> {
  // Get the latest citation snapshot's top_competitors
  const snapshot = await env.DB.prepare(
    "SELECT top_competitors FROM citation_snapshots WHERE client_slug = ? ORDER BY week_start DESC LIMIT 1"
  ).bind(clientSlug).first<{ top_competitors: string }>();

  if (!snapshot) return "";

  const topCompetitors: { name: string; count: number }[] = JSON.parse(snapshot.top_competitors || "[]");
  if (topCompetitors.length === 0) return "";

  // Get already-tracked competitor domains
  const trackedDomains = new Set(trackedRows.map(r => r.domain.domain.toLowerCase().replace(/^www\./, "")));
  // Also add common variations
  trackedRows.forEach(r => {
    const d = r.domain.domain.toLowerCase();
    trackedDomains.add(d);
    trackedDomains.add(d.replace(/^www\./, ""));
    trackedDomains.add("www." + d.replace(/^www\./, ""));
  });

  // Filter: find cited entities NOT already tracked
  const suggestions = topCompetitors
    .filter(c => {
      const name = c.name.toLowerCase().trim();
      // Skip if it matches any tracked domain
      for (const td of trackedDomains) {
        if (name.includes(td) || td.includes(name)) return false;
      }
      // Skip very generic or short names
      if (name.length < 4) return false;
      return true;
    })
    .slice(0, 6);

  if (suggestions.length === 0) return "";

  const rows = suggestions.map(s => {
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(251,248,239,.06)">' +
      '<div style="font-size:13px;color:var(--text)">' + esc(s.name) + '</div>' +
      '<div style="display:flex;align-items:center;gap:12px">' +
      '<span style="font-size:12px;color:var(--text-faint)">' + s.count + ' citations</span>' +
      '</div></div>';
  }).join("");

  return `
    <div style="margin-top:48px">
      <div class="label" style="margin-bottom:4px">Discovered Competitors</div>
      <div style="font-size:12px;color:var(--text-faint);margin-bottom:16px">These brands appear frequently in AI responses for your tracked keywords but are not yet being monitored. Consider adding them as competitors.</div>
      <div style="background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;padding:16px 20px">
        ${rows}
      </div>
    </div>
  `;
}
