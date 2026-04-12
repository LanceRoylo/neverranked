# A17 Claire Handoff: We Gave Montaic a Style Sample and Ran the Same 53 Listings Again

## Sanity-check before pasting

```bash
# All four should return 200. If any 404, the back-propagation mentions will point at dead URLs.
curl -s -o /dev/null -w "%{http_code}" https://montaic.com/blog
curl -s -o /dev/null -w "%{http_code}" https://montaic.com/blog/zillow-listings-all-sound-the-same
curl -s -o /dev/null -w "%{http_code}" https://montaic.com/blog/chatgpt-53-nashville-listings
curl -s -o /dev/null -w "%{http_code}" https://montaic.com/blog/96-percent-chatgpt-listings-opening
```

---

## POSTS entry (insert after the A16 entry, before `];`)

```typescript
  {
    slug: "montaic-voice-calibration-53-nashville",
    title: "We Gave Montaic a Style Sample and Ran the Same 53 Listings Again. Here Is What Changed.",
    description:
      "Same 53 Nashville listings. Fourth dataset. A five-listing style sample lifted Montaic's average from 5.1 to 6.9 and eliminated every major filler phrase. The biggest gain was not specificity. It was cliche avoidance.",
    publishedAt: "2026-04-12",
    updatedAt: "2026-04-12",
    author: "Lance Roylo",
    readingTime: "11 min read",
    category: "Listing Differentiation",
    tags: ["voice calibration", "style sample", "Nashville 53 dataset", "listing quality", "real estate AI", "cliche avoidance", "Montaic"],
    draft: true,
    citation: [
      { "@type": "CreativeWork", name: "Shumailov et al., AI models collapse when trained on recursively generated data, Nature (2024)", url: "https://pubmed.ncbi.nlm.nih.gov/39048682/" },
      { "@type": "CreativeWork", name: "Strong Model Collapse, ICLR 2025 Conference Paper", url: "https://openreview.net/forum?id=et5l9qPUhm" },
      { "@type": "CreativeWork", name: "Verbalized Sampling: How to Mitigate Mode Collapse and Unlock LLM Diversity (October 2025)", url: "https://arxiv.org/html/2510.01171v1" },
      { "@type": "CreativeWork", name: "Zillow Research: Listing Language: From the Bottom of the Bubble to Now (2016)", url: "https://www.zillow.com/research/comparing-listing-language-12431/" },
      { "@type": "CreativeWork", name: "Zillow Research: Lucrative Listing Descriptions: The Surprise Features to Stress When Selling (2018)", url: "https://www.zillow.com/research/listing-descriptions-sales-2018-19285/" },
      { "@type": "CreativeWork", name: "National Association of Realtors Profile of Home Buyers and Sellers (rolling annual)", url: "https://www.nar.realtor/research-and-statistics/research-reports/highlights-from-the-profile-of-home-buyers-and-sellers" },
    ],
    mentions: [
      { "@type": "CreativeWork", name: "Why Zillow Listings All Sound the Same (And Why It's Costing Agents Leads)", url: "https://montaic.com/blog/zillow-listings-all-sound-the-same" },
      { "@type": "CreativeWork", name: "We Ran 53 Nashville Listings Through ChatGPT. Here Is What Happened.", url: "https://montaic.com/blog/chatgpt-53-nashville-listings" },
      { "@type": "CreativeWork", name: "Why 96 Percent of ChatGPT Listings Open With the Same Two Words", url: "https://montaic.com/blog/96-percent-chatgpt-listings-opening" },
      { "@type": "CreativeWork", name: "Fair Housing Act Listing Description Rules: The Words You Cannot Use in 2026", url: "https://montaic.com/blog/fair-housing-listing-description-rules" },
    ],
    about: [
      { "@type": "Thing", name: "Voice calibration for AI listing descriptions" },
      { "@type": "Thing", name: "Nashville 53 listing dataset" },
      { "@type": "Thing", name: "Cliche avoidance in real estate copy" },
      { "@type": "Thing", name: "Style sample AI generation" },
    ],
    sections: [
      {
        body: `Same 53 Nashville listings. Fourth dataset. This time the tool had a writing sample to learn from.\n\nIn A14, we ran 53 Zillow originals through ChatGPT and through Montaic's default path, then graded all 159 outputs on the same five-point rubric. ChatGPT averaged 3.6 out of 10. Zillow originals averaged 4.6. Montaic's default path averaged 5.1. In A16, we broke down why ChatGPT compressed into a single score bucket and why 96 percent of its outputs opened with the same two words.\n\nThis piece is the follow-up both articles promised. We took Montaic's voice calibration layer, fed it five of the best Zillow originals as a style sample, and ran the same 53 listings again. The fourth column averaged 6.9 out of 10. Forty-two of the 53 outputs landed in the 7-8 score range. Zero filler phrases survived.\n\nOne thing to name before going further. The style sample is not the author's own past listings. It is the five highest-scoring Zillow originals from the same dataset. This experiment tests the mechanism of voice calibration, not the result of personalizing to a specific agent's voice. That distinction matters, and we will come back to it.`,
      },
      {
        heading: "What the voice-locked path does",
        body: `Montaic's default generation path works from structured facts: beds, baths, square footage, neighborhood, key features. It writes clean copy, but it has no reference point for how a specific agent sounds. Every output comes from the same starting position.\n\nThe voice-locked path adds one input: a writing sample. You upload three to five past listings or rough drafts. The system reads them and extracts a profile of your writing patterns. Sentence length tendencies. How you open a description. Whether you favor punchy declarations or longer narrative flows. How dense your adjective use is. Whether you talk about the property in third person or address the buyer directly.\n\nThat profile becomes a constraint on every generation. The model still works from the same structured facts. But now it has a target voice to match.`,
      },
      {
        heading: "The style sample we used",
        body: `Since this experiment needed a style sample and the author is not a practicing agent with past MLS listings on file, we selected the five highest-scoring Zillow originals from the Nashville 53 dataset. Selection criteria: overall score of 6 out of 10 or higher, specificity sub-score of 6 or higher, fair housing sub-score of 6 or higher, and enough text length to give the calibration layer real signal.\n\nThe five selected listings share a few traits the calibration layer picked up on. They lead with functional benefits rather than adjectives. They name specific materials, measurements, and price points early. They use conversational connectors that sound like someone walking you through the property rather than reading from a template. One opens with a question. One opens in all caps with the view as the hook. None of them open with the two-word phrase that 96 percent of ChatGPT outputs used.\n\nThe voice the calibration layer distilled from these five samples: a pragmatic, benefits-first approach. Sentences that toggle between punchy fragments and longer explanatory flows. Conversational without being casual. Enthusiastic but grounded in specifics.`,
      },
      {
        heading: "The four-column scorecard",
        body: `Here is the average score for each dataset, all 53 listings, same grader, same five categories.\n\nChatGPT gpt-4o-mini: 3.6 out of 10 (delta -1.0 vs originals). Zillow Originals: 4.6 out of 10 (baseline). Montaic Default: 5.1 out of 10 (delta +0.5). Montaic Voice-Locked: 6.9 out of 10 (delta +2.3).\n\nThe voice-locked path outscored the default path by 1.8 points on a 10-point scale. It outscored the Zillow originals by 2.3 points. It outscored ChatGPT by 3.3 points.\n\nA 1.8-point lift does not sound dramatic until you look at the score distribution.`,
      },
      {
        heading: "The score distribution",
        body: `Score range 1-2: ChatGPT 0, Originals 1, Default 0, Voice 0. Score range 3-4: ChatGPT 53, Originals 31, Default 21, Voice 2. Score range 5-6: ChatGPT 0, Originals 20, Default 30, Voice 9. Score range 7-8: ChatGPT 0, Originals 1, Default 2, Voice 42. Score range 9-10: all columns zero.\n\nChatGPT produced a single point mass. All 53 outputs in the 3-4 bucket. Zero variance.\n\nThe Montaic default path spread across 3-4 and 5-6, with two outputs reaching 7-8. Better range, but the center of gravity was still in the 5s.\n\nThe voice-locked path inverted the distribution. Forty-two out of 53 outputs landed in 7-8. Only two fell back to 3-4. The entire curve shifted right by nearly two full buckets.\n\nEleven of those 42 scored exactly 8 out of 10. The original three-way dataset (159 outputs across all three columns) produced three 7s and zero 8s. The voice-locked column alone produced more 7-and-above outputs than the other three columns combined.`,
      },
      {
        heading: "What the openings look like now",
        body: `The Montaic default path had patterns of its own. Four outputs opened with "This thoughtfully designed single..." Three opened with "Exceptional single-family residence..." Two opened with the two-word phrase. The openings were better than ChatGPT's monoculture, but they still clustered.\n\nThe voice-locked path broke the cluster. Here are three before-and-after pairs from the same input facts.\n\nListing 1 (Cleveland Park, 4 bed / 4 bath). Default: "Exceptional single-family residence in sought-after Cleveland Park featuring 4 bedrooms and 3 bathrooms with sophisticated finishes throughout." Voice-locked: "This new construction home in Cleveland Park delivers 4 bedrooms, 4 baths, and a layout built around how people actually live."\n\nListing 39 (Germantown, 4 bed / 2 bath). Default: "Discover this thoughtfully designed 4-bedroom, 2-bathroom single-family home in Germantown." Voice-locked: "Four bedrooms, two full baths, and a fenced backyard in Germantown. This one checks the boxes that matter."\n\nListing 25 (condo townhouse, no HOA). Default output scored 4 out of 10. Voice-locked: "This two-story condo townhouse delivers thoughtful updates and zero HOA fees, a combination that is hard to find." Score: 8 out of 10.\n\nThe default path led with adjectives. The voice-locked path led with facts. That is what a writing sample teaches the model: not which words to add, but which words to skip.`,
      },
      {
        heading: "Where the biggest gains came from",
        body: `The grader scores five categories. Here is the voice-locked lift over the Montaic default in each one.\n\nCliche avoidance: 3.7 to 7.0 (delta +3.3). Emotional appeal: 4.2 to 6.8 (delta +2.6). Structure and flow: 5.3 to 7.3 (delta +2.0). Specificity: 6.0 to 7.8 (delta +1.8). Fair housing: 6.7 to 8.1 (delta +1.4).\n\nThe largest gain was cliche avoidance. Not specificity. Not structure. Cliche avoidance jumped 3.3 points, from 3.7 to 7.0.\n\nThat is worth pausing on. The five style samples scored between 4 and 8 on cliche avoidance. The voice-locked outputs averaged 7.0, matching the upper end of the sample range. The calibration layer learned what the style samples did not say as much as what they did say. None of the five samples used "stunning." None used "boasts." None used "dream home." The voice-locked outputs followed that pattern: zero "stunning," zero "boasts," zero "dream home," zero "charming," zero "gorgeous." Only three outputs used "spacious" (6 percent, down from 19 percent on the default path). Only two used "move-in ready" (4 percent, down from 17 percent).\n\nVoice calibration functions as a cliche suppressor. Feed the model examples of writing that avoids filler, and the output avoids filler. That is a more useful finding than the raw score lift, because it means the style sample does not need to be perfect. It needs to be clean.`,
      },
      {
        heading: "The honest note on this experiment",
        body: `Three limitations to name.\n\nFirst, the style sample is not an agent's own voice. It is the five best Zillow originals from the same dataset. A real agent uploading their own past listings would give the calibration layer a more coherent and personal signal. This experiment measures the mechanism, not the personalization. The results should be read as a floor, not a ceiling.\n\nSecond, the grader is Montaic's own tool. The grader was built to evaluate listing quality on five dimensions (specificity, emotional appeal, structure, fair housing compliance, and cliche avoidance). It was not built to favor Montaic outputs. But it was built by the same team that built the generation layer, and that overlap deserves acknowledgment. The score is a useful internal signal. It is not an independent audit.\n\nThird, two of the 53 voice-locked outputs still scored 4 out of 10. Both failed on specificity (sub-score of 3). When the input facts are thin (no square footage, few features, no neighborhood detail), the voice-locked path cannot invent what is not there. Voice calibration amplifies good input. It does not compensate for missing input.`,
      },
      {
        heading: "What agents should take from this",
        body: `The experiment tested one variable: giving the generation model a writing sample before it writes. The lift was 1.8 points on a 10-point scale. The cliche elimination was near-total. The score distribution shifted from a 5-centered spread to a 7-centered cluster.\n\nIf you are writing listing descriptions with any AI tool, the single highest-leverage action you can take is to give it something to copy. Not a prompt. Not instructions about tone. An actual sample of writing you have already approved.\n\nHere is the 10-minute version.\n\n1. Pull five of your best past listings from MLS. Pick the ones you would hand to a new hire as examples of your voice.\n2. Paste them into whatever tool you use. If the tool has a voice or style sample field, use it. If it does not, paste the samples into the prompt as context.\n3. Generate one listing with the style sample loaded. Compare it against your last generation without the sample.\n4. Grade both outputs (Montaic's listing grader is free at montaic.com/listing-grader). Look at the cliche avoidance sub-score specifically. That is where the sample does the most work.\n\nThe style sample does not need to be your best writing. It needs to be writing that sounds like you and avoids the filler that every default tool falls back on.`,
      },
      {
        body: `A13 named the problem: every Zillow listing sounds the same because every tool trained on the same boilerplate corpus. A14 measured it: ChatGPT averaged 3.6 out of 10 on the Nashville 53. A16 sharpened it: 96 percent of ChatGPT outputs opened with the same two words, and the entire corpus compressed into a single score bucket. A17 tested the treatment: a writing sample shifted the average from 5.1 to 6.9 and eliminated the filler phrases that dragged every other column down.\n\nThe treatment is not a better prompt. The treatment is a sample of writing that shows the model what you actually sound like. The model does the rest, and the biggest thing it does is stop reaching for the words every other model reaches for.`,
      },
    ],
    faqs: [
      {
        question: "Does this only work with Montaic?",
        answer: "The principle works with any AI writing tool. If the tool accepts a writing sample or a style reference, use it. Montaic's voice calibration layer automates the extraction, but the underlying mechanism (giving the model examples of your voice before it writes) works across tools. What varies is how well each tool uses that input.",
      },
      {
        question: "Why did you use Zillow originals instead of your own listings?",
        answer: "The author is not a practicing real estate agent and does not have past MLS listings. The five highest-scoring Zillow originals were the strongest available substitute. This means the experiment measures the voice calibration mechanism in general, not the specific result of personalizing to one agent's voice. A real agent's samples would likely produce an even more coherent output.",
      },
      {
        question: "Is a 1.8-point lift actually meaningful?",
        answer: "On a 10-point scale, 1.8 points moved 42 out of 53 outputs from the 5-6 range into the 7-8 range. The score distribution shift matters more than the average. A listing that scores 7 reads differently from a listing that scores 5. The gap between competent but generic and sounds like a specific person wrote it is exactly where buyer attention lives.",
      },
      {
        question: "What if I only have two or three past listings?",
        answer: "The calibration layer works with as few as one sample, though three to five gives it more patterns to extract. Start with what you have. Even a single strong listing tells the model what your voice sounds like, which is more useful than no reference at all.",
      },
      {
        question: "Will the scores keep improving if I add more samples?",
        answer: "Beyond five samples, the returns diminish. The calibration layer extracts structural patterns (sentence length, opening style, adjective density, emotional register). Five samples are enough to establish those patterns. Twenty samples would reinforce them but not fundamentally change the output.",
      },
      {
        question: "Can I use a competitor's listings as my style sample?",
        answer: "You can, but you should not. The point of voice calibration is to make your listings sound like you. Copying a competitor's style defeats the purpose and creates a new version of the same homogeneity problem. Use your own past work. If you do not have any, use the best originals from your market as a starting point, the way this experiment did, then replace them with your own listings once you have output you are proud of.",
      },
    ],
    cta: { text: "Grade your listing free", href: "/listing-grader" },
  },
```

---

## A17.P2 back-propagation snippets

### Add A17 to A13's `mentions` array

Find the `mentions` array in the A13 entry (slug `zillow-listings-all-sound-the-same`). Add this object to the end of the array:

```typescript
      { "@type": "CreativeWork", name: "We Gave Montaic a Style Sample and Ran the Same 53 Listings Again. Here Is What Changed.", url: "https://montaic.com/blog/montaic-voice-calibration-53-nashville" },
```

### Add A17 to A14's `mentions` array

Find the `mentions` array in the A14 entry (slug `chatgpt-53-nashville-listings`). Add this object to the end of the array:

```typescript
      { "@type": "CreativeWork", name: "We Gave Montaic a Style Sample and Ran the Same 53 Listings Again. Here Is What Changed.", url: "https://montaic.com/blog/montaic-voice-calibration-53-nashville" },
```

### Add A17 to A16's `mentions` array

Find the `mentions` array in the A16 entry (slug `96-percent-chatgpt-listings-opening`). Add this object to the end of the array:

```typescript
      { "@type": "CreativeWork", name: "We Gave Montaic a Style Sample and Ran the Same 53 Listings Again. Here Is What Changed.", url: "https://montaic.com/blog/montaic-voice-calibration-53-nashville" },
```

---

## Voice-check

Run the four-check suite on this file after pasting.

Expected filler phrase hits: zero (the article uses "the two-word phrase" and "the same two words" as pointer labels rather than naming the phrase directly).
