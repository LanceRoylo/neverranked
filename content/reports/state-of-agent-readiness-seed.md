# State of Agent Readiness — Seed Report

**Sample date:** 2026-05-12
**Panel:** 25 production sites across 10 verticals (banking, hospitality, restaurants, e-commerce, healthcare, education, SaaS, government, performing arts, plus 5 known-positive controls)
**Detection scope:** Schema.org ActionTypes via JSON-LD (with deep-nesting traversal) and Microdata, root URL only
**Tool:** `agent_readiness_check` v2 (commit pending)

---

## Headline

**Of 19 sites we could scan, 1 has any Schema.org ActionType on its root URL.** That's 5.3%.

That one site is Airbnb, with SearchAction (sitelinks search box, the most-deployed ActionType on the web). Every other site in the panel, including six US banks, three major hospitality chains, three major e-commerce platforms, and the IRS, has zero ActionType deployments on their homepage.

This is not a detection failure. The scan caught Airbnb's SearchAction in nested `potentialAction` on a single JSON-LD block. The detection works. The web is just not ready for agents yet.

## What the panel looked like

**Successfully scanned (19):** ASB, First Hawaiian Bank, Bank of Hawaii, Central Pacific Bank, Chase, Wells Fargo, Marriott, Hawaii Theatre, Resy, Amazon, Best Buy, Shopify, Mayo Clinic, Harvard, Stripe, GitHub, IRS, Google, Airbnb.

**Blocked by bot detection (6):** Hilton (403), OpenTable (timeout), Kaiser Permanente (network failure), Yelp (403), Expedia (429), Etsy (403). This is itself a finding. **One in four major sites we tried to audit blocked an automated request from a clearly-identified bot.** Agents trying to act on user behalf will hit the same wall.

## What we did and did not find

| ActionType | Found in panel? | Notes |
|---|---|---|
| SearchAction | Yes (1 site: Airbnb) | Most common ActionType on the web, still absent from 18/19 |
| ReserveAction | No | Expected on Marriott, Hawaii Theatre, healthcare sites. Absent everywhere. |
| ApplyAction | No | Expected on all six banks + Harvard. Absent everywhere. |
| BuyAction | No | Expected on Amazon, Best Buy. Absent on root (likely on product pages, untested) |
| OrderAction | No | Expected on Resy, Amazon. Absent everywhere. |
| ContactAction | No | The most basic agent task. Zero deployments. |
| SubscribeAction | No | Expected on Stripe, GitHub, Shopify. Absent. |
| ChooseAction | No | Expected on saas pricing pages. Absent (root URLs only tested). |
| DonateAction | No (no nonprofit in panel) | Untested |
| All other ActionTypes (19) | No | Universal absence |

## What this means for the agent-commerce shift

When an OpenAI Operator, Anthropic computer-use agent, or Perplexity agent tries to complete a task on one of these sites — book a hotel, apply for a loan, place an order, contact support — it has to interpret the form from raw HTML. This works some of the time, fails the rest. The fail mode varies:

- **Correct page, wrong field:** agent fills the wrong input because field labels are ambiguous
- **Correct form, validation rejection:** agent submits and gets a server-side error it cannot interpret
- **Wrong page entirely:** agent picks the wrong route from the homepage and ends up at a marketing page instead of a transactional one
- **Hard handoff:** agent gives up and surfaces "I cannot complete this; please do it manually"

Schema.org Action types are the structured-data layer that turns these failures into reliable completions. An agent reading `ReserveAction` on a hotel booking page knows exactly which fields exist, what their valid value ranges are, what the target URL is, and what the expected result looks like. An agent reading raw HTML guesses.

## Methodology

The scan extracts Schema.org ActionTypes from a page using two surfaces:

1. **JSON-LD blocks** (`<script type="application/ld+json">`). The scan parses each block, expands `@graph` arrays, then walks every nested object up to depth 12 looking for `@type` values matching the ActionType vocabulary. This catches actions nested inside `WebSite`, `Service`, `mainEntity`, `offers`, etc., as well as those exposed via `potentialAction`.
2. **Microdata** (`itemscope itemtype="https://schema.org/{ActionType}"`). The scan uses a lookbehind regex on the markup to catch sites still using HTML5 Microdata. Most modern sites use JSON-LD, but a meaningful tail of older sites still ship Microdata.

The scan does not (yet) crawl subpages. A site that deploys `ReserveAction` only on `/reserve/` will read as zero in this scan. A future v3 will follow common transactional paths (`/contact`, `/apply`, `/reserve`, `/book`, `/order`, `/shop`, `/checkout`) and aggregate findings across them. Until then, the root-URL number is conservative.

The full ActionType vocabulary the scan recognizes (27 types):

> SearchAction, ReserveAction, CheckInAction, CheckOutAction, RsvpAction, ApplyAction, AuthorizeAction, BuyAction, OrderAction, PayAction, PreOrderAction, TipAction, RentAction, QuoteAction, DonateAction, ContactAction, AskAction, CommunicateAction, WatchAction, ListenAction, ReadAction, PlayAction, SubscribeAction, RegisterAction, JoinAction, ChooseAction, ReviewAction, TrackAction, DownloadAction

## Reproducibility

The full dataset is at `data/agent-readiness-baseline-2026-05-12.json` (panel of 25, results for 19 scanned + 6 blocked). The detection logic lives in `mcp-server/src/tools/agent-readiness-check.ts` and the harness in `scripts/agent-readiness-test-harness.mjs`. Both are open source. Anyone with Node 20+ can clone the repo and reproduce these numbers by running:

```
node scripts/agent-readiness-test-harness.mjs
```

If a third party gets meaningfully different numbers, file an issue. The methodology is intentionally simple so disagreement is traceable.

## What changes if a buyer in this panel ships Action schemas today

A bank that deploys `ApplyAction` on its mortgage page becomes the only US bank an agent can complete a mortgage application for. A hotel that deploys `ReserveAction` with proper `query-input` becomes the only major chain an agent can book without human escalation. A SaaS company that deploys `SubscribeAction` with `target` resolution becomes the only platform an agent can complete a trial signup for.

In each case, the first deployer in a category captures the agent traffic that the rest of the category cannot serve. The window for first-mover advantage is roughly 12 to 18 months, after which the laggards will have caught up and the differentiator becomes deployment quality rather than deployment existence.

## Next steps for this report

- Expand the panel to 100 sites across 20 verticals. Current 25-site panel is enough to establish the headline finding; the bigger panel is needed for vertical-level claims.
- Add subpage crawling (`/contact`, `/apply`, `/reserve`, `/book`, `/order`, `/checkout`). Current root-URL number is the floor, not the ceiling.
- Track this monthly. The State of AEO publishes weekly. State of Agent Readiness can publish monthly and watch the curve bend as the first deployers ship.
- Publish the per-site findings table publicly so any site in the panel can see exactly what they have and what they are missing.

---

**Status:** Draft / private. Not yet published. The 25-site panel is the smallest defensible sample; expanding to 100 before any public claim.

**Last updated:** 2026-05-12
