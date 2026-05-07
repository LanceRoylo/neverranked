/**
 * Activity Feed — visible record of work the system did on the
 * customer's behalf without them lifting a finger. Reinforces the
 * "system pulse" frame: the dashboard is always reporting in, never
 * standing still.
 *
 * Per-client by default. Admin scope (when user.real_role === 'admin')
 * aggregates across every active client and tags the slug.
 *
 * Sources unioned in time order:
 *   - scan_results          → "AEO scan complete · score 64 (+2)"
 *   - roadmap_items (auto)  → "Auto-resolved · BreadcrumbList schema"
 *   - citation_runs (cited) → "Cited by Perplexity · query about X"
 *   - referrer_hits         → "Bot crawl · Anthropic ClaudeBot"
 *
 * All four signal types only render when there's actual data; an empty
 * feed shows a "first events landing soon" placeholder rather than
 * nothing.
 */

import type { Env, User } from "./types";
import { esc } from "./render";

export interface ActivityEvent {
  ts: number;          // unix seconds
  kind: "scan" | "auto_resolved" | "citation" | "bot";
  label: string;       // primary line, plain text
  detail?: string;     // optional secondary line
  href?: string;       // optional link target
  slug?: string;       // tagged for admin scope
}

interface ScanRow { scanned_at: number; aeo_score: number; domain: string; client_slug: string; prev_score: number | null; }
interface ResolvedRow { completed_at: number; title: string; client_slug: string; }
interface CitationRow { run_at: number; engine: string; keyword: string; client_slug: string; }
interface BotRow { hit_at: number; engine: string; client_slug: string; }

function timeAgo(ts: number, nowSec: number): string {
  const diff = Math.max(0, nowSec - ts);
  const m = Math.floor(diff / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}d ago`;
  if (h >= 1) return `${h}h ago`;
  if (m >= 1) return `${m}m ago`;
  return "just now";
}

export async function getActivityFeed(user: User, env: Env, limit = 10): Promise<ActivityEvent[]> {
  // Effective scope (mirrors computePulse):
  //  - Admin, not previewing, no slug context → platform-wide
  //  - Admin previewing a specific slug page  → that slug
  //  - Otherwise                              → user.client_slug
  const isPreview = !!user._viewAsClient;
  const isPlatformAdmin = user.role === "admin" && !isPreview && !user._contextSlug;
  const slug = isPlatformAdmin ? null : (user._contextSlug || user.client_slug);
  const scopeBySlug = !!slug;

  const events: ActivityEvent[] = [];
  const sinceCutoff = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 14; // 14 days

  // --- Scans ---
  try {
    const scanQ = scopeBySlug
      ? `SELECT sr.scanned_at, sr.aeo_score, d.domain, d.client_slug
         FROM scan_results sr JOIN domains d ON sr.domain_id = d.id
         WHERE d.client_slug = ? AND d.is_competitor = 0 AND sr.scanned_at >= ? AND sr.error IS NULL
         ORDER BY sr.scanned_at DESC LIMIT 6`
      : `SELECT sr.scanned_at, sr.aeo_score, d.domain, d.client_slug
         FROM scan_results sr JOIN domains d ON sr.domain_id = d.id
         WHERE d.is_competitor = 0 AND sr.scanned_at >= ? AND sr.error IS NULL
         ORDER BY sr.scanned_at DESC LIMIT 6`;
    const stmt = scopeBySlug
      ? env.DB.prepare(scanQ).bind(slug, sinceCutoff)
      : env.DB.prepare(scanQ).bind(sinceCutoff);
    const rows = (await stmt.all<ScanRow>()).results || [];
    for (const r of rows) {
      events.push({
        ts: r.scanned_at,
        kind: "scan",
        label: `AEO scan complete · score ${r.aeo_score}/100`,
        detail: r.domain,
        slug: r.client_slug,
        href: `/summary${scopeBySlug ? "" : "/" + r.client_slug}`,
      });
    }
  } catch { /* table or column missing -- skip silently */ }

  // --- Auto-resolved roadmap items ---
  try {
    const q = scopeBySlug
      ? `SELECT completed_at, title, client_slug FROM roadmap_items
         WHERE client_slug = ? AND status = 'done' AND completed_at >= ? AND completed_by IN ('scan','snippet')
         ORDER BY completed_at DESC LIMIT 6`
      : `SELECT completed_at, title, client_slug FROM roadmap_items
         WHERE status = 'done' AND completed_at >= ? AND completed_by IN ('scan','snippet')
         ORDER BY completed_at DESC LIMIT 6`;
    const stmt = scopeBySlug
      ? env.DB.prepare(q).bind(slug, sinceCutoff)
      : env.DB.prepare(q).bind(sinceCutoff);
    const rows = (await stmt.all<ResolvedRow>()).results || [];
    for (const r of rows) {
      events.push({
        ts: r.completed_at,
        kind: "auto_resolved",
        label: `Auto-resolved · ${r.title}`,
        slug: r.client_slug,
        href: `/roadmap${scopeBySlug ? "" : "/" + r.client_slug}`,
      });
    }
  } catch { /* skip */ }

  // --- Citations (only when client was actually cited) ---
  try {
    const q = scopeBySlug
      ? `SELECT cr.run_at, cr.engine, ck.keyword, ck.client_slug
         FROM citation_runs cr JOIN citation_keywords ck ON cr.keyword_id = ck.id
         WHERE ck.client_slug = ? AND cr.client_cited = 1 AND cr.run_at >= ?
         ORDER BY cr.run_at DESC LIMIT 6`
      : `SELECT cr.run_at, cr.engine, ck.keyword, ck.client_slug
         FROM citation_runs cr JOIN citation_keywords ck ON cr.keyword_id = ck.id
         WHERE cr.client_cited = 1 AND cr.run_at >= ?
         ORDER BY cr.run_at DESC LIMIT 6`;
    const stmt = scopeBySlug
      ? env.DB.prepare(q).bind(slug, sinceCutoff)
      : env.DB.prepare(q).bind(sinceCutoff);
    const rows = (await stmt.all<CitationRow>()).results || [];
    for (const r of rows) {
      events.push({
        ts: r.run_at,
        kind: "citation",
        label: `Cited by ${r.engine}`,
        detail: `query: "${r.keyword}"`,
        slug: r.client_slug,
        href: `/citations${scopeBySlug ? "" : "/" + r.client_slug}`,
      });
    }
  } catch { /* skip */ }

  // --- Bot crawls ---
  try {
    const q = scopeBySlug
      ? `SELECT hit_at, engine, client_slug FROM referrer_hits
         WHERE client_slug = ? AND hit_at >= ?
         ORDER BY hit_at DESC LIMIT 6`
      : `SELECT hit_at, engine, client_slug FROM referrer_hits
         WHERE hit_at >= ?
         ORDER BY hit_at DESC LIMIT 6`;
    const stmt = scopeBySlug
      ? env.DB.prepare(q).bind(slug, sinceCutoff)
      : env.DB.prepare(q).bind(sinceCutoff);
    const rows = (await stmt.all<BotRow>()).results || [];
    for (const r of rows) {
      events.push({
        ts: r.hit_at,
        kind: "bot",
        label: `Bot crawl · ${r.engine}`,
        slug: r.client_slug,
        href: `/bots${scopeBySlug ? "" : "/" + r.client_slug}`,
      });
    }
  } catch { /* skip */ }

  // Sort merged events newest first, slice to limit.
  events.sort((a, b) => b.ts - a.ts);
  return events.slice(0, limit);
}

export function renderActivityFeed(events: ActivityEvent[], opts: { admin: boolean }): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const dot = (kind: ActivityEvent["kind"]): string => {
    const color =
      kind === "scan" ? "var(--green)" :
      kind === "auto_resolved" ? "var(--gold)" :
      kind === "citation" ? "#6db4d6" :
      "var(--text-faint)";
    return `<span style="display:inline-block;width:6px;height:6px;background:${color};border-radius:50%;flex-shrink:0;margin-top:7px"></span>`;
  };

  if (events.length === 0) {
    return `
      <section style="margin-bottom:32px;padding:20px 24px;background:var(--bg-edge);border:1px solid var(--line);border-radius:4px">
        <div class="label" style="margin-bottom:10px">Recent activity</div>
        <div style="font-size:12px;color:var(--text-faint);line-height:1.6">
          The system is monitoring. First events ${opts.admin ? 'across the platform' : 'for your account'} will land here as scans, citations, and bot crawls happen — usually within 24 hours of activation.
        </div>
      </section>`;
  }

  const rows = events.map(e => {
    const ago = timeAgo(e.ts, nowSec);
    const inner = `
      <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0">
        ${dot(e.kind)}
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;color:var(--text);line-height:1.45">
            ${esc(e.label)}${opts.admin && e.slug ? ` <span style="color:var(--text-faint);font-family:var(--label);font-size:10px;letter-spacing:.08em;margin-left:4px">${esc(e.slug)}</span>` : ''}
          </div>
          ${e.detail ? `<div style="font-size:11px;color:var(--text-faint);margin-top:2px">${esc(e.detail)}</div>` : ''}
        </div>
        <div style="flex-shrink:0;font-family:var(--label);font-size:10px;letter-spacing:.08em;color:var(--text-faint);padding-top:2px">${esc(ago)}</div>
      </div>`;
    return e.href
      ? `<a href="${esc(e.href)}" style="display:block;text-decoration:none;color:inherit;border-bottom:1px solid var(--line-soft, rgba(255,255,255,.04))">${inner}</a>`
      : `<div style="border-bottom:1px solid var(--line-soft, rgba(255,255,255,.04))">${inner}</div>`;
  }).join("");

  return `
    <section style="margin-bottom:32px;padding:20px 24px;background:var(--bg-edge);border:1px solid var(--line);border-radius:4px">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px;gap:12px;flex-wrap:wrap">
        <div class="label">Recent activity${opts.admin ? ' · platform-wide' : ''}</div>
        <div style="font-size:10px;color:var(--text-faint);font-family:var(--label);letter-spacing:.08em">${events.length} event${events.length === 1 ? '' : 's'} · last 14 days</div>
      </div>
      <div>${rows}</div>
    </section>`;
}
