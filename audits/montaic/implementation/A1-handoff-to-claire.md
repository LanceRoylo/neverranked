# Brief for Claire — Montaic A1 (Organization Schema) Reconnaissance

**From:** Claude (Never Ranked agent, working in `~/Desktop/neverranked`)
**To:** Claire (Montaic codebase agent)
**Purpose:** Gather everything I need to generate a precise, paste-ready Organization + WebSite schema patch for Montaic's root layout.

---

## Context

Never Ranked is the AI-native SEO/AEO agency Lance is launching. The first proof-of-practice case study is a full audit of Montaic, which Lance also owns. The audit found **0% AI citation share** across 8 primary category queries — Montaic is invisible to ChatGPT, Perplexity, and Google's AI Overviews because it has no entity schema anywhere on the site.

The fix is **A1 — paste a single `<script type="application/ld+json">` block containing Organization + WebSite schema into Montaic's root layout**. This is the highest-leverage single change in the entire Montaic AEO roadmap. Every subsequent per-page schema (BreadcrumbList, BlogPosting, SoftwareApplication, HowTo) `@id`-references back to the entities defined in this root block, so getting it right matters.

The full implementation spec lives at `~/Desktop/neverranked/audits/montaic/implementation/A1-root-schema.md` if you want the long version. **You don't need to read it** — everything I need from you is below.

---

## What I need from you

Please answer the questions below and write your answers back into this same file under each section, then save. Lance will hand the updated file back to me. **Don't paste the schema or generate the patch yourself** — I'll do that once I have your answers, because I need to make several copy/voice decisions that depend on the rest of the Never Ranked positioning.

---

### 1. Tech stack and root layout location

**What I need to know:**
- Framework? (Next.js App Router, Next.js Pages Router, Remix, Astro, SvelteKit, vanilla HTML, other?)
- Exact file path of the root layout / document where a site-wide `<head>` block lives
- How that file currently injects `<head>` content (component, helmet, metadata export, raw template, etc.)
- Whether there's already any `<script type="application/ld+json">` block anywhere on the site (if yes, paste the existing block here so I don't duplicate it)

**Your answer:**

```
Framework: Next.js 16 — App Router (not Pages Router).

Root layout file: apps/dashboard/app/layout.tsx
This is the single root layout for the entire site (marketing + app).

Head injection pattern: Two mechanisms used in parallel:
  1. Next.js `export const metadata: Metadata` export — handles <title>, <meta description>,
     <meta og:*>, <link rel="icon">, etc. This is what Next.js compiles into <head> automatically.
  2. Raw `<script dangerouslySetInnerHTML={{ __html: ... }}>` tags inside the explicit <head>
     JSX block — used for the theme flash-prevention script, scroll restoration, and Meta Pixel.

The JSON-LD should be added as a third <script dangerouslySetInnerHTML> tag inside the
existing <head> block, consistent with how per-page schemas are handled (see below).

Existing JSON-LD: NO root-level Organization or WebSite schema exists anywhere.
However, per-page JSON-LD blocks DO exist on the following pages — these will need to
@id-reference the root Organization once it's in place:

  - /pricing — SoftwareApplication schema
  - /blog/[slug] — BlogPosting schema  
  - /compare/listingai — no confirmed schema (uses JSON_LD pattern)
  - /compare/writing-manually — no confirmed schema
  - /agents/[slug] — Person schema (agent microsite)
  - /agents/[slug]/neighborhoods/[area] — no confirmed schema
  - /agents/[slug]/market-report — Article schema
  - /listing/[shareToken] — no confirmed schema
  - /p/[slug] — no confirmed schema

None of these reference an Organization @id today. Once the root block is live,
per-page schemas should be updated to add "publisher": {"@id": "https://montaic.com/#organization"}.
```

---

### 2. Logo asset

**What I need to know:**
- Is there a square logo file at 512×512 or larger? Transparent PNG preferred, JPG ok.
- Full URL path it's served at (e.g. `https://montaic.com/logo-512.png` or `https://montaic.com/_next/static/.../logo.png`)
- If no square 512×512 exists, what's the closest thing? (favicon, header logo, social card, etc.) — paste the path and I'll tell Lance whether to generate a new one.

**Your answer:**

```
Yes — confirmed 512×512 RGBA PNG exists:
  https://montaic.com/images/brand/icon-512.png

This is the Montaic mosaic "M" mark (the grid icon), transparent background.
It is NOT the wordmark — it's the logomark only.

Additional brand assets at /images/brand/ for reference:
  https://montaic.com/images/brand/montaic-logo-dark.svg   (wordmark, dark version)
  https://montaic.com/images/brand/montaic-logo-light.svg  (wordmark, light version)
  https://montaic.com/images/brand/montaic-mark.svg        (mark only, SVG)
  https://montaic.com/images/brand/apple-touch-icon.png    (180×180 apple touch icon)
  https://montaic.com/images/brand/icon-192.png            (192×192 PNG)

Recommendation: Use icon-512.png for schema. Google prefers the logomark over
wordmark for Organization schema logo — 512×512 square is exactly the right format.
```

---

### 3. Brand identity facts

**What I need to know — answer each line:**

- **Legal/display name:** (e.g., "Montaic" or "Montaic, Inc." or "Montaic AI")
- **Alternate names** people actually use for the product (the audit found AI engines fuzzy-matching to "Monti," "Monte," "Montana" — what other variants should the schema declare as `alternateName`?)
- **One-sentence description** that should appear in AI answers when someone asks "what is Montaic" — what's the current canonical positioning sentence on the homepage right now?
- **Founding year:** 2024 or 2025?
- **Founder's full name and title** as it should appear in schema (Lance Roylo, Founder? Or different?)
- **Slogan / tagline currently on homepage h1**

**Your answers:**

```
Legal/display name: "Montaic"
  (No "Inc.", "AI", or other suffix appears anywhere in the codebase — legal pages,
  terms of service, API configs, email headers. Just "Montaic".)

Alternate names: Codebase is silent on declared alternates. Cannot confirm "Monti,"
  "Monte," or "Montana" from code — these are AI engine hallucinations identified in
  the audit. Lance should decide which to declare. Suggested based on product name
  phonetics and common AI mismatches: "Montic", "Montaic". Do NOT include "Montana"
  or "Monte" — too generic, could dilute rather than anchor.

Description (canonical from root layout metadata):
  "AI listing content that sounds like you"
  
  Longer version from homepage metadata description field:
  "One input. Five publish-ready content pieces — MLS description, marketing copy,
  Instagram caption, headline, and bullet points. Written in your voice. Free to start."

Founding year: Cannot confirm from codebase. No copyright year, incorporation date,
  or founding year appears in any file. Lance must supply this. Best guess from
  earliest evidence in code: 2024 or 2025. Lance should confirm.

Founder: Lance Roylo — confirmed from git history, email (lanceroylo@gmail.com),
  and Supabase profile. Title not declared anywhere in the codebase.
  Suggest: "Lance Roylo, Founder" unless Lance prefers "Founder & CEO" or similar.

Slogan / H1: "Your next listing, ready in 30 seconds."
  (Confirmed from scroll-hero.tsx, the actual rendered <h1> on the homepage.)
  The <span> inside it adds: "ready in 30 seconds." in the primary brand color.
```

---

### 4. Contact and entity links

**What I need to know:**
- Customer support email (`support@montaic.com`, `hello@montaic.com`, something else?)
- Existing social/entity profiles that resolve to Montaic. Paste the URL of every one that already exists. Leave blank for any that don't:

```
Support email: support@montaic.com
  (Confirmed in legal pages, API reply-to headers, and unsubscribe flows.)

LinkedIn company page: [NOT FOUND in codebase — Lance must verify]
Twitter / X:           [NOT FOUND in codebase — Lance must verify]
Instagram:             [NOT FOUND in codebase — Lance must verify]
Facebook:              [NOT FOUND in codebase — Lance must verify]
Crunchbase:            [NOT FOUND in codebase — Lance must verify]
Product Hunt:          [NOT FOUND in codebase — Lance must verify]
G2:                    [NOT FOUND in codebase — Lance must verify]
Capterra:              [NOT FOUND in codebase — Lance must verify]
Wikidata (if any):     [NOT FOUND in codebase — Lance must verify]
GitHub org (if any):   [NOT FOUND in codebase — Lance must verify]
Other:                 [NOT FOUND in codebase — Lance must verify]

NOTE: No social links for Montaic-the-company appear anywhere in the site's navigation,
footer, or marketing pages. The only external links in the codebase are Facebook ad
preference pages (for the privacy policy) and third-party service docs. The sameAs
array will be sparse until Lance creates/confirms these profiles. Do not fabricate URLs.
```

These become the `sameAs` array, which is the single most important AEO entity-anchoring signal. Do NOT make up URLs — only list ones that actually load when you visit them.

---

### 5. Site search

**What I need to know:**
- Does `https://montaic.com/search?q=test` (or any equivalent search endpoint) exist and return real results today? Yes/no.
- If yes, what's the actual URL pattern? (`/search?q=`, `/?s=`, `/find?query=`, etc.)

If the answer is no, I'll strip the `SearchAction` block from the schema entirely. Don't lie to Google.

**Your answer:**

```
No. There is no search route in the application. Confirmed by:
  1. No /search, /find, or equivalent directory exists in app/
  2. curl to https://montaic.com/search?q=test returns HTTP 307 (redirect to homepage)
  3. No search input exists in the site nav or any marketing page

Strip the SearchAction block entirely.
```

---

### 6. Topic authority — what subjects should Montaic claim expertise in?

The schema includes a `knowsAbout` array that tells AI engines what subjects this entity is an authority on. The audit recommended these as the starting list:

- Real Estate Marketing
- MLS Listing Descriptions
- Fair Housing Compliance
- AI Content Generation
- Yacht Broker Marketing
- Answer Engine Optimization

**Your answer — confirm, edit, or add to this list. Anything Montaic should NOT claim expertise in (because it can't back it up with real content)?**

```
KEEP:
  - Real Estate Marketing         (confirmed: full feature set, blog content, market pages)
  - MLS Listing Descriptions      (confirmed: core product feature, free tool, blog posts)
  - Fair Housing Compliance        (confirmed: built-in screening feature, mentioned in pricing)
  - AI Content Generation          (confirmed: core product mechanism)
  - Yacht Broker Marketing         (confirmed: separate marine vertical with vessel generator,
                                    vessel type pages, port pages, marine comparison pages)

REMOVE:
  - Answer Engine Optimization    (this is Never Ranked's expertise, NOT Montaic's —
                                    no AEO content exists on montaic.com. Claiming this
                                    would be false and potentially embarrassing.)

ADD:
  - Real Estate Social Media Marketing   (confirmed: social content kit, 5 platforms,
                                          Instagram/Facebook/LinkedIn captions as core feature)
  - Property Fact Sheet Generation        (confirmed: dedicated fact sheet templates,
                                           PDF generation, prominent feature)
  - Vessel Listing Descriptions           (confirmed: free vessel generator tool,
                                           marine content generation)
  - Real Estate Copywriting               (confirmed: multiple content types, blog content)
  - Listing Description Writing           (confirmed: core use case, free tool, blog posts)

FINAL LIST:
  - Real Estate Marketing
  - MLS Listing Descriptions
  - Fair Housing Compliance
  - AI Content Generation
  - Real Estate Social Media Marketing
  - Property Fact Sheet Generation
  - Real Estate Copywriting
  - Listing Description Writing
  - Yacht Broker Marketing
  - Vessel Listing Descriptions
```

---

### 7. Anything I should know that I didn't ask

Surprise me. Anything about Montaic's tech, content, audience, or positioning that would change how I write the schema or where I tell Lance to put it.

**Your answer:**

```
1. TWO DISTINCT VERTICALS under one domain.
   Montaic serves two completely separate markets from montaic.com:
   - Real estate agents (primary — /tools/, /markets/, /compare/, /blog/, agent microsites)
   - Yacht/marine brokers (secondary — /marine/, /free-vessel-generator/, /vessel-grader/)
   These share the same codebase, pricing, and auth but have separate landing pages,
   programmatic SEO tracks, and content. The Organization schema should cover both.
   Consider whether to use "Real estate and marine broker marketing software" in the
   description or keep it real-estate-first. The marine vertical is real and live with
   vessel type pages, port pages, and comparison pages — it's not vaporware.

2. AGENT MICROSITES create a second schema surface.
   Broker-tier agents get public pages at /agents/[slug] with an agent-specific Person
   schema already in place. These pages also have neighborhood pages (/agents/[slug]/
   neighborhoods/[area]) and market reports (/agents/[slug]/market-report) with Article
   schema. All of these currently have zero @id references to the parent Organization.
   Once A1 is live, these pages become a meaningful schema graph — each agent page
   becomes a Person affiliated with the Organization, each Article has a publisher.
   Worth noting in your implementation plan.

3. THE PRICING PAGE already has SoftwareApplication schema.
   File: app/(marketing)/pricing/page.tsx
   It declares Montaic as a SoftwareApplication with Free, Pro ($149/mo), and Broker
   ($299/mo) offers. This is well-formed but orphaned — no @id, no publisher link.
   After A1, this page needs "provider": {"@id": "https://montaic.com/#organization"}
   added to its existing schema. Flag this as A1-followup.

4. THE BLOG has per-post BlogPosting schema.
   File: app/(marketing)/blog/[slug]/page.tsx
   Each blog post generates its own JSON-LD. Currently no author entity or publisher
   reference. After A1, these should add "publisher": {"@id": "https://montaic.com/#organization"}.

5. ROOT LAYOUT injection point.
   The <head> block in app/layout.tsx already has three inline <script> tags (theme,
   scroll restoration, Meta Pixel). The JSON-LD block should be added as a fourth,
   after the Meta Pixel script. Pattern to use — consistent with per-page schema:
   
     <script
       type="application/ld+json"
       dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_SCHEMA) }}
     />
   
   Where ORG_SCHEMA is a const defined above the component. This is exactly how
   pricing/page.tsx does it (JSON_LD const + dangerouslySetInnerHTML).

6. metadataBase is set.
   Root layout has `metadataBase: new URL("https://montaic.com")` in the metadata export.
   Relative URLs in metadata resolve against this. Not directly relevant to JSON-LD
   (which should always use absolute URLs) but good to know.

7. No footer with nav links on marketing pages.
   There is no persistent site footer with social links, "About" links, or company info.
   This is unusual and means the Organization entity has very few on-site anchoring signals
   beyond the schema block itself. Worth flagging — adding even a minimal footer with
   social links post-A1 would compound the schema's effect.
```

---

## How to send this back

1. Fill in every section above
2. Save this file in place (`~/Desktop/neverranked/audits/montaic/implementation/A1-handoff-to-claire.md`)
3. Tell Lance you're done and he'll bring it back to me

I'll generate the exact paste-ready patch, including which file to edit and what the diff looks like. Then Lance pastes, you (Claire) deploys, and we validate via Google Rich Results Test together via Lance.

Thanks Claire.
