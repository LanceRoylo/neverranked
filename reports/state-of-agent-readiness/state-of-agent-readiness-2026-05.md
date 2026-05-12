# State of Agent Readiness

## What's missing on the websites AI agents are about to start using

**Sample date:** 2026-05-12
**Panel size:** 25 production sites across 10 verticals
**Successfully scanned:** 19
**Methodology:** Open source. Reproducible.

---

## Headline

**Of 19 production sites NeverRanked scanned across 10 verticals, 1 has any Schema.org ActionType on its root URL.**

That's 5.3%.

The single site is Airbnb, with SearchAction via `potentialAction` on its WebSite schema. The 18 others — including six US banks, three major hospitality chains, three e-commerce platforms, healthcare systems, education, SaaS platforms, and the US government — are at zero. No ReserveAction. No ApplyAction. No BuyAction. No ContactAction. No SearchAction.

This is not a detection failure. NeverRanked's `agent_readiness_check` tool catches Schema.org ActionTypes across JSON-LD (with deep-nesting traversal up to depth 12) and Microdata. The detection works. The web is just not ready for agents yet.

## What this means

Schema.org defines a set of Action types that mark transactional surfaces on a site. `ReserveAction` for booking. `ApplyAction` for applications. `BuyAction` for purchases. `ContactAction` for messages. `SearchAction` for internal search. Plus 22 others covering subscriptions, downloads, reviews, payments, check-ins, RSVPs, donations, and the rest.

When an AI agent — OpenAI Operator, Anthropic computer-use, Perplexity agent mode, ChatGPT agent surface — tries to complete a task on a user's behalf, it looks for these markers. Sites with Action schemas deployed are agent-completable. Sites without have to be interpreted from raw HTML, which fails reliably for most non-trivial tasks.

Today, 95% of enterprise sites are at zero. The category is wide open. The first deployer in each vertical owns the agent layer for the 12-to-18-month window before the field catches up.

## Panel composition

**Successfully scanned (19):**

| Vertical | Sites |
|---|---|
| Banking | ASB, First Hawaiian Bank, Bank of Hawaii, Central Pacific Bank, Chase, Wells Fargo |
| Hospitality | Marriott, Hawaii Theatre, Airbnb |
| Restaurants / reservations | Resy |
| E-commerce | Amazon, Best Buy |
| SaaS | Shopify, Stripe, GitHub |
| Healthcare | Mayo Clinic |
| Education | Harvard |
| Government | IRS |
| Search | Google |

**Blocked by bot detection (6):** Hilton (403), OpenTable (timeout), Kaiser Permanente (network failure), Yelp (403), Expedia (429), Etsy (403).

The block rate is itself a finding. **One in four major sites we tried to audit blocked an automated request from a clearly-identified bot.** Agents trying to act on user behalf will hit the same wall. Sites that block agents do not get agent traffic.

## Findings by vertical

**Banking (six sites, zero ActionTypes).** Not one US bank in the panel has `ApplyAction` on its loan, mortgage, or account-opening pages. The first US bank to deploy `ApplyAction` becomes the only bank an AI agent can complete a mortgage or loan application for on a user's behalf. Estimated agent-volume implication if agent-commerce reaches 5% of digital banking traffic in 2027: meaningful. Today: nothing.

**Hospitality (three sites, one ActionType).** Airbnb has SearchAction. Marriott has nothing on root. Hawaii Theatre has nine JSON-LD blocks of high-quality entity schema (PerformingArtsTheater, AggregateRating, Event, FAQPage, BreadcrumbList — the deployment from the NeverRanked case study) but no Action schemas. Adding ReserveAction to the booking page would make Hawaii Theatre the only major Honolulu venue an agent can book on a user's behalf.

**E-commerce (two sites, zero ActionTypes on root).** Amazon and Best Buy both have zero ActionTypes on root. Their action surfaces (BuyAction, OrderAction) likely live on product pages — untested in this scan. The first major e-commerce platform that ships consistent BuyAction across all product pages becomes the default agent-shopping destination for the period before the others catch up.

**SaaS (three sites, zero ActionTypes).** Shopify, Stripe, GitHub. The SaaS vertical needs SubscribeAction (trial sign-up), ChooseAction (plan picker), and ContactAction (support). All three sites have zero. This is the easiest vertical to deploy in (sign-up flows are well-understood) and the highest-value for agent-driven discovery (someone says "find me a payment processor that handles X" and the agent picks the one it can complete a signup for).

**Healthcare, education, government (three sites, zero ActionTypes).** Mayo Clinic, Harvard, IRS. Each has a clear agent use case (book an appointment, apply to a program, complete a tax form) and each is at zero. These verticals will be slower to deploy because of compliance overhead, but the strategic value of being first is higher because of the regulatory moat.

## Methodology

The scan extracts Schema.org ActionTypes from a page using two surfaces:

1. **JSON-LD blocks** (`<script type="application/ld+json">`). The scan parses each block, expands `@graph` arrays, then walks every nested object up to depth 12 looking for `@type` values matching the recognized ActionType vocabulary. This catches actions nested inside `WebSite`, `Service`, `mainEntity`, `offers`, `hasOfferCatalog`, `isPartOf`, and other Schema.org composition properties, as well as those exposed via `potentialAction`.
2. **Microdata** (`itemscope itemtype="https://schema.org/{ActionType}"`). The scan uses pattern matching on the markup to catch sites still using HTML5 Microdata. Most modern sites use JSON-LD, but a meaningful tail of older sites still ship Microdata.

**Scope:** Root URL only. A site that deploys ActionTypes on subpages (`/reserve/`, `/contact/`, `/apply/`) will read as zero in this scan. A future v3 of the methodology will follow common transactional paths and aggregate findings across them. Until then, the root-URL number is conservative — actual deployment may be higher than this report shows.

**Recognized ActionType vocabulary (27 types):**

SearchAction, ReserveAction, CheckInAction, CheckOutAction, RsvpAction, ApplyAction, AuthorizeAction, BuyAction, OrderAction, PayAction, PreOrderAction, TipAction, RentAction, QuoteAction, DonateAction, ContactAction, AskAction, CommunicateAction, WatchAction, ListenAction, ReadAction, PlayAction, SubscribeAction, RegisterAction, JoinAction, ChooseAction, ReviewAction, TrackAction, DownloadAction.

**Vertical baselines (13 verticals):**

hospitality, restaurants, financial-services, professional-services, healthcare, education, commerce, saas, media, real-estate, nonprofit, government, performing-arts. Each vertical specifies which ActionTypes a competent agent would expect to find on a site in that category.

## Reproducibility

The detection logic lives in `mcp-server/src/tools/agent-readiness-check.ts` in the public NeverRanked GitHub repo. The test harness is `scripts/agent-readiness-test-harness.mjs`. The full dataset for this report is at `data/agent-readiness-baseline-2026-05-12.json`. All three are open source.

Anyone with Node 20+ can clone the repo and reproduce these numbers:

```
git clone https://github.com/LanceRoylo/neverranked
cd neverranked/mcp-server && npm install && npm run build
cd .. && node scripts/agent-readiness-test-harness.mjs
```

If a third party gets meaningfully different numbers, file an issue. The methodology is intentionally simple so disagreement is traceable.

## What changes if you ship Action schemas today

For any site in the panel:

- **Become the only agent-completable option in your vertical.** First-mover capture window is roughly 18 months before the rest of the category catches up.
- **Convert agent traffic that would otherwise hand off to a human.** Every ActionType-marked surface is a path an agent can actually complete instead of escalating.
- **Get cited differently by AI engines.** Engines that surface "AI agents can complete X here" as a citation signal are still emerging, but several already weight agent-readiness in their answer-source selection.
- **Position for the agent-commerce shift.** When agent-driven purchasing reaches scale (likely H2 2026 to H1 2027), the deployment work is done.

## What this report is not

This is a measurement of the future, not the present. AI engines today still primarily cite based on the core schema layer (`Organization`, `Service`, `FAQPage`, `AggregateRating`) that the rest of NeverRanked's audit covers. Deploying ActionTypes does not improve your current citation share — it positions you for the agent shift.

Treat this report as a leading indicator. If your core schema layer is complete and your citation share is healthy, this is the next layer to deploy. If your core schema is incomplete, fix that first.

## Next iterations of this report

This is a seed. The panel will grow to 100 sites by next month, then 250, then 500. Subpage crawling will reveal whether sites have ActionTypes deployed off-root. Monthly cadence will track the curve as the first deployers ship.

If your site is in the panel and you want the per-site detail behind your number, reach out. The findings are private by default — we did not publish a per-site scorecard because the goal of this report is to signal the category, not to shame specific brands. If you want the data, we'll send it.

---

**Authored by:** NeverRanked
**Contact:** lance@neverranked.com
**Methodology + dataset:** https://github.com/LanceRoylo/neverranked
**Tool:** https://www.npmjs.com/package/@neverranked/mcp (run `agent_readiness_check` against any URL)

**Citation:** "State of Agent Readiness, 2026-05." NeverRanked. https://neverranked.com/reports/state-of-agent-readiness/
