# A14: We Ran 53 Nashville Listings Through ChatGPT Pillar Article

**Client:** Montaic
**Action:** A14 (Pillar article, fourth in the blog rotation)
**Roadmap source:** `audits/montaic/implementation/content-calendar.md`, A14 slot, topic #3 promoted 2026-04-10 (alternation policy override, see below)
**Skeleton:** `remediation-template/content-skeletons/pillar-article-skeleton.md`
**Voice rubric:** `remediation-template/voice-rubric-v0.md`
**Neighbor reference (same cluster):** `audits/montaic/implementation/A13-zillow-listings-all-sound-the-same.md`
**Prior cluster reference:** `audits/montaic/implementation/A11-fair-housing-pillar-article.md` and `audits/montaic/implementation/A12-fair-housing-listing-description-rules.md` (Fair Housing cluster, cross-cluster mentions)
**Status:** Phase 1 locked. Phase 2 open (extended batch script + two new dataset runs).

---

## Cluster alternation override (documented)

The content calendar default policy is to alternate clusters. A11 and A12 were Fair Housing. A13 opened Listing Differentiation. Under default policy, A14 returns to Fair Housing with topic #2 (the withdrawn HUD Word List piece).

**A14 overrides the default and stays in Listing Differentiation.** Three reasons:

1. **One-shot marginal-cost opportunity.** The Nashville 53 dataset was built for A13. Extending it to a second pillar costs one script extension and two grader re-runs. Reviving that dataset in four weeks, after the source listings have rotated off Zillow, costs a full second manual gather. The dataset is perishable. Use it now.
2. **Topic #3 passes the Hello Momentum tests stronger than topic #2.** Topic #2 has heavy primary-source research burden (tracking the HUD Word List withdrawal timeline through FHEO records) and a weak authenticity test (Lance has no personal observation of the list still being handed out). Topic #3 has zero new research burden (dataset already exists), a strong authenticity hook (Lance's A13 observation extended), and names its lever clearly (Contrast plus Specificity).
3. **Cluster compounding.** Shipping two consecutive Listing Differentiation pieces about a month apart signals topical focus to the engines more strongly than one piece plus a cluster pivot. A13 plus A14 forms a coherent cluster pair. A13 alone plus a Fair Housing return dilutes the signal.

**Catchup commitment:** A15 returns to Fair Housing with topic #2 (HUD Word List) as the default-restoration move. If topic #2's research burden is still too heavy at A15 decision time, A15 falls back to topic #2 variant with narrower scope or A15 picks a news-hook piece from the queue.

---

## Phase 1: Frame

### Working title

**We Ran 53 Nashville Listings Through ChatGPT. Here Is What Happened.**

Declarative. Names the dataset size, the market, and the tool under test. Promises a reveal without inflating it. Mirrors A13's title grammar (statement of fact plus parenthetical reveal or period reveal) without copying the structure.

Length: 63 characters. Fits inside a 60 character `<title>` tag with one character of slack. The working version will land as the on-page H1. The `<title>` tag variant is stubbed below.

### Slug

`chatgpt-53-nashville-listings`

Short enough to read. Keyword-dense for the AEO surface ("chatgpt," "nashville," "listings"). Parallels A13's slug style (`zillow-listings-all-sound-the-same`).

### Cluster

**EXISTING cluster: Listing Differentiation (second pillar).**

A13 opened the cluster. A14 compounds it. The cluster thesis is unchanged: every listing description tool on the market was trained on the same MLS boilerplate corpus, so every listing sounds the same, and the only way to write a listing that sounds like you is to use a tool trained on you.

A13 established the thesis with observation plus a single dataset (Nashville 53 original Zillow listings, average 4.6 out of 10). A14 tests the thesis with a controlled experiment: run the same 53 listings through ChatGPT, run them through Montaic, grade all three versions against the same rubric, publish the comparison.

### Creative lever

**Contrast plus Specificity.**

The whole piece is a numbers-on-the-table comparison across three columns. No rhetoric. No argument by inference. Three datasets, one rubric, three averages. Contrast is the lever that makes the piece work (the gap between ChatGPT and Montaic is the revelation). Specificity is the lever that makes the contrast credible (53 listings, one market, one rubric, real scores).

Named lever check: if you cannot name the mechanism, the work has no mechanism. The mechanism here is "same input, three processors, graded output." A reader can describe that in one sentence. That is the lever test passing.

Swap test check: no competitor has run this specific experiment because no competitor has both the grader tool and the willingness to publish the numbers against their own product. If a generic real estate marketing blog published this piece, it would feel wrong because the author would not have the grader or would not be willing to compare their product under its own rubric. The swap test passes.

Authenticity test check: this is an extension of Lance's A13 observation, on a dataset Lance personally helped generate, using a product Lance built. The authenticity test passes.

### Why this topic wins the A14 slot

- **Thesis extension, not thesis repetition.** A13 argued the category-level problem. A14 runs the controlled experiment that proves it. Readers who read A13 get new information from A14 instead of a rehash.
- **One-shot dataset economics.** Running the experiment now costs one script extension. Running it later costs a full second gather. Use the perishable resource while it is fresh.
- **Commercial hook is sharper than A13's.** A13 described the problem. A14 shows the exact delta between the tools. The delta is the sales argument. Readers who land on A14 can see the gap with their own eyes.
- **Product bridge is built into the experiment.** The Montaic column is the product demo. No forced pivot from problem to product. The comparison is the pivot.
- **Schema compounds.** A14 schema carries `mentions` pointing at A13, A11, and A12. The Listing Differentiation cluster becomes a two-node graph instead of a single pillar, which strengthens the topical authority signal noticeably.
- **Passes the Hello Momentum test battery.** Swap, Lever, Authenticity, So What, and Screenshot tests all clear. Does not rely on any competitor trap (Template, Consensus, Trend, Safety, Volume, Pretty, AI).

### The problem the piece describes

Agents are already using ChatGPT to write listing descriptions. The question is not whether they should. The question is what ChatGPT actually produces, how it compares to the Zillow originals on a controlled rubric, and whether the category-trained alternative is measurably different or just marketing noise.

A13 established the category problem through observation plus Zillow's own keyword research. A14 establishes the category problem through a controlled three-way comparison on a single dataset. Same rubric, three processors, measured output.

### The Montaic bridge

The bridge is the third column. ChatGPT is the control for the category average. Montaic is the treatment. The grader is the blind judge. The delta between the ChatGPT column and the Montaic column is the product story, and it is measured instead of claimed.

If the delta is real, the piece is the strongest commercial argument Montaic has ever published. If the delta is not real, Montaic learns something more valuable than a blog post and rebuilds.

---

## Phase 2: Research and data generation (OPEN)

Phase 2 has one new blocker and three closed ones.

### Blocker 1: Extend the batch grader script. OPEN.

**Effort:** ~2 hours of dev time.

**Scope:** add two new modes to `apps/dashboard/scripts/grade-zillow-batch.ts`:

1. **`rewrite-with-chatgpt` mode.** Reads the existing `zillow-50-nashville.txt` input file. For each listing, sends the MLS facts (address, bed/bath count, square footage, key features extracted from the original) to the OpenAI API with a prompt that approximates what an agent would actually type ("write me an MLS description for a three-bedroom two-bath in Nashville with a renovated kitchen"). Collects the 53 ChatGPT-generated descriptions into a new input file (`zillow-50-nashville-chatgpt.txt`). Then grades all 53 through `gradeListing` and writes a parallel summary JSON.

2. **`rewrite-with-montaic` mode.** Same input. Same fact extraction. Calls Montaic's own description generation endpoint (the production path that agents actually use) with the same MLS facts. Collects the 53 Montaic-generated descriptions. Grades all 53. Writes a parallel summary JSON.

**Output files:**
- `zillow-50-nashville-chatgpt.txt` and `zillow-50-nashville-chatgpt-summary.json`
- `zillow-50-nashville-montaic.txt` and `zillow-50-nashville-montaic-summary.json`
- `zillow-50-nashville-three-way.json` (aggregated comparison across all three datasets)

**Decision needed before running:** ChatGPT model version to use. Default recommendation: whichever model the OpenAI free tier and ChatGPT Plus both serve as of April 2026, so the output reflects what an actual agent would get. Document the exact model version in the final article so the experiment is reproducible.

**Owner:** Claude writes the script. Lance approves and kicks off the runs.

### Blocker 2: Fact extraction reliability. OPEN.

The ChatGPT and Montaic modes both need to start from the same MLS facts, not from the original Zillow description text. Otherwise the experiment measures paraphrase quality instead of generation quality.

**Approach:** write a small fact extractor that pulls address, bed count, bath count, square footage, and three to five key features from each original Zillow description. Store the extracted facts as a structured payload. Both the ChatGPT mode and the Montaic mode consume the same structured payload. This is how the experiment becomes controlled instead of noisy.

**Risk:** if the extractor misses a feature or adds a hallucinated one, the ChatGPT and Montaic outputs both inherit the error. Manual spot check on 5 of the 53 extractions before running the full batch.

### Blocker 3: Near-duplicate detection in the new datasets. CLOSED.

The A13 dataset already surfaced one near-duplicate pair in the Zillow originals. The extended script reuses the same near-duplicate pass on the new datasets so the article can report duplicate-rate differences across the three tools as part of the comparison.

### Blocker 4: Citation needs beyond A13's five sources. CLOSED.

A14 reuses A13's citation stack (Zillow 2016, Iowa State 2023, Verbalized Sampling 2025, Price of Format 2025, NAR 2025). No new research. Phase 3 draft reintroduces A13's citations in the opening sections to ground the experiment, then the body of A14 carries the new dataset as the evidence.

### Phase 2 deliverables

- [ ] Extended batch script with `rewrite-with-chatgpt` and `rewrite-with-montaic` modes committed to `listing-pipeline-ai/apps/dashboard/scripts/`
- [ ] Fact extraction pass on 53 originals, manual spot check on 5
- [ ] ChatGPT run completed, summary JSON generated
- [ ] Montaic run completed, summary JSON generated
- [ ] Three-way comparison JSON aggregated
- [ ] ChatGPT model version recorded in a run log for reproducibility
- [ ] Grader scores manually spot-checked on 3 ChatGPT outputs and 3 Montaic outputs to confirm the rubric is grading consistently

---

## Phase 3: Draft (NOT STARTED)

### Target length

Same range as A13 and the pillar-article-skeleton: 2000 to 2400 words. Target 2300.

### Working structure

1. **Opening hook.** Lance observation: after A13 shipped, the obvious next question from every reader was "fine, but what does the ChatGPT version actually look like, and is Montaic any better?" This piece is the answer.
2. **The experiment.** One paragraph describing the three-way setup: 53 Nashville listings, same facts extracted, three processors, one rubric.
3. **Scorecard section.** The three averages. The category averages. The vocabulary deltas. The filler-phrase frequencies per column. This is the numbers-on-the-table spine of the piece.
4. **What ChatGPT actually produced.** Two or three representative ChatGPT outputs with the specific failure modes called out (generic openers, no sensory detail, Fair Housing risk language, feature-list-without-context, manufactured urgency).
5. **What Montaic produced on the same facts.** Two or three representative Montaic outputs with the specific wins called out (specific openers, experience attributes, Fair Housing screened, portal-aware structure).
6. **Why the gap exists.** Recycles A13's "trained on the same corpus" argument in one tighter paragraph, with the new dataset as evidence instead of the older Zillow-only sample.
7. **What this means for agents already using ChatGPT.** Concrete next-step guidance. Not preachy.
8. **What this means for Montaic.** Honest: the experiment was run against our own product. We would have published the numbers either way. The numbers happen to show what they show.
9. **FAQ.** 6 questions, ready for FAQPage schema. Questions should include: "which ChatGPT version did you use," "is this reproducible," "what happens if you run it on a different market," "did you cherry-pick the listings," "what does the rubric actually measure," "can I run my own listings through the grader."
10. **Closing and CTA.** Same Montaic grader CTA as A13, with a line about comparing your own listing against the Nashville average.

### Voice rubric pre-draft checklist

- Zero em dashes.
- Zero semicolons in marketing prose.
- Zero AI filler phrases in Lance's own prose. The full banned list lives in `remediation-template/voice-rubric-v0.md`. Those phrases can appear inside quoted ChatGPT output or inside the grader data tables because those are evidence, not voice, and the voice-check script should be run on the draft body only, with the quoted evidence sections flagged in advance as known exceptions.
- Zero emojis.
- Closing does not restate the intro.
- Does not sound like A13 paraphrased. A14 has to stand on its own as a different kind of piece (experiment, not observation).

---

## Phase 4: Schema, handoff, publish (NOT STARTED)

### Schema block target

Same `@graph` structure as A13:

- **BlogPosting** with headline, description, datePublished, author (Lance Roylo), publisher (Montaic), image, and `citation` array pointing at A13 plus the A13 citation stack.
- **FAQPage** with 6 Question nodes.
- **BreadcrumbList** for Home > Blog > A14.
- **`mentions`** array on the BlogPosting pointing at:
  - A13 (`/blog/zillow-listings-all-sound-the-same`) as the primary cluster sibling.
  - A11 (`/blog/fair-housing-ai-compliance-agents`) for cross-cluster bind.
  - A12 (`/blog/fair-housing-listing-description-rules`) for cross-cluster bind.

### Reciprocal mentions back-propagation

When A14 ships, A13's `mentions` array needs to add A14 as a sibling. Same schema pattern as the A11 and A12 reciprocal update that shipped on 2026-04-10. Document this as a Phase 4 checklist item so the cluster bind stays symmetric.

### Claire handoff

Stub file: `audits/montaic/implementation/A14-claire-paste-this.md`. Create during Phase 4 using A13's Claire handoff as the starting template. Confirm `draft: true` stays until Lance flips it.

---

## Phase 5: Voice pass and ship (NOT STARTED)

Standard sequence:

1. Lance reads the Phase 3 draft end to end out loud.
2. Run `./scripts/voice-check.sh` on the draft file. Four checks clean.
3. Commit the Phase 4 updates to the master doc.
4. Paste Claire handoff.
5. Claire wires schema and creates the file with `draft: true`.
6. Lance flips `draft: false` after a second voice read of the live staging copy.
7. Run `./scripts/verify-deploy.sh` and Rich Results Test.
8. Update `content-calendar.md`: move A14 to Live slot, open the drafting slot for A15.

---

## Open questions for Lance

These are not blocking Phase 2 but should be answered before Phase 3 drafts start.

1. **ChatGPT model version.** Which model does the experiment target? The default is "whichever version the free tier serves as of the run date, because that is what agents actually use." Alternative is "the paid tier model, because that is what the strongest ChatGPT users have access to." Pick one before the run, document the choice in the article.
2. **Montaic mode selection.** Does the Montaic run use the default product path (whatever an agent gets when they sign up today) or does it use a writing-style-locked path that requires a voice sample upload? The default path is the honest comparison. The voice-locked path is the stronger product story. Recommend the default path with a one-paragraph note in the article that voice-locked output would score even higher.
3. **Article tone on the Montaic numbers.** If Montaic beats ChatGPT by a large margin, is the article allowed to say so directly, or does the house style require softening? Recommend: say the numbers, show the work, let the reader form the opinion. No softening.
4. **Publication risk check.** If ChatGPT scores embarrassingly low, does OpenAI have any credible complaint? Answer: no, the experiment is on public Zillow data using a documented rubric with reproducible methodology, and the article cites ChatGPT's strengths where they exist. Publish as is.

---

## Next action

Phase 2 Blocker 1: extend `grade-zillow-batch.ts` with the two new modes. Claude writes, Lance approves, Lance kicks off the runs.
