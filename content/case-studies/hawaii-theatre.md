---
title: "Hawaii Theatre Case Study"
client: Hawaii Theatre
location: Honolulu, Hawaii
sector: Performing Arts / Non-profit
slug: hawaii-theatre
date: 2026-05-11
status: approved (use Hawaii Theatre name, before/after AEO score, deployment details. Greg's name + financials + ticket impact are off-limits.)
hero: From 45 to 95 in ten days.
---

# From 45 to 95 in ten days.

**How NeverRanked rebuilt Hawaii Theatre's AI search foundation,
moved them from invisible to top-cited, and got Perplexity to
recommend them by name on 14 of 19 tracked queries.**

---

## The before state

Hawaii Theatre is a historic Honolulu performing arts venue with
80,000 to 100,000 patrons a year. The venue has been operating
since 1922 and is on both the State and National Registers of
Historic Places. The website was professionally designed, with
real content, real photos, and a solid foundation by traditional
SEO standards.

By AI search standards, it was invisible.

When we ran the initial AEO scan, the venue scored **45 out of
100**. Grade D. The structural issues were textbook:

- **No PerformingArtsTheater schema** — AI engines couldn't tell
  what kind of business they were looking at, just "another
  Hawaii website"
- **No WebSite schema with SearchAction** — Google's sitelinks
  search box was inert; AI engines retrieving the homepage had
  no way to surface specific shows or pages
- **No AggregateRating embedded** — the venue has a 4.6 average
  Google rating across hundreds of reviews, but the rating wasn't
  expressed in structured data anywhere on the site. Social proof
  AI engines look for to validate a recommendation was missing
- **No FAQPage schema** — none of the questions a curious patron
  might ask ("when did Hawaii Theatre open," "how many patrons
  per year," "is it ADA accessible") were answerable in the
  structured form AI retrieval models actually parse
- **No BreadcrumbList anywhere** — the site's hierarchy was
  invisible to engines that build entity graphs from breadcrumb
  trails
- **No Event schema on /upcoming-events/** — every show, every
  ticket link, every date, every venue confirmation was rendered
  in HTML AI engines couldn't reliably extract

Underlying the technical gap, an AI visibility gap. When we
queried Perplexity, ChatGPT, Gemini, Claude, Microsoft Copilot,
Google AI Overviews, and Gemma with prompts like "historic
performing arts venues in Honolulu" or "where to see shows in
downtown Honolulu," Hawaii Theatre was not in the answer. The
recommendations went to other venues. AI engines retrieve from
what they can read. They could not read this site.

That gap had nothing to do with marketing budget, ticket sales,
or brand awareness. It was purely an infrastructure problem.

## The deployment

Over ten days we shipped the following, all delivered through
NeverRanked's one-line injection snippet (no engineering work on
the client's end, no CMS changes, no broken design):

### Day 1, Foundation schemas

- **PerformingArtsTheater** schema deployed on every page —
  identifies the venue type, address, telephone, opening hours,
  founding year, capacity, accessibility features
- **WebSite** schema with SearchAction — enables sitelinks
  search and lets AI engines retrieve specific page targets
  from the homepage
- **AggregateRating** embedded in the PerformingArtsTheater
  block — surfaces the 4.6 Google rating in structured form,
  giving AI engines a social-proof hook to cite

### Day 2, Event schemas

- **31 individual Event schemas** generated from the live
  /upcoming-events/ page — title, date, ticket URL, image,
  venue location, performer when known
- **Daily event refresh cron** activated — every morning at 6am
  UTC the system rescrapes the events page and rewrites the
  Event schema set. Shows that drop off (sold out, cancelled,
  past dates) deactivate automatically. New shows added by the
  venue get picked up within 24 hours. The schema is always
  current

### Day 4, Page-level schemas

- **FAQPage** generated from real homepage content — 8 grounded
  questions and answers covering founding year, mission, annual
  patron count, awards, member benefits, accessibility, gift
  cards, educational programs. Reviewed, approved by NeverRanked,
  deployed
- **BreadcrumbList** schemas deployed across 24 site sections —
  home, upcoming events, tickets, video-on-demand, the theatre
  history, board of directors, parking, donor information, every
  major page. AI engines now have a full hierarchical map of the
  site

### Day 10, Verification

- First AEO scan after deployment: **95 of 100. Grade A.**
- First citation log run after deployment: **Hawaii Theatre named
  by Perplexity on 14 of 19 tracked queries.**

## The result

The score is the inside metric. The citation is the outside one.

A scoring tool is a proxy for AI readability. A real citation is
AI retrieval actually happening on a real model with real
queries. Hawaii Theatre went from neither to both.

The pattern that matters: AI engines did not need to be persuaded.
They did not need a content strategy or a press push or a
backlink campaign. They needed the venue's facts in a format
they could parse. Once the facts were in structured data,
retrieval started inside the first weekly run.

This is what AI search optimization actually is. It is not SEO
with a new label. It is making the underlying machine-readable
layer match the actual business. Most websites do not have
this layer. Most businesses do not know they need it. The ones
that do have it (or ship it) get cited. The ones that do not
keep waiting.

## The work, in numbers

- **10 days** from initial audit to grade A
- **0** lines of code changed on Hawaii Theatre's existing site
- **39** schema blocks deployed via one-line snippet
- **35** Event schemas auto-refreshing daily (current as of the
  scan date)
- **24** BreadcrumbList schemas across major site sections
- **1** FAQPage with 8 grounded Q&A pairs
- **5** category-defining schema types now present:
  PerformingArtsTheater, WebSite, AggregateRating, FAQPage,
  Event
- **45 → 95** AEO score change
- **D → A** grade change
- **14 of 19** tracked queries returning Hawaii Theatre citations
  on Perplexity, the first weekly citation log after deployment

## Why this matters for other venues

If you run a venue, a non-profit, a historic property, or any
business that serves a regional audience through a website that
was professionally designed but not built for AI retrieval, your
state today is probably Hawaii Theatre's state at day zero.
Good site. Real content. Solid traditional SEO. Invisible to
AI search.

The work above is replicable. The schema types are the same.
The deployment mechanism is the same. The measurement framework
(the Citation Tape, our standing AI-citation tracking system
covering seven engines including the only open-weight model,
Gemma) is reproducible by anyone who wants to audit our
methodology.

Whether you work with NeverRanked or not, the question to ask
right now is the same one Hawaii Theatre asked: what does our
site look like to AI engines, and what would they need to see
to cite us?

If you want a 30-second answer, run your URL through our free
AEO checker: **check.neverranked.com**.

If you want the deeper analysis with deployment shape and
priority order, that is the work we do.

---

## What gets featured where (for our internal reference)

**Approved to use:**
- Client name: Hawaii Theatre
- AEO score before: 45/100 (Grade D)
- AEO score after: 95/100 (Grade A)
- Timeline: 10 days
- All schema deployments listed above
- The Perplexity citation result: 14 of 19 tracked queries
- General descriptors (historic venue, Honolulu, performing arts,
  non-profit, 80,000-100,000 annual patrons, 1922 founding)
- Public facts the venue itself publishes (Google rating, awards,
  registry status)

**NOT approved, do not use:**
- Greg's name or title (CEO of the Hawaii Theatre Center)
- Any direct quote (we don't have one)
- Ticket sales numbers or revenue
- Anything that affects Hawaii Theatre's business privacy
- Specific deal terms with NeverRanked

**Approval gate:**
This case study is approved by Hawaii Theatre leadership for use
in NeverRanked marketing, sales material, and conversion content.
The approval covers public-facing material until rescinded.
Re-check before adding new categories of use (press releases,
broadcast media, paid ads).
