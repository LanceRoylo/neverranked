# Never Ranked

**AI-native SEO & AEO agency.** Search changed. Your visibility didn't. We fix that.

This repository contains the Never Ranked marketing site, the audit methodology used to deliver client work, and the first proof-of-practice case study (an audit of our own in-house SaaS, [Montaic](https://montaic.com)).

---

## What's in this repo

```
neverranked/
├── index.html                  # the marketing site (single-file, no framework)
├── _headers                    # Cloudflare Pages security + caching headers
├── robots.txt                  # robots directives
├── sitemap.xml                 # sitemap for crawlers
│
├── audit-template/             # reusable blank template for client audits
│   ├── README.md               # how to run a new audit
│   ├── intake-questionnaire.md # 12-question client intake
│   ├── 00-executive-summary.md
│   ├── 01-intake.md
│   ├── 02-technical-audit.md
│   ├── 03-schema-review.md
│   ├── 04-keyword-gap.md
│   ├── 05-ai-citations.md
│   ├── 06-competitor-teardown.md
│   └── 07-roadmap.md
│
├── audits/                     # completed client audits
│   └── montaic/                # the first case study
│       ├── 00-executive-summary.md
│       ├── 02-technical-audit.md
│       ├── 03-schema-review.md
│       ├── 04-keyword-gap.md
│       ├── 05-ai-citations.md
│       ├── 06-competitor-teardown.md
│       ├── 07-roadmap.md
│       ├── implementation/     # Month 1 pasteable implementation kit
│       │   ├── README.md
│       │   ├── A1-root-schema.md
│       │   ├── A2-breadcrumbs.md
│       │   ├── A3-howto-schema.md
│       │   ├── A4-blogposting-schema.md
│       │   ├── A5-software-application.md
│       │   ├── A6-free-grader-full-stack.md
│       │   ├── A7-canonicals-robots.md
│       │   ├── A8-og-images.md
│       │   ├── A9-title-meta-rewrites.md
│       │   ├── A10-entity-registration.md
│       │   └── A11-fair-housing-pillar-article.md
│       └── raw/                # fetched HTML + evidence trail
│
└── scripts/
    └── run-audit.py            # automated audit runner (no dependencies)
```

---

## The site

`index.html` is the entire Never Ranked marketing site. Single file. No framework. No build step. Editorial dark-luxury design inspired by [MouthWash Studio](https://mouthwash.studio).

**Fonts:** Playfair Display (headlines), DM Mono (body), Barlow Condensed (labels).
**Palette:** `#080808` background, `#c9a84c` gold accents, `#f0ece3` off-white text.
**Features:** Film grain overlay, scroll reveal animations, mobile-first responsive, async-first positioning.

**Deploy:** drop this folder into Cloudflare Pages, or point a GitHub connection at it. No build command. Output directory: `/`.

---

## The methodology

Never Ranked delivers audits in six parts:

1. **Technical Audit** — meta tags, canonicals, OG tags, schema inventory, crawlability
2. **Schema Review** — JSON-LD coverage, entity signals, ready-to-paste fixes
3. **Keyword Gap Analysis** — SERP reality check, intent clusters, positioning opportunities
4. **AI Citation Audit** — citation share across target queries in ChatGPT, Perplexity, Gemini, Google AI Overviews
5. **Competitor Teardown** — side-by-side technical comparison with direct competitors
6. **90-Day Roadmap** — prioritized, dated, effort-estimated action plan

The audit runs in ~90 minutes of automated work plus ~3 hours of human synthesis. Delivered within 48 hours of booking.

## Running a new audit

```bash
# 1. Clone this repo, cd into it
git clone https://github.com/yourorg/neverranked.git
cd neverranked

# 2. Run the audit runner against the target domain
python3 scripts/run-audit.py https://client-domain.com --out audits/client-name/raw/

# 3. Copy the template
cp -r audit-template audits/client-name

# 4. Fill in each deliverable using the raw data + live SERP testing
# (see audit-template/README.md for the full workflow)
```

---

## The Montaic audit

The `audits/montaic/` directory contains the first Never Ranked audit, run against our own in-house SaaS. It's the proof of practice — we don't pitch what we haven't tried.

**Headline finding:** Montaic has 0% AI citation share across 8 primary category queries, vs 100% for ListingAI (the category leader).

**Root cause:** Missing entity signals. No Organization schema anywhere on the site, despite 222 indexed pages. Google fuzzy-matches "Montaic" as "Monti" / "Monte" / "Montana."

**Fix path:** The `implementation/` subdirectory contains pasteable code and copy for all 11 Month 1 tasks. Total implementation time: ~10 focused hours spread across 3-5 days.

**Expected outcome:** 15%+ AI citation share within 90 days, paired with Wikidata / Crunchbase / G2 / LinkedIn entity registration.

---

## The operating model

Never Ranked is deliberately small. One founder, async-first, no standing meetings.

- **Audit:** $500 one-time, delivered within 48 hours. The starting diagnostic.
- **Signal retainer:** $2,000/mo, three-month minimum. Web-grounded citation tracking across ChatGPT, Perplexity, Gemini, Claude. Reddit thread monitoring. Schema fixes auto-pushed to your live site (graded for completeness first). Authority audits. Industry-percentile benchmarks. Quarterly drift detection. Forward-ready Monday digest.
- **Amplify retainer:** $4,500/mo, three-month minimum. Capped at 6 active clients globally. Everything in Signal plus brand-voice fingerprint, citation-shaped content drafted in your voice, auto-publish to WordPress / Webflow / Shopify, and Reddit reply briefs (per-thread strategic briefs your team uses to post real human replies — we never draft the comment itself).

The dashboard is the meeting. Loom recaps replace calls. Email SLAs replace Slack channels.

---

## Contact

**Email:** hello@neverranked.com
**Web:** https://neverranked.com
**Proof of practice:** [Montaic](https://montaic.com) — our in-house AI-native SaaS, audited by the same team that runs Never Ranked.

---

## License

This repository is **source-available**, not open-source. See [`LICENSE`](./LICENSE) for the full text. In plain language:

- **You can:** read every line, audit it, run it locally, fork it, learn from it, cite it, file issues, send PRs, copy ideas into your own work.
- **You cannot:** use this code to operate a commercial AEO service (citation tracking, schema grading, drift detection, authority audits, etc.) that competes with NeverRanked.
- **In four years (April 2030):** the code automatically converts to MIT and the restriction lifts.

The license is modeled on the Business Source License pattern used by MariaDB, Sentry, and CockroachDB. The intent: keep the code open enough that customers can audit our work and security claims, while preventing a clone-and-launch competitor in the early years.

If you want to operate a commercial service using this code before the change date, email **licensing@neverranked.com**.

The "NeverRanked" name and wordmark are trademarks. Forks must be renamed.
