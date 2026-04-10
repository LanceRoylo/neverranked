# A11 — Fair Housing Pillar Article (technical wiring)

**For:** Claire (Montaic codebase)
**From:** Never Ranked side
**Scope:** Technical wiring only — `faqPageSchema()` utility, draft blog post creation, `@graph` wiring, hero image fallback, related reading. Voice personalization and outbound citations are Lance's job before publish.
**Deploy state:** Ship as an unpublished draft. Lance flips it to published after his voice pass + citation pass.
**Time:** ~45 minutes.

---

## Pre-flight

Confirm A4 is still healthy — A11 depends entirely on it:

```bash
# BlogPosting type on an existing post
curl -s https://montaic.com/blog/best-ai-listing-description-generator | grep -o '"@type":"BlogPosting"'

# Founder Person entity resolves on homepage
curl -s https://montaic.com/ | grep -o '"@id":"https://montaic.com/#founder"'

# /og route still returns 200
curl -s -o /dev/null -w "%{http_code}" "https://montaic.com/og?title=Test&type=blog"
# Expected: 200
```

If any of those fail, stop and flag before continuing.

---

## A11.1 — Add the `faqPageSchema()` utility

**File:** `lib/schema.ts` (same file as `blogPostingSchema`, `howToSchema`, `breadcrumbSchemaFromPath`, `softwareApplicationSchema`)

```ts
type FAQItem = {
  question: string;
  answer: string;
};

type FAQPageInput = {
  url: string;           // full canonical URL of the page
  items: FAQItem[];
};

export function faqPageSchema(input: FAQPageInput) {
  return {
    "@type": "FAQPage",
    "@id": `${input.url}#faq`,
    mainEntity: input.items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}
```

**Notes:**
- FAQPage schema is cited heavily by ChatGPT and Perplexity for informational queries. It's one of the highest-leverage schema types for AEO.
- The `@id` uses `#faq` as a fragment so it can coexist with a BlogPosting's `#article` `@id` in the same `@graph`.
- Keep answer text plain — no HTML, no markdown. AI engines parse these literally.

---

## A11.2 — Create the blog post file

**File location:** wherever blog posts live in the Montaic codebase. Likely one of:
- `content/blog/fair-housing-ai-compliance-agents.mdx`
- `app/blog/fair-housing-ai-compliance-agents/page.mdx`
- `posts/fair-housing-ai-compliance-agents.md`

**Slug:** `fair-housing-ai-compliance-agents`

**Frontmatter:**

```yaml
---
title: "The Fair Housing Act Applies to AI Now. Here's What Every Agent Needs to Know."
description: "HUD confirmed in 2024 that the Fair Housing Act applies to AI-generated listing content. Every agent using AI is legally responsible. Here's what to do."
date: "2026-04-09"
updated: "2026-04-09"
author: "Lance Roylo"
category: "Compliance"
tags:
  - "HUD AI guidance"
  - "Fair Housing Act AI"
  - "AI listing description compliance"
  - "real estate AI legal liability"
draft: true
heroImage: ""
---
```

**Important:** `draft: true` means the post should NOT appear in the live blog index yet. Whatever mechanism the blog uses to filter drafts (a filter in the index page, a build-time check, etc.) should exclude this post from listings, sitemaps, and the RSS feed until Lance flips `draft` to `false`.

If the current blog system has no draft mechanism, add one now: a simple `if (post.frontmatter.draft) return null` in the blog index loader is enough. Drafts should still be reachable by direct URL so Lance can preview them.

**`heroImage` is intentionally empty** — the A4 wiring already falls back to `/og?title={title}&type=blog` when `heroImage` is blank. Don't hand-generate a hero image; Lance will supply or approve one before publish.

---

## A11.3 — Article body

Copy the full article body from `audits/montaic/implementation/A11-fair-housing-pillar-article.md` (lines 47 through 225 of that file) into the post body. That's everything from the byline through the closing CTA and related reading line.

**Do not edit the voice.** Lance will do the voice pass himself before publish. Your job is mechanical transcription into the blog file format.

**Markdown conversions to handle during paste:**
- The `*By Lance Roylo, Founder of Montaic*` and `*Published April 9, 2026*` lines can be removed if the blog template already renders an author + date header from frontmatter (most do). Check the template.
- The `---` dividers in the source are rhetorical, not structural — use them as markdown horizontal rules only if the blog theme renders them well, otherwise replace with section-heading `##` breaks.
- The `[CTA button: Try the free Montaic listing grader →]` placeholder should become a real CTA component using whatever button pattern the rest of the Montaic blog uses. Link target: `/free-listing-grader` (confirm the actual URL from A6).
- The `[Related reading: ...]` placeholder should become real links to two related posts if they exist in the blog corpus. If they don't exist yet, leave the placeholder as a comment for Lance to fill in.

**Placeholders to leave in place** (Lance fills these):

Any outbound citation link. The article text currently says things like "HUD published guidance titled..." without a link. These need to become real anchor links to:
1. The HUD 2024 guidance PDF at hud.gov
2. 42 U.S.C. § 3604 at law.cornell.edu
3. A NAR Fair Housing resource page
4. A specific court case or settlement (if Lance supplies one)
5. One peer-reviewed or industry article on AI + discrimination

**Do not invent URLs.** If you can't find a canonical source Lance has already cited somewhere in the repo or audit docs, leave the reference as plain text and flag it in your report-back as "needs citation link." Lance will add them.

---

## A11.4 — Wire the `@graph` (BlogPosting + FAQPage)

The blog post page already uses `blogPostingSchema()` from A4. A11 adds a second node in the same `@graph`: FAQPage.

**File:** `app/blog/[slug]/page.tsx` (or wherever the blog schema render lives)

Pattern:

```ts
import { blogPostingSchema, faqPageSchema, breadcrumbSchemaFromPath } from "@/lib/schema";

// Inside the page component, after loading post:
const url = `https://montaic.com/blog/${post.slug}`;

const graphNodes: any[] = [
  blogPostingSchema({
    slug: post.slug,
    headline: post.frontmatter.title,
    description: post.frontmatter.description,
    datePublished: post.frontmatter.date,
    dateModified: post.frontmatter.updated,
    heroImage: post.frontmatter.heroImage
      || `https://montaic.com/og?title=${encodeURIComponent(post.frontmatter.title)}&type=blog`,
    wordCount: getWordCount(post.content),
    keywords: getFrontmatterKeywords(post.frontmatter),
    articleSection: getArticleSection(post.frontmatter),
  }),
  breadcrumbSchemaFromPath(`blog/${post.slug}`, post.frontmatter.title),
];

// Only add FAQPage if the post has frontmatter.faqs defined
if (post.frontmatter.faqs && post.frontmatter.faqs.length > 0) {
  graphNodes.push(
    faqPageSchema({
      url,
      items: post.frontmatter.faqs,
    })
  );
}

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": graphNodes,
};
```

**Why frontmatter-driven FAQ:** Making FAQPage opt-in via frontmatter means every post can carry FAQ schema without touching the template. Other posts that include Q&A sections can add `faqs:` to their frontmatter later and get FAQPage schema automatically.

---

## A11.5 — Add the FAQ data to the post frontmatter

Append this to the frontmatter block from A11.2:

```yaml
faqs:
  - question: "Does the Fair Housing Act actually apply to AI output?"
    answer: "Yes. HUD clarified this in 2024 guidance. The content is what matters, not the source. If the content violates the Fair Housing Act, the agent who published it is responsible — regardless of whether a human or an AI wrote it."
  - question: "Is ChatGPT safe to use for listings?"
    answer: "ChatGPT is a general-purpose tool with no Fair Housing compliance mechanism. It regularly generates content with familial status, religious, and demographic language that violates the Act. It is not unsafe to use ChatGPT, but it IS unsafe to publish ChatGPT output without running it through a compliance check first. Most agents do not do the compliance check."
  - question: "What's a Fair Housing violation in a listing description?"
    answer: "Any language that shows preference or discrimination based on race, color, religion, sex, national origin, disability, or familial status. The most common violations are phrases like 'perfect for young families' (familial status), 'close to a religious institution' (religion), 'safe neighborhood' (often a demographic proxy), and 'wheelchair access not needed' (disability)."
  - question: "Can I get in trouble for a Fair Housing violation in a listing?"
    answer: "Yes. Agents have been fined, sued, and had licenses suspended for Fair Housing violations in listing advertisements. The median settlement is $5,000 to $15,000. Some cases have exceeded $100,000. Legal defense costs alone typically run over $20,000."
  - question: "What should I do if I've been using generic AI tools for listings?"
    answer: "Three steps. First, audit your last 10 to 20 listings for the common violation patterns: familial status language, religious references, coded neighborhood descriptions, disability-exclusion language, and gendered assumptions. Second, switch to a tool with Fair Housing compliance scanning built in. Third, keep a record of which tool generated which copy and when, in case a complaint ever gets filed."
  - question: "Does Montaic's Fair Housing scanner catch everything?"
    answer: "No compliance scanner catches 100% of violations. Montaic's scanner is trained specifically on HUD-flagged language patterns and Fair Housing case law, and it catches 95 percent or more of the patterns that have been flagged in past cases. The final few percent requires human review, specifically the judgment calls about what constitutes a coded demographic reference in a specific local context. That is why Montaic flags potential issues rather than silently rewriting them."
```

**Notes on the answer text:**
- I rewrote the em dashes and quoted phrases in the source article into prose-friendly ASCII for the schema. Schema answer text should be plain text — no markdown, no special punctuation that might break JSON-LD parsing.
- The dollar sign in "$5,000 to $15,000" is safe in YAML strings but needs to be quoted if your frontmatter parser is strict. If it errors, wrap the whole answer in double quotes and escape any internal double quotes.
- These answers match the in-article FAQ section but are slightly tightened for schema. That's fine — AI engines treat the schema answers as the canonical short-form answer.

---

## A11.6 — Related reading block

At the bottom of the article body, replace `[Related reading: ...]` with real links. Candidate related posts that probably already exist in the corpus:

- `/blog/best-ai-listing-description-generator`
- `/blog/fair-housing-language-to-avoid-in-mls-listings` (if it exists — check first)
- `/blog/how-montaic-writes-listings` (if it exists)

Only link to posts that actually exist. If fewer than 2 relevant posts exist, link to just one, or remove the related reading block entirely and flag it in your report-back so Lance can decide what to link.

---

## A11.7 — Draft preview workflow

Make sure Lance can preview the draft before publishing. The workflow should be:

1. Post is saved with `draft: true`
2. Post is NOT in blog index, NOT in sitemap, NOT in RSS
3. Post IS reachable at `https://montaic.com/blog/fair-housing-ai-compliance-agents` by direct URL
4. The draft page renders with all schema + content exactly as it will when published
5. Lance previews, does voice pass + citation pass in a branch or directly on main
6. Lance flips `draft: false` and redeploys to publish

If the current blog system doesn't support this workflow, add it. The simplest version:

```ts
// app/blog/[slug]/page.tsx
export default async function BlogPost({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug);
  if (!post) return notFound();

  // Drafts are reachable by direct URL but noindex'd
  const isDraft = post.frontmatter.draft === true;

  return (
    <>
      {isDraft && <meta name="robots" content="noindex,nofollow" />}
      {/* rest of the page */}
    </>
  );
}
```

And in the blog index loader:

```ts
export async function getAllPosts() {
  const posts = await loadPosts();
  return posts.filter((p) => !p.frontmatter.draft);
}
```

And in the sitemap:

```ts
const blogUrls = posts
  .filter((p) => !p.frontmatter.draft)
  .map((p) => `https://montaic.com/blog/${p.slug}`);
```

If any of these three already exist in the codebase, leave them alone. Only add what's missing.

---

## Validation

After deploying the draft:

```bash
# Page loads by direct URL
curl -s -o /dev/null -w "%{http_code}" https://montaic.com/blog/fair-housing-ai-compliance-agents
# Expected: 200

# Page is noindex'd while in draft
curl -s https://montaic.com/blog/fair-housing-ai-compliance-agents | grep -o 'noindex'

# Page does NOT appear in blog index
curl -s https://montaic.com/blog | grep -c 'fair-housing-ai-compliance-agents'
# Expected: 0

# Page does NOT appear in sitemap
curl -s https://montaic.com/sitemap.xml | grep -c 'fair-housing-ai-compliance-agents'
# Expected: 0

# BlogPosting schema present on the draft page
curl -s https://montaic.com/blog/fair-housing-ai-compliance-agents | grep -o '"@type":"BlogPosting"'

# FAQPage schema present
curl -s https://montaic.com/blog/fair-housing-ai-compliance-agents | grep -o '"@type":"FAQPage"'

# All 6 Question nodes present
curl -s https://montaic.com/blog/fair-housing-ai-compliance-agents | grep -o '"@type":"Question"' | wc -l
# Expected: 6

# Hero image fallback resolves
curl -s https://montaic.com/blog/fair-housing-ai-compliance-agents | grep -o '"@type":"ImageObject"'
```

All eight checks should pass. Then paste the draft URL into the [Rich Results Test](https://search.google.com/test/rich-results) and confirm both BlogPosting and FAQPage are detected with no errors.

---

## Known risks

- **`faqs` frontmatter parser:** If the current blog system uses a strict YAML parser, the multi-line quoted answer strings may error. If that happens, move the FAQ data to a separate `.json` file (`content/blog/fair-housing-ai-compliance-agents.faqs.json`) and import it in the page component. Flag this if you hit it.
- **Draft leakage:** If the sitemap or RSS feed generator doesn't already filter on `draft: true`, the post will leak out before Lance is ready. Double-check both before reporting back.
- **`@graph` ordering:** Some validators prefer the primary entity (BlogPosting) as the first node. Keep that order.
- **`/og` fallback fonts:** The A8 route uses edge runtime with specific font loading. A title as long as "The Fair Housing Act Applies to AI Now. Here's What Every Agent Needs to Know." may overflow the generated image. Spot-check the OG image by opening `https://montaic.com/og?title=The%20Fair%20Housing%20Act%20Applies%20to%20AI%20Now.%20Here's%20What%20Every%20Agent%20Needs%20to%20Know.&type=blog` in a browser. If it overflows, fall back to the shorter headline `"Fair Housing Act Applies to AI Now"` for the og image only, while keeping the full headline in the article and schema.
- **FAQ duplication:** The FAQ section exists both in the article body (as prose) and in the FAQPage schema (as structured data). This is correct and expected — Google and AI engines read both. Do not remove either.

---

## Out of scope for Claire

- **Voice personalization.** The draft is written, but Lance does a read-through pass before publish. Don't edit the prose.
- **Outbound citations.** HUD guidance PDF link, 42 USC § 3604, NAR Fair Housing, court case, peer-reviewed article. Lance supplies these.
- **Final hero image.** The `/og` fallback is fine for draft. Lance either approves it or supplies a custom image before publish.
- **Flipping `draft: false`.** Lance publishes.
- **Social / outreach / backlink push.** Not a codebase concern.
- **A10 entity registrations** (Wikidata, Crunchbase, LinkedIn, etc.). Off-site work Lance handles directly.

---

## When you're done

Confirm all 8 validation checks pass. Then tell Lance:

> "A11 draft deployed. `faqPageSchema()` utility added to lib/schema.ts, Fair Housing article file created at [path] with draft:true, BlogPosting + FAQPage schema wired into @graph, 6 FAQ Question nodes validated, noindex confirmed, draft excluded from blog index + sitemap + RSS. Needs Lance pass for voice + citation links + publish. 0 errors. Returned to Claude."

Include in your report:
- The exact file path where you placed the article
- Whether the blog system already had a draft mechanism or you added one
- Any outbound citations you left as plain text for Lance to link
- Whether the `/og` hero image fallback rendered cleanly or overflowed
- Any related reading links you were able to wire vs. left as placeholders

---

## Questions?

If the blog system doesn't support `draft: true` frontmatter at all and adding that mechanism is more than a 15-minute change, flag it and stop. We'll decide whether to add the infrastructure or publish-live and rely on Lance's edits being fast. Don't spend more than 15 minutes on the draft infrastructure.

If the existing `blogPostingSchema()` call site doesn't match the pattern in A11.4 (e.g. it's structured differently than A4 laid out), reconcile to whatever A4 actually landed as. The goal is one `@graph` with BlogPosting + BreadcrumbList + FAQPage (when frontmatter supplies FAQ data). Match the A4 pattern, not the A11.4 example.
