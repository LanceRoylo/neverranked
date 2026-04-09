# Montaic Month 1 Implementation Kit

**Purpose:** Turn the 90-day roadmap from recommendations into executable code. Every file in this folder corresponds to a specific Month 1 task from `../07-roadmap.md` and contains pasteable code, ready-to-use copy, and effort estimates.

**Target completion:** All of Month 1 in ~10 focused hours, spread across 3-5 days.

---

## Execution order (recommended)

The kit is numbered A1-A11 in order of impact-per-hour. If you only have an hour today, do A1 and A7. If you have a day, do A1-A7. If you have a week, do all of them.

| # | File | Impact | Effort | Cumulative |
|---|---|---|---|---|
| A1 | Organization + WebSite schema | CRITICAL | 30 min | 30 min |
| A7 | Canonical tags + robots meta | HIGH | 20 min | 50 min |
| A6 | Free-listing-generator full stack | HIGH | 40 min | 90 min |
| A9 | Title + meta rewrites (top 4) | HIGH | 15 min | 105 min |
| A2 | BreadcrumbList schema | HIGH | 40 min | 145 min |
| A3 | HowTo schema (top 5 tools) | HIGH | 70 min | 215 min |
| A8 | og:image generation | HIGH | 45-100 min | 290 min |
| A4 | BlogPosting schema upgrade | MEDIUM | 60 min | 350 min |
| A5 | SoftwareApplication + ratings | HIGH (gated) | 70 min + review collection | 420 min |
| A10 | Entity registration | CRITICAL | 3-5 hours | 720 min |
| A11 | Fair Housing pillar article | HIGH | 90 min | 810 min |

**Quick wins track (90 min total):** A1 → A7 → A6 → A9
**One-day sprint (6-7h total):** A1 → A7 → A6 → A9 → A2 → A3 → A8 → A4
**One-week commitment (12-15h total):** Everything above plus A5 + A10 + A11

---

## What's in each file

**A1 — Root schema (Organization + WebSite)**
The single highest-impact change. Establishes Montaic as a recognized entity. Pasteable JSON-LD block, goes in root layout.

**A2 — BreadcrumbList schema**
Reusable TypeScript function + path-based auto-generator. Applies to all 222 URLs.

**A3 — HowTo schema**
Templated function + 3 worked examples (MLS generator, social generator, fact sheet). Wires up the top 5 tool pages.

**A4 — BlogPosting schema upgrade**
Replaces the thin Article schema with full BlogPosting including Person author, hero image, keywords, word count.

**A5 — SoftwareApplication + AggregateRating**
Templated schema function. Includes the exact review-collection email to send to existing users.

**A6 — Free-listing-generator full stack**
Complete schema bundle (WebApplication + HowTo + FAQPage + BreadcrumbList) for the currently-unoptimized free tool page, plus a 500-word copy expansion.

**A7 — Canonical tags + robots meta**
Next.js metadata blocks for homepage, pricing, free-grader, and blog posts. Fixes the 4 pages currently missing canonicals.

**A8 — og:image generation**
Three approaches (Vercel @vercel/og, static pre-gen, manual-per-type) with full code for each. Fixes the 95% of pages without social preview images.

**A9 — Title + meta rewrites**
Specific rewrites for homepage, pricing, free-grader, Fair Housing checker, plus templates for city pages and comparison pages.

**A10 — Entity registration checklist**
Exact URLs and field-by-field copy for Wikidata, Crunchbase, LinkedIn, Product Hunt, G2, Capterra, AlternativeTo, BetaList, SaaSHub, and real-estate-specific directories.

**A11 — Fair Housing pillar article (full draft)**
2,400-word ready-to-publish article on the 2024 HUD AI guidance. This is the positioning piece. Includes schema block and external citation requirements.

---

## What to do first if you only have 30 minutes

Paste the A1 schema block into Montaic's root layout. Deploy. That's it. This one change, shipped today, starts changing how ChatGPT, Perplexity, and Google AI Overviews describe Montaic within 4-6 weeks.

Everything else in this folder compounds the A1 foundation.
