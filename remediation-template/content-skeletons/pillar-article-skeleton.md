# Pillar Article Skeleton

Generalized structure for a Never Ranked pillar article, extracted from the Fair Housing article shipped for Montaic (client #1, April 2026).

A pillar article is the anchor piece of content for a positioning claim. It's the article that:

- Plants a differentiating flag the client can defend
- Earns citations from AI engines (ChatGPT, Perplexity, Google AI Overviews)
- Converts skeptical prospects because it actually explains the stakes
- Is linkable as an outreach asset (trade pubs, podcasts, influencer pitches)

Pillar articles are NOT blog posts. They are permanent assets. Build them to last 12-24 months without becoming stale.

---

## Length target

2,000-2,500 words. Long enough to earn topical authority in search, short enough that a motivated reader finishes it.

If the topic can be covered in under 1,500 words, it's not a pillar article — it's a regular blog post. Write it in a different template.

If the topic requires more than 3,000 words, split it into a pillar + supporting articles that link to each other.

---

## Required schema

Every pillar article ships with these three schema blocks consolidated in a single `@graph` block:

1. **BlogPosting** — the article itself
2. **FAQPage** — the FAQ section (5-8 Q/A pairs)
3. **BreadcrumbList** — site > blog > article

Reference the canonical schema implementations in `schema-patterns/README.md`.

---

## The structure (9 sections)

### 1. Title (1 line)

**Format:** Declarative statement + specific stakes. Never a question. Never a listicle headline.

**Good examples:**
- "The Fair Housing Act Applies to AI Now. Here's What Every Agent Needs to Know." (Montaic)
- "Your Electrician's License Is Worthless in California Without This One 2024 Update."
- "OpenAI's New Pricing Will Kill Your Agency's Margins. Here's the Fix."

**Bad examples:**
- "5 Things Every Agent Should Know About..." (listicle)
- "Is Your AI Listing Legal?" (question)
- "The Ultimate Guide to..." (generic)

The title must contain a specific, falsifiable claim. If the title could be swapped onto a competitor's article without changing the meaning, it's not distinctive enough.

### 2. Meta description (155 chars max)

Anchors the SEO snippet. Cannot repeat the title's opening phrase. Must contain the target keyword naturally.

**Format:** [What the article is about] + [Why the reader should care] + [What the reader gets]

**Example:** "The Fair Housing Act has always applied to AI-generated listing content. 42 U.S.C. § 3604(c) makes every agent legally responsible for what they publish."

### 3. TL;DR (one paragraph, 80-150 words)

The whole article compressed into a single paragraph. This is what people read when they don't have time for the full piece. It should be strong enough to convert a skim-reader.

**Requirements:**
- First sentence names the specific problem or claim
- Second sentence names the stakes (legal, financial, reputational, competitive)
- Third-to-last sentence names the fix or positioning flag
- Last sentence is a hook into the full article ("Here's what that means in practice" or similar)

**Critical:** The TL;DR cannot contain any claim that isn't repeated and cited later in the article. It's a contract with the reader.

### 4. The statute / the authority / the source

The first body section must anchor the entire article on a specific, citable authority. This is what makes the piece AI-citable.

**For Montaic Fair Housing:** 42 U.S.C. § 3604(c) and 24 C.F.R. § 100.75 (statute + regulation)

**For a tax compliance piece:** IRS Publication X, Treasury Regulation Y, specific code section

**For a product positioning piece:** Industry benchmark study, analyst report, primary research

**Requirements:**
- Name the source explicitly in the body text
- Include an inline link with descriptive anchor text
- Quote 8-15 words of the source directly when useful (never more)
- Explain what the source says in plain English in the sentence right after the quote

This is the single most important section for getting cited by AI engines. Citation density + primary source naming = citation magnet.

### 5. Two to three "things worth understanding" (one block)

After the statute/authority, introduce 2-3 key concepts the reader needs to understand before the rest of the article makes sense.

**Format:**
- Bolded lead-in phrase
- One-sentence explanation
- One-sentence concrete example or application

These become the structural anchors the rest of the article refers back to. They also tend to be the sentences AI engines quote when summarizing the article.

### 6. The real-world problem (3-5 paragraphs)

Show the reader the problem in concrete terms. Not abstract. Specific examples, specific tools, specific scenarios.

**For Montaic:** listed the specific AI tools (ChatGPT, Claude, Gemini, Jasper) and the specific phrases they generate ("perfect for young families", "walking distance to churches")

**For an electrician compliance piece:** list the specific code updates, the specific penalty amounts, the specific job scenarios that trigger violations

The reader should read this section and think "oh shit, this is me" or "oh shit, that's my business."

### 7. The list of specific violations / gotchas / patterns (5-7 items)

A numbered list of the specific things to watch for. Each item:

- **Bolded item name**
- One-sentence definition
- 2-4 specific example phrases, code patterns, or scenarios (in quotes)
- One sentence on why it trips the relevant check

This section is the "reference card" section of the article. It's what readers screenshot and share. It's what they come back to look up later.

### 8. What to do about it (the 4-step workflow)

The positive counterpart to section 7. Four numbered steps for how to handle the problem correctly.

**Step 1:** Always names a specific tool or process. This is where the client product gets its first real mention. The tool mention has to be earned by the previous 60% of the article.

**Step 2-4:** Operational advice the reader can implement today, whether or not they use the client product.

**Critical:** This section cannot read like a sales pitch. If step 1 reads like marketing copy, rewrite it until it reads like advice a friend would give.

### 9. What [Client] does differently (the product section)

The ONLY section that's allowed to pitch the product. Everything before this section is public-utility content.

**Format:**
- Opens with a first-person origin sentence ("I built X because..." or "We started X after we realized...")
- Bulleted list of product capabilities, specifically tied back to the problem defined in sections 6-7
- Closing paragraph acknowledging what the product does NOT do (builds credibility)

**Critical:** Every bullet must be a claim the product can actually back up. If you wouldn't want a journalist to fact-check it, don't write it.

### 10. FAQ (5-8 questions)

The questions AI engines will ask. Not the questions a marketing team thinks readers want to ask.

**How to pick the right questions:**
- Start with "does X actually apply to my situation"
- Include "is Y safe to use"
- Include "what counts as a violation of Z"
- Include "what should I do if I've been doing it wrong"
- Include one specific product question

Each answer is 60-120 words. Long enough to be substantive, short enough to be quotable.

The FAQ MUST be marked up as FAQPage schema. This is the single most cited schema type in ChatGPT/Perplexity outputs. Skipping it forfeits the article's primary AI distribution channel.

### 11. Closing + CTA

The closing paragraph does one thing: restate the positioning flag planted in the title and section 4, and tie it to the reader's next action.

**Format:**
- First sentence: reframes the title claim with the authority of everything the reader just learned
- Second sentence: names what the reader should do next
- Third sentence: the specific CTA link

The CTA must be to something the reader can do in under 60 seconds without creating an account. A "try the free grader" CTA converts 10x better than a "book a demo" CTA.

---

## The 5 external citations

Every pillar article must have exactly 5 external citations to primary sources. Fewer than 5 is undercited. More than 5 starts to feel like a research paper.

**What counts as a primary source:**
- Government websites (.gov, specific agency pages)
- Legal code repositories (Cornell LII, eCFR, specific statute pages)
- Peer-reviewed journal articles (with DOI or stable link)
- Court opinion databases (Westlaw, Justia, CourtListener)
- Industry data from named research firms (NAR, Gartner, Forrester) with report citations

**What does NOT count as a primary source:**
- Wikipedia (OK for background only, not as a citation)
- Other marketing content from competitors
- The client's own previous articles
- General "experts say" language without a named expert

Each citation gets:
- An inline link in the body text at the point where the claim is made
- Descriptive anchor text (not "click here" or the URL)
- The source name in the surrounding sentence

---

## The publish flow

1. Draft the article in the client codebase (blog data file or CMS)
2. Set `draft: true` initially
3. Run the article through `voice-rubric-v0.md` (or the client-specific rubric if one exists)
4. Fact-check all citations with WebFetch
5. Flip `draft: false`
6. Commit and push with message `{ActionID}: publish {topic} pillar article`
7. Wait 90 seconds for deploy
8. Run `scripts/verify-deploy.sh` with the article URL, blog index URL, and sitemap URL
9. Paste the Rich Results Test link from the script output into a browser and confirm 0 errors
10. Article is shipped

---

## What this skeleton does NOT cover

- Topic selection (comes from the audit roadmap, not from this template)
- Keyword research (done in the audit phase, fed into the brief)
- Tone calibration (comes from the client voice rubric, not this skeleton)
- Distribution (separate playbook — outreach, social, email)

This skeleton covers ONLY the article structure itself. Everything upstream of "we decided to write this article" belongs in the audit phase. Everything downstream of "we published this article" belongs in the distribution playbook.
