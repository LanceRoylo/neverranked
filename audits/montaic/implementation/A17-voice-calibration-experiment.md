# A17: We Gave Montaic a Style Sample and Ran the Same 53 Listings Again Pillar Article

**Client:** Montaic
**Action:** A17 (Pillar article, seventh in the blog rotation)
**Roadmap source:** `audits/montaic/implementation/content-calendar.md`, A17 slot, Candidate D promoted from A16 rescoring block 2026-04-11
**Skeleton:** `remediation-template/content-skeletons/pillar-article-skeleton.md`
**Voice rubric:** `remediation-template/voice-rubric-v0.md`
**Neighbor references (same cluster):** `audits/montaic/implementation/A13-zillow-listings-all-sound-the-same.md`, `audits/montaic/implementation/A14-chatgpt-53-nashville-listings.md`, and `audits/montaic/implementation/A16-96-percent-chatgpt-opening.md`
**Cross-cluster references:** `audits/montaic/implementation/A12-fair-housing-listing-description-rules.md` and `audits/montaic/implementation/A15-hud-2026-guidance-withdrawal.md`
**Status:** Phase 4 COMPLETE (2026-04-11). Claire handoff at `A17-claire-paste-this.md`. Draft at `A17-draft.md`, 2370 words, voice-check 4/4 clean. Phase 2 CLOSED: voice-locked avg 6.9/10 (vs 5.1 default, +1.8 lift), 42/53 in 7-8 bucket. Next: Lance voice pass, then flip to live.

---

## Cluster alternation (override)

The content calendar default policy is to alternate clusters. A16 just shipped as Listing Differentiation (third pillar). The default would return to Fair Housing for A17.

**Override rationale:** A17 is the promised follow-up experiment from both A14 and A16. A14's closing section said the voice-locked path is where the gap widens further. A16's closing section said the next piece will run the voice-locked version of the Nashville 53 experiment. Both pieces explicitly teased this experiment by name. Shipping a Fair Housing piece before delivering the promised follow-up breaks the narrative arc of the Listing Differentiation cluster and leaves two live pieces pointing at a piece that does not exist yet.

Listing Differentiation stays in the slot for A17. Fair Housing returns for A18 (Candidate F from the A16 rescoring block, the Q3 2026 news-hook follow-up, earliest eligible after July 1 2026).

News-hook policy: A17 is evergreen. No news-hook slot consumed.

---

## Phase 1: Frame

### Working title

**We Gave Montaic a Style Sample and Ran the Same 53 Listings Again. Here Is What Changed.**

Declarative. Names the method (style sample), names the continuity (same 53 listings), and promises a measurable result without spoiling it. Mirrors A14's grammar ("We Ran 53 Nashville Listings Through ChatGPT. Here Is What Happened.") and compounds A16's promise.

Length: 76 characters in the H1 form. Over the 70-char soft limit. Meta title variant will tighten in Phase 4. Working version is slot-held.

Alternative titles considered:

1. "We Gave Montaic a Style Sample and Ran the Same 53 Listings Again. Here Is What Changed." (current, continuity-first)
2. "The Voice-Locked Experiment: What Happens When AI Has a Writing Sample to Copy" (mechanism-first, less specific)
3. "Same 53 Listings, Fourth Dataset: The Montaic Voice Calibration Results" (data-first, dry)

Current working version wins because it echoes A14 directly and the reader who read A14 or A16 recognizes the callback.

### Slug

**Working:** `montaic-voice-calibration-53-nashville`

Alternative candidates:

1. `montaic-voice-calibration-53-nashville` (direct, names both the feature and the dataset)
2. `voice-locked-listing-experiment` (mechanism-first)
3. `same-53-listings-voice-sample-results` (continuity-first)

Slug locks in Phase 4. Working version is slot-held.

### Cluster

**EXISTING cluster: Listing Differentiation (fourth pillar).**

A13 opened with the observation thesis. A14 tested it with a three-way experiment. A16 sharpened the finding to the 96 percent opening and the three-sentence rule. A17 tests whether the tool that already scored highest in A14 can score even higher when given a concrete style reference. This is the climax of the cluster arc: if the voice-locked path does not meaningfully lift the distribution above default, the product argument weakens. If it does, the cluster has a four-piece narrative from diagnosis to treatment.

### Creative lever

**Controlled Follow-up Experiment plus Numbers on the Table.**

Named mechanism: "take the identical Nashville 53 dataset, run a fourth column through the voice-locked path using the five strongest Zillow originals as the style sample, grade all 53 outputs against the same rubric, and publish the four-column comparison with the new data alongside the three existing columns."

**Swap test check:** no competitor has the Nashville 53 three-way dataset, let alone a four-way version with a voice-locked column. The experiment cannot be replicated without access to Montaic's voice calibration infrastructure. Swap test passes at max.

**Authenticity test check:** partial, with a named limitation. Lance did not write the style sample listings. The five Zillow originals are public listings written by Nashville agents. The experiment tests the mechanism (does giving the tool a style reference lift the scores?) rather than the personal-voice claim (does the tool sound like you?). The piece names this distinction directly in the opening section and does not overclaim. The authenticity test passes at medium-to-strong because the experiment is real, the data is real, and the limitation is named.

**Limitation named in the piece:** the ideal experiment uses the agent's own past listings as the style sample. This experiment substitutes the five best-scoring Zillow originals from the Nashville dataset because the author is not a practicing agent and does not have a personal MLS listing history. The experiment tests mechanism, not personalization. The piece says so. The reader who wants to test personalization can upload their own listings and compare.

**So What test check:** strong. The Monday-morning action is: upload 5 of your past listings, run the voice-locked path on your next listing, and compare the output against what the default path produces. The experiment gives agents a measured baseline to compare against.

**Lever test check:** Controlled Follow-up Experiment plus Numbers on the Table is the same lever family as A14 (Contrast plus Specificity). A17 adds the follow-up dimension: the reader already knows the A14 baseline, so the new column's delta is immediately meaningful.

Hello Momentum four-test battery: passes at strong level. Authenticity is the one test where the pass is medium-to-strong rather than max, and the limitation is named rather than hidden.

### Why this topic wins the A17 slot

- **Delivers the promised follow-up.** A14 and A16 both tease this experiment by name. Shipping it closes the open loop.
- **Fourth Listing Differentiation pillar.** Cluster reaches four pieces, compounding topical authority.
- **Strongest product-bridge piece in the backlog.** This is the piece that shows the paid feature (voice calibration) working on real data. The commercial argument for Montaic goes from "our default is better than ChatGPT" to "our default is better AND the personalized path is better still."
- **Reuses existing infrastructure.** Nashville 53 dataset, grader, and comparison framework all exist from A14.
- **Named limitation makes it more credible, not less.** The piece that says "we could not run the ideal experiment, so we ran the closest available version and named the difference" is more trustworthy than the piece that pretends the substitute is the real thing.

### The problem the piece describes

A14 and A16 established that ChatGPT's outputs collapse toward a single quality bucket (3-4 out of 10) and that Montaic's default path scores higher (average 5.1 versus 3.6) with two outliers reaching 7/10. A16 introduced the three-sentence rule as the variable separating the outliers from the baseline.

The open question from both pieces is: what happens when the tool has a concrete style reference to pull from instead of defaulting to its trained patterns? The default path produced two 7/10s with generic "Exceptional" openings rescued by body specificity. If the voice-locked path has a style sample to reference, does the opening word change? Does the score distribution shift upward? Does the three-sentence rule become easier to satisfy?

A17 answers those questions with data.

### The experiment design

**Style sample source:** the five highest-scoring Zillow originals from the Nashville 53 dataset.

**Selection criteria:**
1. Overall score 5/10 or higher on the Montaic grader
2. Specificity sub-score 6/10 or higher
3. No Fair Housing flags in the grader's top issues
4. Distinctive opening (does not open with a template greeting or a generic adjective)

The five selected listings become the style sample input to the voice-locked path. The voice calibration layer extracts phrasing patterns, structural choices, and vocabulary preferences from the five, and applies those as constraints on the writing layer.

**Why Zillow originals rather than Montaic outputs:** using Montaic's own outputs as the style sample would be circular. The tool would be calibrating against its own trained patterns and the delta would reflect self-reinforcement, not style adaptation. Using the Zillow originals tests whether the tool can learn from external writing samples, which is the actual product claim.

**Why this is not the ideal experiment:** the ideal experiment uses the agent's own past MLS listings as the style sample. The voice-locked path is designed for that use case. This experiment substitutes the best available public listings from the same dataset because the author is not a practicing agent. The mechanism being tested (does a concrete style reference lift the quality distribution?) is the same. The personalization dimension (does the output sound like a specific agent?) is not tested. The piece names this distinction.

**Run parameters:**
- Same 53 Nashville listings used in A14, A16
- Same structured facts payload (bed count, bath count, square footage, neighborhood, up to 15 key features)
- Voice-locked path with the five-listing style sample
- Same five-category grader rubric (specificity, emotional appeal, structure and flow, Fair Housing compliance, cliche avoidance)
- Output: 53 graded listings forming the fourth column

**Comparison framework:** four-column table.
- Column 1: Zillow originals (A14 data, reused)
- Column 2: ChatGPT gpt-4o-mini (A14 data, reused)
- Column 3: Montaic default (A14 data, reused)
- Column 4: Montaic voice-locked (new data, A17)

### The Montaic bridge

This is the strongest product-bridge piece in the Listing Differentiation cluster. The bridge is the delta between Column 3 (Montaic default, average 5.1) and Column 4 (Montaic voice-locked, TBD). If the voice-locked path scores meaningfully higher, the product argument layers:

1. A14 proved: Montaic default beats ChatGPT (5.1 vs 3.6).
2. A16 proved: ChatGPT's distribution collapses entirely (zero above 4/10).
3. A17 proves (if the data supports it): the voice-locked path beats the default path, widening the gap further.

The commercial CTA writes itself: the default path is free to try. The voice-locked path is the upgrade. The four-column table is the evidence.

**If the data does NOT support it:** the piece publishes the numbers anyway. If the voice-locked path does not meaningfully lift the distribution, the piece says so and the analysis shifts to understanding why. An honest negative result is more valuable than a fabricated positive one, and the HM authenticity test explicitly requires publishing the data regardless of whether it helps the sales argument. A14 already set this precedent by publishing that ChatGPT beat Montaic on emotional appeal.

---

## Phase 2: Research

Phase 2 has one data-generation blocker and two lightweight blockers. Total budget: 3 to 4 hours, of which 2 hours is tool runtime.

### Blocker 1: Select the five Zillow originals for the style sample. CLOSED.

**Effort budget:** 30 minutes. Actual: ~20 minutes.

**Selection criteria (composite rank):** specificity score + cliche avoidance score + text length bonus, filtered for fair housing compliance (score >= 6) and specificity (score >= 6).

**Result: 5 listings selected (indices 9, 28, 12, 39, 5).**

| Index | Overall | Specificity | Cliche Avoidance | Fair Housing | Length | Opening |
|---|---|---|---|---|---|---|
| 9 | 6/10 | 8 | 7 | 9 | 1688 | "Price, location and design, this 3 bed / 2.5 bath townhome..." |
| 28 | 7/10 | 8 | 6 | 6 | 1504 | "DOWNTOWN NASHVILLE VIEWS FROM EVERY LEVEL..." |
| 12 | 6/10 | 6 | 8 | 9 | 692 | "The Birch combines an efficient footprint..." |
| 39 | 6/10 | 8 | 5 | 9 | 1074 | "Located in the Mountain View community..." |
| 5 | 6/10 | 7 | 4 | 9 | 535 | "Looking for space, value, and a quick commute?" |

**Excluded candidates:**
- Index 24 (specificity 8, cliche 7, but fair housing score 3: disqualified)
- Index 19 (specificity 4, cliche 3: too generic to teach good voice patterns)
- Index 13 (duplicate of index 12: same builder copy)

**Style signal profile:** the five samples collectively provide a conversational-to-bold register, high specificity (names restaurants, dollar amounts, measurements, materials), question openings (idx 5) and feature-first openings (idx 28, 39), moderate length variety (535 to 1688 chars). This is the highest-quality voice signal available from the Nashville 53 dataset without introducing fair housing risk into the style sample.

**Infrastructure note:** script extended with `rewrite-montaic-voice` mode in `grade-zillow-batch.ts`. The mode calls `distillVoiceFromDocuments()` on the combined sample text, then generates 53 listings using `buildTieredPrompt()` at standard depth with the distilled `agentVoice` and raw `writingSample` both injected. Same grading pipeline as A14.

### Blocker 2: Run the voice-locked path on 53 listings. CLOSED.

**Effort budget:** 2 hours. Actual: ~15 minutes generation, ~15 minutes grading.

**Infrastructure:** `rewrite-montaic-voice` mode added to `grade-zillow-batch.ts`. The mode:
1. Loads the 5 selected Zillow originals from the graded results
2. Calls `distillVoiceFromDocuments()` to produce an agent voice narrative
3. Generates 53 listings via `buildTieredPrompt()` with `agentVoice` + `writingSample` injected at standard depth
4. Uses `claude-sonnet-4-5` (same model as the paid product)
5. Grades all 53 outputs through the same five-category grader

**Distilled voice narrative (produced by the voice distillation layer):**

"You write with a pragmatic, benefits-first approach that prioritizes clarity and buyer utility over poetic flourishes. Your sentences toggle between punchy fragments that highlight key features and longer, explanatory flows that connect practical dots for the reader. You favor conversational connectors that create a direct, consultative tone, as if walking someone through the property in real time. You lead with what matters most: price positioning, location advantages, and functional flexibility. You are enthusiastic but grounded. Your descriptions are feature-dense yet accessible, avoiding jargon while maintaining authority."

**Output files (all gitignored under scripts/):**
- `zillow-50-nashville-montaic-voice.txt` (53 voice-locked descriptions)
- `zillow-50-nashville-distilled-voice.txt` (the agent voice narrative)
- `zillow-50-nashville-montaic-voice-results.json` (per-listing graded results)
- `zillow-50-nashville-montaic-voice-summary.json` (aggregate statistics)

### Blocker 3: Grade the 53 voice-locked outputs. CLOSED (combined with Blocker 2).

Grading ran as part of the same batch. Four-way aggregate produced via `aggregate-four-way` mode.

**Output:** `zillow-50-nashville-four-way.json`

### Phase 2 results: four-way headline numbers

| Dataset | Avg Score | Delta vs Originals | 7-8 Bucket | 3-4 Bucket |
|---|---|---|---|---|
| ChatGPT gpt-4o-mini | 3.6/10 | -1.0 | 0 | 53 |
| Zillow Originals | 4.6/10 | baseline | 1 | 31 |
| Montaic Default | 5.1/10 | +0.5 | 2 | 21 |
| **Montaic Voice-Locked** | **6.9/10** | **+2.3** | **42** | **2** |

**Category-level voice-locked lift over Montaic default:**

| Category | Montaic Default | Montaic Voice | Delta |
|---|---|---|---|
| Cliche avoidance | 3.7 | 7.0 | **+3.3** |
| Emotional appeal | 4.2 | 6.8 | **+2.6** |
| Structure/flow | 5.3 | 7.3 | **+2.0** |
| Specificity | 6.0 | 7.8 | **+1.8** |
| Fair housing | 6.7 | 8.1 | **+1.4** |

**Filler phrase elimination (voice-locked column):**

Zero "Welcome to", zero "stunning", zero "charming", zero "beautiful", zero "gorgeous", zero "boasts", zero "nestled", zero "dream home", zero "hidden gem", zero "don't miss". Only residual: 3 "spacious" (6%) and 2 "move-in ready" (4%).

**Key finding for the article:** the biggest lift came from cliche avoidance (+3.3), not specificity (+1.8). The voice sample taught the model what NOT to say as much as what TO say. The five Zillow originals scored cliche avoidance between 4 and 8. The voice-locked outputs averaged 7.0 on cliche avoidance, matching the upper range of the style samples. The voice calibration layer appears to function as both a style amplifier and a cliche suppressor.

**Experiment verdict: POSITIVE. A17 ships.**

### Phase 2 deliverables

- [x] Five Zillow originals selected with documentation (indices 9, 28, 12, 39, 5)
- [x] Voice-locked path confirmed working and script extended (`rewrite-montaic-voice` mode)
- [x] 53 voice-locked outputs generated
- [x] 53 voice-locked outputs graded
- [x] Four-column aggregate table with deltas (`four-way.json`)
- [x] Score bucket distribution for the fourth column (42 in 7-8, 9 in 5-6, 2 in 3-4)
- [x] Top filler phrases for the fourth column (the two-word opening phrase: ZERO. All major filler phrases eliminated.)
- [x] Near-duplicate count for the fourth column (5, same as Montaic default)
- [ ] Comparison of three-sentence rule satisfaction rate across all four columns (deferred to Phase 3 analysis)

Total Phase 2 budget: 3 to 4 hours estimated. Actual: ~1 hour (30 min infrastructure + 30 min generation/grading). Faster than estimated because voice distillation and generation used the same API call pattern as the existing modes.

---

## Phase 3: Draft (COMPLETE)

### Target length

Same range as A13 through A16. 2000 to 2600 words. Target 2400, slightly longer than A16 because the four-column comparison needs more space than the three-column version.

### Working structure (9 body sections plus FAQ plus closing)

1. **Opening hook.** "Same 53 listings. Fourth dataset. This time the tool had a writing sample to learn from." Name the three-column baseline from A14 and A16. Promise the fourth column. Name the limitation directly in paragraph two: the style sample is not the author's past listings, it is the five best Zillow originals from the same dataset. The experiment tests the mechanism, not the personalization.
2. **What the voice-locked path is.** Short section. The tool takes 3-5 example listings as a style sample, extracts phrasing patterns and structural choices, and uses those as constraints on the writing layer. The default path has no style reference. The voice-locked path has one.
3. **The style sample we used.** Name the five Zillow originals. Opening sentences. Why they were selected. What phrasing patterns the calibration layer extracted.
4. **The four-column scorecard.** Four-column average table. New column alongside the three from A14. Name the delta. Is the voice-locked path meaningfully better than default?
5. **The score distribution.** Four-column bucket table. Did the voice-locked path break out of the 5-6 cluster that the default path concentrated in? Did any listings crack 8?
6. **What changed in the openings.** Did the two-word template opening frequency drop? Did the "Exceptional" pattern that both Montaic 7/10s shared in the default run disappear? What did the voice-locked path open with instead? This is the three-sentence rule test: does the voice-locked path satisfy the rule more consistently?
7. **What changed in the body.** Category-level delta analysis. Specificity, emotional appeal, structure, Fair Housing, cliche avoidance across all four columns. Where did the voice-locked path gain most? Where did it not gain?
8. **The honest note on this experiment.** This is the section that names every limitation. The style sample is not the agent's own voice. The experiment is a mechanism test, not a personalization test. The grader is proprietary. The results are publishable regardless of direction.
9. **What agents should do with this data.** The Monday-morning action: upload 5 of your past listings, run the voice-locked path on your next listing, compare the output. The experiment gives them a measured baseline to expect.
10. **Closing.** The four-piece arc: A13 named the problem, A14 measured it, A16 sharpened it, A17 tested the treatment. What comes next.
11. **FAQ.** Six Q&A pairs for FAQPage schema.
12. **Optional: closing line.**

### Voice rubric pre-draft checklist

Voice-check 4/4 clean. Zero filler phrase hits (the article avoids naming the two-word phrase directly, using "the two-word opening phrase" and "the same two words" instead). Zero em dashes. Zero semicolons. No known-exception hits needed.

### Phase 3 closure note (2026-04-11)

Draft complete at `A17-draft.md`. 2370 words across 9 body sections plus 6-Q FAQ. No closing line (the "four-piece arc" section closes the piece). Voice-check 4/4 clean with zero exceptions. Key findings embedded: 6.9 vs 5.1 headline lift, 42/53 in 7-8 bucket, cliche avoidance as biggest category mover (+3.3), near-total filler elimination, three named limitations, 10-minute Monday-morning action.

---

## Phase 4: Schema, handoff, publish (COMPLETE)

Same `@graph` structure as A11 through A16.

### Schema block target

- **BlogPosting** with headline, description, datePublished, author (Lance Roylo), publisher (Montaic), image, and `citation` array reusing the A13-A16 shelf plus any new citations from Phase 2.
- **FAQPage** with 6 Question nodes.
- **BreadcrumbList** for Home > Blog > A17.
- **`mentions` array** on the BlogPosting pointing at:
  - A13 (`/blog/zillow-listings-all-sound-the-same`) as cluster sibling.
  - A14 (`/blog/chatgpt-53-nashville-listings`) as primary predecessor.
  - A16 (`/blog/96-percent-chatgpt-listings-opening`) as immediate predecessor.
  - A12 (`/blog/fair-housing-listing-description-rules`) for cross-cluster bind.

### Reciprocal mentions back-propagation

When A17 ships, A13, A14, and A16 all need A17 added to their `mentions` arrays.

### Claire handoff

Stub file: `audits/montaic/implementation/A17-claire-paste-this.md`. Create during Phase 4 using A16's Claire handoff as the starting template.

---

## Phase 5: Voice pass and ship (NOT STARTED)

Standard sequence per A11 through A16 pattern.

---

## Open questions for Lance

1. **Voice-locked path infrastructure.** Does `listing-pipeline-ai` already have a voice-locked rewrite mode in the batch script, or does it need a new mode? If so, estimate the dev effort before Phase 2 Blocker 2 can run.
2. **Style sample count.** Five is the minimum the voice calibration layer expects. If fewer than five Zillow originals pass all four selection criteria, should we relax the criteria or drop to three samples (if the tool supports it)?
3. **Publish if negative.** If the voice-locked path does not meaningfully beat the default path, do we still publish? Recommendation: yes. An honest negative result strengthens the Montaic brand more than burying it, and it means A18 can revisit with a real agent's voice sample as the remedy.
4. **A18 timing.** If A17 ships mid-to-late April, A18 is the Q3 2026 news-hook follow-up (Candidate F, Fair Housing enforcement calendar piece). Earliest eligible: July 1 2026. Should we start scoping A18 now or wait until A17 clears Phase 3?

---

## Next action

Phase 2 Blocker 1: select the five Zillow originals for the style sample. 30 minutes. Claude drives. Output is a documented selection with scores, opening sentences, and extracted patterns.

Phase 2 Blocker 2: run the voice-locked path. 2 hours tool runtime. Depends on confirming infrastructure exists. Claude drives if infrastructure exists. If script extension needed, plan first.

Phase 2 Blocker 3: grade the 53 outputs. 30 minutes to 1 hour grader runtime. Claude drives.

Target Phase 3 draft complete within seven days of Phase 1 lock to stay on the 2-week cadence. A17 is not on a news-hook clock so the 2-week cadence is the only constraint.
