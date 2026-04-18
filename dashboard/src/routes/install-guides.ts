/**
 * Install guides for the NeverRanked snippet, one page per common
 * website platform. Public (no auth) so the URLs are forwardable.
 *
 * Routes:
 *   GET /install                        -> index of all platforms
 *   GET /install/:platform              -> per-platform step-by-step
 *   GET /install/:platform?slug=foo     -> same, but with the actual
 *                                          snippet pre-filled for slug=foo
 *
 * Why these exist: snippet install is the single biggest activation
 * gap. Day 7 and Day 14 nudge emails fire because clients haven't
 * pasted the tag in their site header. The blocker is almost never
 * "I don't want to" -- it's "I don't know how on my CMS." A clear
 * one-page guide per platform removes that blocker and is also free
 * organic SEO traffic for queries like "how to add custom HTML to
 * Squarespace head."
 *
 * Voice: plain, specific, exact menu names. No fluff.
 */

import type { Env } from "../types";
import { html, esc } from "../render";
import { CSS } from "../styles";

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

interface Step {
  title: string;
  detail: string;
}

interface Guide {
  slug: string;
  name: string;
  category: "CMS" | "E-commerce" | "Builder" | "Universal" | "Other";
  oneLiner: string;
  prereqs: string[];     // what you need before starting
  steps: Step[];          // ordered install steps
  verify: string;         // how to confirm it worked
  gotchas: string[];      // common problems
  notes?: string;         // optional caveats (e.g., free-plan limitations)
}

// Helper: the placeholder snippet shown when no client_slug is in the URL.
const PLACEHOLDER_SNIPPET = `<script async src="https://app.neverranked.com/inject/<your-slug>.js"></script>`;

const GUIDES: Guide[] = [
  // ----- CMS -----
  {
    slug: "wordpress",
    name: "WordPress",
    category: "CMS",
    oneLiner: "Use a small free plugin so the snippet survives theme updates.",
    prereqs: ["Admin access to the WordPress dashboard"],
    steps: [
      {
        title: "Install the plugin \"Insert Headers and Footers\" (by WPCode)",
        detail: "In your WordPress admin, go to Plugins -> Add New. Search for \"Insert Headers and Footers\" and install the one by WPCode. Activate it.",
      },
      {
        title: "Open the plugin's settings",
        detail: "Code Snippets -> Header & Footer (in the left sidebar). You'll see two big text boxes labeled \"Scripts in Header\" and \"Scripts in Footer\".",
      },
      {
        title: "Paste the snippet into \"Scripts in Header\"",
        detail: "Paste the snippet (above) into the Scripts in Header box. Click Save Changes at the top.",
      },
    ],
    verify: "Open your homepage in a new tab, view source (right-click -> View Page Source), and search for \"neverranked.com/inject\". You should find the script tag inside the <head>.",
    gotchas: [
      "Editing the theme's header.php directly works but breaks on theme updates. Use the plugin instead.",
      "Caching plugins (W3 Total Cache, WP Rocket) may serve a stale page right after install. Clear the cache and re-check.",
      "If you use a page builder like Elementor or Divi, the plugin install path still works -- you don't need to add the snippet through the builder.",
    ],
  },

  {
    slug: "squarespace",
    name: "Squarespace",
    category: "CMS",
    oneLiner: "Built-in code injection field. Two minutes if you have admin access.",
    prereqs: ["Owner or admin access to the site"],
    steps: [
      {
        title: "Open Code Injection",
        detail: "From the home menu: Settings -> Advanced -> Code Injection.",
      },
      {
        title: "Paste into the HEADER box",
        detail: "Paste the snippet (above) into the box labeled HEADER (not FOOTER). Click Save in the top-left.",
      },
    ],
    verify: "Visit your live homepage, view source, and search for \"neverranked.com/inject\". The script tag should be in <head>.",
    gotchas: [
      "Code Injection requires a Business plan or higher. Personal plans don't expose this field.",
      "Squarespace caches CDN-side. Allow ~5 minutes after Save before scanning.",
    ],
    notes: "On the Personal plan, this option is hidden. You'll need to upgrade or use Google Tag Manager (see the GTM guide).",
  },

  {
    slug: "wix",
    name: "Wix",
    category: "CMS",
    oneLiner: "Wix's Custom Code feature handles head-tag inserts cleanly.",
    prereqs: ["Premium plan (Custom Code is not on free)", "Site admin access"],
    steps: [
      {
        title: "Open Custom Code in your dashboard",
        detail: "Site dashboard -> Settings -> Custom Code (under the Advanced section).",
      },
      {
        title: "Add a new code snippet",
        detail: "Click + Add Custom Code. Paste the snippet (above) into the Code box.",
      },
      {
        title: "Configure placement",
        detail: "Name it \"NeverRanked\". Under \"Add Code to Pages\", choose \"All pages\" and \"Load code once\". Under \"Place Code in\", pick \"Head\". Click Apply.",
      },
    ],
    verify: "View source on the live site and search for \"neverranked.com/inject\". The tag should be inside <head>.",
    gotchas: [
      "Custom Code requires a Premium plan. Free Wix sites can't add custom HTML.",
      "Wix's editor preview won't show the script. Always test on the published live URL.",
    ],
  },

  {
    slug: "webflow",
    name: "Webflow",
    category: "Builder",
    oneLiner: "Project Settings -> Custom Code -> Head Code. Publish.",
    prereqs: ["Site admin access", "A paid Site plan (free Webflow.io subdomains may have limits)"],
    steps: [
      {
        title: "Open Project Settings",
        detail: "Top-right of the Designer or Project Dashboard, click the project name -> Settings.",
      },
      {
        title: "Go to Custom Code",
        detail: "In the left tabs, click Custom Code. Find the section labeled \"Head Code\".",
      },
      {
        title: "Paste and save",
        detail: "Paste the snippet (above) into Head Code. Click Save Changes.",
      },
      {
        title: "Publish",
        detail: "Saving Custom Code does not push it live. Click Publish (top-right of the Designer) to deploy. Pick your domain(s) and confirm.",
      },
    ],
    verify: "Open your live site (the published URL, not the staging .webflow.io if you have a custom domain), view source, and search for \"neverranked.com/inject\".",
    gotchas: [
      "Don't paste it inside the Body Code section -- it needs to be in Head Code.",
      "If you forget to Publish, the snippet is saved but not live.",
    ],
  },

  {
    slug: "godaddy",
    name: "GoDaddy Website Builder",
    category: "Builder",
    oneLiner: "GoDaddy doesn't have a head-injection field. Use Google Tag Manager.",
    prereqs: ["A Google Tag Manager account (free)"],
    steps: [
      {
        title: "Set up Google Tag Manager first",
        detail: "Follow the Google Tag Manager guide on this site. GTM gives you a single line of code GoDaddy DOES support, and from inside GTM you can drop in our snippet.",
      },
      {
        title: "Add GTM to GoDaddy",
        detail: "GoDaddy dashboard -> Edit Website -> Settings -> Site-Wide Code (or Custom Code, depending on your plan tier). Paste the GTM container code there.",
      },
      {
        title: "Add the NeverRanked snippet inside GTM",
        detail: "In GTM, create a new Tag of type \"Custom HTML\". Paste the NeverRanked snippet. Trigger: All Pages. Save and Submit (publish) the GTM container.",
      },
    ],
    verify: "Visit your live site and view source. You should see both the GTM container script AND, after a few seconds, the NeverRanked script injected by GTM.",
    gotchas: [
      "GoDaddy's lower-tier plans don't expose any custom code field at all. You'll need to upgrade or migrate.",
      "Some GoDaddy themes inject scripts in the body, not head. The placement still works for our purposes -- AI scanners read the full HTML.",
    ],
    notes: "GoDaddy is the awkward one. Google Tag Manager is the cleanest workaround for almost any GoDaddy plan that allows even minimal custom code.",
  },

  {
    slug: "duda",
    name: "Duda",
    category: "Builder",
    oneLiner: "Site-wide HTML injection in the Site Settings.",
    prereqs: ["Editor access to the Duda site"],
    steps: [
      {
        title: "Open Site Settings",
        detail: "Inside the Duda editor: Settings -> Head HTML (under the Advanced section).",
      },
      {
        title: "Paste the snippet",
        detail: "Paste the snippet (above) into the Head HTML box. Click Save.",
      },
      {
        title: "Republish",
        detail: "Click Republish in the top-right to push the change live.",
      },
    ],
    verify: "View source on the live site and search for \"neverranked.com/inject\".",
    gotchas: [
      "Duda's editor preview won't show the snippet. Always check the published URL.",
      "If your Duda account is managed by an agency, you may need to ask them to add the code -- some plans restrict client-side editing.",
    ],
  },

  {
    slug: "hubspot",
    name: "HubSpot CMS",
    category: "CMS",
    oneLiner: "Settings -> Website -> Pages -> Site Header HTML.",
    prereqs: ["Marketing Hub Professional or CMS Hub Professional+", "Super Admin access"],
    steps: [
      {
        title: "Open the right Settings page",
        detail: "Top-right gear icon -> Settings. In the left sidebar: Website -> Pages.",
      },
      {
        title: "Pick the domain",
        detail: "Use the domain dropdown at the top of the page to pick the site you're installing on (HubSpot scopes header HTML per domain).",
      },
      {
        title: "Paste into Site Header HTML",
        detail: "Scroll to the \"Site Header HTML\" box. Paste the snippet. Click Save.",
      },
    ],
    verify: "Visit any page on that domain and view source. Search for \"neverranked.com/inject\".",
    gotchas: [
      "HubSpot scopes header HTML per domain. If you have multiple domains, repeat for each.",
      "Page-level Header HTML overrides site-level if both are set. Check pages individually if the snippet seems missing.",
    ],
  },

  {
    slug: "drupal",
    name: "Drupal",
    category: "CMS",
    oneLiner: "Easiest path: install the \"Asset Injector\" module.",
    prereqs: ["Admin access to the Drupal site", "Permission to install modules"],
    steps: [
      {
        title: "Install the Asset Injector module",
        detail: "Go to /admin/modules -> Install New Module. Install \"Asset Injector\" (drupal.org/project/asset_injector). Enable both \"Asset Injector\" and \"HTML Injector\" sub-modules.",
      },
      {
        title: "Create an HTML asset",
        detail: "Configuration -> Development -> Asset Injector -> HTML Injector -> Add HTML Injector. Paste the snippet (above). Set the position to \"Header\" and the visibility to all pages.",
      },
      {
        title: "Save",
        detail: "Save the asset. Drupal applies it immediately on the next page render.",
      },
    ],
    verify: "View source on any page and search for \"neverranked.com/inject\".",
    gotchas: [
      "If you can't install modules, ask your developer to drop the snippet into the active theme's html.html.twig template inside the {{ head }} block.",
      "Drupal sometimes caches aggressively. Visit /admin/config/development/performance and click Clear all caches after install.",
    ],
  },

  {
    slug: "joomla",
    name: "Joomla",
    category: "CMS",
    oneLiner: "Use a free \"head HTML\" extension or edit the template's index.php.",
    prereqs: ["Super User access"],
    steps: [
      {
        title: "Install a custom head plugin",
        detail: "Joomla extensions directory -> search \"Custom HTML in head\" or \"jHeader\". Install one with good ratings (Sourcerer, BT Custom Code, or RokTools).",
      },
      {
        title: "Configure",
        detail: "Open the plugin's settings, paste the snippet into the Head HTML field, set scope to all pages.",
      },
      {
        title: "Enable",
        detail: "Save and ensure the plugin is enabled.",
      },
    ],
    verify: "View source on the front-end home page and search for \"neverranked.com/inject\".",
    gotchas: [
      "Editing your template's index.php directly works but gets overwritten on template updates. Use a plugin.",
    ],
  },

  {
    slug: "ghost",
    name: "Ghost",
    category: "CMS",
    oneLiner: "Code Injection in Settings. Two clicks.",
    prereqs: ["Owner or Admin access"],
    steps: [
      {
        title: "Open Code Injection",
        detail: "Ghost admin -> Settings (gear icon, bottom-left) -> Code Injection.",
      },
      {
        title: "Paste into Site Header",
        detail: "Paste the snippet (above) into the \"Site Header\" box. Click Save.",
      },
    ],
    verify: "Visit your live homepage, view source, search for \"neverranked.com/inject\".",
    gotchas: [
      "Code Injection is on every Ghost plan, including Starter. If you don't see it, you're probably on Ghost(Pro)'s old free trial -- contact Ghost support.",
    ],
  },

  {
    slug: "framer",
    name: "Framer",
    category: "Builder",
    oneLiner: "Site Settings -> General -> Custom Code -> Start of <head>.",
    prereqs: ["Site editor access"],
    steps: [
      {
        title: "Open Site Settings",
        detail: "In the Framer editor: Settings (gear icon top-right) -> General tab.",
      },
      {
        title: "Find Custom Code",
        detail: "Scroll to the \"Custom Code\" section. You'll see fields labeled \"Start of <head> tag\", \"End of <head> tag\", and \"End of <body> tag\".",
      },
      {
        title: "Paste into Start of <head>",
        detail: "Paste the snippet into \"Start of <head> tag\". Click anywhere outside the field to save.",
      },
      {
        title: "Publish",
        detail: "Custom Code only goes live when you Publish. Click Publish (top-right) and confirm.",
      },
    ],
    verify: "Visit your published site (custom domain or .framer.website), view source, search for \"neverranked.com/inject\".",
    gotchas: [
      "Free Framer sites can use Custom Code, but you may need a paid plan for custom domains.",
      "The editor preview doesn't run Custom Code. Test the published URL.",
    ],
  },

  {
    slug: "carrd",
    name: "Carrd",
    category: "Builder",
    oneLiner: "Site -> Settings (gear) -> Embed -> Head.",
    prereqs: ["Carrd Pro plan ($9/year and up). Free Carrd does not support custom code."],
    steps: [
      {
        title: "Open Embed Settings",
        detail: "From the Carrd editor: Settings (gear icon, top-right) -> Embed.",
      },
      {
        title: "Add an embed",
        detail: "Click + (Add Embed). Set Type to \"Code\". Set Style to \"Head\".",
      },
      {
        title: "Paste the snippet",
        detail: "Paste the snippet (above) into the Code box. Click Done.",
      },
      {
        title: "Publish",
        detail: "Click Publish (top-right) to push the changes live.",
      },
    ],
    verify: "View source on the published URL and search for \"neverranked.com/inject\".",
    gotchas: [
      "Carrd's free plan does not support custom code. You need Pro Lite or above.",
    ],
  },

  // ----- E-commerce -----
  {
    slug: "shopify",
    name: "Shopify",
    category: "E-commerce",
    oneLiner: "Edit theme.liquid and drop it just before </head>.",
    prereqs: ["Store Owner or Staff with theme-editing permission"],
    steps: [
      {
        title: "Open the theme code editor",
        detail: "Shopify admin -> Online Store -> Themes. Find your live theme, click the three-dot menu (...) -> Edit code.",
      },
      {
        title: "Open theme.liquid",
        detail: "In the left file list under Layout, click theme.liquid. The full file opens in the editor.",
      },
      {
        title: "Paste right before </head>",
        detail: "Use Cmd+F (or Ctrl+F) to find </head>. Paste the snippet (above) on the line directly before </head>. Click Save (top-right).",
      },
    ],
    verify: "Visit your storefront homepage, view source, search for \"neverranked.com/inject\". Should be inside <head>.",
    gotchas: [
      "Always work on a duplicated theme first if you're not sure -- Shopify's Themes page lets you Duplicate any theme as a backup.",
      "Some Shopify apps inject their own scripts and can interfere. View source to confirm only one NeverRanked tag is present.",
      "If you use a page builder like PageFly, Shogun, or GemPages, the snippet still goes in theme.liquid (not the builder). It loads on every page that way.",
    ],
  },

  {
    slug: "bigcommerce",
    name: "BigCommerce",
    category: "E-commerce",
    oneLiner: "Storefront -> Script Manager. Add a new script in the head.",
    prereqs: ["Store admin access"],
    steps: [
      {
        title: "Open Script Manager",
        detail: "BigCommerce admin -> Storefront -> Script Manager.",
      },
      {
        title: "Create a new script",
        detail: "Click Create a Script. Name: \"NeverRanked\". Description: optional.",
      },
      {
        title: "Configure placement",
        detail: "Location on page: Head. Select pages where script will be added: All Pages. Script category: Functional. Script type: Script.",
      },
      {
        title: "Paste the snippet",
        detail: "In the Scripts contents box, paste the snippet (above). Click Save.",
      },
    ],
    verify: "Visit your storefront, view source, search for \"neverranked.com/inject\".",
    gotchas: [
      "Script Manager replaces the older Web Analytics field. If you see both, prefer Script Manager.",
      "BigCommerce can defer scripts depending on category. Use Functional, not Marketing, to ensure it runs.",
    ],
  },

  // ----- Universal -----
  {
    slug: "google-tag-manager",
    name: "Google Tag Manager",
    category: "Universal",
    oneLiner: "Works on any platform that lets you add the GTM container code. The universal fallback.",
    prereqs: ["A free Google Tag Manager account at tagmanager.google.com", "GTM container code installed on your site (skip if already done)"],
    steps: [
      {
        title: "Open your GTM workspace",
        detail: "Sign in at tagmanager.google.com. Pick the container for the site you're installing on.",
      },
      {
        title: "Create a new tag",
        detail: "Tags (left sidebar) -> New. Name: \"NeverRanked\". Click Tag Configuration -> Custom HTML.",
      },
      {
        title: "Paste the snippet",
        detail: "Paste the snippet (above) into the HTML box.",
      },
      {
        title: "Set the trigger",
        detail: "Click Triggering -> All Pages. Save the tag.",
      },
      {
        title: "Submit and publish",
        detail: "Top-right -> Submit -> Publish. Give the version a name like \"Add NeverRanked\". Confirm.",
      },
    ],
    verify: "Visit any page on your site, view source, search for \"neverranked.com/inject\". GTM injects it client-side, so it appears slightly after page load -- check the live DOM in DevTools (Elements tab) if View Source doesn't show it.",
    gotchas: [
      "GTM-injected scripts are sometimes blocked by aggressive ad-blockers. If your scanner says \"not detected\" but the tag is in the DOM, this might be why -- the NeverRanked scanner isn't a real browser, but it does fetch the raw HTML, which means a GTM-only install MAY look invisible in early checks. If you can put the snippet directly in <head> via your CMS, do that instead. GTM is the fallback.",
    ],
    notes: "GTM works on almost any platform. It's the right choice when your CMS doesn't expose a head-injection field at all (e.g., low-tier GoDaddy, free Wix, free Carrd).",
  },

  // ----- Other -----
  {
    slug: "custom-html",
    name: "Custom HTML / Developer with code access",
    category: "Other",
    oneLiner: "Paste the snippet anywhere inside the <head> tag of your site-wide template.",
    prereqs: ["Code access to your site (FTP, Git, or whatever your deploy flow is)"],
    steps: [
      {
        title: "Find your site-wide head template",
        detail: "Most stacks have one file that renders the <head> on every page. Examples: layouts/default.html, _layouts/default.html (Jekyll), templates/base.html (Django), src/app/layout.tsx (Next.js App Router), pages/_document.tsx (Next.js Pages Router), public/index.html (CRA).",
      },
      {
        title: "Paste the snippet",
        detail: "Drop the snippet (above) inside <head>. Anywhere works -- order doesn't matter for our script.",
      },
      {
        title: "Deploy",
        detail: "Commit, push, deploy via your normal flow. Confirm on the live URL, not localhost.",
      },
    ],
    verify: "View source on the live site, search for \"neverranked.com/inject\".",
    gotchas: [
      "Single-page apps (React, Vue, Svelte) where the <head> is set per-route via something like next/head or react-helmet should still put the script in the static document template (e.g., _document.tsx, public/index.html), not in a per-route Head. That way it loads once and persists across navigation.",
    ],
  },
];

const CATEGORIES: Array<{ key: Guide["category"]; label: string; sub: string }> = [
  { key: "CMS", label: "CMS", sub: "Content management systems" },
  { key: "Builder", label: "Site builders", sub: "Drag-and-drop website tools" },
  { key: "E-commerce", label: "E-commerce", sub: "Online stores" },
  { key: "Universal", label: "Universal", sub: "Works on any site" },
  { key: "Other", label: "Custom code", sub: "You have access to the source" },
];

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function publicLayout(title: string, description: string, body: string): string {
  // Public, indexable. Different from the dashboard's noindex layout.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#121212">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="article">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=DM+Mono:ital,wght@0,300;0,400;0,500&family=Barlow+Condensed:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<div class="grain" aria-hidden="true"></div>
<main class="page" style="max-width:760px;margin:0 auto;padding:48px 24px 80px">
  <div style="font-family:var(--serif);font-size:20px;font-style:italic;color:var(--gold);margin-bottom:48px">
    <a href="/" style="color:inherit;text-decoration:none">Never Ranked</a>
  </div>
  ${body}
  <div style="margin-top:64px;padding-top:24px;border-top:1px solid var(--line);font-size:12px;color:var(--text-faint)">
    Don't see your platform? Email <a href="mailto:hello@neverranked.com" style="color:var(--gold)">hello@neverranked.com</a> and we'll write you a guide.
  </div>
</main>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Index page
// ---------------------------------------------------------------------------

export async function handleInstallIndex(_request: Request, _env: Env): Promise<Response> {
  const sections = CATEGORIES.map((cat) => {
    const items = GUIDES.filter((g) => g.category === cat.key);
    if (items.length === 0) return "";
    return `
      <div style="margin-bottom:40px">
        <div style="font-family:var(--label);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);margin-bottom:6px">${esc(cat.label)}</div>
        <div style="font-size:13px;color:var(--text-faint);margin-bottom:14px">${esc(cat.sub)}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">
          ${items.map((g) => `
            <a href="/install/${esc(g.slug)}" style="display:block;padding:14px 16px;background:var(--bg-edge);border:1px solid var(--line);border-radius:4px;text-decoration:none;color:inherit;transition:border-color .2s">
              <div style="font-family:var(--serif);font-size:16px;color:var(--text);margin-bottom:4px">${esc(g.name)}</div>
              <div style="font-size:12px;color:var(--text-faint);line-height:1.5">${esc(g.oneLiner)}</div>
            </a>
          `).join("")}
        </div>
      </div>
    `;
  }).join("");

  const body = `
    <div style="margin-bottom:32px">
      <div class="label" style="margin-bottom:8px;color:var(--text-faint)">Install the snippet</div>
      <h1 style="margin-bottom:12px;font-family:var(--serif);font-size:34px;font-style:italic;color:var(--text)">Pick your platform.</h1>
      <p style="color:var(--text-faint);font-size:15px;line-height:1.7;max-width:560px">
        Each guide is short, specific, and works. Once the snippet is live we push schema fixes to your site automatically and the AEO score starts moving the next Monday.
      </p>
    </div>
    ${sections}
  `;

  return html(publicLayout(
    "Install the NeverRanked snippet on your site",
    "Step-by-step guides for adding the NeverRanked schema injection snippet on WordPress, Shopify, Squarespace, Wix, Webflow, and 10+ other platforms.",
    body,
  ));
}

// ---------------------------------------------------------------------------
// Per-platform guide
// ---------------------------------------------------------------------------

function snippetForSlug(slug: string | null): { code: string; isReal: boolean } {
  // Slug pattern matches what the agency / admin systems use elsewhere.
  if (slug && /^[a-z0-9][a-z0-9-]{0,60}[a-z0-9]$/.test(slug)) {
    return {
      code: `<script async src="https://app.neverranked.com/inject/${slug}.js"></script>`,
      isReal: true,
    };
  }
  return { code: PLACEHOLDER_SNIPPET, isReal: false };
}

export async function handleInstallGuide(platform: string, request: Request, _env: Env): Promise<Response> {
  const guide = GUIDES.find((g) => g.slug === platform);
  if (!guide) {
    // Soft 404: show the index page with a not-found note.
    const url = new URL(request.url);
    const body = `
      <div style="margin-bottom:32px">
        <div class="label" style="margin-bottom:8px;color:var(--red)">Guide not found</div>
        <h1 style="margin-bottom:12px;font-family:var(--serif);font-size:28px;font-style:italic">We don't have a guide for "${esc(platform)}" yet.</h1>
        <p style="color:var(--text-faint);font-size:14px;line-height:1.7;max-width:540px">
          <a href="/install" style="color:var(--gold)">See all platforms</a>, or email <a href="mailto:hello@neverranked.com" style="color:var(--gold)">hello@neverranked.com</a> and we'll write one for you.
        </p>
      </div>
    `;
    return html(publicLayout("Install guide not found", `No install guide for ${platform}.`, body), 404);
  }

  const url = new URL(request.url);
  const slugParam = url.searchParams.get("slug");
  const { code, isReal } = snippetForSlug(slugParam);

  const snippetBlock = `
    <div style="margin:8px 0 24px">
      <div style="position:relative">
        <pre style="margin:0;padding:18px 20px;background:#0f0f0f;border-radius:4px;overflow-x:auto;font-family:var(--mono);font-size:13px;color:var(--gold);line-height:1.5">${esc(code)}</pre>
        <button type="button" onclick="(function(b){var t=b.previousElementSibling.textContent;if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){b.textContent='Copied!';setTimeout(function(){b.textContent='Copy';},1500);});}else{window.prompt('Copy:',t);}})(this)" style="position:absolute;top:10px;right:10px;padding:4px 12px;background:var(--bg-edge);border:1px solid var(--line);color:var(--text-faint);font-family:var(--label);font-size:10px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;border-radius:2px">Copy</button>
      </div>
      <div style="margin-top:8px;font-size:12px;color:var(--text-faint)">
        ${isReal
          ? `Snippet pre-filled for client <strong style="color:var(--text)">${esc(slugParam!)}</strong>. Copy and paste exactly.`
          : `Replace <strong style="color:var(--text)">&lt;your-slug&gt;</strong> with the slug NeverRanked sent you. The slug is in your snippet delivery email.`}
      </div>
    </div>
  `;

  const prereqList = guide.prereqs.length > 0 ? `
    <div style="margin-bottom:28px">
      <div class="label" style="margin-bottom:8px;color:var(--gold)">Before you start</div>
      <ul style="margin:0;padding-left:20px;color:var(--text);font-size:14px;line-height:1.8">
        ${guide.prereqs.map((p) => `<li>${esc(p)}</li>`).join("")}
      </ul>
    </div>
  ` : "";

  const stepList = guide.steps.map((s, i) => `
    <div style="display:flex;gap:14px;padding:16px 0;border-bottom:1px solid var(--line)">
      <div style="flex-shrink:0;width:28px;height:28px;border-radius:50%;border:1.5px solid var(--gold);display:flex;align-items:center;justify-content:center;font-family:var(--label);font-size:13px;color:var(--gold)">${i + 1}</div>
      <div style="flex:1;min-width:0">
        <div style="font-family:var(--serif);font-size:16px;color:var(--text);margin-bottom:6px">${esc(s.title)}</div>
        <div style="font-size:13px;color:var(--text-faint);line-height:1.7">${esc(s.detail)}</div>
      </div>
    </div>
  `).join("");

  const gotchasBlock = guide.gotchas.length > 0 ? `
    <div style="margin-top:32px;padding:20px 24px;background:var(--bg-lift);border-left:3px solid var(--yellow);border-radius:0 4px 4px 0">
      <div class="label" style="margin-bottom:10px;color:var(--yellow)">Common gotchas</div>
      <ul style="margin:0;padding-left:20px;font-size:13px;color:var(--text-faint);line-height:1.8">
        ${guide.gotchas.map((g) => `<li>${esc(g)}</li>`).join("")}
      </ul>
    </div>
  ` : "";

  const notesBlock = guide.notes ? `
    <div style="margin-top:24px;padding:16px 20px;background:rgba(232,199,103,.04);border:1px solid var(--gold-dim);border-radius:4px;font-size:13px;color:var(--text-faint);line-height:1.7">
      ${esc(guide.notes)}
    </div>
  ` : "";

  const body = `
    <div style="margin-bottom:8px">
      <a href="/install" style="font-size:12px;color:var(--gold);text-decoration:none">&larr; All platforms</a>
    </div>
    <div style="margin-bottom:28px">
      <div class="label" style="margin-bottom:8px;color:var(--text-faint)">${esc(guide.category)} guide</div>
      <h1 style="margin:0 0 12px;font-family:var(--serif);font-size:32px;font-style:italic;color:var(--text)">Install on <em>${esc(guide.name)}</em></h1>
      <p style="color:var(--text-faint);font-size:15px;line-height:1.7;margin:0;max-width:560px">${esc(guide.oneLiner)}</p>
    </div>

    <div class="label" style="margin-bottom:8px;color:var(--gold)">The snippet</div>
    ${snippetBlock}

    ${prereqList}

    <div style="margin-bottom:8px" class="label" style="color:var(--gold)">Steps</div>
    <div style="margin-bottom:8px">${stepList}</div>

    <div style="margin-top:32px;padding:20px 24px;background:rgba(74,222,128,.04);border-left:3px solid var(--green);border-radius:0 4px 4px 0">
      <div class="label" style="margin-bottom:8px;color:var(--green)">How to verify</div>
      <div style="font-size:13px;color:var(--text);line-height:1.7">${esc(guide.verify)}</div>
    </div>

    ${gotchasBlock}

    ${notesBlock}
  `;

  return html(publicLayout(
    `Install NeverRanked on ${guide.name} -- ${guide.oneLiner}`,
    `Step-by-step guide for adding the NeverRanked schema injection snippet to a ${guide.name} site. ${guide.oneLiner}`,
    body,
  ));
}

// ---------------------------------------------------------------------------
// Helper: list of platforms for use in emails / dashboard pickers
// ---------------------------------------------------------------------------

export function getInstallPlatforms(): { slug: string; name: string }[] {
  return GUIDES.map((g) => ({ slug: g.slug, name: g.name }));
}
