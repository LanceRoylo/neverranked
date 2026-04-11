# A13: Why Zillow Listings All Sound the Same Pillar Article

**Client:** Montaic
**Action:** A13 (Pillar article, third in the blog rotation)
**Roadmap source:** `audits/montaic/implementation/content-calendar.md`, A13 slot, topic #1, promoted 2026-04-10
**Skeleton:** `remediation-template/content-skeletons/pillar-article-skeleton.md`
**Voice rubric:** `remediation-template/voice-rubric-v0.md`
**Neighbor reference (cluster only):** none. A13 opens the Listing Differentiation cluster.
**Prior cluster reference:** `audits/montaic/implementation/A11-fair-housing-pillar-article.md` and `audits/montaic/implementation/A12-fair-housing-listing-description-rules.md` (different cluster, same pipeline and voice pattern)
**Status:** Phase 1 locked, Phase 2 blocked on grader run + source hunt

---

## Phase 1: Frame

### Working title

**Why Zillow Listings All Sound the Same (And Why It's Costing Agents Leads)**

Declarative. Names a specific portal (Zillow) so the piece has a concrete target. Second clause commits to a revenue hook, not a compliance hook. First Montaic piece to lead with leads instead of risk.

### Slug

`zillow-listings-all-sound-the-same`

### Cluster

**NEW cluster: Listing Differentiation.**

A11 and A12 built the Fair Housing cluster. A13 opens Listing Differentiation as the second Montaic cluster. Per the content calendar's cluster alternation default, A14 or A15 returns to Fair Housing with topic #2 (the withdrawn HUD Word List piece).

Listing Differentiation cluster thesis: every listing description tool on the market was trained on the same MLS boilerplate corpus, so every listing sounds the same, and the only way to write a listing that sounds like you is to use a tool trained on you.

### Creative lever

**Outsider triangulation.**

Lance has three vantages at once that no competing voice in the real estate content space has:

1. **Coffee shop operator.** Years of running a physical business where the product is hospitality and the margin is tiny. Trains an ear for generic-sounding marketing copy.
2. **Photography and video.** Professional eye for composition, light, and the moment a listing photo stops being "a photo of a house" and starts being "a reason to click."
3. **Active Redfin and Zillow browser.** Casual consumer of real estate listings, not just a builder of tools that write them. Notices patterns as a reader, not as an industry insider.

Named lever: no competitor who writes about listing description quality has all three of these vantages. The swap test passes: if a generic real estate marketing blog published this piece, it would feel wrong because the author would not have the coffee-shop ear or the photographer's eye. The piece has to be read in Lance's voice to make sense.

### Why this topic wins the A13 slot

Pulled directly from the content calendar ranking rationale:

- **Clearest commercial hook.** Leads, not compliance. First Montaic piece to lead with revenue instead of risk. Expands what the blog can sell.
- **Opens a new cluster.** Does not cannibalize A11 and A12's Fair Housing keyword surface. Expands Montaic's topical authority instead of stacking it.
- **Authentic.** Lance actually noticed this from browsing Zillow and Redfin. Not research-sourced. Passes the authenticity test.
- **Product bridge is built in.** "Montaic writes in your writing style" is the literal answer to the problem the piece describes. No forced pivot from problem to product.
- **No new legal research.** Unlike Fair Housing deep-dives, this piece can be written from observation plus the existing Montaic grader output. Lower research burden than A11 or A12.
- **Passes the swap test.** No competitor has Lance's three vantages at once, so no competitor could write this specific piece without it feeling wrong.

### The problem the piece describes

Every Zillow listing description opens the same way. The opening is almost always a variation of the same three or four phrases: welcoming the buyer, calling the house beautiful, invoking pride, or marking the property as a chance the reader cannot afford to miss. (The actual phrases appear in `remediation-template/voice-rubric-v0.md` as banned AI filler. The piece will call them out by name in the body during Phase 3 drafting, noted here so the voice-check script does not flag this Phase 1 doc.) The boilerplate corpus is so small that a reader who scrolls 20 listings sees the same opening pattern 15 times. This is not the agents' fault. It is that every listing description tool on the market (ChatGPT included) trained on the same MLS corpus and produces the same averaged phrasing by default. The fix is not "write better." The fix is "use a tool that trained on your writing instead of the average writing."

### The Montaic bridge

Montaic writes in your writing style. That is the literal product feature, and it is the literal answer to the problem this piece describes. The bridge does not need to be constructed. It needs to be surfaced at the right moment (after the reader understands the scope of the generic-phrasing problem, before the closing CTA).

---

## Phase 2: Research (BLOCKED on two inputs)

### Required citations (exactly 5 per pillar-article-skeleton rule)

Five external primary-source citations, no fewer. Candidates flagged below. Final list confirmed during Phase 2.

1. **Comparative textual analysis of top 50 Zillow listings in a mid-size market.** Original Montaic research, generated by running 50 listings through the grader and counting the frequency of opening phrases, filler words, and structural patterns. This is the piece's headline data point. It is also Phase 2 blocker #1.
2. **Scroll-depth or attention-economy research tied to real estate portal behavior.** Candidate sources: NAR's Home Buyers and Sellers Generational Trends report, Zillow's consumer behavior research, any third-party real estate analytics firm (e.g., Parcl, AltSensor, Redfin Data Center). The claim "costing agents leads" needs at least one source linking listing quality to conversion behavior. Phase 2 blocker #2.
3. **NAR Code of Ethics Article 12 (advertising and truthfulness in listing content).** Already a live citation in A12. Reused here to thread Fair Housing discipline through the differentiation argument (you can sound distinctive AND still be compliant).
4. **A published piece on LLM training data homogeneity.** Candidate sources: a Stanford HAI paper on LLM output similarity, an MIT study on AI content convergence, or a peer-reviewed piece on "mode collapse" in generative models. The underlying technical claim is that averaged training data produces averaged output. Citation 4 supports the "this is not the agents' fault, it is the tool" move.
5. **One of: Redfin Data Center, Zillow Research, or a listing agent industry survey on time-on-market.** Ties generic listings to a measurable business outcome other than leads (days on market, price reduction frequency, listing-to-sale ratio).

### Phase 2 blockers

**Blocker 1: Run 50 listings through the Montaic grader.**
- Effort: ~2 hours of tool time. Can run in background while Phase 2 research happens on the citation side.
- Output: a spreadsheet of opening phrases, filler word counts, sentence length distributions, and Fair Housing hits across 50 listings from a single mid-size market (Nashville, Austin, or Charlotte candidates). Mid-size market avoids the coastal bias and makes the data less disputable.
- Owner: Lance. Or Claude can script the run if the grader has an API or batch input mode (flag to confirm in Phase 2 kickoff).

**Blocker 2: Find a credible source linking listing description quality to lead conversion.**
- If the source exists, the frame is "costing agents leads" and the piece is strongest.
- If only a "time on market" or "price reduction frequency" source exists, the frame softens to "costing agents attention" or "costing agents days on market."
- If no credible source exists at all, the frame becomes "sounding the same" and the commercial hook moves from the headline to the FAQ section. This is the weakest fallback but still works.
- Owner: Claude (search), Lance (judgment call on whether the sources found are strong enough).

### Phase 2 deliverables

- Final 5-citation list confirmed with URLs
- Grader output spreadsheet saved to `audits/montaic/implementation/A13-grader-data.md` or similar
- Headline data point extracted (e.g., "37 of 50 Zillow listings in Nashville opened with 'Welcome home' or 'Beautiful'")
- Frame decision locked: "costing leads" vs "costing attention" vs "sounding the same"

---

## Phase 3: Draft (not started)

Phase 3 does not start until Phase 2 unblocks. The A11 and A12 pattern is that Phase 3 drafts the full pillar article in Lance's voice against the skeleton, then Phase 4 does the voice pass and schema handoff.

### Skeleton section checklist (pre-filled)

Tick each as it's drafted. Order matches `remediation-template/content-skeletons/pillar-article-skeleton.md`.

- [ ] Title (declarative, specific stakes)
- [ ] Meta description (<=155 chars, does not repeat title phrase)
- [ ] Summary paragraph (80-150 words)
- [ ] Section 1: The problem (every Zillow listing opens the same way, data from grader run)
- [ ] Section 2: Why this happens (LLM training data homogeneity, citation 4)
- [ ] Section 3: What it costs (leads or attention or days on market, citation 2 or 5)
- [ ] Section 4: What it is NOT (agent skill, writing talent, effort)
- [ ] Section 5: What actually fixes it (tool trained on you, not on the corpus)
- [ ] Section 6: What Montaic does differently (product section, first-person origin)
- [ ] Section 7: The Fair Housing discipline thread (you can sound distinctive AND stay compliant, citation 3)
- [ ] FAQ (5-8 questions, marked up as FAQPage schema)
- [ ] Closing + CTA

### Voice rubric pass (pre-publish)

Run `remediation-template/voice-rubric-v0.md` and `./scripts/voice-check.sh` on the draft file. Confirm each hard-fail is clean:

- [ ] Em dash count: 0
- [ ] Semicolon count in marketing prose: 0
- [ ] AI filler phrase scan: clean
- [ ] Meta description does not start with title phrase
- [ ] No emojis in body
- [ ] Closing does not restate the intro
- [ ] Swap test: would it feel wrong if a competitor published it? (If no, rewrite.)
- [ ] Lever test: can you name the creative lever? (If no, rewrite.) Expected answer: outsider triangulation.

---

## Phase 4: Schema, handoff, publish (not started)

Same pattern as A11 and A12. Three-part deliverable:

1. **Schema block** in the master doc using a single `@graph` payload (BlogPosting + FAQPage + BreadcrumbList). Include the `citation` array with all 5 primary-source URLs, verified reachable via `verify-deploy.sh` Check 7 before handoff.
2. **Claire handoff** at `audits/montaic/implementation/A13-claire-paste-this.md`. Same structure as `A12-claire-paste-this.md`. Dynamic OG image URL wired in: `/og?title={url-encoded-title}&subtitle=Montaic%20Blog&type=blog`. `draft: true` held until Lance says go.
3. **Cluster binding.** A13 should bind to A11 and A12 via `hasPart` or `mentions` on the Montaic Organization entity, even though A13 opens a new cluster. A11 and A12 should be updated to reference A13 as `relatedLink` once A13 ships. Flag this as a small post-publish task for the A13 verify-deploy step.

## Schema required

- BlogPosting (primary)
- FAQPage (from the FAQ section)
- BreadcrumbList
- citation array with the 5 external primary sources

All three schema types in a single `@graph` payload on the page. Match the pattern in A11 and A12.

## Verification

After publish, from the neverranked repo root:

```sh
./scripts/verify-deploy.sh \
  https://montaic.com/blog/zillow-listings-all-sound-the-same \
  https://montaic.com/blog \
  https://montaic.com/sitemap.xml
```

Expected: 7/7 checks pass (all 7 since A13 will include a citation array from Phase 1). Then paste the Rich Results Test URL printed by the script and confirm 0 errors on the live URL.

Record the pass date in `audits/montaic/implementation/README.md` Month 2+ content status table.

---

## Draft notes

Scratch space. Delete before the piece ships.

### The opening observation Lance had

Browsing Zillow or Redfin on a weeknight, every listing reads the same. The openings blur together within five or six listings. By the tenth, the reader has stopped reading openings entirely and is scrolling straight to the photos. (Phase 3 will quote specific examples in the body. Those examples are held out of this Phase 1 doc so voice-check does not flag them as if Lance wrote them.) That scroll-past behavior is the mechanism the piece needs to name. The agent's listing description is not winning attention because it is averaged phrasing competing against 49 other averaged phrasings.

### Candidate headline data points (post-grader-run)

Speculative. Actual numbers come from the grader. Examples of what the piece might say:

- "37 of the top 50 Zillow listings in {market} open with 'Welcome home' or 'Beautiful'"
- "The median listing description has 4.2 words in common with every other listing description in the same market"
- "Only 3 of 50 listings had an opening sentence that did not appear verbatim in at least one other listing in the same market"

Any of these would be a headline-worthy data point. The grader run tells us which one is true.

### Tension to resolve in Phase 3

The piece argues that all listings sound the same, including ones that use ChatGPT. But A12 is a Fair Housing compliance piece that treats ChatGPT as a compliance risk. A13 needs to thread these so the reader does not think Montaic is incoherent. The thread: ChatGPT is both a compliance risk AND a voice homogenizer. Both are problems. Both get fixed by using a tool trained on you instead of on the corpus.

### Open Phase 1 questions

- Which mid-size market for the grader run? (Nashville, Austin, Charlotte, or a Lance-chosen market where Montaic has at least one existing user)
- Does the grader have a batch mode, or does each listing need to be pasted manually? (Affects whether Claude can automate Phase 2 blocker 1)
- Is there a Montaic user who has consented to having their pre-Montaic listings analyzed for the "before" side of a before/after? This would make the piece land harder than pure third-party analysis.
