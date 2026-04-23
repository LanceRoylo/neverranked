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
  const voiceHref = slug ? `/voice/${slug}` : '/voice';
  const draftsHref = slug ? `/drafts/${slug}` : '/drafts';
  // Agency admins get a different nav: their lens is the agency, not a
  // single client. Slug-bound client nav doesn't apply to them (they
  // manage many clients). This collapses the topbar to the agency
  // surfaces and the agency dropdown.
  const isAgencyAdmin = user?.role === 'agency_admin';
  const agencyNav = isAgencyAdmin
    ? `
      <a href="/agency" class="nav-links-item${title.includes('-- Agency') ? ' active' : ''}">Agency</a>
      <a href="/agency/invites" class="nav-links-item${title === 'Invites' ? ' active' : ''}">Invites</a>
      <a href="/agency/settings" class="nav-links-item${title === 'Agency Settings' ? ' active' : ''}">Settings</a>
      <a href="/agency/billing" class="nav-links-item${title.includes('Agency Billing') ? ' active' : ''}">Billing</a>
      ${slug ? `
        <a href="/voice/${slug}" class="nav-links-item${title === 'Voice' ? ' active' : ''}" title="Upload writing samples so drafts sound like this client">Voice</a>
        <a href="/drafts/${slug}" class="nav-links-item${title === 'Drafts' || title.startsWith('Draft:') ? ' active' : ''}" title="Content drafts for this client">Drafts</a>
      ` : ''}
      <a href="/learn" class="nav-links-item${title === 'Learn' ? ' active' : ''}">Learn</a>
    `
    : '';
  const navLinks = user && isAgencyAdmin
    ? agencyNav
    : user
    ? `
      <a href="/" class="nav-links-item${title === 'Dashboard' ? ' active' : ''}">Dashboard</a>
      <a href="/alerts" class="nav-links-item${title === 'Alerts' ? ' active' : ''}">${badges.alerts ? '<span class="nav-badge">' + (badges.alerts > 9 ? '9+' : badges.alerts) + '</span>' : ''}Alerts</a>
      <a href="${user.role === 'admin' ? '/summary' : summaryHref}" class="nav-links-item${title === 'Summary' ? ' active' : ''}">Summary</a>
      <a href="${user.role === 'admin' ? '/competitors' : compHref}" class="nav-links-item${title === 'Competitors' ? ' active' : ''}">Competitors</a>
      <a href="${user.role === 'admin' ? '/citations' : citeHref}" class="nav-links-item${title === 'Citations' || title === 'Citation Keywords' ? ' active' : ''}">Citations</a>
      <a href="${user.role === 'admin' ? '/search' : searchHref}" class="nav-links-item${title === 'Search Performance' || title === 'Search Console' ? ' active' : ''}">Search</a>
      <a href="${user.role === 'admin' ? '/roadmap' : roadHref}" class="nav-links-item${title === 'Roadmap' ? ' active' : ''}">${badges.roadmap ? '<span class="nav-badge">' + badges.roadmap + '</span>' : ''}Roadmap</a>
      <a href="${user.role === 'admin' ? '/voice' : voiceHref}" class="nav-links-item${title === 'Voice' ? ' active' : ''}" title="Upload writing samples so drafts sound like you">Voice</a>
      <a href="${user.role === 'admin' ? '/drafts' : draftsHref}" class="nav-links-item${title === 'Drafts' || title.startsWith('Draft:') ? ' active' : ''}" title="In-dashboard content drafts, editor, and export">Drafts</a>
      <a href="${user.role === 'admin' ? '/report' : slug ? '/report/' + slug : '/report'}" class="nav-links-item${title.startsWith('Report') ? ' active' : ''}">Reports</a>
      <a href="/learn" class="nav-links-item${title === 'Learn' ? ' active' : ''}">Learn</a>
      ${user.role === 'admin' ? `<div class="nav-dropdown">
        <a href="/admin" class="nav-links-item${title.startsWith('Admin') || title === 'Inject' || title === 'Leads' || title === 'Scan Health' || title === 'Engagement' ? ' active' : ''}">Ops</a>
        <div class="nav-dropdown-menu">
          <a href="/admin">Cockpit</a>
          <a href="/admin/inbox">Inbox</a>
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
  // Derive an rgba() tint of the brand color for the "wash" variable
  // used on hover states and soft card backgrounds. Keep alpha=.10 to
  // match the original --gold-wash intensity.
  const primaryRgb = (() => {
    const hex = primaryColor.replace("#", "");
    const full = hex.length === 3
      ? hex.split("").map(c => c + c).join("")
      : hex.padEnd(6, "0").slice(0, 6);
    const r = parseInt(full.slice(0, 2), 16) || 0;
    const g = parseInt(full.slice(2, 4), 16) || 0;
    const b = parseInt(full.slice(4, 6), 16) || 0;
    return `${r}, ${g}, ${b}`;
  })();

  // CSS custom property override. Only emitted when agency-branded so
  // direct clients keep the original NeverRanked gold untouched.
  // Override all gold-derived variables so hover/wash/border surfaces
  // pick up the agency color too, not just the core --gold swatch.
  const brandStyleOverride = isAgencyBranded
    ? `<style>:root{--gold:${primaryColor};--gold-dim:${primaryDim};--gold-wash:rgba(${primaryRgb},.10)}</style>`
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

${isAgencyAdmin && activeSlug ? `
<div style="background:var(--bg-edge);border-bottom:1px solid var(--gold-dim);padding:8px 24px;font-size:12px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
  <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
    <span style="color:var(--gold);font-family:var(--label);text-transform:uppercase;letter-spacing:.14em;font-size:10px">Viewing client</span>
    <strong style="color:var(--text)">${esc(activeSlug)}</strong>
    <span class="muted" style="font-size:11px">&middot;</span>
    <a href="/roadmap/${esc(activeSlug)}" style="color:var(--text-faint);text-decoration:none;border-bottom:1px solid var(--line)">Roadmap</a>
    <a href="/citations/${esc(activeSlug)}" style="color:var(--text-faint);text-decoration:none;border-bottom:1px solid var(--line)">Citations</a>
    <a href="/search/${esc(activeSlug)}" style="color:var(--text-faint);text-decoration:none;border-bottom:1px solid var(--line)">Search</a>
    <a href="/competitors/${esc(activeSlug)}" style="color:var(--text-faint);text-decoration:none;border-bottom:1px solid var(--line)">Competitors</a>
    <a href="/report/${esc(activeSlug)}" style="color:var(--text-faint);text-decoration:none;border-bottom:1px solid var(--line)">Report</a>
  </div>
  <a href="/agency" style="color:var(--gold);text-decoration:none;font-size:11px">&larr; Back to agency dashboard</a>
</div>
` : ""}

<main class="page">
${body}
</main>
${poweredBy}

<!-- Shared busy-state activator. On form submit:
     - disables the trigger button, swaps its text to data-busy-label
     - hides .nr-idle copy, shows .nr-busy block
     - cycles through phase messages defined by data-phases on a
       .nr-phases span (pipe-separated). Each phase runs ~2.2s then
       advances. The cycling is theater, not literal progress -- its
       whole job is to keep the screen feeling alive during the wait. -->
<script>
(function(){
  var triggers=document.querySelectorAll('.nr-busy-trigger');
  triggers.forEach(function(btn){
    var form=btn.form;
    if(!form) return;
    form.addEventListener('submit',function(){
      var label=btn.getAttribute('data-busy-label')||'Working\u2026';
      btn.disabled=true;
      btn.textContent=label;
      btn.style.opacity='.55';
      form.querySelectorAll('.nr-idle').forEach(function(el){el.style.display='none'});
      var busy=form.querySelector('.nr-busy');
      if(busy) busy.classList.add('on');
      // Cycle through phase messages if any. Uses requestAnimationFrame
      // chaining (more reliable than setInterval during form-submit
      // navigation in Safari) and starts the first transition at 1s
      // so the user sees motion quickly.
      var phasesEl=form.querySelector('.nr-phases');
      if(phasesEl){
        var raw=phasesEl.getAttribute('data-phases')||'';
        var phases=raw.split('|').map(function(s){return s.trim()}).filter(Boolean);
        if(phases.length>0){
          var i=0;
          phasesEl.textContent=phases[0];
          phasesEl.style.transition='opacity .22s';
          var lastSwap=performance.now();
          var firstDelay=1000;
          var swapEvery=2000;
          function tick(now){
            var elapsed=now-lastSwap;
            var threshold=(i===0)?firstDelay:swapEvery;
            if(elapsed>=threshold){
              i=(i+1)%phases.length;
              phasesEl.style.opacity='0';
              setTimeout(function(){
                phasesEl.textContent=phases[i];
                phasesEl.style.opacity='1';
              },180);
              lastSwap=now;
            }
            requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        }
      }
    });
  });
})();
</script>

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
