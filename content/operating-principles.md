# Operating Principles

Internal rules that govern every customer-facing surface NeverRanked
ships. These are not aspirations. They are filters. If a piece of
work does not pass these filters, it does not ship.

---

## 1. The Clarity Principle

**If we're not doing the work, we make it extremely easy for them to understand. From what they have to do, to any kind of report or graphic, to any line of copy.**

Filed: 2026-05-07 by Lance.

### The rule

NeverRanked has a clear product structure: we ship the schema and the deployment via the snippet. Some fixes (heading structure, content gaps, meta tags, og:images, canonical tags) require the customer or their dev to ship the change on their site. We don't.

When that's the case, the customer's experience must be friction-free. They should never have to:
- Look up a technical term to understand what we're asking for
- Guess where in their CMS or codebase the change goes
- Translate "address it to remove the penalty" into an actual action
- Ask us "what does this mean" to make progress

Every roadmap item, every report, every graphic, every dashboard label, every email — written for the level of the least technical buyer in our ICP, then made denser only by progressive disclosure (collapsible "for your dev" sections).

### Why this is the brand differentiator

Most AEO and SEO tools are built by developers, for developers. They surface technical findings as technical findings. The buyer can't act, so they delegate to an agency, who delegates to a dev, who fixes it three weeks later if at all.

NeverRanked's positioning is the opposite. **We ship the work** for everything we can ship via the snippet. For the rest, **we close the gap** so the customer can ship it without translation.

If a competitor's roadmap could ship into our dashboard without feeling wrong (per Hello Momentum's Swap Test), we have failed this principle.

### The three-layer pattern (use this on every roadmap item, every report finding, every email)

**Layer 1. Plain English headline + business outcome.**
What the change is and why it matters, in language any small business owner reads in 5 seconds. No jargon.

> Example: "Add social preview cards to your website"
> Why: "Right now, when your pages are shared on LinkedIn or referenced by ChatGPT, the preview is blank. With this fix, every share shows your branding."

**Layer 2. How to actually do it (platform-specific).**
The customer's actual stack matters. Give them the WordPress / Squarespace / Webflow / Wix / custom-coded path explicitly. If we don't know their stack, ask once and remember.

> Example:
> - WordPress (Yoast or Rank Math): Settings → Social → upload default image
> - Squarespace: Settings → Marketing → SEO → enable preview image
> - Webflow: Page Settings → Open Graph → upload image
> - Wix: SEO Tools → Social Share → upload image
> - Custom-coded: Send this to your developer: `<meta property="og:image" content="...">`

**Layer 3. Technical detail (collapsed by default).**
For the customer's dev or agency. The schema specs, the property names, the validation tools. Available, never in the way.

### How to apply the principle

When working on any customer-facing copy:

1. **Read the first sentence as a non-technical small business owner.** If you stop because of an unfamiliar term, rewrite.
2. **Read the action item.** If you don't know what to do or where to do it, rewrite.
3. **Check the graphic.** If a chart or pill or label requires explanation outside itself, redesign.
4. **Check the assumption stack.** What does the reader need to know already to follow this? Cut every assumption that isn't strictly load-bearing.

### What this is NOT

- This is not "dumb everything down." Technical depth stays available — it just lives in Layer 3, not Layer 1.
- This is not "remove all jargon." Jargon is fine when defined inline or progressive-disclosed. The rule is about ACCESS, not vocabulary.
- This is not "infantilize the customer." Customers know their business. They don't know our technical category. The principle respects their expertise by removing OURS as a barrier.

### When this principle is in tension with brevity

Brevity loses. We can always edit a 3-layer item down. We cannot expand a 1-layer item that has already been delivered as a generic line.

---

## (Future principles get added below)

This file is the canonical home for NeverRanked operating principles. New ones get appended with date filed, the rule, the why, and the application guidance.
