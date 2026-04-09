# Competitor Teardown — Montaic.com

**Auditor:** Never Ranked
**Sample date:** April 9, 2026
**Competitors analyzed:** ListingAI (category leader), Write.Homes, Nila June, AgentListingAI

---

## Summary

I pulled the homepage of every competitor that cited more often than Montaic in the AI citation audit. The gap isn't dramatic on most dimensions — most competitors are doing roughly the same level of work as Montaic. The gap is specifically on **Organization schema + entity signaling + citation count**, which is exactly what drives AEO visibility.

**Key finding:** The category leader (ListingAI) has **three JSON-LD schemas on its homepage including Organization and LocalBusiness**. Montaic has two and is missing Organization. That single difference is plausibly the largest driver of the 100%-vs-0% citation gap.

---

## Side-by-side comparison

### Homepage technical signals

| Signal | Montaic | ListingAI | Write.Homes | Nila June | AgentListingAI |
|---|---|---|---|---|---|
| Title length | 48 | 64 | 47 | 80 | 59 |
| Meta desc in range (120-160) | ✓ 165 | ✓ 160 | ✓ 147 | ✗ 44 (thin) | ✓ 140 |
| Canonical | ✗ | ✓ | ✓ | ✓ | ✓ |
| og:image | ✓ | ✓ | ✗ | ✓ | ✓ |
| H1 count | 1 | 2 | SPA (no H1 in source) | 1 | 1 |
| Organization schema | **✗** | **✓** | ~ (as publisher only) | **✓** | ✗ |
| WebSite schema | ✗ | ✗ | **✓** | ✗ | ✗ |
| SoftwareApplication | ✓ | ✓ | ✓ | ✗ | ✓ |
| FAQPage | ✓ | ✗ | ✗ | ✗ | ✓ |
| LocalBusiness | ✗ | **✓** | ✗ | ✗ | ✗ |
| Total JSON-LD blocks | 2 | **3** | 2 | 1 | 2 |
| Visible rating text | ✗ | **✓** | ~ (testimonials) | ~ | ✗ |
| Testimonial language | ~ | **✓** | ✓ | ✓ | ~ |
| "Trusted by N users" claim | ✗ | **✓ 31k+** | **✓ 5000+** | ✗ | ✗ |

Bold = where the competitor does something Montaic doesn't.

---

## What each competitor does that Montaic doesn't

### ListingAI (100% citation share)

**Canonical → Organization → LocalBusiness → SoftwareApplication.** Four structured entity signals working together. ListingAI tells AI engines: *this is an organization, it's a local business, it makes software, and here's how to cite it.*

**"Trusted by 31,000+ agents" above the fold.** Numerical social proof. The exact kind of claim AI engines quote verbatim when asked "is ListingAI any good?"

**Keyword-stuffed meta description.** ListingAI's description literally reads: *"Real estate AI listing description generator. Property description examples. AI for real estate agents. Creative listing descriptions. Instagram Post Generator."* This is aggressive, probably too aggressive for classic SEO, but it gives AI engines a lot of keywords to match queries against. Montaic's more editorial descriptions read nicer but match fewer queries.

**Two H1s.** Not ideal by textbook SEO, but their H1s are packed with exact-match keywords. Montaic's single H1 is more editorial ("Your next listing, ready in 30 seconds") which reads better but doesn't exact-match commercial queries.

**What Montaic should steal:** The Organization + LocalBusiness schema stack, the specific numerical social proof claim ("trusted by N agents"), and keyword-denser meta descriptions (without losing the editorial feel).

---

### Write.Homes (50% citation share, 5,000+ agents)

**JS-rendered SPA with a properly populated `<head>`.** Write.Homes is a single-page app — the body is basically empty in the raw HTML response — but the head has full canonical, robots meta, og tags, WebSite schema, and SoftwareApplication schema. This proves that JS rendering isn't the problem for AI crawlers as long as the head metadata is server-rendered.

**WebSite schema instead of Organization.** Less ideal than Organization, but still a structural entity signal.

**"Trusted by 5,000+ agents" claim** in their og:description. Same pattern as ListingAI — the social proof claim is deliberately placed in the metadata so AI engines pull it verbatim.

**What Montaic should steal:** The 5,000+ claim format shows that specific numbers work. Montaic can use this pattern as soon as it has real user counts to cite ("Trusted by [N] real estate agents" or "Generating listings for [N] agents across [M] states").

---

### Nila June (38% citation share)

**Clean single-schema approach.** Only Organization schema, but it's set up correctly with proper sameAs and branding. The lesson: you don't need 5 schemas to win citations — you need the RIGHT schemas.

**Canonical present. og:image present.** Basic hygiene complete.

**Positioning differentiator: "accuracy over AI fiction."** Nila June's entire brand story is built around one specific complaint about competitors ("AI makes up details"). They won a share of citations by naming a problem nobody else was naming. The positioning is distinctive enough that AI engines cite it when asked what's different about Nila June.

**What Montaic should steal:** The single-differentiator positioning approach. Montaic has "voice matching" and "Fair Housing compliance" as two separate angles. Nila June picked ONE and owned it. Montaic should pick whichever is more defensible (my vote: Fair Housing compliance, because it's legally grounded) and lean harder on it.

---

### AgentListingAI (25% citation share)

**Two schemas: SoftwareApplication + FAQPage.** Same stack as Montaic. The main difference is that AgentListingAI's brand name starts with "Agent" — an obvious category descriptor that makes it impossible for Google to confuse.

**"Free, legally-aware tools for real estate agents."** This is the Fair Housing positioning angle expressed as a one-line brand promise. Note that AgentListingAI is getting cited in Fair Housing query results — this is working.

**What Montaic should steal:** Clean, descriptive brand language embedded in the tagline. "Legally-aware" is a strong phrase Montaic could borrow directly — it's specific, unusual, and implies the regulatory angle without requiring explanation.

---

## Where Montaic is actually AHEAD

It's not all bad. Montaic does several things better than the competitor set:

### 1. Programmatic SEO depth

Montaic has **222 URLs** in its sitemap. None of the competitors come close. ListingAI has a few dozen tool pages, Write.Homes has a handful, Nila June is basically a single-page site. Montaic's programmatic scale is a latent advantage waiting to be activated — once the schema is fixed, there are 200+ pages ready to generate long-tail traffic.

### 2. FAQPage schema coverage

Montaic uses FAQPage schema on home, tools, markets, and compare pages. Only AgentListingAI of the competitors also does this. FAQPage content is directly AEO-citable — AI engines extract Q&A pairs from FAQPage-marked content preferentially because they're already structured as answers.

### 3. Comparison page strategy

Montaic is the only competitor with a full `/compare/*` directory covering 8 competitor matchups. Nobody else in the set has this. When Montaic's comparison pages actually rank, they'll dominate their exact-match queries because there's no direct alternative.

### 4. Market vertical depth

50+ city pages. No competitor is doing this at scale. Once schema + canonicals are fixed, this becomes a durable long-tail traffic source.

### 5. Vertical expansion (marine)

Nobody else is doing yacht / boat broker content at all. Montaic's marine vertical is a pure greenfield opportunity with 0 competition and reuse of the same product.

### 6. Editorial content quality

Montaic's blog posts are thoughtful, 1,500-2,500 words, with real opinions. Most competitors have either no blog or a thin content mill. This is a latent asset — it just needs HowTo schema and Person author upgrades to become AI-citable.

---

## The strategic insight

Every competitor is doing ONE thing Montaic isn't. No competitor is doing EVERYTHING Montaic is doing. Montaic's 222-page programmatic structure + comparison page strategy + marine vertical + editorial blog is actually the strongest foundation in the set — **it just isn't being translated into entity signals and citation hooks.**

The roadmap is clear: keep the strategic bets, fix the plumbing. Nothing Montaic is doing at the strategy level needs to change. The fix is mechanical, templated, and well within Lance's control.

---

## Priority list (competitor parity)

| # | Fix | Impact | Effort |
|---|---|---|---|
| 1 | Add Organization schema with sameAs | HIGH | LOW |
| 2 | Add "Trusted by N agents" claim to og:description + H2 | HIGH | LOW (needs real number) |
| 3 | Add LocalBusiness schema (if applicable to SaaS) | MEDIUM | LOW |
| 4 | Add canonical tags to all remaining pages | HIGH | LOW |
| 5 | Denser keyword packing in meta descriptions | MEDIUM | LOW |
| 6 | Lead with Fair Housing positioning as primary differentiator | MEDIUM | MEDIUM |
| 7 | Activate the 200+ pages via schema fix templates | HIGH | MEDIUM |
| 8 | Expand and enrich all 8 comparison pages | HIGH | MEDIUM |
