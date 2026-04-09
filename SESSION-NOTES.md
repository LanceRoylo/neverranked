# Session Notes — April 9, 2026

**Duration:** Long session, multiple phases
**Status:** Built more than expected; now sitting on a stack of ready-to-execute work

This is a handoff doc telling you, Lance, exactly what was done, what's ready to ship, and what the concrete next actions are when you come back to this.

---

## What exists now that didn't exist yesterday

### 1. The Never Ranked marketing site — shipped-ready

`index.html`, 1,800+ lines, single file, no framework. Editorial dark-luxury design inspired by MouthWash Studio. Mobile tested. Three CSS bug fixes committed. Hero meta strip reworked into editorial statements. Audit section scarcity line replaced with "Paced deliberately. Currently booking Q2 2026."

**State:** Ready to deploy to Cloudflare Pages. Deploy takes 15 minutes.

---

### 2. The Montaic audit — case study committed

`audits/montaic/` — full six-deliverable audit produced in ~90 minutes. 1,435 lines of findings. Headline: **0% AI citation share** across 8 primary category queries. This is the proof of practice the entire business depends on.

**State:** Committed to git. Ready to publish as case study or share privately with prospects.

---

### 3. Montaic implementation kit — Month 1 ready to execute

`audits/montaic/implementation/` — 11 files with pasteable code and copy for every Month 1 foundation task. Total: ~10 hours of focused work to implement all of Month 1 on the actual Montaic codebase.

**What's in it:**
- A1: Organization + WebSite schema block (30 min)
- A2: BreadcrumbList schema generator (40 min)
- A3: HowTo schema template (70 min)
- A4: BlogPosting schema upgrade (60 min)
- A5: SoftwareApplication + AggregateRating (70 min + review collection)
- A6: Free-listing-generator full schema stack (40 min)
- A7: Canonical tags + robots meta (20 min)
- A8: og:image generation (45-100 min)
- A9: Title + meta rewrites (90 min)
- A10: Entity registration checklist (3-5 hours)
- A11: Fair Housing pillar article (full 2,400-word draft)

**State:** Every file contains ready-to-paste code. You can start executing on Montaic this afternoon without any additional planning.

---

### 4. Reusable audit template — scales the business

`audit-template/` — blank skeleton of all 7 deliverables for the next client audit. Plus `audit-template/intake-questionnaire.md` — the 12-question client intake form you send after they pay.

`scripts/run-audit.py` — 400-line Python script that takes a client domain as input, fetches homepage + robots + sitemap + representative sample pages, extracts technical signals, and outputs a structured JSON report plus a list of red flags. **Tested against Montaic: reproduced 11 of 11 manual findings automatically.**

**State:** Ready to use for the first paying client. Workflow:
```bash
cp -r audit-template audits/{client-slug}
cd audits/{client-slug}
mkdir raw
python3 ../../scripts/run-audit.py https://{client-domain} --out raw/
```

---

### 5. Deploy artifacts — Cloudflare Pages ready

- `_headers` — security + caching headers
- `robots.txt` — tells crawlers to skip `/audits/` and `/audit-template/`
- `sitemap.xml` — minimal sitemap with the single page + section anchors
- `README.md` — repo introduction, directory map, operating model explainer

**State:** Drop the entire folder into Cloudflare Pages direct upload. Done in 90 seconds. You get `neverranked.pages.dev` for free, can point a real domain at it later.

---

### 6. Launch content — the inbound engine

`content/launch-post.md` — 2,800-word "We Audited Our Own SaaS" post ready to publish as the Never Ranked launch announcement. Positioned as a proof-of-practice narrative, cliffhanger ending that sets up a 60-day follow-up post with the before/after data.

**State:** Ready to publish. Recommended channels: Substack, LinkedIn article, cross-posted to Hacker News and Indie Hackers, shared directly with real estate Twitter influencers.

**Recommended timing:** Publish AFTER you've implemented Month 1 on Montaic. You want the follow-up post (with real citation share data) to come 60 days after the launch post, not 90 days.

---

## What to do next, in exact priority order

### THIS WEEK

#### Day 1 (today or tomorrow): Deploy the site
- 15 minutes
- Log into Cloudflare dashboard → Pages → Create project → Direct upload → drag this folder
- You get `neverranked.pages.dev`
- Paste the URL into your email signature
- That's it. Don't worry about the domain yet.

#### Day 1: Implement A1 on Montaic (Organization schema)
- 30 minutes
- Read `audits/montaic/implementation/A1-root-schema.md`
- Paste the schema block into Montaic's root layout
- Update the logo URL, social URLs, founder name
- Deploy to Montaic
- Validate with Google Rich Results Test

**This single action is the most important thing you can do for Montaic's AEO. Everything else compounds on this foundation.**

#### Day 2: Implement A7 (canonicals) on Montaic
- 20 minutes
- Read `audits/montaic/implementation/A7-canonicals-robots.md`
- Add canonical tags to Montaic's homepage, pricing, free-grader, and blog templates
- Add the explicit robots meta tag site-wide
- Deploy

#### Day 2: Implement A9 title rewrites (top 4 pages only)
- 15 minutes
- Read `audits/montaic/implementation/A9-title-meta-rewrites.md`
- Rewrite the title + meta for: homepage, pricing, free-grader, Fair Housing checker
- Deploy

#### Day 3: Start A10 (entity registration)
- 60 minutes
- Read `audits/montaic/implementation/A10-entity-registration.md`
- Register Montaic on Wikidata (the hardest but most important)
- Register on Crunchbase
- Register on LinkedIn Company (if not already)
- Update the A1 schema's `sameAs` array with the new URLs

#### End of week: Send review collection email
- 15 minutes
- Use the email template in `audits/montaic/implementation/A5-software-application.md`
- Send to all existing Pro/Broker Montaic customers
- Target: 5-10 real reviews back within 72 hours

---

### NEXT WEEK

#### Day 1: Implement A2 (BreadcrumbList) + A6 (Free Grader full stack)
- 80 minutes combined
- Both are template-driven, apply to many pages at once

#### Day 2-3: Implement A8 (og:image generation)
- 45-100 minutes depending on approach
- Start with the static/manual approach (Approach 3) if you want a fast ship
- Graduate to @vercel/og later when you have time

#### Day 4: Implement A3 (HowTo schema) for top 5 tool pages
- 70 minutes
- Template once, apply to MLS generator, social generator, fact sheet, etc.

#### Day 5: Publish A11 (Fair Housing pillar article)
- 90 minutes
- Review and personalize the draft in `A11-fair-housing-pillar-article.md`
- Add real HUD citations
- Create or source a hero image
- Publish on Montaic blog with the full schema

---

### WEEK 3-4

- Implement A4 (BlogPosting schema upgrades)
- Deploy A5 (AggregateRating) once reviews are collected
- Finish A10 (register on G2, Capterra, Product Hunt, AlternativeTo, BetaList)
- Start expanding the 8 comparison pages (Month 2 from the roadmap)

---

### DAY 30 — the before/after measurement

- Re-run `scripts/run-audit.py` against montaic.com
- Compare to the baseline in `audits/montaic/`
- Re-test the 8 primary AEO queries manually via Google, ChatGPT, Perplexity
- Document what changed

If citation share moved meaningfully (even 5-10%), you have your case study.

---

### DAY 45 — publish the launch post

- Polish `content/launch-post.md` with the actual before/after numbers from day 30
- Publish on your chosen platforms
- Share the full Montaic audit publicly as part of the launch
- This is the moment Never Ranked goes from private to public

---

## Things I could NOT do from this session

I want to be clear about what requires your hands:

- **Deploying anything.** I can't log into Cloudflare, your DNS provider, or Montaic's hosting. Deployment is yours.
- **Registering entities.** Wikidata, Crunchbase, G2, LinkedIn — all need your accounts and verification.
- **Touching Montaic's actual codebase.** I don't have access to Montaic's repo. All the implementation kit files are code you paste in, not files I modify directly.
- **Collecting real reviews.** You have to email real users and ask.
- **Tool subscriptions.** Ahrefs, LLM Pulse, Otterly — those need your payment method.
- **Sales conversations.** You're the sales team.

Everything that lives in this repo is as far as I can take it without you in the loop.

---

## Open questions for you

1. **Do you want to push this repo to GitHub?** Currently local-only. If you push, the audit becomes publicly citable (which is powerful for launch). If you keep it private, you control the timing. I recommend pushing once you've implemented Month 1 on Montaic and can update the README with real before/after data.

2. **Do you want to convert the Montaic audit to PDF?** The anthropic-skills pdf tool can generate a polished PDF version of the six-deliverable audit for client-facing delivery. Takes ~15 minutes. Worth doing when you send the audit to prospects.

3. **Do you want to update the `neverranked.com` index.html to link to the Montaic audit as a visible case study?** Right now the site mentions Montaic in the "Proof of Practice" section but doesn't link to the actual audit. Once the audit is public, linking it strengthens the proof significantly.

4. **Do you want to adjust any of the Month 1 kit before executing?** Every file is opinionated. If a recommendation doesn't fit Montaic's reality (e.g., you disagree with the Fair Housing positioning angle, or the specific schema field values), tell me and I'll revise before you paste anything.

---

## The North Star

The reason all of this exists is that Never Ranked can't sell AEO audits without proof AEO audits work. Montaic is the proof. The implementation kit is how you make the proof real. The launch post is how you tell the story.

Once you have:
1. A deployed Never Ranked site with a public URL
2. A measurable before/after on Montaic's citation share
3. A published launch post narrating the story

...then Never Ranked has a credible market entry. Not before.

Everything else — sales outreach, tool subscriptions, domain purchase, pricing experiments — is downstream of those three things. Don't do any of them until those three are in place.

---

## What this session built, in one line

**A complete Never Ranked launch kit: the marketing site, the first case study, the implementation playbook, the reusable audit template, an automated audit runner, deploy artifacts, and a 2,800-word launch post.**

Go ship it.
