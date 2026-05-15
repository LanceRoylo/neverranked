# We Audited Our Own SaaS Before We Sold Anyone Else An Audit

*A proof-of-practice case study from Never Ranked*

*By Lance Roylo · April 2026*

---

## The short version

Before launching Never Ranked -- an AI-native SEO and AEO agency -- we ran our entire audit methodology against our own in-house product, Montaic, a real estate listing content platform we built and operate. The result was humbling.

Montaic has 222 pages, a full programmatic SEO build, a comparison page directory, a marine vertical, and a thoughtful editorial blog. It should be everywhere.

**It's cited in 0% of the primary AI queries in its own category.**

Competitors like ListingAI are cited in 100% of the same queries. Write.Homes and Jasper AI each in 50%.

This post walks through why that happened, what we found, and what we're fixing -- on our own software first, before we ever pitch the same playbook to a paying client. Everything in this article is real. The audit is real. The findings are real. If you audit Montaic yourself today, you'll see the same gaps we did.

That's the point.

---

## Why we did this to ourselves first

Every agency says they eat their own cooking. Most don't. Most sell advice they've never had to execute on their own product, against their own metrics, with their own money on the line.

Never Ranked exists because classic SEO agencies are still optimizing for the blue-link era of search while ChatGPT, Perplexity, Claude, Gemini, Microsoft Copilot, Google AI Overviews, and Gemma have quietly become the new front page of the internet. Google answers before it links. ChatGPT cites who it trusts. Perplexity quotes the source, not the ranking. The old playbook stopped working.

We have a new playbook. Before we sell it, we have to prove it works.

So we picked the hardest target we had: ourselves. Montaic is a real product with real users, real traffic, and real competitors. If our methodology could find real gaps on Montaic -- and if fixing those gaps moved real citation share -- we had a business. If not, we had an opinion.

This is the first half of that experiment. The second half, where we implement the fixes and measure the result, comes later.

---

## What the audit found

The full audit is published in our public repository. Six deliverables, 1,435 lines, produced in about 90 minutes of focused work using the same tooling and methodology we'll use for every paying client.

Here are the seven findings that mattered most.

### Finding 1: 0% AI citation share

We tested eight primary queries across commercial, informational, and comparison clusters. Queries like "best AI listing description generator 2026," "which AI tool should real estate agents use for MLS listings," and "AI that writes in your own voice for real estate."

Montaic appeared in zero of them.

ListingAI appeared in all eight. HAR.com in five. Write.Homes in four. Jasper AI in four. Even AgentListingAI, which is newer than Montaic, appeared in two.

This is the finding that justifies the whole audit's existence. Classic SEO metrics made Montaic look fine -- good page count, decent content, reasonable technical hygiene. The AEO reality was that the machines didn't know we existed.

### Finding 2: Google thinks we're "Monti" / "Monte" / "Montana"

When you search for "montaic real estate" on Google, the top results are Monti Real Estate in Chicago, Monte Real Estate in Louisiana, various Montenegro real estate firms, and Montana homes for sale.

Montaic doesn't rank for its own brand name.

The root cause: we have no Organization schema anywhere on montaic.com, and we're not registered as an entity in any of the databases Google's knowledge graph pulls from (Wikidata, Crunchbase, G2, Capterra, Product Hunt). Google's fuzzy matcher defaults to the more common spelling.

This is the brand entity problem. It's invisible in classic SEO audits. It's catastrophic for AEO.

### Finding 3: The pricing page title is 17 characters

We sampled our own page titles and found this: `Pricing — Montaic`.

Seventeen characters. On the highest-intent commercial page on the entire site. The full 60-character budget for title tags, and we were using a third of it.

This isn't a laziness thing. It's a "nobody thought to check" thing. The page was shipped early, nobody revisited it, and the title tag stayed the same through every redesign. Classic SEO audits would have flagged this on day one. We hadn't run a classic SEO audit on our own site either.

### Finding 4: Canonicals missing on four of seven sampled pages

The homepage has no canonical tag. The pricing page has no canonical tag. The free listing grader has no canonical tag. Blog posts have no canonical tags.

The tool pages and market pages do have canonicals. The template was clearly written for one kind of page and never extended to the others. Two-minute fix. Huge authority consolidation impact.

### Finding 5: 95% of pages have no og:image

Every Montaic page we sampled except the homepage had a blank OpenGraph image. This means every time anyone shares a Montaic URL on LinkedIn, iMessage, Twitter, Slack, or Facebook -- the preview is blank.

It also means AI engines that display thumbnails beside their citations (which is more and more of them) have nothing to show for Montaic. We're literally invisible next to competitors who have branded social previews.

### Finding 6: The word "voice" is lost to audio AI

Montaic's core differentiator is that the AI writes in your writing style -- your voice. We've used the word "voice" throughout the site, throughout the marketing, throughout the positioning.

The problem: when you search "voice AI real estate" or "AI that writes in your own voice," every top result is an audio AI tool. ElevenLabs. Voiceflow. Retell AI. NLPearl. Voice.ai. None of them compete with Montaic, but they own the keyword.

The AI engines have learned that "voice" means audio. Montaic can't win this keyword space. It has to rename the feature.

### Finding 7: Our comparison pages aren't ranking for comparison queries

We have eight dedicated comparison pages: Montaic vs ChatGPT, vs Jasper, vs ListingAI, vs Copy.ai, vs Writesonic, vs Canva. These pages should dominate their exact-match queries -- there's literally nobody else writing "Montaic vs Jasper" content.

Only one of them ranks anywhere. The Montaic vs ChatGPT blog post ranks at position 5 for its exact query. The other seven comparison pages are ghost pages. They exist, they're in the sitemap, and they're invisible for the searches they were built to own.

The reason: thin content (most are under 800 words), no AggregateRating schema, no Review schema, and no inbound links pointing at them. Comparison pages win by being the best comparison of the subject -- not just by having the URL.

---

## Why this happens to every builder

None of these findings are dramatic. None of them required special tools to discover. Every one of them would have been flagged by any competent SEO audit, conducted at any point in the last year.

We didn't run one.

Here's the thing: when you're building a product, you're optimizing for a thousand small things at once. You're adding features. You're shipping bug fixes. You're writing new blog posts. You're pushing the roadmap. The foundational stuff -- the title tags, the canonical structure, the schema coverage, the entity registration -- gets deferred. "We'll get to that when we have time." Nobody ever has time.

This is also how every builder's product ends up in the same state as Montaic: well-built at the product layer, invisible at the discovery layer. And the higher the product quality goes, the more frustrating the invisibility gets, because you know you have something worth recommending and the machines don't know it exists.

---

## What we're fixing, in order

We published the 90-day roadmap as part of the audit. Here's the short version.

**Month 1 -- Foundation.** Add Organization schema. Register in Wikidata, Crunchbase, LinkedIn Company, G2, Capterra, Product Hunt. Fix the canonicals. Rewrite the pricing page title. Ship og:image generation site-wide. Add HowTo schema to tool pages. Add BreadcrumbList schema site-wide.

**Month 2 -- Content citation hooks.** Expand the comparison pages from 700-word ghosts to 1,200-word real comparisons with Review schema. Publish a Fair Housing pillar article tied to the 2024 HUD guidance nobody else is writing about. Collect real reviews and add AggregateRating. Rewrite every page's "voice" language to "writing style."

**Month 3 -- Authority plus measurement.** Set up continuous AI citation tracking via LLM Pulse so the before/after becomes real data. Publish three HowTo-schema informational pillars. Guest post on three real estate trade publications linking back to the pillar content.

Every task traces back to a specific finding in the audit. Nothing here is invented. Nothing is marketing theater. It's just the work.

---

## The honest prediction

We're going to implement Month 1 on Montaic in the next two weeks. By June 9, 2026, we expect to see measurable movement in AI citation share across the same eight queries we tested.

Realistic case: 15-25% citation share. That's up from zero.

Optimistic case: 30-40% citation share, plus a Google knowledge panel for the brand name, plus at least one ChatGPT or Perplexity answer that cites Montaic for a non-branded query.

Conservative case: 10% citation share, foundation laid, authority still building, real movement in Q3.

Any of these is a case study. We'll publish the follow-up with the real numbers in 60-90 days. If the numbers don't move, we'll publish that too, and figure out what we got wrong.

---

## If you're building a product and this sounds familiar

The honest truth: you probably have some version of the same problem. Not because you're doing anything wrong at the product level. Because the discovery layer moved while you weren't watching.

Classic SEO hygiene -- schema, canonicals, meta tags, breadcrumbs -- is necessary but no longer sufficient. Citation share in the AI engines is the new category leadership metric, and the agencies still selling keyword rankings are optimizing for the wrong goal.

If you want to see what your own citation share looks like today, the Montaic audit is open source in the Never Ranked repo. You can read our methodology, steal the queries we used, and run the same test against your own domain in about an hour.

Or, if you want someone to run it for you with a full deliverable and a 90-day roadmap, [Never Ranked is booking Q2 2026 audits now](https://neverranked.com). $750, 48 hours, five deliverables. Paced deliberately. We don't refund. We deliver.

---

## The footer stuff

**Questions?** Reply to this post or email hello@neverranked.com.

**Read the full audit:** [neverranked.com/montaic-audit](https://github.com/yourorg/neverranked/tree/main/audits/montaic) *(GitHub link to the published audit)*

**Follow the before/after:** We'll publish the 60-day follow-up with real citation share numbers. Subscribe to updates at [neverranked.com](https://neverranked.com).

**Montaic itself:** [montaic.com](https://montaic.com) -- the real estate AI content platform we built, audited, and are about to fix in public.

---

## Publishing checklist

- [ ] Publish this post at one of:
  - Substack / Ghost newsletter (fastest)
  - LinkedIn article (best initial reach for B2B SaaS audience)
  - Medium / Dev.to (secondary)
  - The Never Ranked site (once blog functionality exists)
- [ ] Cross-post the opening section as a LinkedIn text post with link to full article
- [ ] Cross-post the opening section as an X/Twitter thread
- [ ] Post in r/realestate, r/SEO, r/proptech with a contextual intro (not just a drop-and-run)
- [ ] Share directly with 10 real estate Twitter influencers via DM
- [ ] Share directly with 10 SEO Twitter accounts (the smart ones who talk about AEO)
- [ ] Email to any existing Montaic users as a "here's what we're doing" update
- [ ] Submit to Hacker News on a Tuesday / Thursday morning
- [ ] Submit to Indie Hackers
- [ ] Pitch the story to Inman, HousingWire, The Close, and Real Estate News Alliance

The post is designed to be the lead magnet for the entire Never Ranked launch. It's long (~2,800 words) on purpose -- short posts don't earn citations, long posts do. It's honest about the gaps on purpose -- honesty earns trust, and trust earns inbound. And it's a cliffhanger (before, implementation, after) on purpose -- the follow-up is the second act of the launch narrative.
