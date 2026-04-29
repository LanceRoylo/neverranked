/**
 * Dashboard -- /benchmark/<slug>
 *
 * Phase 6A: Industry benchmark surface. Shows the client's latest
 * AEO score + citation share against their industry's quartile
 * profile. Hides anything where sample_size < 5 (set in the rollup
 * recompute) so we never quote a percentile against 2-3 clients.
 */

import type { Env, User } from "../types";
import { layout, html, esc } from "../render";
import { canAccessClient } from "../agency";
import { getBenchmark, percentileFor, citationPercentileFor } from "../industry-benchmarks";

export async function handleBenchmark(clientSlug: string, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }

  // Industry assignment lives on client_settings.industry. If null,
  // we show an admin-prompt empty state.
  const settings = await env.DB.prepare(
    "SELECT industry FROM client_settings WHERE client_slug = ?"
  ).bind(clientSlug).first<{ industry: string | null }>();

  const industry = settings?.industry || null;

  if (!industry) {
    return html(layout("Industry benchmark", `
      <div style="margin-bottom:32px">
        <div class="label" style="margin-bottom:8px">Dashboard / ${esc(clientSlug)}</div>
        <h1>Industry <em>benchmark</em></h1>
      </div>
      <div class="empty-hero">
        <div class="empty-hero-eyebrow">No industry assigned</div>
        <h2 class="empty-hero-title">An admin needs to tag this client with an industry before benchmarks can render.</h2>
        <p class="empty-hero-body">Industry tags are kept manual on purpose -- LLM-based auto-classification on websites is too noisy to trust on a number that ends up in client decks. Once tagged in the admin panel, this page populates from the next nightly rollup (industries with n&lt;5 clients are hidden until the pool grows).</p>
      </div>
    `, user, clientSlug));
  }

  const snap = await getBenchmark(industry, env);

  // Latest client values
  const scan = await env.DB.prepare(
    `SELECT sr.aeo_score, sr.scanned_at, sr.schema_coverage FROM scan_results sr
       JOIN domains d ON d.id = sr.domain_id
       WHERE d.client_slug = ? AND d.is_competitor = 0 AND sr.error IS NULL
       ORDER BY sr.scanned_at DESC LIMIT 1`
  ).bind(clientSlug).first<{ aeo_score: number; scanned_at: number; schema_coverage: string }>();

  const csSnap = await env.DB.prepare(
    `SELECT citation_share, week_start FROM citation_snapshots WHERE client_slug = ? ORDER BY week_start DESC LIMIT 1`
  ).bind(clientSlug).first<{ citation_share: number; week_start: number }>();

  if (!snap) {
    return html(layout("Industry benchmark", `
      <div style="margin-bottom:32px">
        <div class="label" style="margin-bottom:8px">Dashboard / ${esc(clientSlug)}</div>
        <h1>Industry <em>benchmark</em></h1>
        <p style="color:var(--text-muted)">Industry: <strong>${esc(industry)}</strong></p>
      </div>
      <div class="empty-hero">
        <div class="empty-hero-eyebrow">Sample size too small</div>
        <h2 class="empty-hero-title">We need at least 5 clients in the &ldquo;${esc(industry)}&rdquo; pool before we can render percentiles.</h2>
        <p class="empty-hero-body">Showing a percentile against fewer than 5 peers is misleading. As more clients are tagged into this industry, this page will start populating automatically on the nightly rollup.</p>
      </div>
    `, user, clientSlug));
  }

  // Build ranking + copy
  const aeoVal = scan?.aeo_score ?? 0;
  const aeoPct = percentileFor(aeoVal, snap);
  const aeoColor = aeoPct >= 75 ? "var(--green)" : aeoPct >= 50 ? "var(--yellow)" : "var(--red)";

  const csVal = csSnap?.citation_share ?? null;
  const csPct = csVal !== null ? citationPercentileFor(csVal, snap) : null;
  const csColor = csPct === null ? "var(--text-faint)" : csPct >= 75 ? "var(--green)" : csPct >= 50 ? "var(--yellow)" : "var(--red)";

  const ordinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const computedAgo = snap.computed_at
    ? `${Math.max(1, Math.round((Math.floor(Date.now() / 1000) - snap.computed_at) / 86400))} day${Math.abs(Math.floor((Date.now() / 1000 - snap.computed_at) / 86400)) === 1 ? "" : "s"} ago`
    : "n/a";

  const body = `
    <div style="margin-bottom:32px">
      <div class="label" style="margin-bottom:8px">Dashboard / ${esc(clientSlug)}</div>
      <h1>Industry <em>benchmark</em></h1>
      <p style="color:var(--text-muted);margin-top:8px">
        Industry pool: <strong>${esc(industry)}</strong> · ${snap.sample_size} client${snap.sample_size === 1 ? "" : "s"} · refreshed ${esc(computedAgo)}
      </p>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px">
      <div style="border:1px solid var(--line);border-radius:6px;padding:24px">
        <div class="label" style="margin-bottom:12px">AEO score percentile</div>
        <div style="font-size:48px;font-weight:300;letter-spacing:-0.02em;color:${aeoColor}">${ordinal(aeoPct)}</div>
        <div style="color:var(--text-muted);font-size:13px;margin-top:8px">
          Your score (${aeoVal.toFixed(0)}) ranks at the ${ordinal(aeoPct)} percentile among ${snap.sample_size} ${esc(industry)} clients.
        </div>
        <div style="margin-top:16px;font-size:12px;color:var(--text-faint);font-family:var(--mono)">
          p25 ${snap.aeo_p25.toFixed(0)} &nbsp; median ${snap.aeo_median.toFixed(0)} &nbsp; p75 ${snap.aeo_p75.toFixed(0)} &nbsp; p90 ${snap.aeo_p90.toFixed(0)}
        </div>
      </div>
      <div style="border:1px solid var(--line);border-radius:6px;padding:24px">
        <div class="label" style="margin-bottom:12px">Citation share percentile</div>
        ${csPct !== null && csVal !== null ? `
          <div style="font-size:48px;font-weight:300;letter-spacing:-0.02em;color:${csColor}">${ordinal(csPct)}</div>
          <div style="color:var(--text-muted);font-size:13px;margin-top:8px">
            Your weekly citation share (${(csVal * 100).toFixed(0)}%) ranks at the ${ordinal(csPct)} percentile.
          </div>
          <div style="margin-top:16px;font-size:12px;color:var(--text-faint);font-family:var(--mono)">
            p25 ${((snap.citation_p25 ?? 0) * 100).toFixed(0)}% &nbsp; median ${((snap.citation_median ?? 0) * 100).toFixed(0)}% &nbsp; p75 ${((snap.citation_p75 ?? 0) * 100).toFixed(0)}% &nbsp; p90 ${((snap.citation_p90 ?? 0) * 100).toFixed(0)}%
          </div>
        ` : `
          <div style="font-size:32px;font-weight:300;color:var(--text-faint)">—</div>
          <div style="color:var(--text-muted);font-size:13px;margin-top:8px">Need more citation data in this industry pool before we can rank.</div>
        `}
      </div>
    </div>

    ${snap.schema_coverage_mean !== null ? `
      <div style="border:1px solid var(--line);border-radius:6px;padding:20px;margin-bottom:24px">
        <div class="label" style="margin-bottom:8px">Industry schema coverage</div>
        <div style="font-size:24px;font-weight:300">${snap.schema_coverage_mean.toFixed(0)}% <span style="color:var(--text-faint);font-size:14px">average across ${esc(industry)} clients</span></div>
        <p style="color:var(--text-muted);font-size:13px;margin-top:8px">Pure structural coverage of the critical schema types (Organization, WebSite, BreadcrumbList, etc.). Shows what is "table stakes" for the industry; the schema-quality grader is what catches the partial-implementation penalty.</p>
      </div>
    ` : ""}

    <div style="border:1px solid var(--line);border-radius:6px;padding:20px;background:var(--bg-faint);font-size:13px;color:var(--text-muted)">
      <strong style="color:var(--text)">How this is computed.</strong> Every night we take the latest non-error scan and the latest weekly citation snapshot per client tagged into your industry, then compute quartiles (p25 / p50 / p75 / p90). Your value is then placed on that distribution by linear interpolation. We hide entire industries until n &ge; 5 to avoid quoting percentiles built from 2 or 3 peers.
    </div>
  `;

  return html(layout("Industry benchmark", body, user, clientSlug));
}
