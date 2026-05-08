/**
 * Citation-gap panel for the dashboard.
 *
 * Wraps the pure analyzer in tools/citation-gap (cross-imported via
 * tsconfig include + allowJs) with D1-fed data plumbing. The CLI
 * (scripts/citation-gap-scan.mjs) reads citation_runs by shelling out
 * to wrangler. This module does the same query directly against
 * env.DB and feeds the same analyzer.
 *
 * Renders inline as a section in handleCitations -- complementary
 * to the existing competitor matrix (which uses cited_entities).
 * Where the matrix asks "who's beating you," this panel asks "where
 * are you missing" by source type (Wikipedia, TripAdvisor, news,
 * Google Business Profile, etc.).
 */

import type { Env } from "./types";
// @ts-ignore -- cross-imported .mjs; allowJs in tsconfig but no .d.ts
import { analyzeCitationGaps } from "../../tools/citation-gap/src/analyze.mjs";
// @ts-ignore
import { generateSourceBrief, renderSourceBriefMarkdown } from "../../tools/citation-gap/src/brief.mjs";
import { esc } from "./render";

interface CitationRunRow {
  client_slug: string;
  keyword: string;
  engine: string;
  client_cited: number;
  cited_urls: string;
  run_at: number;
}

interface SourceRow {
  domain: string;
  source_type: string;
  source_label: string;
  action: string;
  total_runs: number;
  unique_urls: number;
  engines: string[];
  keywords: string[];
  client_named_runs: number;
  client_named_ratio: number;
  is_client_owned: boolean;
  gap_score: number;
  example_urls: string[];
}

interface GapReport {
  client_slug: string;
  summary: {
    total_runs: number;
    total_runs_naming_client: number;
    runs_naming_client_ratio: number;
    unique_sources: number;
    sources_with_meaningful_gap: number;
    top_keywords: { keyword: string; runs: number }[];
  };
  sources: SourceRow[];
  sources_with_gap: SourceRow[];
}

/**
 * Pull the last `windowDays` of citation_runs for a client and run
 * the gap analyzer. Returns null if there's no data to render.
 */
export async function buildCitationGapReport(
  slug: string,
  clientDomains: string[],
  env: Env,
  windowDays = 90,
): Promise<GapReport | null> {
  const cutoffSec = Math.floor(Date.now() / 1000) - windowDays * 86400;
  const rows = (
    await env.DB.prepare(
      `SELECT ck.client_slug, ck.keyword, cr.engine, cr.client_cited, cr.cited_urls, cr.run_at
       FROM citation_runs cr
       JOIN citation_keywords ck ON cr.keyword_id = ck.id
       WHERE ck.client_slug = ?
         AND cr.run_at >= ?
         AND cr.cited_urls IS NOT NULL
         AND cr.cited_urls != '[]'
       ORDER BY cr.run_at DESC`
    )
      .bind(slug, cutoffSec)
      .all<CitationRunRow>()
  ).results;

  if (rows.length === 0) return null;

  const report = analyzeCitationGaps(rows, {
    slug,
    domains: clientDomains,
  }) as GapReport;
  return report;
}

/**
 * Render the gap panel as a section block matching the existing
 * citations-page styling. Fits between the competitor matrix and
 * content recommendations in handleCitations.
 *
 * Returns empty string when there's no actionable gap to show; the
 * caller can drop it into the body without conditional logic.
 */
export function renderCitationGapPanel(report: GapReport | null, opts: { briefLimit?: number } = {}): string {
  if (!report) return "";
  const { summary, sources, sources_with_gap } = report;

  // No gaps with meaningful signal: render a brief positive note
  // rather than a panel full of "0 gaps" text.
  if (sources_with_gap.length === 0) {
    return `
      <div style="margin-bottom:28px;padding:20px 24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
        <div class="label" style="margin-bottom:8px;color:var(--gold)">§ Source coverage</div>
        <div style="font-size:12.5px;color:var(--text-soft);line-height:1.6">
          Across the last 90 days, AI engines cited ${summary.unique_sources} source domain${summary.unique_sources === 1 ? '' : 's'} for your tracked queries. You appear in ${summary.total_runs_naming_client} of ${summary.total_runs} runs (${Math.round(summary.runs_naming_client_ratio * 100)}%). No source-level gaps cross the action threshold.
        </div>
      </div>
    `;
  }

  const briefLimit = opts.briefLimit ?? 5;
  const topGapSources = sources_with_gap.slice(0, briefLimit);

  // Inline briefs for the top N gap sources. Each is a collapsible
  // <details> using the existing pattern from the citations page.
  const briefBlocks = topGapSources.map((src) => {
    const brief = generateSourceBrief(src, { slug: report.client_slug, domains: [] });
    const md = renderSourceBriefMarkdown(brief);
    // Convert the markdown to inline HTML for rendering in the panel.
    // This is a simple converter -- bold + bullets + paragraphs only,
    // matching what the brief generator emits.
    const html = mdLiteToHtml(md);
    return `
      <details style="margin-bottom:10px;border:1px solid var(--line);border-radius:3px;background:var(--bg)">
        <summary style="cursor:pointer;padding:10px 14px;font-size:12px;color:var(--text);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <span><strong style="color:var(--text)">${esc(src.source_label)}</strong> &middot; <span style="color:var(--text-faint)">${esc(src.domain)}</span></span>
          <span style="font-family:var(--mono);font-size:10px;color:var(--text-faint)">cited ${src.total_runs}x &middot; named in ${src.client_named_runs} (${Math.round(src.client_named_ratio * 100)}%) &middot; gap ${src.gap_score.toFixed(2)}</span>
        </summary>
        <div style="padding:12px 16px;border-top:1px solid var(--line);font-size:12px;color:var(--text-soft);line-height:1.65">
          ${html}
        </div>
      </details>
    `;
  }).join("");

  // Full source table (collapsed by default). Renders every cited
  // source domain so the gap panel doesn't hide signal.
  const tableRows = sources.map((s) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid var(--line)">${esc(s.domain)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid var(--line);font-family:var(--mono);font-size:10px;color:var(--text-faint)">${esc(s.source_type)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid var(--line);text-align:right;font-family:var(--mono);font-size:10px">${s.total_runs}</td>
      <td style="padding:6px 10px;border-bottom:1px solid var(--line);text-align:right;font-family:var(--mono);font-size:10px">${s.client_named_runs} (${Math.round(s.client_named_ratio * 100)}%)</td>
      <td style="padding:6px 10px;border-bottom:1px solid var(--line);text-align:right;font-family:var(--mono);font-size:10px;${s.gap_score >= 0.6 ? 'color:var(--red)' : s.gap_score >= 0.3 ? 'color:var(--gold)' : 'color:var(--text-faint)'}">${s.gap_score.toFixed(2)}</td>
    </tr>
  `).join("");

  return `
    <div style="margin-bottom:28px;padding:20px 24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:12px;flex-wrap:wrap">
        <div class="label" style="color:var(--gold)">§ Source-level gaps (where AI pulls from, and where you're missing)</div>
        <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint)">${summary.unique_sources} sources &middot; ${summary.sources_with_meaningful_gap} with action</div>
      </div>

      <div style="font-size:12px;color:var(--text-mute);line-height:1.7;max-width:780px;margin-bottom:14px;padding:10px 14px;background:var(--bg);border-left:2px solid var(--gold-dim);border-radius:0 2px 2px 0">
        <strong style="color:var(--text);font-weight:500">How to read this.</strong> The competitor matrix above shows who AI engines NAME in their answers. This panel shows the SOURCES (Wikipedia, TripAdvisor, news sites, Google Business Profile) AI engines cite as their references for your category. <strong style="color:var(--text);font-weight:500">Gap score</strong> is 0.0 to 1.0: red (>= 0.6) means the source cites your category but not you, gold (0.3 to 0.6) means partial coverage. Each gap has a source-appropriate action below.
      </div>

      <div style="font-size:12.5px;color:var(--text-soft);line-height:1.7;max-width:780px;margin-bottom:18px">
        Across the last 90 days, AI engines cited ${summary.unique_sources} source domain${summary.unique_sources === 1 ? '' : 's'} for your tracked queries. You appear in ${summary.total_runs_naming_client} of ${summary.total_runs} runs (${Math.round(summary.runs_naming_client_ratio * 100)}%). The sources below cite your category but not you, or cite you only weakly.
      </div>

      <div style="margin-bottom:16px">${briefBlocks}</div>

      <details style="margin-top:14px">
        <summary style="cursor:pointer;font-size:11px;color:var(--text-faint);font-family:var(--label);letter-spacing:.1em;text-transform:uppercase">All cited sources (full table)</summary>
        <table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:11px">
          <thead>
            <tr style="text-align:left">
              <th style="padding:6px 10px;font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint);border-bottom:1px solid var(--line)">Domain</th>
              <th style="padding:6px 10px;font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint);border-bottom:1px solid var(--line)">Type</th>
              <th style="padding:6px 10px;font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint);border-bottom:1px solid var(--line);text-align:right">Runs</th>
              <th style="padding:6px 10px;font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint);border-bottom:1px solid var(--line);text-align:right">Named</th>
              <th style="padding:6px 10px;font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint);border-bottom:1px solid var(--line);text-align:right">Gap</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </details>
    </div>
  `;
}

/**
 * Tiny markdown-to-HTML converter that handles the exact subset
 * renderSourceBriefMarkdown emits: ### heading, **bold**, bullet
 * lists, paragraphs. Not a general parser. This avoids pulling in
 * a markdown library for a single panel.
 *
 * Exported for testing. The full panel uses it internally; it's
 * also useful in isolation when adding new brief shapes.
 */
export function mdLiteToHtml(md: string): string {
  // Drop the leading ### heading -- the panel summary already shows it.
  const noHeading = md.replace(/^###[^\n]*\n+/, "");
  const lines = noHeading.split("\n");
  const out: string[] = [];
  let inList = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("- ")) {
      if (!inList) { out.push("<ul style='margin:6px 0;padding-left:20px'>"); inList = true; }
      out.push(`<li style='margin-bottom:4px'>${formatInline(line.slice(2))}</li>`);
    } else {
      if (inList) { out.push("</ul>"); inList = false; }
      const trimmed = line.trim();
      if (!trimmed) continue;
      out.push(`<p style='margin:8px 0'>${formatInline(trimmed)}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

function formatInline(s: string): string {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, '<code style="background:var(--bg-edge);padding:1px 4px;border-radius:2px;font-family:var(--mono);font-size:11px">$1</code>');
}
