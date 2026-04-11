# A14: We Ran 53 Nashville Listings Through ChatGPT Pillar Article

**Client:** Montaic
**Action:** A14 (Pillar article, fourth in the blog rotation)
**Roadmap source:** `audits/montaic/implementation/content-calendar.md`, A14 slot, topic #3 promoted 2026-04-10 (alternation policy override, see below)
**Skeleton:** `remediation-template/content-skeletons/pillar-article-skeleton.md`
**Voice rubric:** `remediation-template/voice-rubric-v0.md`
**Neighbor reference (same cluster):** `audits/montaic/implementation/A13-zillow-listings-all-sound-the-same.md`
**Prior cluster reference:** `audits/montaic/implementation/A11-fair-housing-pillar-article.md` and `audits/montaic/implementation/A12-fair-housing-listing-description-rules.md` (Fair Housing cluster, cross-cluster mentions)
**Status:** Phase 1 locked. Phase 2 shipped (three-way dataset at `listing-pipeline-ai/apps/dashboard/scripts/zillow-50-nashville-three-way.json`). Phase 3 shipped (body lives in `posts.ts` entry and `A14-claire-paste-this.md`). Phase 4 shipped (entry landed, `draft: true`). Phase 5 in progress. Lance read staged and approved 2026-04-11. Flip to `draft: false` pending second read and verify-deploy pass.

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

## Phase 2: Research and data generation (SHIPPED)

All four blockers closed. Three-way comparison dataset generated and aggregated.

### Phase 2 outcome

- Extended `grade-zillow-batch.ts` shipped as commit `8009209` on `listing-pipeline-ai/main` with four new modes: `extract-facts`, `rewrite-chatgpt`, `rewrite-montaic`, `aggregate`
- Fact extractor uses `claude-haiku-4-5` with Zod schema. Initial schema capped `key_features` at `max(10)`. During Claire's parallel session the cap was widened to unlimited with a post-parse `slice(0, 15)` so 11-15 feature listings would not fail validation. The three-way dataset was generated under the widened version, so the article text reads "up to 15 key physical features" (not 10).
- ChatGPT run used `gpt-4o-mini` through the OpenAI API with a prompt that approximates what an agent would type. All 53 outputs graded.
- Montaic run used `generateFreeListingContent()` from `lib/free-generator.ts` (the default path, no voice sample). All 53 outputs graded.
- Three-way aggregation lives at `apps/dashboard/scripts/zillow-50-nashville-three-way.json`.

### Headline numbers

- Zillow originals: 4.6 / 10 average
- ChatGPT (gpt-4o-mini): 3.6 / 10
- Montaic (default path): 5.1 / 10
- Delta ChatGPT vs Montaic: 1.5 points

### Category deltas

| Category | Originals | ChatGPT | Montaic |
| --- | --- | --- | --- |
| Specificity | 6.4 | 5.1 | 6.0 |
| Emotional appeal | 4.5 | 4.6 | 4.2 |
| Structure and flow | 4.5 | 4.4 | 5.3 |
| Fair Housing | 5.5 | 4.7 | 6.7 |
| Cliche avoidance | 4.2 | 1.8 | 3.7 |

### Blocker history (archived)

### Blocker 1: Extend the batch grader script. CLOSED.

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

### Blocker 2: Fact extraction reliability. CLOSED.

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

## Phase 3: Draft (SHIPPED)

### Where the body lives

Single authoritative copy of the article body is in `apps/dashboard/lib/blog/posts.ts` at line 1146 (`slug: "chatgpt-53-nashville-listings"`), landed as commit `0ed99f7` on `listing-pipeline-ai/main` on 2026-04-11. The Claire handoff artifact is at `audits/montaic/implementation/A14-claire-paste-this.md` and contains the same body plus the publish-path instructions.

Intermediate work product: `audits/montaic/implementation/A14-draft.md` (Claire's first prose pass, superseded by the handoff file). Temporary artifact: `audits/montaic/implementation/A14-draft-for-voice-read.md` (voice-read extraction file, deleted during Step E cleanup on 2026-04-11).

### Final shape

- 10 sections (including unlabeled opening hook and unlabeled closing)
- 6 FAQs (FAQPage schema)
- 5 citations (A13's stack reused: Zillow 2016, Iowa State 2023, Verbalized Sampling 2025, Price of Format 2025, NAR 2025)
- 3 mentions in schema (A13, A11, A12)
- 4 `about` Things (ChatGPT, Listing descriptions, AI content quality, Real estate marketing)
- 13 min estimated reading time
- ~2300 words (matches target)

### Section headings (as shipped)

1. Opening hook (no heading)
2. How the experiment worked
3. The scorecard
4. What ChatGPT actually produced
5. What Montaic produced on the same facts
6. Why the gap exists
7. What this means for agents already using ChatGPT
8. The honest note on the Montaic numbers
9. Frequently asked questions
10. Closing (no heading)

### Notable Phase 3 decisions

- **Drafting path.** A parallel Claire session drafted the article body directly inside the handoff file (`A14-claire-paste-this.md`) rather than in a standalone draft. This session verified and reviewed the draft after Phase 2 had already completed on the Claire side. The governance trail is: Claire drafted → voice-check passed 4/4 → Lance reviewed via staged URL → Lance approved.
- **"Up to 15 features" factual correction.** An earlier "Step B fix" in this session changed the article text from "up to 15 key physical features" to "up to 10" based on a stale read of the fact extractor schema. The actual extraction ran under Claire's widened schema (`slice(0, 15)`), so 11-15 feature listings were included in the dataset. The text was reverted to "up to 15" before the posts.ts commit landed. Code and article now agree.
- **Honest note section.** Section 8 names the conflict of interest up front: the experiment was run by the person who built Montaic, using Montaic's own grader. Two mitigators named (reproducibility, Montaic did not win every category). This is the So What test passing.
- **Reciprocal mentions.** A14 carries mentions to A13, A11, A12. A13's mentions array is NOT yet updated to point back at A14. That back-prop is deferred until A14 flips from `draft: true` to `draft: false` so A13 does not link to a hidden page during the draft window.

### Voice rubric outcome

Voice check run on `A14-claire-paste-this.md` on 2026-04-11: 4/4 clean (no em dashes, no marketing-prose semicolons, no banned filler phrases in Lance prose, no emojis).

Known-exception zones are the quoted ChatGPT outputs and the filler-frequency data tables. Those are evidence, not voice. The voice-check script accepted them because they live inside quotation marks and percentage data, not in Lance prose.

---

## Phase 4: Schema, handoff, publish (SHIPPED)

### What landed

- **Commit:** `0ed99f7` on `listing-pipeline-ai/main`, pushed 2026-04-11.
- **File touched:** `apps/dashboard/lib/blog/posts.ts` (A14 entry inserted after A13 at line 1146).
- **Secondary file in same commit:** `apps/dashboard/scripts/grade-zillow-batch.ts` (Claire's fact extractor widen from `max(10)` to `slice(15)`, previously uncommitted in working tree).
- **Draft flag:** `draft: true` (intentional, waiting for second-read approval).
- **Build check:** `npx tsc --noEmit` passed exit 0 before commit.

### Schema payload as shipped

- **BlogPosting** via posts.ts transform: headline, description, `publishedAt: 2026-04-11`, `updatedAt: 2026-04-11`, author (Lance Roylo), `citation` array (5 items), `mentions` array (3 items), `about` array (4 Things).
- **FAQPage** with 6 Question / Answer pairs.
- **BreadcrumbList** inherited from the blog post page template.
- **`mentions` array** as shipped:
  - A13 `https://montaic.com/blog/zillow-listings-all-sound-the-same`
  - A11 `https://montaic.com/blog/fair-housing-ai-compliance-agents`
  - A12 `https://montaic.com/blog/fair-housing-listing-description-rules`

### Reciprocal mentions back-propagation (DEFERRED)

A13's `mentions` array needs to add A14 as a sibling, matching the A11/A12 reciprocal pattern from 2026-04-10. The back-prop is deliberately DEFERRED until A14 flips from `draft: true` to `draft: false`, so A13 does not link to a hidden page during the draft window. The edit is one line in `posts.ts` and ships in a separate commit when the flip happens.

### Claire handoff

`audits/montaic/implementation/A14-claire-paste-this.md` committed to neverranked as part of Step E (this commit). The handoff file is the full publish instructions package: pre-flight curls, posts.ts entry, back-prop instructions, report-back checklist.

---

## Phase 5: Voice pass and ship (IN PROGRESS)

### Completed 2026-04-11

1. Voice-check on `A14-claire-paste-this.md`: 4/4 clean.
2. Two factual corrections triaged:
   - Step B error "up to 15" → "up to 10" based on stale schema read, reverted to "up to 15" (matches dataset reality).
   - Step B kept "Six outputs included the literal phrase 'MLS Description:'" (corrected from Claire's "Five". The three-way JSON shows count 6).
3. A14 entry inserted into `posts.ts`, typecheck clean, committed and pushed (`0ed99f7`).
4. Lance read the staged preview at `https://montaic.com/blog/chatgpt-53-nashville-listings` and approved the body.
5. Phase 3 / Phase 4 / Phase 5 governance updates written into this master doc (Step D).
6. Temp voice-read artifact `A14-draft-for-voice-read.md` deleted (Step E).
7. Neverranked commit (this commit): master doc updates, Claire handoff file, first-pass draft artifact.

### Still pending

1. **Lance flips `draft: false`** in `posts.ts`. One-line edit: change `draft: true` to `draft: false` on the A14 entry, commit, push. After this, A14 becomes visible in `/blog` index and sitemap.
2. **A13 mentions back-prop** (blocked until step 1). Add A14 to A13's `mentions` array in the same commit as the flip, or in a follow-up. Either works. Handoff file has the exact snippet to paste.
3. **Run `./scripts/verify-deploy.sh`** against the live URL after the flip lands on Vercel. Confirms 200, confirms the slug is in the sitemap, confirms schema validates.
4. **Rich Results Test** on `https://montaic.com/blog/chatgpt-53-nashville-listings` to confirm BlogPosting and FAQPage both extract cleanly.
5. **Content calendar update** in `audits/montaic/implementation/content-calendar.md`: move A14 from drafting slot to Live slot, open the drafting slot for A15 (Fair Housing topic #2 per the A14 alternation override catchup commitment).
6. **A15 kickoff**: A15 returns to Fair Housing cluster with topic #2 (withdrawn HUD Word List piece) per the Phase 1 override commitment.

---

## Open questions for Lance (ANSWERED)

1. **ChatGPT model version.** Resolved: `gpt-4o-mini`, free-tier model as of April 2026. This is the version most agents are actually using. Documented in the article FAQ.
2. **Montaic mode selection.** Resolved: default product path (no voice sample). The honest comparison. The article names the tradeoff explicitly: Montaic's default path optimizes for structure and compliance and loses slightly on emotional appeal vs ChatGPT (4.2 vs 4.6), and the voice-locked path is where that gap closes.
3. **Article tone on the Montaic numbers.** Resolved: say the numbers, show the work, no softening. Section 8 ("The honest note on the Montaic numbers") names the conflict of interest directly and documents two mitigators (published rubric, Montaic did not win every category).
4. **Publication risk check.** Resolved: no credible OpenAI complaint path. Public Zillow data, documented rubric, reproducible methodology, article cites ChatGPT's strengths where they exist.

---

## Next action

Lance flips `draft: false` on the A14 entry in `posts.ts` after a second read of the staged URL. Same commit (or immediate follow-up) adds A14 to A13's `mentions` array. Then `verify-deploy.sh`, Rich Results Test, content-calendar update, A15 kickoff.
