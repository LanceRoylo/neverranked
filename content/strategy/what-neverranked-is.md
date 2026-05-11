---
title: "What NeverRanked actually is"
author: Lance Roylo
date: 2026-05-10
status: canonical, source of truth for positioning
audience: press, sales, agency partners, future hires, future self
---

# What NeverRanked actually is

NeverRanked is the citation infrastructure for AI search. Brands
hire us when their website is invisible to ChatGPT, Perplexity,
Gemini, Claude, Microsoft Copilot, and Google AI Overviews and
they want someone to fix that, not describe it.

This document is the canonical reference for what we do, what
we do not do, and what makes the apparatus defensible. It is
written for the next round of conversations: press inquiries,
agency wholesale calls, prospect intros, future hires reading
themselves into the company.

## The product, in one paragraph

NeverRanked is a service with a tool wrapped around it. We
deploy structured data (Schema.org JSON-LD, llms.txt, agent-
readable Action types) to customer sites via a one-line snippet
that any CMS supports. We track citation share across seven AI
engines daily with statistical attribution at p&lt;0.05 (the
apparatus is called The Citation Tape, public at
neverranked.com/state-of-aeo). One of the seven is Gemma,
Google's open-weight model, which means our citation numbers
are independently reproducible against published weights, not
just a vendor's word for it. We refresh dynamic schemas
(events, products, listings) on a daily cron. The customer does
not log in to act on a dashboard. We ship the work.

## The five things we ship that no other AEO platform ships together

1. **Seven-engine citation tracking with statistical attribution.**
   ChatGPT, Perplexity, Gemini, Claude, Microsoft Copilot, Google
   AI Overviews, and Gemma (Google's open-weight model). No other
   AEO platform tracks all seven, and we're the only one that
   includes an open-weight engine, which means our citation
   numbers are reproducible against published model weights.
   Muck Rack's Generative Pulse covers three. Profound and
   Athena cover three to four. Ahrefs Brand Radar covers four.
   Our weekly Visibility Index includes a "what we deployed and
   what it did" section with two-proportion z-tests on citation
   rate before and after each deploy.

2. **Done-for-you schema deployment.** One snippet, any CMS, no
   engineering on the customer's side. Profound, Athena, Ahrefs
   Brand Radar all stop at "here is what to deploy." We deploy
   it. Compliance-aware templates pass legal review at banks
   and healthcare orgs day one.

3. **Public, reproducible methodology.** The Citation Tape is
   live at neverranked.com/state-of-aeo with weekly reports,
   RSS feed, source code on GitHub, source-type taxonomy
   public, schema in the repo. Anyone can re-run our weekly
   query against their own data and compare. Closed dashboards
   at our competitors require trust; we offer evidence.

4. **An open MCP toolchain.** @neverranked/mcp v0.1.2 is in
   the official Model Context Protocol registry. Three tools
   (aeo_scan, llms_txt_check, agent_readiness_check) callable
   from Claude Desktop, Claude Code, Cursor, or any MCP client.
   Free for developer use. No competitor has anything in MCP
   yet.

5. **Self-instrumented autonomy.** The dashboard cron, the
   weekly report regen, the digest delivery, the GSC pulls,
   every automation that touches customer data has a
   heartbeat invariant in a daily check at
   content/autonomy-log/. The check runs from GitHub Actions
   infrastructure independent of the dashboard, opens a
   GitHub Issue automatically on failure, and writes a
   permanent git-tracked log. The thing being monitored
   cannot suppress its own monitoring.

## The thesis behind the work

AI search engines do not rank pages. They cite sources. The
ten-blue-link SERP that traditional SEO optimized for is
being replaced by direct answers in ChatGPT, Perplexity,
Gemini, Claude, Microsoft Copilot, and Google AI Overviews.
What those engines cite is not what ranks well in Google. It
is what is structured, semantically clear, and reachable
through machine-readable surfaces.

That shift moves the binding constraint from rank to citation.
Schema.org markup, llms.txt feeds, Action types, and
authority signals at third-party surfaces (Wikipedia, Reddit,
news wires, review aggregators) are the levers. Most SEO
agencies are still selling keyword work that no longer
correlates with what AI engines retrieve.

NeverRanked exists because the gap between "what agencies sell"
and "what AI engines need" is wide enough to build a company
in. The deeper we go into the deployment side of the gap, the
harder it is for a generic SEO platform to copy us without
becoming a different company.

## How we make money

Three published tiers, all month-to-month:

- **Pulse, $497/mo.** Entry tier. Monthly Visibility Index PDF,
  10 tracked prompts, 2 schemas deployed monthly, 7-engine
  tracking, multi-pass validation.
- **Signal, $2,000/mo.** Audit + ongoing schema deployment +
  full 7-engine citation tracking + real-time alerts + Reddit +
  authority + drift detection + variant-impact attribution +
  90-day roadmap.
- **Amplify, $4,500/mo.** Signal + content writing + auto-publish
  + Reddit reply briefs + brand-voice fingerprint. Capped at 6
  active customers.

Plus a one-time **Audit, $750**, credited toward the first month
of any tier within 30 days.

Agency wholesale: **$800/mo per Signal slot** at 1-9 clients,
**$700/mo** at 10-24, **$600/mo** at 25+. Agency keeps the retail
price ($2,000/mo per client), pockets $1,200/mo in subscription
margin plus 3-8 hours of billable implementation per slot.
Vertical and regional exclusivity available to founding partners.

## What we do not do

- **Pitch press.** Muck Rack handles that half well. Where Muck
  Rack stops (schema, llms.txt, agent-readiness, the technical
  citation surface), we start.
- **Sell a dashboard.** We sell deployment. The dashboard exists
  so customers can see what we shipped, not so they can ship
  things themselves.
- **Compete on price at the entry tier.** Seerly at $99/mo or a
  WordPress plugin at $19/mo are not the same product. We do
  not race them to zero.
- **Make claims we cannot back.** When the system has integrity
  issues (the 2026-05-10 partial-completion bug is the recent
  example), the State of AEO report carries a banner above the
  headline disclosing it. Brand integrity is non-negotiable.

## What we believe about how AI search will evolve

Three convictions that shape the roadmap:

1. **Agents will take over the long tail of web tasks.** When
   ChatGPT can book a hotel, file a financial application, or
   reserve a restaurant table on the customer's behalf, the
   binding constraint moves from "is the brand named in
   answers" to "can an agent actually transact with the
   brand's surface." Schema.org Action types (ReserveAction,
   ApplyAction, BuyAction, ContactAction) are the
   infrastructure for that. We are deploying for it now, in
   2026, while most agencies are still arguing about
   meta-descriptions.

2. **Citation share will be measured by everyone, methodology
   will matter.** Right now most AEO measurement is gated
   inside dashboards. Buyers see their own number with no way
   to audit the methodology. That will collapse the way SEO
   reporting collapsed in 2018-2020 when the SERP-tracking
   space fragmented into trustable and untrustable vendors.
   We are publishing methodology now so we are on the right
   side of that collapse when it happens.

3. **Multi-engine tracking is table stakes, not a moat.** The
   competitors will catch up to seven engines within 12 months,
   though the open-weight angle (Gemma) is harder to copy because
   it requires committing to reproducibility as a brand value.
   Our deeper moat is what comes after: variant-impact attribution at
   statistical confidence, vertical-specific source-type
   taxonomies, public methodology buyers can defend in front
   of clients, agent-ready Action type deployment. The moat
   is the apparatus, not the engine count.

## What the data says

Six months of operating evidence:

- The Citation Tape captured 437 citation runs across NR's
  tracked client universe in the most recent two-week window.
- Hawaii Theatre Center went from a 45/100 AEO score to a
  95/100 in less than 24 hours after we deployed 36 schemas.
  As of this week, the venue is named in 97% of the AI engine
  retrievals across their tracked keyword set. Two months ago
  that number was zero.
- The reddit-tracker has now profiled six Hawaii verticals
  (banking, hotels, law, restaurants, wealth advisor, real
  estate). Two have meaningful Reddit demand-signal
  (restaurants, banking); the other four require different
  citation infrastructure (LinkedIn, press, schema density).
- The State of AEO report regenerates weekly via a Cloudflare
  Workers cron + a GitHub Actions weekly publisher. The
  apparatus runs itself.
- @neverranked/mcp shipped on npm in 0.1.0 and is at 0.1.2
  with three working tools. Live in the official MCP registry.

## What we charge our agency partners, why

The wholesale tier exists because regional and mid-market
agencies do not have the engineering capacity to ship schema
work themselves. They want a margin line on a real product, not
a tool license they have to operationalize. $800/mo wholesale
on a $2,000/mo retail price gives the agency $1,200/mo per
client in pure subscription margin, plus 3-8 hours of billable
implementation per slot at the agency's hourly rate.

The math at scale: ten agency clients at the Signal tier nets
the agency $12,000/mo in recurring margin. That is one and a
half senior employees, fully paid for by the partnership,
before any direct-billed hours.

Vertical exclusivity is structurally important. The first
agency to sign in any Hawaii vertical gets a lockout so they
do not compete with another NeverRanked-powered agency in the
same vertical for the same buyers. Lockouts are 24-month
terms, renewable, and tied to slot count (an agency with at
least 3 active Signal clients in the vertical holds the
lockout).

## Who runs this

Lance Roylo, founder. Based in Hawaii. Works asynchronously.
Takes on a small number of clients at a time. Before NeverRanked,
built Montaic, an AI-native listing content platform for real
estate agents. The thesis underneath both companies is the same:
if the model layer changes, the tooling has to change with it.

Direct contact: lance@neverranked.com.

## What to read next, depending on who you are

**Press / journalist:** Start at neverranked.com/state-of-aeo.
That is the public methodology. Then read the launch blog post
at content/blog/citation-tape-launch.md (publishing this week).
For a deeper interview, lance@neverranked.com.

**Prospect:** Start at the homepage. If you want to see the
methodology behind the pitch, neverranked.com/state-of-aeo.
The case study at neverranked.com/case-studies/montaic is the
shortest version of "what changes when this works."

**Agency partner:** Start at neverranked.com/for-agencies.
The wholesale economics are on that page. After a brief intro
call, you get a custom co-branded brief at neverranked.com/pitch/
&lt;your-slug&gt; that you can share with your team or your client
list.

**Future hire:** Start here, then read
content/strategy/moat-research-2026-05.md for the longer
strategic frame, then content/handoff-questions/ for what the
team is currently working on. The git log is the operating
history.

**Future Lance:** Re-read this when you are not sure what to
say in a room. The framing has not changed since May 2026. If
you ever feel like you have to pitch, re-read paragraph two.
Service with a tool wrapped around it. Ship the work.
