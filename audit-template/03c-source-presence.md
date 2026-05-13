# Source Presence — {Client Name}

**Auditor:** Never Ranked
**Sample date:** {YYYY-MM-DD}
**Scope:** External profile presence on the surfaces AI engines pull facts from when answering questions about your business

---

## What this section measures

When ChatGPT, Perplexity, Gemini, or Microsoft Copilot answer a question about your business, they don't only read your website. They pull verified facts (hours, location, services, contact info) from a small set of trusted third-party surfaces that maintain claimed business profiles. The set differs per engine, but three sources do disproportionate work:

1. **Bing for Business** — Microsoft Copilot, ChatGPT (when routing through Bing), and Bing-grounded answers all read this
2. **Apple Business Connect** — Apple Intelligence, Spotlight, Maps, and Siri pull from here
3. **Google Business Profile** — Gemini and Google AI Overviews pull from here (and most clients already have this)

Of those, **Bing for Business is the most-missed by Hawaii and continental clients alike**. It's the GBP-equivalent for Microsoft's stack, free to claim, takes about 20 minutes to set up, and significantly improves how ChatGPT and Bing-grounded engines cite your business when a user asks about you by name or category.

---

## Your current source presence

| Source | Status | Why it matters |
|---|---|---|
| Google Business Profile | {GBP_STATUS} | Gemini, Google AI Overviews, Maps |
| Bing for Business | {BING_STATUS} | Microsoft Copilot, ChatGPT (Bing-routed queries) |
| Apple Business Connect | {APPLE_STATUS} | Apple Intelligence, Spotlight, Maps, Siri |

> `{BING_STATUS}` and `{APPLE_STATUS}` default to "Not confirmed" unless we've verified the profile during the audit. Set up the unconfirmed ones to close meaningful citation gaps.

---

## Bing for Business — the highest-leverage missing profile

ChatGPT does most of its web grounding through Bing. When a user asks ChatGPT "best [your category] in [your city]," ChatGPT typically issues one or more Bing queries under the hood, reads the top results, then synthesizes the answer.

If your Bing for Business profile is claimed and complete, Bing's local pack returns your business with verified hours, address, services, photos, and reviews. ChatGPT reads that local pack and includes you in the answer.

If your Bing for Business profile is unclaimed, Bing may still return generic info scraped from the web — but it won't carry the verified-business badge, the canonical hours, or the structured service list. ChatGPT, knowing Bing trusts unclaimed listings less, often skips them.

**Setup time:** ~20 minutes
**Cost:** Free
**Where:** https://www.bingplaces.com
**What you'll need:** Business name, address, phone, hours, website, primary category, photos (3-5)

If you have a Google Business Profile, Bing offers a "Import from Google" flow that pre-fills most of the form. The remaining verification step is a postcard or phone call confirming the address.

---

## Apple Business Connect — Apple Intelligence and Spotlight

Apple shipped Apple Business Connect in 2024 as the unified business profile management surface for Maps, Spotlight, Siri, and the rapidly expanding Apple Intelligence layer. When iPhone or Mac users ask Siri / Spotlight about your business, the answer is sourced from Apple Business Connect.

This surface has fewer users than Bing right now, but the iPhone Intelligence layer is the fastest-growing AI surface in 2026. Claiming the profile is similar lift to Bing.

**Setup time:** ~15 minutes
**Cost:** Free
**Where:** https://businessconnect.apple.com

---

## Business directory NAP consistency

NAP = Name, Address, Phone. AI engines cross-reference your business name and address against multiple directory listings to confirm you're who you say you are. Inconsistencies (a phone number that doesn't match, an old address still listed somewhere) reduce the engine's confidence in citing you.

The top 10 directories to audit for NAP consistency:

1. Yelp
2. Yellow Pages
3. Better Business Bureau
4. Foursquare
5. TripAdvisor (if hospitality / dining)
6. Trustpilot (if e-commerce / SaaS)
7. Glassdoor (for employer presence)
8. LinkedIn Company Page
9. Facebook Business Page
10. Industry-specific directories (e.g., Healthgrades for medical, Avvo for legal)

If your hours or address changed in the last 24 months, audit these 10 for consistency. The cheapest paid service for this is Yext or BrightLocal; the cheapest free option is searching your business name + city on each and updating any stale listings manually.

---

## What deploying these does for your AEO score

These are not schema deployments — they're external profile claims. They don't change anything on your website. They change what trusted-source surfaces AI engines can read about you. Expected impact:

- **Bing for Business:** measurable lift in Microsoft Copilot and ChatGPT citations on category and brand queries within 14 days
- **Apple Business Connect:** measurable lift in Apple Intelligence and Spotlight surfacing within 7 days (Apple indexes fast)
- **NAP consistency:** no immediate engine lift; gradually compounds as engines re-crawl over 60-90 days

---

## Roadmap implications

Section 07 (Roadmap) sequences these alongside the schema and content work. Bing for Business is a Week 1 item — fast, free, high-impact, no engineering work required. Apple Business Connect is Week 2. NAP audit is a Month 2 task (it benefits from a baseline that won't shift mid-audit).

---

## What this section is not

This is not a technical audit of your website. We're not telling you to deploy more schema (that's section 03), or to change your content (that's section 04). We're identifying claimed-profile gaps on the third-party surfaces AI engines trust to verify business facts.

These profiles existed before AI. They're business listings, the kind directory companies have managed for decades. The new dynamic is that AI engines have made these listings high-leverage in a way they weren't five years ago — they're now the primary "is this business real and what do they do" signal for AI synthesis.

---

<!-- AUDIT-GENERATE: This section is template-by-default. Future versions
     will auto-detect Bing for Business and Apple Business Connect claim
     status via DataForSEO local-pack queries. For now, the recommendations
     are standard for every audit; the {STATUS} placeholders are filled
     "Not confirmed" unless the auditor has manually verified during prep. -->
