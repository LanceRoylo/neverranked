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

// ---------------------------------------------------------------------
// Auto-roadmap from citation gaps
//
// Bridges the citation-gap analyzer to the roadmap_items table: each
// meaningful gap becomes a roadmap action item with the source brief
// embedded in the description. Subsequent runs dedupe (no duplicates
// for an open item) and auto-complete (when the gap closes, mark the
// item done with completed_by='citation_gap').
// ---------------------------------------------------------------------

/** Per-source-type title + category mapping. Title is intentionally
 *  stable so dedup-by-title works across runs. */
const SOURCE_ROADMAP_TEMPLATES: Record<string, { title: string; category: string }> = {
  wikipedia:              { title: "Update Wikipedia entity entry",                category: "authority" },
  tripadvisor:            { title: "Increase TripAdvisor review density",          category: "authority" },
  "google-maps":          { title: "Complete Google Business Profile",             category: "authority" },
  yelp:                   { title: "Claim and enrich Yelp listing",                category: "authority" },
  reddit:                 { title: "Seed reddit recommendation thread",            category: "content" },
  youtube:                { title: "Build YouTube category presence",              category: "content" },
  news:                   { title: "Distribute press release",                     category: "authority" },
  directory:              { title: "Claim directory listing with consistent NAP",  category: "authority" },
  social:                 { title: "Publish canonical bio on social",              category: "authority" },
  "review-aggregator":    { title: "Claim review-aggregator listing",              category: "authority" },
  "industry-publication": { title: "Pitch industry publication coverage",          category: "content" },
  other:                  { title: "Investigate unclassified citation source",     category: "custom" },
};

const ROADMAP_REFRESH_SOURCE = "citation_gap";

/** Encode the source domain in the description as a human-visible
 *  audit-trail line. The dedup + auto-resolve lookup uses the
 *  dedicated source_domain column on roadmap_items (migration 0071),
 *  not this tag. Tag is kept in description so practitioners reading
 *  the roadmap can see at a glance which citation gap drove the item.
 */
function encodeSourceTag(domain: string): string {
  return `\n\n[gap-source: ${domain}]`;
}

interface GapRoadmapDraft {
  client_slug: string;
  title: string;
  description: string;
  category: string;
  refresh_source: string;
  source_domain: string; // not persisted directly; encoded in description
}

/** Convert a single gap source into a roadmap item draft. Pure
 *  function -- no I/O. */
export function gapToRoadmapItem(slug: string, source: SourceRow): GapRoadmapDraft {
  const tpl = SOURCE_ROADMAP_TEMPLATES[source.source_type] || SOURCE_ROADMAP_TEMPLATES.other;
  const evidenceLine = `Cited ${source.total_runs}x across ${source.engines.join(", ")}, named in ${source.client_named_runs} (${Math.round(source.client_named_ratio * 100)}%). Gap score: ${source.gap_score.toFixed(2)}.`;
  const description = `${evidenceLine}\n\n**Action:** ${source.action}\n\n**Source:** ${source.source_label} (${source.domain})${encodeSourceTag(source.domain)}`;
  return {
    client_slug: slug,
    title: tpl.title,
    description,
    category: tpl.category,
    refresh_source: ROADMAP_REFRESH_SOURCE,
    source_domain: source.domain,
  };
}

/** Sync a client's citation-gap-sourced roadmap items against the
 *  current gap report:
 *
 *    - For each gap source not already represented by an open roadmap
 *      item, INSERT a new item (refresh_source = 'citation_gap').
 *    - For each existing citation-gap-sourced open item whose source
 *      domain is no longer in the current gap set, mark it done with
 *      completed_by = 'citation_gap'.
 *
 *  Returns counts for logging. Idempotent: running twice in quick
 *  succession produces zero churn.
 */
export async function syncRoadmapItemsFromGaps(
  slug: string,
  clientDomains: string[],
  env: Env,
): Promise<{ inserted: number; resolved: number }> {
  const report = await buildCitationGapReport(slug, clientDomains, env, 90);
  if (!report) return { inserted: 0, resolved: 0 };

  // Current open roadmap items sourced from citation-gap. Uses the
  // dedicated source_domain column (migration 0071) so the dedup +
  // auto-resolve lookup is robust against any user edit to the
  // description field.
  const openItems = (await env.DB.prepare(
    `SELECT id, title, source_domain FROM roadmap_items
     WHERE client_slug = ? AND status != 'done' AND refresh_source = ? AND source_domain IS NOT NULL`
  ).bind(slug, ROADMAP_REFRESH_SOURCE).all<{ id: number; title: string; source_domain: string }>()).results;

  // Map open items by source_domain for fast lookup.
  const openByDomain = new Map<string, { id: number; title: string }>();
  for (const it of openItems) {
    if (it.source_domain) openByDomain.set(it.source_domain, { id: it.id, title: it.title });
  }

  // Domains present in the current gap report.
  const gapDomains = new Set(report.sources_with_gap.map((s) => s.domain));

  const now = Math.floor(Date.now() / 1000);

  // INSERT new items for any gap source not already represented.
  const drafts = report.sources_with_gap
    .filter((s) => !openByDomain.has(s.domain))
    .map((s) => gapToRoadmapItem(slug, s));

  if (drafts.length > 0) {
    const insertStmts = drafts.map((d) =>
      env.DB.prepare(
        `INSERT INTO roadmap_items
         (client_slug, title, description, category, status, sort_order, created_at, updated_at, refresh_source, source_domain)
         VALUES (?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?)`
      ).bind(d.client_slug, d.title, d.description, d.category, now, now, d.refresh_source, d.source_domain)
    );
    await env.DB.batch(insertStmts);
  }

  // RESOLVE: any open citation-gap item whose source is no longer in
  // the current gap set means the underlying gap closed. Mark done.
  const toResolve: { id: number; title: string }[] = [];
  for (const [domain, info] of openByDomain.entries()) {
    if (!gapDomains.has(domain)) toResolve.push(info);
  }

  if (toResolve.length > 0) {
    const updateStmts = toResolve.map((t) =>
      env.DB.prepare(
        `UPDATE roadmap_items SET status = 'done', completed_at = ?, updated_at = ?,
         completed_by = ? WHERE id = ?`
      ).bind(now, now, ROADMAP_REFRESH_SOURCE, t.id)
    );
    await env.DB.batch(updateStmts);
  }

  return { inserted: drafts.length, resolved: toResolve.length };
}


// ===========================================================================
// Source-type rollup — strategic view above the domain-level gap panel
// ===========================================================================
//
// The existing GapReport.sources is per-domain (TripAdvisor, hawaiitheatre.com,
// reddit.com/r/hawaii). The rollup below aggregates by source TYPE so the
// buyer reads the strategic shape: "Reddit + Wikipedia + news are your three
// biggest content categories to attack." Feeds the auto-generated content
// roadmap and the per-client report's "what to ship next" line.
//
// Rolling up to source-type loses domain-level specificity (which the
// existing panel keeps). The two views are complementary, not competing.
// ===========================================================================

export interface SourceTypeAgg {
  source_type: string;
  source_label: string;
  action: string;
  domains_count: number;       // how many unique domains in this type
  total_mentions: number;      // sum of total_runs across domains in this type
  client_named_mentions: number;
  client_named_ratio: number;  // 0..1
  avg_gap_score: number;       // weighted by total_runs
  top_domain: string;          // domain with most mentions in this type
  top_domain_runs: number;
}

export interface SourceTypeRollup {
  total_mentions: number;
  total_named: number;
  named_ratio: number;
  types: SourceTypeAgg[];           // sorted by total_mentions DESC
  primary_gap: SourceTypeAgg | null; // highest avg_gap_score with signal
  next_action: string | null;
}

export function buildSourceTypeRollup(report: GapReport | null): SourceTypeRollup | null {
  if (!report) return null;
  const sources = report.sources.filter((s) => !s.is_client_owned && s.source_type !== "other");
  if (sources.length === 0) return null;

  const byType = new Map<string, {
    label: string;
    action: string;
    domains: Map<string, number>;
    total_mentions: number;
    client_named: number;
    weighted_gap_sum: number;
  }>();

  for (const s of sources) {
    let agg = byType.get(s.source_type);
    if (!agg) {
      agg = {
        label: s.source_label,
        action: s.action,
        domains: new Map(),
        total_mentions: 0,
        client_named: 0,
        weighted_gap_sum: 0,
      };
      byType.set(s.source_type, agg);
    }
    agg.domains.set(s.domain, s.total_runs);
    agg.total_mentions += s.total_runs;
    agg.client_named += s.client_named_runs;
    agg.weighted_gap_sum += s.gap_score * s.total_runs;
  }

  const types: SourceTypeAgg[] = [];
  for (const [source_type, a] of byType) {
    const top = [...a.domains.entries()].sort((x, y) => y[1] - x[1])[0];
    types.push({
      source_type,
      source_label: a.label,
      action: a.action,
      domains_count: a.domains.size,
      total_mentions: a.total_mentions,
      client_named_mentions: a.client_named,
      client_named_ratio: a.total_mentions > 0 ? a.client_named / a.total_mentions : 0,
      avg_gap_score: a.total_mentions > 0 ? a.weighted_gap_sum / a.total_mentions : 0,
      top_domain: top ? top[0] : "",
      top_domain_runs: top ? top[1] : 0,
    });
  }

  types.sort((x, y) => y.total_mentions - x.total_mentions);

  const total_mentions = types.reduce((s, t) => s + t.total_mentions, 0);
  const total_named = types.reduce((s, t) => s + t.client_named_mentions, 0);
  const named_ratio = total_mentions > 0 ? total_named / total_mentions : 0;

  // Primary gap: highest weighted gap_score among types with enough signal
  // (10+ mentions). If nothing crosses 10 mentions, take the strongest gap
  // we have. Caller decides whether to render the next-action line.
  const candidates = types.filter((t) => t.total_mentions >= 10);
  const pool = candidates.length > 0 ? candidates : types;
  const primary = [...pool].sort((x, y) => y.avg_gap_score - x.avg_gap_score)[0] || null;

  const next_action = primary && primary.avg_gap_score >= 0.3
    ? `${primary.source_label} is the biggest open content surface in your category. Engines cited ${primary.source_label.toLowerCase()} ${primary.total_mentions} times across ${primary.domains_count} ${primary.domains_count === 1 ? "domain" : "domains"} in this window. You appear in ${primary.client_named_mentions} (${Math.round(primary.client_named_ratio * 100)}%). The action is "${primary.action}" — start with ${primary.top_domain || "the highest-volume domain in this type"}.`
    : null;

  return {
    total_mentions,
    total_named,
    named_ratio,
    types,
    primary_gap: primary,
    next_action,
  };
}

/** Render the source-type rollup as a panel above the existing
 *  domain-level gap panel. Designed to read in 8 seconds. */
export function renderSourceTypeRollupPanel(rollup: SourceTypeRollup | null): string {
  if (!rollup) return "";
  if (rollup.types.length === 0) return "";

  const rows = rollup.types.slice(0, 8).map((t) => {
    const namedPct = Math.round(t.client_named_ratio * 100);
    const gapColor = t.avg_gap_score >= 0.6 ? "var(--red)" : t.avg_gap_score >= 0.3 ? "var(--gold)" : "var(--text-faint)";
    return `
      <tr style="border-bottom:1px solid var(--line)">
        <td style="padding:10px 8px"><span style="color:var(--text-soft);font-weight:500">${escHtml(t.source_label)}</span><div style="font-size:10.5px;color:var(--text-faint);font-family:var(--mono);margin-top:2px">top: ${escHtml(t.top_domain || "—")} (${t.top_domain_runs})</div></td>
        <td style="text-align:right;padding:10px 8px;font-family:var(--mono);font-size:12px;color:var(--text-soft)">${t.total_mentions}</td>
        <td style="text-align:right;padding:10px 8px;font-family:var(--mono);font-size:12px;color:var(--text-soft)">${t.domains_count}</td>
        <td style="text-align:right;padding:10px 8px;font-family:var(--mono);font-size:12px;color:${t.client_named_ratio >= 0.5 ? "#7fc99a" : t.client_named_ratio > 0 ? "var(--text-soft)" : "var(--text-faint)"}">${namedPct}%<span style="font-size:10.5px;color:var(--text-faint);margin-left:4px">(${t.client_named_mentions})</span></td>
        <td style="text-align:right;padding:10px 8px;font-family:var(--mono);font-size:12px;color:${gapColor}">${t.avg_gap_score.toFixed(2)}</td>
      </tr>
    `;
  }).join("");

  return `
    <div style="margin-bottom:28px;padding:20px 24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:12px;flex-wrap:wrap">
        <div class="label" style="color:var(--gold)">§ Source types — where AI engines pull from, by category</div>
        <div style="font-family:var(--mono);font-size:11px;color:var(--text-faint)">${rollup.types.length} types · ${rollup.total_mentions} mentions · you appear in ${Math.round(rollup.named_ratio * 100)}%</div>
      </div>

      <div style="font-size:12px;color:var(--text-mute);line-height:1.6;max-width:780px;margin-bottom:14px">
        Strategic view above the domain table. Each row is a category of source AI engines pull from in your vertical (Wikipedia, Reddit, news, review aggregators, etc.). Lets you read the content roadmap at a category level before drilling into specific domains below.
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead>
          <tr style="border-bottom:1px solid var(--line)">
            <th style="text-align:left;padding:10px 8px;font-family:var(--label);text-transform:uppercase;letter-spacing:0.15em;font-size:10px;color:var(--text-faint);font-weight:500">Source type</th>
            <th style="text-align:right;padding:10px 8px;font-family:var(--label);text-transform:uppercase;letter-spacing:0.15em;font-size:10px;color:var(--text-faint);font-weight:500">Mentions</th>
            <th style="text-align:right;padding:10px 8px;font-family:var(--label);text-transform:uppercase;letter-spacing:0.15em;font-size:10px;color:var(--text-faint);font-weight:500">Domains</th>
            <th style="text-align:right;padding:10px 8px;font-family:var(--label);text-transform:uppercase;letter-spacing:0.15em;font-size:10px;color:var(--text-faint);font-weight:500">You named</th>
            <th style="text-align:right;padding:10px 8px;font-family:var(--label);text-transform:uppercase;letter-spacing:0.15em;font-size:10px;color:var(--text-faint);font-weight:500">Avg gap</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      ${rollup.next_action ? `
        <div style="margin-top:16px;padding-top:14px;border-top:1px dashed var(--line);font-size:12.5px;color:var(--text-soft);line-height:1.65">
          <span style="color:var(--gold);font-family:var(--mono);font-size:10px;letter-spacing:0.1em;text-transform:uppercase;margin-right:8px">Next action</span>${escHtml(rollup.next_action)}
        </div>
      ` : ""}
    </div>
  `;
}

function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c] as string));
}
