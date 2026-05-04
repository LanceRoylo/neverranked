/**
 * Dashboard -- /trust/<slug>
 *
 * Phase 4A authority surface: shows the per-client trust matrix
 * (which review platforms link out from the client's site) plus the
 * author-bio coverage roll-up. Read-only in v1.
 */

import type { Env, User } from "../types";
import { layout, html, esc } from "../render";
import { canAccessClient } from "../agency";
import { getTrustMatrix } from "../authority-signals";
import { clientHasFeature, getPlanForClient, upgradePromptHtml } from "../lib/plan-limits";

const PLATFORM_LABELS: Record<string, { label: string; cta: string }> = {
  g2: { label: "G2", cta: "Claim or set up your G2 profile" },
  trustpilot: { label: "Trustpilot", cta: "Set up a Trustpilot profile" },
  capterra: { label: "Capterra", cta: "Claim or set up your Capterra listing" },
  google_business: { label: "Google Business Profile", cta: "Verify or claim your Google Business Profile" },
  yelp: { label: "Yelp", cta: "Claim your Yelp business listing" },
  bbb: { label: "Better Business Bureau", cta: "Get accredited or list with the BBB" },
  glassdoor: { label: "Glassdoor", cta: "Claim your Glassdoor employer profile" },
  clutch: { label: "Clutch", cta: "Set up a Clutch profile" },
};

export async function handleTrust(clientSlug: string, user: User, env: Env): Promise<Response> {
  if (!(await canAccessClient(env, user, clientSlug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Page not found</h3></div>`, user), 404);
  }

  // Pulse plan gate -- authority audits are Signal+. Show upgrade.
  if (!(await clientHasFeature(env, clientSlug, "authorityAudits"))) {
    const plan = await getPlanForClient(env, clientSlug);
    return html(layout("Authority signals", upgradePromptHtml("authorityAudits", plan), user));
  }

  const { platforms, authorCoverage } = await getTrustMatrix(clientSlug, env);

  const detectedCount = platforms.filter(p => p.profiles.length > 0).length;
  const tier1Detected = platforms.filter(p => ["g2","trustpilot","capterra","google_business"].includes(p.platform) && p.profiles.length > 0).length;

  const matrixRows = platforms.map(p => {
    const meta = PLATFORM_LABELS[p.platform] || { label: p.platform, cta: "" };
    const present = p.profiles.length > 0;
    const status = present
      ? `<span style="color:var(--green);font-family:var(--label);font-size:11px;letter-spacing:.1em;text-transform:uppercase">Detected</span>`
      : `<span style="color:var(--text-faint);font-family:var(--label);font-size:11px;letter-spacing:.1em;text-transform:uppercase">Missing</span>`;
    const detail = present
      ? p.profiles.map(prof => `<a href="${esc(prof.url)}" target="_blank" rel="noopener" style="color:var(--text);text-decoration:underline">${esc(prof.url.length > 70 ? prof.url.slice(0, 70) + "…" : prof.url)}</a>`).join("<br>")
      : `<span style="color:var(--text-faint)">${esc(meta.cta)}</span>`;
    return `
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid var(--line);font-weight:500">${esc(meta.label)}</td>
        <td style="padding:14px 16px;border-bottom:1px solid var(--line)">${status}</td>
        <td style="padding:14px 16px;border-bottom:1px solid var(--line);font-size:13px;color:var(--text-mute)">${detail}</td>
      </tr>
    `;
  }).join("");

  const authorPct = authorCoverage && authorCoverage.pages_scanned > 0
    ? Math.round((authorCoverage.pages_with_author / authorCoverage.pages_scanned) * 100)
    : 0;
  const authorStatus: "good" | "warn" | "bad" =
    authorPct >= 75 ? "good" : authorPct >= 40 ? "warn" : "bad";
  const authorColor = authorStatus === "good" ? "var(--green)" : authorStatus === "warn" ? "var(--yellow)" : "var(--red)";

  // Phase 4B: completeness percent. Pages where the Person node graded >=60.
  const completePct = authorCoverage && authorCoverage.pages_scanned > 0
    ? Math.round((authorCoverage.pages_with_complete_author / authorCoverage.pages_scanned) * 100)
    : 0;
  const completeColor = completePct >= 50 ? "var(--green)" : completePct >= 20 ? "var(--yellow)" : "var(--red)";

  const body = `
    <div style="margin-bottom:32px">
      <div class="label" style="margin-bottom:8px">Dashboard / ${esc(clientSlug)}</div>
      <h1>Authority <em>signals</em></h1>
      <p style="color:var(--text-mute);max-width:680px;margin-top:8px">
        AI engines lean heavily on third-party trust platforms (G2, Trustpilot, Capterra, GBP) and named-author signals when deciding who to cite. CMU's GEO research found ~3x lift for brands with at least one tier-1 review profile and ~2.3x lift for content with named authors.
      </p>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:40px">
      <div style="border:1px solid var(--line);border-radius:6px;padding:24px">
        <div class="label" style="margin-bottom:12px">Trust platforms detected</div>
        <div style="font-size:48px;font-weight:300;letter-spacing:-0.02em">${detectedCount} <span style="color:var(--text-faint);font-size:24px">/ ${platforms.length}</span></div>
        <div style="color:var(--text-mute);font-size:13px;margin-top:8px">
          ${tier1Detected > 0
            ? `${tier1Detected} tier-1 platform${tier1Detected === 1 ? "" : "s"} (G2 / Trustpilot / Capterra / GBP) linked from your site.`
            : "No tier-1 review platform linked from your site yet. Pick one and link to it from your footer or trust page."}
        </div>
      </div>
      <div style="border:1px solid var(--line);border-radius:6px;padding:24px">
        <div class="label" style="margin-bottom:12px">Named-author coverage</div>
        <div style="font-size:48px;font-weight:300;letter-spacing:-0.02em;color:${authorColor}">${authorPct}%</div>
        <div style="color:var(--text-mute);font-size:13px;margin-top:8px">
          ${authorCoverage
            ? `${authorCoverage.pages_with_author} of ${authorCoverage.pages_scanned} scanned page${authorCoverage.pages_scanned === 1 ? "" : "s"} declare a named author (meta tag or schema.org Person).`
            : "No scan data yet. Trust signals populate after the first weekly scan."}
        </div>
      </div>
    </div>

    ${authorCoverage ? `
    <div style="border:1px solid var(--line);border-radius:6px;padding:24px;margin-bottom:32px;background:${completePct < 20 ? "rgba(192,57,43,.04)" : completePct < 50 ? "rgba(230,126,34,.04)" : "transparent"}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px">
        <div style="flex:1">
          <div class="label" style="margin-bottom:8px">Author completeness</div>
          <div style="font-size:32px;font-weight:300;letter-spacing:-0.02em;color:${completeColor}">${completePct}% complete</div>
          <p style="color:var(--text-mute);font-size:13px;margin-top:8px">
            ${authorCoverage.pages_with_complete_author} of ${authorCoverage.pages_scanned} pages have a Person schema node with the fields AI engines use to evaluate authorship (url or sameAs as an identity anchor, plus jobTitle / worksFor / image).
          </p>
        </div>
        <div style="max-width:380px;font-size:12px;color:var(--text-faint);line-height:1.6">
          <strong style="color:var(--text-mute)">Why this matters.</strong> A Person node with just <code>{ "name": "Jane" }</code> passes the named-author check but gives AI engines nothing to anchor authorship to. The completeness score uses the same grader as the public schema scorer -- a Person node passes when it scores 60+, which requires identity linkage (url OR sameAs) plus most of the recommended fields.
        </div>
      </div>
    </div>` : ""}

    <div style="margin-bottom:16px">
      <h2 style="font-size:20px;margin:0">Trust-platform matrix</h2>
      <p style="color:var(--text-mute);font-size:13px;margin-top:4px">
        Detected by scanning outbound links on every page we crawl. If a profile exists but isn't linked from your site, it won't show here -- linking from your footer or trust page is what compounds the signal.
      </p>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:48px">
      <thead>
        <tr style="text-align:left;border-bottom:1px solid var(--line)">
          <th style="padding:12px 16px;font-family:var(--label);font-size:11px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">Platform</th>
          <th style="padding:12px 16px;font-family:var(--label);font-size:11px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">Status</th>
          <th style="padding:12px 16px;font-family:var(--label);font-size:11px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">Detail</th>
        </tr>
      </thead>
      <tbody>${matrixRows}</tbody>
    </table>

    <div style="border:1px solid var(--line);border-radius:6px;padding:20px;background:var(--bg-lift);font-size:13px;color:var(--text-mute)">
      <strong style="color:var(--text)">How this is computed.</strong> The scanner checks every page in your weekly crawl for outbound links matching known trust-platform URL patterns and for <code>&lt;meta name="author"&gt;</code> + schema.org <code>Person</code> nodes. Items take effect after at least 5 successful scans of pages on your domain so brand-new sites aren't penalized for missing data.
    </div>
  `;

  return html(layout("Authority signals", body, user, clientSlug));
}
