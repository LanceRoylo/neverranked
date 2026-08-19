# Homepage Redesign Spec — the ladder becomes the site

Written 2026-08-18 (research: Fable 5; build: Opus 5). Approved by Lance.
Self-contained: build from this file without the planning conversation.

## Why this exists

Until 2026-08-03 the site sold one thing: a $4,500 consultative engagement.
The homepage is built like that sale: a 31-section argument whose job is a
scoping call, price at 79% page depth, no Pricing nav item, and every CTA
pointing at the free check. The two-tier ladder inverted the motion:
Monitor $199/mo is BOUGHT, not sold. The end game of this redesign is
sales: a visitor can self-qualify, see the price, and start, without a call.

Funnel today (four stages, three different stories):
- Homepage: argument for a call, no buy path
- check.neverranked.com: works, captures email
- Its drip email: PITCHES THE RETIRED $4,500/$1,500 CARD (canon violation)
- Checkout: does not exist

After: every surface exits toward Monitor at $199, with Audit as the
"must prove it to someone" upgrade and the free check as the top of funnel.

## Non-negotiables (checked before every commit)

- Palette and type UNCHANGED: tokens in index.html :root (gold family
  #cdb87f / #edd58a / #8f7c46, warm dark oklch grounds, Fraunces + Inter +
  JetBrains Mono, fonts self-hosted in /fonts). Lance approved the palette
  explicitly; the redesign is structure and copy, not identity.
- Marketing copy: NO em dashes, NO semicolons, NO emojis, no AI filler
  ("hidden gem", "seamless", "Welcome to", "Nestled").
- NEVER: the retracted figures (45-to-95, 14-of-19 Perplexity) in any form.
- NEVER: a claim that schema/on-page changes CAUSE citation lift.
- NEVER: a named competitor anywhere on the site (Lanham false-advertising
  is excluded under BOTH policies: Corgi, and CFC Exclusions 14/37).
  Category contrast only: "an optimization tool" vs "the scorekeeper".
- Retired prices never re-appear: $4,500, $1,500/mo, $950-pilot-credited,
  Pulse $497, Amplify, Signal. `scripts/check-figures.mjs` guards figures;
  Phase 0 extends it to the check tool.
- Prices that exist: Monitor $199/mo per category, month to month.
  Audit $750/mo per category after a $950 one-time baseline month.
  Monitor payments in the first 90 days credit in full toward the baseline.
  Baseline waived on a defined-term commitment. NO annual pricing exists;
  do not invent a toggle.
- Monitor ships BINARY presence, never single-run percentages. "Honest at
  every price point" is positioning, not a limitation. Never promise
  percentages, lift, or outcomes at any tier.

## Strategy locked by planning (do not re-derive)

- Positioning: the independent scorekeeper. Everyone else optimizes and
  grades their own work.
- Levers: REFRAME (scorekeeper vs player, the spine of the page), carried
  by CONFESSION (the retraction as trust: "We retracted our own headline
  result rather than let a weak claim stand", links /retraction/) and
  SPECIFICITY (real prices, real cohort record).
- JTBD of the $199 buyer: know whether AI names me and who it names
  instead (functional), stop being blind to an invisible judgment
  (emotional), be the operator who checks the meter (social).
- Two audiences, one page: owners in high-consideration categories, and
  agencies/consultants monitoring client categories (resell math lives at
  /for-agencies/, homepage links it).
- Research anchors: 3-column pricing converts best; transparent pricing at
  this ACV; free-tool opt-ins convert ~32% vs ~14% for content downloads;
  pricing-page visitor-to-lead benchmark 4-8%; mobile-first.

## Phase 0 — stop the canon leak (independent of design, do first)

File: tools/schema-check/src/index.ts (the check.neverranked.com worker)
1. Line ~163: FAQ JSON-LD quotes "$4,500 to set up, $1,500/month". Rewrite
   answer to the ladder (Monitor $199 monitoring; Audit $750 after $950
   baseline for teams who must prove it).
2. Line ~1381: hero pricing link points to /#pricing. Point to /pricing.
3. Lines ~1469-1490: post-scan block. "Scope a kickoff" mailto and the
   "$950 pilot credited toward the $4,500 kickoff" agency line. Replace:
   primary CTA "Monitor this monthly, $199" -> https://neverranked.com/pricing
   secondary "Scope an audit" mailto (subject carries scan domain).
4. Drip email block (~2947-2985): button says "Email Lance. $4,500 kickoff
   + $1,500/mo". Rewrite the monitoring pitch to Monitor $199, button
   "Start monitoring, $199 a month" -> /pricing, secondary line for Audit.
   Keep the re-scan CTA and the "last email in this series" footer.
5. Sweep: grep the whole file for 4,500|1,500|950|497|Pulse|kickoff and
   fix every hit that is a price (ignore CSS numbers).
6. Guard: extend scripts/check-figures.mjs to also scan
   tools/schema-check/src/index.ts so retired figures cannot return.
Commit: "Check tool sells the ladder, not the retired card".
Deploy of the check worker is LANCE (wrangler deploy in tools/schema-check).

## Phase 1 — /pricing becomes a real page

- Remove `/pricing /#pricing 301` from _redirects. Create /pricing/index.html
  (match existing page shell: nav, footer, fonts, tokens; see /methodology/
  for the subpage pattern).
- Hero line, one sentence, So What-tested: what it costs to know where you
  stand. Subline: month to month, cancel anytime, per category.
- Three columns (shared markup with homepage pricing section):
  1. FREE CHECK. What AI tools can read from your site, scored 0-100,
     roughly a minute. CTA -> check.neverranked.com. No email required to run.
  2. MONITOR, $199/mo per category, badge "Start here". Named or not named
     across 7 AI surfaces, who is named instead, cited-without-credit
     flags, readiness score, plain-English monthly report. Binary presence
     by design: a thin sample cannot defend percentages, so we do not sell
     them. First-90-days payments credit in full toward the Audit baseline.
     CTA states (single source of truth, one const in the page):
       PRE-BIND (ship state): "Email to start, same-day setup" mailto with
       subject "Start Monitor - <no domain known, leave blank>".
       POST-BIND: Stripe Payment Link (Lance creates in Stripe dashboard,
       product `NeverRanked Monitor` $199/mo; flip = edit one const + deploy).
  3. AUDIT, $750/mo per category after a $950 one-time baseline month.
     "For teams who must prove it to someone." Locked competitor set,
     3 full runs/mo, pre-registered thresholds, written readout, off-site
     punch list, factual errors corrected in 10 business days. Baseline
     waived on a defined-term commitment. CTA: "Scope it by email" mailto.
     NO standing monthly call is promised anywhere.
- FAQ under the columns: what counts as a category; why binary, not
  percentages; how cancellation works (mirror /terms language); what the
  90-day credit means; who executes (your team or your agency; we measure).
- JSON-LD: Product + Offer for both paid tiers with real prices (an AEO
  company's pricing page should be machine-readable; this is also the
  dogfood proof).
- Add /pricing to the sitemap generator and llms.txt.
Commit: "A real pricing page: three columns, machine-readable".

## Phase 2 — homepage restructure (index.html)

Nav: add "Pricing" -> /pricing (desktop + mobile). Keep existing items.

Current 31 sections -> 11. Disposition of every existing h2:

KEEP (tightened):
- h1 hero "When buyers ask AI to name the best in your category, someone
  gets named." + reframe cards ("Every tool that optimizes your site
  grades its own homework", An optimization tool / The scorekeeper) and
  fold in "Hire whoever you like... who is going to tell you it worked."
- "Seven AI surfaces, measured in repeated runs" -> one row inside How
  it works, not its own section.
- "A high-ticket engagement has to be checkable" -> trust row, retitled
  (it is no longer only high-ticket): Pre-registered / Documented method /
  Repeated runs, not one snapshot / Nothing on your property.
- "Ten cohorts measured, on the public record" + "Per query, per engine,
  per competitor, per source type" -> one proof section: cohort record
  strip + sample readout visual.
- "You work with the principal" -> short block, one paragraph.
- "The seven hard ones" -> keep the best 4 inline, link /faq/ for all.
- "We will not sell you a number. We will show you the one that is real."
  -> closing section above footer, dual CTA.

MOVE:
- Atlas sections ("Ask the data...", answers/refuses) -> /methodology/.
- "The engagement, end to end" (scoping call -> baseline -> memo -> team
  executes -> delta memo) -> /pricing Audit column links a condensed
  version; full narrative to /methodology/ or /audits/.
- ROI calculator ("What is one new customer worth to you?", $15k case
  math, contingency fees) -> the law vertical page (hawaii-law-aeo or
  /for-* equivalent). Homepage gets NO calculator. Update e2e
  (e2e/site.spec.js exercises the calculator): point that test at the
  calculator's new page.
- Hawaii Theatre 1999-profile story -> two sentences inside proof section
  max, full story stays wherever it already lives. (HTC is a capability
  example; the retracted numbers never appear.)

CUT (homepage): "High-consideration categories, anywhere buyers ask AI
first" (folded into audience split), "AI doesn't decide once" (one line
inside How it works), "Start with the question that started this" (one
line in the close if it earns it), "Per category, not per client" (folded
into pricing section footnote).

NEW:
- Hero gains: secondary CTA "See pricing" -> /pricing next to the primary
  "Run the free check" -> check.neverranked.com, plus one transparency
  line under the buttons: "From $199 a month, per category, month to
  month." (mono, small, quiet).
- HOW IT WORKS AS THE LADDER (the conversion spine, section 3):
  1. Check, free: what AI tools can read from your site, in a minute.
  2. Monitor, $199/mo: named or not named across 7 surfaces, monthly,
     with who is named instead.
  3. Audit, $750/mo after $950 baseline: pre-registered, locked
     competitor set, written readout. For decisions that need evidence.
  Each step links its door. This replaces the engagement narrative.
- CONFESSION BLOCK (small, inside proof section): "We retracted our own
  headline result rather than let a weak claim stand." Link /retraction/.
  One paragraph, no drama.
- AUDIENCE SPLIT: "For operators" / "For agencies" two cards; agencies
  card carries one line of resell math and links /for-agencies/.
- PRICING SECTION: same three-column component as /pricing (id="pricing"
  so existing anchors keep working).
Commit: "Homepage sells the ladder: 31 sections to 11".

## Phase 3 — funnel alignment (beyond Phase 0's price fixes)

- Post-scan RESULTS PAGE (not just email): the score is a snapshot; the
  bridge line is "your score today is one reading. Monitor watches your
  category monthly and names who AI recommends instead." CTA order:
  Monitor -> /pricing, then Audit mailto, then teardown proof link.
- Drip emails: same story, Monitor first. Keep unsubscribe + "last email"
  promise exactly as is.
Commit: "Every funnel exit lands on the ladder".

## Phase 4 — QA, analytics, ship

- Cloudflare Web Analytics beacon on all site pages (cookieless). LANCE:
  enable in CF dashboard for neverranked.com to get the token (2 min).
  Build proceeds with a TODO-token placeholder if not ready; do not block.
- Success metrics (defined before ship, HM principle 13): hero check CTR,
  /pricing reach rate, pricing CTA clicks (Monitor vs Audit), post-scan
  Monitor CTR. Judge the redesign on these in 30 days.
- Gates before deploy: `node scripts/check-figures.mjs` clean; playwright
  e2e green (BASE_URL against local preview; calculator test repointed);
  Lighthouse mobile 90+; WCAG AA contrast on gold-on-dark pairs (soft
  #b9b2a0 on panel #17140c passes; verify any NEW pairs); no horizontal
  scroll at 375px; llms.txt + sitemap updated.
- Deploys are LANCE: site worker + check worker.

## Decisions already made (do not reopen)

1. Stripe Payment Link: Lance creates it in the Stripe dashboard; site
   ships pre-bind with mailto CTA; flip to the link the day CFC binds and
   the Mercury payout switch is confirmed (NEVER before: revenue must not
   land in the personal Ally account).
2. Analytics: yes, Cloudflare Web Analytics.
3. Annual billing: does not exist, not invented.
4. Palette/type: unchanged.

## Rollback

Tree was clean at b9361e6. One commit per phase, revertable independently.
