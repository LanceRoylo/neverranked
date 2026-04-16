/**
 * Dashboard — HTML rendering helpers
 */

import { CSS } from "./styles";
import type { User, BrandingContext } from "./types";

/**
 * Normalize a hex color or CSS color string so we can safely interpolate
 * it into a style block. We only accept #rgb / #rrggbb / #rrggbbaa or a
 * short alphanumeric sequence -- anything else collapses to the default
 * gold. This prevents agency-supplied values from breaking out of the
 * CSS variable context.
 */
function safeColor(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  const m = /^#?([0-9a-fA-F]{3,8})$/.exec(raw.trim());
  if (!m) return fallback;
  return "#" + m[1];
}

export function layout(
  title: string,
  body: string,
  user: User | null = null,
  activeSlug?: string,
  branding?: BrandingContext,
): string {
  const badges = user ? { alerts: user._alertCount || 0, roadmap: user._roadmapInProgress || 0 } : { alerts: 0, roadmap: 0 };
  // For slug-dependent nav links: use activeSlug if we know which client we're viewing,
  // otherwise use the user's client_slug, otherwise use bare path (triggers auto-redirect)
  const slug = activeSlug || user?.client_slug || '';
  const compHref = slug ? `/competitors/${slug}` : '/competitors';
  const citeHref = slug ? `/citations/${slug}` : '/citations';
  const roadHref = slug ? `/roadmap/${slug}` : '/roadmap';
  const searchHref = slug ? `/search/${slug}` : '/search';
  const summaryHref = slug ? `/summary/${slug}` : '/summary';
  const navLinks = user
    ? `
      <a href="/" class="nav-links-item${title === 'Dashboard' ? ' active' : ''}">Dashboard</a>
      <a href="/alerts" class="nav-links-item${title === 'Alerts' ? ' active' : ''}">${badges.alerts ? '<span class="nav-badge">' + (badges.alerts > 9 ? '9+' : badges.alerts) + '</span>' : ''}Alerts</a>
      <a href="${user.role === 'admin' ? '/summary' : summaryHref}" class="nav-links-item${title === 'Summary' ? ' active' : ''}">Summary</a>
      <a href="${user.role === 'admin' ? '/competitors' : compHref}" class="nav-links-item${title === 'Competitors' ? ' active' : ''}">Competitors</a>
      <a href="${user.role === 'admin' ? '/citations' : citeHref}" class="nav-links-item${title === 'Citations' || title === 'Citation Keywords' ? ' active' : ''}">Citations</a>
      <a href="${user.role === 'admin' ? '/search' : searchHref}" class="nav-links-item${title === 'Search Performance' || title === 'Search Console' ? ' active' : ''}">Search</a>
      <a href="${user.role === 'admin' ? '/roadmap' : roadHref}" class="nav-links-item${title === 'Roadmap' ? ' active' : ''}">${badges.roadmap ? '<span class="nav-badge">' + badges.roadmap + '</span>' : ''}Roadmap</a>
      <a href="${user.role === 'admin' ? '/report' : slug ? '/report/' + slug : '/report'}" class="nav-links-item${title.startsWith('Report') ? ' active' : ''}">Reports</a>
      <a href="/learn" class="nav-links-item${title === 'Learn' ? ' active' : ''}">Learn</a>
      ${user.role === 'admin' ? `<div class="nav-dropdown">
        <a href="/admin" class="nav-links-item${title.startsWith('Admin') || title === 'Inject' || title === 'Leads' || title === 'Scan Health' || title === 'Engagement' ? ' active' : ''}">Ops</a>
        <div class="nav-dropdown-menu">
          <a href="/admin">Cockpit</a>
          <a href="/admin/manage">Manage Clients</a>
          <a href="/admin/scans">Scan Health</a>
          <a href="/admin/engagement">Engagement</a>
          <a href="/admin/leads">Leads</a>
        </div>
      </div>` : ''}
    `
    : '';

  const userInfo = user
    ? `<div class="user-info">
        <a href="/support" style="color:var(--text-faint);text-decoration:none;font-size:12px${title === 'Support' ? ';color:var(--gold)' : ''}">Support</a>
        <a href="/settings" style="color:var(--text-faint);text-decoration:none;font-size:12px${title === 'Settings' ? ';color:var(--gold)' : ''}">Settings</a>
        <span>${user.email}</span>
        <a href="/logout">Sign out</a>
      </div>`
    : '';

  // Branding resolution. Default = NeverRanked. Agency branding only
  // kicks in when the upstream handler passes a BrandingContext with
  // source='agency' and an active agency row. The middleware also
  // attaches branding to user._branding so route handlers don't have
  // to thread it through every layout() call.
  const effectiveBranding = branding || user?._branding;
  const isAgencyBranded = effectiveBranding?.source === "agency" && !!effectiveBranding.agency;
  const agency = isAgencyBranded ? effectiveBranding!.agency! : null;
  const brandName = agency ? agency.name : "Never Ranked";
  const pageTitle = `${esc(title)} — ${esc(brandName)}`;
  const primaryColor = safeColor(agency?.primary_color, "#c9a84c");
  const primaryDim = primaryColor; // single value; opacity is handled via alpha channels elsewhere

  // CSS custom property override. Only emitted when agency-branded so
  // direct clients keep the original NeverRanked gold untouched.
  const brandStyleOverride = isAgencyBranded
    ? `<style>:root{--gold:${primaryColor};--gold-dim:${primaryDim}}</style>`
    : "";

  // Topbar mark. For agency-branded pages with a logo URL we render an
  // <img>; otherwise we render the agency or NR wordmark. Logos are
  // served from our own R2 (set by /agency/settings) so we can trust the URL.
  const brandMark = agency && agency.logo_url
    ? `<img src="${esc(agency.logo_url)}" alt="${esc(agency.name)}" style="height:24px;max-width:160px;object-fit:contain;display:block" />`
    : (isAgencyBranded
        ? `<span style="font-family:var(--serif);font-size:18px;letter-spacing:-.01em">${esc(brandName)}</span>`
        : `Never Ranked<sup>app</sup>`);

  // "Powered by" footer. We show this ONLY for Mode-2 clients of an
  // agency (they're the audience that benefits from the disclosure).
  // Agency admins themselves already know what platform they're on, so
  // we hide it for them to keep the UI clean.
  const showPoweredBy = isAgencyBranded
    && !!effectiveBranding?.showPoweredBy
    && user?.role === "client";
  const poweredBy = showPoweredBy
    ? `<footer class="powered-by">Powered by <a href="https://neverranked.com" target="_blank" rel="noopener">Never Ranked</a></footer>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#121212">
<title>${pageTitle}</title>
<meta name="robots" content="noindex, nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=DM+Mono:ital,wght@0,300;0,400;0,500&family=Barlow+Condensed:wght@300;400;500;600&display=swap" rel="stylesheet">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23080808'/%3E%3Ctext x='50%25' y='56%25' text-anchor='middle' font-family='Georgia,serif' font-size='22' fill='%23c9a84c' font-style='italic'%3EN%3C/text%3E%3C/svg%3E">
<style>${CSS}</style>
${brandStyleOverride}
</head>
<body>
<div class="grain" aria-hidden="true"></div>

${user ? `<header class="topbar">
  <a href="/" class="mark">${brandMark}</a>
  <button class="hamburger" onclick="document.querySelector('.nav-links').classList.toggle('open')" aria-label="Menu">&#9776;</button>
  <div class="nav-links">${navLinks}</div>
  ${userInfo}
</header>` : ''}

<main class="page">
${body}
</main>
${poweredBy}

</body>
</html>`;
}

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function html(content: string, status = 200): Response {
  return new Response(content, {
    status,
    headers: { "Content-Type": "text/html;charset=utf-8" },
  });
}

export function redirect(url: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: { Location: url },
  });
}

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

/** Safe JSON parse with fallback */
export function safeParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Format a unix timestamp as a short date: "Apr 14" */
export function shortDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Format a unix timestamp as a long date: "April 14, 2026" */
export function longDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** Format a unix timestamp as a full datetime: "April 14, 2026, 02:30 PM" */
export function fullDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Build a delta indicator: "+5" in green, "-3" in red, "--" in muted */
export function deltaHtml(diff: number, suffix = ""): string {
  if (diff > 0) return `<span style="color:var(--green)">+${diff}${suffix}</span>`;
  if (diff < 0) return `<span style="color:var(--red)">${diff}${suffix}</span>`;
  return `<span style="color:var(--text-faint)">--</span>`;
}

/** Map a status to a color variable */
export function statusColor(status: string): string {
  switch (status) {
    case "good": case "done": case "completed": case "healthy": return "var(--green)";
    case "warning": case "in_progress": case "stale": return "var(--yellow)";
    case "bad": case "error": case "critical": case "blocked": return "var(--red)";
    default: return "var(--text-faint)";
  }
}

/** Pluralize a word: pluralize("item", 3) => "items" */
export function pluralize(word: string, count: number): string {
  return count === 1 ? word : word + "s";
}
