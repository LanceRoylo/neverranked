# A14 Draft: We Ran 53 Nashville Listings Through ChatGPT. Here Is What Happened.

---

## BODY (paste into sections array)

---

### Section 0 (no heading — opening hook)

After A13 shipped, the most common follow-up I heard was some version of this: "Fine, but what does the ChatGPT version actually look like, and is Montaic actually better or is that just marketing?" It is a fair question. So I ran the experiment.

Same 53 Nashville listings from the original dataset. Same grader. Three processors: the original Zillow listings, ChatGPT using gpt-4o-mini, and Montaic using the default product path. Same rubric on all three. No cherry-picking. The scores are below.

The short version: ChatGPT produced listings that scored lower than the Zillow originals on average. Montaic scored higher. The gap between ChatGPT and Montaic was 1.5 points across 53 listings. That is the number. The rest of this piece shows the work.

---

### Section 1: How the experiment worked

The dataset is the same 53 Nashville listings pulled from Zillow in April 2026 that A13 used. For each listing, I extracted the structured facts: bed count, bath count, square footage where listed, neighborhood, and up to 15 key physical features. Both the ChatGPT run and the Montaic run consumed the same structured facts payload, not the original prose. That is the control. If both tools start from the same raw data, the output difference is a function of the tool, not the input.

For ChatGPT, the prompt approximated what an agent would actually type: write an MLS listing description for a property with these specs. No prompt engineering, no system prompt tuning, no few-shot examples. The version used was gpt-4o-mini, which is the free-tier model as of April 2026. This is the model most agents are actually using.

For Montaic, I used the default product path: the same path an agent gets when they sign up today, without a writing-style upload. The voice-locked path that agents can enable after uploading a few past listings would score higher on the voice dimensions, but that is not a fair comparison against a cold ChatGPT run. The default path is the honest comparison.

Each output was graded against the same five-category rubric: specificity, emotional appeal, structure and flow, Fair Housing compliance, and cliche avoidance. Scores run from 1 to 10. The grader runs on the same model stack regardless of which dataset it is evaluating.

---

### Section 2: The scorecard

The numbers, across all three datasets:

- Zillow originals: 4.6/10 average across 53 listings
- ChatGPT (gpt-4o-mini): 3.6/10
- Montaic (default path): 5.1/10

ChatGPT scored 1 point lower than the Zillow listings it was given. Every single ChatGPT output landed in the 3 to 4 range. Not one scored above 4. Not one scored below 3. The distribution is a flat line.

Montaic had more variance: 21 listings in the 3 to 4 range, 30 in the 5 to 6 range, and 2 at 7. The ceiling is higher and the floor is higher.

By category:

**Specificity.** Originals: 6.4. ChatGPT: 5.1. Montaic: 6.0. ChatGPT loses specificity despite having the same facts in the prompt. The model fills space with descriptive adjectives instead of using the facts it was given.

**Cliche avoidance.** Originals: 4.2. ChatGPT: 1.8. Montaic: 3.7. This is where ChatGPT collapses. A score of 1.8 means almost every listing had what the grader called a "cliche avalanche." The Zillow originals, for all their problems, still beat ChatGPT on cliche avoidance by more than 2 points.

**Fair Housing.** Originals: 5.5. ChatGPT: 4.7. Montaic: 6.7. ChatGPT produced Fair Housing flags on multiple listings. The grader flagged "steering language" in 2 ChatGPT outputs as a top issue. Montaic scored highest here and still had 2 flagged outputs, which is consistent with what I said in A12: no scanner catches 100 percent.

**Structure and flow.** Originals: 4.5. ChatGPT: 4.4. Montaic: 5.3. ChatGPT and Zillow are essentially tied. Montaic improves on both.

**Emotional appeal.** Originals: 4.5. ChatGPT: 4.6. Montaic: 4.2. The one category where ChatGPT narrowly beats Montaic, and where Montaic's default path (no voice calibration) is weakest. This is the tradeoff: Montaic's default path optimizes for structure and compliance, which sometimes comes at the cost of warmth. The voice-locked path is where that gap closes.

---

### Section 3: What ChatGPT actually produced

Here is the ChatGPT output for a 4-bedroom, 3-bath custom home in Cleveland Park. The original Zillow description was 412 words. ChatGPT received the structured facts: 4 beds, 3 baths, Cleveland Park, and 12 key features including a chef's kitchen, scullery, formal dining room with wet bar, dedicated office with steel doors, primary suite with soaking tub, screened patio, and a 699-square-foot detached garage apartment.

ChatGPT's output opened: "Welcome to your dream home in the highly sought-after Cleveland Park of Nashville, Tennessee! This stunning 4-bedroom, 3-bathroom residence seamlessly blends modern elegance with functional living."

The grader score: 4/10. Cliche avoidance: 2/10. The grader's note: "Cliche avalanche: 'Welcome to your dream home', 'highly sought-after', 'stunning', 'seamlessly blends', 'boasting', 'culinary enthusiast's paradise.'"

The features are technically in the output. But they are wrapped in so much boilerplate that the distinctive details disappear. The DADU apartment (699 square feet, a genuine differentiator for buyer profiles who want rental income or multi-generational space) gets one sentence. The steel-door office gets turned into "elegant French doors." ChatGPT smooths out the unusual details and amplifies the generic ones.

Across 53 listings, ChatGPT opened 96 percent of them with "Welcome to." Fifty-one out of fifty-three. The grader flagged "stunning" in 81 percent of outputs and "spacious" in 81 percent. "Dream home" appeared in 68 percent. "Boasts" in 66 percent. Five outputs included the literal phrase "MLS Description:" as the first two words, meaning the model included its own prompt framing in the output.

This is the trained-on-everything problem that A13 described. ChatGPT learned to write real estate listings from a corpus that included millions of Zillow, Realtor.com, and Redfin descriptions. That corpus is the average. So the output is the average. Not a bad average, but not a useful one either, because every other agent using ChatGPT is producing the same average.

---

### Section 4: What Montaic produced on the same facts

The Montaic output for the same Cleveland Park property opened: "Exceptional single-family residence in sought-after Cleveland Park featuring 4 bedrooms and 3 bathrooms with sophisticated finishes throughout."

Score: 6/10. An improvement over both the ChatGPT version (4/10) and the original Zillow listing. The grader's main knock was that "luxury lighting package" and "sought-after" are still generic. Fair criticism.

The strongest Montaic output in the dataset came from a Brentwood property. Score: 7/10. The output opened with a dollar figure: "$45,000 in Pella windows and doors with transferable warranty, flooding interiors with natural light while ensuring energy efficiency." The grader rewarded this because it names a specific investment, not an adjective. A buyer who cares about energy costs and capital expenditures has concrete information to act on.

Montaic's filler-phrase frequency was significantly lower than ChatGPT's. "Welcome to" appeared in 13 percent of Montaic outputs versus 96 percent of ChatGPT's. "Stunning" in 15 percent versus 81 percent. "Spacious" in 19 percent versus 81 percent. These are not small gaps.

Montaic also had 5 near-duplicate openings out of 53 outputs, same as ChatGPT. "This thoughtfully designed single family residence" and "Exceptional single-family residence" appeared multiple times. That is a real limitation of the default path without voice calibration: the model has a set of learned opening patterns, and without a style sample to deviate from them, it recycles them on similar property types.

---

### Section 5: Why the gap exists

The reason ChatGPT produces listings that score 1 point below the Zillow originals is the same reason every listing on Zillow sounds the same, which is the reason A13 exists.

ChatGPT was trained on everything. That training corpus includes tens of millions of real estate listings, marketing copy, and property descriptions scraped from the web. When you give it a Nashville listing prompt, it produces the statistical average of every real estate listing it has ever processed. The average is bland. The average uses "Welcome to." The average says "stunning" and "boasts" and "dream home" because those are the most common words in the training distribution.

Montaic's default path is trained on a narrower corpus. It makes different tradeoffs. It optimizes harder for structure and Fair Housing compliance, which shows up in the scores. It does not automatically produce warmer or more emotionally resonant copy on a cold run, which also shows up in the scores.

The voice-locked path is where the gap widens further. When the model has a sample of your past listings, it learns which of your specific openings and phrasing patterns to replicate instead of defaulting to the statistical average. That is the differentiation argument from A13, now with a measured baseline to compare against.

---

### Section 6: What this means for agents already using ChatGPT

Most agents using ChatGPT for listings are not doing it wrong. They are trying to save time on a task they find tedious, and ChatGPT does save time. The output is grammatically clean, structurally coherent, and covers the features.

The problem is that it is indistinguishable from every other agent's ChatGPT output. When your listing reads like 96 percent of listings on Zillow start with "Welcome to," it does not read like you. And Zillow's own research on 2.8 million listings, cited in A13, shows that the specific, concrete descriptions of the kind that get buried under ChatGPT's boilerplate are the ones correlated with higher sale prices and fewer days on market.

Three practical steps if you are currently using ChatGPT for listings:

First, look at the last 5 listings you published. Open each one and count how many times "Welcome to," "stunning," "boasts," or "dream home" appears. If you see those words in three or more listings, your descriptions are interchangeable. Buyers who see multiple listings from you will notice before you do.

Second, if you are going to keep using ChatGPT, at least run the output through a rubric before publishing. The grader at montaic.com/listing-grader is free and will score any listing description against the same five categories. It will tell you specifically which phrases are dragging the score down.

Third, if you want output that does not sound like everyone else's, the tool needs a sample of your writing to deviate from the average. That is what the voice calibration step in Montaic does. It takes three to five of your past listings, extracts your specific phrasing patterns, and uses those as the baseline instead of the statistical average.

---

### Section 7: The honest note on the Montaic numbers

The experiment was run by the person who built Montaic, using Montaic's own grader. That is a conflict of interest worth naming.

Two things reduce it. First, the rubric is published and the methodology is reproducible. The Nashville 53 dataset was used in A13 and is the same dataset here. Any agent with the same listings and access to a grader can run the same experiment. Second, Montaic did not win every category. ChatGPT scored higher on emotional appeal. Montaic's default path produced near-duplicate openings at the same rate as ChatGPT. Those findings would not be in the article if the goal were to manufacture a result.

The numbers show what they show. ChatGPT at 3.6, Zillow originals at 4.6, Montaic default at 5.1. The delta between ChatGPT and Montaic is 1.5 points. Whether that is meaningful depends on how much your listing descriptions matter to your business. That is a judgment call I cannot make for you.

---

### Section 8: Frequently asked questions

Which ChatGPT version did you use? gpt-4o-mini, the free-tier model as of April 2026. This is the version most agents are actually using. The paid-tier models (gpt-4o, o1) would likely score differently, particularly on cliche avoidance, but the free-tier version is the honest comparison for what the category is actually producing.

Is this experiment reproducible? Yes. The 53 Nashville listings are the same public Zillow dataset used in A13. The structured facts payload, the grader rubric, and the prompt templates used for both the ChatGPT and Montaic runs can be reconstructed from the methodology described here. If you want to run the same experiment on a different market, the grader at montaic.com/listing-grader handles any listing.

What does the rubric actually measure? Five categories: specificity (are there concrete facts, or just adjectives), emotional appeal (does the copy create desire, or just describe rooms), structure and flow (does the description build a case for the property, or march through rooms), Fair Housing compliance (are there phrases that could violate the Act), and cliche avoidance (how many overused real estate phrases appear). Each category scores from 1 to 10. The overall score is the average.

Did you cherry-pick the listings or the outputs? No. All 53 original Zillow listings were run through both tools. All 53 outputs from each tool were graded. No listings were excluded from the averages. The near-duplicate pairs in each dataset are noted in the three-way comparison JSON.

What happens if you run this in a different market? I do not know. Nashville is a high-volume residential market with a wide range of property types, which is why it was used for both A13 and A14. A luxury-only market or a commercial-heavy market would likely produce different absolute scores. The relative rankings across the three tools would probably be similar because the training-data problem that drives the ChatGPT result is not market-specific.

Can I run my own listings through the grader? Yes. montaic.com/listing-grader is free. Paste any listing description and it scores it against the same five categories. You can compare your current listings against the Nashville averages: ChatGPT average 3.6, Zillow original average 4.6, Montaic default average 5.1.

---

### Section 9: Closing

The question A13 raised was why every listing sounds the same. The answer was the training data problem: every tool was trained on the average, so every tool produces the average.

A14 tested that claim with an experiment. The result is that ChatGPT, given the same facts as the Zillow originals, produced output 1 point lower than the originals on average. Montaic, on the default path without voice calibration, produced output 0.5 points higher.

The gap between ChatGPT and Montaic is 1.5 points. That is a controlled experiment on 53 listings in one market, with a published rubric, using the free-tier version of each tool. If you want to see where your own listings land, the grader is at montaic.com/listing-grader.

For more on the Fair Housing compliance dimension that the grader measures, see [Fair Housing Act Listing Description Rules: The Words You Cannot Use in 2026](/blog/fair-housing-listing-description-rules).
