/**
 * Dashboard -- Public changelog
 *
 * Route:
 *   GET /changelog
 *
 * Trust signal that the platform is being actively built. Curated by
 * hand (not auto-generated from commits) so entries are written for
 * users, not engineers. Reverse-chronological. Public, indexable so
 * prospects who land here from Google or word-of-mouth see velocity.
 *
 * Updating: add a new ENTRIES item at the top. Keep titles short
 * (< 70 chars). Body is plain English describing user-visible
 * impact, not implementation.
 */

import type { Env } from "../types";
import { html, esc } from "../render";
import { CSS } from "../styles";

interface Entry {
  date: string;          // YYYY-MM-DD
  category: "Shipped" | "Improved" | "Fixed";
  title: string;
  body: string;
}

const ENTRIES: Entry[] = [
  {
    date: "2026-04-19",
    category: "Shipped",
    title: "Citation-lost alerts (the warning side of first-citation)",
    body: "If your AI citations dropped to zero from a previous week, you now get an email within hours explaining what usually causes it (page changed, competitor moved up, model retrained) and what to check.",
  },
  {
    date: "2026-04-19",
    category: "Shipped",
    title: "Free check tool: faster path from scan to pricing",
    body: "Trust signals and a 'See pricing' link now live in the hero of check.neverranked.com instead of buried below the results. Strict email validation prevents junk addresses from poisoning the drip sequence.",
  },
  {
    date: "2026-04-19",
    category: "Shipped",
    title: "NPS prompt + exit survey, with admin views",
    body: "In-product NPS asks paying users every 90 days how likely they are to recommend NeverRanked. Cancellation interstitial offers pause / talk to founder / update card / cancel anyway with a reason picker. Both signals visible at /admin/nps and /admin/exit.",
  },
  {
    date: "2026-04-19",
    category: "Shipped",
    title: "Annual recap email",
    body: "On January 1st of every year, every active client gets a year-in-review summarizing score change, citation share, work shipped, and best month. Forwardable to stakeholders.",
  },
  {
    date: "2026-04-19",
    category: "Shipped",
    title: "Monthly recap email",
    body: "On the 1st of every month, a recap of the previous month: score change, citation share change, roadmap items completed, schema fixes pushed live. Sent to opted-in users + agency contact for agency-owned domains.",
  },
  {
    date: "2026-04-19",
    category: "Shipped",
    title: "First-citation celebration email",
    body: "The first time an AI engine cites a client for one of their tracked keywords, an email fires immediately. Frames the moment: 'AI engines decided -- on their own -- you're a credible source for that question.'",
  },
  {
    date: "2026-04-19",
    category: "Shipped",
    title: "Activation milestone celebrations",
    body: "When the snippet is first detected on a client's site, when the AEO grade improves, or when a roadmap phase completes, the right people get an email. The work the platform sells is now visible at the moments it lands.",
  },
  {
    date: "2026-04-19",
    category: "Shipped",
    title: "Stripe failed payment + expiring card emails",
    body: "If a charge fails or a card on file expires within 30 days, the customer gets a direct email with a one-click portal link. Closes the involuntary churn gap where Stripe retried silently and customers found out only when their account auto-cancelled.",
  },
  {
    date: "2026-04-19",
    category: "Shipped",
    title: "Cancellation interstitial + exit survey",
    body: "Cancel attempts now route through /settings/cancel which offers four options: pause instead, talk to the founder, just update the card, or cancel anyway with a reason. Captures real signal on why people leave instead of letting Stripe absorb it silently.",
  },
  {
    date: "2026-04-19",
    category: "Shipped",
    title: "Setup completeness checklist on the client dashboard",
    body: "Five-step checklist (first scan, snippet installed, GSC connected, citation keywords added, share link sent) surfaces what's left to set up. Card disappears at 5/5.",
  },
  {
    date: "2026-04-19",
    category: "Shipped",
    title: "16-platform install guides at /install",
    body: "Step-by-step guides for installing the snippet on WordPress, Shopify, Squarespace, Wix, Webflow, Google Tag Manager, and 10 more. Public and indexable. Forwardable to a webmaster -- no login needed.",
  },
  {
    date: "2026-04-19",
    category: "Shipped",
    title: "Snippet escalation: Day 21 reframe + Day 90 honest reset",
    body: "Day 21 fires a different-tone email naming what the user IS getting from NeverRanked AND what the snippet would unlock. Day 90 offers an explicit 'install / pause / cancel' choice -- no auto-renewal until angry exit.",
  },
  {
    date: "2026-04-18",
    category: "Shipped",
    title: "Agency self-serve: add, pause, resume clients",
    body: "Agencies can now add a new client without ops intervention. Pause and resume buttons on each client row trigger Stripe slot reconciliation automatically.",
  },
  {
    date: "2026-04-18",
    category: "Shipped",
    title: "Agency-branded transactional emails",
    body: "Magic-link sign-in, weekly digests, and regression alerts to clients of Mode-2 agencies now carry the agency's logo and primary color. Display name swaps to the agency.",
  },
  {
    date: "2026-04-18",
    category: "Shipped",
    title: "Agency invites with /auth/invite flow",
    body: "Agencies can invite teammates and Mode-2 clients directly. 7-day invite TTL (longer than magic links). Copy-link button on every pending invite for sending via Slack/text.",
  },
  {
    date: "2026-04-18",
    category: "Shipped",
    title: "Branded PDF reports",
    body: "Monthly client reports rendered with the agency's logo and color when the domain is agency-owned. Downloadable from /report/:slug.",
  },
];

export async function handleChangelog(_request: Request, _env: Env): Promise<Response> {
  const grouped = new Map<string, Entry[]>();
  for (const e of ENTRIES) {
    const arr = grouped.get(e.date) || [];
    arr.push(e);
    grouped.set(e.date, arr);
  }

  const sections = Array.from(grouped.entries()).map(([date, items]) => `
    <div style="margin-bottom:36px">
      <div style="font-family:var(--mono);font-size:12px;color:var(--text-faint);margin-bottom:14px;letter-spacing:.04em">
        ${esc(new Date(date + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }))}
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">
        ${items.map((e) => `
          <div style="padding:18px 22px;background:var(--bg-edge);border-left:3px solid ${e.category === "Shipped" ? "var(--green)" : e.category === "Improved" ? "var(--gold)" : "var(--text-faint)"};border-radius:0 4px 4px 0">
            <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:8px;flex-wrap:wrap">
              <span style="font-family:var(--label);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:${e.category === "Shipped" ? "var(--green)" : e.category === "Improved" ? "var(--gold)" : "var(--text-faint)"}">${esc(e.category)}</span>
              <strong style="font-size:15px;color:var(--text)">${esc(e.title)}</strong>
            </div>
            <div style="font-size:13px;color:var(--text-faint);line-height:1.7">${esc(e.body)}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");

  const body = `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Changelog -- Never Ranked</title>
<meta name="description" content="What we shipped this week. Continuous record of every user-visible change in NeverRanked, the AI search visibility platform.">
<meta name="theme-color" content="#121212">
<meta property="og:title" content="Never Ranked Changelog">
<meta property="og:description" content="Continuous record of every user-visible change in NeverRanked.">
<meta property="og:type" content="article">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=DM+Mono:ital,wght@0,300;0,400;0,500&family=Barlow+Condensed:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<div class="grain" aria-hidden="true"></div>
<main class="page" style="max-width:720px;margin:0 auto;padding:48px 24px 80px">
  <div style="font-family:var(--serif);font-size:20px;font-style:italic;color:var(--gold);margin-bottom:48px">
    <a href="https://neverranked.com" style="color:inherit;text-decoration:none">Never Ranked</a>
  </div>

  <div style="margin-bottom:40px">
    <div class="label" style="margin-bottom:8px;color:var(--text-faint)">Changelog</div>
    <h1 style="margin:0 0 12px;font-family:var(--serif);font-size:36px;font-style:italic;color:var(--text)">What we shipped.</h1>
    <p style="color:var(--text-faint);font-size:15px;line-height:1.7;max-width:560px">
      Continuous record of every user-visible change. The platform is in active build. We update this page each time something noteworthy ships.
    </p>
  </div>

  ${sections}

  <div style="margin-top:64px;padding-top:24px;border-top:1px solid var(--line);font-size:12px;color:var(--text-faint)">
    Want a feature mentioned here? Tell us at <a href="mailto:hello@neverranked.com" style="color:var(--gold)">hello@neverranked.com</a>.
  </div>
</main>
</body>
</html>`;

  return html(body);
}
