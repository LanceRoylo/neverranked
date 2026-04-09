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

- **Audits:** $500, delivered within 48 hours. Paced deliberately. Currently booking Q2 2026.
- **Pulse retainer:** $1,500/mo. Monthly audit, schema maintenance, 2 content pieces, live dashboard.
- **Signal retainer:** $3,000/mo. Everything in Pulse plus 6 content pieces, competitor citation tracking, monthly founder Loom.
- **Amplify retainer:** $5,000/mo. Limited to 2 clients, currently full. 12 content pieces, biweekly Loom, weekly intelligence digest.

The dashboard is the meeting. Loom recaps replace calls. Email SLAs (24h Pulse / 12h Signal / 6h Amplify) replace Slack channels.

---

## Contact

**Email:** hello@neverranked.com
**Web:** https://neverranked.com
**Proof of practice:** [Montaic](https://montaic.com) — our in-house AI-native SaaS, audited by the same team that runs Never Ranked.

---

## License

The Never Ranked marketing site code is proprietary. The audit methodology (the template, the runner script, and the structured deliverables) is also proprietary — but the ideas in the Montaic audit are a case study, freely citable, and published as open evidence of our methodology. If you want to reproduce the methodology on your own site, you're welcome to. If you want us to do it for you, that's the audit offer.
