# A12 Publish Path — Claire lands, Lance flips

**For:** Claire (Montaic codebase)
**From:** Never Ranked side
**Scope:** Land a new blog post (Fair Housing Act Listing Description Rules), wire up the full JSON-LD schema payload, leave `draft: true`. Lance does the final voice read-through and flips the draft himself.
**Time:** ~45 minutes.
**Cluster context:** This is the second pillar article in the Fair Housing cluster. A11 (already live at `/blog/fair-housing-ai-compliance-agents`) is the strategic framing. A12 is the operational reference document. The two pieces cross-link in the body.

---

## Context for Claire

A12 is a new pillar article, not an edit to an existing one. The full article body is included inline below as markdown, and the JSON-LD schema @graph block is included as a separate paste target.

**The strategic shape:** A11 covered the "Fair Housing Act applies to AI" angle (the alarm bell). A12 covers "what the statute actually prohibits in listing copy, regardless of how the listing was written" (the reference document). The lever is outsider triangulation: Lance saw the listing language problem from three vantage points (coffee shop, photo/video work, Redfin/Zillow browsing) that no agent and no PropTech founder has at the same time. Section 9 ("What Montaic does differently") opens with "I am not a real estate agent" to plant that flag.

**Why this matters for publishing:** A12 is designed to get cited by AI search engines when agents ask operational questions like "can I say family-friendly in a listing" or "what words are illegal in real estate listings." It is longer than A11 (3,100 words vs 2,400) because it is a reference document, not a primer. Lance approved shipping at 3,100 because longer pillar articles consistently get more AI-engine citations.

**Voice rules apply.** Zero em dashes, zero semicolons in the prose, no emojis, no AI filler phrases. The draft has been voice-checked before handoff. If you see anything that looks like a voice violation during the paste, flag it rather than fixing it.

---

## Pre-flight

Confirm the Montaic blog infrastructure is ready for a new post. Same shape as the A11 land.

```bash
# Blog index renders
curl -s -o /dev/null -w "%{http_code}" https://montaic.com/blog
# Expected: 200

# Sitemap exists and is being served
curl -s -o /dev/null -w "%{http_code}" https://montaic.com/sitemap.xml
# Expected: 200

# A11 is still live at its canonical URL (sanity check the cluster anchor)
curl -s -o /dev/null -w "%{http_code}" https://montaic.com/blog/fair-housing-ai-compliance-agents
# Expected: 200
```

If any of those fail, stop and flag before creating the new post.

Also confirm the blog post storage pattern. Based on A11 handoffs, posts live in `lib/blog/posts.ts` as TypeScript/TSX. Use the same pattern for A12. If the pattern has changed since A11, use whatever the most recent blog post in the codebase uses.

---

## A12.P1 — Create the blog post file

Create a new post at slug `fair-housing-listing-description-rules` with `draft: true`. The canonical URL will be `https://montaic.com/blog/fair-housing-listing-description-rules`.

**Frontmatter fields to set:**

```
title: "Fair Housing Act Listing Description Rules: The Words You Cannot Use in 2026"
slug: fair-housing-listing-description-rules
description: "What § 3604(c) prohibits in listing descriptions, the words HUD flags, and how to write copy that converts without violating the statute."
author: Lance Roylo
publishedAt: 2026-04-10
updatedAt: 2026-04-10
draft: true
ogImage: /og?title=Fair%20Housing%20Act%20Listing%20Description%20Rules%3A%20The%20Words%20You%20Cannot%20Use%20in%202026&subtitle=Montaic%20Blog&type=blog
category: Compliance
tags: [Fair Housing, Compliance, Listing Descriptions, AEO]
relatedPosts: [fair-housing-ai-compliance-agents]
```

**OG image note:** Montaic's blog uses the dynamic `/og` route (same pattern as A11). The URL above is pre-encoded for A12's title. Do not change it. If the `/og` route returns anything other than a 1200x630 PNG when you visit it directly in a browser, stop and flag in the report-back before publishing.

---

## A12.P2 — Paste the full article body

The full article body as markdown. Paste this into whatever the blog system uses for post content. If the system stores content as JSX/TSX, convert the markdown to the JSX structure used by the rest of the Montaic blog (same conversion pattern A11 used).

**CRITICAL:** All inline citation links are already in the markdown below. Do not add or remove any. If your conversion step requires adjusting link syntax, preserve the URLs exactly.

---

```markdown
Most agents have heard they cannot say "family-friendly" in a listing, but most cannot name the statute that says so. The statute is [42 U.S.C. § 3604(c)](https://www.law.cornell.edu/uscode/text/42/3604), and the implementing regulation is [24 C.F.R. § 100.75](https://www.ecfr.gov/current/title-24/subtitle-B/chapter-I/subchapter-A/part-100/subpart-H/section-100.75). Together they prohibit any listing description that signals preference for or against a protected class. The catch is that HUD's 1989 advertising memo has been technically withdrawn and never replaced, so the "official word list" circulating in real estate offices is operating on guidance HUD no longer publishes. The legal authority is the statute itself plus case law. This article walks through what 3604(c) actually prohibits, the seven phrase categories that show up in real listings, what to write instead, and how Montaic's rule engine handles the gray cases.

## The statute is shorter than you think

Here is the full text of 42 U.S.C. § 3604(c):

> "To make, print, or publish, or cause to be made, printed, or published any notice, statement, or advertisement, with respect to the sale or rental of a dwelling that indicates any preference, limitation, or discrimination based on race, color, religion, sex, handicap, familial status, or national origin, or an intention to make any such preference, limitation, or discrimination."

Three phrases in this sentence do all the legal work.

First, "make, print, or publish." The statute's coverage is not limited to printed ads. It covers anything that gets made or published, which now includes MLS listings, social media captions, website descriptions, PDFs, email blasts, and the output of any AI writing tool the agent uses to draft copy. If it gets published, 3604(c) applies to it.

Second, "indicates any preference, limitation, or discrimination." The word "indicates" is the key. The statute does not require the agent to actually discriminate. It only requires the copy to signal preference. "Perfect for empty nesters" does not reject families with children. It just indicates a preference, which is all 3604(c) needs.

Third, the seven protected classes: race, color, religion, sex, handicap, familial status, and national origin. Each of these has specific phrase patterns that trigger a violation, covered in the next section.

The implementing regulation at 24 C.F.R. § 100.75 adds the enforcement mechanism. HUD's [FHEO Handbook 8025.1](https://www.hud.gov/program_offices/administration/hudclips/handbooks/fheo/80251) walks investigators through what constitutes a violation in practice. Together these three documents are the current legal framework. The 1989 advertising memo and its attached word list are not.

## Three things most agents do not know

**The Word List is not what you think it is.**

Walk into any real estate office and ask about Fair Housing compliance in listings, and someone will hand you a photocopied two-page list of forbidden words. "Family-friendly." "Master bedroom." "Walking distance to churches." The list is thorough, well-organized, and legally obsolete.

That list originated in a 1989 HUD Office of Fair Housing memorandum titled "Guidance Regarding Advertisements Under § 804(c) of the Fair Housing Act." HUD technically withdrew the memo as part of a regulatory cleanup in the 1990s, and nothing replaced it. The word list still circulates because it is a useful starting point, but it is not HUD's current position. You will not find it anywhere on hud.gov today.

The practical problem is this: agents who memorize the list and stop thinking are exposed on phrases the list never mentioned. A 1989 memo cannot anticipate 2026 language. The legal force comes from the statute and case law, which both continue to evolve.

**Preference is enough.**

The most common mistake in Fair Housing analysis is treating the statute as a discrimination test. It is not a discrimination test. It is a signal test.

You do not need to actually discriminate against anyone. You do not need to intend to discriminate. All 3604(c) requires is that the copy "indicates" preference based on a protected class, and the word "indicates" is doing a lot of work.

"Perfect for empty nesters" indicates a preference for buyers without children. It does not reject anyone. It does not screen anyone out. It just signals who the listing is written for, and that signal is the violation. This is why the disparate impact standard applies to advertising cases. The court does not ask what you meant. It asks what the copy said to a reasonable reader.

**Your brokerage and your tools are also liable.**

When a listing gets published, at least three parties are technically liable under 3604(c): the agent who wrote the copy, the brokerage that employs the agent, and the platform that published the listing. Enforcement usually targets the agent, but the broader liability is real.

The brokerage is liable because it employed the agent and failed to train or supervise the advertising compliance process. Most brokerages run Fair Housing training once a year for exactly this reason. The platform, meaning the MLS or the website or the AI writing tool the agent used, is liable under the statute's "cause to be made or published" clause. This is the theory that made [the 2022 DOJ settlement with Meta](https://www.nar.realtor/legal-case-summaries/meta-facebook-settles-fair-housing-violation-allegations) possible. Meta did not write the discriminatory ads itself, but it caused them to be published to a targeted audience.

If you are an agent reading this, the takeaway is that your brokerage and your tool vendors have skin in this game. The fact that most of them have not updated their compliance protocols does not mean the liability is not there.

## How the modal case actually happens

An agent writes a listing for a four-bedroom home in a quiet neighborhood near a well-rated public school. They want the listing to convert. Their instinct is to talk about who would love living in the house, because that is what every listing they have ever read does. They write: "Perfect for a growing family, this four-bedroom home offers room to roam and top-rated schools just minutes away." The listing converts. The home sells. Nothing happens for five months. Then a HUD investigator calls the brokerage because a buyer filed a complaint alleging the language steered them away from inquiring about the property because they were single.

The agent did not know they violated the statute. Their broker did not know either. The MLS did not flag the copy because most MLS systems check for formatting issues like missing photos and broken links, not for legal compliance. The first time anyone realized there was a problem was when HUD opened an investigation. By then the agent had repeated the same pattern on twenty other listings, and the brokerage had to audit every one of them with legal counsel at $400 an hour.

This is the modal Fair Housing advertising case. Not malice, not exclusion, not red-lining. Just an agent writing the copy that pattern-matches what every other agent writes, which pattern-matches decades of pre-1968 listing copy that contained explicit demographic preferences. The industry's collective writing style absorbed those patterns and never fully shed them. Every agent who learned to write listings by reading competitor listings inherited the same bad inheritance.

AI writing tools make this worse, not better, because they were trained on the same collective writing style the industry has been producing for decades. (The full AI angle is covered in the previous cluster article, [The Fair Housing Act Applies to AI Now](/blog/fair-housing-ai-compliance-agents).) The fix is not memorizing a word list. The fix is learning to read your own copy through the statute's lens, which is what the rest of this article walks through.

## The seven phrase categories that trigger 3604(c)

**1. Familial status signals**

*Patterns:* "perfect for a growing family," "ideal starter home," "great for empty nesters," "walk to top-rated schools," "plenty of room for the kids."

*Clause triggered:* familial status.

*Why it violates:* each phrase signals preference for or against buyers with children. The listing does not reject anyone, but the signal is the violation.

*Write instead:* "Three bedrooms, 2.5 bathrooms, 2,100 square feet in the XYZ Elementary school district." The district is a factual proximity, not a projection of the buyer.

**2. Religious signals**

*Patterns:* "steps from St. Anthony's," "walking distance to Temple Beth Shalom," "kosher kitchen," "in the heart of our Christian community."

*Clause triggered:* religion.

*Why it violates:* anchoring a property to a religious institution or community signals a preferred buyer demographic. HUD has flagged this specifically since 1989, and case law has been consistent.

*Write instead:* name landmarks by street address and direction, never by religious affiliation. "Two blocks south of Main Street and Elm" instead of "two blocks south of St. Anthony's."

**3. National origin signals**

*Patterns:* "heart of Little Italy," "minutes from Chinatown," "diverse international neighborhood," "close-knit ethnic community."

*Clause triggered:* national origin.

*Why it violates:* naming a neighborhood by its ethnic association signals an expected buyer demographic, even when the name is affectionate. "Diverse" can be a violation in context because it signals an expected demographic mix.

*Write instead:* use the neighborhood's registered name only. "In the Little Italy neighborhood" is closer to acceptable than "in the heart of Little Italy."

**4. Disability and handicap signals**

*Patterns:* "no wheelchair access needed," "stairs throughout, no elevator," "second-floor master perfect for fit buyers," "great for active families."

*Clause triggered:* handicap.

*Why it violates:* any language that frames physical features in terms of who can or cannot use them signals exclusion of disabled buyers. Accurate description is fine. Editorial comment on the exclusion is the violation.

*Write instead:* describe physical features factually. "Three-story townhome with stairs between all levels" instead of "three-story, no elevator, not for the less mobile."

**5. Sex and gender signals**

*Patterns:* "man cave in the basement," "wife's dream kitchen," "ladies' sitting room," "perfect for a single woman."

*Clause triggered:* sex. Since Bostock and HUD's 2021 implementation memo, this clause includes gender identity.

*Why it violates:* gendered role descriptions signal preference for a specific household composition. "Man cave" has become common enough that agents do not hear it as loaded, but it is still a sex-based signal.

*Write instead:* name the room by function. "Finished basement with built-in bar and TV mount" works. "Man cave" does not.

**6. Race and color signals (usually coded as neighborhood)**

*Patterns:* "established neighborhood," "traditional community," "exclusive enclave," "safe area," "low-crime street."

*Clause triggered:* race or color, via disparate impact.

*Why it violates:* these phrases have been used as proxies for racial composition for decades. Courts and HUD treat them as coded demographic signals regardless of the agent's intent. "Safe neighborhood" is the most commonly flagged because it is so widely used.

*Write instead:* cite the property's HOA status, year built, and crime statistics from a named source if relevant. "Registered with the XYZ Homeowners Association, built 1998, crime index 18 per FBI UCR data" is factual and defensible.

**7. Image and amenity signals**

*Patterns:* listing photos that exclusively feature one demographic, virtual staging showing a single household type, amenity descriptions tied to community association like "steps from the yacht club" or "inside the gated community of XYZ."

*Clause triggered:* catch-all "indicates preference" language in 3604(c).

*Why it violates:* even when the written copy is clean, visual content is part of the "advertisement" 3604(c) covers. Staging, photography, and amenity association can all signal preference on their own.

*Write instead:* use stock photography without people when possible, or photography that does not exclusively feature one demographic. Tie amenities to physical proximity, not community membership.

## The four-step workflow for compliant listing copy

**Step 1: Describe the property, not the buyer.**

Anchor every sentence in something physical about the property. A room, a square footage, a view, a mechanical system, a finish. If the sentence projects a household type or a buyer profile onto the property, rewrite it.

"Four bedrooms upstairs" is a property fact. "Four bedrooms upstairs, perfect for a growing family" is a property fact plus a buyer projection. Cut the projection.

**Step 2: Use the swap test.**

Take any sentence in the draft that describes an audience. Replace the group with a protected class from the statute. "Perfect for a growing family" becomes "perfect for a growing Black family" or "perfect for a growing Christian family." Does the sentence still feel neutral? No. The original was signaling preference. Rewrite it.

**Step 3: Cite the feature, not the implied audience.**

When you find yourself writing who the property is for, reframe as what the property has. "Walking distance to XYZ Elementary" is a factual distance. "Walking distance to XYZ Elementary, great for families with kids" adds the illegal part.

**Step 4: Run a compliance check before publish.**

Most MLSes do not check Fair Housing language. Most AI writing tools do not either. The compliance check has to happen somewhere between draft and publish, and most agents are currently skipping it because they do not realize their tools are not doing it for them. The compliance check is the last mile of the workflow, and it is the one that actually matters.

## What Montaic does differently

I am not a real estate agent. I own a coffee shop where a lot of agents spend their mornings, I shot real estate photography and social media video for agents for several years, and I read listings on Redfin and Zillow the way any buyer does. Those three vantage points are how I first noticed the problem with listing description copy.

From the coffee shop, I heard agents talk about writing listings as a chore they wanted off their plate. From the photography and video work, I read the captions and scripts going out on social media and noticed the language on video drifted further from MLS compliance than the MLS copy did, because nobody was even pretending to check it. And from Redfin and Zillow I saw the end result. Listings written by dozens of different people, all pattern-matching the same loaded language that the Fair Housing Act prohibits.

What I could see from three angles at once is what most agents, brokerages, and AI tools cannot see from inside their own workflow. The listing description is not a copywriting task. It is a compliance surface that happens to look like marketing copy. That is the insight that became Montaic.

Montaic's listing generator runs every output through a rule engine before showing the agent a draft. The rule engine is built directly from 24 C.F.R. § 100.75 and the categorical phrase patterns that have been flagged in fair housing case law for the last three decades. When the engine catches a phrase, it shows the agent which protected class the phrase signals, which clause of 3604(c) it implicates, and a compliant alternative the agent can accept with one click.

Four specific behaviors make the rule engine different from a static word list:

1. It catches the seven phrase categories covered above, plus the long tail of variations no static list has kept up with.
2. It suggests compliant alternatives instead of silently rewriting. Silent rewrites teach the agent nothing. Explicit flags teach the agent the statute.
3. It logs every flag and every alternative selection as an audit trail. If a complaint is ever filed, the audit trail is the agent's evidence that they took compliance seriously.
4. It updates as case law evolves. The 1989 word list is the floor. Case law is the moving ceiling.

The list is the floor. The statute is the ceiling. Montaic was built from the outside looking in, which is why it catches the things agents and AI tools inside the workflow keep missing.

## Frequently asked questions

**What does 42 U.S.C. § 3604(c) actually say?**

The statute prohibits making, printing, or publishing any notice, statement, or advertisement about the sale or rental of a dwelling that indicates preference, limitation, or discrimination based on race, color, religion, sex, handicap, familial status, or national origin, or the intention to do any of those things. The key word is "indicates." The statute does not require you to discriminate in fact. It only requires you to signal preference.

**Is "family-friendly" really illegal in a listing description?**

Yes, in most contexts. "Family-friendly" signals preference for buyers with children, which is the familial status clause of 3604(c). The phrase does not reject single buyers, empty nesters, or anyone else, but the signal is the violation. Write the property's factual features instead, like school district, bedroom count, and yard size.

**Can I describe a property as being near a specific church or school?**

Schools are generally safe to name because they are public resources. Religious institutions are not. "Two blocks from XYZ Elementary" is fine. "Two blocks from St. Anthony's Church" is a religion signal under 3604(c). If you need to describe the location, use a non-religious landmark or an address.

**What is the difference between describing a property and describing a buyer?**

Describing a property means naming its physical features: bedrooms, square footage, mechanical systems, finishes, proximity to government landmarks. Describing a buyer means projecting who would love the property: families, empty nesters, young professionals, retirees. The first is a fact about the house. The second is a Fair Housing signal. The rule is to describe the property only.

**Does the Fair Housing Act apply to MLS-only listings, or only to public-facing copy?**

It applies to both. The statute covers anything "made, printed, or published," and MLS listings are made and published to a specific audience of licensed agents. The fact that the MLS is not public does not remove it from the statute's coverage. Treat MLS copy with the same compliance standard as public listings.

**What happens if HUD finds a Fair Housing violation in one of my listings?**

HUD can open an investigation, require you to attend Fair Housing training, assess a civil penalty, and refer the case to the Department of Justice for further action if the pattern is severe. Civil penalties under 42 U.S.C. § 3612 start at $19,787 for a first violation and escalate from there. Most cases settle with a fine, training, and a compliance agreement.

**Is there an official HUD list of forbidden words?**

No. The "Fair Housing Advertising Word and Phrase List" that circulates among real estate offices originated in a 1989 HUD memorandum that was technically withdrawn and never replaced. Nothing on hud.gov today publishes an official list. The legal authority is the statute at 42 U.S.C. § 3604(c) plus the regulation at 24 C.F.R. § 100.75 plus case law.

**How does Montaic's compliance check differ from my MLS's compliance check?**

Most MLS compliance checks look for formatting issues like missing photos, broken links, and mandatory fields. They do not scan for Fair Housing language. Montaic's rule engine scans every generated listing against the statute, the regulation, and the case law patterns, and it flags any phrase that signals preference. If your MLS flagged "perfect for a growing family" today, Montaic would have flagged it before the MLS ever saw it.

## Closing

The Fair Housing Act has been the rule in real estate advertising since 1968. That is 58 years. The question for 2026 is not whether to comply. It is whether your tools are thinking about the ceiling or just the floor. Most tools that agents use today are not thinking about either, which is why "perfect for a growing family" still shows up in brand-new listings on every major MLS.

Montaic was built from the outside looking in, which is why it catches the things the tools inside the workflow keep missing.

**[Try the free Montaic listing grader →](https://montaic.com/grader)** Paste any listing description, and the rule engine will show you exactly which phrases would be flagged, which clause of 3604(c) they trigger, and what to write instead.

*Related reading: [The Fair Housing Act Applies to AI Now](/blog/fair-housing-ai-compliance-agents)*
```

---

## A12.P3 — Paste the JSON-LD schema @graph block

Add this to the post's HTML `<head>` as a `<script type="application/ld+json">` block, or wire it in through whatever schema injection component the Montaic blog system uses. Match however A11 was wired.

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BlogPosting",
      "@id": "https://montaic.com/blog/fair-housing-listing-description-rules#article",
      "headline": "Fair Housing Act Listing Description Rules: The Words You Cannot Use in 2026",
      "description": "What § 3604(c) prohibits in listing descriptions, the words HUD flags, and how to write copy that converts without violating the statute.",
      "image": "https://montaic.com/og/blog/fair-housing-listing-description-rules.png",
      "datePublished": "2026-04-10",
      "dateModified": "2026-04-10",
      "wordCount": 3100,
      "keywords": [
        "Fair Housing Act listing description rules",
        "42 U.S.C. 3604(c)",
        "24 C.F.R. 100.75",
        "real estate advertising compliance",
        "Fair Housing advertising word list",
        "discriminatory listing language"
      ],
      "articleSection": "Compliance",
      "isAccessibleForFree": true,
      "author": {"@id": "https://montaic.com/#founder"},
      "publisher": {"@id": "https://montaic.com/#organization"},
      "mainEntityOfPage": "https://montaic.com/blog/fair-housing-listing-description-rules",
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "42 U.S.C. § 3604(c)",
          "url": "https://www.law.cornell.edu/uscode/text/42/3604"
        },
        {
          "@type": "CreativeWork",
          "name": "24 C.F.R. § 100.75",
          "url": "https://www.ecfr.gov/current/title-24/subtitle-B/chapter-I/subchapter-A/part-100/subpart-H/section-100.75"
        },
        {
          "@type": "CreativeWork",
          "name": "HUD Issues Fair Housing Act Guidance on Applications of Artificial Intelligence (2024)",
          "url": "https://archives.hud.gov/news/2024/pr24-098.cfm"
        },
        {
          "@type": "CreativeWork",
          "name": "FHEO Handbook 8025.1",
          "url": "https://www.hud.gov/program_offices/administration/hudclips/handbooks/fheo/80251"
        },
        {
          "@type": "CreativeWork",
          "name": "NAR Fair Housing advertising resources",
          "url": "https://www.nar.realtor/fair-housing"
        }
      ],
      "isPartOf": {
        "@type": "Blog",
        "@id": "https://montaic.com/blog#blog"
      },
      "about": [
        {"@type": "Thing", "name": "Fair Housing Act"},
        {"@type": "Thing", "name": "Real estate advertising compliance"},
        {"@type": "Thing", "name": "Listing descriptions"}
      ],
      "hasPart": {"@id": "https://montaic.com/blog/fair-housing-listing-description-rules#faq"}
    },
    {
      "@type": "FAQPage",
      "@id": "https://montaic.com/blog/fair-housing-listing-description-rules#faq",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What does 42 U.S.C. § 3604(c) actually say?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The statute prohibits making, printing, or publishing any notice, statement, or advertisement about the sale or rental of a dwelling that indicates preference, limitation, or discrimination based on race, color, religion, sex, handicap, familial status, or national origin, or the intention to do any of those things. The key word is 'indicates.' The statute does not require you to discriminate in fact. It only requires you to signal preference."
          }
        },
        {
          "@type": "Question",
          "name": "Is 'family-friendly' really illegal in a listing description?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, in most contexts. 'Family-friendly' signals preference for buyers with children, which is the familial status clause of 3604(c). The phrase does not reject single buyers, empty nesters, or anyone else, but the signal is the violation. Write the property's factual features instead, like school district, bedroom count, and yard size."
          }
        },
        {
          "@type": "Question",
          "name": "Can I describe a property as being near a specific church or school?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Schools are generally safe to name because they are public resources. Religious institutions are not. 'Two blocks from XYZ Elementary' is fine. 'Two blocks from St. Anthony's Church' is a religion signal under 3604(c). If you need to describe the location, use a non-religious landmark or an address."
          }
        },
        {
          "@type": "Question",
          "name": "What is the difference between describing a property and describing a buyer?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Describing a property means naming its physical features: bedrooms, square footage, mechanical systems, finishes, proximity to government landmarks. Describing a buyer means projecting who would love the property: families, empty nesters, young professionals, retirees. The first is a fact about the house. The second is a Fair Housing signal. The rule is to describe the property only."
          }
        },
        {
          "@type": "Question",
          "name": "Does the Fair Housing Act apply to MLS-only listings, or only to public-facing copy?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It applies to both. The statute covers anything made, printed, or published, and MLS listings are made and published to a specific audience of licensed agents. The fact that the MLS is not public does not remove it from the statute's coverage. Treat MLS copy with the same compliance standard as public listings."
          }
        },
        {
          "@type": "Question",
          "name": "What happens if HUD finds a Fair Housing violation in one of my listings?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "HUD can open an investigation, require you to attend Fair Housing training, assess a civil penalty, and refer the case to the Department of Justice for further action if the pattern is severe. Civil penalties under 42 U.S.C. § 3612 start at $19,787 for a first violation and escalate from there. Most cases settle with a fine, training, and a compliance agreement."
          }
        },
        {
          "@type": "Question",
          "name": "Is there an official HUD list of forbidden words?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. The 'Fair Housing Advertising Word and Phrase List' that circulates among real estate offices originated in a 1989 HUD memorandum that was technically withdrawn and never replaced. Nothing on hud.gov today publishes an official list. The legal authority is the statute at 42 U.S.C. § 3604(c) plus the regulation at 24 C.F.R. § 100.75 plus case law."
          }
        },
        {
          "@type": "Question",
          "name": "How does Montaic's compliance check differ from my MLS's compliance check?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Most MLS compliance checks look for formatting issues like missing photos, broken links, and mandatory fields. They do not scan for Fair Housing language. Montaic's rule engine scans every generated listing against the statute, the regulation, and the case law patterns, and it flags any phrase that signals preference. If your MLS flagged 'perfect for a growing family' today, Montaic would have flagged it before the MLS ever saw it."
          }
        }
      ]
    },
    {
      "@type": "BreadcrumbList",
      "@id": "https://montaic.com/blog/fair-housing-listing-description-rules#breadcrumb",
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
          "name": "Fair Housing Act Listing Description Rules: The Words You Cannot Use in 2026"
        }
      ]
    }
  ]
}
```

---

## A12.P4 — Do NOT flip the draft

Leave `draft: true` in the frontmatter. The draft should be deployed but noindex'd and excluded from the blog index and sitemap, matching how A11 was handled during its own land. Lance does the final voice read and flips `draft: false` himself.

---

## Validation

After deploying the draft, run the canonical verify-deploy script from the neverranked repo root:

```bash
./scripts/verify-deploy.sh \
  https://montaic.com/blog/fair-housing-listing-description-rules \
  https://montaic.com/blog \
  https://montaic.com/sitemap.xml
```

For a draft post, checks 1 (noindex) should PASS and checks 2-3 (blog index, sitemap) should correctly show the post is excluded. Checks 4-5 (schema) must PASS.

Additional manual checks specific to A12:

```bash
# Draft loads
curl -s -o /dev/null -w "%{http_code}" https://montaic.com/blog/fair-housing-listing-description-rules
# Expected: 200

# noindex tag present (draft state)
curl -s https://montaic.com/blog/fair-housing-listing-description-rules | grep -o 'noindex'
# Expected: match

# Excluded from blog index (draft state)
curl -s https://montaic.com/blog | grep -c 'fair-housing-listing-description-rules'
# Expected: 0

# Excluded from sitemap (draft state)
curl -s https://montaic.com/sitemap.xml | grep -c 'fair-housing-listing-description-rules'
# Expected: 0

# All five citation URLs appear in rendered HTML
curl -s https://montaic.com/blog/fair-housing-listing-description-rules | grep -c 'law.cornell.edu/uscode/text/42/3604'
curl -s https://montaic.com/blog/fair-housing-listing-description-rules | grep -c 'ecfr.gov/current/title-24'
curl -s https://montaic.com/blog/fair-housing-listing-description-rules | grep -c 'archives.hud.gov/news/2024/pr24-098'
curl -s https://montaic.com/blog/fair-housing-listing-description-rules | grep -c 'hud.gov/program_offices/administration/hudclips/handbooks/fheo/80251'
curl -s https://montaic.com/blog/fair-housing-listing-description-rules | grep -c 'nar.realtor'
# Each should return at least 1

# A11 cluster cross-link is present
curl -s https://montaic.com/blog/fair-housing-listing-description-rules | grep -c 'fair-housing-ai-compliance-agents'
# Expected: at least 2 (one in body, one in "Related reading")

# FAQPage schema has 8 Question nodes
curl -s https://montaic.com/blog/fair-housing-listing-description-rules | grep -o '"@type":"Question"' | wc -l
# Expected: 8

# BlogPosting schema renders with wordCount
curl -s https://montaic.com/blog/fair-housing-listing-description-rules | grep -o '"wordCount":[0-9]*'
# Expected: "wordCount":3100 (or within 10% if blog system recomputes)

# BreadcrumbList schema has 3 ListItem nodes
curl -s https://montaic.com/blog/fair-housing-listing-description-rules | grep -o '"@type":"ListItem"' | wc -l
# Expected: 3

# NO em dashes in the rendered article body
curl -s https://montaic.com/blog/fair-housing-listing-description-rules | grep -c '—'
# Expected: 0

# NO semicolons in the article body prose (excluding the statute quote block, which has none either)
# This is harder to grep cleanly because of HTML entities. Skip if the count is noisy.
```

All checks should pass. Then paste the draft URL into the [Rich Results Test](https://search.google.com/test/rich-results) one more time to confirm BlogPosting + FAQPage + BreadcrumbList are all detected with zero errors.

---

## Known risks

- **Markdown conversion:** If the article body is stored as JSX/TSX rather than markdown (which the A11 codebase suggested it is), you will need to convert the markdown blockquote (the 3604(c) statute text) and the bulleted lists into the equivalent JSX components. The inline citation links use standard `[text](url)` markdown — convert to whatever link component the blog uses.
- **Heading levels:** The article body uses `##` for section headings and `**bold**` for sub-subsection intros. Preserve this hierarchy. The TL;DR does not have its own heading (it opens the article directly).
- **Statute quote block:** The opening of "The statute is shorter than you think" has a multi-line blockquote containing the 3604(c) text. Preserve the blockquote formatting. This is a primary source citation and its visual prominence matters for AEO.
- **Cross-link to A11:** The article body links to `/blog/fair-housing-ai-compliance-agents` twice (once in the modal case section, once in "Related reading" at the bottom). Both should resolve to the live A11 post. If A11 has moved or redirected, update both before publish.
- **OG image:** Uses Montaic's dynamic `/og` route (same as A11). The pre-encoded URL is in the frontmatter. Verify it renders a 1200x630 PNG in the browser before publishing.
- **Voice discipline:** No em dashes, no semicolons in prose. The draft as pasted is clean. If your JSX conversion or linter introduces either, fix before deploying.
- **wordCount accuracy:** The schema says 3,100. If the blog system auto-computes wordCount from the body text, the actual number may be slightly off because of markdown-to-HTML conversion. A tolerance of ±10% is fine. Flag if the delta is larger.

---

## When you are done

Report back with:

> "A12 publish-path landed. New blog post created at /blog/fair-housing-listing-description-rules with draft:true. Article body pasted, JSON-LD @graph block wired with BlogPosting + FAQPage + BreadcrumbList nodes. All five citation links present in rendered HTML. All N validation checks passed. Ready for Lance final read and publish. 0 errors. Returned to Claude."

Include:
- Path to the article file you created
- Confirmation that the dynamic `/og` URL in the frontmatter rendered a valid 1200x630 PNG
- Any markdown-to-JSX conversion quirks you had to handle
- Actual wordCount the blog system computed (for Lance to update the schema if needed)
- Any em dash or semicolon violations found and fixed during the paste

---

## What happens after Claire is done

1. Lance reads the landed draft end-to-end in one sitting for voice
2. Lance fixes anything that sounds off in his own hand
3. Lance flips `draft: true` to `draft: false`
4. Lance commits and redeploys
5. Never Ranked runs `scripts/verify-deploy.sh` against the LIVE URL and confirms 5/5 checks pass
6. Lance pastes the Rich Results Test URL one final time to confirm 0 errors
8. Article is live. Fair Housing cluster is a pair.

This article is the operational half of the Fair Housing cluster. A11 is the alarm bell, A12 is the reference document. Together they cover both halves of the AEO query space: agents deciding whether to trust AI (A11) and agents writing specific listings right now (A12). Every search for "fair housing listing description rules" or "what words are illegal in real estate listings" should land on A12. Every search for "is AI safe for listings" should land on A11.
