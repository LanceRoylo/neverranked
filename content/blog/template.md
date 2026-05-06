# Post Template

Canonical structure for every Never Ranked blog post. Use as the
starting point for any new post. The template is opinionated:
deviate only with reason.

---

## Post type matrix

There are three post archetypes. Pick the right one before drafting.

| Archetype | When to use | Example slugs (existing) |
|---|---|---|
| **Vertical playbook** | Targeting "AEO for [vertical]" intent. Best for tier 1-3 verticals where buyers actively search. | `aeo-for-financial-advisors`, `aeo-for-dentists`, `aeo-for-restaurants` |
| **Category education** | Targeting "what is X" or "how does X work" intent. Foundational content that every post in the library should link to. | `what-is-aeo`, `schema-markup-ai-search`, `how-long-does-aeo-take` |
| **Conversion / consideration** | Targeting buyers comparing tools or evaluating Never Ranked specifically. Bottom-of-funnel. | `best-aeo-agency`, `aeo-pricing`, `we-audited-ourselves-first` |

---

## Standard post structure (all archetypes inherit this)

```
[H1 with italic Playfair signature on key word]
↓
[Eyebrow / metadata: published date, read time, vertical tag]
↓
[Lead paragraph: 2-3 sentences. Hook + the question the post answers]
↓
[H2: Section 1, usually "the problem" or "what changed"]
[Body content: 200-400 words]
↓
[H2: Section 2, the mechanism or the proof]
[Body content: 300-500 words. Include first inline citation here.]
↓
[H2: Section 3, what to do (vertical playbook) or what it means (category)]
[Body content: 300-500 words. Bullets, examples, named patterns.]
↓
[H2: Section 4, sometimes a comparison or counterargument]
[Body content: 200-400 words]
↓
[H2: Frequently asked questions]
[6-10 Q&A items, visible on page, also rendered as FAQPage schema]
↓
[H2: closing / what to do next]
[1-2 paragraphs. Soft CTA to check.neverranked.com or relevant audit page.]
↓
[Author byline + share row + related posts]
↓
[Standard footer]
```

Total target word count: **1500-2500**. Below 1500 looks thin to
AI engines. Above 2500 loses readers without adding citation weight.

---

## H1 conventions

The italic-Playfair mid-sentence treatment is the brand asset.
Apply it on every post title. The italic word is the focus.

Good examples:

- "What is *AEO*, and why your rankings stopped meaning anything"
- "How long does *AEO* take to show results"
- "AEO for *financial advisors*: the five gaps every firm has"
- "Why ChatGPT recommends *your competitor*"
- "Is *SEO* dead?"

Pattern: load the italic on the noun the post is genuinely about.
Skip the italic if the title is short and punchy ("AEO Pricing").

---

## FAQ block conventions

The FAQ section is the single highest-value AEO element in any
post. It serves two purposes:

1. **Visible to readers** as a quick-answer section
2. **Rendered as FAQPage schema** (JSON-LD) so AI engines can extract
   answers directly

### FAQ requirements

- **6 to 10 questions per post**
- Each question is a real query a buyer would type into ChatGPT,
  Perplexity, or Google. Not "what are the benefits of AEO"
  (generic, low-intent). Yes "do I need AEO if I rank #1 on Google"
  (specific, high-intent).
- Each answer is **2-4 sentences**, self-contained, citable.
- Answers should pass the **standalone test**: read just the answer.
  Does it make sense without the question? If yes, AI engines can
  cite it.
- No em dashes, no semicolons, no banned words.

### FAQ JSON-LD example

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Do I need AEO if I already rank #1 on Google?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Google rankings and AI engine citations are different surfaces. When AI Overviews appear above the blue links, click-through to ranked results drops to about 1.2 percent. Your rank protects fewer clicks every month."
      }
    },
    {
      "@type": "Question",
      "name": "...",
      "acceptedAnswer": { "@type": "Answer", "text": "..." }
    }
  ]
}
```

The visible HTML version mirrors this exactly:

```html
<section class="faq">
  <h2>Frequently asked questions</h2>
  <div class="faq-item">
    <h3>Do I need AEO if I already rank #1 on Google?</h3>
    <p>Yes. Google rankings and AI engine citations are different surfaces...</p>
  </div>
  ...
</section>
```

Both must be present. AI engines parse the JSON-LD. Google requires
the visible match.

---

## Schema bundle (every post must ship with all of these)

Place inside one `<script type="application/ld+json">` block in
the `<head>`, using the `@graph` pattern that the existing posts
use.

| Schema type | Purpose | Required fields |
|---|---|---|
| `Article` | The post itself | headline, datePublished, dateModified, author, publisher, description, mainEntityOfPage, image, wordCount |
| `Person` (author) | Citation trust signal | name (Lance Roylo), sameAs (LinkedIn, Twitter), jobTitle, worksFor |
| `Organization` | Publisher | name (Never Ranked), url, logo, sameAs |
| `WebSite` | Sitelink consistency | name, url, publisher |
| `BreadcrumbList` | Hierarchy | Home > Blog > [Post] |
| `FAQPage` | The high-value AEO citation surface | mainEntity array of Question/Answer pairs |

Every existing post has the first five. The work going forward is
adding `FAQPage` (none of the 19 existing posts have it yet) plus
ensuring the others are complete.

---

## Citation conventions

**Every factual claim needs an inline link to a reputable source.**

Format:

```html
According to <a href="https://example.com" rel="noopener">Source Name (2025)</a>, the click-through rate is...
```

- **Source name + year in the link text** (helps both readers and AI engines parse the citation)
- `rel="noopener"` on every external link (security best practice)
- Pull from `sources.md`, do not invent stats

### Minimum citation count per post

| Archetype | Minimum citations | Notes |
|---|---|---|
| Vertical playbook | **3** | Industry stat, government/research data, vertical-specific source |
| Category education | **5** | Higher bar because the post will be linked from many other posts as a reference |
| Conversion / consideration | **3** | Comparison data, customer-side proof, third-party validation |

If a claim cannot be backed by a source in `sources.md` or a
verifiable fresh source, **rephrase or remove it**. No fabricated
stats, no "studies show that" without a study link.

---

## Voice rules (strict, inherited from `social/voice-quickref.md`)

### Banned mechanically

- Em dashes anywhere
- Semicolons in marketing copy
- Words: transform, unlock, empower, elevate, leverage, seamless,
  cutting-edge, dominate, Welcome to, We help you, Era (when used
  as a category modifier)

### Required style

- First-person plural ("we", "our") for Never Ranked perspective
- Specific over generic. "Apple Intelligence on iPhone Safari"
  beats "AI assistants."
- Numbers wherever possible. "Click-through drops to 1.2 percent"
  beats "click-through drops significantly."
- Pass the **Swap Test**: replace "Never Ranked" with any competitor
  name. Does the post still make sense? If yes, it is too generic.

### Visual signature

- Italic Playfair on the H1's key word
- Italic Playfair on pull quotes
- Pull quotes break up walls of text every 400-500 words on long posts

---

## CTA at the bottom

Every post ends with a soft CTA pointing to one of three places,
chosen by the post archetype:

| Archetype | Primary CTA |
|---|---|
| Vertical playbook | "Free six-engine scan at check.neverranked.com" |
| Category education | "What is your AEO score? Free scan at check.neverranked.com" |
| Conversion / consideration | "Start with the $750 audit" or "Book a 30-minute call" |

The CTA is the second-to-last element. The last is the author byline.

---

## Anti-patterns (what bad posts look like)

- Generic intro that takes 3 paragraphs to get to the point
- Stats without sources
- "In today's fast-paced world..." or any variant
- Posts that could swap brand and still work (Swap Test fails)
- FAQ section with 3 generic questions (should be 6-10 specific ones)
- No internal links to other Never Ranked posts (every post should
  link to at least 2 other posts in the library)
- No external citations (every factual claim needs one)
- Word count below 1500 (looks thin to AI engines)
- Word count above 3500 (loses readers, signals low edit pass)

---

## File location and slug conventions

- Live posts: `blog/[slug]/index.html`
- Slug format: `kebab-case-with-hyphens`
- Slug must include the primary target keyword. Examples:
  - `aeo-for-financial-advisors` (vertical playbook)
  - `what-is-aeo` (category education)
  - `best-aeo-agency` (conversion)
- Maximum slug length: 60 characters (URL readability)
