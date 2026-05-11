---
title: "Audit deliverable: questions being asked in your category right now"
date: 2026-05-10
status: spec, ready to slot into next audit
audience: anyone running an audit for a prospect
---

# Audit section: "Questions being asked about your category right now"

A new section to add to every prospect audit going forward. Sits
between the existing citation-share findings and the deployment
roadmap. Captures the conversation Muck Rack measures (mentions
in press + AI) but in the deployment-first frame: not "here is
what people are saying about you" but "here is what people are
asking, that your competitors are answering for them, and your
schema layer is not yet ready to answer."

This is the cheap interim version of the customer-facing
conversation feed deferred at `content/triggered-builds.md`. One
shot per audit, no live feature, no maintenance debt.

## Why this section adds to the audit

Today the audit answers: "what is your AEO score, what is your
citation share, what should you deploy." Strong on the
deployment side. Light on the discovery side.

The conversation section adds: "what is the AI engine and the
Reddit community actually asking about your category, where your
competitors are getting named, and where you have a chance to
seed an answer." That is exactly the question prospects show up
with ("what are people saying about us") and it positions the
deployment roadmap that follows as the answer.

This single addition closes the "Muck Rack does mentions, NR
does deployment" gap from the IQ360 doc without building a
dashboard surface NR's positioning has to defend.

## Section structure

Three subsections. Each runs from data we already collect.
Twenty minutes per audit to assemble.

### Subsection A. AI engines: top 5 questions being asked in your category

Pull from production `citation_runs` filtered to the vertical's
keyword set. For each of the top 5 highest-volume prompts in the
window, show:

- The prompt (one line)
- Which engines surfaced an answer (badges: ChatGPT, Perplexity,
  Gemini, Claude, Copilot, AIO)
- Top 3 cited sources across those answers (with link)
- Whether the prospect is named in any of them (Yes / No / At
  rank N)

Source query (template, adapt per audit):

```sql
SELECT ck.keyword,
       COUNT(*) as runs,
       COUNT(DISTINCT cr.engine) as engines,
       SUM(cr.client_cited) as cited_count
FROM citation_runs cr
JOIN citation_keywords ck ON cr.keyword_id = ck.id
WHERE ck.client_slug = ?
  AND cr.run_at > unixepoch() - 30*86400
GROUP BY ck.keyword
ORDER BY runs DESC
LIMIT 5
```

Then per top-keyword, pull the cited_urls for citation aggregation:

```sql
SELECT cited_urls, engine
FROM citation_runs
WHERE keyword_id = ?
  AND run_at > unixepoch() - 30*86400
```

Aggregate URLs across runs, count appearances, surface top 3.

### Subsection B. Reddit: where the prospect's category is being discussed

Pull from `reddit_threads` and `reddit_thread_mentions` (once
Phase 2 writer ships) or run the reddit-tracker CLI live during
audit prep:

```
node scripts/reddit-brief-generate.mjs \
  --category "<prospect's primary query>" \
  --client-slug "<prospect-slug>" \
  --client-names "<brand variants>" \
  --competitors "<top 5-8 competitors>" \
  --top 5 --format markdown
```

For each of the top 3-5 priority threads, show:

- The thread title and subreddit (linked)
- Priority score with one-line rationale (gap analysis)
- Whether the prospect is mentioned (Yes / No / Negatively)
- Which competitors are named, with mention count

Mark sparse-signal verticals honestly. If the reddit-tracker
returns fewer than 3 on-topic threads, the section says so:
"Reddit demand-signal for this category is thin. The citation
lever for your vertical sits in [LinkedIn / press wires /
Wikipedia / Schema.org density] not Reddit reply ops."

The 2026-05-09 and 2026-05-10 vertical landscape docs at
`content/reddit-briefs/` are the reference for what each Hawaii
vertical's demand signal looks like.

### Subsection C. GSC: what people search to find you (when available)

If the prospect has Google Search Console connected, pull the
top 20 queries by impression count from the most recent
`gsc_snapshots` row. Show the top 10 in a table:

| Query | Impressions | Clicks | CTR | Position |

Flag any queries where:

- Impressions are high but CTR is below 2% (you appear but they
  do not click)
- Position is below 10 but the query is brand-adjacent (you
  rank but not for the right things)
- Query is question-shaped ("how do I", "what is", "best") --
  these are the queries AI engines also field, and your
  presence on the Google answer surface and the AI surface
  correlates more than most agencies admit

If GSC is not connected, the section says so and recommends
connecting it as part of the deployment roadmap.

## What this section is NOT

- Not a live dashboard. One-shot per audit. The customer reads
  it once.
- Not a feed of every mention. Curated top-N per surface.
- Not the deployment recommendation. That section follows next
  in the audit and references back to specific findings here.

## How this fits into the existing audit template

The audit at `audits/<slug>/audit.md` already has sections for:
- Cover / executive summary
- AEO Readiness Score breakdown
- Schema audit
- llms.txt audit
- Agent-readiness audit
- Citation share (existing)
- 90-day deployment roadmap
- Compliance notes

Add the conversation section between **Citation share** and
**90-day deployment roadmap**. The reading order flows: here is
what AI engines cite for your category today + here are the
conversations happening + therefore the roadmap deploys against
those specific surfaces.

## Effort per audit

- Subsection A (AI engines): 5 minutes if `citation_runs` is
  populated for the prospect, 15 minutes if we need to run a
  fresh scan against their keyword set first.
- Subsection B (Reddit): 5-10 minutes for the reddit-tracker
  CLI run + curation.
- Subsection C (GSC): 5 minutes if connected, otherwise a
  one-line note.

Total: 15-30 minutes additional per audit. Acceptable cost for
the close-rate impact.

## When to ship the first version

Slot into the next audit run. The ASB audit deck is locked for
the May 18 meeting, so do not modify that one. Start with
whichever audit comes after.

## When this graduates to a live feature

When the trigger conditions at
`content/triggered-builds.md#customer-facing-conversation-feed-questions-about-your-business-across-llms-+-reddit`
fire, this audit section becomes the seed for the live
dashboard surface. The query patterns, the curation rules, and
the "honest empty state" language all carry over directly.

Building the cheap version now teaches us what to build later.
