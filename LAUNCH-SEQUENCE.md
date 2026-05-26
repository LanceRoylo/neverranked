# Launch sequence: the day LLC + insurance both land

**Audience:** Lance. Possibly future Lance hires.
**Trigger:** both the LLC approval letter from Hawaii BREG AND the insurance binder from Hiscox (or Vouch/Coalition fallback) are received. Either alone is not enough.
**Goal:** convert the prepared work from "queued and waiting" to "actively generating pipeline" within 24-48 hours of the trigger.
**Status:** waiting on LLC approval (filed). Insurance status: confirm before this fires.

---

## Why this exists

Today we built a lot of prepared infrastructure: 5 published teardowns, 4 vertical landing pages, the dashboard, the cold outreach sequences, the SOPs, the brand-brain template. All of it is gated behind LLC + insurance because cold outreach naming competitors without entity protection + Media Liability coverage is real personal exposure.

When the gate lifts, the worst move is to improvise the unblock. This document is the script so the moment LLC + insurance both land, the next 48 hours are mechanical, not discretionary.

---

## Hour 0: Confirm both gates are actually cleared

Do NOT begin the sequence until BOTH are true:

- [ ] LLC approval letter received from Hawaii BREG (Articles of Organization stamped + returned, or DCCA filing confirmation visible in your account)
- [ ] Insurance binder received from Hiscox (or fallback carrier) confirming Tech E&O + Cyber + **Media Liability** coverage is active. The Media Liability line is the one that matters for cold outreach naming competitors; do not proceed without explicit confirmation it is on the policy.
- [ ] Effective date on the insurance binder is today or earlier (no future-dated coverage)
- [ ] Personal copies of both documents are stored in the LLC folder (cloud + local backup)

If either is missing or unclear, stop. Email the carrier or BREG to confirm. Do not begin the sequence on assumption.

---

## Hour 1: EIN + bank account

The LLC needs an EIN before opening a business bank account. The bank account needs to exist before any business transactions flow.

- [ ] Apply for EIN at irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online (10 min, free, granted instantly during business hours)
- [ ] Store EIN in 1Password + the LLC folder
- [ ] Open business checking at your existing bank (Bank of Hawaii or First Hawaiian) or a fintech (Mercury, Relay). Mercury is fastest if same-day matters. Bring: LLC Articles, EIN confirmation letter, personal ID
- [ ] Move starter capital to the new business account (covers next ~3 months of operating expenses; you have ~$220/mo fixed costs per memory)

---

## Hour 2: Corporate identity updates across the site

The site currently reads as sole-prop in some places. Update before any outreach goes out so prospects see consistent entity.

- [ ] Update `/terms/` page: business entity is now "NeverRanked LLC" (or whatever exact name the state approved)
- [ ] Update `/privacy/` page: same
- [ ] Update `/security/` page: noting the LLC entity + insurance coverage now in force (Tech E&O + Cyber + Media Liability with [carrier])
- [ ] Update `/retraction/` page footer: sole-prop framing → LLC framing
- [ ] Update homepage footer if it references "sole proprietor" or "founder-led" in a way that needs adjustment (currently says "founder-led, bootstrapped" which stays correct)
- [ ] Update the dashboard footer (dashboard/src/routes/customer-view.ts) to reference the LLC entity if any line currently doesn't
- [ ] Update any outreach generator templates that include sole-prop disclosure (replace with LLC + insurance line)
- [ ] Commit + push all changes in one commit titled "Switch from sole-prop framing to LLC across user-facing surfaces"

---

## Hour 3: Stripe + payment surface

Customers need a way to pay you that flows to the LLC bank account.

- [ ] Update Stripe account: company name → LLC, bank account → new business checking, EIN → LLC EIN, business address → registered LLC address
- [ ] Test a $1 charge to verify the flow (refund immediately)
- [ ] Update the dashboard's checkout routes (`dashboard/src/routes/checkout.ts`) if anything references sole-prop or the old bank account
- [ ] Confirm Stripe webhooks still fire correctly post-update

---

## Hour 4: Communicate the entity transition to the world

This is the moment of public LLC announcement. Keep it observational and brief.

- [ ] **LinkedIn personal post** (1-2 paragraphs): announce NeverRanked LLC is formally in business. Link to the cross-category teardown as the headline asset. Mention 4 Hawaii business categories measured, 5 teardowns published, 142 firms tracked. No "we're the best" framing; observational, the discipline speaks for itself.
- [ ] **Update LinkedIn company page** (if one exists) to NeverRanked LLC
- [ ] **Update X/Twitter bio** if Lance maintains one
- [ ] **Update email signature** to include LLC + Honolulu address
- [ ] **One internal-network email** to friends/family/professional contacts: "NeverRanked LLC is now formally trading. Here's what I'm doing. If anyone you know runs a Hawaii business that buys from Google/AI now, send them my way." Personal asks beat cold outreach 10:1.

Do not do these until the corporate identity updates from Hour 2 are live, so anyone clicking through sees consistent branding.

---

## Day 1 evening: Fire the warm-list outreach

The 4 outreach sequences locked at `neverranked-outreach/drafts/teardown-02-sequences.md` are ready to send. Start with the warm list (lowest risk, highest intent), not the cold cuts.

- [ ] **Email 1: warm follow-up to bank-teardown recipients.** They already received teardown 01 last week. This is a follow-up. Subject: "4 categories now measured. Banking is the outlier." Plain reply expected, low risk.
- [ ] Send via the outreach generator with compliance footers wired (takedown link, physical address, unsubscribe, LLC + Media Liability mention)
- [ ] Monitor inbox over 48 hours; reply same-day to anyone who responds
- [ ] Log opens via tracking pixel (already wired)
- [ ] Do NOT fire the cold sequences yet. One day's worth of warm-list reply behavior tells you whether the positioning is landing before you commit to colder volume.

---

## Day 2: Fire the cold sequences in measured bursts

Per the receipts-pilot containment work: weekly cap of 25 cold sends per category. Don't blow it.

- [ ] **Cold to Hawaii wealth management** (Apollo cut prepared in `neverranked-outreach/drafts/teardown-02-sequences.md`). Send 25/week max, monitor open + reply rates
- [ ] **Cold to Honolulu dental**. Same volume cap
- [ ] **Cold to Hawaii law firms**. Same volume cap
- [ ] If any cold recipient replies with concern about being measured, route through `/takedowns/` immediately, no debate, 24-hour SLA
- [ ] If any cold recipient replies with interest, route to free 1-page diagnostic OR scoping call, depending on signal strength

---

## Week 1: Distribution of the public work

Beyond outreach, push the already-published teardowns through distribution channels. All low-risk because the teardowns are already public, observational, and graded.

- [ ] **Hacker News submission** of the cross-category teardown (`/teardowns/cross-category/`). Title suggestion: "What 7 AI tools cite for 4 Hawaii business categories (5,000+ citation events)". Submit Tuesday or Wednesday morning HST for best US morning timing.
- [ ] **Reddit posts** to relevant subreddits: r/marketing (cross-category), r/SEO (the GSC impressions hook), r/Hawaii (Hawaii business angle for the bank teardown). One post per subreddit per week max.
- [ ] **LinkedIn carousel** breaking down the cross-category gradient. Visual + observational, no competitor names beyond what's already public in the banking teardown.
- [ ] **Twitter/X thread** if Lance maintains presence: 7-tweet thread walking through the four-category finding.
- [ ] Monitor inbound from any of these channels; reply within 4 business hours.

---

## Week 2-4: Compound on what's working

By end of week 1 you'll have signal on which channel produces inbound. Double down on what works, deprioritize what doesn't. Don't keep all channels going at equal investment regardless of signal.

- [ ] Compile week-1 channel performance (inbound replies per channel, free-check sign-ups per channel) into a simple internal note
- [ ] Allocate next 2 weeks of activity toward the top-2 channels
- [ ] First paying customer signal: someone replies to outreach asking to scope an engagement. When that happens, fire SOP-customer-onboarding.md from Day 0

---

## Quarterly: LLC compliance + insurance renewal

The thing easiest to forget post-launch.

- [ ] Q1 (3 months in): file Hawaii LLC annual report (~$15) if due
- [ ] Q2: insurance check-in with carrier; confirm Media Liability still in force
- [ ] Q3: Q3 estimated taxes
- [ ] Q4: full year-end close, K-1 prep, annual insurance renewal

Calendar these now so the year-1 LLC compliance doesn't surprise you.

---

## What this checklist is NOT

- Not a hiring trigger. Solo operator stays solo until ~$30k MRR.
- Not a fundraising trigger. NeverRanked stays bootstrapped per memory.
- Not permission to drop the observational discipline. Insurance is the financial backstop; the discipline (fail-closed grader, hash-locked questions, named cohorts only with consent) is what keeps us out of insurance claims in the first place.
- Not a green light to send unlimited outreach. Receipts-pilot containment 25/week cap stays in effect indefinitely.

---

## How to update this checklist

Update when:
- A step turns out to be wrong (the EIN flow changed, Stripe added a new requirement, etc.)
- A new category of work becomes part of launch (e.g. accountant/bookkeeper onboarding)
- The first paying customer surfaces a workflow gap

---

*Status: drafted 2026-05-25. Waiting on LLC approval (filed) + insurance binder (confirm). Fires automatically when both land.*
