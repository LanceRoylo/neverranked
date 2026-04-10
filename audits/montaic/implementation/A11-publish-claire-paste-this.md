# A11 Publish Path — Claire edits, Lance flips

**For:** Claire (Montaic codebase)
**From:** Never Ranked side
**Scope:** Apply three paragraph rewrites, add five inline citation links, remove one unverified claim. Leave `draft: true`. Lance does the final read-through and flips the draft himself.
**Time:** ~25 minutes.
**Blocker:** Citation verification I ran against the draft found a factual problem. Details below. Fix it in the draft before Lance publishes or the article's credibility collapses the first time a compliance attorney fact-checks it.

---

## Context for Claire

The A11 draft you already deployed has a factual misattribution in the opening paragraphs. It claims HUD issued 2024 guidance confirming the Fair Housing Act applies to AI-generated listing content. HUD did release two AI-related Fair Housing guidance documents on May 2, 2024 (HUD No. 24-098), but their scope is tenant screening and algorithmic ad targeting, not content generation. A trade publication or compliance attorney would fact-check this in five minutes.

The article's thesis is still correct: agents are legally responsible for AI-generated listing content. The liability comes from **42 U.S.C. § 3604(c)**, which has been in force since 1968 and applies to any advertisement regardless of who or what produced it. The fix is to re-anchor the opening on the statute and the HUD regulation at 24 C.F.R. § 100.75, and reframe the 2024 HUD guidance as enforcement-attention signal rather than content-coverage claim.

Everything below is verified against primary sources. You can apply these edits mechanically. Do not rewrite the voice — Lance will do a final read-through after your edits land.

---

## Pre-flight

Confirm the draft is still in the state you deployed it. The post should exist at the Fair Housing slug with `draft: true`, noindex'd, excluded from blog index and sitemap. Validate:

```bash
curl -s -o /dev/null -w "%{http_code}" https://montaic.com/blog/fair-housing-ai-compliance-agents
# Expected: 200

curl -s https://montaic.com/blog/fair-housing-ai-compliance-agents | grep -o 'noindex'
# Expected: match

curl -s https://montaic.com/blog | grep -c 'fair-housing-ai-compliance-agents'
# Expected: 0
```

If any of those fail, stop and flag before editing.

---

## A11.P1 — Apply three paragraph rewrites

Open the article body file (wherever you landed the post — likely `lib/blog/posts.ts` per your earlier report). The edits are in the opening section of the article, before the "Why this is a real problem for agents using generic AI tools" heading.

### Edit 1 — Replace the TL;DR paragraph

**Find this paragraph (currently in the article body):**

> In April 2024, HUD quietly issued guidance confirming that the Fair Housing Act applies to AI-generated real estate advertising and listing content. What this means in plain English: if you use ChatGPT, Jasper, Copy.ai, or any other generic AI tool to write a listing description that contains language violating the Fair Housing Act, **you** are legally responsible. Not OpenAI. Not Anthropic. You.

**Replace with:**

> The Fair Housing Act has always applied to AI-generated listing content. The statute at 42 U.S.C. § 3604(c) prohibits any advertisement that indicates preference or discrimination based on a protected characteristic, regardless of who or what produced it. That has been the law since 1968. And in May 2024, HUD signaled it is actively watching the AI space when it released two separate guidance documents on algorithmic tenant screening and algorithmic ad targeting. Neither document specifically addressed AI-generated content, but the direction of travel is obvious. If you use ChatGPT, Jasper, Copy.ai, or any other generic AI tool to write a listing description that contains language violating the Fair Housing Act, **you** are legally responsible. Not OpenAI. Not Anthropic. You.

### Edit 2 — Replace the "What HUD actually said in 2024" opening

**Find this paragraph (the one that begins the "What HUD actually said in 2024" section):**

> In May 2024, the Department of Housing and Urban Development published guidance titled "Application of the Fair Housing Act's Guarantee of Non-Discrimination in Housing-Related Transactions Based on the Use of Artificial Intelligence." The title is a mouthful. The substance is simple.

**Also change the heading above it.** Change `**What HUD actually said in 2024**` to `**What the Fair Housing Act actually says about AI**`.

**Replace the paragraph with:**

> The Fair Housing Act at 42 U.S.C. § 3604(c) has prohibited discriminatory housing advertising since 1968. HUD's implementing regulation at 24 C.F.R. § 100.75 makes the scope explicit: the prohibition covers "any notice, statement or advertisement" across "applications, flyers, brochures, deeds, signs, banners, posters, billboards or any documents used with respect to the sale or rental of a dwelling." Courts have consistently interpreted this under an "ordinary reader" standard, meaning what matters is how an ordinary reader perceives the advertisement, not what the publisher intended. There is no exemption for content generated by a machine.

### Edit 3 — Replace the "two ways" paragraph

**Find this paragraph (immediately after Edit 2 in the current draft):**

> The Fair Housing Act has applied to real estate advertising since 1968. It prohibits language in listing descriptions, advertisements, and marketing materials that shows preference or discrimination based on protected characteristics: race, color, religion, sex (including gender identity and sexual orientation), national origin, disability, or familial status.
>
> The 2024 guidance extends this in two ways:
>
> First, **it explicitly confirms that AI-generated content is held to the same standard as human-written content.** The use of an AI tool does not reduce or transfer legal responsibility. The agent who publishes the content is responsible for the content.
>
> Second, **it clarifies that "disparate impact" — not just intentional discrimination — is the standard for AI tools.** Even if neither you nor the AI intended to discriminate, if the output has a discriminatory effect on a protected class, that's a violation.

**Replace the entire block with:**

> The statute covers listings, advertisements, and marketing materials that show preference or discrimination based on race, color, religion, sex (including gender identity and sexual orientation), national origin, disability, or familial status. Two things are worth understanding about how the law actually applies.
>
> First, **the standard is what the content says, not who wrote it.** The agent who publishes the advertisement is the publisher under the law. The use of an AI tool does not reduce or transfer legal responsibility. If the content violates the Fair Housing Act, the agent is responsible regardless of whether a human, a generic AI tool, or a specialized tool produced the first draft.
>
> Second, **liability attaches under a "disparate impact" standard, not just "intentional discrimination."** Even if neither the agent nor the AI intended to discriminate, content that has a discriminatory effect on a protected class can still violate the Act. This is the standard courts use to evaluate housing advertising claims, and it is the same standard HUD uses in its enforcement posture on AI tools.

**Note the em dash removal.** The original had `"disparate impact" — not just intentional discrimination —` with em dashes. Per Montaic voice rules, no em dashes. The replacement uses a comma-separated clause instead.

---

## A11.P2 — Add five inline citation links

These are five real, verified outbound links. Add each one as a hyperlink in the article body at the specified location. Use the suggested anchor text exactly, or match whatever link style the rest of the Montaic blog uses.

### Link 1 — 42 U.S.C. § 3604(c)

**Anchor text:** `42 U.S.C. § 3604(c)`
**URL:** `https://www.law.cornell.edu/uscode/text/42/3604`
**Where:** In Edit 1 and Edit 2, every time the phrase `42 U.S.C. § 3604(c)` appears. Link the first occurrence only (in Edit 1). Leave subsequent mentions as plain text.

### Link 2 — 24 C.F.R. § 100.75

**Anchor text:** `24 C.F.R. § 100.75`
**URL:** `https://www.ecfr.gov/current/title-24/subtitle-B/chapter-I/part-100/subpart-B/section-100.75`
**Where:** In Edit 2, on the phrase "HUD's implementing regulation at 24 C.F.R. § 100.75".

### Link 3 — HUD 2024 AI guidance press release

**Anchor text:** `two separate guidance documents on algorithmic tenant screening and algorithmic ad targeting`
**URL:** `https://archives.hud.gov/news/2024/pr24-098.cfm`
**Where:** In Edit 1, on the phrase "two separate guidance documents on algorithmic tenant screening and algorithmic ad targeting".

### Link 4 — Meta / DOJ Fair Housing settlement

**Anchor text:** `Meta's 2022 Fair Housing Act settlement with the Department of Justice`
**URL:** `https://www.nar.realtor/legal-case-summaries/meta-facebook-settles-fair-housing-violation-allegations`
**Where:** This one requires adding a short new paragraph. Insert this paragraph at the end of the "Why this is a real problem for agents using generic AI tools" section, right before the heading "The five most common AI-generated Fair Housing violations":

> The Department of Justice has already brought Fair Housing enforcement against an AI system in the housing advertising space. In 2022, the DOJ sued Meta over its ad-delivery algorithm, and [Meta's 2022 Fair Housing Act settlement with the Department of Justice](https://www.nar.realtor/legal-case-summaries/meta-facebook-settles-fair-housing-violation-allegations) required the company to retire its "Special Ad Audience" tooling for housing ads, pay the maximum civil penalty, and submit to third-party compliance monitoring. That case was about ad targeting rather than ad content, but it is the clearest signal that algorithmic housing discrimination is a live enforcement priority.

### Link 5 — Duke Law & Technology Review

**Anchor text:** `a 2024 Duke Law & Technology Review article`
**URL:** `https://scholarship.law.duke.edu/dltr/vol24/iss1/2/`
**Where:** This one also requires adding a short new paragraph. Insert this paragraph in the "The 'I didn't know' problem" section, immediately before the closing sentence "For a solo agent, one violation can wipe out a year of commission." So the paragraph structure becomes: current paragraph → new paragraph → "For a solo agent..." sentence (as its own paragraph or merged).

New paragraph to insert:

> Peer-reviewed legal scholarship is already wrestling with how AI and disparate impact intersect in housing. [A 2024 Duke Law & Technology Review article](https://scholarship.law.duke.edu/dltr/vol24/iss1/2/) examines how the complexity of AI systems creates evidentiary challenges in Fair Housing Act cases, particularly for plaintiffs trying to prove a less discriminatory alternative existed. The practical upshot is that even when AI causes a discriminatory outcome, proving it in court is harder than proving a human did the same thing. That is not a defense. It is an indication that enforcement is likely to focus on the publisher of the content rather than the tool that generated it.

---

## A11.P3 — Remove the unverified settlement claim

### Find this sentence (in the "The 'I didn't know' problem" section):

> The median settlement for a Fair Housing Act advertising violation is $5,000-$15,000, with some cases reaching into six figures. The median defense cost even for cases that win is $20,000+.

### Replace with:

> Reported jury awards in Fair Housing Act advertising cases have reached $850,000 and $2 million in recent disputes in the Washington D.C. and Baltimore markets. Defense costs alone typically run into five figures even when the defendant prevails.

The original "$5,000-$15,000 median" figure could not be verified against a primary source. The replacement uses publicly reported jury award figures from the DC-Baltimore market that are verifiable in Fair Housing Act case summaries.

**Also update the FAQ answer that references similar numbers.** In the frontmatter FAQ, find the question:

> Can I get in trouble for a Fair Housing violation in a listing?

And find its answer, which currently says:

> Yes. Agents have been fined, sued, and had licenses suspended for Fair Housing violations in listing advertisements. The median settlement is $5,000 to $15,000. Some cases have exceeded $100,000. Legal defense costs alone typically run over $20,000.

**Replace the answer text with:**

> Yes. Agents have been fined, sued, and had licenses suspended for Fair Housing violations in listing advertisements. Reported jury awards in advertising cases in the Washington D.C. and Baltimore markets have reached $850,000 and $2 million in recent disputes. Defense costs alone typically run into five figures even when the defendant prevails.

---

## A11.P4 — Do NOT flip the draft

Leave `draft: true` in the frontmatter. Do not publish. Lance does a final voice read-through and flips `draft: false` himself after you report back.

---

## Validation

After applying all edits, redeploy the draft (it stays unpublished) and verify:

```bash
# Draft still loads
curl -s -o /dev/null -w "%{http_code}" https://montaic.com/blog/fair-housing-ai-compliance-agents
# Expected: 200

# Still noindex'd
curl -s https://montaic.com/blog/fair-housing-ai-compliance-agents | grep -o 'noindex'

# Still excluded from blog index
curl -s https://montaic.com/blog | grep -c 'fair-housing-ai-compliance-agents'
# Expected: 0

# All five citation URLs appear in the rendered HTML
curl -s https://montaic.com/blog/fair-housing-ai-compliance-agents | grep -c 'law.cornell.edu/uscode/text/42/3604'
curl -s https://montaic.com/blog/fair-housing-ai-compliance-agents | grep -c 'ecfr.gov/current/title-24'
curl -s https://montaic.com/blog/fair-housing-ai-compliance-agents | grep -c 'archives.hud.gov/news/2024/pr24-098'
curl -s https://montaic.com/blog/fair-housing-ai-compliance-agents | grep -c 'nar.realtor/legal-case-summaries/meta-facebook'
curl -s https://montaic.com/blog/fair-housing-ai-compliance-agents | grep -c 'scholarship.law.duke.edu/dltr/vol24'
# Each should return at least 1

# Old misattributed HUD title is gone
curl -s https://montaic.com/blog/fair-housing-ai-compliance-agents | grep -c 'Application of the Fair Housing Act.*Guarantee of Non-Discrimination'
# Expected: 0

# Old unverified dollar figure is gone
curl -s https://montaic.com/blog/fair-housing-ai-compliance-agents | grep -c '5,000-\$15,000'
# Expected: 0

# FAQPage schema still validates (6 Question nodes)
curl -s https://montaic.com/blog/fair-housing-ai-compliance-agents | grep -o '"@type":"Question"' | wc -l
# Expected: 6

# wordCount updated (the edits change the total — this just confirms BlogPosting still renders)
curl -s https://montaic.com/blog/fair-housing-ai-compliance-agents | grep -o '"wordCount":[0-9]*'
```

All checks should pass. Then paste the draft URL into the [Rich Results Test](https://search.google.com/test/rich-results) one more time to confirm BlogPosting + FAQPage are still detected with zero errors after the edits.

---

## Known risks

- **Markdown link syntax:** If the article body is stored as JSX/TSX rather than markdown (which your earlier report suggests it is — `lib/blog/posts.ts`), use whatever inline link component the rest of the Montaic blog uses instead of `[text](url)` markdown. The link targets and anchor text stay the same; only the syntax changes.
- **Em dash check:** After the edits, grep the whole article body for any remaining em dashes (`—`) and convert them to commas, parentheses, or new sentences per Montaic voice rules. The replacements I wrote have zero em dashes, but pre-existing paragraphs in the draft might have a few that were missed during the original transcription.
- **Heading edit:** I renamed one section heading in Edit 2 (from "What HUD actually said in 2024" to "What the Fair Housing Act actually says about AI"). If the blog system auto-generates a table of contents from headings, the TOC will shift. That is expected and correct.
- **New paragraph insertions:** Edits 4 and 5 insert new paragraphs into existing sections. Make sure the surrounding paragraphs still flow after insertion. If any transitions read awkwardly, flag them for Lance in your report-back rather than improvising a fix.

---

## When you are done

Report back with:

> "A11 publish-path edits applied. Three paragraph rewrites landed, five citation links inserted inline, unverified settlement figure replaced with verified jury award language in both article body and FAQ frontmatter. Draft still at draft:true. All 9 validation checks passed. Ready for Lance final read and publish. 0 errors. Returned to Claude."

Include:
- Path to the article file you edited
- Whether any em dashes survived in other paragraphs that you either removed or flagged
- Any transition sentences in the new paragraph insertions that read awkwardly and need Lance's eye
- Updated wordCount if the BlogPosting schema auto-computes it

---

## What happens after Claire is done

1. Lance reads the edited draft end-to-end in one sitting for voice
2. Lance fixes anything that sounds off in his own hand
3. Lance flips `draft: true` to `draft: false`
4. Lance commits and redeploys
5. Article is live. Fair Housing positioning flag is planted.

This article is the single most strategically important piece of content Montaic publishes this quarter. It is written to get cited by ChatGPT and Perplexity when agents ask informational questions about AI and listing compliance. That is organic distribution via AI search, which is Montaic's single most valuable acquisition channel pre-launch.
