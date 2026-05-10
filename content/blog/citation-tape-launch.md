---
title: "The Citation Tape"
subtitle: "A weekly, reproducible measurement of what AI engines actually cite"
slug: citation-tape-launch
publish_date: 2026-05-10
category: methodology
status: draft
description: "The Citation Tape is NeverRanked's standing measurement system for AI search citations. Weekly reports at neverranked.com/state-of-aeo, generated from production data, reproducible from public schema. Same script, same data sources, no manual curation."
---

# The Citation Tape

*A weekly, reproducible measurement of what AI engines actually cite.*

---

For the last six months, we've been building a thing that didn't have a name. A standing measurement system for AI search citations, running weekly across the brands NeverRanked tracks, surfacing what ChatGPT, Perplexity, Gemini, Claude, Microsoft Copilot, and Google AI Overviews actually pull from when they answer questions about those brands.

The thing now has a name. We call it **The Citation Tape**.

The first weekly report is live at [neverranked.com/state-of-aeo](https://neverranked.com/state-of-aeo/). New reports will land every Monday by 6am Pacific. The most recent one carries a top-of-document data-integrity notice that we'll explain below. We're starting honest about the limits.

## Why "tape"

A ticker tape is a continuous stream of factual data. It runs in real time. It's machine-generated. It's indifferent to the reader. The data flow is the product, not the report.

That's what we have. Our `citation_runs` database accumulates rows every time the cron fires: one row per AI engine query for one tracked keyword, with the engine's response text and cited URLs captured as raw evidence. The weekly State of AEO report is the artifact. The Citation Tape is the apparatus that makes the report inevitable.

Naming a thing matters because it lets you reference it consistently. Customer asks "is there a way to see what AI engines are saying about my category?" Yes. The Citation Tape covers that category if we're tracking it. Press asks "where do you get your numbers?" The Citation Tape, at neverranked.com/state-of-aeo, with the source code at scripts/state-of-aeo-generate.mjs and the source-type taxonomy at tools/citation-gap/src/source-types.mjs.

## What's in a weekly report

Each weekly run produces seven sections:

1. **Headline.** The single most-cited third-party source across the dataset, with a one-sentence implication.
2. **Where AI engines pull from.** Distribution of citation runs by source type (15 categories: Wikipedia, Reddit, news wires, AEO services agencies, AEO platforms, SEO publications, Google AI infrastructure, etc.).
3. **Top 15 third-party sources.** Domain-level ranking with engines, keywords, and clients per row.
4. **What each engine cites differently.** Top 5 sources per engine. Reveals retrieval differences across engines.
5. **Vertical breakdown.** When at least three tracked clients share a vertical, category-level patterns become visible.
6. **Per-client baselines.** Each tracked client's current citation footprint. The numbers we measure today become the baseline against which any future case study is measured.
7. **Methodology and sample disclosure.** Honest counts. Per-client keyword completion rates. Acknowledged limits.

Generated weekly. Same script, same data sources, no manual curation. Anyone running the same query against the same database gets the same numbers.

## The data-integrity notice

The 2026-05-10 weekly report carries a banner at the top: this week's data is partial. Three of three tracked clients fell below 80% keyword completion due to a known infrastructure issue. The numbers in the report should be read as a lower bound on what AI engines actually retrieve, not the final picture.

We're publishing this anyway, with the banner visible above the headline, because:

- The pattern shown (which source types AI engines cite, where the gaps are) is reliable even when the magnitude is conservative.
- Hiding the banner until the bug is fixed would require lying about when our data is healthy. We'd rather publish honestly and show the bug fix landing in real time.
- The fix shape is documented in the public repo at `content/handoff-questions/citation-cron-not-firing.md`. Anyone curious about the engineering reality behind the number can read it.

When the underlying bug ships, the banner disappears on its own. The visual presence of the banner becomes a signal: the more weeks it persists, the more we owe the audience.

## Reproducible by design

Three properties make The Citation Tape different from every other "AI visibility" report we've seen:

1. **The methodology is the script.** `scripts/state-of-aeo-generate.mjs` reads `citation_runs` from production D1, applies the source-type classifier, and emits the report markdown. No hidden hand-curation. No "our analyst noticed."
2. **The source-type taxonomy is public.** `tools/citation-gap/src/source-types.mjs` defines the 15 categories. Disagree with how we classified a domain? File a PR.
3. **The schema is in the repo.** `citation_runs` migration is published. Build your own version of this report against your own data and compare.

You can't reverse-engineer Gartner's Magic Quadrant. You can re-run our weekly report, with our exact methodology, against your own clients and decide if the numbers feel right.

## What we're not claiming

The Citation Tape is descriptive of what AI engines say to questions in NR's tracked client universe. It is not a random sample of "AI search" generally. Generalizing beyond the categories we track requires more data, and as more clients onboard, the tracked universe and the report's authority grow together.

The first weekly report covers three clients across three Hawaii-anchored verticals (community banking, performing arts, corporate training). The numbers in week one are correct for what they measure. They are not a proclamation about all AI search.

Year over year, as the tracked universe grows, the annual State of AEO report becomes a deeper, more category-comparative document. The weekly Citation Tape feeds that annual rollup with continuously-updated data. Both are at the same URL.

## How to subscribe

- **RSS:** https://neverranked.com/state-of-aeo/feed.xml
- **Public hub:** https://neverranked.com/state-of-aeo/
- **PDFs of each weekly report** are posted alongside the web version.
- **Customers** receive the headline finding inside their weekly digest email.

We don't currently offer email subscription for non-customers. The RSS feed is the canonical way to stay updated.

## What this means for the AEO industry

Most AEO measurement today is gated behind dashboards. Customer can see their own number. Categorical patterns are locked up inside agency operations decks or slide-ware. There is no public, standing methodology anyone can reference.

The Citation Tape is our public methodology. It's small now. It will grow. And it's running every Monday at 6am Pacific whether anyone reads it or not.

If you're tracking AEO for your category and want NR's tracked universe to include you, [talk to us](mailto:lance@neverranked.com).

If you're a journalist or analyst writing about AI search and want raw data behind a citation pattern, the Tape is published every week. Use it.

If you're an agency partner who wants this same infrastructure pointed at your client roster, MVNP-style wholesale is on the roadmap.

We've been quiet for six months because we wanted the methodology to work before we named it. It works now. Welcome to The Citation Tape.

---

*Lance Roylo is the founder of [NeverRanked](https://neverranked.com), an AI-native AEO and schema deployment company building the citation infrastructure brands need to be cited by AI engines. The Citation Tape is published weekly at [neverranked.com/state-of-aeo](https://neverranked.com/state-of-aeo/).*
