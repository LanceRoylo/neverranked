# A13 Publish Path: Claire lands, Lance flips

**For:** Claire (Montaic codebase)
**From:** Never Ranked side
**Scope:** Land a new blog post (Why Zillow Listings All Sound the Same), wire up the full JSON-LD schema payload, leave `draft: true`. Lance does the final voice read-through and flips the draft himself.
**Time:** ~40 minutes.
**Cluster context:** This is the first pillar article in the new Listing Differentiation cluster. A11 and A12 are the Fair Housing cluster (both live by the time A13 ships). A13 cross-links to both as `mentions` in the schema and as a single inline body link to A12.

---

## Sanity check before you begin

The grader placeholder that used to live in the opening hook has been resolved. The body now contains the real Nashville case study paragraph (53 listings, April 2026 run). As a final defense, do a quick scan for the literal string `GRADER-DATA-PLACEHOLDER` before pasting. If you see it anywhere in the body block below, something went wrong in a merge or edit and you should stop and ping Lance. If the string is absent, proceed as normal.

---

## Context for Claire

A13 is a new pillar article, not an edit to an existing one. The full article body is included inline below as markdown, and the JSON-LD schema `@graph` block is included as a separate paste target.

**The strategic shape:** A13 opens the Listing Differentiation cluster. It answers "why does every Zillow listing sound the same" by pointing at the training data problem that every listing-description tool shares, then it bridges to Montaic as the category-level fix (a tool trained on your writing instead of on the average). The lever is outsider triangulation: Lance notices the category-average copy problem from three vantage points (coffee shop operator, photography and video, active Zillow and Redfin browser), which no competing voice in the real estate content space has at once.

**Why this matters for publishing:** A13 is designed to get cited by AI search engines when agents ask questions like "why do all Zillow listings sound the same," "do listing description words affect sale price," or "what is the best AI tool for MLS descriptions." The piece leads with Zillow's own 2016 research on 2.8 million listings showing that specific keywords are worth up to 13.4% more on sale price and up to 63 days off the market. That is the citation magnet.

**Voice rules apply.** Zero em dashes, zero semicolons in the prose, no emojis, no AI filler phrases. The draft has been voice-checked before handoff. If you see anything that looks like a voice violation during the paste, flag it rather than fixing it.

---

## Pre-flight

Confirm the Montaic blog infrastructure is ready for a new post. Same shape as the A11 and A12 lands.

```bash
# Blog index renders
curl -s -o /dev/null -w "%{http_code}" https://montaic.com/blog
# Expected: 200

# Sitemap exists and is being served
curl -s -o /dev/null -w "%{http_code}" https://montaic.com/sitemap.xml
# Expected: 200

# A11 is still live
curl -s -o /dev/null -w "%{http_code}" https://montaic.com/blog/fair-housing-ai-compliance-agents
# Expected: 200

# A12 is live (A13 cross-links to A12 in the body — if A12 is not live, the link will 404)
curl -s -o /dev/null -w "%{http_code}" https://montaic.com/blog/fair-housing-listing-description-rules
# Expected: 200
```

If any of those fail, stop and flag before creating the new post. A13 specifically cannot ship before A12 is live because the body contains an inline link to A12. If A12 is still in draft or has not landed, hold A13 until A12 is public.

Also confirm the blog post storage pattern. Use whatever the most recent blog post in the codebase uses. If A12 was stored as TSX, match that pattern.

---

## A13.P1: Create the blog post file

Create a new post at slug `zillow-listings-all-sound-the-same` with `draft: true`. The canonical URL will be `https://montaic.com/blog/zillow-listings-all-sound-the-same`.

**Frontmatter fields to set:**

```
title: "Why Zillow Listings All Sound the Same (And Why It's Costing Agents Leads)"
slug: zillow-listings-all-sound-the-same
description: "Every listing description tool on the market trained on the same MLS corpus. Here's what that costs you in dollars and days on market."
author: Lance Roylo
publishedAt: 2026-04-24
updatedAt: 2026-04-24
draft: true
ogImage: /og?title=Why%20Zillow%20Listings%20All%20Sound%20the%20Same%20%28And%20Why%20It%27s%20Costing%20Agents%20Leads%29&subtitle=Montaic%20Blog&type=blog
category: Listing Differentiation
tags: [Listing Descriptions, Zillow, AI Content Quality, Real Estate Marketing, AEO]
relatedPosts: [fair-housing-ai-compliance-agents, fair-housing-listing-description-rules]
```

**Title length note:** The title is 73 characters. Google typically truncates `<title>` tags around 60 characters. If the blog system renders the full title into the `<title>` tag, that is fine because H1 is more important for on-page reading. If the blog system uses a separate `titleTag` or `seoTitle` field, set it to `Why Zillow Listings All Sound the Same | Montaic Blog` (53 chars). Otherwise leave alone.

**OG image note:** Montaic's blog uses the dynamic `/og` route (same pattern as A11 and A12). The URL above is pre-encoded for A13's title. Do not change it. If the `/og` route returns anything other than a 1200x630 PNG when you visit it directly in a browser, stop and flag in the report-back before publishing.

---

## A13.P2: Paste the full article body

The full article body as markdown. Paste this into whatever the blog system uses for post content. If the system stores content as JSX/TSX, convert the markdown to the JSX structure used by the rest of the Montaic blog.

**CRITICAL:** All inline citation links are already in the markdown below. Do not add or remove any. If your conversion step requires adjusting link syntax, preserve the URLs exactly.

**SECOND CRITICAL:** As a defensive final check, scan the body for the literal string `GRADER-DATA-PLACEHOLDER` before pasting. It should not be present (the real case study paragraph has replaced it). If you see it, STOP and flag to Lance.

---

```markdown
A few nights a week I pull up Zillow in a mid-size market and scroll through listings the way other people scroll through Netflix. I'm not house shopping. I find the writing interesting.

The problem is that the writing is almost always the same. After five listings, the openings blur. After ten, I stop reading the descriptions entirely and scroll straight to the photos. The houses are not the problem. Every listing sounds like every other listing.

In April 2026, I ran 53 of the most-viewed active single-family listings in Nashville through Montaic's listing grader. The average score was 4.6 out of 10. Nothing cracked 7. Thirty-one listings scored a 3 or a 4.

The vocabulary is where the pattern lives. "Beautiful" appeared in 38% of the listings. "Spacious" appeared in 34%. "Stunning" in 21%. "Boasts" and "move-in ready" each in 15%. The grader's lowest category score across the whole sample was cliche avoidance, at 4.2 out of 10.

The grader is not reading the listings and getting bored. It is reading them and writing the same feedback every time: "overloaded with generic cliches," "no emotional appeal," "no actual dimensions." The top complaint was the same complaint, over and over, in slightly different words. Which is exactly what the listings sound like.

This is not an agent problem. Agents are not writing bad copy on purpose. The reason every listing sounds the same is that every tool that writes listings, from ChatGPT to the dedicated real estate description generators, was trained on the same averaged MLS writing. When the training data is averaged, the output is averaged. When the output is averaged, your listing sounds like everyone else's. And when your listing sounds like everyone else's, you pay for it in two ways: dollars you leave on the sale price, and days you leave on the market.

## Zillow's own research on 2.8 million listings

In 2016, Zillow Digs ran an analysis on 2.8 million home sales between January 2014 and March 2016. They controlled for property size, age, location, and the year and quarter of sale. Then they looked at sixty specific keywords in the listing descriptions and measured what happened to sale price and days on market when those keywords appeared.

The results were not subtle. [Zillow's press release on the study](https://zillow.mediaroom.com/2016-04-12-Homes-with-Subway-Tiles-Barn-Doors-or-Farmhouse-Sinks-Can-Sell-for-Up-to-13-Percent-More-and-60-Days-Faster) shows listings that mentioned "barn doors" sold for 13.4% more than expected and 57 days faster. Listings mentioning "shaker cabinets" sold for 9.6% more and 45 days faster. "Farmhouse sink" earned 7.9% more and 58 days faster. "Subway tile" earned 6.9% more and 63 days faster. "Quartz" earned 6% more and 50 days faster.

These are not marketing claims. This is Zillow's own research on Zillow's own listings, published on Zillow's own press site. The data has been public for ten years and nothing has meaningfully replaced it at scale.

Now put that next to what the default listing description actually says. The default opens with a greeting to the buyer. The default describes the house using one of four or five generic approval adjectives. The default closes by telling the reader not to miss this chance. These are the phrases that the Zillow research found do not move sale price or days on market at all. The entire category of listing description tools is trained to produce exactly the phrases that Zillow's own research already proved are commercially inert.

## Why every listing description tool produces the same phrases

Three things are worth understanding before the rest of this piece makes sense.

**Every listing description tool trained on the same corpus.** ChatGPT trained on the public web, which includes millions of scraped MLS descriptions. The dedicated listing tools trained on their own scraped MLS data, which overlaps almost entirely with the same corpus ChatGPT used. There is no competitive data moat in the listing description category. It is all the same data.

**Averaged training data produces averaged output.** A 2025 paper on ["Verbalized Sampling: How to Mitigate Mode Collapse and Unlock LLM Diversity"](https://arxiv.org/abs/2510.01171) identified the root cause. Annotators who rate language model output systematically favor familiar text over distinctive text, because familiar text reads as "correct." Models learn that familiar text gets rewarded, so models produce familiar text. The bias is in the data, not in the algorithm. You cannot prompt your way out of it.

**Structured formats amplify the collapse.** A May 2025 paper on ["The Price of Format: Diversity Collapse in LLMs"](https://arxiv.org/abs/2505.18949) found that when a model is trained to produce outputs in a standard template, which is exactly what an MLS description is, the format itself suppresses diversity further. The more standardized the template, the less distinctive the output. MLS is one of the most standardized templates in consumer-facing content. The format compounds the training data problem.

Put those three facts together and the picture is clear. Every tool was trained on the same data. The data rewards averaged phrasing. The MLS format compounds the averaging. The output is a category-wide convergence on a handful of generic openers and approval adjectives. Your listing is the mean.

## What the category average actually costs you

Here is what the compound effect looks like in practice.

An agent opens ChatGPT, pastes "write me an MLS description for a three-bedroom two-bath in Nashville with a renovated kitchen," and gets back a paragraph that opens with a greeting and describes the kitchen as beautiful and renovated. The agent pastes it into the MLS. The MLS syndicates it to Zillow, Redfin, Realtor.com, and a dozen secondary portals. Now that listing is one of approximately half a million Zillow listings active at any given time, and it is indistinguishable from the other half million.

Meanwhile, [a 2023 study from Iowa State University](https://www.news.iastate.edu/news/2023/08/22/zillow) led by Cheng Nie and co-authored with researchers at Georgia State, the University of Illinois at Chicago, and Nanjing University looked at how listing descriptions actually influenced buying decisions. They found that "experience attributes," meaning descriptive language that paints a specific sensory picture, correlated with higher sale prices. Generic approval language did not. The researchers used examples like "upscale bathroom fixtures" and "sunlit kitchen" for experience attributes. The ChatGPT-generated description in the scenario above has zero experience attributes. It has only generic approval language.

This matters because online listings are the first-touch channel for almost every home buyer. [The National Association of Realtors 2025 Home Buyers and Sellers Generational Trends Report](https://www.nar.realtor/research-and-statistics/research-reports/home-buyer-and-seller-generational-trends), published April 2025, found that online listings are the most-used information source in the home search across every generation, and that 86% of all buyers used a real estate agent but started their search on a portal. If the listing loses attention on the portal, the agent loses the lead before the agent ever enters the picture.

The compounding is the business problem. Every generic-sounding listing trains the reader to scroll faster. Every faster scroll makes the next generic listing even more invisible. The agents who are still writing distinctive descriptions end up with disproportionate attention because they are the only ones left in the signal.

## Five patterns in every tool-generated listing

Five patterns show up in almost every tool-written listing description. If your last five listings match more than two of these, you are on the wrong side of the Zillow research.

1. **Generic approval openers.** Every tool-written listing opens with one of about six phrases. A greeting to the buyer, an adjective about the house, an appeal to the seller's pride. The Zillow keyword data shows that none of these phrases move the price or the days-on-market needle.

2. **Feature list without sensory context.** A line of "3 bed, 2 bath, hardwood floors, granite counters, stainless appliances" is searchable but not readable. It does not tell the buyer what the house feels like. The Iowa State research specifically flagged that experience attributes matter more than feature lists for sale price.

3. **Target-demographic pandering.** Phrases that tell the reader which kind of buyer should want the house. These are also the phrases that trip the Fair Housing analysis in our earlier piece on [Fair Housing Act listing description rules](/blog/fair-housing-listing-description-rules). They are commercially useless and legally risky at the same time.

4. **Location cliches.** Generic proximity claims that do not contain specific distances or named destinations. "Close to everything." "Minutes from downtown." The portal reader has read these phrases fifty times this week.

5. **Manufactured urgency.** Urgency language that is not backed by specific scarcity information. The digital equivalent of a screaming car commercial. The reader notices it and scrolls past faster.

The common thread across all five is that these are phrases the tool produces because the tool's training data is full of them. The tool is not making a choice. It is reverting to its mean. Your listing is the mean.

## Four steps to get out of the category average

**Step 1: Audit your last five listings against the Zillow keyword list.** Pull up your five most recent listings. Count how many of the high-performing keywords from Zillow's 2016 study actually appear in your descriptions. Then count how many of the five patterns above appear. If the ratio is worse than two low-performers to one high-performer, you are probably losing sale price and days on market to the category average.

**Step 2: Write the opening sentence by hand, every time.** The first ten words of a Zillow listing are doing 80% of the work. They decide whether the reader scrolls or stops. Even if you use a tool for the rest of the description, write the first sentence yourself, in your own voice, about the specific house. Specificity is the thing the tool cannot fake.

**Step 3: Describe the experience, not the feature list.** For every feature, write one sentence about what it feels like to use it. "Stainless appliances" becomes "the kitchen is bright enough to read a recipe without turning the light on." "Hardwood floors" becomes "the original red oak floors run the length of the first floor and have the patina you only get from 80 years of being walked on." This is what the Iowa State research meant by experience attributes.

**Step 4: Use a tool that trained on your writing, not on the average writing.** The underlying problem is the training data. If the tool was trained on the same corpus as every other tool, it will produce the same output. The only category-level fix is a tool that trained on your specific writing and your specific listings, so the averaging works in your favor instead of against you. This is what Montaic does, and it is the reason we built the product.

## What Montaic does differently

I built Montaic because I spend too much time on Zillow. Not as an agent. As a reader who also runs a coffee shop and shoots photography and knows what it sounds like when the same phrase has been used 500 times that week.

The coffee shop teaches you what generic marketing sounds like. When you run a food business, you hear the same three or four hospitality phrases from every competitor who used the same shop-for-pastry marketing playbook you could have used, and you learn to hate those phrases because they do not describe anything. The photography teaches you what "a reason to click" looks like. A listing photo either gives the viewer a reason to stop scrolling or it does not. The portal browsing teaches you what category-average copy feels like from the reader's side, not from the writer's side.

Montaic is a listing description tool that trained on your writing, not on the average. Here is what that means in practice:

- **Writing style lock.** You paste in three listings you have written that you were proud of. Montaic trains on those as the voice sample. Every subsequent description uses your phrasing, your sentence length, your rhythm.
- **Experience attribute scoring.** Every draft is scored on how many specific sensory details it contains versus how many generic approval phrases. The score is visible before you publish.
- **Fair Housing screening built in.** Every draft is screened against the 24 C.F.R. § 100.75 risk list before it leaves the tool. No separate compliance step.
- **Portal-aware formatting.** Montaic knows which portal the listing is going to and adjusts sentence length and structure to match the scroll behavior on each.

Montaic does not replace your judgment about the house. It does not know what the kitchen smells like at seven in the morning, or which window gets the best afternoon light. Those are the things you have to bring. What Montaic does is make sure that when you write about those things, the writing sounds like you and not like every other tool in the category.

## Frequently asked questions

**Does listing description quality actually affect sale price, or is that just marketing advice?**

It affects sale price, and the numbers are public. Zillow's 2016 analysis of 2.8 million home sales controlled for property size, age, and location, then looked at specific keywords in the listing description. Listings mentioning "barn doors" sold for 13.4% more than comparable homes. Listings mentioning "shaker cabinets" sold for 9.6% more. The effect was measured in dollars, not in engagement metrics. A peer-reviewed 2023 study from Iowa State University confirmed the same direction using different methodology and a different sample. The research has been consistent for a decade.

**Is ChatGPT safe to use for MLS descriptions?**

Technically yes, legally maybe, commercially no. Technically the tool will produce a description. Legally ChatGPT has no Fair Housing screening, and the agent is responsible for everything that gets published, so any violation is on the agent. Commercially, ChatGPT was trained on the same averaged MLS corpus as every other tool, so the output reverts to category-average phrasing that Zillow's own research shows does not move the price. Using ChatGPT for MLS descriptions gets you a legally exposed description that sounds exactly like your competitor's legally exposed description.

**Why do all the listing description tools produce the same phrases?**

Because they all trained on the same data. The training corpus for listing description tools is scraped MLS archives, which are heavily skewed toward the phrases agents already use. A 2025 paper on mode collapse in language models identified that annotators who rate model output prefer familiar phrasing, which makes models learn to produce familiar phrasing. The bias is in the data. No amount of prompt engineering can pull the model out of its averaged mean.

**What counts as a good listing description under the Zillow research?**

Specific. Sensory. Named features that are either high-end or distinctive. The Zillow keyword list favors phrases that describe actual materials and installations (shaker cabinets, subway tile, farmhouse sink, quartz counters) over generic approval phrases. A good description tells the reader what the house is, not how the writer feels about the house.

**What should I do if I have been using ChatGPT or a generic listing tool for the last year?**

Audit your five most recent listings. Count how many high-performing Zillow keywords appear versus how many of the five tool-average patterns appear. If the ratio is bad, the fix is not to prompt better. The fix is to switch to a tool trained on your own writing, so future descriptions sound like you instead of sounding like the average. Old listings do not need to be rewritten. New listings starting from now will separate you from the category default within a quarter.

**Does Montaic work for agents outside residential real estate?**

Montaic is built primarily for residential real estate. The writing style lock and the portal-aware formatting are tuned for Zillow, Redfin, and Realtor.com. We do have early customers in yacht brokerage, and the underlying approach (train on your writing, not on the average) works the same way there. If you are in a listing category other than residential real estate, reach out and we can talk about whether Montaic fits.

## Closing

Every Zillow listing sounds the same because every listing tool trained on the same averaged MLS corpus, and the averaged corpus produces averaged output. Zillow's own research shows that the averaged output is leaving dollars and days on the table. The fix is not a better prompt. It is a tool that trained on your writing instead of on everyone else's.

If you want to see where your current listings land on the experience-attribute scale, run one of them through [the Montaic grader](https://montaic.com/grade) for free. No account. The grader returns a score and a breakdown of which phrases are helping and which are hurting, and it takes about a minute.
```

---

## A13.P3: Paste the JSON-LD schema @graph block

Add this to the post's HTML `<head>` as a `<script type="application/ld+json">` block, or wire it in through whatever schema injection component the Montaic blog system uses. Match however A11 and A12 were wired.

The canonical source for this block is `audits/montaic/implementation/A13-zillow-listings-all-sound-the-same.md` Phase 4 section. If anything below looks inconsistent with the master doc, trust the master doc and flag the drift.

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BlogPosting",
      "@id": "https://montaic.com/blog/zillow-listings-all-sound-the-same#article",
      "headline": "Why Zillow Listings All Sound the Same (And Why It's Costing Agents Leads)",
      "description": "Every listing description tool on the market trained on the same MLS corpus. Here's what that costs you in dollars and days on market.",
      "image": "https://montaic.com/og?title=Why%20Zillow%20Listings%20All%20Sound%20the%20Same%20%28And%20Why%20It%27s%20Costing%20Agents%20Leads%29&subtitle=Montaic%20Blog&type=blog",
      "datePublished": "2026-04-24",
      "dateModified": "2026-04-24",
      "wordCount": 2300,
      "keywords": [
        "Zillow listing descriptions",
        "MLS listing description writing",
        "AI listing description tool",
        "real estate listing copy",
        "listing description conversion",
        "mode collapse listing descriptions",
        "Montaic listing writing"
      ],
      "articleSection": "Listing Differentiation",
      "isAccessibleForFree": true,
      "author": {"@id": "https://montaic.com/#founder"},
      "publisher": {"@id": "https://montaic.com/#organization"},
      "mainEntityOfPage": "https://montaic.com/blog/zillow-listings-all-sound-the-same",
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Homes with Subway Tiles, Barn Doors or Farmhouse Sinks Can Sell for Up to 13 Percent More and 60 Days Faster (Zillow, 2016)",
          "url": "https://zillow.mediaroom.com/2016-04-12-Homes-with-Subway-Tiles-Barn-Doors-or-Farmhouse-Sinks-Can-Sell-for-Up-to-13-Percent-More-and-60-Days-Faster"
        },
        {
          "@type": "CreativeWork",
          "name": "How Does Online Information Influence Offline Transactions: Insights from Digital Real Estate Platforms (Nie et al., Iowa State University, 2023)",
          "url": "https://www.news.iastate.edu/news/2023/08/22/zillow"
        },
        {
          "@type": "CreativeWork",
          "name": "Verbalized Sampling: How to Mitigate Mode Collapse and Unlock LLM Diversity (Zhang et al., 2025)",
          "url": "https://arxiv.org/abs/2510.01171"
        },
        {
          "@type": "CreativeWork",
          "name": "The Price of Format: Diversity Collapse in LLMs (Yun et al., 2025)",
          "url": "https://arxiv.org/abs/2505.18949"
        },
        {
          "@type": "CreativeWork",
          "name": "2025 Home Buyers and Sellers Generational Trends Report (National Association of Realtors, April 2025)",
          "url": "https://www.nar.realtor/research-and-statistics/research-reports/home-buyer-and-seller-generational-trends"
        }
      ],
      "isPartOf": {
        "@type": "Blog",
        "@id": "https://montaic.com/blog#blog"
      },
      "mentions": [
        {
          "@type": "CreativeWork",
          "name": "Fair Housing AI Compliance Agents",
          "url": "https://montaic.com/blog/fair-housing-ai-compliance-agents"
        },
        {
          "@type": "CreativeWork",
          "name": "Fair Housing Act Listing Description Rules: The Words You Cannot Use in 2026",
          "url": "https://montaic.com/blog/fair-housing-listing-description-rules"
        }
      ],
      "about": [
        {"@type": "Thing", "name": "Zillow"},
        {"@type": "Thing", "name": "Listing descriptions"},
        {"@type": "Thing", "name": "AI content quality"},
        {"@type": "Thing", "name": "Real estate marketing"}
      ],
      "hasPart": {"@id": "https://montaic.com/blog/zillow-listings-all-sound-the-same#faq"}
    },
    {
      "@type": "FAQPage",
      "@id": "https://montaic.com/blog/zillow-listings-all-sound-the-same#faq",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Does listing description quality actually affect sale price, or is that just marketing advice?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It affects sale price, and the numbers are public. Zillow's 2016 analysis of 2.8 million home sales controlled for property size, age, and location, then looked at specific keywords in the listing description. Listings mentioning \"barn doors\" sold for 13.4% more than comparable homes. Listings mentioning \"shaker cabinets\" sold for 9.6% more. The effect was measured in dollars, not in engagement metrics. A peer-reviewed 2023 study from Iowa State University confirmed the same direction using different methodology and a different sample. The research has been consistent for a decade."
          }
        },
        {
          "@type": "Question",
          "name": "Is ChatGPT safe to use for MLS descriptions?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Technically yes, legally maybe, commercially no. Technically the tool will produce a description. Legally ChatGPT has no Fair Housing screening, and the agent is responsible for everything that gets published, so any violation is on the agent. Commercially, ChatGPT was trained on the same averaged MLS corpus as every other tool, so the output reverts to category-average phrasing that Zillow's own research shows does not move the price. Using ChatGPT for MLS descriptions gets you a legally exposed description that sounds exactly like your competitor's legally exposed description."
          }
        },
        {
          "@type": "Question",
          "name": "Why do all the listing description tools produce the same phrases?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because they all trained on the same data. The training corpus for listing description tools is scraped MLS archives, which are heavily skewed toward the phrases agents already use. A 2025 paper on mode collapse in language models identified that annotators who rate model output prefer familiar phrasing, which makes models learn to produce familiar phrasing. The bias is in the data. No amount of prompt engineering can pull the model out of its averaged mean."
          }
        },
        {
          "@type": "Question",
          "name": "What counts as a good listing description under the Zillow research?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Specific. Sensory. Named features that are either high-end or distinctive. The Zillow keyword list favors phrases that describe actual materials and installations (shaker cabinets, subway tile, farmhouse sink, quartz counters) over generic approval phrases. A good description tells the reader what the house is, not how the writer feels about the house."
          }
        },
        {
          "@type": "Question",
          "name": "What should I do if I have been using ChatGPT or a generic listing tool for the last year?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Audit your five most recent listings. Count how many high-performing Zillow keywords appear versus how many of the five tool-average patterns appear. If the ratio is bad, the fix is not to prompt better. The fix is to switch to a tool trained on your own writing, so future descriptions sound like you instead of sounding like the average. Old listings do not need to be rewritten. New listings starting from now will separate you from the category default within a quarter."
          }
        },
        {
          "@type": "Question",
          "name": "Does Montaic work for agents outside residential real estate?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Montaic is built primarily for residential real estate. The writing style lock and the portal-aware formatting are tuned for Zillow, Redfin, and Realtor.com. We do have early customers in yacht brokerage, and the underlying approach (train on your writing, not on the average) works the same way there. If you are in a listing category other than residential real estate, reach out and we can talk about whether Montaic fits."
          }
        }
      ]
    },
    {
      "@type": "BreadcrumbList",
      "@id": "https://montaic.com/blog/zillow-listings-all-sound-the-same#breadcrumb",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Home",
          "item": "https://montaic.com/"
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": "Blog",
          "item": "https://montaic.com/blog"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Why Zillow Listings All Sound the Same (And Why It's Costing Agents Leads)"
        }
      ]
    }
  ]
}
```

---

## A13.P4: Do NOT flip the draft

Leave `draft: true` in the frontmatter. The draft should be deployed but noindex'd and excluded from the blog index and sitemap, matching how A11 and A12 were handled during their own lands. Lance does the final voice read and flips `draft: false` himself.

---

## Validation

After deploying the draft, run the canonical verify-deploy script from the neverranked repo root:

```bash
./scripts/verify-deploy.sh \
  https://montaic.com/blog/zillow-listings-all-sound-the-same \
  https://montaic.com/blog \
  https://montaic.com/sitemap.xml
```

For a draft post, Check 1 (noindex) should PASS and Checks 2-3 (blog index, sitemap) should correctly show the post is excluded. Checks 4-6 (BlogPosting, FAQPage, BreadcrumbList schemas) must PASS. Check 7 (citation URL reachability) must PASS. A13 is the first Montaic post to include a 5-entry citation array, so Check 7 is load-bearing for this piece.

Additional manual checks specific to A13:

```bash
# Draft loads
curl -s -o /dev/null -w "%{http_code}" https://montaic.com/blog/zillow-listings-all-sound-the-same
# Expected: 200

# noindex tag present (draft state)
curl -s https://montaic.com/blog/zillow-listings-all-sound-the-same | grep -o 'noindex'
# Expected: match

# Excluded from blog index (draft state)
curl -s https://montaic.com/blog | grep -c 'zillow-listings-all-sound-the-same'
# Expected: 0

# Excluded from sitemap (draft state)
curl -s https://montaic.com/sitemap.xml | grep -c 'zillow-listings-all-sound-the-same'
# Expected: 0

# All five citation URLs appear in rendered HTML
curl -s https://montaic.com/blog/zillow-listings-all-sound-the-same | grep -c 'zillow.mediaroom.com/2016-04-12-Homes-with-Subway-Tiles'
curl -s https://montaic.com/blog/zillow-listings-all-sound-the-same | grep -c 'news.iastate.edu/news/2023/08/22/zillow'
curl -s https://montaic.com/blog/zillow-listings-all-sound-the-same | grep -c 'arxiv.org/abs/2510.01171'
curl -s https://montaic.com/blog/zillow-listings-all-sound-the-same | grep -c 'arxiv.org/abs/2505.18949'
curl -s https://montaic.com/blog/zillow-listings-all-sound-the-same | grep -c 'nar.realtor/research-and-statistics'
# Each should return at least 1

# A12 cluster cross-link is present (body link)
curl -s https://montaic.com/blog/zillow-listings-all-sound-the-same | grep -c 'fair-housing-listing-description-rules'
# Expected: at least 2 (one in body, one in schema mentions array)

# A11 cluster cross-link is present (schema only, no body link)
curl -s https://montaic.com/blog/zillow-listings-all-sound-the-same | grep -c 'fair-housing-ai-compliance-agents'
# Expected: at least 1 (schema mentions array)

# FAQPage schema has 6 Question nodes
curl -s https://montaic.com/blog/zillow-listings-all-sound-the-same | grep -o '"@type":"Question"' | wc -l
# Expected: 6

# BlogPosting schema renders with wordCount
curl -s https://montaic.com/blog/zillow-listings-all-sound-the-same | grep -o '"wordCount":[0-9]*'
# Expected: "wordCount":2300 (or close, depending on grader paragraph length when placeholder is replaced)

# BreadcrumbList schema has 3 ListItem nodes
curl -s https://montaic.com/blog/zillow-listings-all-sound-the-same | grep -o '"@type":"ListItem"' | wc -l
# Expected: 3

# NO em dashes in the rendered article body
curl -s https://montaic.com/blog/zillow-listings-all-sound-the-same | grep -c '—'
# Expected: 0

# Grader placeholder is NOT in the rendered body
curl -s https://montaic.com/blog/zillow-listings-all-sound-the-same | grep -c 'GRADER-DATA-PLACEHOLDER'
# Expected: 0
```

All checks should pass. Then paste the draft URL into the [Rich Results Test](https://search.google.com/test/rich-results) one more time to confirm BlogPosting + FAQPage + BreadcrumbList are all detected with zero errors.

---

## Known risks

- **Grader placeholder (resolved):** The placeholder was replaced 2026-04-11 with the Nashville case study paragraph. The defensive scan in the pre-flight section exists as a final sanity check. If the literal string `GRADER-DATA-PLACEHOLDER` appears anywhere in the body you are about to paste, STOP and flag to Lance (something has gone wrong in a merge or edit).
- **A12 dependency:** A13's body contains an inline link to `/blog/fair-housing-listing-description-rules`. If A12 is not yet live, the link will 404. Pre-flight confirms A12 is up before you start. If the curl fails, hold A13.
- **wordCount accuracy:** Schema says 2,300. The Nashville grader paragraph is roughly 140 words, so the total draft body is in the 2,300-2,400 range. If Lance's voice read trims or expands significantly, recompute and update the schema wordCount before flipping `draft: false`.
- **Markdown conversion:** If the article body is stored as JSX/TSX, convert the bulleted lists and bolded sub-headers. The inline citation links use standard `[text](url)` markdown. Preserve the URLs exactly.
- **Heading levels:** The article body uses `##` for section headings and `**bold**` for sub-subsection intros inside the key concepts block and the four-step workflow. Preserve this hierarchy.
- **Cross-link to A12:** The article body links to `/blog/fair-housing-listing-description-rules` once in the "five patterns" section (item 3, target-demographic pandering). Both the body link and the schema `mentions` entry must resolve to the live A12 post.
- **OG image:** Uses Montaic's dynamic `/og` route (same as A11 and A12). The pre-encoded URL is in the frontmatter. Verify it renders a 1200x630 PNG in the browser before publishing.
- **Title length in `<title>` tag:** The full title is 73 characters. If the blog system has a separate `seoTitle` or `titleTag` field, use the shorter variant `Why Zillow Listings All Sound the Same | Montaic Blog` (53 chars). If not, the full title in `<title>` is acceptable but will truncate in Google SERPs.
- **Voice discipline:** No em dashes, no semicolons in prose. The draft as pasted is clean. If your JSX conversion or linter introduces either, fix before deploying.
- **Cluster alternation:** A13 opens a new cluster (Listing Differentiation). A14 should return to Fair Housing per the content calendar's cluster alternation policy. Do not schedule another Listing Differentiation piece immediately after A13 without checking `audits/montaic/implementation/content-calendar.md`.

---

## When you are done

Report back with:

> "A13 publish-path landed. New blog post created at /blog/zillow-listings-all-sound-the-same with draft:true. Article body pasted, JSON-LD @graph block wired with BlogPosting + FAQPage + BreadcrumbList nodes plus the mentions cross-cluster bind to A11 and A12. All five citation links present in rendered HTML. All N validation checks passed. Grader placeholder confirmed NOT in rendered body. Ready for Lance final read and publish. 0 errors. Returned to Claude."

Include:
- Path to the article file you created
- Confirmation that the grader placeholder was absent before paste
- Confirmation that the dynamic `/og` URL in the frontmatter rendered a valid 1200x630 PNG
- Any markdown-to-JSX conversion quirks you had to handle
- Actual wordCount the blog system computed (for Lance to update the schema if the delta is more than 10%)
- Any em dash or semicolon violations found and fixed during the paste

---

## What happens after Claire is done

1. Lance reads the landed draft end-to-end in one sitting for voice
2. Lance fixes anything that sounds off in his own hand
3. Lance confirms the grader paragraph reads well next to the rest of the piece
4. Lance flips `draft: true` to `draft: false`
5. Lance commits and redeploys
6. Never Ranked runs `scripts/verify-deploy.sh` against the LIVE URL and confirms 7/7 checks pass
7. Lance pastes the Rich Results Test URL one final time to confirm 0 errors
8. Lance updates A11 and A12 schemas to add reciprocal `mentions` entries pointing at A13 (cluster housekeeping, ~10 minutes of additional work)
9. Article is live. Listing Differentiation cluster has its anchor.

A13 is the first Montaic piece to lead with revenue instead of compliance. It opens a second cluster so the blog signals topical range rather than single-topic depth. Every search for "why do Zillow listings sound the same" or "do listing description words matter" or "AI listing description tool comparison" should land on A13. Every search for "is AI safe for listings" lands on A11. Every search for "fair housing listing description rules" lands on A12. Three pieces, two clusters, three commercial hooks.
