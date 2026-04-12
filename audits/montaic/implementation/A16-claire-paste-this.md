# A16 Publish Path: Claire lands, Lance flips

**For:** Claire (Montaic codebase)
**From:** Never Ranked side
**Scope:** Land a new blog post (Why 96 Percent of ChatGPT Listings Open With the Same Two Words), wire up the full JSON-LD schema payload, leave `draft: true`. Lance does the final voice read and flips the draft himself.
**Cluster context:** A16 is the third pillar in the Listing Differentiation cluster. A13 (`zillow-listings-all-sound-the-same`) and A14 (`chatgpt-53-nashville-listings`) are the other two. A12 (`fair-housing-listing-description-rules`) is the cross-cluster neighbor and gets a mention edge. A16 carries A13, A14, and A12 as `mentions` in the schema. Back-propagation to A13 and A14 happens in A16.P2.

---

## Sanity check before you begin

```bash
# Blog index renders
curl -s -o /dev/null -w "%{http_code}" https://montaic.com/blog
# Expected: 200

# A13 is live (schema mentions and back-propagation target)
curl -s -o /dev/null -w "%{http_code}" https://montaic.com/blog/zillow-listings-all-sound-the-same
# Expected: 200

# A14 is live (schema mentions and back-propagation target)
curl -s -o /dev/null -w "%{http_code}" https://montaic.com/blog/chatgpt-53-nashville-listings
# Expected: 200 (or 404 if A14 is still draft, which is fine, just flag it)

# A12 is live (cross-cluster bind)
curl -s -o /dev/null -w "%{http_code}" https://montaic.com/blog/fair-housing-listing-description-rules
# Expected: 200
```

If any of those fail except the A14 check, stop and flag before creating the new post.

---

## A16.P1: Add the post to posts.ts

Add the following entry to the `POSTS` array in `apps/dashboard/lib/blog/posts.ts`. Place it after the A15 entry (`hud-2026-fair-housing-guidance-withdrawal`). Leave `draft: true`.

```typescript
{
  slug: "96-percent-chatgpt-listings-opening",
  title: "Why 96 Percent of ChatGPT Listings Open With the Same Two Words",
  description:
    "We ran 53 Nashville listings through ChatGPT. 51 opened with the same phrase. Zero scored above mediocre. The three-sentence rule separates the outliers from the baseline.",
  publishedAt: "2026-04-11",
  updatedAt: "2026-04-11",
  author: "Lance Roylo",
  readingTime: "12 min read",
  category: "Listing Differentiation",
  tags: ["ChatGPT listings", "listing description opening", "mode collapse", "three-sentence rule", "Nashville 53 dataset", "real estate AI", "listing quality"],
  draft: true,
  citation: [
    { "@type": "CreativeWork", name: "Shumailov et al., AI models collapse when trained on recursively generated data, Nature (2024)", url: "https://pubmed.ncbi.nlm.nih.gov/39048682/" },
    { "@type": "CreativeWork", name: "Strong Model Collapse, ICLR 2025 Conference Paper", url: "https://openreview.net/forum?id=et5l9qPUhm" },
    { "@type": "CreativeWork", name: "Attributing Mode Collapse in the Fine-Tuning of Large Language Models, OpenReview 2025", url: "https://openreview.net/forum?id=3pDMYjpOxk" },
    { "@type": "CreativeWork", name: "Verbalized Sampling: How to Mitigate Mode Collapse and Unlock LLM Diversity (October 2025)", url: "https://arxiv.org/html/2510.01171v1" },
    { "@type": "CreativeWork", name: "Zillow Research: Listing Language: From the Bottom of the Bubble to Now (2016)", url: "https://www.zillow.com/research/comparing-listing-language-12431/" },
    { "@type": "CreativeWork", name: "Zillow Research: Lucrative Listing Descriptions: The Surprise Features to Stress When Selling (2018)", url: "https://www.zillow.com/research/listing-descriptions-sales-2018-19285/" },
    { "@type": "CreativeWork", name: "National Association of Realtors Profile of Home Buyers and Sellers (rolling annual)", url: "https://www.nar.realtor/research-and-statistics/research-reports/highlights-from-the-profile-of-home-buyers-and-sellers" },
  ],
  mentions: [
    { "@type": "CreativeWork", name: "Why Zillow Listings All Sound the Same (And Why It's Costing Agents Leads)", url: "https://montaic.com/blog/zillow-listings-all-sound-the-same" },
    { "@type": "CreativeWork", name: "We Ran 53 Nashville Listings Through ChatGPT. Here Is What Happened.", url: "https://montaic.com/blog/chatgpt-53-nashville-listings" },
    { "@type": "CreativeWork", name: "Fair Housing Act Listing Description Rules: The Words You Cannot Use in 2026", url: "https://montaic.com/blog/fair-housing-listing-description-rules" },
  ],
  about: [
    { "@type": "Thing", name: "ChatGPT listing descriptions" },
    { "@type": "Thing", name: "Mode collapse in language models" },
    { "@type": "Thing", name: "Real estate listing quality" },
    { "@type": "Thing", name: "Three-sentence rule" },
  ],
  sections: [
    {
      body: `We ran 53 Nashville listings through ChatGPT. Here are two facts we did not expect.\n\nFifty-one of them opened with the same two-word phrase. Zero of them scored above mediocre on our grader.\n\nOne of those facts you can verify yourself. Open the 53 outputs, read the first two words of each, and count. The other fact depends on trusting our grader, which is proprietary and which you can reasonably push back on. We are going to put both facts in front of you anyway because they tell the same story from two different angles, and because the piece that names only the first fact buries the consequence.\n\nThe consequence is this. ChatGPT does not just produce boring listings. It produces listings that are incapable of being good listings. The opening phrase is the symptom. The score ceiling is the diagnosis.`,
    },
    {
      heading: "The reveal",
      body: `The phrase is "Welcome to." Fifty-one of 53 ChatGPT outputs began with it. Ninety-six percent. The other two also opened with template greetings, just not that specific one.\n\nThe top opening four-word sequence across the 53 outputs was "MLS description welcome to," appearing in six listings. That phrase is not what a human agent would write. That phrase is what happens when you paste a raw MLS block into ChatGPT and the model reads the label "MLS Description:" as part of the prose it is supposed to continue. In six cases out of 53, the tool copied the label directly into its output. That is not a misunderstanding of the task. That is a failure to understand that the task is a task.`,
    },
    {
      heading: "The score distribution",
      body: `Here is what the grader saw across the three datasets.\n\nZillow originals: 1 listing in the 1-2 bucket, 31 in the 3-4 bucket, 20 in the 5-6 bucket, 1 in the 7-8 bucket. Average 4.6 out of 10. ChatGPT: 53 in the 3-4 bucket. Zero in any other bucket. Average 3.6 out of 10. Montaic default: 21 in the 3-4 bucket, 30 in the 5-6 bucket, 2 in the 7-8 bucket. Average 5.1 out of 10.\n\nZillow's originals are distributed across four buckets with one outlier in the 7-8 range and one in the 1-2 range. Montaic's outputs cluster in the 5-6 bucket with two outliers landing in 7-8. ChatGPT's outputs are a single point mass in the 3-4 bucket. Every single one. No variance above mediocre. No outliers rescuing the average. The tool produced 53 listings with different facts, different neighborhoods, different price points, and the grader could not distinguish them on quality.\n\nThe cliche-avoidance sub-score is where the gap is widest. Zillow originals averaged 4.2 out of 10. Montaic averaged 3.7. ChatGPT averaged 1.8. Less than half the Zillow baseline on the one sub-score that specifically measures whether the output sounds like boilerplate. The 96 percent opening phrase is not the only reason ChatGPT scored low on cliches. It is the most visible of several.`,
    },
    {
      heading: "Why the model does this",
      body: `The academic term is mode collapse. Shumailov and colleagues published a Nature paper in 2024 showing that when language models train on content produced by earlier models, the model's view of reality narrows. Rare events vanish first. Outputs drift toward the center of the training distribution. The tails get pruned. A follow-up ICLR 2025 paper showed the effect holds even when only a tiny fraction of training data is synthetic. One part per thousand is enough to start the collapse.\n\nChatGPT's training data includes an enormous volume of public-facing listing descriptions. The most common way to open a listing description in that corpus is "Welcome to." Not because it is the best opening. Because it is the opening that appears in the most examples the model saw. When the model is asked to generate a new listing, it does not reason about whether "Welcome to" is a good choice for this specific property. It defaults to the most frequent opening in the corpus. The RLHF fine-tuning on top of that pretraining reinforces friendly, greeting-style openings as a general matter, which further entrenches the same phrase.\n\nZillow's 2016 research report analyzed six million listing descriptions between 2011 and 2015 and tracked the relative frequency of one- and two-word phrases over time. The phrase patterns we are seeing from ChatGPT in 2026 are recognizable descendants of the most common patterns Zillow measured a decade ago. The model did not invent these cliches. It inherited them. The difference is that a human agent in 2015 used "Welcome to" maybe one listing in ten. The model uses it 51 listings in 53.`,
    },
    {
      heading: "The other overused patterns",
      body: `"Stunning" and "spacious" each appeared in 43 of 53 ChatGPT outputs. Eighty-one percent. "Dream home" appeared in 36 outputs. Sixty-eight percent. "Boasts" appeared in 35. "Beautiful" in 34. The pattern is not that ChatGPT uses one cliche heavily. It is that ChatGPT uses the entire top ten simultaneously across nearly every output. A single ChatGPT listing contains multiple of these phrases stacked on top of each other. The reader's pattern-match fires on the first sentence and never stops firing.\n\nBy comparison, "stunning" appears in 11 of 53 Zillow originals. Twenty-one percent. "Spacious" in 18 originals. Thirty-four percent. Human agents use cliches. The difference is that 21 percent is survivable and 81 percent is not. The tool is not wrong to use the category of language. It is wrong to use it this much.`,
    },
    {
      heading: "What a 7-out-of-10 listing actually looks like",
      body: `Across 159 total outputs in the three datasets, exactly three scored 7 out of 10 or higher. None came from ChatGPT.\n\nThe first came from the Zillow originals. It opened in all capital letters with a specific named benefit: downtown Nashville views from every level. The all-caps format is a risk, not a recommendation. The lesson is what the sentence actually does. It names a specific benefit, specifies where the benefit applies, and puts a confident claim on it. No template word. No greeting. By word seven, the reader knows the single thing that makes this property worth reading about.\n\nThe second came from Montaic's default path. It opened with "Exceptional Stone Oak Builders custom home built in 2022, situated on a private 1.28-acre lot in the prestigious Radnor Lake neighborhood." The first word is a template word. But the rest of the sentence lands four specific facts. Named builder. Build year. Lot size. Named neighborhood. Sentence one satisfies what we are about to call the three-sentence rule.\n\nThe third came from Montaic's default path. It opened with "Exceptional single-family residence in Brentwood offering 3,700 square feet of thoughtfully designed living space." Sentence one is generic. The grader flagged it specifically. Sentence two lands $45,000 in Pella windows and doors with transferable warranty. Dollar amount, named brand, confirmed benefit. The listing still scored 7 out of 10. Generic opening, specific body by sentence two, rescued score.\n\nWhat the three outliers share is not a great opening line. Two of the three open with the template word "Exceptional." What they share is that by the end of sentence three, each one has named at least one fact that only applies to that specific property. A dollar amount, a named brand, a measurement, a year, or a confirmed benefit. The other 156 outputs across the three datasets do not do that by sentence three. ChatGPT's outputs do not do it in the first paragraph.`,
    },
    {
      heading: "The three-sentence rule",
      body: `Here is the action.\n\nOpen your last listing. Count three sentences. In those three sentences, at least one of the following must appear: a dollar amount, a named brand, a measurement, a year, or a confirmed benefit. "Confirmed benefit" means a specific thing the property does for the buyer that is not a vague adjective. "Energy-efficient windows" is an adjective. "$45,000 Pella windows with transferable warranty" is a confirmed benefit.\n\nIf your first three sentences do not contain one of the five, rewrite.\n\nThat is it. That is the rule. You do not need to write a clever opening. You do not need to avoid the template words. You need to make sure that when a buyer has read for five seconds, they have encountered a specific, property-unique fact.\n\nZillow's 2018 research analyzed 3.6 million home sales and found that listings mentioning specific features earned sellers a 29 percent higher sale price than listings without those terms. Not 2 percent. Twenty-nine. The commercial evidence for specificity is extraordinarily strong. The three-sentence rule just makes it habitual.`,
    },
    {
      heading: "What to do this week",
      body: `Four actions. They take about thirty minutes total.\n\n1. Pull your last five listings. Not your favorites. The last five in chronological order.\n2. For each, count to the end of sentence three. Highlight any phrase that is a dollar amount, a named brand, a measurement, a year, or a confirmed benefit.\n3. Count the listings where no highlights appear. If more than zero, the rule is not habit yet.\n4. Before you publish your next listing, run the same check. If sentence three is still vague, rewrite sentence three until a specific fact lands.\n\nThat is the entire change. No tool, no process, no template. A thirty-minute audit and a habit.`,
    },
    {
      heading: "The honest note on tools",
      body: `Every tool that writes listing descriptions has to decide what happens before the writing starts. ChatGPT's answer is: nothing. You hand it the MLS block, it generates text. The model has no mechanism for deciding which facts matter enough to land in the first three sentences. It optimizes for plausibility against the corpus average, which means the opening is whatever the corpus average opens with.\n\nMontaic's answer is that a fact-surfacing layer runs before the writing layer. The tool identifies the specific, property-unique facts first and makes sure they are in the writing context when the draft begins. That is why both Montaic 7 out of 10 outputs have their specificity landing by sentence two even when sentence one is generic. The tool had the facts in hand when the draft started. ChatGPT did not.\n\nThis is not a claim that Montaic writes great openings. Both Montaic 7s open with the template word "Exceptional." This is a claim that Montaic's architecture makes the three-sentence rule easier to satisfy by default, and the score distribution reflects that: ChatGPT zero outputs above 4 out of 10, Montaic two outputs above 6 out of 10. The tools are solving different problems even though they both produce text.\n\nThe next piece in this series will run the voice-locked version of the Nashville 53 experiment, where Montaic's style layer is calibrated against an agent's own past listings. We expect the opening-word template pattern to drop significantly in that run because the style layer has specific word choices to pull from. Until then, the three-sentence rule is available to every agent for free. It does not require Montaic. It requires thirty minutes.`,
    },
    {
      body: `ChatGPT's 96 percent opening phrase is not a quirk. It is the most visible evidence of a tool that cannot distinguish one property from another. The tool is not broken. The tool is working exactly as trained. The training just happens to be unsuited to the task.\n\nThe fix is not a better prompt. The fix is a habit that runs before the prompt. Three sentences. One specific fact. Monday morning.`,
    },
  ],
  faqs: [
    {
      question: "Are you saying agents should never use ChatGPT for listings?",
      answer: "No. Whatever tool you use, the first three sentences need a specific, property-unique fact in them. ChatGPT makes that harder because its default output does not include such facts. If you use ChatGPT, you will need to edit the output before publishing. If you audit and edit, you can use any tool.",
    },
    {
      question: "Does the 96 percent figure apply outside Nashville?",
      answer: "Our data is Nashville-specific. The mechanism (training distribution collapse on common opening phrases) is not Nashville-specific. We would expect the figure to land in the 85 to 98 percent range for any metro the model has been exposed to during training. We have not run the experiment in other metros yet.",
    },
    {
      question: "Why does the three-sentence rule cut off at sentence three?",
      answer: "Buyer attention on listing pages drops off within the first few lines of description text, and the platforms that host listings often display only the opening lines before requiring a click to expand. Getting a specific fact into sentence three means the fact is likely visible in the preview pane. Cutting off at sentence five would work too. Sentence three is the tighter discipline and it produces the same effect.",
    },
    {
      question: "What counts as a confirmed benefit versus a vague adjective?",
      answer: "A confirmed benefit is a specific thing the property does that can be verified. Energy-efficient windows is vague. Pella windows with transferable warranty is confirmed. Great schools nearby is vague and a Fair Housing risk. Half a mile from the highway interchange is confirmed. The test is whether a skeptical buyer could challenge the claim and you could answer with a document or a measurement.",
    },
    {
      question: "Does this apply to the listing headline or just the body?",
      answer: "The body. Headlines operate under different constraints including character limits, platform rules, and MLS field requirements. The three-sentence rule applies to the first three sentences of the description body, which is the field agents control most directly.",
    },
    {
      question: "Will ChatGPT get better at this?",
      answer: "Probably yes on the opening phrase specifically, once enough agents and trainers flag the issue. Unlikely on the underlying training-distribution problem, because the 2024 and 2025 mode collapse research shows the issue is structural to how these models learn. The tools that solve the distribution problem will be the ones that run fact-surfacing logic before the writing step, which is a different architecture than general-purpose chat models. Our bet is that you should not wait for the generic tool to catch up. Run the three-sentence audit now.",
    },
  ],
  cta: { text: "Grade your listing free", href: "/listing-grader" },
},
```

---

## A16.P2: Post-publish back-propagation

When A16 is live, update A13 and A14 in `posts.ts` to add A16 as a reciprocal `mentions` entry in each.

**A13 (`zillow-listings-all-sound-the-same`) mentions array:**

```typescript
// In the zillow-listings-all-sound-the-same post, update the mentions array:
mentions: [
  { "@type": "CreativeWork", name: "Fair Housing Act Listing Description Rules: The Words You Cannot Use in 2026", url: "https://montaic.com/blog/fair-housing-listing-description-rules" },
  { "@type": "CreativeWork", name: "We Ran 53 Nashville Listings Through ChatGPT. Here Is What Happened.", url: "https://montaic.com/blog/chatgpt-53-nashville-listings" },
  { "@type": "CreativeWork", name: "Why 96 Percent of ChatGPT Listings Open With the Same Two Words", url: "https://montaic.com/blog/96-percent-chatgpt-listings-opening" },
],
```

**A14 (`chatgpt-53-nashville-listings`) mentions array:**

```typescript
// In the chatgpt-53-nashville-listings post, update the mentions array:
mentions: [
  { "@type": "CreativeWork", name: "Why Zillow Listings All Sound the Same (And Why It's Costing Agents Leads)", url: "https://montaic.com/blog/zillow-listings-all-sound-the-same" },
  { "@type": "CreativeWork", name: "Fair Housing Act Listing Description Rules: The Words You Cannot Use in 2026", url: "https://montaic.com/blog/fair-housing-listing-description-rules" },
  { "@type": "CreativeWork", name: "Why 96 Percent of ChatGPT Listings Open With the Same Two Words", url: "https://montaic.com/blog/96-percent-chatgpt-listings-opening" },
],
```

Preserve whatever else is already in each mentions array. If A13 or A14 already has entries beyond what is shown here, keep them and add the A16 entry at the end. The shape above reflects the expected state after all prior reciprocal updates have landed.

Build, commit, push after the back-propagation update. Same pattern as the A11/A12 reciprocal update that shipped 2026-04-10 and the A15 reciprocal update.

---

## Report back to Lance

After landing:
1. Confirm `https://montaic.com/blog/96-percent-chatgpt-listings-opening` returns 200 (may return 404 until Vercel deploys)
2. Confirm the post does NOT yet appear in the blog index at `https://montaic.com/blog` because `draft: true` hides it
3. Ping Lance with "A16 is staged, draft: true, ready for your read"
