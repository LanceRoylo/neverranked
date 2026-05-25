# Customer Dashboard Spec (post-pivot)

**Status:** scope spec, not implementation. Draft 2026-05-24.
**Author:** Lance + Claude (this conversation).
**Decision needed:** approve scope, then build in a focused 3-5 day session.

---

## The frame

Two layers, one product:

| Layer | Job | Cadence | Who produces |
|---|---|---|---|
| **Dashboard** | Where you are right now. What changed since yesterday. What's observable as a current gap. | Daily, auto-generated | Production measurement worker |
| **Memo** | What to do about it first. Why. Sequenced. Cross-category context. | Monthly, hand-written | Lance |

Dashboard surfaces signals. Memo turns signals into prioritized action. The dashboard does NOT replace the memo, it makes the memo land harder by giving the customer continuous context before the memo arrives.

Customer-facing line: *"Between monthly memos, the dashboard shows where you are right now and what changed. The monthly memo tells you what to do about it first."*

---

## URL structure

```
app.neverranked.com/c/<slug>          → the customer's single dashboard screen
app.neverranked.com/c/<slug>/memos    → archive of past monthly memos (PDF download)
app.neverranked.com/c/<slug>/login    → magic-link login (SSO/OAuth out of scope)
```

`<slug>` is the existing client_slug from D1. One slug per category per paying customer.

If a customer has multiple categories (rare but possible), they get multiple slugs and a tiny top-bar switcher between them. No global "all categories" view.

---

## The one-screen layout

Top to bottom on `app.neverranked.com/c/<slug>`:

### 1. Header strip
- Customer name and category (e.g., "Hamada Financial Group · Hawaii wealth management")
- Last measurement timestamp
- Next monthly memo scheduled date
- Tiny "Message Lance" CTA (mailto:Lance@hi.neverranked.com with subject prefilled)

### 2. Current position card
- This week's citation share, headline number ("Mentioned on 4 of 18 questions")
- vs cohort: "Cohort average is 6 of 18"
- vs last week: "+1 question vs 7 days ago"
- Per AI tool breakdown: 7 small bars showing this week's mention count per tool

### 3. What changed (last 7 days)
Observational only. Bullet list, auto-generated daily from the measurement worker output. Examples:

- *"This question started mentioning competitor masudalehrman.com on Tuesday. Previously empty for all firms in cohort."*
- *"Your firm dropped from position 2 to position 4 on the question 'fee-only financial advisor Honolulu' over the last 3 days."*
- *"A new third-party publication (Pacific Business News) was cited by Perplexity for the first time on this question."*
- *"Cohort competitor fphawaii.com gained 3 mentions on Microsoft Copilot since last week. Previously cited zero times by Copilot."*

Empty state: *"No significant changes in the last 7 days. The data has been stable."*

### 4. Currently observable gaps
Auto-generated from the same data the memo uses, but observational only. NOT prescriptive. Examples:

- *"This question is currently empty for your firm: 4 cohort competitors appear. Was previously empty for everyone in the cohort."*
- *"Your firm has zero mentions on Microsoft Copilot for any question in the set. Same is true for 13 of 14 cohort competitors."*
- *"Your firm has zero mentions in Claude or Gemma. 5 cohort competitors have non-zero presence in at least one."*

The list updates daily. Items disappear from the list when the observable condition stops being true. The customer can see what closed without waiting for a memo to claim credit.

### 5. The cohort table
Same shape as the one in the Hamada brief. Top 10 hosts in the customer's cohort, mention count, position bias, AI tool coverage. Customer's own row highlighted.

### 6. Trend line
Last 8 weeks of citation share, one line per week. Y-axis: % of questions mentioning the customer. Hover shows the date and the raw count.

### 7. Footer
- Link to past monthly memos (PDF archive)
- Link to methodology page
- "Last data update: <timestamp>"
- Lance's contact, observational-discipline note, takedown link

That's the whole screen. One scroll, no tabs, no navigation.

---

## Data sources (what calls what)

```
[D1: production measurement worker writes daily]
   ↓
[Cloudflare Worker: app.neverranked.com/c/<slug>]
   ↓
   Reads:
     - latest 8 weeks of citation_snapshot rows for this client_slug
     - latest cohort_membership rows for the client's category
     - latest within_citation rows (for position bias)
     - cohorts.mjs registered cohort (already there)
   Computes:
     - 7-day deltas (this week vs last week)
     - observable changes (new mentions, dropped mentions, position shifts)
     - currently observable gaps (questions where cohort > 0 and customer = 0)
   Renders:
     - the one-screen HTML, server-side
```

All compute happens at request time. No background job. No new tables. No new infrastructure beyond the route handler and the templating.

---

## Explicit non-goals (the brutal constraints)

This dashboard does NOT have:

- No customer-editable controls. Customer cannot add or remove queries, cohort members, or competitors.
- No notifications, alerts, or email digests beyond the existing monthly memo.
- No exports, no CSV download, no API access.
- No user management. One magic-link login per slug. No team accounts, no permissions.
- No settings page.
- No billing or subscription management in-dashboard. Stripe portal lives elsewhere.
- No multi-category aggregate view.
- No comparison-mode against other customers.
- No tabs, no second screen, no second view of the same data.
- No public registration. Customers are added by Lance.
- No free tier on this surface. The grader at check.neverranked.com is the free surface; this is for paying customers only.

If a customer asks for any of the above, the answer is "talk to Lance, that's what the memo cadence is for." The dashboard's distinctiveness is what it deliberately does not do.

---

## Existing infrastructure inventory

What's already in `/dashboard/src/`:

- ✅ Auth layer (magic link via Resend, sessions in KV)
- ✅ D1 schema for client_slugs, citation_snapshots, cohort_membership
- ✅ Production measurement worker (writes daily)
- ✅ Tracking pixel infrastructure (used by Hamada pitch)
- ✅ Render helpers (`html`, `layout`, `esc`)
- ⚠️ `/citations/:slug` route exists but reflects old SaaS framing (keyword management, manual scan trigger, etc.). Either gut it and replace, or build the new view at `/c/:slug` and hide the old one behind admin.
- ⚠️ `/cockpit.ts` route exists with old positioning. Hide behind admin.
- ⚠️ `/competitors.ts` route exists. Same.
- ⚠️ Old pricing-tier surface (Pulse/Signal/Amplify) lives in dashboard frontend. Removed from new positioning. Hide.

Strong recommendation: build the new view at `/c/<slug>` cleanly. Do not edit the old `/citations/:slug` in place. Migrate paying customers to the new URL when ready, then deprecate the old route behind admin-only access.

---

## Open questions for Lance to answer before build

1. **First customer.** Hamada is the closest. If they sign on, do they get the dashboard at launch, or after the first monthly memo lands? My pick: at launch, with the first 14 days flagged as "establishing baseline" so the changed-since-yesterday section makes sense.
2. **Magic link or password?** Magic link is simpler, lower attack surface, no recovery flow needed, no password reset. My pick: magic link only.
3. **Mobile shape.** Should the dashboard be mobile-first or desktop-first? Customer behavior likely splits: morning check on phone, deeper review on desktop. My pick: build mobile-first (single column, large numbers, swipe nothing), let desktop just be a wider single column.
4. **Auto-generated changed-since copy.** I described it as auto-generated bullets. Should it be templated phrases (deterministic, boring, never wrong) or LLM-generated narrative (variable, sometimes wrong)? My strong pick: templated. The grader catches LLM fabrications on outbound artifacts but customer-facing narrative is the wrong place to introduce that risk.
5. **Memo PDF storage.** Past memos: stored in R2 with signed URLs that expire? Stored in D1 as base64? Stored as plain files in the dashboard repo? My pick: R2 with 24-hour signed URLs (industry standard, scales).

---

## Suggested build sequence

A focused 3-5 day session, sequenced for fastest visible value:

| Day | Work | Visible at end of day |
|---|---|---|
| 1 | Route handler skeleton at `/c/<slug>`, auth wiring, header strip, current position card | Header + current week number visible on one slug |
| 2 | Cohort table component (reuse Hamada brief styling), trend line component | Customer can see their cohort and 8-week trend |
| 3 | Auto-generated "what changed" + "currently observable gaps" sections | Customer sees the daily signal layer |
| 4 | Magic-link login flow, memo PDF archive route, mobile responsiveness pass | Customer can actually log in and use it |
| 5 | Internal QA on Hamada-shaped data, brand polish, deploy to app.neverranked.com | Live for the first paying customer |

3-5 days of focused work. Not 3-5 days of distracted work. If outreach, measurement runs, and other shipping happen in parallel, multiply by 2.

---

## Why this fits the pivot (not a return to SaaS)

| The thing | Pulse/Signal/Amplify (old) | This dashboard (new) |
|---|---|---|
| What's sold | The tool | The research practice |
| Customer agency | Manages workflow inside it | Reads what Lance produces |
| Editable | Customer adds queries, cohorts | Lance adds, customer reads |
| Account model | Self-serve signup, pricing tiers | Lance adds paying customers manually |
| Pricing surface | In-product upsell | Not present |
| Cadence | Continuous self-serve | Continuous read, monthly memo, occasional re-scope conversation |
| Distinctiveness | "Best AEO tool" | "You work with the principal, and you can see what he sees" |

The dashboard supports the research practice. It doesn't replace it.

---

## What this spec is not

This is a scope spec, not an implementation. Lance reviews it, asks questions, redirects what's wrong, and either greenlights a focused build session or shelves it for after more customers.

Open questions, brutal constraints, and the sequencing are the actionable parts. The screen layout is intentionally lo-fi prose because the visual design will route through Hello Momentum principles when build actually happens, not now.
