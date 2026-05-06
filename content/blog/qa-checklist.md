# Three-Layer QA Checklist

Every blog post passes three QA layers before it ships. This is the
human-readable version of what the dashboard's existing 3-pass
content validation does for client content drafts. Same posture,
adapted for blog posts on neverranked.com.

Run all three layers in order. Do not skip layers. A post that
fails any layer goes back to draft and gets reworked.

---

## Layer 1: Factual grounding

The "is everything in this post actually true and supportable" pass.

### Checks

- [ ] Every statistic has an inline citation linking to a source
  in `sources.md` (or to a fresh source you have just vetted)
- [ ] No "studies show" or "research suggests" without a linked
  study
- [ ] No "industry leaders agree" or "experts say" without naming
  the specific leaders or experts
- [ ] All citation dates are within 24 months for stats. Older is
  acceptable for foundational research, definitions, principles.
- [ ] Every external link works (no 404s)
- [ ] Every internal link points at the correct slug (no dead
  internal references)
- [ ] No fabricated examples ("a financial advisor in Honolulu
  saw a 40% increase" without a source = fabricated)
- [ ] Vertical-specific claims (e.g., "62% of dentists do X") are
  backed by a vertical-specific source from `sources.md`
- [ ] The Forbes Best-in-State, Pew Research, BrightEdge type
  claims actually link to those sources, not to a secondary
  blog quoting them
- [ ] No AI hallucinated stats (verify any number that was generated)

### Disposition

- **Pass:** Every statistic and named example has a working source.
- **Fail:** Send back. Fix unsupported claims by either (a) finding
  a source, (b) rephrasing to remove the unsupportable claim, or
  (c) cutting the section entirely.

---

## Layer 2: Tone and voice

The "does this sound like Never Ranked" pass.

### Checks

- [ ] Zero em dashes anywhere in the body, headings, or alt text
  (run: `grep -c "—" blog/[slug]/index.html` should be 0)
- [ ] Zero semicolons in marketing copy (CSS is fine, prose is not)
- [ ] Zero banned words: transform, unlock, empower, elevate,
  leverage, seamless, cutting-edge, dominate, "Welcome to",
  "We help you", "Era" (when used as a category modifier)
- [ ] H1 uses the italic-Playfair signature on the key word
- [ ] Pull quotes (if any) use italic Playfair
- [ ] No "In today's fast-paced world", "In an era of", "As we
  navigate", or any variant
- [ ] No "excited to announce", "thrilled to share", or any
  enthusiasm-bait opener
- [ ] First-person plural ("we", "our") is used consistently for
  Never Ranked perspective. Switching between "we" and "the
  Never Ranked team" reads as inconsistent.
- [ ] Specific over generic: "Apple Intelligence on iPhone Safari"
  beats "AI assistants"
- [ ] Numbers wherever possible: "1.2 percent" beats "a small
  percentage"

### Disposition

- **Pass:** Voice is consistent throughout. No banned content.
  Reads like Never Ranked.
- **Fail:** Send back. Fix the specific violations. Most fixes are
  one-line replacements.

### Voice quick reference

```
em dashes:        replace with periods or commas
semicolons:       replace with periods (split into two sentences)
"transform":      "change", "shift", "move"
"leverage":       "use", "apply"
"unlock":         "open", "reach", "make available"
"In today's...":  delete entirely, start with the substantive claim
"In an era...":   same, delete
"Welcome to":     never the opening word, start with substance
"We help you":    "we ship", "we deploy", "we track" (action verbs)
```

---

## Layer 3: Quality gate

The "is this a post worth publishing" pass.

### Checks

#### Strategic checks

- [ ] **Swap Test:** Replace "Never Ranked" with any competitor name.
  Does the post still make sense? If yes, the post is too generic.
  Add specificity (named engines, named queries, named numbers).
- [ ] **So What Test:** Read the headline aloud. Does the audience
  have a reason to care? If "so what" is the honest reaction, the
  hook is missing.
- [ ] **Lever Test:** Name the named creative lever the post uses
  (Reframe, Specificity, Confession, Tension Hold, Format Surprise,
  Visible Mechanic). If you cannot name it, the post has no
  mechanism. Fix.
- [ ] **Conversion path is clear:** The CTA at the bottom points
  somewhere specific (check.neverranked.com / the audit / a
  follow-up post). No vague "learn more" or "contact us today."

#### Structural checks

- [ ] H1, then H2 sections in order, no H1s in the body
- [ ] Word count between 1500 and 2500
- [ ] FAQ section present with 6 to 10 questions
- [ ] Each FAQ answer is 2-4 sentences and self-contained (passes
  the **standalone test**: read just the answer, does it make
  sense without the question? If yes, AI engines can cite it.)
- [ ] At least 2 internal links to other Never Ranked posts
- [ ] At least the minimum citation count for the archetype
  (vertical playbook: 3, category education: 5, conversion: 3)
- [ ] Pull quote or section break every 400-500 words (no
  walls-of-text)
- [ ] CTA in the second-to-last section (last is byline)

#### Schema checks (run via grep / inspector)

- [ ] `Article` schema present, complete with author, published,
  modified, image, wordCount
- [ ] `FAQPage` schema present, mainEntity array matches the
  visible FAQ section exactly
- [ ] `Person` schema for author with name, sameAs links, jobTitle
- [ ] `Organization` schema (Never Ranked) present
- [ ] `BreadcrumbList` schema present (Home > Blog > Post)
- [ ] All schema in one `<script type="application/ld+json">`
  block in the head, using the `@graph` pattern

#### Mobile and performance

- [ ] Page weight under 200KB total (run a network panel check)
- [ ] No render-blocking font load (uses the async-swap pattern
  inherited from the existing blog post template)
- [ ] All tap targets at least 44x44 (inherits from the
  mobile-fix baseline applied to all pages)
- [ ] No horizontal overflow at 375px viewport

### Disposition

- **Pass:** All structural, strategic, and technical checks pass.
  Ship.
- **Fail (strategic):** Send back to draft. Strategic failures
  are the hardest to fix. Almost always means the post is too
  generic and needs a named lever, named numbers, or a specific
  reframe.
- **Fail (structural / schema / performance):** Quick fix, usually
  one or two lines of HTML or one schema block to add. Re-run
  Layer 3 after.

---

## Final disposition

Only when all three layers pass:

1. Save the post to `blog/[slug]/index.html`
2. Commit with message: `Blog: <slug> - <one-line summary>`
3. Push to origin (auto-deploys to neverranked.com via Cloudflare)
4. Update `content/blog/calendar.md`: move the post from "Planned"
   to "Posted" with the live URL and the date
5. Update `content/blog/verticals.md`: change the vertical's status
   to ✅ posted

---

## Common failure patterns and fixes

| Failure | Symptom | Fix |
|---|---|---|
| Word count too low | 800 words, looks thin | Add a section. Usually the "what to do" or "how to spot the gap" section is missing. |
| Word count too high | 3500 words, reader fatigue | Cut the redundant sections. Often two paragraphs say the same thing in different words. |
| FAQ too generic | "What are the benefits of AEO" | Replace with a specific buyer query. "Do I need AEO if I rank #1 on Google?" |
| Citation gaps | "Studies show 40% of buyers..." with no link | Find a source (BrightEdge, Pew, vertical-specific). If no source, rephrase: "Many buyers..." |
| Voice drift | Reads like ChatGPT | Run grep for em dashes and banned words. Rewrite the offending sentences in the editorial Never Ranked voice. |
| Swap Test fail | Post works for any AEO agency | Add a specific reference: a Never Ranked product feature, a specific stat we own, a named customer (anonymized if needed) |
| No named lever | "Just a list of facts" | Pick a lever (Reframe, Specificity, etc.) and rewrite the opener and conclusion to lean on it |
| Conversion path vague | "Learn more about Never Ranked" CTA | Replace with a specific action: "Free six-engine scan at check.neverranked.com" |

---

## Time budget per layer

For a typical 2000-word vertical playbook post:

| Layer | Time |
|---|---|
| Layer 1 (factual grounding) | 15-20 min |
| Layer 2 (tone and voice) | 5-10 min |
| Layer 3 (quality gate) | 10-15 min |
| **Total QA time** | **30-45 min** |

The drafting time is separate (1-2 hours for a strong post).
Total per-post production budget: 1.5 to 3 hours, mostly drafting.

---

## When to defer to dashboard 3-pass

Future state: blog posts will flow through the dashboard's
existing 3-pass validation pipeline (the same one that handles
client content drafts). When that integration ships:

- Layer 1 (factual grounding) becomes automated by the dashboard's
  factual-grounding pass
- Layer 2 (tone and voice) becomes automated by the dashboard's
  tone check
- Layer 3 (quality gate) stays mostly manual since it is the
  strategic / editorial layer that benefits from human judgment

Until that integration ships, run all three layers manually using
this checklist.
