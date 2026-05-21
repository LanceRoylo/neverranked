# Never Ranked

NeverRanked is a research engagement that measures what AI answer
engines cite for a category. The output is a forensic memo plus a
prepped punch list for the customer's team to execute against.

This repository holds the marketing site, the dashboard worker
source (under `dashboard/`), and the historical artifacts from
the company's prior product.

---

## What this company was, and what it is now

Until May 2026, NeverRanked sold a JavaScript snippet that was
claimed to drive AI citations. We ran a pre-registered kill test
against our own domain. The result was zero citations. The LLM
crawlers do not execute JavaScript, so the snippet was structurally
invisible to them.

We stopped selling that product, retracted the public content that
promoted it, and rebuilt the company around the measurement layer
that does work.

This repository contains both states: the current honest surfaces
(homepage, About, ASB pitch, terms, privacy, llms.txt) and the
historical artifacts (retired blog posts, retired case studies,
retired audits, retired explainers). Anything that contradicts the
retraction is either replaced with an honest holder or marked as
retired in place.

For the current state of every code path, see
`~/.claude/projects/-Users-lanceroylo-Desktop-neverranked/memory/code_rewrite_status_2026-05-21.md`
in Lance's local Claude memory.

---

## What we measure now

Seven AI surfaces, every day.

- **Five citation-grade engines** that search the live web and
  cite their sources: Perplexity, ChatGPT search, Gemini grounded,
  Microsoft Copilot via Bing, Google AI Overviews.
- **Two model-knowledge engines** that answer purely from training
  data: Claude, Gemma.

Both layers measure different failure modes. A brand invisible in
citation is invisible when AI fact-checks itself. A brand invisible
in model knowledge is invisible at the baseline, before any search
happens.

---

## What we deliver

A forensic memo plus a prepped punch list. Per query, per engine,
per competitor, per source type. Daily measurement. Monthly delta
memo on ongoing engagements.

We do not execute. No content writing, no website edits, no schema
deploys, no profile updates. The labor stays with the customer's
team or their agency. That separation is structural.

---

## Pricing

- $4,500 kickoff per category. One time.
- $1,500 per month per category, ongoing.
- Per category, not per client.

This is a research engagement, not a SaaS subscription. There is
no self-serve dashboard.

---

## Repository layout (current)

```
neverranked/
├── index.html              honest homepage holder
├── about/, terms/,         current honest pages
│   privacy/, thanks/
├── pitch/asb-hawaii/       current direct-buyer pitch shape
├── pitch/*/                retired pitch pages (holder)
├── blog/, case-studies/,   retired catalogs (holders + noindex)
│   profile/, state-of-aeo/
├── standards/, schemas/,   retired surfaces (holders)
│   agencies/, security/,
│   for-agencies/,
│   principles/, kit/
├── meetings/kits/          current meeting prep, demo bundle
├── dashboard/              app.neverranked.com Worker source
├── llms.txt                rewritten for current state
└── sitemap.xml             homepage only
```

The historical artifacts (retired pages, audit documents under
`/audits/`, prior explainers like `EXPLAINER.md` and
`AGENCY-EXPLAINER.md`, the original audit template under
`/audit-template/`) reflect the prior product premise and are
preserved for diff context but should not be acted on as current
guidance.

---

## Contact

[Lance@hi.neverranked.com](mailto:Lance@hi.neverranked.com)
