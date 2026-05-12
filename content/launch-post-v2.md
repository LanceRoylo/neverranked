# We Audited Our Own SaaS Before We Sold Anyone Else An Audit

*A proof-of-practice from Never Ranked*

*By Lance Roylo · April 2026*

---

## The short version

Before launching Never Ranked, an AI-native SEO and AEO agency, we ran our entire audit methodology against our own in-house product, Montaic, a real estate listing content platform we built and operate.

The audit surfaced seven real gaps. Twelve days later, every Month 1 fix was shipped. Seventeen specific actions. Seven pillar articles. Schema coverage from zero to site-wide. Entity registration across six knowledge graph sources. A voice calibration experiment run against fifty-three Nashville listings that beat the agent-written originals by 2.3 points on a blind rubric.

Every number in this post is real. The audit is real. The implementation is real. The Montaic domain is live, the schema is in view-source, and the case study page at [neverranked.com/case-studies/montaic](https://neverranked.com/case-studies/montaic/) breaks down every action with the receipt.

This post tells the arc. The case study tells the detail. We published both on purpose. An agency selling a $750 audit and a compounding AEO retainer should be willing to show its own work.

That's the point.

---

## Why we did this to ourselves first

Every agency says they eat their own cooking. Most don't. Most sell advice they've never had to execute on their own product, against their own metrics, with their own money on the line.

Never Ranked exists because classic SEO agencies are still optimizing for the blue-link era of search while ChatGPT, Perplexity, Claude, Gemini, Microsoft Copilot, Google AI Overviews, and Gemma have quietly become the new front page of the internet. Google answers before it links. ChatGPT cites who it trusts. Perplexity quotes the source, not the ranking. The old playbook stopped working.

We have a new playbook. Before we sold it, we had to prove it worked.

So we picked the hardest target we had. Ourselves. Montaic is a real product with real users, real traffic, and real competitors. If our methodology could find real gaps on Montaic, and if fixing those gaps moved real citation share, we had a business. If not, we had an opinion.

This post is that experiment, written with hindsight. We found the gaps. We shipped the fixes. Now we watch the citations move.

---

## What the audit found

The full audit is published in our public repository. Six deliverables, 1,435 lines, produced in about 90 minutes of focused work using the same tooling and methodology we'll use for every paying client.

Here are the seven findings that mattered most.

### Finding 1: Zero percent AI citation share

We tested eight primary queries across commercial, informational, and comparison clusters. Queries like "best AI listing description generator 2026," "which AI tool should real estate agents use for MLS listings," and "AI that writes in your own voice for real estate."

Montaic appeared in zero of them.

ListingAI appeared in all eight. HAR.com in five. Write.Homes in four. Jasper AI in four. Even AgentListingAI, which is newer than Montaic, appeared in two.

This is the finding that justified the whole audit. Classic SEO metrics made Montaic look fine. Good page count, decent content, reasonable technical hygiene. The AEO reality was that the machines didn't know we existed.

### Finding 2: Google thought we were "Monti" / "Monte" / "Montana"

When you searched for "montaic real estate" on Google, the top results were Monti Real Estate in Chicago, Monte Real Estate in Louisiana, various Montenegro real estate firms, and Montana homes for sale.

Montaic didn't rank for its own brand name.

The root cause: no Organization schema anywhere on montaic.com, and no registration as an entity in any of the databases Google's knowledge graph pulls from. Wikidata, Crunchbase, G2, Capterra, Product Hunt, LinkedIn Company. Google's fuzzy matcher defaulted to the more common spelling.

This is the brand entity problem. It's invisible in classic SEO audits. It's catastrophic for AEO.

### Finding 3: The pricing page title was 17 characters

We sampled our own page titles and found this: `Pricing — Montaic`.

Seventeen characters. On the highest-intent commercial page on the entire site. The full 60-character budget for title tags, and we were using a third of it.

This wasn't a laziness thing. It was a "nobody thought to check" thing. The page shipped early, nobody revisited it, and the title tag stayed the same through every redesign. Classic SEO audits would have flagged this on day one. We hadn't run a classic SEO audit on our own site either.

### Finding 4: Canonicals missing on four of seven sampled pages

The homepage had no canonical tag. The pricing page had no canonical tag. The free listing grader had no canonical tag. Blog posts had no canonical tags.

The tool pages and market pages did have canonicals. The template was written for one kind of page and never extended to the others. Two-minute fix. Huge authority consolidation impact.

### Finding 5: 95% of pages had no og:image

Every Montaic page we sampled except the homepage had a blank OpenGraph image. That meant every time anyone shared a Montaic URL on LinkedIn, iMessage, Twitter, Slack, or Facebook, the preview was blank.

It also meant AI engines that display thumbnails beside their citations had nothing to show for Montaic. We were literally invisible next to competitors who had branded social previews.

### Finding 6: The word "voice" was lost to audio AI

Montaic's core differentiator is that the AI writes in your writing style. Your voice. We used the word "voice" throughout the site, throughout the marketing, throughout the positioning.

The problem: when you searched "voice AI real estate" or "AI that writes in your own voice," every top result was an audio AI tool. ElevenLabs. Voiceflow. Retell AI. NLPearl. Voice.ai. None of them competed with Montaic, but they owned the keyword.

The AI engines had learned that "voice" meant audio. Montaic couldn't win this keyword space. It had to rename the feature.

### Finding 7: Our comparison pages weren't ranking for comparison queries

We had eight dedicated comparison pages. Montaic vs ChatGPT, vs Jasper, vs ListingAI, vs Copy.ai, vs Writesonic, vs Canva. These pages should have dominated their exact-match queries. Literally nobody else writes "Montaic vs Jasper" content.

Only one of them ranked. The Montaic vs ChatGPT blog post at position 5 for its exact query. The other seven comparison pages were ghost pages. They existed, they were in the sitemap, and they were invisible for the searches they were built to own.

The reason: thin content, most under 800 words. No AggregateRating schema. No Review schema. No inbound links pointing at them. Comparison pages win by being the best comparison of the subject, not just by having the URL.

---

## What we shipped in twelve days

The audit ran on a Tuesday. Month 1 of the 90-day roadmap shipped by the following Sunday week. Seventeen specific actions, coded A1 through A17 in our internal tracking. Here is the compressed version.

**Days 1 to 2. Foundation.** Organization schema with sameAs links to seven entity databases. WebSite schema with SearchAction. BreadcrumbList templated across every page type. HowTo schema on twenty-five tool pages. BlogPosting schema upgraded with full Person author and wordCount. SoftwareApplication schema on the product pages. The free listing generator got its full-stack schema layer. Canonicals and robots meta deployed across every page type. OG image auto-generation. Title and meta rewrites on the highest-intent commercial pages, including the seventeen-character pricing title.

**Day 2. Entity.** Montaic registered on Wikidata, Crunchbase, G2, Capterra, Product Hunt, and LinkedIn Company. Every registration linked back to the Organization schema via sameAs, closing the loop for the knowledge graph.

**Days 3 through 12. Content.** Seven pillar articles across two topic clusters. Three on Fair Housing compliance, tied to the 2024 HUD guidance that nobody else was writing about at depth. Four on Listing Differentiation, built around the voice calibration experiment. Each article carries BlogPosting, FAQPage, and BreadcrumbList schema. The articles cross-reference each other through a reciprocal mentions array, creating a twelve-edge internal link graph the AI engines can walk.

Twelve days. No outside contractors. No agency overhead. The same methodology, tooling, and playbook we're selling.

---

## The voice experiment

Of the seven pillar articles, the fourth one became the centerpiece of the content strategy. We ran fifty-three actual Nashville listings through four different writing paths and scored every output on the same rubric. Specificity, emotional appeal, structure, cliche avoidance.

Four paths:

| Path | Avg Score | 7 to 8 Range | Delta vs Originals |
|---|---|---|---|
| ChatGPT gpt-4o-mini | 3.6 | 0 of 53 | -1.0 |
| Zillow originals (agent-written) | 4.6 | 1 of 53 | baseline |
| Montaic default path | 5.1 | 3 of 53 | +0.5 |
| **Montaic voice-locked** | **6.9** | **42 of 53** | **+2.3** |

The biggest gain wasn't specificity. It was cliche avoidance. The voice calibration layer, trained on just five writing samples, eliminated every major filler phrase. Zero "stunning." Zero "dream home." Zero "hidden gem." The writing sample taught the model what to skip more than what to say.

Category-level lift over the default Montaic path: cliche avoidance plus 3.3. Emotional appeal plus 2.6. Structure and flow plus 2.0. Specificity plus 1.8.

This became the proof behind the content claim. We're not writing listings on behalf of agents. We're calibrating the model to write in an agent's actual voice, at scale, without the filler that makes AI copy sound like AI.

---

## Why this happens to every builder

None of these findings were dramatic. None required special tools. Every one would have been flagged by any competent SEO audit conducted at any point in the last year.

We hadn't run one.

Here's the thing. When you're building a product, you're optimizing for a thousand small things at once. You're adding features. You're shipping bug fixes. You're writing new blog posts. You're pushing the roadmap. The foundational stuff, the title tags, the canonical structure, the schema coverage, the entity registration, gets deferred. "We'll get to that when we have time." Nobody ever has time.

This is also how every builder's product ends up in the same state Montaic was in. Well-built at the product layer, invisible at the discovery layer. And the higher the product quality goes, the more frustrating the invisibility gets, because you know you have something worth recommending and the machines don't know it exists.

---

## What comes next

The foundation is live. The citations move on a machine clock, not ours. AI models absorb, index, and weight new content across a cycle of weeks, not days. So the prediction from the audit isn't a prediction anymore. It's a measurement.

We're tracking eight queries daily across ChatGPT, Perplexity, Claude, Gemini, Microsoft Copilot, Google AI Overviews, and Gemma. Share of answer, citation frequency, quote fidelity, and sentiment. The starting line was zero. We're publishing the follow-up when there's real data to publish.

Realistic case in 60 days: 15 to 25 percent citation share. Up from zero. A Google knowledge panel for the brand. At least one comparison page ranking in the top 10.

Optimistic case: 30 to 40 percent citation share, knowledge panel live, at least one non-branded query citing Montaic in ChatGPT or Perplexity.

Conservative case: 10 percent citation share, foundation laid, authority still building, real movement in Q3.

Any of these is a case study. We'll publish the follow-up with the real numbers in 60 to 90 days. If the numbers don't move, we'll publish that too, and figure out what we got wrong.

---

## If you're building a product and this sounds familiar

The honest truth. You probably have some version of the same problem. Not because you're doing anything wrong at the product level. Because the discovery layer moved while you weren't watching.

Classic SEO hygiene, schema, canonicals, meta tags, breadcrumbs, is necessary but no longer sufficient. Citation share in the AI engines is the new category leadership metric, and the agencies still selling keyword rankings are optimizing for the wrong goal.

If you want to see what your own citation share looks like today, the Montaic case study is published in full at [neverranked.com/case-studies/montaic](https://neverranked.com/case-studies/montaic/). Read the methodology, steal the queries we used, run the same test against your own domain in about an hour.

Or, if you want someone to run it for you with a full deliverable and a 90-day roadmap, [Never Ranked is booking Q2 2026 audits now](https://neverranked.com). Five hundred dollars. Forty-eight hours. Six deliverables. Paced deliberately. We don't refund. We deliver.

---

## The footer stuff

**Questions?** Reply to this post or email hello@neverranked.com.

**Read the full case study:** [neverranked.com/case-studies/montaic](https://neverranked.com/case-studies/montaic/)

**Follow the before/after:** We'll publish the 60-day update with real citation share numbers. Subscribe at [neverranked.com](https://neverranked.com).

**Montaic itself:** [montaic.com](https://montaic.com), the real estate AI content platform we built, audited, and fixed in public.

---

## Publishing checklist

- [ ] Publish as a blog post on neverranked.com at `/blog/we-audited-ourselves-first/`
- [ ] Cross-post as a LinkedIn article under Lance's profile, with link to the full version on neverranked.com
- [ ] Cross-post the opening section as a LinkedIn text post with link to full article
- [ ] Cross-post the opening section as an X thread
- [ ] Post in r/SEO, r/proptech with a contextual intro (not a drop-and-run)
- [ ] Share directly with ten real estate operators via DM
- [ ] Share directly with ten SEO operators who already talk about AEO
- [ ] Email to any existing Montaic users as a "here's what we're doing" update
- [ ] Submit to Hacker News on a Tuesday or Thursday morning
- [ ] Submit to Indie Hackers
- [ ] Pitch the story to Inman, HousingWire, The Close, and Real Estate News Alliance

The post is designed to be the lead magnet for the entire Never Ranked launch. It's long (~3,000 words) on purpose. Short posts don't earn citations. Long posts do. It's honest about the gaps on purpose. Honesty earns trust, and trust earns inbound. And it's a cliffhanger (foundation shipped, citations measured next) on purpose. The 60-day follow-up is the second act of the launch narrative.
