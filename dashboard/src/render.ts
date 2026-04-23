/**
 * Dashboard — HTML rendering helpers
 */

import { CSS } from "./styles";
import type { User, BrandingContext } from "./types";
import { canUseDraftingFeature } from "./gating";

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
  // For slug-dependent nav links: use activeSlug when we're viewing a
  // specific client, otherwise fall back to the logged-in user's own
  // client_slug; admins on list pages use the bare path.
  const slug = activeSlug || user?.client_slug || '';
  const slugify = (path: string) => user?.role === 'admin' && !activeSlug ? path : (slug ? `${path}/${slug}` : path);
  const isAgencyAdmin = user?.role === 'agency_admin';
  const isAdmin = user?.role === 'admin';
  const canDraft = user ? canUseDraftingFeature(user) : false;

  // Badge helpers. Kept compact so the sidebar items don't get noisy.
  const alertBadge = badges.alerts ? `<span class="nav-badge">${badges.alerts > 9 ? '9+' : badges.alerts}</span>` : '';
  const roadmapBadge = badges.roadmap ? `<span class="nav-badge">${badges.roadmap}</span>` : '';

  // Active-state helper: returns ' active' if any predicate matches the
  // current title. Keeps the sidebar markup readable instead of repeating
  // ternaries everywhere.
  const active = (...titles: string[]) => titles.some(t => title === t || title.startsWith(t)) ? ' active' : '';

  // Sidebar. Grouped by job-to-be-done (Overview / Measure / Improve /
  // Learn for clients; Agency / Ops for admin roles). Voice + Drafts are
  // hidden entirely for clients without the drafting entitlement --
  // cleaner than a grayed-out upgrade nudge in the nav.
  const clientSidebar = !isAgencyAdmin && user ? `
    <nav class="sidebar" id="sidebar" aria-label="Primary">
      <div class="sidebar-section">
        <div class="sidebar-section-header">Overview</div>
        <a href="/" class="sidebar-item${active('Dashboard')}">Dashboard</a>
        <a href="/alerts" class="sidebar-item${active('Alerts')}">Alerts${alertBadge}</a>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-header">Measure</div>
        <a href="${slugify('/summary')}" class="sidebar-item${active('Summary')}">Summary</a>
        <a href="${slugify('/report')}" class="sidebar-item${title.startsWith('Report') ? ' active' : ''}">Reports</a>
        <a href="${slugify('/search')}" class="sidebar-item${active('Search Performance', 'Search Console')}">Search</a>
        <a href="${slugify('/competitors')}" class="sidebar-item${active('Competitors')}">Competitors</a>
        <a href="${slugify('/citations')}" class="sidebar-item${active('Citations', 'Citation Keywords')}">Citations</a>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-header">Improve</div>
        <a href="${slugify('/roadmap')}" class="sidebar-item${active('Roadmap')}">Roadmap${roadmapBadge}</a>
        ${canDraft ? `<a href="${slugify('/voice')}" class="sidebar-item${active('Voice')}" title="Upload writing samples so drafts sound like you">Voice</a>` : ''}
        ${canDraft ? `<a href="${slugify('/drafts')}" class="sidebar-item${title === 'Drafts' || title.startsWith('Draft:') ? ' active' : ''}" title="In-dashboard content drafts, editor, and export">Drafts</a>` : ''}
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-header">Learn</div>
        <a href="/learn" class="sidebar-item${active('Learn')}">Knowledge</a>
      </div>
      ${isAdmin ? `
      <div class="sidebar-section">
        <div class="sidebar-section-header">Ops</div>
        <a href="/admin" class="sidebar-item${title === 'Admin' || title === 'Inject' ? ' active' : ''}">Cockpit</a>
        <a href="/admin/inbox" class="sidebar-item${title === 'Inbox' ? ' active' : ''}">Inbox</a>
        <a href="/admin/manage" class="sidebar-item${title === 'Manage Clients' ? ' active' : ''}">Manage Clients</a>
        <a href="/admin/scans" class="sidebar-item${active('Scan Health')}">Scan Health</a>
        <a href="/admin/engagement" class="sidebar-item${active('Engagement')}">Engagement</a>
        <a href="/admin/leads" class="sidebar-item${active('Leads')}">Leads</a>
      </div>` : ''}
    </nav>` : '';

  const agencySidebar = isAgencyAdmin ? `
    <nav class="sidebar" id="sidebar" aria-label="Primary">
      <div class="sidebar-section">
        <div class="sidebar-section-header">Agency</div>
        <a href="/agency" class="sidebar-item${title.includes('-- Agency') ? ' active' : ''}">Clients</a>
        <a href="/agency/invites" class="sidebar-item${active('Invites')}">Invites</a>
        <a href="/agency/billing" class="sidebar-item${title.includes('Agency Billing') ? ' active' : ''}">Billing</a>
        <a href="/agency/settings" class="sidebar-item${active('Agency Settings')}">Branding</a>
      </div>
      ${slug ? `
      <div class="sidebar-section">
        <div class="sidebar-section-header">Client: ${esc(slug)}</div>
        <a href="/summary/${slug}" class="sidebar-item${active('Summary')}">Summary</a>
        <a href="/report/${slug}" class="sidebar-item${title.startsWith('Report') ? ' active' : ''}">Reports</a>
        <a href="/search/${slug}" class="sidebar-item${active('Search Performance', 'Search Console')}">Search</a>
        <a href="/competitors/${slug}" class="sidebar-item${active('Competitors')}">Competitors</a>
        <a href="/citations/${slug}" class="sidebar-item${active('Citations', 'Citation Keywords')}">Citations</a>
        <a href="/roadmap/${slug}" class="sidebar-item${active('Roadmap')}">Roadmap${roadmapBadge}</a>
        <a href="/voice/${slug}" class="sidebar-item${active('Voice')}" title="Upload writing samples for this client">Voice</a>
        <a href="/drafts/${slug}" class="sidebar-item${title === 'Drafts' || title.startsWith('Draft:') ? ' active' : ''}" title="Drafts for this client">Drafts</a>
      </div>` : ''}
      <div class="sidebar-section">
        <div class="sidebar-section-header">Learn</div>
        <a href="/learn" class="sidebar-item${active('Learn')}">Knowledge</a>
      </div>
    </nav>` : '';

  const sidebar = clientSidebar || agencySidebar;

  // Avatar menu: native <details> gives us click-to-toggle with keyboard
  // support. Everything chrome-related (email, settings, support, sign
  // out) lives here so the sidebar can stay focused on product surfaces.
  const initial = user ? (user.name?.trim()?.[0] || user.email[0] || '?').toUpperCase() : '';
  const avatarMenu = user
    ? `<details class="avatar-menu">
        <summary aria-label="Account menu">
          <span class="avatar-chip">${esc(initial)}</span>
          <span class="avatar-caret">&#9662;</span>
        </summary>
        <div class="avatar-panel" role="menu">
          <div class="avatar-panel-email">${esc(user.email)}</div>
          <a href="/settings" class="${title === 'Settings' ? 'active' : ''}" role="menuitem">Settings</a>
          <a href="/support" class="${title === 'Support' ? 'active' : ''}" role="menuitem">Support</a>
          <a href="/logout" role="menuitem">Sign out</a>
        </div>
      </details>`
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
  <div style="display:flex;align-items:center;gap:12px">
    <button class="hamburger" onclick="document.getElementById('sidebar').classList.toggle('open');document.getElementById('sidebar-scrim').classList.toggle('on')" aria-label="Menu">&#9776;</button>
    <a href="/" class="mark">${brandMark}</a>
  </div>
  ${avatarMenu}
</header>
<div class="sidebar-scrim" id="sidebar-scrim" onclick="document.getElementById('sidebar').classList.remove('open');this.classList.remove('on')"></div>
<div class="app-shell">
  ${sidebar}
  <div>
    ${isAgencyAdmin && activeSlug ? `
    <div class="client-context">
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <span class="ctx-label">Viewing client</span>
        <strong style="color:var(--text)">${esc(activeSlug)}</strong>
      </div>
      <a href="/agency" style="color:var(--gold);text-decoration:none;font-size:11px">&larr; Back to agency dashboard</a>
    </div>` : ''}
    <main class="page">
    ${body}
    </main>
    ${poweredBy}
  </div>
</div>` : `
<main class="page">
${body}
</main>
${poweredBy}`}

<!-- Shared busy-state activator. On form submit:
     - disables the trigger button, swaps its text to data-busy-label
     - hides .nr-idle copy, shows .nr-busy block
     Phase message cycling inside .nr-phases is pure CSS (see styles.ts);
     no JS needed here. -->
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
    });
  });

  // Close the avatar menu when the user clicks anywhere outside it.
  // Native <details> only toggles on its own <summary>, so without this
  // the panel hangs open after the cursor moves on.
  var avatar=document.querySelector('.avatar-menu');
  if(avatar){
    document.addEventListener('click',function(e){
      if(avatar.open && !avatar.contains(e.target)) avatar.open=false;
    });
  }

  // On narrow viewports, close the slide-in sidebar after tapping a
  // nav link so the user lands on the new page instead of the drawer.
  var sb=document.getElementById('sidebar');
  var scrim=document.getElementById('sidebar-scrim');
  if(sb){
    sb.querySelectorAll('a.sidebar-item').forEach(function(a){
      a.addEventListener('click',function(){
        sb.classList.remove('open');
        if(scrim) scrim.classList.remove('on');
      });
    });
  }
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
