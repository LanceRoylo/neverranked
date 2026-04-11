## BODY (paste into sections array on A16 posts.ts entry)

We ran 53 Nashville listings through ChatGPT. Here are two facts we did not expect.

Fifty-one of them opened with the same two-word phrase. Zero of them scored above mediocre on our grader.

One of those facts you can verify yourself. Open the 53 outputs, read the first two words of each, and count. The other fact depends on trusting our grader, which is proprietary and which you can reasonably push back on. We are going to put both facts in front of you anyway because they tell the same story from two different angles, and because the piece that names only the first fact buries the consequence.

The consequence is this. ChatGPT does not just produce boring listings. It produces listings that are incapable of being good listings. The opening phrase is the symptom. The score ceiling is the diagnosis.

### Section 1: The reveal

The phrase is "Welcome to." Fifty-one of 53 ChatGPT outputs began with it. Ninety-six percent. The other two also opened with template greetings, just not that specific one.

The top opening four-word sequence across the 53 outputs was "MLS description welcome to," appearing in six listings. That phrase is not what a human agent would write. That phrase is what happens when you paste a raw MLS block into ChatGPT and the model reads the label "MLS Description:" as part of the prose it is supposed to continue. In six cases out of 53, the tool copied the label directly into its output. That is not a misunderstanding of the task. That is a failure to understand that the task is a task.

### Section 2: The score distribution

Here is what the grader saw across the three datasets.

| Score bucket | Zillow originals | ChatGPT | Montaic default |
|---|---|---|---|
| 1-2 | 1 | 0 | 0 |
| 3-4 | 31 | **53** | 21 |
| 5-6 | 20 | **0** | 30 |
| 7-8 | 1 | **0** | 2 |
| 9-10 | 0 | 0 | 0 |
| Average | 4.6 | 3.6 | 5.1 |

Zillow's originals are distributed across four buckets with one outlier in the 7-8 range and one in the 1-2 range. Montaic's outputs cluster in the 5-6 bucket with two outliers landing in 7-8. ChatGPT's outputs are a single point mass in the 3-4 bucket. Every single one. No variance above mediocre. No outliers rescuing the average. The tool produced 53 listings with different facts, different neighborhoods, different price points, and the grader could not distinguish them on quality.

The cliche-avoidance sub-score is where the gap is widest. Zillow originals averaged 4.2 out of 10. Montaic averaged 3.7. ChatGPT averaged 1.8. Less than half the Zillow baseline on the one sub-score that specifically measures whether the output sounds like boilerplate. The 96 percent opening phrase is not the only reason ChatGPT scored low on cliches. It is the most visible of several.

### Section 3: Why the model does this

The academic term is mode collapse. Shumailov and colleagues published a Nature paper in 2024 showing that when language models train on content produced by earlier models, the model's view of reality narrows. Rare events vanish first. Outputs drift toward the center of the training distribution. The tails get pruned. A follow-up ICLR 2025 paper ("Strong Model Collapse") showed the effect holds even when only a tiny fraction of training data is synthetic. One part per thousand is enough to start the collapse.

ChatGPT's training data includes an enormous volume of public-facing listing descriptions. The most common way to open a listing description in that corpus is "Welcome to." Not because it is the best opening. Because it is the opening that appears in the most examples the model saw. When the model is asked to generate a new listing, it does not reason about whether "Welcome to" is a good choice for this specific property. It defaults to the most frequent opening in the corpus. The RLHF fine-tuning on top of that pretraining reinforces friendly, greeting-style openings as a general matter, which further entrenches the same phrase.

Zillow's 2016 research report analyzed six million listing descriptions between 2011 and 2015 and tracked the relative frequency of one- and two-word phrases over time. The phrase patterns we are seeing from ChatGPT in 2026 are recognizable descendants of the most common patterns Zillow measured a decade ago. The model did not invent these cliches. It inherited them. The difference is that a human agent in 2015 used "Welcome to" maybe one listing in ten. The model uses it 51 listings in 53.

### Section 4: The other overused patterns

Here is the full top-ten filler phrase table across the three datasets.

| Phrase | Zillow | ChatGPT | Montaic |
|---|---|---|---|
| "Welcome to" | 9% | **96%** | 13% |
| "Stunning" | 21% | 81% | 15% |
| "Spacious" | 34% | 81% | 19% |
| "Dream home" | not ranked | 68% | not ranked |
| "Boasts" | 15% | 66% | 4% |
| "Beautiful" | 38% | 64% | 11% |
| "Charming" | 6% | 47% | 8% |
| "Don't miss" | 4% | 32% | 4% |
| "Nestled" | not ranked | 25% | 4% |
| "Rare opportunity" | not ranked | 9% | 8% |

"Stunning" and "spacious" each appeared in 43 of 53 ChatGPT outputs. Eighty-one percent. "Dream home" appeared in 36 outputs. Sixty-eight percent. "Boasts" appeared in 35. "Beautiful" in 34. The pattern is not that ChatGPT uses one cliche heavily. It is that ChatGPT uses the entire top ten simultaneously across nearly every output. A single ChatGPT listing contains multiple of these phrases stacked on top of each other. The reader's pattern-match fires on the first sentence and never stops firing.

Notice what is also in the table. "Stunning" appears in 11 of 53 Zillow originals. Twenty-one percent. Human agents use cliches. The difference is that 21 percent is survivable and 81 percent is not. The tool is not wrong to use the category of language. It is wrong to use it this much.

### Section 5: What a 7-out-of-10 listing actually looks like

Across 159 total outputs in the three datasets, exactly three scored 7 out of 10 or higher. None came from ChatGPT.

The first came from the Zillow originals. It opened in all capital letters: "DOWNTOWN NASHVILLE VIEWS FROM EVERY LEVEL - AND THEY ARE SPECTACULAR!" The all-caps format is a risk, not a recommendation. The lesson is what the sentence actually does. It names a specific benefit (views of downtown Nashville), specifies that the benefit is present on every level of the home, and puts a confident claim on the benefit. No template word. No greeting. By word seven, the reader knows the single thing that makes this property worth reading about.

The second came from Montaic's default path. It opened: "Exceptional Stone Oak Builders custom home built in 2022, situated on a private 1.28-acre lot in the prestigious Radnor Lake neighborhood." The first word is a template word ("Exceptional"). But the rest of the sentence lands four specific facts. Named builder. Build year. Lot size. Named neighborhood. Sentence one satisfies what we are about to call the three-sentence rule.

The third came from Montaic's default path. It opened: "Exceptional single-family residence in Brentwood offering 3,700 square feet of thoughtfully designed living space. This three-bedroom, two-bathroom home features $45,000 in Pella windows and doors with transferable warranty." Sentence one is generic. The grader flagged it specifically: "opening line is generic and uncompelling." Sentence two lands a dollar amount, a named brand, and a confirmed benefit (transferable warranty). The listing still scored 7 out of 10. Generic opening, specific body by sentence two, rescued score.

What the three outliers share is not a great opening line. Two of the three open with the template word "Exceptional." What they share is that by the end of sentence three, each one has named at least one fact that only applies to that specific property. A dollar amount, a named brand, a measurement, a year, or a confirmed benefit. The other 156 outputs across the three datasets do not do that by sentence three. ChatGPT's outputs do not do it in the first paragraph.

### Section 6: The three-sentence rule

Here is the action.

Open your last listing. Count three sentences. In those three sentences, at least one of the following must appear: a dollar amount, a named brand, a measurement, a year, or a confirmed benefit. "Confirmed benefit" means a specific thing the property does for the buyer that is not a vague adjective. "Energy-efficient windows" is an adjective. "$45,000 Pella windows with transferable warranty" is a confirmed benefit.

If your first three sentences do not contain one of the five, rewrite.

That is it. That is the rule. You do not need to write a clever opening. You do not need to avoid the template words. You need to make sure that when a buyer has read for five seconds, they have encountered a specific, property-unique fact.

Zillow's 2018 research analyzed 3.6 million home sales and found that listings mentioning specific features like "steam shower" and "professional appliance" earned sellers a 29 percent higher sale price than listings without those terms. Not 2 percent. Twenty-nine. The commercial evidence for specificity is extraordinarily strong. The three-sentence rule just makes it habitual.

### Section 7: What to do this week

Four actions. They take about thirty minutes total.

1. Pull your last five listings. Not your favorites. The last five in chronological order.
2. For each, count to the end of sentence three. Highlight any phrase that is a dollar amount, a named brand, a measurement, a year, or a confirmed benefit. Use one color.
3. Count the listings where no highlights appear. If more than zero, the rule is not habit yet.
4. Before you publish your next listing, run the same check. If sentence three is still vague, rewrite sentence three until a specific fact lands.

That is the entire change. No tool, no process, no template. A thirty-minute audit and a habit.

### Section 8: The honest note on tools

Every tool that writes listing descriptions has to decide what happens before the writing starts. ChatGPT's answer is: nothing. You hand it the MLS block, it generates text. The model has no mechanism for deciding which facts matter enough to land in the first three sentences. It optimizes for plausibility against the corpus average, which means the opening is whatever the corpus average opens with.

Montaic's answer is that a fact-surfacing layer runs before the writing layer. The tool identifies the specific, property-unique facts first (dollar amounts, brand names, measurements, years, confirmed benefits) and makes sure they are in the writing context when the draft begins. That is why both Montaic 7 out of 10 outputs have their specificity landing by sentence two even when sentence one is generic. The tool had the facts in hand when the draft started. ChatGPT did not.

This is not a claim that Montaic writes great openings. Both Montaic 7s open with the template word "Exceptional." This is a claim that Montaic's architecture makes the three-sentence rule easier to satisfy by default, and the score distribution reflects that: ChatGPT zero outputs above 4 out of 10, Montaic two outputs above 6 out of 10. The tools are solving different problems even though they both produce text.

The A17 piece in this series will run the voice-locked version of the Nashville 53 experiment, where Montaic's style layer is calibrated against an agent's own past listings. We expect the opening-word template pattern to drop significantly in that run because the style layer has specific word choices to pull from. Until then, the three-sentence rule is available to every agent for free. It does not require Montaic. It requires thirty minutes.

### Section 9: Closing

ChatGPT's 96 percent opening phrase is not a quirk. It is the most visible evidence of a tool that cannot distinguish one property from another. The tool is not broken. The tool is working exactly as trained. The training just happens to be unsuited to the task.

The fix is not a better prompt. The fix is a habit that runs before the prompt. Three sentences. One specific fact. Monday morning.

### FAQ

**Q: Are you saying agents should never use ChatGPT for listings?**
A: No. We are saying that whatever tool you use, the first three sentences need a specific, property-unique fact in them. ChatGPT makes that harder because its default output does not include such facts. If you use ChatGPT, you will need to edit the output before publishing. If you audit and edit, you can use any tool.

**Q: Does the 96 percent figure apply outside Nashville?**
A: Our data is Nashville-specific. The mechanism (training distribution collapse on common opening phrases) is not Nashville-specific. We would expect the figure to land in the 85 to 98 percent range for any metro the model has been exposed to during training. We have not run the experiment in other metros yet.

**Q: Why does the three-sentence rule cut off at sentence three?**
A: Buyer attention on listing pages drops off within the first few lines of description text, and the platforms that host listings (Zillow, Realtor.com) often display only the opening lines before requiring a click to expand. Getting a specific fact into sentence three means the fact is likely visible in the preview pane. Cutting off at sentence five would work too. Sentence three is the tighter discipline and it produces the same effect.

**Q: What counts as a "confirmed benefit" versus a vague adjective?**
A: A confirmed benefit is a specific thing the property does that can be verified. "Energy-efficient windows" is vague. "Pella windows with transferable warranty" is confirmed. "Great schools nearby" is vague (and a Fair Housing risk). "Half a mile from the highway interchange" is confirmed. The test is whether a skeptical buyer could challenge the claim and you could answer with a document or a measurement.

**Q: Does this apply to the listing headline or just the body?**
A: The body. Headlines operate under different constraints (character limits, platform rules, MLS field requirements). The three-sentence rule applies to the first three sentences of the description body, which is the field agents control most directly.

**Q: Will ChatGPT get better at this?**
A: Probably yes on the opening phrase specifically, once enough agents and trainers flag the issue. Unlikely on the underlying training-distribution problem, because the 2024 and 2025 mode collapse research shows the issue is structural to how these models learn. The tools that solve the distribution problem will be the ones that run fact-surfacing logic before the writing step, which is a different architecture than general-purpose chat models. Our bet is that you should not wait for the generic tool to catch up. Run the three-sentence audit now.
