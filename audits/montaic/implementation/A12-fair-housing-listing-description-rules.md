# A12: Fair Housing Act Listing Description Rules Pillar Article

**Client:** Montaic
**Action:** A12 (Pillar article, second in the Fair Housing cluster)
**Skeleton:** `remediation-template/content-skeletons/pillar-article-skeleton.md`
**Voice rubric:** `remediation-template/voice-rubric-v0.md`
**Neighbor reference:** `audits/montaic/implementation/A11-fair-housing-pillar-article.md` (first in cluster)
**Roadmap source:** `audits/montaic/07-roadmap.md` lines 109, 140 (fuses Month 2 format with Month 3 topic)
**Status:** Phase 1 frame set

---

## Topic

**Working title:** Fair Housing Act Listing Description Rules: The Words You Cannot Use in 2026

Declarative, specific year, explicit stakes (words you cannot use). Direct AEO query match for "fair housing listing description rules", "illegal words real estate listings", and "words not allowed in real estate listings".

**Alternate titles to consider during voice pass:**
- "42 U.S.C. § 3604(c): The Listing Description Words That Get Real Estate Brokers Sued"
- "Every Word Your Listing Description Cannot Say Under the Fair Housing Act"

## Why this topic for Montaic

The lever is **outsider triangulation**. Lance is not a real estate agent and does not have a PropTech SaaS background. Lance saw the listing description problem from three vantage points that almost no one else has at the same time: as a consumer reading listings on Redfin and Zillow, as a coffee shop owner who talks to agents every morning, and as a photographer and videographer shooting social media content for real estate agents. Each vantage point saw a piece of the problem. Montaic is the product that resulted from seeing all three at once.

That positioning is defensible in a way "we wrote the code" is not. Every PropTech company writes code. Very few founders in the space triangulated the problem from outside the industry, and none of Montaic's direct competitors can claim the same three vantage points, so the origin story passes the swap test cleanly.

This piece also closes the pincer on the Fair Housing cluster: A11 was "AI agents in Fair Housing compliance" (the strategic framing), A12 is "what the statute actually blocks in listing copy" (the operational detail). Together they cover both halves of the query space: the agent deciding whether to trust an AI tool (A11 audience) and the agent writing a specific listing right now (A12 audience).

## Authority anchor (skeleton section 4)

**Primary statute:** 42 U.S.C. § 3604(c) — makes it unlawful to make, print, or publish any notice, statement, or advertisement with respect to the sale or rental of a dwelling that indicates any preference, limitation, or discrimination based on race, color, religion, sex, handicap, familial status, or national origin.

**Primary regulatory interpretation:** 24 C.F.R. Part 100, Subpart H (HUD's discriminatory advertising regulations). Specifically § 100.75 (discriminatory advertisements, statements, and notices) lists the categories of language that constitute violations.

**Primary industry document:** NAR's Fair Housing advertising guidelines, which are the operational cheat sheet most brokerages actually work from. These are not the law but they are the industry's interpretation of the law and worth treating as the practical ceiling.

The piece should feel like Montaic is showing the reader how 3604(c) actually works in a listing context, not summarizing what a generic fair housing blog post would say. The tell: we cite the CFR section number, not just "HUD guidance".

## Required external citations (exactly 5 — final, locked Phase 2)

Per pillar-article-skeleton rule: exactly five external primary-source citations, no fewer.

1. **42 U.S.C. § 3604(c)** — Cornell Legal Information Institute (https://www.law.cornell.edu/uscode/text/42/3604)
2. **24 C.F.R. § 100.75** — eCFR (https://www.ecfr.gov/current/title-24/subtitle-B/chapter-I/subchapter-A/part-100/subpart-H/section-100.75)
3. **HUD 2024 AI Guidance memo** — https://archives.hud.gov/news/2024/pr24-098.cfm (intentionally shared with A11 to bind the cluster)
4. **NAR Fair Housing advertising resources** — https://www.nar.realtor/fair-housing
5. **FHEO Handbook 8025.1** — https://www.hud.gov/program_offices/administration/hudclips/handbooks/fheo/80251 (HUD's current enforcement handbook, replaces the withdrawn 1989 advertising memo as the citable HUD source)

**Citation #5 backstory worth working into the article:** The "Fair Housing Advertising Word and Phrase List" that circulates among real estate agents originated in a 1989/1995 HUD memo that has been technically withdrawn. It is no longer published on hud.gov. The list still circulates on third-party fair housing nonprofit sites because nothing replaced it. The current HUD authority is the statute (3604(c)) plus the regulation (24 C.F.R. § 100.75) plus the FHEO Handbook plus case law. This is a "thing worth understanding" no other AEO competitor article surfaces because they all just reprint the old list.

## Skeleton section checklist

- [ ] Title (declarative, specific stakes)
- [ ] Meta description (<=155 chars, does not repeat title phrase)
- [ ] TL;DR (80-150 words)
- [ ] Statute / authority section
- [ ] Two to three "things worth understanding"
- [ ] Real-world problem (3-5 paragraphs)
- [ ] Violations / gotchas list (5-7 items)
- [ ] What to do about it (4 steps)
- [ ] What Montaic does differently (product section, first-person origin)
- [ ] FAQ (5-8 questions, marked up as FAQPage schema)
- [ ] Closing + CTA

## Voice rubric pass (pre-publish)

Run `remediation-template/voice-rubric-v0.md` and confirm each hard-fail is clean:

- [ ] Em dash count: 0
- [ ] Semicolon count in marketing prose: 0
- [ ] AI filler phrase scan: clean
- [ ] Meta description does not start with title phrase
- [ ] No emojis in body
- [ ] Closing does not restate the intro
- [ ] Swap test: would it feel wrong if a competitor published it? (If no, rewrite.)
- [ ] Lever test: can you name the creative lever? Current answer: authority-from-product

Montaic-specific (from voice-rubric-v0.md client addendum):
- [ ] "The Montaic Method" capitalized correctly
- [ ] Terracotta #C17343 referenced correctly if color is called out
- [ ] 42 U.S.C. § 3604(c) cited with full section number on first mention

## Schema required

- BlogPosting (primary)
- FAQPage (from the FAQ section)
- BreadcrumbList

All three in a single `@graph` payload on the page. Match the pattern used in A11 (Fair Housing cluster sibling) — keeping the cluster structurally consistent helps Google treat them as a content hub.

## Verification

After publish, from the neverranked repo root:

```sh
./scripts/verify-deploy.sh \
  https://montaic.com/blog/fair-housing-listing-description-rules \
  https://montaic.com/blog \
  https://montaic.com/sitemap.xml
```

Expected: 5/5 checks pass. Then paste the Rich Results Test URL printed by the script and confirm 0 errors on the live URL.

---

## Draft notes

### A11 overlap scan

A11 covered: 2024 HUD AI guidance, statute applies to AI output, the same five common violation patterns at lightning-round depth, the median settlement figures, the "I didn't know" defense, and a high-level "what Montaic does differently" product section.

A12 must NOT repeat: the 2024 AI guidance as the news hook, the lightning-round violation pattern format, the agent-vs-AI legal framing.

A12 covers what A11 didn't: the actual statute mechanics (3604(c) clause by clause), 24 C.F.R. § 100.75 as the implementing regulation, the deep-dive violations grid (phrase + clause it triggers + compliant alternative), the workflow for editing your own copy through the statute's lens, the Word List backstory, and the rule-engine angle of the product section (not the static word list angle A11 used).

The cluster link: A12 references A11 once, in passing, in the real-world problem section ("AI tools make this worse, not better — see [A11 link] for the AI-specific angle").

### Outline (section-by-section)

**1. Title:** Fair Housing Act Listing Description Rules: The Words You Cannot Use in 2026

**2. Meta description (~140 chars target):** "What § 3604(c) prohibits in listing descriptions, the words HUD flags, and how to write copy that converts without violating the statute."

**3. TL;DR (~120 words):** Most agents have heard "you can't say family-friendly in a listing" but don't know which statute says so or which words it actually applies to. The statute is 42 U.S.C. § 3604(c). The implementing regulation is 24 C.F.R. § 100.75. Together they prohibit any listing description that signals preference for or against a protected class. The catch: HUD's original "word list" from the 1980s isn't published on hud.gov anymore. The legal authority is the statute plus case law, not the list. This article walks through what 3604(c) actually prohibits, the seven phrase categories that get flagged in real listings, the compliant alternative for each, and how Montaic's rule engine handles the gray cases.

**4. Statute / authority section (~300 words):**
Open with 42 U.S.C. § 3604(c) verbatim. Then walk through what each phrase means in a listing context:
- "make, print, or publish" → covers MLS, social, paper flyers, and AI output
- "with respect to the sale or rental of a dwelling" → broader than just the listing copy itself
- "indicates any preference, limitation, or discrimination" → preference is enough; intent does not matter
- "based on race, color, religion, sex, handicap, familial status, or national origin" → the seven protected classes

Then introduce 24 C.F.R. § 100.75 as the regulation that gives the statute teeth, and FHEO Handbook 8025.1 as HUD's current enforcement framework.

The key reveal in this section: the test is what the listing **signals**, not what the agent **meant**. Disparate impact framing without the legal jargon.

**5. Two to three things worth understanding (~400 words):**

a. **The Word List confusion.** Most agents reference "the HUD list" of forbidden phrases. That list comes from a 1989 HUD advertising memorandum that has been technically withdrawn. It still circulates on third-party fair housing nonprofit sites because nothing replaced it. The legal force comes from the statute, not the list. Agents who memorize the list and stop thinking are exposed because the statute applies to phrases the list never mentioned.

b. **Preference is enough.** You do not have to discriminate in fact. You only have to write copy that signals preference. "Perfect for empty nesters" does not reject families with children, but it signals a preference, and that is the violation. The statute's word is "indicates", not "discriminates."

c. **Multiple parties are liable.** When an MLS, a brokerage, or an AI tool publishes a listing, the agent, the brokerage, and the publishing platform are all technically liable. Most enforcement targets the agent because they wrote the copy, but the brokerage's liability is real and is the reason most brokerages have advertising compliance training. The platform's liability is what made the Meta DOJ settlement possible.

**6. Real-world problem (~400 words, 4 paragraphs):**

P1: Agent writes a listing for a 4BR home in a quiet neighborhood near a good school. They want it to convert. Their instinct is to talk about who would love living there: families. They write "perfect for a growing family." The listing converts. Nothing happens for months. Then a buyer files a complaint with HUD alleging the language steered them away because they were a single buyer.

P2: The agent did not know they violated the statute. Their broker did not know either. The MLS did not flag it because most MLS systems only check for formatting, not legal compliance. The first time anyone realizes there is a problem is when HUD opens an investigation.

P3: This pattern is the modal Fair Housing advertising case. Not malice, not exclusion, not red-lining. Just an agent writing the copy that pattern-matches what every other agent writes, which pattern-matches decades of pre-1968 listing copy. The pattern persists in the industry's collective writing style and gets reinforced every time an agent reads competitor listings to learn how to write their own.

P4: AI tools make this worse, not better. (One sentence, internal link to A11.) The fix is not memorizing a word list. The fix is learning to read your own copy through the statute's lens, which is what the rest of this article walks through.

**7. Violations / gotchas list (7 items, ~600 words):** The deep-dive A11 did not do. Each item: phrase pattern → clause of 3604(c) it triggers → why it is a violation → compliant alternative.

1. **Familial status signals** — "family", "kids", "schools", "growing family", "starter home", "empty nester", "perfect for kids". Triggers: "familial status" clause. Signal: preference for buyers with or without children. Alternative: describe the property's bedroom count, square footage, school district by name without commentary on who it suits.

2. **Religious signals** — "near [specific church/temple]", "in the [religious community]", "kosher kitchen", "minutes from St. Anthony's". Triggers: "religion" clause. Signal: preference for buyers of a specific religion. Alternative: name landmarks by street and direction, never by religious affiliation.

3. **National origin signals** — "Little Italy", "Chinatown", "ethnic neighborhood", "diverse community". Triggers: "national origin" clause. Signal: preference for buyers of a specific national origin (yes, "diverse" can be a violation in context — it signals an expected demographic mix). Alternative: name the neighborhood by its registered name only.

4. **Handicap/disability signals** — "no wheelchair access needed", "able-bodied tenant preferred", "great for active families", "stairs throughout, no elevator", "second-story master suite — perfect for fit buyers". Triggers: "handicap" clause. Signal: exclusion of disabled buyers. Alternative: list physical features factually without commentary on who can or cannot use them.

5. **Sex/gender signals** — "man cave", "wife's dream kitchen", "ladies' sitting room", "perfect for a single woman", "safe for women". Triggers: "sex" clause (which now includes gender identity per Bostock and HUD's 2021 implementation memo). Signal: preference for a specific gender household. Alternative: name the room by function, not gendered association.

6. **Race/color signals** — usually coded as neighborhood: "exclusive community", "established neighborhood", "traditional neighborhood", "safe area", "low-crime". Triggers: "race" or "color" clause via disparate impact. Signal: historically used as proxies for racial composition. Alternative: cite the property's HOA status, year built, and crime statistics from a named primary source if relevant.

7. **Image and amenity signals** — listing photos that exclusively feature one demographic, descriptions of nearby amenities serving one community, virtual staging that signals a household type. Triggers: catch-all "indicates preference" language in 3604(c). Signal: even when the copy is clean, the visual content is part of the "advertisement" the statute covers. Alternative: stock photos that do not feature people, amenity descriptions tied to physical proximity not community association.

**8. What to do about it (4 steps, ~300 words):**

Step 1: **Describe the property, not the buyer.** Anchor every sentence in something physical: a room, square footage, a view, a finish, a mechanical system. Never project a household type onto the listing.

Step 2: **Use the swap test.** If you replaced "family" with "Black family" or "Christian family" or "wheelchair user" anywhere in the copy, would the sentence still feel neutral? If no, the original sentence is signaling preference and needs a rewrite.

Step 3: **Cite the property feature, not its implied audience.** "Three bedrooms upstairs" is fine. "Three bedrooms upstairs, perfect for families with kids" is not. The first describes the property; the second projects an audience.

Step 4: **Run every published listing through a Fair Housing-aware compliance check before it goes live.** Most MLSes do not do this. Most AI tools do not either. (Internal link forward to product section.)

**9. What Montaic does differently (~400 words, hybrid voice per Lance's pick, outsider-triangulation lever):**

Open in Lance's voice (first-person). The origin is NOT an ex-agent story. Lance is an outsider triangulating three vantage points that no agent and no PropTech founder has at the same time:

1. **Consumer angle (Redfin/Zillow):** Lance read listings the way buyers do — cold, without industry context. The language felt wrong long before there was a professional reason to notice.
2. **Social angle (the coffee shop):** Lance owns a coffee shop where a lot of agents spend their mornings. He heard them talk about writing listings as a chore they wanted off their plate.
3. **Production angle (photography and video):** Lance shot real estate photography and social media video for agents for years. He read the captions and video scripts going out on social and noticed the language on video drifted further from MLS compliance than the MLS copy did — because nobody was even pretending to check it.

Proposed opening paragraph (for draft approval):

> "I am not a real estate agent. I own a coffee shop where a lot of agents spend their mornings, I shot real estate photography and social media video for agents for years, and I read listings on Redfin and Zillow the way any buyer does. Those three vantage points are how I first noticed the problem with listing description copy.
>
> From the coffee shop, I heard agents talk about writing listings as a chore they wanted off their plate. From the photography and video work, I read the captions and scripts going out on social and noticed the language on video drifted further from MLS compliance than the MLS copy did — because nobody was even pretending to check it. And from Redfin and Zillow I saw the end result: listings written by dozens of different people, all pattern-matching the same weak, loaded language that the Fair Housing Act explicitly prohibits.
>
> What I could see from three angles at once is what I think most agents, brokerages, and AI tools cannot see from inside their own workflow: the listing description is not a copywriting task, it is a compliance surface that happens to look like marketing copy. That is the insight that became Montaic."

Transition to product behavior in third person: "Montaic's listing generator runs every output through a rule engine before showing it to the agent. The rule engine is built directly from 24 C.F.R. § 100.75 and the categorical phrase patterns that have been flagged in fair housing case law for the last three decades."

Specific behaviors:
- Catches the seven phrase categories from the violations list
- Suggests compliant alternatives instead of silently rewriting (because the agent needs to understand WHY)
- Logs every flag and every alternative choice as an audit trail
- Updates as case law evolves — this is the rule-engine vs static-word-list distinction

Close in Lance's voice, tying back to the outsider lever: "The list is the floor. The statute is the ceiling. Montaic was built from the outside looking in, which is why it sees the things agents and AI tools inside the workflow keep missing."

**Voice note:** the opening paragraph above has two em dashes. They are hard-fails under voice-rubric-v0.md and MUST be rewritten as separate sentences or commas during Phase 3 drafting. Draft pass will fix.

**10. FAQ (8 questions, FAQPage schema):**

1. What does 42 U.S.C. § 3604(c) actually say?
2. Is "family-friendly" really illegal in a listing description?
3. Can I describe a property as being near a specific church or school?
4. What is the difference between describing a property and describing a buyer?
5. Does the Fair Housing Act apply to MLS-only listings, or only to public-facing copy?
6. What happens if HUD finds a Fair Housing violation in one of my listings?
7. Is there an official HUD list of forbidden words?
8. How does Montaic's compliance check differ from my MLS's compliance check?

**11. Closing + CTA (~100 words):**
Close on the lever: the statute has been the rule for 58 years. The question is not whether to comply. The question is whether your tools think about the ceiling or just the floor. Montaic's listing generator was built to think about the ceiling.
CTA: Try the free Montaic listing grader. Paste any listing. See exactly which phrases would be flagged, why, and what to write instead. (Same CTA as A11, intentional cluster consistency.)

### Word count budget

| Section | Target | Notes |
|---|---|---|
| TL;DR | 120 | |
| Statute / authority | 300 | |
| Things worth understanding | 400 | 3 sub-sections |
| Real-world problem | 400 | 4 paragraphs |
| Violations grid | 600 | 7 items |
| Workflow | 300 | 4 steps |
| Product section | 400 | hybrid voice |
| FAQ | 400 | 8 Qs |
| Closing | 100 | |
| **Total** | **~3020** | Above 2500 ceiling — trim violations grid first if needed |

The violations grid is the swing variable. If we land over 2500, collapse 2 items into 1 or trim each item's "alternative" line.

---

## Full draft (Phase 3)

**Title:** Fair Housing Act Listing Description Rules: The Words You Cannot Use in 2026

**Meta description (139 chars):** What § 3604(c) prohibits in listing descriptions, the words HUD flags, and how to write copy that converts without violating the statute.

**Slug:** `/blog/fair-housing-listing-description-rules`

**Author:** Lance Roylo, Founder of Montaic

---

### TL;DR

Most agents have heard they cannot say "family-friendly" in a listing, but most cannot name the statute that says so. The statute is 42 U.S.C. § 3604(c), and the implementing regulation is 24 C.F.R. § 100.75. Together they prohibit any listing description that signals preference for or against a protected class. The catch is that HUD's 1989 advertising memo has been technically withdrawn and never replaced, so the "official word list" circulating in real estate offices is operating on guidance HUD no longer publishes. The legal authority is the statute itself plus case law. This article walks through what 3604(c) actually prohibits, the seven phrase categories that show up in real listings, what to write instead, and how Montaic's rule engine handles the gray cases.

---

### The statute is shorter than you think

Here is the full text of 42 U.S.C. § 3604(c):

> "To make, print, or publish, or cause to be made, printed, or published any notice, statement, or advertisement, with respect to the sale or rental of a dwelling that indicates any preference, limitation, or discrimination based on race, color, religion, sex, handicap, familial status, or national origin, or an intention to make any such preference, limitation, or discrimination."

Three phrases in this sentence do all the legal work.

First, "make, print, or publish." The statute's coverage is not limited to printed ads. It covers anything that gets made or published, which now includes MLS listings, social media captions, website descriptions, PDFs, email blasts, and the output of any AI writing tool the agent uses to draft copy. If it gets published, 3604(c) applies to it.

Second, "indicates any preference, limitation, or discrimination." The word "indicates" is the key. The statute does not require the agent to actually discriminate. It only requires the copy to signal preference. "Perfect for empty nesters" does not reject families with children. It just indicates a preference, which is all 3604(c) needs.

Third, the seven protected classes: race, color, religion, sex, handicap, familial status, and national origin. Each of these has specific phrase patterns that trigger a violation, covered in the next section.

The implementing regulation at [24 C.F.R. § 100.75](https://www.ecfr.gov/current/title-24/subtitle-B/chapter-I/subchapter-A/part-100/subpart-H/section-100.75) adds the enforcement mechanism. HUD's [FHEO Handbook 8025.1](https://www.hud.gov/program_offices/administration/hudclips/handbooks/fheo/80251) walks investigators through what constitutes a violation in practice. Together these three documents are the current legal framework. The 1989 advertising memo and its attached word list are not.

---

### Three things most agents do not know

**The Word List is not what you think it is.**

Walk into any real estate office and ask about Fair Housing compliance in listings, and someone will hand you a photocopied two-page list of forbidden words. "Family-friendly." "Master bedroom." "Walking distance to churches." The list is thorough, well-organized, and legally obsolete.

That list originated in a 1989 HUD Office of Fair Housing memorandum titled "Guidance Regarding Advertisements Under § 804(c) of the Fair Housing Act." HUD technically withdrew the memo as part of a regulatory cleanup in the 1990s, and nothing replaced it. The word list still circulates because it is a useful starting point, but it is not HUD's current position. You will not find it anywhere on hud.gov today.

The practical problem is this: agents who memorize the list and stop thinking are exposed on phrases the list never mentioned. A 1989 memo cannot anticipate 2026 language. The legal force comes from the statute and case law, which both continue to evolve.

**Preference is enough.**

The most common mistake in Fair Housing analysis is treating the statute as a discrimination test. It is not a discrimination test. It is a signal test.

You do not need to actually discriminate against anyone. You do not need to intend to discriminate. All 3604(c) requires is that the copy "indicates" preference based on a protected class, and the word "indicates" is doing a lot of work.

"Perfect for empty nesters" indicates a preference for buyers without children. It does not reject anyone. It does not screen anyone out. It just signals who the listing is written for, and that signal is the violation. This is why the disparate impact standard applies to advertising cases. The court does not ask what you meant. It asks what the copy said to a reasonable reader.

**Your brokerage and your tools are also liable.**

When a listing gets published, at least three parties are technically liable under 3604(c): the agent who wrote the copy, the brokerage that employs the agent, and the platform that published the listing. Enforcement usually targets the agent, but the broader liability is real.

The brokerage is liable because it employed the agent and failed to train or supervise the advertising compliance process. Most brokerages run Fair Housing training once a year for exactly this reason. The platform, meaning the MLS or the website or the AI writing tool the agent used, is liable under the statute's "cause to be made or published" clause. This is the theory that made [the 2022 DOJ settlement with Meta](https://www.nar.realtor/legal-case-summaries/meta-facebook-settles-fair-housing-violation-allegations) possible. Meta did not write the discriminatory ads itself, but it caused them to be published to a targeted audience.

If you are an agent reading this, the takeaway is that your brokerage and your tool vendors have skin in this game. The fact that most of them have not updated their compliance protocols does not mean the liability is not there.

---

### How the modal case actually happens

An agent writes a listing for a four-bedroom home in a quiet neighborhood near a well-rated public school. They want the listing to convert. Their instinct is to talk about who would love living in the house, because that is what every listing they have ever read does. They write: "Perfect for a growing family, this four-bedroom home offers room to roam and top-rated schools just minutes away." The listing converts. The home sells. Nothing happens for five months. Then a HUD investigator calls the brokerage because a buyer filed a complaint alleging the language steered them away from inquiring about the property because they were single.

The agent did not know they violated the statute. Their broker did not know either. The MLS did not flag the copy because most MLS systems check for formatting issues like missing photos and broken links, not for legal compliance. The first time anyone realized there was a problem was when HUD opened an investigation. By then the agent had repeated the same pattern on twenty other listings, and the brokerage had to audit every one of them with legal counsel at $400 an hour.

This is the modal Fair Housing advertising case. Not malice, not exclusion, not red-lining. Just an agent writing the copy that pattern-matches what every other agent writes, which pattern-matches decades of pre-1968 listing copy that contained explicit demographic preferences. The industry's collective writing style absorbed those patterns and never fully shed them. Every agent who learned to write listings by reading competitor listings inherited the same bad inheritance.

AI writing tools make this worse, not better, because they were trained on the same collective writing style the industry has been producing for decades. (The full AI angle is covered in the previous cluster article, [The Fair Housing Act Applies to AI Now](/blog/fair-housing-ai-compliance-agents).) The fix is not memorizing a word list. The fix is learning to read your own copy through the statute's lens, which is what the rest of this article walks through.

---

### The seven phrase categories that trigger 3604(c)

**1. Familial status signals**

*Patterns:* "perfect for a growing family," "ideal starter home," "great for empty nesters," "walk to top-rated schools," "plenty of room for the kids."

*Clause triggered:* familial status.

*Why it violates:* each phrase signals preference for or against buyers with children. The listing does not reject anyone, but the signal is the violation.

*Write instead:* "Three bedrooms, 2.5 bathrooms, 2,100 square feet in the XYZ Elementary school district." The district is a factual proximity, not a projection of the buyer.

**2. Religious signals**

*Patterns:* "steps from St. Anthony's," "walking distance to Temple Beth Shalom," "kosher kitchen," "in the heart of our Christian community."

*Clause triggered:* religion.

*Why it violates:* anchoring a property to a religious institution or community signals a preferred buyer demographic. HUD has flagged this specifically since 1989, and case law has been consistent.

*Write instead:* name landmarks by street address and direction, never by religious affiliation. "Two blocks south of Main Street and Elm" instead of "two blocks south of St. Anthony's."

**3. National origin signals**

*Patterns:* "heart of Little Italy," "minutes from Chinatown," "diverse international neighborhood," "close-knit ethnic community."

*Clause triggered:* national origin.

*Why it violates:* naming a neighborhood by its ethnic association signals an expected buyer demographic, even when the name is affectionate. "Diverse" can be a violation in context because it signals an expected demographic mix.

*Write instead:* use the neighborhood's registered name only. "In the Little Italy neighborhood" is closer to acceptable than "in the heart of Little Italy."

**4. Disability and handicap signals**

*Patterns:* "no wheelchair access needed," "stairs throughout, no elevator," "second-floor master perfect for fit buyers," "great for active families."

*Clause triggered:* handicap.

*Why it violates:* any language that frames physical features in terms of who can or cannot use them signals exclusion of disabled buyers. Accurate description is fine. Editorial comment on the exclusion is the violation.

*Write instead:* describe physical features factually. "Three-story townhome with stairs between all levels" instead of "three-story, no elevator, not for the less mobile."

**5. Sex and gender signals**

*Patterns:* "man cave in the basement," "wife's dream kitchen," "ladies' sitting room," "perfect for a single woman."

*Clause triggered:* sex. Since Bostock and HUD's 2021 implementation memo, this clause includes gender identity.

*Why it violates:* gendered role descriptions signal preference for a specific household composition. "Man cave" has become common enough that agents do not hear it as loaded, but it is still a sex-based signal.

*Write instead:* name the room by function. "Finished basement with built-in bar and TV mount" works. "Man cave" does not.

**6. Race and color signals (usually coded as neighborhood)**

*Patterns:* "established neighborhood," "traditional community," "exclusive enclave," "safe area," "low-crime street."

*Clause triggered:* race or color, via disparate impact.

*Why it violates:* these phrases have been used as proxies for racial composition for decades. Courts and HUD treat them as coded demographic signals regardless of the agent's intent. "Safe neighborhood" is the most commonly flagged because it is so widely used.

*Write instead:* cite the property's HOA status, year built, and crime statistics from a named source if relevant. "Registered with the XYZ Homeowners Association, built 1998, crime index 18 per FBI UCR data" is factual and defensible.

**7. Image and amenity signals**

*Patterns:* listing photos that exclusively feature one demographic, virtual staging showing a single household type, amenity descriptions tied to community association like "steps from the yacht club" or "inside the gated community of XYZ."

*Clause triggered:* catch-all "indicates preference" language in 3604(c).

*Why it violates:* even when the written copy is clean, visual content is part of the "advertisement" 3604(c) covers. Staging, photography, and amenity association can all signal preference on their own.

*Write instead:* use stock photography without people when possible, or photography that does not exclusively feature one demographic. Tie amenities to physical proximity, not community membership.

---

### The four-step workflow for compliant listing copy

**Step 1: Describe the property, not the buyer.**

Anchor every sentence in something physical about the property. A room, a square footage, a view, a mechanical system, a finish. If the sentence projects a household type or a buyer profile onto the property, rewrite it.

"Four bedrooms upstairs" is a property fact. "Four bedrooms upstairs, perfect for a growing family" is a property fact plus a buyer projection. Cut the projection.

**Step 2: Use the swap test.**

Take any sentence in the draft that describes an audience. Replace the group with a protected class from the statute. "Perfect for a growing family" becomes "perfect for a growing Black family" or "perfect for a growing Christian family." Does the sentence still feel neutral? No. The original was signaling preference. Rewrite it.

**Step 3: Cite the feature, not the implied audience.**

When you find yourself writing who the property is for, reframe as what the property has. "Walking distance to XYZ Elementary" is a factual distance. "Walking distance to XYZ Elementary, great for families with kids" adds the illegal part.

**Step 4: Run a compliance check before publish.**

Most MLSes do not check Fair Housing language. Most AI writing tools do not either. The compliance check has to happen somewhere between draft and publish, and most agents are currently skipping it because they do not realize their tools are not doing it for them. The compliance check is the last mile of the workflow, and it is the one that actually matters.

---

### What Montaic does differently

I am not a real estate agent. I own a coffee shop where a lot of agents spend their mornings, I shot real estate photography and social media video for agents for several years, and I read listings on Redfin and Zillow the way any buyer does. Those three vantage points are how I first noticed the problem with listing description copy.

From the coffee shop, I heard agents talk about writing listings as a chore they wanted off their plate. From the photography and video work, I read the captions and scripts going out on social media and noticed the language on video drifted further from MLS compliance than the MLS copy did, because nobody was even pretending to check it. And from Redfin and Zillow I saw the end result. Listings written by dozens of different people, all pattern-matching the same loaded language that the Fair Housing Act prohibits.

What I could see from three angles at once is what most agents, brokerages, and AI tools cannot see from inside their own workflow. The listing description is not a copywriting task. It is a compliance surface that happens to look like marketing copy. That is the insight that became Montaic.

Montaic's listing generator runs every output through a rule engine before showing the agent a draft. The rule engine is built directly from 24 C.F.R. § 100.75 and the categorical phrase patterns that have been flagged in fair housing case law for the last three decades. When the engine catches a phrase, it shows the agent which protected class the phrase signals, which clause of 3604(c) it implicates, and a compliant alternative the agent can accept with one click.

Four specific behaviors make the rule engine different from a static word list:

1. It catches the seven phrase categories covered above, plus the long tail of variations no static list has kept up with.
2. It suggests compliant alternatives instead of silently rewriting. Silent rewrites teach the agent nothing. Explicit flags teach the agent the statute.
3. It logs every flag and every alternative selection as an audit trail. If a complaint is ever filed, the audit trail is the agent's evidence that they took compliance seriously.
4. It updates as case law evolves. The 1989 word list is the floor. Case law is the moving ceiling.

The list is the floor. The statute is the ceiling. Montaic was built from the outside looking in, which is why it catches the things agents and AI tools inside the workflow keep missing.

---

### FAQ

**What does 42 U.S.C. § 3604(c) actually say?**

The statute prohibits making, printing, or publishing any notice, statement, or advertisement about the sale or rental of a dwelling that indicates preference, limitation, or discrimination based on race, color, religion, sex, handicap, familial status, or national origin, or the intention to do any of those things. The key word is "indicates." The statute does not require you to discriminate in fact. It only requires you to signal preference.

**Is "family-friendly" really illegal in a listing description?**

Yes, in most contexts. "Family-friendly" signals preference for buyers with children, which is the familial status clause of 3604(c). The phrase does not reject single buyers, empty nesters, or anyone else, but the signal is the violation. Write the property's factual features instead, like school district, bedroom count, and yard size.

**Can I describe a property as being near a specific church or school?**

Schools are generally safe to name because they are public resources. Religious institutions are not. "Two blocks from XYZ Elementary" is fine. "Two blocks from St. Anthony's Church" is a religion signal under 3604(c). If you need to describe the location, use a non-religious landmark or an address.

**What is the difference between describing a property and describing a buyer?**

Describing a property means naming its physical features: bedrooms, square footage, mechanical systems, finishes, proximity to government landmarks. Describing a buyer means projecting who would love the property: families, empty nesters, young professionals, retirees. The first is a fact about the house. The second is a Fair Housing signal. The rule is to describe the property only.

**Does the Fair Housing Act apply to MLS-only listings, or only to public-facing copy?**

It applies to both. The statute covers anything "made, printed, or published," and MLS listings are made and published to a specific audience of licensed agents. The fact that the MLS is not public does not remove it from the statute's coverage. Treat MLS copy with the same compliance standard as public listings.

**What happens if HUD finds a Fair Housing violation in one of my listings?**

HUD can open an investigation, require you to attend Fair Housing training, assess a civil penalty, and refer the case to the Department of Justice for further action if the pattern is severe. Civil penalties under 42 U.S.C. § 3612 start at $19,787 for a first violation and escalate from there. Most cases settle with a fine, training, and a compliance agreement.

**Is there an official HUD list of forbidden words?**

No. The "Fair Housing Advertising Word and Phrase List" that circulates among real estate offices originated in a 1989 HUD memorandum that was technically withdrawn and never replaced. Nothing on hud.gov today publishes an official list. The legal authority is the statute at 42 U.S.C. § 3604(c) plus the regulation at 24 C.F.R. § 100.75 plus case law.

**How does Montaic's compliance check differ from my MLS's compliance check?**

Most MLS compliance checks look for formatting issues like missing photos, broken links, and mandatory fields. They do not scan for Fair Housing language. Montaic's rule engine scans every generated listing against the statute, the regulation, and the case law patterns, and it flags any phrase that signals preference. If your MLS flagged "perfect for a growing family" today, Montaic would have flagged it before the MLS ever saw it.

---

### Closing

The Fair Housing Act has been the rule in real estate advertising since 1968. That is 58 years. The question for 2026 is not whether to comply. It is whether your tools are thinking about the ceiling or just the floor. Most tools that agents use today are not thinking about either, which is why "perfect for a growing family" still shows up in brand-new listings on every major MLS.

Montaic was built from the outside looking in, which is why it catches the things the tools inside the workflow keep missing.

**Try the free Montaic listing grader.** Paste any listing description, and the rule engine will show you exactly which phrases would be flagged, which clause of 3604(c) they trigger, and what to write instead.

*[CTA button: Try the free Montaic listing grader →](https://montaic.com/grader)*

*[Related reading: [The Fair Housing Act Applies to AI Now](/blog/fair-housing-ai-compliance-agents)]*

---

**External citations used (5, as required):**

1. 42 U.S.C. § 3604(c) via Cornell LII: https://www.law.cornell.edu/uscode/text/42/3604
2. 24 C.F.R. § 100.75 via eCFR: https://www.ecfr.gov/current/title-24/subtitle-B/chapter-I/subchapter-A/part-100/subpart-H/section-100.75
3. HUD 2024 AI Guidance memo: https://archives.hud.gov/news/2024/pr24-098.cfm
4. NAR Fair Housing advertising resources: https://www.nar.realtor/fair-housing
5. FHEO Handbook 8025.1: https://www.hud.gov/program_offices/administration/hudclips/handbooks/fheo/80251

**Word count (Phase 3 draft, pre-voice-pass):** ~3,100 words. Over the 2,500 ceiling by ~600 words. Lance approved shipping at 3,100 (longer pillar articles consistently get more AI-engine citations, A12 is a reference document not a primer).

---

## Schema @graph block (Phase 4b)

Complete JSON-LD payload for the article. Single `@graph` with three nodes: BlogPosting, FAQPage, BreadcrumbList. Matches the structural pattern used in A11 so Google treats the Fair Housing cluster as a content hub.

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BlogPosting",
      "@id": "https://montaic.com/blog/fair-housing-listing-description-rules#article",
      "headline": "Fair Housing Act Listing Description Rules: The Words You Cannot Use in 2026",
      "description": "What § 3604(c) prohibits in listing descriptions, the words HUD flags, and how to write copy that converts without violating the statute.",
      "image": "https://montaic.com/og/blog/fair-housing-listing-description-rules.png",
      "datePublished": "2026-04-10",
      "dateModified": "2026-04-10",
      "wordCount": 3100,
      "keywords": [
        "Fair Housing Act listing description rules",
        "42 U.S.C. 3604(c)",
        "24 C.F.R. 100.75",
        "real estate advertising compliance",
        "Fair Housing advertising word list",
        "discriminatory listing language"
      ],
      "articleSection": "Compliance",
      "isAccessibleForFree": true,
      "author": {"@id": "https://montaic.com/#founder"},
      "publisher": {"@id": "https://montaic.com/#organization"},
      "mainEntityOfPage": "https://montaic.com/blog/fair-housing-listing-description-rules",
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "42 U.S.C. § 3604(c)",
          "url": "https://www.law.cornell.edu/uscode/text/42/3604"
        },
        {
          "@type": "CreativeWork",
          "name": "24 C.F.R. § 100.75",
          "url": "https://www.ecfr.gov/current/title-24/subtitle-B/chapter-I/subchapter-A/part-100/subpart-H/section-100.75"
        },
        {
          "@type": "CreativeWork",
          "name": "HUD Issues Fair Housing Act Guidance on Applications of Artificial Intelligence (2024)",
          "url": "https://archives.hud.gov/news/2024/pr24-098.cfm"
        },
        {
          "@type": "CreativeWork",
          "name": "FHEO Handbook 8025.1",
          "url": "https://www.hud.gov/program_offices/administration/hudclips/handbooks/fheo/80251"
        },
        {
          "@type": "CreativeWork",
          "name": "NAR Fair Housing advertising resources",
          "url": "https://www.nar.realtor/fair-housing"
        }
      ],
      "isPartOf": {
        "@type": "Blog",
        "@id": "https://montaic.com/blog#blog"
      },
      "about": [
        {"@type": "Thing", "name": "Fair Housing Act"},
        {"@type": "Thing", "name": "Real estate advertising compliance"},
        {"@type": "Thing", "name": "Listing descriptions"}
      ],
      "hasPart": {"@id": "https://montaic.com/blog/fair-housing-listing-description-rules#faq"}
    },
    {
      "@type": "FAQPage",
      "@id": "https://montaic.com/blog/fair-housing-listing-description-rules#faq",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What does 42 U.S.C. § 3604(c) actually say?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The statute prohibits making, printing, or publishing any notice, statement, or advertisement about the sale or rental of a dwelling that indicates preference, limitation, or discrimination based on race, color, religion, sex, handicap, familial status, or national origin, or the intention to do any of those things. The key word is 'indicates.' The statute does not require you to discriminate in fact. It only requires you to signal preference."
          }
        },
        {
          "@type": "Question",
          "name": "Is 'family-friendly' really illegal in a listing description?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, in most contexts. 'Family-friendly' signals preference for buyers with children, which is the familial status clause of 3604(c). The phrase does not reject single buyers, empty nesters, or anyone else, but the signal is the violation. Write the property's factual features instead, like school district, bedroom count, and yard size."
          }
        },
        {
          "@type": "Question",
          "name": "Can I describe a property as being near a specific church or school?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Schools are generally safe to name because they are public resources. Religious institutions are not. 'Two blocks from XYZ Elementary' is fine. 'Two blocks from St. Anthony's Church' is a religion signal under 3604(c). If you need to describe the location, use a non-religious landmark or an address."
          }
        },
        {
          "@type": "Question",
          "name": "What is the difference between describing a property and describing a buyer?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Describing a property means naming its physical features: bedrooms, square footage, mechanical systems, finishes, proximity to government landmarks. Describing a buyer means projecting who would love the property: families, empty nesters, young professionals, retirees. The first is a fact about the house. The second is a Fair Housing signal. The rule is to describe the property only."
          }
        },
        {
          "@type": "Question",
          "name": "Does the Fair Housing Act apply to MLS-only listings, or only to public-facing copy?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It applies to both. The statute covers anything made, printed, or published, and MLS listings are made and published to a specific audience of licensed agents. The fact that the MLS is not public does not remove it from the statute's coverage. Treat MLS copy with the same compliance standard as public listings."
          }
        },
        {
          "@type": "Question",
          "name": "What happens if HUD finds a Fair Housing violation in one of my listings?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "HUD can open an investigation, require you to attend Fair Housing training, assess a civil penalty, and refer the case to the Department of Justice for further action if the pattern is severe. Civil penalties under 42 U.S.C. § 3612 start at $19,787 for a first violation and escalate from there. Most cases settle with a fine, training, and a compliance agreement."
          }
        },
        {
          "@type": "Question",
          "name": "Is there an official HUD list of forbidden words?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. The 'Fair Housing Advertising Word and Phrase List' that circulates among real estate offices originated in a 1989 HUD memorandum that was technically withdrawn and never replaced. Nothing on hud.gov today publishes an official list. The legal authority is the statute at 42 U.S.C. § 3604(c) plus the regulation at 24 C.F.R. § 100.75 plus case law."
          }
        },
        {
          "@type": "Question",
          "name": "How does Montaic's compliance check differ from my MLS's compliance check?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Most MLS compliance checks look for formatting issues like missing photos, broken links, and mandatory fields. They do not scan for Fair Housing language. Montaic's rule engine scans every generated listing against the statute, the regulation, and the case law patterns, and it flags any phrase that signals preference. If your MLS flagged 'perfect for a growing family' today, Montaic would have flagged it before the MLS ever saw it."
          }
        }
      ]
    },
    {
      "@type": "BreadcrumbList",
      "@id": "https://montaic.com/blog/fair-housing-listing-description-rules#breadcrumb",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Home",
          "item": "https://montaic.com/"
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": "Blog",
          "item": "https://montaic.com/blog"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Fair Housing Act Listing Description Rules: The Words You Cannot Use in 2026"
        }
      ]
    }
  ]
}
```

**Notes on the schema:**

- `wordCount: 3100` matches the final draft. If trimming happens before publish, update this field.
- `datePublished` and `dateModified` are both set to `2026-04-10`. Lance updates these if publish slips to another day.
- The `citation` array uses all 5 required primary sources as structured CreativeWork nodes. Google treats these as trust signals.
- `hasPart` links the BlogPosting to the FAQPage node inside the same `@graph`. This is the same cross-reference pattern A11 uses.
- `isPartOf` points to the blog hub at `#blog`. This anchors the piece into the cluster so Google can treat the Fair Housing articles as a topical authority group.
- The BreadcrumbList has exactly 3 levels: Home → Blog → this article. Third level has no `item` field per schema.org convention (current page).
- FAQPage has 8 Question nodes, matching the 8 FAQ questions in the article body.
