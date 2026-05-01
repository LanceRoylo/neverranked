/**
 * Dashboard — Domain detail route
 */

import type { Env, User, Domain, ScanResult, RoadmapItem, CitationSnapshot, GscSnapshot } from "../types";
import { layout, html, esc, redirect, safeParse, shortDate, longDate, fullDate } from "../render";
import { generateNarrative } from "../narrative";
import { scanDomain } from "../scanner";
import { autoCompleteRoadmapItems } from "../auto-complete";
import { canAccessClient } from "../agency";
import { buildGlossary } from "../glossary";
import { buildDomainStatusStrip } from "../status";
import { computeCitationLift, renderCitationLiftBlock } from "../citation-lift";

/** Build a getting-started checklist for new clients */
/**
 * Persistent banner shown when the snippet still isn't installed.
 * Most acute churn risk: user pays, never installs, score doesn't move
 * because we can't push fixes, they conclude "this isn't working,"
 * they cancel. The banner reframes the situation honestly: "you're in
 * measurement mode -- here's what's running, here's what installation
 * unlocks." Plus a "give this to your dev" mailto so they have a one-
 * click forward instead of digging through their inbox.
 *
 * Hides for: admin role (this is for clients/agencies), competitor
 * domains, and anything where the snippet is detected.
 */
function buildMeasurementModeBanner(domain: Domain, env: Env): string {
  if (domain.snippet_last_detected_at) return "";
  if (domain.is_competitor) return "";

  const origin = (env as { DASHBOARD_ORIGIN?: string }).DASHBOARD_ORIGIN || "https://app.neverranked.com";
  const snippetTagText = `<script async src="${origin}/inject/${domain.client_slug}.js"></script>`;
  const installUrl = `${origin}/install?slug=${encodeURIComponent(domain.client_slug)}`;

  // Pre-fill an email the user can forward to their dev.
  const subject = encodeURIComponent(`Install snippet on ${domain.domain} (NeverRanked)`);
  const body = encodeURIComponent(
    `Hi,\n\n` +
    `Quick favor. We use NeverRanked to score how visible ${domain.domain} ` +
    `is to AI engines (ChatGPT, Perplexity, Google AI Overviews). To turn ` +
    `on the auto-fix part of the platform, we need to add one line of ` +
    `JavaScript to the site's <head> tag.\n\n` +
    `Snippet:\n\n${snippetTagText}\n\n` +
    `Where it goes: inside the <head> on every page (or in the site-wide ` +
    `layout template). Most CMS platforms have a "Custom Header HTML" field.\n\n` +
    `Step-by-step guides for every common platform are here, with the ` +
    `snippet pre-filled for our account:\n\n${installUrl}\n\n` +
    `Once it's live, NeverRanked pushes schema fixes to the site automatically ` +
    `every week. No more dev tickets going forward.\n\n` +
    `Questions? Reply here. Thanks.`
  );
  const mailto = `mailto:?subject=${subject}&body=${body}`;

  return `
    <div style="margin-bottom:32px;padding:18px 22px;background:rgba(232,199,103,.06);border:1px solid var(--gold-dim);border-radius:4px">
      <div style="display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap">
        <div style="flex:1;min-width:240px">
          <div class="label" style="margin-bottom:6px;color:var(--gold)">Measurement mode</div>
          <div style="font-size:14px;color:var(--text);line-height:1.6;margin-bottom:6px">
            We're scoring <strong>${esc(domain.domain)}</strong> and tracking AI citations every week.
            Install the snippet to also unlock <strong>autonomous schema fixes</strong> -- we push the fixes for you instead of waiting on your dev.
          </div>
          <div style="font-size:12px;color:var(--text-faint)">
            One paste in your site header. Five minutes on most platforms.
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;flex-shrink:0">
          <a href="${esc(installUrl)}" target="_blank" rel="noopener" class="btn" style="padding:8px 14px;font-size:11px">Install guide &rarr;</a>
          <a href="${esc(mailto)}" class="btn btn-ghost" style="padding:8px 14px;font-size:11px" title="Opens your email client with the install instructions pre-filled. Forward to whoever manages your site.">Email to dev</a>
        </div>
      </div>
    </div>
  `;
}

/**
 * Setup completeness widget. Persistent on /domain/:id until the
 * client has completed all five activation steps. Each row strikes
 * through as it's done; the whole widget vanishes at 5/5.
 *
 * Lives ABOVE the measurement-mode banner so the order of attention
 * is: "here's what's missing" -> "here's the impact of one specific
 * missing thing (snippet)" -> "here's your dashboard."
 */
async function buildSetupCompletenessWidget(domain: Domain, user: User, env: Env): Promise<string> {
  if (domain.is_competitor) return "";

  // Run all checks in parallel.
  const [hasGsc, keywordCount, scanCount, shareCount] = await Promise.all([
    env.DB.prepare(
      "SELECT 1 FROM gsc_properties WHERE client_slug = ? LIMIT 1"
    ).bind(domain.client_slug).first<unknown>(),
    env.DB.prepare(
      "SELECT COUNT(*) AS cnt FROM citation_keywords WHERE client_slug = ? AND active = 1"
    ).bind(domain.client_slug).first<{ cnt: number }>(),
    env.DB.prepare(
      "SELECT COUNT(*) AS cnt FROM scan_results WHERE domain_id = ? AND error IS NULL"
    ).bind(domain.id).first<{ cnt: number }>(),
    env.DB.prepare(
      "SELECT COUNT(*) AS cnt FROM shared_reports WHERE domain_id = ?"
    ).bind(domain.id).first<{ cnt: number }>(),
  ]);

  const steps: { label: string; done: boolean; href?: string; cta?: string }[] = [
    {
      label: "First scan complete",
      done: (scanCount?.cnt || 0) > 0,
    },
    {
      label: "Snippet installed on the site",
      done: !!domain.snippet_last_detected_at,
      href: `/install?slug=${encodeURIComponent(domain.client_slug)}`,
      cta: "Install guide",
    },
    {
      label: "Google Search Console connected",
      done: !!hasGsc,
      href: `/gsc`,
      cta: "Connect",
    },
    {
      label: "Citation keywords added",
      done: (keywordCount?.cnt || 0) > 0,
      href: `/citations/${domain.client_slug}`,
      cta: "Add keywords",
    },
    {
      label: "Shared a report with a stakeholder",
      done: (shareCount?.cnt || 0) > 0,
      href: `/report/${domain.client_slug}`,
      cta: "Open report",
    },
  ];

  const done = steps.filter((s) => s.done).length;
  const total = steps.length;
  if (done === total) return "";

  const rows = steps.map((s) => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)">
      <span style="font-family:var(--mono);width:18px;color:${s.done ? 'var(--green)' : 'var(--text-faint)'};font-size:14px;flex-shrink:0">${s.done ? '&check;' : '&middot;'}</span>
      <span style="flex:1;font-size:13px;${s.done ? 'color:var(--text-faint);text-decoration:line-through' : 'color:var(--text)'}">${esc(s.label)}</span>
      ${!s.done && s.href ? `<a href="${s.href}" class="btn btn-ghost" style="padding:4px 10px;font-size:11px;flex-shrink:0">${esc(s.cta || "Open")}</a>` : ""}
    </div>
  `).join("");

  return `
    <div style="margin-bottom:32px;padding:18px 22px;background:var(--bg-lift);border:1px solid var(--gold-dim);border-radius:4px">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px;gap:16px">
        <div>
          <div class="label" style="margin-bottom:6px;color:var(--gold)">Setup checklist</div>
          <div style="font-size:12px;color:var(--text-faint)">Each item below unlocks more of the platform. Card disappears at 5/5.</div>
        </div>
        <span class="label" style="font-size:11px">${done} of ${total} done</span>
      </div>
      <div>${rows}</div>
    </div>
  `;
}

async function buildGettingStarted(domain: Domain, user: User, env: Env): Promise<string> {
  // Only show for clients, not admins
  if (user.role === "admin") return "";

  const slug = domain.client_slug;

  // Check completion of each step
  const steps: { label: string; done: boolean; href: string; description: string }[] = [];

  // 1. Review your AEO report (always done if they're on this page)
  steps.push({
    label: "Review your AEO report",
    done: true,
    href: `/domain/${domain.id}`,
    description: "Understand your current score and what it means",
  });

  // 2. Add competitors
  const compCount = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM domains WHERE client_slug = ? AND is_competitor = 1 AND active = 1"
  ).bind(slug).first<{ cnt: number }>();
  steps.push({
    label: "Add your competitors",
    done: (compCount?.cnt || 0) > 0,
    href: `/competitors/${slug}`,
    description: "See how you stack up against the competition",
  });

  // 3. Connect Google Search Console
  const gscProp = await env.DB.prepare(
    "SELECT id FROM gsc_properties WHERE client_slug = ?"
  ).bind(slug).first();
  steps.push({
    label: "Connect Google Search Console",
    done: !!gscProp,
    href: "/settings",
    description: "Bring in your real search performance data",
  });

  // 4. Review your roadmap
  const roadmapViewed = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM roadmap_items WHERE client_slug = ?"
  ).bind(slug).first<{ cnt: number }>();
  const hasRoadmap = (roadmapViewed?.cnt || 0) > 0;
  steps.push({
    label: "Review your roadmap",
    done: hasRoadmap,
    href: `/roadmap/${slug}`,
    description: "Your prioritized action plan for improving AEO readiness",
  });

  // 5. Read the AEO primer
  steps.push({
    label: "Learn what AEO means",
    done: false, // We can't track this without adding page view tracking, so keep it as a nudge
    href: "/learn/what-is-aeo",
    description: "5-minute read on why AI engine optimization matters",
  });

  const doneCount = steps.filter(s => s.done).length;

  // If all steps are done (except the learn one which we can't track), hide the widget
  if (doneCount >= 4) return "";

  const stepRows = steps.map(s => `
    <a href="${s.href}" style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(251,248,239,.06);text-decoration:none;transition:opacity .2s${s.done ? ';opacity:.5' : ''}" ${s.done ? '' : 'onmouseover="this.style.opacity=\'.8\'" onmouseout="this.style.opacity=\'1\'"'}>
      <div style="flex-shrink:0;width:22px;height:22px;border-radius:50%;${s.done ? 'background:var(--green);' : 'border:2px solid var(--line);'}display:flex;align-items:center;justify-content:center">
        ${s.done ? '<span style="color:#080808;font-size:12px;font-weight:bold">&#10003;</span>' : ''}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;color:${s.done ? 'var(--text-faint)' : 'var(--text)'};${s.done ? 'text-decoration:line-through' : ''}">${s.label}</div>
        <div style="font-size:11px;color:var(--text-faint);margin-top:2px">${s.description}</div>
      </div>
      ${!s.done ? '<span style="font-family:var(--mono);font-size:11px;color:var(--gold);flex-shrink:0">&rarr;</span>' : ''}
    </a>
  `).join("");

  return `
    <div class="no-print" style="margin-bottom:48px;padding:20px 24px;background:var(--bg-lift);border:1px solid var(--gold-dim);border-radius:4px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div>
          <div class="label" style="color:var(--gold);margin-bottom:4px">Getting Started</div>
          <div style="font-size:12px;color:var(--text-faint)">${doneCount} of ${steps.length} complete</div>
        </div>
        <div style="width:48px;height:48px;border-radius:50%;border:3px solid var(--line);display:flex;align-items:center;justify-content:center;position:relative">
          <svg width="48" height="48" style="position:absolute;top:-3px;left:-3px;transform:rotate(-90deg)">
            <circle cx="24" cy="24" r="21" fill="none" stroke="var(--gold)" stroke-width="3" stroke-dasharray="${(doneCount / steps.length) * 132} 132" stroke-linecap="round"/>
          </svg>
          <span style="font-family:var(--mono);font-size:13px;color:var(--gold);position:relative">${Math.round((doneCount / steps.length) * 100)}%</span>
        </div>
      </div>
      ${stepRows}
    </div>
  `;
}

/** Generate a JSON-LD template for a given schema type */
function getSchemaTemplate(type: string, domain: string): string | null {
  const url = `https://${domain}`;
  const templates: Record<string, object> = {
    Organization: {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Your Business Name",
      url: url,
      logo: `${url}/logo.png`,
      description: "A brief description of your business.",
      sameAs: [
        "https://www.facebook.com/yourbusiness",
        "https://www.linkedin.com/company/yourbusiness",
      ],
      contactPoint: {
        "@type": "ContactPoint",
        telephone: "+1-555-000-0000",
        contactType: "customer service",
      },
    },
    LocalBusiness: {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: "Your Business Name",
      url: url,
      telephone: "+1-555-000-0000",
      address: {
        "@type": "PostalAddress",
        streetAddress: "123 Main St",
        addressLocality: "Your City",
        addressRegion: "ST",
        postalCode: "00000",
        addressCountry: "US",
      },
      openingHoursSpecification: {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "09:00",
        closes: "17:00",
      },
    },
    FAQPage: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What services do you offer?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "We offer [describe your services here].",
          },
        },
        {
          "@type": "Question",
          name: "How can I contact you?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "You can reach us at [your contact details].",
          },
        },
      ],
    },
    BreadcrumbList: {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: url },
        { "@type": "ListItem", position: 2, name: "Services", item: `${url}/services` },
        { "@type": "ListItem", position: 3, name: "Current Page" },
      ],
    },
    Product: {
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Product Name",
      description: "Product description.",
      url: `${url}/product`,
      image: `${url}/product.jpg`,
      brand: { "@type": "Brand", name: "Your Brand" },
      offers: {
        "@type": "Offer",
        price: "29.99",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
      },
    },
    Article: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Article Title",
      author: { "@type": "Person", name: "Author Name" },
      datePublished: "2025-01-01",
      dateModified: "2025-01-01",
      publisher: {
        "@type": "Organization",
        name: "Your Business Name",
        logo: { "@type": "ImageObject", url: `${url}/logo.png` },
      },
      image: `${url}/article-image.jpg`,
      description: "A brief summary of the article.",
    },
    WebSite: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Your Business Name",
      url: url,
      potentialAction: {
        "@type": "SearchAction",
        target: `${url}/search?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    Service: {
      "@context": "https://schema.org",
      "@type": "Service",
      name: "Service Name",
      description: "What this service does.",
      provider: { "@type": "Organization", name: "Your Business Name" },
      areaServed: { "@type": "Place", name: "Your Service Area" },
      serviceType: "Your Service Category",
    },
    AggregateRating: {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: "Your Business Name",
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.8",
        reviewCount: "120",
        bestRating: "5",
      },
    },
    Review: {
      "@context": "https://schema.org",
      "@type": "Review",
      itemReviewed: { "@type": "LocalBusiness", name: "Your Business Name" },
      author: { "@type": "Person", name: "Customer Name" },
      reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
      reviewBody: "Great experience with this business.",
      datePublished: "2025-01-01",
    },
  };

  const tmpl = templates[type];
  if (!tmpl) return null;
  return JSON.stringify(tmpl, null, 2);
}

/** Build the "missing schema" snippet section */
function buildSchemaSnippets(schemaCoverage: { type: string; present: boolean }[], domain: string): string {
  const missing = schemaCoverage.filter(s => !s.present);
  if (missing.length === 0) return "";

  const snippets = missing.map(s => {
    const tmpl = getSchemaTemplate(s.type, domain);
    if (!tmpl) return "";

    const id = "snippet-" + s.type.toLowerCase().replace(/[^a-z0-9]/g, "-");
    return `
      <div style="margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px 4px 0 0;cursor:pointer" onclick="var el=document.getElementById('${id}');el.style.display=el.style.display==='none'?'block':'none'">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(251,248,239,.08);border:1px solid rgba(251,248,239,.12)"></span>
            <span style="font-size:13px;color:var(--text)">${esc(s.type)}</span>
            <span style="font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--red);border:1px solid var(--red);padding:1px 6px;border-radius:2px">MISSING</span>
          </div>
          <span style="font-family:var(--mono);font-size:11px;color:var(--text-faint)">View template</span>
        </div>
        <div id="${id}" style="display:none;border:1px solid var(--line);border-top:none;border-radius:0 0 4px 4px;overflow:hidden">
          <div style="display:flex;justify-content:flex-end;padding:8px 12px;background:rgba(251,248,239,.02);border-bottom:1px solid var(--line)">
            <button onclick="navigator.clipboard.writeText(document.getElementById('${id}-code').textContent);this.textContent='Copied'" style="font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);background:none;border:1px solid var(--gold-dim);padding:4px 12px;border-radius:2px;cursor:pointer">Copy JSON-LD</button>
          </div>
          <pre id="${id}-code" style="margin:0;padding:16px;background:var(--bg-edge);font-family:var(--mono);font-size:11px;color:var(--text-soft);line-height:1.6;overflow-x:auto;white-space:pre">&lt;script type="application/ld+json"&gt;
${esc(tmpl)}
&lt;/script&gt;</pre>
        </div>
      </div>
    `;
  }).filter(s => s).join("");

  if (!snippets) return "";

  return `
    <div style="margin-bottom:48px">
      <div class="label" style="margin-bottom:4px">Schema Templates</div>
      <div style="font-size:12px;color:var(--text-faint);margin-bottom:16px">Ready-to-use JSON-LD for missing schema types. Click to expand, copy, and add to your site's &lt;head&gt;. Replace placeholder values with your actual business information.</div>
      ${snippets}
    </div>
  `;
}

/** Estimate projected score based on remaining roadmap items */
async function buildScoreProjection(clientSlug: string, currentScore: number, env: Env): Promise<string> {
  const items = (await env.DB.prepare(
    "SELECT category, status FROM roadmap_items WHERE client_slug = ?"
  ).bind(clientSlug).all<{ category: string; status: string }>()).results;

  if (items.length === 0) return "";

  const remaining = items.filter(i => i.status !== "done");
  const done = items.filter(i => i.status === "done");

  if (remaining.length === 0) return "";

  // Point estimates per category -- conservative, based on typical scan impact
  const categoryPoints: Record<string, number> = {
    schema: 4,      // Adding a schema type typically gains 3-5 pts
    technical: 5,    // Fixing technical issues (meta desc, headings, HTTPS) has strong impact
    content: 3,      // Content improvements have moderate scan impact
    authority: 2,    // Authority signals are harder to measure in scans
    advanced: 2,     // Advanced items are incremental
  };

  // Calculate projected gains by category
  const gains: { category: string; count: number; points: number }[] = [];
  const catCounts = new Map<string, number>();
  for (const item of remaining) {
    const cat = item.category || "other";
    catCounts.set(cat, (catCounts.get(cat) || 0) + 1);
  }

  let totalGain = 0;
  for (const [cat, count] of catCounts) {
    const perItem = categoryPoints[cat] || 2;
    // Diminishing returns: first items in a category worth more, later ones less
    const effectivePoints = Math.round(count * perItem * 0.7); // 70% discount for diminishing returns
    gains.push({ category: cat, count, points: effectivePoints });
    totalGain += effectivePoints;
  }

  // Cap projected score at 100
  const projectedScore = Math.min(100, currentScore + totalGain);

  // Don't show if projection barely moves the needle
  if (projectedScore - currentScore < 3) return "";

  gains.sort((a, b) => b.points - a.points);

  // Build the visual
  const currentPct = currentScore;
  const projectedPct = projectedScore;

  // Progress bar showing current vs projected
  const barWidth = 320;
  const currentWidth = (currentPct / 100) * barWidth;
  const projectedWidth = (projectedPct / 100) * barWidth;

  const gainBreakdown = gains.map(g => {
    const catLabel = g.category.charAt(0).toUpperCase() + g.category.slice(1);
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(251,248,239,.06)">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-family:var(--label);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint)">${esc(catLabel)}</span>
          <span style="font-family:var(--mono);font-size:11px;color:var(--text-faint)">${g.count} item${g.count !== 1 ? 's' : ''}</span>
        </div>
        <span style="font-family:var(--mono);font-size:12px;color:var(--green)">+${g.points} pts</span>
      </div>`;
  }).join("");

  return `
    <div style="margin-bottom:48px">
      <div class="label" style="margin-bottom:4px">Score Projection</div>
      <div style="font-size:12px;color:var(--text-faint);margin-bottom:16px">Estimated score if all remaining roadmap items are completed. Based on typical impact per category with diminishing returns.</div>
      <div style="background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;padding:24px">
        <div style="display:flex;align-items:center;gap:24px;margin-bottom:20px;flex-wrap:wrap">
          <div style="text-align:center">
            <div style="font-family:var(--mono);font-size:32px;color:var(--text)">${currentScore}</div>
            <div style="font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint);margin-top:4px">Current</div>
          </div>
          <div style="font-family:var(--mono);font-size:20px;color:var(--text-faint)">-></div>
          <div style="text-align:center">
            <div style="font-family:var(--mono);font-size:32px;color:var(--gold)">${projectedScore}</div>
            <div style="font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);margin-top:4px">Projected</div>
          </div>
          <div style="flex:1;min-width:200px">
            <div style="position:relative;height:24px;background:var(--bg-edge);border-radius:12px;overflow:hidden">
              <div style="position:absolute;left:0;top:0;height:100%;width:${(projectedPct / 100) * 100}%;background:rgba(232,199,103,.15);border-radius:12px;transition:width .3s"></div>
              <div style="position:absolute;left:0;top:0;height:100%;width:${(currentPct / 100) * 100}%;background:var(--gold);border-radius:12px;transition:width .3s"></div>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:4px">
              <span style="font-family:var(--mono);font-size:10px;color:var(--text-faint)">0</span>
              <span style="font-family:var(--mono);font-size:10px;color:var(--text-faint)">100</span>
            </div>
          </div>
        </div>
        <div style="font-family:var(--label);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint);margin-bottom:8px">Estimated gains by category</div>
        ${gainBreakdown}
        <div style="display:flex;align-items:center;justify-content:space-between;padding-top:10px;margin-top:4px">
          <span style="font-size:12px;color:var(--text-faint)">${done.length} of ${items.length} items completed</span>
          <span style="font-family:var(--mono);font-size:13px;color:var(--green);font-weight:500">+${projectedScore - currentScore} pts potential</span>
        </div>
      </div>
    </div>
  `;
}

/** Content topic suggestions from citation gaps */
async function buildContentTopics(clientSlug: string, env: Env): Promise<string> {
  // Get keywords where client is NOT cited but at least one competitor is
  const gaps = (await env.DB.prepare(`
    SELECT ck.keyword, ck.category, cr.engine, cr.cited_entities
    FROM citation_runs cr
    JOIN citation_keywords ck ON ck.id = cr.keyword_id
    WHERE ck.client_slug = ?
      AND cr.client_cited = 0
      AND cr.cited_entities != '[]'
    ORDER BY cr.run_at DESC
  `).bind(clientSlug).all<{
    keyword: string;
    category: string;
    engine: string;
    cited_entities: string;
  }>()).results;

  if (gaps.length === 0) return "";

  // Deduplicate by keyword, collect engines and competitors
  const keywordMap = new Map<string, {
    keyword: string;
    category: string;
    engines: Set<string>;
    competitors: Set<string>;
  }>();

  for (const g of gaps) {
    const existing = keywordMap.get(g.keyword);
    let entities: { name: string }[] = [];
    try { entities = JSON.parse(g.cited_entities); } catch {}
    const compNames = entities.map(e => e.name).filter(Boolean);

    if (existing) {
      existing.engines.add(g.engine);
      compNames.forEach(c => existing.competitors.add(c));
    } else {
      keywordMap.set(g.keyword, {
        keyword: g.keyword,
        category: g.category,
        engines: new Set([g.engine]),
        competitors: new Set(compNames),
      });
    }
  }

  // Limit to top 10 most impactful gaps (most engines + competitors)
  const sorted = [...keywordMap.values()]
    .sort((a, b) => (b.engines.size + b.competitors.size) - (a.engines.size + a.competitors.size))
    .slice(0, 10);

  if (sorted.length === 0) return "";

  // Group by category
  const byCategory = new Map<string, typeof sorted>();
  for (const item of sorted) {
    const cat = item.category || "general";
    const arr = byCategory.get(cat) || [];
    arr.push(item);
    byCategory.set(cat, arr);
  }

  const categoryBlocks = [...byCategory.entries()].map(([cat, items]) => {
    const catLabel = cat.charAt(0).toUpperCase() + cat.slice(1);
    const rows = items.map(item => {
      const engines = [...item.engines].join(", ");
      const topComps = [...item.competitors].slice(0, 3).join(", ");
      return `
        <div style="padding:12px 16px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;margin-bottom:8px">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
            <div style="flex:1;min-width:0">
              <div style="font-size:14px;color:var(--text);margin-bottom:4px">${esc(item.keyword)}</div>
              <div style="font-size:11px;color:var(--text-faint)">
                Competitors cited: ${topComps ? esc(topComps) : 'various'}
              </div>
            </div>
            <div style="flex-shrink:0;text-align:right">
              <div style="font-family:var(--label);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--red);border:1px solid var(--red);padding:2px 8px;border-radius:2px;white-space:nowrap">Not cited</div>
              <div style="font-size:10px;color:var(--text-faint);margin-top:4px">${engines}</div>
            </div>
          </div>
        </div>`;
    }).join("");

    return `
      <div style="margin-bottom:16px">
        <div style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);margin-bottom:8px">${esc(catLabel)}</div>
        ${rows}
      </div>`;
  }).join("");

  return `
    <div style="margin-bottom:48px">
      <div class="label" style="margin-bottom:4px">Content Opportunities</div>
      <div style="font-size:12px;color:var(--text-faint);margin-bottom:16px">Keywords where competitors get cited by AI engines but you don't. Creating authoritative content on these topics can improve your citation share.</div>
      ${categoryBlocks}
      <div style="margin-top:8px">
        <a href="/citations/${esc(clientSlug)}" style="font-size:12px;color:var(--gold)">View full citation tracking -></a>
      </div>
    </div>
  `;
}

/** Citation share trend mini-chart */
async function buildCitationTrend(clientSlug: string, env: Env): Promise<string> {
  const snapshots = (await env.DB.prepare(
    "SELECT citation_share, client_citations, total_queries, week_start FROM citation_snapshots WHERE client_slug = ? ORDER BY week_start ASC LIMIT 12"
  ).bind(clientSlug).all<{
    citation_share: number;
    client_citations: number;
    total_queries: number;
    week_start: number;
  }>()).results;

  if (snapshots.length < 2) return "";

  const W = 400;
  const H = 120;
  const PAD_L = 36;
  const PAD_R = 16;
  const PAD_T = 12;
  const PAD_B = 24;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const shares = snapshots.map(s => s.citation_share * 100);
  const maxShare = Math.max(...shares, 20); // At least 20% scale
  const minShare = 0;
  const range = maxShare - minShare;

  const points = snapshots.map((s, i) => {
    const x = PAD_L + (i / (snapshots.length - 1)) * chartW;
    const pct = s.citation_share * 100;
    const y = PAD_T + chartH - ((pct - minShare) / range) * chartH;
    return { x, y, pct, date: new Date(s.week_start * 1000) };
  });

  const polyline = points.map(p => p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ");
  const areaPath = "M " + points[0].x.toFixed(1) + "," + (PAD_T + chartH).toFixed(1) + " " +
    points.map(p => "L " + p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ") +
    " L " + points[points.length - 1].x.toFixed(1) + "," + (PAD_T + chartH).toFixed(1) + " Z";

  // Date labels (first and last)
  const firstDate = points[0].date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const lastDate = points[points.length - 1].date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const latest = snapshots[snapshots.length - 1];
  const prev = snapshots[snapshots.length - 2];
  const latestPct = (latest.citation_share * 100).toFixed(0);
  const diff = (latest.citation_share - prev.citation_share) * 100;
  const diffText = diff > 0.5 ? `<span style="color:var(--green)">+${diff.toFixed(0)}%</span>` :
    diff < -0.5 ? `<span style="color:var(--red)">${diff.toFixed(0)}%</span>` :
    `<span style="color:var(--text-faint)">steady</span>`;

  return `
    <div style="margin-bottom:48px">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px">
        <div class="label">Citation Share Trend</div>
        <a href="/citations/${esc(clientSlug)}" style="font-size:11px;color:var(--gold)">Full report -></a>
      </div>
      <div style="background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;padding:20px">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px">
          <span style="font-family:var(--mono);font-size:24px;color:var(--text)">${latestPct}%</span>
          <span style="font-size:12px;color:var(--text-faint)">citation share (${diffText} vs last week)</span>
        </div>
        <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block">
          <defs>
            <linearGradient id="citGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--gold)" stop-opacity="0.2"/>
              <stop offset="100%" stop-color="var(--gold)" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <line x1="${PAD_L}" y1="${PAD_T + chartH}" x2="${W - PAD_R}" y2="${PAD_T + chartH}" stroke="rgba(251,248,239,.1)"/>
          <path d="${areaPath}" fill="url(#citGrad)"/>
          <polyline points="${polyline}" fill="none" stroke="var(--gold)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
          ${points.map((p, i) => i === points.length - 1 ? `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="var(--gold)" stroke="var(--bg)" stroke-width="2"/>` : '').join('')}
          <text x="${PAD_L}" y="${H - 4}" fill="rgba(251,248,239,.3)" font-size="9" font-family="var(--mono)">${firstDate}</text>
          <text x="${W - PAD_R}" y="${H - 4}" text-anchor="end" fill="rgba(251,248,239,.3)" font-size="9" font-family="var(--mono)">${lastDate}</text>
        </svg>
        <div style="font-size:11px;color:var(--text-faint);margin-top:8px">${latest.client_citations} of ${latest.total_queries} tracked queries cite you</div>
      </div>
    </div>
  `;
}

async function buildProgressTimeline(clientSlug: string, env: Env): Promise<string> {
  const completedItems = (await env.DB.prepare(
    "SELECT title, category, completed_at FROM roadmap_items WHERE client_slug = ? AND status = 'done' AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 10"
  ).bind(clientSlug).all<{ title: string; category: string; completed_at: number }>()).results;

  if (completedItems.length === 0) return "";

  const categoryIcons: Record<string, string> = {
    schema: "{ }",
    content: "Aa",
    authority: "++",
    technical: "//",
  };

  const items = completedItems.map(item => {
    const date = new Date(item.completed_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const icon = categoryIcons[item.category] || "--";
    return `
      <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)">
        <div style="flex-shrink:0;width:32px;height:32px;background:var(--bg-edge);border-radius:4px;display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:10px;color:var(--gold)">${icon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;color:var(--text)">${esc(item.title)}</div>
          <div style="font-size:11px;color:var(--text-faint);margin-top:2px">${esc(item.category)} -- completed ${date}</div>
        </div>
        <div style="color:#4ade80;font-size:11px;flex-shrink:0">Done</div>
      </div>`;
  }).join("");

  return `
    <div class="card" style="margin-top:32px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h3>What we've <em>done</em></h3>
        <span style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint)">${completedItems.length} completed</span>
      </div>
      ${items}
    </div>
  `;
}

interface TimelineEvent {
  timestamp: number;
  icon: string;
  iconColor: string;
  title: string;
  detail: string;
  type: string;
}

/**
 * Build the "what's happening / what's next" panel that sits just above
 * the activity timeline.
 *
 * This exists because the activity timeline only logs STATE CHANGES, so
 * the dashboard goes visually dead between the Monday weekly scan and
 * the next Monday. To a paying client that looks like nothing's
 * happening. This panel sets expectations forward (next scan date) and
 * gives proof of life (status pill + last scan timestamp), and the
 * collapsible "how it works" section explains the cadence so new users
 * understand what they're paying for.
 *
 * Three blocks:
 *   1. Status pill (Active + last scan + next scan + daily-check note)
 *   2. Cadence card listing what runs and when
 *   3. <details> "How NeverRanked works" expandable
 */
async function buildSchedulePanel(domain: Domain, env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Next Monday at 6am UTC. Same cadence the cron triggers on
  // (wrangler.jsonc: "0 6 * * *" weekly).
  const nowDate = new Date(now * 1000);
  const next = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate(), 6, 0, 0));
  // Walk forward day-by-day until we hit Monday (1) and the time hasn't
  // already passed today.
  while (next.getUTCDay() !== 1 || next.getTime() <= now * 1000) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  const nextScanTs = Math.floor(next.getTime() / 1000);
  const daysUntil = Math.max(1, Math.ceil((nextScanTs - now) / 86400));
  const nextScanLabel = next.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  // Last successful scan timestamp.
  const lastScan = await env.DB.prepare(
    "SELECT scanned_at FROM scan_results WHERE domain_id = ? AND error IS NULL ORDER BY scanned_at DESC LIMIT 1"
  ).bind(domain.id).first<{ scanned_at: number }>();
  const lastLabel = lastScan ? formatRelativeTime(now - lastScan.scanned_at) : "no scans yet";

  // Daily snippet checks only run for agency-owned domains where the
  // snippet email has been delivered. For everyone else, the daily
  // cron runs but doesn't probe THIS domain's site -- so it's honest
  // to omit the daily-check line for non-snippet clients.
  const hasDailySnippetCheck = !!(domain.agency_id && domain.snippet_email_sent_at);
  const lastSnippetCheck = hasDailySnippetCheck && domain.snippet_last_checked_at
    ? formatRelativeTime(now - domain.snippet_last_checked_at)
    : null;

  // Cadence rows -- only include rows that actually apply to this domain.
  const cadenceRows: { label: string; when: string }[] = [
    { label: "Full AEO scan", when: "Every Monday, 6am UTC" },
    { label: "Citation tracking across AI engines", when: "Mondays, with the scan" },
    { label: "Google Search data pull", when: "Mondays (if connected)" },
    { label: "Score regression alerts", when: "Immediate when detected" },
    { label: "Roadmap auto-completion check", when: "After every scan" },
  ];
  if (hasDailySnippetCheck) {
    cadenceRows.unshift({ label: "Snippet drift check", when: "Daily, around 6am UTC" });
  }

  const statusPill = `
    <div style="display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border:1px solid var(--green);border-radius:999px;font-family:var(--label);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--green)">
      <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--green)"></span>
      Active
    </div>
  `;

  const summaryLine = `
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-top:14px;font-size:13px;color:var(--text-faint)">
      <div>Last scan: <strong style="color:var(--text)">${esc(lastLabel)}</strong></div>
      <div style="color:var(--line)">|</div>
      <div>Next scan: <strong style="color:var(--text)">${esc(nextScanLabel)}</strong> (in ${daysUntil}d)</div>
      ${lastSnippetCheck ? `<div style="color:var(--line)">|</div><div>Snippet checked: <strong style="color:var(--text)">${esc(lastSnippetCheck)}</strong></div>` : ""}
    </div>
  `;

  const cadenceList = cadenceRows.map(r => `
    <div style="display:flex;justify-content:space-between;gap:16px;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px">
      <span style="color:var(--text)">${esc(r.label)}</span>
      <span style="color:var(--text-faint);white-space:nowrap">${esc(r.when)}</span>
    </div>
  `).join("");

  return `
    <div style="margin-bottom:32px">
      <div class="label" style="margin-bottom:16px">What's happening</div>
      <div style="background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;padding:20px 24px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
          <div>
            ${statusPill}
            ${summaryLine}
          </div>
        </div>

        <div style="margin-top:24px;padding-top:20px;border-top:1px solid var(--line)">
          <div class="label" style="margin-bottom:10px;font-size:10px">Your monitoring schedule</div>
          ${cadenceList}
        </div>

        <details style="margin-top:20px">
          <summary style="cursor:pointer;font-size:12px;color:var(--gold);font-family:var(--label);letter-spacing:.1em;text-transform:uppercase">How NeverRanked works</summary>
          <div style="margin-top:16px;font-size:13px;color:var(--text-faint);line-height:1.7">
            <p style="margin:0 0 12px">
              NeverRanked watches your site for the things AI engines (ChatGPT, Perplexity, Google AI Overviews) need to find and cite you. The work happens in two layers:
            </p>
            <p style="margin:0 0 12px">
              <strong style="color:var(--text)">Weekly deep work.</strong> Every Monday morning we run a full scan: parse your schema, check technical signals, ask AI engines about your tracked keywords, pull Google Search Console data, and update your roadmap based on what changed. This is the moment new findings and new roadmap items appear.
            </p>
            ${hasDailySnippetCheck ? `
            <p style="margin:0 0 12px">
              <strong style="color:var(--text)">Daily monitoring.</strong> Because your install snippet is in place, we probe your homepage daily to make sure it's still firing. If it disappears (CMS migration, theme update, webmaster cleanup) we email you immediately.
            </p>` : `
            <p style="margin:0 0 12px">
              <strong style="color:var(--text)">Daily monitoring.</strong> We watch for score regressions and surface them as alerts the moment they're detected -- you don't have to wait for the next Monday.
            </p>`}
            <p style="margin:0">
              Between Mondays your dashboard may look quiet. That's normal -- the activity feed only logs <em>changes</em>. The status pill above and the next-scan date are how you know we're still watching.
            </p>
          </div>
        </details>
      </div>
    </div>
  `;
}

function formatRelativeTime(deltaSec: number): string {
  if (deltaSec < 60) return "just now";
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`;
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}h ago`;
  if (deltaSec < 86400 * 7) return `${Math.floor(deltaSec / 86400)}d ago`;
  return `${Math.floor(deltaSec / 86400)}d ago`;
}

async function buildActivityTimeline(domain: Domain, env: Env): Promise<string> {
  const events: TimelineEvent[] = [];

  // 1. Scan events (last 10)
  const scans = (await env.DB.prepare(
    "SELECT aeo_score, grade, scan_type, error, scanned_at FROM scan_results WHERE domain_id = ? ORDER BY scanned_at DESC LIMIT 10"
  ).bind(domain.id).all<{ aeo_score: number; grade: string; scan_type: string; error: string | null; scanned_at: number }>()).results;

  for (const s of scans) {
    if (s.error) {
      events.push({ timestamp: s.scanned_at, icon: "!!", iconColor: "var(--red)", title: "Scan failed", detail: s.error, type: "scan" });
    } else {
      events.push({ timestamp: s.scanned_at, icon: s.grade, iconColor: s.grade === "A" ? "var(--green)" : s.grade === "B" ? "var(--gold)" : s.grade === "C" ? "var(--yellow)" : "var(--red)", title: "AEO scan: " + s.aeo_score + "/100 (Grade " + s.grade + ")", detail: s.scan_type === "cron" ? "Weekly automated scan" : s.scan_type === "manual" ? "Manual scan" : "Onboarding scan", type: "scan" });
    }
  }

  // 2. Admin alerts for this client (last 10)
  const alerts = (await env.DB.prepare(
    "SELECT type, title, detail, created_at FROM admin_alerts WHERE client_slug = ? ORDER BY created_at DESC LIMIT 10"
  ).bind(domain.client_slug).all<{ type: string; title: string; detail: string | null; created_at: number }>()).results;

  for (const a of alerts) {
    let icon = "--";
    let iconColor = "var(--text-faint)";
    if (a.type === "milestone") { icon = "^^"; iconColor = "var(--gold)"; }
    else if (a.type === "regression" || a.type === "score_change") { icon = "vv"; iconColor = "var(--red)"; }
    else if (a.type === "auto_completed") { icon = "ok"; iconColor = "var(--green)"; }
    else if (a.type === "needs_review") { icon = "??"; iconColor = "var(--yellow)"; }
    else if (a.type === "deploy") { icon = "[+]"; iconColor = "var(--gold)"; }
    else if (a.type === "cron_activated") { icon = "==>"; iconColor = "var(--gold)"; }
    events.push({ timestamp: a.created_at, icon, iconColor, title: a.title, detail: a.detail || "", type: "alert" });
  }

  // 3. Completed roadmap items (last 5)
  const roadmapDone = (await env.DB.prepare(
    "SELECT title, category, completed_at FROM roadmap_items WHERE client_slug = ? AND status = 'done' AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 5"
  ).bind(domain.client_slug).all<{ title: string; category: string; completed_at: number }>()).results;

  for (const r of roadmapDone) {
    events.push({ timestamp: r.completed_at, icon: "//", iconColor: "var(--green)", title: "Roadmap completed: " + r.title, detail: r.category, type: "roadmap" });
  }

  // 4. Citation snapshots (last 4)
  const citations = (await env.DB.prepare(
    "SELECT citation_share, client_citations, total_queries, created_at FROM citation_snapshots WHERE client_slug = ? ORDER BY created_at DESC LIMIT 4"
  ).bind(domain.client_slug).all<{ citation_share: number; client_citations: number; total_queries: number; created_at: number }>()).results;

  for (const c of citations) {
    const pct = (c.citation_share * 100).toFixed(0);
    events.push({ timestamp: c.created_at, icon: "Ai", iconColor: "var(--gold)", title: "Citation scan: " + pct + "% share (" + c.client_citations + "/" + c.total_queries + ")", detail: "AI engines checked across tracked keywords", type: "citation" });
  }

  // 5. GSC snapshots (last 4)
  const gsc = (await env.DB.prepare(
    "SELECT clicks, impressions, date_start, date_end, created_at FROM gsc_snapshots WHERE client_slug = ? ORDER BY created_at DESC LIMIT 4"
  ).bind(domain.client_slug).all<{ clicks: number; impressions: number; date_start: string; date_end: string; created_at: number }>()).results;

  for (const g of gsc) {
    events.push({ timestamp: g.created_at, icon: "G", iconColor: "rgba(251,248,239,.5)", title: "Search data: " + g.clicks + " clicks, " + g.impressions.toLocaleString() + " impressions", detail: g.date_start + " to " + g.date_end, type: "gsc" });
  }

  if (events.length === 0) return "";

  // Sort by timestamp descending, take top 20
  events.sort((a, b) => b.timestamp - a.timestamp);
  const display = events.slice(0, 20);

  // Group by date
  const grouped = new Map<string, TimelineEvent[]>();
  for (const e of display) {
    const d = new Date(e.timestamp * 1000);
    const key = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const arr = grouped.get(key) || [];
    arr.push(e);
    grouped.set(key, arr);
  }

  let html = "";
  for (const [dateLabel, dayEvents] of grouped) {
    html += '<div style="margin-bottom:20px">';
    html += '<div style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);margin-bottom:10px;padding-left:44px">' + esc(dateLabel) + '</div>';
    for (const e of dayEvents) {
      const time = new Date(e.timestamp * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      html += '<div style="display:flex;align-items:flex-start;gap:12px;padding:8px 0;border-left:2px solid rgba(251,248,239,.08);margin-left:15px;padding-left:20px;position:relative">';
      html += '<div style="position:absolute;left:-7px;top:10px;width:12px;height:12px;border-radius:50%;background:var(--bg);border:2px solid ' + e.iconColor + '"></div>';
      html += '<div style="flex-shrink:0;width:28px;height:28px;border-radius:4px;background:var(--bg-edge);display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:9px;font-weight:500;color:' + e.iconColor + '">' + e.icon + '</div>';
      html += '<div style="flex:1;min-width:0">';
      html += '<div style="font-size:13px;color:var(--text)">' + esc(e.title) + '</div>';
      html += '<div style="font-size:11px;color:var(--text-faint);margin-top:2px">' + esc(e.detail) + ' -- ' + time + '</div>';
      html += '</div></div>';
    }
    html += '</div>';
  }

  return `
    <div style="margin-bottom:48px">
      <div class="label" style="margin-bottom:16px">Recent Activity</div>
      <div style="background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;padding:20px 24px">
        ${html}
      </div>
    </div>
  `;
}

/** Compare two scans side-by-side */
export async function handleScanCompare(domainId: number, user: User, env: Env, url: URL): Promise<Response> {
  const domain = await env.DB.prepare("SELECT * FROM domains WHERE id = ? AND active = 1").bind(domainId).first<Domain>();
  if (!domain) return html(layout("Not Found", '<div class="empty"><h3>Domain not found</h3></div>', user), 404);
  if (!(await canAccessClient(env, user, domain.client_slug))) {
    return html(layout("Not Found", '<div class="empty"><h3>Domain not found</h3></div>', user), 404);
  }

  const scanA_id = Number(url.searchParams.get("a") || 0);
  const scanB_id = Number(url.searchParams.get("b") || 0);

  // Get all scans for the picker
  const allScans = (await env.DB.prepare(
    "SELECT id, aeo_score, grade, scanned_at, scan_type, error FROM scan_results WHERE domain_id = ? AND error IS NULL ORDER BY scanned_at DESC LIMIT 52"
  ).bind(domainId).all<{ id: number; aeo_score: number; grade: string; scanned_at: number; scan_type: string; error: string | null }>()).results;

  if (allScans.length < 2) {
    return html(layout("Compare Scans", `
      <div class="empty">
        <h3>Not enough scans</h3>
        <p>At least two successful scans are needed to compare. <a href="/domain/${domainId}" style="color:var(--gold)">Back to report</a></p>
      </div>
    `, user, domain.client_slug));
  }

  // Build the picker
  const optionList = allScans.map(s => {
    const d = new Date(s.scanned_at * 1000);
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " -- " + s.aeo_score + "/100 (" + s.grade + ")";
    return { id: s.id, label };
  });

  const pickerA = optionList.map(o => `<option value="${o.id}"${o.id === scanA_id ? ' selected' : ''}>${esc(o.label)}</option>`).join("");
  const pickerB = optionList.map(o => `<option value="${o.id}"${o.id === scanB_id ? ' selected' : ''}>${esc(o.label)}</option>`).join("");

  let comparisonHtml = "";

  if (scanA_id && scanB_id && scanA_id !== scanB_id) {
    const scanA = await env.DB.prepare("SELECT * FROM scan_results WHERE id = ? AND domain_id = ?").bind(scanA_id, domainId).first<ScanResult>();
    const scanB = await env.DB.prepare("SELECT * FROM scan_results WHERE id = ? AND domain_id = ?").bind(scanB_id, domainId).first<ScanResult>();

    if (scanA && scanB && !scanA.error && !scanB.error) {
      const dateA = new Date(scanA.scanned_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const dateB = new Date(scanB.scanned_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });

      // Score comparison
      const diff = scanB.aeo_score - scanA.aeo_score;
      const diffColor = diff > 0 ? "var(--green)" : diff < 0 ? "var(--red)" : "var(--text-faint)";
      const diffText = diff > 0 ? "+" + diff : diff === 0 ? "no change" : String(diff);

      // Schema changes
      const schemasA: string[] = safeParse(scanA.schema_types, []);
      const schemasB: string[] = safeParse(scanB.schema_types, []);
      const added = schemasB.filter(s => !schemasA.includes(s));
      const removed = schemasA.filter(s => !schemasB.includes(s));
      const kept = schemasA.filter(s => schemasB.includes(s));

      // Red flag changes
      const flagsA: string[] = safeParse(scanA.red_flags, []);
      const flagsB: string[] = safeParse(scanB.red_flags, []);
      const newFlags = flagsB.filter(f => !flagsA.includes(f));
      const resolvedFlags = flagsA.filter(f => !flagsB.includes(f));

      // Tech signal changes
      const sigA: { label: string; value: string; status: string }[] = safeParse(scanA.technical_signals, []);
      const sigB: { label: string; value: string; status: string }[] = safeParse(scanB.technical_signals, []);
      const sigMap = new Map(sigA.map(s => [s.label, s]));
      const signalChanges: { label: string; fromVal: string; toVal: string; fromStatus: string; toStatus: string }[] = [];
      for (const s of sigB) {
        const prev = sigMap.get(s.label);
        if (prev && (prev.value !== s.value || prev.status !== s.status)) {
          signalChanges.push({ label: s.label, fromVal: prev.value, toVal: s.value, fromStatus: prev.status, toStatus: s.status });
        }
      }

      comparisonHtml = `
        <!-- Score delta -->
        <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:24px;align-items:center;margin-bottom:48px">
          <div style="text-align:center;padding:24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
            <div class="label" style="margin-bottom:12px">${dateA} (Older)</div>
            <div class="grade grade-${scanA.grade}" style="width:64px;height:64px;font-size:32px;margin:0 auto 8px">${scanA.grade}</div>
            <div style="font-family:var(--mono);font-size:24px;color:var(--text)">${scanA.aeo_score}<span style="font-size:12px;color:var(--text-faint)">/100</span></div>
          </div>
          <div style="text-align:center">
            <div style="font-family:var(--mono);font-size:28px;color:${diffColor};font-weight:500">${diffText}</div>
            <div style="font-size:11px;color:var(--text-faint);margin-top:4px">pts</div>
          </div>
          <div style="text-align:center;padding:24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
            <div class="label" style="margin-bottom:12px">${dateB} (Newer)</div>
            <div class="grade grade-${scanB.grade}" style="width:64px;height:64px;font-size:32px;margin:0 auto 8px">${scanB.grade}</div>
            <div style="font-family:var(--mono);font-size:24px;color:var(--text)">${scanB.aeo_score}<span style="font-size:12px;color:var(--text-faint)">/100</span></div>
          </div>
        </div>

        ${signalChanges.length > 0 ? `
        <!-- Signal changes -->
        <div style="margin-bottom:48px">
          <div class="label" style="margin-bottom:16px">Technical Signal Changes</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${signalChanges.map(s => {
              const improved = s.toStatus === "good" && s.fromStatus !== "good";
              const regressed = s.fromStatus === "good" && s.toStatus !== "good";
              const color = improved ? "var(--green)" : regressed ? "var(--red)" : "var(--yellow)";
              return `
                <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;background:var(--bg-lift);border-left:3px solid ${color}">
                  <span style="font-size:13px;color:var(--text);flex:1">${esc(s.label)}</span>
                  <span style="font-size:12px;color:var(--text-faint)">${esc(s.fromVal)}</span>
                  <span style="font-family:var(--mono);font-size:11px;color:var(--text-faint)">-></span>
                  <span style="font-size:12px;color:${color};font-weight:400">${esc(s.toVal)}</span>
                </div>`;
            }).join("")}
          </div>
        </div>
        ` : ''}

        ${added.length > 0 || removed.length > 0 ? `
        <!-- Schema changes -->
        <div style="margin-bottom:48px">
          <div class="label" style="margin-bottom:16px">Schema Changes</div>
          <div style="display:flex;gap:24px;flex-wrap:wrap">
            ${added.length > 0 ? `
              <div style="flex:1;min-width:200px">
                <div style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--green);margin-bottom:10px">Added (${added.length})</div>
                ${added.map(s => `<div style="padding:6px 12px;margin-bottom:4px;background:rgba(94,199,106,0.06);border:1px solid rgba(94,199,106,0.15);border-radius:2px;font-size:12px;color:var(--text)">${esc(s)}</div>`).join("")}
              </div>
            ` : ''}
            ${removed.length > 0 ? `
              <div style="flex:1;min-width:200px">
                <div style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--red);margin-bottom:10px">Removed (${removed.length})</div>
                ${removed.map(s => `<div style="padding:6px 12px;margin-bottom:4px;background:rgba(232,84,84,0.06);border:1px solid rgba(232,84,84,0.15);border-radius:2px;font-size:12px;color:var(--text)">${esc(s)}</div>`).join("")}
              </div>
            ` : ''}
            ${kept.length > 0 ? `
              <div style="flex:1;min-width:200px">
                <div style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);margin-bottom:10px">Unchanged (${kept.length})</div>
                ${kept.map(s => `<div style="padding:6px 12px;margin-bottom:4px;background:var(--bg-lift);border:1px solid var(--line);border-radius:2px;font-size:12px;color:var(--text-faint)">${esc(s)}</div>`).join("")}
              </div>
            ` : ''}
          </div>
        </div>
        ` : ''}

        ${newFlags.length > 0 || resolvedFlags.length > 0 ? `
        <!-- Red flag changes -->
        <div style="margin-bottom:48px">
          <div class="label" style="margin-bottom:16px">Red Flag Changes</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${resolvedFlags.map(f => `
              <div style="padding:8px 16px;background:var(--bg-lift);border-left:3px solid var(--green);font-size:13px">
                <span style="color:var(--green);font-family:var(--mono);margin-right:8px">RESOLVED</span>
                <span style="color:var(--text-soft)">${esc(f)}</span>
              </div>
            `).join("")}
            ${newFlags.map(f => `
              <div style="padding:8px 16px;background:var(--bg-lift);border-left:3px solid var(--red);font-size:13px">
                <span style="color:var(--red);font-family:var(--mono);margin-right:8px">NEW</span>
                <span style="color:var(--text-soft)">${esc(f)}</span>
              </div>
            `).join("")}
          </div>
          <div style="margin-top:12px;font-size:12px;color:var(--text-faint)">
            ${flagsA.length} flags -> ${flagsB.length} flags (${flagsB.length - flagsA.length >= 0 ? '+' : ''}${flagsB.length - flagsA.length})
          </div>
        </div>
        ` : '<div style="margin-bottom:32px;font-size:13px;color:var(--text-faint)">No red flag changes between these scans.</div>'}
      `;
    }
  }

  const body = `
    <div style="margin-bottom:40px">
      <div class="label" style="margin-bottom:8px">
        <a href="/" style="color:var(--text-mute)">Dashboard</a> / <a href="/domain/${domain.id}" style="color:var(--text-mute)">${esc(domain.domain)}</a>
      </div>
      <h1>Compare <em>scans</em></h1>
    </div>

    <form method="GET" style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;margin-bottom:48px">
      <div class="form-group" style="margin-bottom:0;flex:1;min-width:200px">
        <label>Older scan</label>
        <select name="a" style="width:100%">${pickerA}</select>
      </div>
      <div style="font-family:var(--mono);font-size:16px;color:var(--text-faint);padding-bottom:8px">vs</div>
      <div class="form-group" style="margin-bottom:0;flex:1;min-width:200px">
        <label>Newer scan</label>
        <select name="b" style="width:100%">${pickerB}</select>
      </div>
      <button type="submit" class="btn" style="margin-bottom:0">Compare</button>
    </form>

    ${comparisonHtml}
  `;

  return html(layout("Compare Scans", body, user, domain.client_slug));
}

export async function handleDomainDetail(domainId: number, user: User, env: Env, requestUrl?: URL): Promise<Response> {
  // Get domain
  const domain = await env.DB.prepare(
    "SELECT * FROM domains WHERE id = ? AND active = 1"
  ).bind(domainId).first<Domain>();

  if (!domain) {
    return html(layout("Not Found", `<div class="empty"><h3>Domain not found</h3></div>`, user), 404);
  }

  // Auth check: admins see all, agency admins see their agency's clients,
  // clients see only their own domains.
  if (!(await canAccessClient(env, user, domain.client_slug))) {
    return html(layout("Not Found", `<div class="empty"><h3>Domain not found</h3></div>`, user), 404);
  }

  // Get scan history (up to 52 weeks / 1 year) -- latest and previous are derived from this
  const history = (await env.DB.prepare(
    "SELECT * FROM scan_results WHERE domain_id = ? ORDER BY scanned_at DESC LIMIT 52"
  ).bind(domainId).all<ScanResult>()).results;
  const latest = history[0] || null;
  const previous = history[1] || null;

  // Build page
  let reportSection = "";
  if (latest && !latest.error) {
    const redFlags: string[] = safeParse(latest.red_flags, []);
    const techSignals: { label: string; value: string; status: string }[] = safeParse(latest.technical_signals, []);
    const schemaCoverage: { type: string; present: boolean }[] = safeParse(latest.schema_coverage, []);
    const scanDate = new Date(latest.scanned_at * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

    // Score delta
    let deltaHtml = "";
    if (previous && !previous.error) {
      const diff = latest.aeo_score - previous.aeo_score;
      if (diff > 0) {
        deltaHtml = `<div style="font-size:13px;color:var(--green);margin-top:4px">+${diff} pts</div>`;
      } else if (diff < 0) {
        deltaHtml = `<div style="font-size:13px;color:var(--red);margin-top:4px">${diff} pts</div>`;
      } else {
        deltaHtml = `<div style="font-size:13px;color:var(--text-faint);margin-top:4px">no change</div>`;
      }
    }

    // Generate narrative
    const narrative = generateNarrative(domain.domain, latest, previous);

    // Citation lift (citation rate at engagement start vs current).
    // Surfaces the proof case: "you went from N% to M% citation rate
    // since you started." Block renders nothing when there's no
    // engagement anchor, so it's safe to compute every render.
    const citationLift = await computeCitationLift(domain.client_slug, env);
    const liftHtml = renderCitationLiftBlock(citationLift);

    // Plain-English interpretation of the score, so readers (especially
    // agency owners showing this to a client) can answer "is that number
    // good?" without looking anything up.
    const _s = latest.aeo_score;
    const scoreMeaning =
      _s >= 90 ? "This is cite-ready territory. AI engines will confidently use this site as a source. The job now is defense: keep the structure fresh, add new content, and keep schema coverage from drifting."
      : _s >= 75 ? "Strong foundation. A few specific gaps still cost citations. The roadmap below shows exactly which fixes move this from B into A range."
      : _s >= 60 ? "Visible but not first-choice. When AI engines need a source in this space, competitors with cleaner structure are getting picked over this site. The roadmap is where to start closing the gap."
      : _s >= 40 ? "Real structural problems are costing citations. AI engines are skipping this site for cleaner sources. The fixes in the roadmap are known, ordered by impact, and tracked."
      : "AI engines cannot parse this site well enough to cite it. Every week without action the gap widens while competitors improve. The roadmap starts with the fixes that unlock everything else.";

    const scanTypeLabel =
      latest.scan_type === "cron" ? "weekly automated scan"
      : latest.scan_type === "manual" ? "manual re-scan you triggered"
      : latest.scan_type === "onboarding" ? "onboarding scan"
      : latest.scan_type;

    reportSection = `
      <div style="display:grid;grid-template-columns:auto 1fr;gap:32px;align-items:start;margin-bottom:24px">
        <div style="text-align:center">
          <div class="grade grade-${latest.grade}" style="width:80px;height:80px;font-size:40px;margin-bottom:12px" title="Grade ${latest.grade}. 90+ is A, 75-89 is B, 60-74 is C, 40-59 is D, below 40 is F.">${latest.grade}</div>
          <div class="score" title="AEO Readiness score: 0-100. Based on structured data coverage, technical signals, content structure, and citation proxies.">${latest.aeo_score}<small>/100</small></div>
          ${deltaHtml}
        </div>
        <div>
          <div style="font-size:12px;color:var(--text-faint);margin-bottom:8px">Last scanned ${scanDate} &middot; ${scanTypeLabel}</div>
          <p style="font-size:13px;line-height:1.7;color:var(--text-soft);margin:0 0 18px;max-width:720px">${scoreMeaning}</p>
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px">
            ${schemaCoverage.map(sc => `
              <span style="padding:4px 10px;font-family:var(--label);text-transform:uppercase;letter-spacing:.15em;font-size:9px;font-weight:500;border:1px solid;border-radius:2px;${sc.present ? 'color:var(--green);border-color:var(--green)' : 'color:var(--text-faint);border-color:var(--line)'}" title="${sc.present ? 'Found on this page.' : 'Missing on this page -- add to earn this credit.'}">
                ${esc(sc.type)}
              </span>
            `).join('')}
          </div>
          <div style="font-size:11px;color:var(--text-faint);margin-top:10px;line-height:1.6;max-width:680px">
            Each tag above is a schema type AI engines look for. Green means the scanner found it on your site. Faint means it is missing and adding it would earn credit on the next scan.
          </div>
        </div>
      </div>

      ${liftHtml ? `<div style="margin:0 0 32px">${liftHtml}</div>` : ""}

      <!-- Executive Summary -->
      <div style="margin-bottom:48px">
        <div class="label" style="margin-bottom:16px">Executive Summary</div>
        <div style="padding:20px 24px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;font-size:14px;line-height:1.75;color:var(--text-soft)">
          ${esc(narrative.summary)}
        </div>
      </div>

      ${narrative.changes.length > 0 ? `
      <!-- What Changed -->
      <div style="margin-bottom:48px">
        <div class="label" style="margin-bottom:16px">What Changed</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${narrative.changes.map(c => {
            const color = c.type === "improved" || c.type === "resolved"
              ? "var(--green)" : "var(--red)";
            const icon = c.type === "improved" || c.type === "resolved"
              ? "+" : c.type === "regressed" || c.type === "new_issue" ? "-" : "~";
            return `
              <div style="display:flex;align-items:baseline;gap:12px;padding:8px 16px;background:var(--bg-lift);border-left:3px solid ${color};font-size:13px">
                <span style="color:${color};font-weight:500;font-family:var(--mono);flex-shrink:0">${icon}</span>
                <span style="color:var(--text-soft)">${esc(c.text)}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      ` : ''}

      ${narrative.actions.length > 0 ? `
      <!-- Recommended Next Actions -->
      <div style="margin-bottom:48px">
        <div class="label" style="margin-bottom:16px">Recommended Next Actions</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${narrative.actions.map((a, i) => {
            const impactColor = a.impact === "high" ? "var(--red)"
              : a.impact === "medium" ? "var(--yellow)" : "var(--text-faint)";
            const impactLabel = a.impact === "high" ? "HIGH IMPACT"
              : a.impact === "medium" ? "MEDIUM" : "LOW";
            return `
              <div style="padding:16px 20px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
                  <span style="font-family:var(--label);font-size:11px;font-weight:500;letter-spacing:.15em;color:var(--text-faint)">${i + 1}</span>
                  <span style="font-size:14px;font-weight:400;color:var(--text)">${esc(a.action)}</span>
                  <span style="margin-left:auto;font-family:var(--label);font-size:9px;font-weight:500;letter-spacing:.15em;text-transform:uppercase;color:${impactColor};border:1px solid ${impactColor};padding:2px 8px;border-radius:2px;flex-shrink:0">${impactLabel}</span>
                </div>
                <div style="font-size:12px;color:var(--text-faint);line-height:1.6;padding-left:28px">${esc(a.reason)}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      ` : ''}

      <!-- Technical Signals -->
      <div style="margin-bottom:48px">
        <div class="label" style="margin-bottom:16px">Technical Signals</div>
        <table class="data-table">
          <thead><tr><th>Signal</th><th>Value</th><th>Status</th></tr></thead>
          <tbody>
            ${techSignals.map(s => `
              <tr>
                <td style="font-weight:400">${esc(s.label)}</td>
                <td style="font-size:12px">${esc(s.value)}</td>
                <td>
                  <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${s.status === 'good' ? 'var(--green)' : s.status === 'warning' ? 'var(--yellow)' : 'var(--red)'}"></span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- Red Flags -->
      ${redFlags.length > 0 ? `
        <div style="margin-bottom:48px">
          <div class="label" style="margin-bottom:16px">Red Flags (${redFlags.length})</div>
          ${redFlags.map(f => `
            <div style="padding:10px 16px;margin-bottom:8px;background:var(--bg-lift);border-left:3px solid var(--red);font-size:13px;color:var(--text-soft)">
              ${esc(f)}
            </div>
          `).join('')}
        </div>
      ` : `
        <div style="margin-bottom:48px">
          <div class="label" style="margin-bottom:16px">Red Flags</div>
          <div style="padding:16px;color:var(--green);font-size:13px">No red flags detected.</div>
        </div>
      `}

      ${buildSchemaSnippets(schemaCoverage, domain.domain)}
    `;
  } else if (latest && latest.error) {
    // Error detail is already rendered in the domain status strip at the
    // top of the page (see buildDomainStatusStrip). Intentionally empty
    // here so we don't duplicate the same message.
    reportSection = "";
  } else {
    reportSection = `
      <div class="empty" style="padding:32px 28px;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;max-width:720px">
        <h3 style="margin-bottom:10px;font-style:italic">No scans yet</h3>
        <p style="color:var(--text-soft);font-size:13px;line-height:1.7;margin:0 0 16px">This domain was just added and has not been scanned yet. The first scan will fire automatically on the next weekly run (every Monday at 6am UTC). If you want to see the report sooner, trigger a manual scan.</p>
        ${user.role === "admin" ? `
          <form method="POST" action="/admin/scan/${domain.id}" style="margin:0">
            <button type="submit" class="btn">Run a scan now</button>
          </form>
        ` : `<p style="color:var(--text-faint);font-size:11px;margin:0;line-height:1.6">If this domain has been tracked for more than 48 hours and still has no scans, email <a href="mailto:hello@neverranked.com" style="color:var(--gold)">hello@neverranked.com</a> and we will investigate.</p>`}
      </div>
    `;
  }

  // Trend chart (SVG) -- full history with grade bands
  let trendSection = "";
  const successfulScans = history.filter(h => !h.error && h.aeo_score > 0).reverse(); // oldest first
  if (successfulScans.length >= 2) {
    const W = 720;
    const H = 260;
    const PAD_L = 48;
    const PAD_R = 24;
    const PAD_T = 20;
    const PAD_B = 36;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_T - PAD_B;

    // Always show 0-100 scale for grade band context
    const minScore = 0;
    const maxScore = 100;
    const range = 100;

    const points = successfulScans.map((s, i) => {
      const x = PAD_L + (i / (successfulScans.length - 1)) * chartW;
      const y = PAD_T + chartH - ((s.aeo_score - minScore) / range) * chartH;
      return { x, y, score: s.aeo_score, grade: s.grade, date: new Date(s.scanned_at * 1000) };
    });

    const polyline = points.map(p => p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ");

    // Gradient fill area under the line
    const areaPath = "M " + points[0].x.toFixed(1) + "," + (PAD_T + chartH).toFixed(1) + " " +
      points.map(p => "L " + p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ") +
      " L " + points[points.length - 1].x.toFixed(1) + "," + (PAD_T + chartH).toFixed(1) + " Z";

    // Grade bands (D: 0-39, C: 40-59, B: 60-79, A: 80-100)
    const bands = [
      { min: 0, max: 39, color: "rgba(192,57,43,0.06)", label: "D" },
      { min: 40, max: 59, color: "rgba(230,126,34,0.06)", label: "C" },
      { min: 60, max: 79, color: "rgba(232,199,103,0.06)", label: "B" },
      { min: 80, max: 100, color: "rgba(94,199,106,0.06)", label: "A" },
    ];
    const bandRects = bands.map(b => {
      const y1 = PAD_T + chartH - ((b.max - minScore) / range) * chartH;
      const y2 = PAD_T + chartH - ((b.min - minScore) / range) * chartH;
      const bandH = y2 - y1;
      return '<rect x="' + PAD_L + '" y="' + y1.toFixed(1) + '" width="' + chartW + '" height="' + bandH.toFixed(1) + '" fill="' + b.color + '"/>' +
        '<text x="' + (W - PAD_R + 4) + '" y="' + ((y1 + y2) / 2 + 4).toFixed(1) + '" fill="rgba(251,248,239,.25)" font-size="11" font-family="var(--mono)" font-weight="500">' + b.label + '</text>';
    }).join("\n");

    // Grid lines at 20-point intervals
    const gridLines: string[] = [];
    const gridLabels: string[] = [];
    for (let v = 0; v <= 100; v += 20) {
      const y = PAD_T + chartH - ((v - minScore) / range) * chartH;
      gridLines.push('<line x1="' + PAD_L + '" y1="' + y.toFixed(1) + '" x2="' + (W - PAD_R) + '" y2="' + y.toFixed(1) + '" stroke="rgba(251,248,239,.08)" stroke-dasharray="4,4"/>');
      gridLabels.push('<text x="' + (PAD_L - 10) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end" fill="rgba(251,248,239,.35)" font-size="10" font-family="var(--mono)">' + v + '</text>');
    }

    // Date labels -- distribute evenly, max 6 labels
    const dateLabels: string[] = [];
    const maxDateLabels = Math.min(6, points.length);
    for (let i = 0; i < maxDateLabels; i++) {
      const idx = maxDateLabels <= 1 ? 0 : Math.round(i * (points.length - 1) / (maxDateLabels - 1));
      const p = points[idx];
      const label = p.date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      dateLabels.push('<text x="' + p.x.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" fill="rgba(251,248,239,.35)" font-size="9" font-family="var(--mono)">' + label + '</text>');
    }

    // Dots -- all points get dots, key points get score labels
    const scores = successfulScans.map(s => s.aeo_score);
    const minIdx = scores.indexOf(Math.min(...scores));
    const maxIdx = scores.lastIndexOf(Math.max(...scores));
    const keyIndices = new Set([0, points.length - 1, minIdx, maxIdx]);

    const dots = points.map((p, i) => {
      const isKey = keyIndices.has(i);
      const r = isKey ? 5 : 3;
      let label = "";
      if (isKey) {
        const labelY = p.y - 10;
        label = '<text x="' + p.x.toFixed(1) + '" y="' + labelY.toFixed(1) + '" text-anchor="middle" fill="var(--text-mute)" font-size="11" font-family="var(--mono)" font-weight="500">' + p.score + '</text>';
      }
      return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + r + '" fill="var(--gold)" stroke="var(--bg)" stroke-width="2"/>' + label;
    }).join("\n");

    // Summary line under the chart
    const first = points[0];
    const last = points[points.length - 1];
    const totalChange = last.score - first.score;
    const changeText = totalChange > 0
      ? '<span style="color:var(--green)">+' + totalChange + ' pts</span> since ' + first.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : totalChange < 0
      ? '<span style="color:var(--red)">' + totalChange + ' pts</span> since ' + first.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : 'No net change since ' + first.date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    // Subtitle copy: the raw "over N days" math breaks when all scans
    // landed on the same calendar day. Render a human-readable span and
    // note hidden failed scans so the graph's silence isn't misleading.
    const spanDays = Math.round((last.date.getTime() - first.date.getTime()) / 86400000);
    const spanLabel = spanDays === 0 ? "all today"
      : spanDays === 1 ? "across 2 days"
      : `across ${spanDays + 1} days`;
    const failedCount = history.filter(h => h.error || h.aeo_score === 0).length;
    const failedNote = failedCount > 0
      ? ` &middot; <span style="color:var(--red,#c96a6a)">${failedCount} failed ${failedCount === 1 ? 'scan' : 'scans'} hidden</span>`
      : "";
    trendSection = `
      <div style="margin-bottom:48px">
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:16px">
          <div class="label">Score Trend</div>
          <div style="font-size:12px;color:var(--text-faint)">${successfulScans.length} ${successfulScans.length === 1 ? 'scan' : 'scans'} ${spanLabel}${failedNote}</div>
        </div>
        <div style="background:var(--bg-lift);border:1px solid var(--line);border-radius:4px;padding:20px;overflow-x:auto">
          <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block;margin:0 auto">
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--gold)" stop-opacity="0.25"/>
                <stop offset="100%" stop-color="var(--gold)" stop-opacity="0"/>
              </linearGradient>
            </defs>
            ${bandRects}
            ${gridLines.join("\n")}
            ${gridLabels.join("\n")}
            <path d="${areaPath}" fill="url(#areaGrad)"/>
            <polyline points="${polyline}" fill="none" stroke="var(--gold)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
            ${dots}
            ${dateLabels.join("\n")}
          </svg>
        </div>
        <div style="margin-top:12px;font-size:13px;color:var(--text-faint);text-align:center">${changeText}</div>
      </div>
    `;
  }

  // History table
  let historySection = "";
  if (history.length > 0) {
    historySection = `
      <div style="margin-top:48px">
        <div class="label" style="margin-bottom:16px">Scan History</div>
        <table class="data-table">
          <thead><tr><th>Date</th><th>Score</th><th>Grade</th><th>Type</th><th>Status</th></tr></thead>
          <tbody>
            ${history.map(h => {
              const d = new Date(h.scanned_at * 1000);
              const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              return `
                <tr>
                  <td>${dateStr}</td>
                  <td>${h.error ? '-' : h.aeo_score + '/100'}</td>
                  <td><span class="grade grade-${h.grade}" style="width:28px;height:28px;font-size:14px">${h.grade}</span></td>
                  <td style="color:var(--text-faint)">${h.scan_type}</td>
                  <td>${h.error ? `<span style="color:var(--red);font-size:12px">${esc(h.error)}</span>` : '<span style="color:var(--green)">OK</span>'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // Schema coverage matrix (per-page)
  let coverageSection = "";
  const pageScans = (await env.DB.prepare(
    "SELECT url, schema_types, aeo_score, grade FROM page_scans WHERE domain_id = ? ORDER BY url"
  ).bind(domainId).all<{ url: string; schema_types: string; aeo_score: number; grade: string }>()).results;

  if (pageScans.length > 0) {
    // Collect all unique schema types across all pages
    const allTypes = new Set<string>();
    const pageData = pageScans.map(ps => {
      const types: string[] = safeParse(ps.schema_types, []);
      types.forEach(t => allTypes.add(t));
      return { url: ps.url, types: new Set(types), score: ps.aeo_score, grade: ps.grade };
    });
    const schemaColumns = [...allTypes].sort();

    // Build short page labels from URLs
    const getPageLabel = (url: string): string => {
      try {
        const u = new URL(url);
        const p = u.pathname === "/" ? "Homepage" : u.pathname.replace(/\/$/, "").split("/").pop() || u.pathname;
        return p === "Homepage" ? p : `/${p}`;
      } catch {
        return url;
      }
    };

    if (schemaColumns.length > 0) {
      coverageSection = `
        <div style="margin-bottom:48px">
          <div class="label" style="margin-bottom:16px">Schema Coverage by Page</div>
          <div style="overflow-x:auto;background:var(--bg-lift);border:1px solid var(--line);border-radius:4px">
            <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:${Math.max(500, 160 + schemaColumns.length * 90)}px">
              <thead>
                <tr style="border-bottom:1px solid var(--line)">
                  <th style="text-align:left;padding:12px 16px;font-family:var(--label);font-weight:500;letter-spacing:.1em;text-transform:uppercase;font-size:10px;color:var(--text-faint);position:sticky;left:0;background:var(--bg-lift);min-width:140px">Page</th>
                  ${schemaColumns.map(col => `
                    <th style="text-align:center;padding:12px 8px;font-family:var(--label);font-weight:500;letter-spacing:.1em;text-transform:uppercase;font-size:9px;color:var(--text-faint);white-space:nowrap">${esc(col)}</th>
                  `).join('')}
                  <th style="text-align:center;padding:12px 8px;font-family:var(--label);font-weight:500;letter-spacing:.1em;text-transform:uppercase;font-size:10px;color:var(--text-faint)">Score</th>
                </tr>
              </thead>
              <tbody>
                ${pageData.map(page => `
                  <tr style="border-bottom:1px solid rgba(251,248,239,.08)">
                    <td style="padding:10px 16px;font-size:12px;color:var(--text-soft);position:sticky;left:0;background:var(--bg-lift);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(page.url)}">${esc(getPageLabel(page.url))}</td>
                    ${schemaColumns.map(col => {
                      const has = page.types.has(col);
                      return `<td style="text-align:center;padding:10px 8px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;${has ? 'background:var(--green)' : 'background:rgba(251,248,239,.08);border:1px solid rgba(251,248,239,.12)'}"></span></td>`;
                    }).join('')}
                    <td style="text-align:center;padding:10px 8px"><span class="grade grade-${page.grade}" style="width:24px;height:24px;font-size:11px">${page.grade}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div style="margin-top:10px;font-size:11px;color:var(--text-faint);display:flex;gap:16px">
            <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--green);vertical-align:middle;margin-right:4px"></span> Present</span>
            <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(251,248,239,.08);border:1px solid rgba(251,248,239,.12);vertical-align:middle;margin-right:4px"></span> Missing</span>
          </div>
        </div>
      `;
    }
  }

  // Check for share URL flash message
  const sharedUrl = requestUrl?.searchParams.get("shared") || "";
  const shareFlash = sharedUrl ? `
    <div style="margin-bottom:24px;padding:16px 20px;background:var(--gold-wash);border:1px solid var(--gold-dim);border-radius:4px">
      <div style="font-family:var(--label);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);margin-bottom:8px">Shareable link created</div>
      <div style="display:flex;align-items:center;gap:12px">
        <input type="text" value="${esc(sharedUrl)}" readonly onclick="this.select()" style="flex:1;padding:8px 12px;background:var(--bg-edge);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:12px;border-radius:2px">
        <button onclick="navigator.clipboard.writeText(this.previousElementSibling.value);this.textContent='Copied'" class="btn" style="padding:8px 16px;font-size:10px;white-space:nowrap">Copy link</button>
      </div>
      <div style="font-size:11px;color:var(--text-faint);margin-top:8px">Anyone with this link can view the report. No login required. Expires in 90 days.</div>
    </div>
  ` : "";

  const printDate = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  // Resolve agency branding for this specific domain. We brand by the
  // DOMAIN's agency_id (not the viewer's) so an admin viewing a pilot
  // client's report still sees the pilot agency's wordmark + color in
  // the printable header. Only applies when the agency is active.
  let reportBranding: import("../types").BrandingContext | undefined = undefined;
  let reportBrandName = "Never Ranked";
  if (domain.agency_id) {
    const ag = await env.DB.prepare("SELECT * FROM agencies WHERE id = ?").bind(domain.agency_id).first<any>();
    if (ag && ag.status === "active") {
      reportBranding = { source: "agency", agency: ag, showPoweredBy: user.role === "client" };
      reportBrandName = ag.name;
    }
  }

  const body = `
    <div class="print-header" style="display:none">
      <div class="print-logo">${esc(reportBrandName)}</div>
      <div class="print-date">AEO Report -- ${esc(domain.domain)} -- ${printDate}</div>
    </div>
    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:40px">
      <div>
        <div class="label" style="margin-bottom:8px">
          <a href="/" style="color:var(--text-mute)">Dashboard</a> / ${esc(domain.client_slug)}
        </div>
        <h1><em>${esc(domain.domain)}</em></h1>
      </div>
      <div style="display:flex;gap:8px">
        ${history.filter(h => !h.error).length >= 2 ? `<a href="/domain/${domain.id}/compare" class="btn btn-ghost no-print">Compare scans</a>` : ''}
        <button onclick="window.print()" class="btn btn-ghost no-print">Export PDF</button>
        <form method="POST" action="/domain/${domain.id}/share">
          <button type="submit" class="btn btn-ghost no-print">Share report</button>
        </form>
        ${user.role === 'admin' ? `<form method="POST" action="/admin/scan/${domain.id}/as-cron" style="display:inline">
          <button type="submit" class="btn btn-ghost no-print" title="Runs scanDomain with scan_type='cron' instead of 'manual'. Diagnostic: use this to verify scanner fixes without waiting for Monday's natural cron.">Run as cron</button>
        </form>
        <form method="POST" action="/admin/scan/${domain.id}">
          <button type="submit" class="btn ${latest && latest.error ? 'btn-ghost' : ''} no-print" title="${latest && latest.error ? 'Last scan failed. Retrying may hit the same issue -- check the error detail above first.' : ''}">Run scan</button>
        </form>` : (() => {
          // Client rescan: rate-limited to once per 24h
          const now = Math.floor(Date.now() / 1000);
          const lastScanTime = latest ? latest.scanned_at : 0;
          const canRescan = (now - lastScanTime) > 86400;
          if (canRescan) {
            return `<form method="POST" action="/domain/${domain.id}/rescan">
              <button type="submit" class="btn btn-ghost no-print">Rescan</button>
            </form>`;
          }
          const hoursLeft = Math.ceil((86400 - (now - lastScanTime)) / 3600);
          return `<span class="btn btn-ghost no-print" style="opacity:.4;cursor:default;pointer-events:none" title="Available in ${hoursLeft}h">Rescan</span>`;
        })()}
      </div>
    </div>

    ${shareFlash}
    ${buildDomainStatusStrip({
      domainName: domain.domain,
      scannedAt: latest ? latest.scanned_at : null,
      aeoScore: latest && !latest.error ? latest.aeo_score : null,
      redFlagCount: latest && !latest.error ? safeParse<string[]>(latest.red_flags, []).length : 0,
      scanError: latest ? latest.error : null,
      domainId: domain.id,
    }, user.role)}
    ${user.role !== "admin" ? await buildSetupCompletenessWidget(domain, user, env) : ""}
    ${user.role !== "admin" ? buildMeasurementModeBanner(domain, env) : ""}
    ${user.role !== "admin" ? await (await import("./nps")).renderNpsPromptIfDue(user, env) : ""}
    ${await buildGettingStarted(domain, user, env)}
    ${reportSection}
    ${trendSection}
    ${latest && !latest.error ? await buildScoreProjection(domain.client_slug, latest.aeo_score, env) : ''}
    ${await buildSchedulePanel(domain, env)}
    ${await buildActivityTimeline(domain, env)}
    ${await buildProgressTimeline(domain.client_slug, env)}
    ${coverageSection}
    ${await buildContentTopics(domain.client_slug, env)}
    ${await buildCitationTrend(domain.client_slug, env)}
    ${historySection}
    ${buildGlossary()}
  `;

  return html(layout(domain.domain, body, user, domain.client_slug, reportBranding));
}

/** Handle client-initiated rescan (rate-limited to once per 24h) */
export async function handleClientRescan(domainId: number, user: User, env: Env): Promise<Response> {
  const domain = await env.DB.prepare(
    "SELECT * FROM domains WHERE id = ? AND active = 1"
  ).bind(domainId).first<Domain>();

  if (!domain) return redirect("/");

  // Auth check
  if (!(await canAccessClient(env, user, domain.client_slug))) {
    return redirect("/");
  }

  // Rate limit: check last scan time
  const lastScan = await env.DB.prepare(
    "SELECT scanned_at FROM scan_results WHERE domain_id = ? ORDER BY scanned_at DESC LIMIT 1"
  ).bind(domainId).first<{ scanned_at: number }>();

  const now = Math.floor(Date.now() / 1000);
  if (lastScan && (now - lastScan.scanned_at) < 86400) {
    // Too recent, just redirect back
    return redirect(`/domain/${domainId}`);
  }

  // Run scan + auto-complete roadmap items
  try {
    const result = await scanDomain(domainId, `https://${domain.domain}/`, "manual", env);
    if (result && !result.error && !domain.is_competitor) {
      await autoCompleteRoadmapItems(domain.client_slug, result, env);
    }
  } catch (e) {
    console.log(`Client rescan failed for ${domain.domain}: ${e}`);
  }

  return redirect(`/domain/${domainId}`);
}
