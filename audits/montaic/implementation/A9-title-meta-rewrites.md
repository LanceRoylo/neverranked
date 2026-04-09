# A9 — Title Tag + Meta Description Rewrites

**What it does:** Rewrites the title and meta description for every under-optimized page. The pricing page's 17-character title ("Pricing — Montaic") is the most egregious example, but there are quieter wins across the site.

**Where it goes:** Page-level metadata updates. Each one is a 30-second edit.

**Time to implement:** 45 minutes for the full list below.

**Impact:** MEDIUM. Rewrites won't change rankings on their own, but paired with the schema and canonical fixes, they help AI engines understand what each page is about.

---

## Rewrite rules

Before the specific rewrites, here are the rules I'm applying:

1. **Title: 50-65 characters** — under the Google truncation point, dense enough to include keywords
2. **Title format: `[Primary Keyword] — [Differentiator] | Montaic`** — brand always goes last
3. **Meta description: 140-155 characters** — under Google's truncation point (not 160, because Google truncates with an ellipsis)
4. **Meta description format: `[What it is]. [Who it's for]. [Key differentiator].`** — three short sentences max
5. **No "voice" language** — replaced with "writing style," "tone," "author-trained" per the keyword report
6. **Include the phrase "Fair Housing" on compliance-relevant pages** — positioning pivot
7. **No em dashes in meta descriptions** (em dashes are interpreted as word boundaries by some crawlers)

---

## Homepage

**Current title (48 chars):**
`Montaic — Your Next Listing, Ready in 30 Seconds`

**Rewrite (58 chars):**
```
Montaic — AI Listing Content for Real Estate Agents
```

**Current meta (165 chars):**
`One input. Five publish-ready content pieces — MLS description, marketing copy, Instagram caption, headline, and bullet points. Written in your voice. Free to start.`

**Rewrite (152 chars):**
```
AI-native listing content for real estate agents. MLS descriptions, social posts, fact sheets, and marketing copy in your writing style. Free to start.
```

**Why:** The original title led with the "30 seconds" tagline, which is a value prop but not a keyword. The rewrite puts "AI Listing Content for Real Estate Agents" in the title which is a direct commercial keyword match. Meta description drops "voice" language and adds "writing style" + "fact sheets" for differentiation.

---

## Pricing

**Current title (17 chars):**
`Pricing — Montaic`

**Rewrite (60 chars):**
```
Montaic Pricing — Free to Start, $149/mo Pro for Real Estate
```

**Current meta (181 chars, over limit):**
`Start free, go Pro at $149/month for the full agent toolkit, or upgrade to Broker at $299/month for voice clone, commercial properties, and team seats. Save 16% with annual billing.`

**Rewrite (150 chars):**
```
Start free with 3 listings. Pro at $149/mo unlocks unlimited content, writing style calibration, and Fair Housing scanning. Broker at $299/mo.
```

**Why:** The current title is catastrophically short. The rewrite triples its length and adds the $149 anchor directly in the title — a proven pricing SEO move. Meta description drops "voice clone" to avoid semantic collision with audio voice AI, replaces with "writing style calibration" and foregrounds Fair Housing.

---

## Free Listing Generator

**Current title (60 chars):**
`Free Listing Description Grader | Score Your Copy in Seconds`

**Rewrite (60 chars):**
```
Free MLS Listing Grader — Score & Rewrite Your Copy Instantly
```

**Current meta (153 chars):**
`Paste your listing description and get an instant AI-powered grade with category breakdowns. See exactly what's weak and get a professional rewrite.`

**Rewrite (150 chars):**
```
Paste any MLS listing description for an instant AI grade and rewrite. Scores clarity, appeal, Fair Housing, and MLS fit. No signup, no credit card.
```

**Why:** Current title is fine but drops "MLS" which is the higher-intent keyword. Meta gets "Fair Housing" added as a specific differentiator.

---

## Blog — "Best AI Listing Description Generator"

**Current title (81 chars, at limit):**
`The Best AI Listing Description Generator for Real Estate Agents (2026) — Montaic`

**Rewrite (76 chars):**
```
The Best AI Listing Description Generator 2026 — Honest Review | Montaic
```

**Current meta (180 chars, over limit):**
`An honest breakdown of every AI listing description tool on the market in 2026. What works, what doesn't, and why voice-profiled AI is the only category that actually matters.`

**Rewrite (152 chars):**
```
An honest breakdown of every AI listing description tool in 2026. What works, what doesn't, and why writing-style calibration is the only thing that matters.
```

**Why:** Title gets "Honest Review" which is a high-intent modifier that AI engines use to rank comparison content. Meta drops "voice-profiled" language and swaps in "writing-style calibration" per the positioning pivot.

---

## Tools — MLS Description Generator

**Current title (61 chars):**
`AI MLS Description Generator for Real Estate Agents | Montaic`

**Rewrite (62 chars):**
```
AI MLS Description Generator — 30-Second Listing Copy | Montaic
```

**Current meta (135 chars):**
`Generate MLS-compliant listing descriptions in your voice. Fair Housing checked, character-limit aware, ready to publish in 30 seconds.`

**Rewrite (147 chars):**
```
Generate MLS-compliant listing descriptions in your writing style. Fair Housing scanned, character-limit aware, ready to publish in 30 seconds.
```

**Why:** Title adds the "30-Second" speed claim to differentiate from generic tool names. Meta just swaps "voice" for "writing style."

---

## Markets — Austin, TX

**Current title (59 chars):**
`Real Estate Marketing Tools for Austin, TX Agents | Montaic`

**Rewrite (63 chars):**
```
Austin Real Estate AI Tools — Listings, Social, Fact Sheets | Montaic
```

**Current meta (146 chars):**
`Austin TX real estate agents: generate MLS-ready listing descriptions in your voice. Local market context, Fair Housing checked, 11 content types.`

**Rewrite (151 chars):**
```
Austin TX real estate AI. Generate listing descriptions, social posts, and fact sheets with local market context and Fair Housing scanning. Free to try.
```

**Why:** Title leads with "Austin Real Estate AI Tools" which matches the actual search intent. Meta drops "voice" and adds "Free to try" as a conversion lever.

**Template for all 50+ city pages:**
Title: `{City} Real Estate AI Tools — Listings, Social, Fact Sheets | Montaic`
Meta: `{City} {State} real estate AI. Generate listing descriptions, social posts, and fact sheets with local market context and Fair Housing scanning. Free to try.`

One regex replace across all city page templates.

---

## Compare — Montaic vs ChatGPT

**Current title (61 chars):**
`Montaic vs ChatGPT for Real Estate Listings | 2026 Comparison`

**Rewrite (68 chars):**
```
Montaic vs ChatGPT for Real Estate Listings — Honest 2026 Comparison
```

**Current meta (146 chars):**
`Montaic vs ChatGPT for listing descriptions: voice matching, MLS compliance, Fair Housing checks. See the real differences for real estate agents.`

**Rewrite (153 chars):**
```
Montaic vs ChatGPT for listings: writing style calibration, MLS compliance, and Fair Housing scanning. See what each tool actually does for agents.
```

**Why:** Title adds "Honest" which triggers comparison-intent searches. Meta swaps "voice matching" for "writing style calibration."

**Template for all comparison pages:**
Title: `Montaic vs {Competitor} for Real Estate Listings — Honest 2026 Comparison`
Meta: `Montaic vs {Competitor} for listings: writing style calibration, MLS compliance, and Fair Housing scanning. See what each tool actually does for agents.`

---

## Tools — Fair Housing Compliance Checker (the positioning pivot)

This page exists in your sitemap (`/tools/fair-housing-compliance-checker`) but we haven't sampled it. Regardless of current state, this is a CRITICAL page given the positioning pivot in the keyword report.

**Recommended title (63 chars):**
```
Fair Housing AI Compliance Checker for Real Estate | Montaic
```

**Recommended meta (151 chars):**
```
Scan any real estate listing description for Fair Housing Act violations in seconds. Built for agents who know HUD holds them legally responsible.
```

**Why:** This is the single biggest positioning opportunity from the keyword report. The HUD 2024 guidance gives Montaic a legally defensible differentiator. The title and meta lean hard into the legal angle.

---

## Priority rewrite list (in execution order)

Do these in this order:

| # | Page | Why |
|---|---|---|
| 1 | Homepage | Brand anchor |
| 2 | Pricing | Worst current offender |
| 3 | Free Listing Generator | Inbound magnet |
| 4 | Fair Housing Compliance Checker | Positioning pivot |
| 5 | Tools: MLS Description Generator | Highest tool page volume |
| 6 | Compare pages (8) | Use the template |
| 7 | Market pages (50+) | Use the template |
| 8 | Tool listing-type variants (25+) | Use the template |
| 9 | Blog posts (55) | Individual attention, 2-3 min each |

---

## Effort estimate

- Homepage + pricing + free-grader + Fair Housing: 15 min
- MLS tool + other top 5 tool pages: 15 min
- Compare page template + 8 applications: 10 min
- Market page template + 50 auto-applications: 10 min (template-driven)
- Blog post rewrites (batch approach): 30 min for top 15 posts
- Validate with Rich Results Test: 10 min

**Total: ~90 minutes for full site coverage.**

Or if you only do the top 4 (home, pricing, free-grader, Fair Housing): **~15 minutes.**
