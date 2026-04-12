Same 53 Nashville listings. Fourth dataset. This time the tool had a writing sample to learn from.

In A14, we ran 53 Zillow originals through ChatGPT and through Montaic's default path, then graded all 159 outputs on the same five-point rubric. ChatGPT averaged 3.6 out of 10. Zillow originals averaged 4.6. Montaic's default path averaged 5.1. In A16, we broke down why ChatGPT compressed into a single score bucket and why 96 percent of its outputs opened with the same two words.

This piece is the follow-up both articles promised. We took Montaic's voice calibration layer, fed it five of the best Zillow originals as a style sample, and ran the same 53 listings again. The fourth column averaged 6.9 out of 10. Forty-two of the 53 outputs landed in the 7-8 score range. Zero filler phrases survived.

One thing to name before going further. The style sample is not the author's own past listings. It is the five highest-scoring Zillow originals from the same dataset. This experiment tests the mechanism of voice calibration, not the result of personalizing to a specific agent's voice. That distinction matters, and we will come back to it.

## What the voice-locked path does

Montaic's default generation path works from structured facts: beds, baths, square footage, neighborhood, key features. It writes clean copy, but it has no reference point for how a specific agent sounds. Every output comes from the same starting position.

The voice-locked path adds one input: a writing sample. You upload three to five past listings or rough drafts. The system reads them and extracts a profile of your writing patterns. Sentence length tendencies. How you open a description. Whether you favor punchy declarations or longer narrative flows. How dense your adjective use is. Whether you talk about the property in third person or address the buyer directly.

That profile becomes a constraint on every generation. The model still works from the same structured facts. But now it has a target voice to match.

## The style sample we used

Since this experiment needed a style sample and the author is not a practicing agent with past MLS listings on file, we selected the five highest-scoring Zillow originals from the Nashville 53 dataset. Selection criteria: overall score of 6 out of 10 or higher, specificity sub-score of 6 or higher, fair housing sub-score of 6 or higher, and enough text length to give the calibration layer real signal.

The five selected listings (indices 9, 28, 12, 39, and 5 from the original dataset) share a few traits the calibration layer picked up on. They lead with functional benefits rather than adjectives. They name specific materials, measurements, and price points early. They use conversational connectors that sound like someone walking you through the property rather than reading from a template. One opens with a question. One opens in all caps with the view as the hook. None of them open with the two-word phrase that 96 percent of ChatGPT outputs used.

The voice the calibration layer distilled from these five samples: a pragmatic, benefits-first approach. Sentences that toggle between punchy fragments and longer explanatory flows. Conversational without being casual. Enthusiastic but grounded in specifics.

## The four-column scorecard

Here is the average score for each dataset, all 53 listings, same grader, same five categories.

| Dataset | Avg Score | Delta vs Originals |
|---|---|---|
| ChatGPT gpt-4o-mini | 3.6 / 10 | -1.0 |
| Zillow Originals | 4.6 / 10 | baseline |
| Montaic Default | 5.1 / 10 | +0.5 |
| Montaic Voice-Locked | 6.9 / 10 | +2.3 |

The voice-locked path outscored the default path by 1.8 points on a 10-point scale. It outscored the Zillow originals by 2.3 points. It outscored ChatGPT by 3.3 points.

A 1.8-point lift does not sound dramatic until you look at the score distribution.

## The score distribution

| Score Range | ChatGPT | Originals | Montaic Default | Montaic Voice |
|---|---|---|---|---|
| 1-2 | 0 | 1 | 0 | 0 |
| 3-4 | 53 | 31 | 21 | 2 |
| 5-6 | 0 | 20 | 30 | 9 |
| 7-8 | 0 | 1 | 2 | 42 |
| 9-10 | 0 | 0 | 0 | 0 |

ChatGPT produced a single point mass. All 53 outputs in the 3-4 bucket. Zero variance.

The Montaic default path spread across 3-4 and 5-6, with two outputs reaching 7-8. Better range, but the center of gravity was still in the 5s.

The voice-locked path inverted the distribution. Forty-two out of 53 outputs landed in 7-8. Only two fell back to 3-4. The entire curve shifted right by nearly two full buckets.

Eleven of those 42 scored exactly 8 out of 10. The original three-way dataset (159 outputs across all three columns) produced three 7s and zero 8s. The voice-locked column alone produced more 7-and-above outputs than the other three columns combined.

## What the openings look like now

The Montaic default path had patterns of its own. Four outputs opened with "This thoughtfully designed single..." Three opened with "Exceptional single-family residence..." Two opened with the two-word phrase. The openings were better than ChatGPT's monoculture, but they still clustered.

The voice-locked path broke the cluster. Here are three before-and-after pairs from the same input facts.

**Listing 1 (Cleveland Park, 4 bed / 4 bath):**
- Default: "Exceptional single-family residence in sought-after Cleveland Park featuring 4 bedrooms and 3 bathrooms with sophisticated finishes throughout."
- Voice-locked: "This new construction home in Cleveland Park delivers 4 bedrooms, 4 baths, and a layout built around how people actually live."

**Listing 39 (Germantown, 4 bed / 2 bath):**
- Default: "Discover this thoughtfully designed 4-bedroom, 2-bathroom single-family home in Germantown."
- Voice-locked: "Four bedrooms, two full baths, and a fenced backyard in Germantown. This one checks the boxes that matter."

**Listing 25 (condo townhouse, no HOA):**
- Default output scored 4 out of 10.
- Voice-locked: "This two-story condo townhouse delivers thoughtful updates and zero HOA fees, a combination that is hard to find." Score: 8 out of 10.

The default path led with adjectives. The voice-locked path led with facts. That is what a writing sample teaches the model: not which words to add, but which words to skip.

## Where the biggest gains came from

The grader scores five categories. Here is the voice-locked lift over the Montaic default in each one.

| Category | Default | Voice | Delta |
|---|---|---|---|
| Cliche avoidance | 3.7 | 7.0 | +3.3 |
| Emotional appeal | 4.2 | 6.8 | +2.6 |
| Structure / flow | 5.3 | 7.3 | +2.0 |
| Specificity | 6.0 | 7.8 | +1.8 |
| Fair housing | 6.7 | 8.1 | +1.4 |

The largest gain was cliche avoidance. Not specificity. Not structure. Cliche avoidance jumped 3.3 points, from 3.7 to 7.0.

That is worth pausing on. The five style samples scored between 4 and 8 on cliche avoidance. The voice-locked outputs averaged 7.0, matching the upper end of the sample range. The calibration layer learned what the style samples did not say as much as what they did say. None of the five samples used "stunning." None used "boasts." None used "dream home." The voice-locked outputs followed that pattern: zero "stunning," zero "boasts," zero "dream home," zero "charming," zero "gorgeous." Only three outputs used "spacious" (6 percent, down from 19 percent on the default path). Only two used "move-in ready" (4 percent, down from 17 percent).

The filler phrase table tells the whole story.

| Filler Phrase | ChatGPT | Originals | Default | Voice |
|---|---|---|---|---|
| The two-word opening phrase | 96% | 9% | 13% | 0% |
| "stunning" | 81% | 21% | 15% | 0% |
| "spacious" | 81% | 34% | 19% | 6% |
| "dream home" | 68% | 0% | 0% | 0% |
| "boasts" | 66% | 15% | 4% | 0% |
| "beautiful" | 64% | 38% | 11% | 0% |
| "charming" | 47% | 6% | 8% | 0% |
| "don't miss" | 32% | 4% | 4% | 0% |

Voice calibration functions as a cliche suppressor. Feed the model examples of writing that avoids filler, and the output avoids filler. That is a more useful finding than the raw score lift, because it means the style sample does not need to be perfect. It needs to be clean.

## The honest note on this experiment

Three limitations to name.

First, the style sample is not an agent's own voice. It is the five best Zillow originals from the same dataset. A real agent uploading their own past listings would give the calibration layer a more coherent and personal signal. This experiment measures the mechanism, not the personalization. The results should be read as a floor, not a ceiling.

Second, the grader is Montaic's own tool. The grader was built to evaluate listing quality on five dimensions (specificity, emotional appeal, structure, fair housing compliance, and cliche avoidance). It was not built to favor Montaic outputs. But it was built by the same team that built the generation layer, and that overlap deserves acknowledgment. The score is a useful internal signal. It is not an independent audit.

Third, two of the 53 voice-locked outputs still scored 4 out of 10. Both failed on specificity (sub-score of 3). When the input facts are thin (no square footage, few features, no neighborhood detail), the voice-locked path cannot invent what is not there. Voice calibration amplifies good input. It does not compensate for missing input.

## What agents should take from this

The experiment tested one variable: giving the generation model a writing sample before it writes. The lift was 1.8 points on a 10-point scale. The cliche elimination was near-total. The score distribution shifted from a 5-centered spread to a 7-centered cluster.

If you are writing listing descriptions with any AI tool, the single highest-leverage action you can take is to give it something to copy. Not a prompt. Not instructions about tone. An actual sample of writing you have already approved.

Here is the 10-minute version.

1. Pull five of your best past listings from MLS. Pick the ones you would hand to a new hire as examples of your voice.
2. Paste them into whatever tool you use. If the tool has a voice or style sample field, use it. If it does not, paste the samples into the prompt as context.
3. Generate one listing with the style sample loaded. Compare it against your last generation without the sample.
4. Grade both outputs (Montaic's listing grader is free at montaic.com/listing-grader). Look at the cliche avoidance sub-score specifically. That is where the sample does the most work.

The style sample does not need to be your best writing. It needs to be writing that sounds like you and avoids the filler that every default tool falls back on.

## The four-piece arc

A13 named the problem: every Zillow listing sounds the same because every tool trained on the same boilerplate corpus. A14 measured it: ChatGPT averaged 3.6 out of 10 on the Nashville 53. A16 sharpened it: 96 percent of ChatGPT outputs opened with the same two words, and the entire corpus compressed into a single score bucket. A17 tested the treatment: a writing sample shifted the average from 5.1 to 6.9 and eliminated the filler phrases that dragged every other column down.

The treatment is not a better prompt. The treatment is a sample of writing that shows the model what you actually sound like. The model does the rest, and the biggest thing it does is stop reaching for the words every other model reaches for.

## Frequently asked questions

**Does this only work with Montaic?**

The principle works with any AI writing tool. If the tool accepts a writing sample or a style reference, use it. Montaic's voice calibration layer automates the extraction, but the underlying mechanism (giving the model examples of your voice before it writes) works across tools. What varies is how well each tool uses that input.

**Why did you use Zillow originals instead of your own listings?**

The author is not a practicing real estate agent and does not have past MLS listings. The five highest-scoring Zillow originals were the strongest available substitute. This means the experiment measures the voice calibration mechanism in general, not the specific result of personalizing to one agent's voice. A real agent's samples would likely produce an even more coherent output.

**Is a 1.8-point lift actually meaningful?**

On a 10-point scale, 1.8 points moved 42 out of 53 outputs from the 5-6 range into the 7-8 range. The score distribution shift matters more than the average. A listing that scores 7 reads differently from a listing that scores 5. The gap between "competent but generic" and "sounds like a specific person wrote it" is exactly where buyer attention lives.

**What if I only have two or three past listings?**

The calibration layer works with as few as one sample, though three to five gives it more patterns to extract. Start with what you have. Even a single strong listing tells the model what your voice sounds like, which is more useful than no reference at all.

**Will the scores keep improving if I add more samples?**

Beyond five samples, the returns diminish. The calibration layer extracts structural patterns (sentence length, opening style, adjective density, emotional register). Five samples are enough to establish those patterns. Twenty samples would reinforce them but not fundamentally change the output.

**Can I use a competitor's listings as my style sample?**

You can, but you should not. The point of voice calibration is to make your listings sound like you. Copying a competitor's style defeats the purpose and creates a new version of the same homogeneity problem. Use your own past work. If you do not have any, use the best originals from your market as a starting point, the way this experiment did, then replace them with your own listings once you have output you are proud of.
