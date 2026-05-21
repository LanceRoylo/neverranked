# Meeting kit — Mark Cunningham, American Savings Bank

> Single retrieval surface. Open this in the parking lot. Everything you need is one click or one scroll from here.

---

## 60 seconds before you walk in

1. The opening is in your head, not on paper. Beat 1 is the retraction. Do not skip it.
2. Your pricing line, verbatim: **"Four thousand five hundred to kick off a category. Fifteen hundred a month after that for ongoing measurement. Per category."**
3. The demo on your laptop is `demo-medspa.html` in the outreach repo. Already open in your browser, or open it now.
4. Mark is the buyer. MVNP is not his agency. Do not reference James or MVNP unless he does.

---

## The opening, memorized arc

[meetings/openings/2026-05-20_mark-asb.md](../openings/2026-05-20_mark-asb.md)

Six beats, ~2 minutes. Five-plus-two engine split locked. Retraction first.

---

## The live demo — pick named vs anonymized in the room

**Default for Mark: named.** Mark is a direct buyer, not a competitor's agency. Showing him real hostnames demonstrates depth and proves the data is real, not a sample. He has no commercial interest in the Honolulu med spas you reveal.

Switch to anonymized only if you sense he wants methodology without the specifics.

### Named (default for Mark)
- `meetings/kits/demo-medspa.html` — open in browser, dark mode, screen-share ready
- `meetings/kits/demo-medspa.pdf` — 131KB, print-ready
- `meetings/kits/demo-medspa.txt` — plain text fallback
- `meetings/kits/demo-medspa.json` — raw structured data if he wants to verify the numbers

### Anonymized (backup)
- `meetings/kits/demo-medspa-anon.html` — same content with hostnames hashed
- `.pdf`, `.txt`, `.json` variants

Open whichever you plan to show before the meeting starts. All are local copies on your laptop — no internet needed.

To regenerate either: `cd /Users/lanceroylo/Desktop/neverranked-outreach/dryrun/forensic && node render.mjs --category med_spa --label "Honolulu Med Spa" [--anonymize] --out OUTPUT.html` then copy back to `meetings/kits/`.

This is your "shape of the deliverable" demo. You walk Mark through what a research memo looks like, using med-spa data, then explain what a banking-vertical version would show.

**Do NOT bring a finished Hawaii banking aggregate. We deliberately did not seed that vertical. Showing it would be giving away the farm.**

---

## The pitch page (if Mark asks for something to share)

[neverranked.com/pitch/asb-hawaii/](https://neverranked.com/pitch/asb-hawaii/)

Rewritten 2026-05-20. Retraction first, new positioning, $4,500 + $1,500/mo pricing, no schema-causation claims, no dead-product snippet.

You can give him the URL. He can print to PDF via the gold button.

---

## Pricing — the one line

> Four thousand five hundred to kick off a category. Fifteen hundred a month after that for ongoing measurement. Per category.

If he asks for the math: a kickoff is one category (example: "Hawaii consumer banking" or "Hawaii business banking" or "Hawaii mortgages"). Each is its own engagement scope. A bank that wants two categories is two kickoffs and two monthly retainers.

No discounting to land the logo.

No ranges. No "somewhere around." Say the number and stop talking.

---

## Expected questions, ready answers

**"What changed about your product?"**
We used to ship a JavaScript snippet that we claimed drove AI citations. We ran a pre-registered test on ourselves. Zero. The LLM crawlers do not execute JavaScript. We stopped selling it and rebuilt the company around the measurement layer that does work.

**"Is this safe for a regulated bank?"**
Yes by design. We do not touch your systems. No code on your property, no integration, no data flowing in from your side. We observe public AI engines from outside. This is a research engagement, not a software install. Your security review surface is an NDA and a vendor intake form. Not a SOC 2 audit.

**"How long until citation share moves?"**
We do not predict citation lift. That was the failure mode of the prior product. What we promise is the measurement and the prepped guidance. We tell you exactly where you stand each week. Your team or your agency executes against it. We measure the movement.

**"How does this fit with our agency?"**
Your agency owns brand, creative, content, paid media, relationships. We add the diagnostic and measurement layer on top. The punch list goes to whichever team executes. They own the client outcome. We own the diagnostic layer no platform-internal dashboard can ship.

**"How is this different from Profound or Peec?"**
They sell brand dashboards with a score. We sell a research memo with a prepped punch list. The cross-engine cross-competitor view is structural. No single-platform self-dashboard can ship it because no platform owns the data on its competitors.

**"Can we see something concrete before committing?"**
Yes. Single-day pilot scan against five sample queries, no charge. The output looks like the deliverable at one-fifteenth the depth. Enough to know if the methodology surfaces something useful.

**"What about Hawaii Theatre Center?"**
We worked with them across the company's pivot. The diagnostic surfaced gaps a standard SEO scan missed. Expired Charity Navigator profile (2023). BBB profile last touched 1999. Misconfigured authority backlinks. Missing Bing Business Profile. Meta description rewrites. Their team executed the fixes. **Do NOT say "schema injection caused their score to jump from 45 to 95." That is the retracted claim.**

**"What is your relationship to MVNP?"**
You can be honest. James from MVNP is a friend-of-friend introduction, separate from this conversation. MVNP represents First Hawaiian Bank, not ASB. There is no agency layer between us and you. This is a direct conversation.

---

## What NOT to say

1. **Do not promise citation lift.** Ever. Not in a percentage, not in a count, not in a timeline. The whole product is anchored on the boundary of "we measure, we do not predict."
2. **Do not name the 45 to 95 Hawaii Theatre score jump as evidence of anything we did.** That was the retracted causation claim.
3. **Do not say "seven engines"** without the five-plus-two split. Always: "Five citation-grade engines that search the live web, plus two model-knowledge engines for what AI says when it cannot search."
4. **Do not pitch a snippet, schema injection, or done-for-you anything.** The product is measurement and a punch list. Your team executes.
5. **Do not discount the pricing** to land the logo. Memory note `neverranked_profitable_on_first_client.md` governs.
6. **Do not show the moat aggregate output** for Hawaii tourism or Hawaii banking. We have not run those, deliberately. Showing speculative data would be the giveaway.

---

## After the meeting

1. Send a one-line follow-up within 24 hours. "Thanks. The pitch page link is [URL]. Next step is the pilot scan or a scoped kickoff, your call."
2. Log the conversation against the demand pre-registration scoring (the 5-conversation test in `dryrun/schema-causal/DEMAND-PRE-REGISTRATION.md`). Mark counts as one of five.
3. Score behaviorally, not on warmth. The primary measure is a paid commitment with the no-fix boundary stated. Politeness is not validation.

---

## Backup files referenced

- Pricing memory: `~/.claude/projects/-Users-lanceroylo-Desktop-neverranked/memory/neverranked_pricing.md`
- Engine split memory: `~/.claude/projects/-Users-lanceroylo-Desktop-neverranked/memory/engine_split_5_plus_2.md`
- Force multiplier memory: `~/.claude/projects/-Users-lanceroylo-Desktop-neverranked/memory/force_multiplier_for_agencies.md`
- Moat aggregate memory: `~/.claude/projects/-Users-lanceroylo-Desktop-neverranked/memory/moat_aggregate_lives_in_dryrun.md`
- Demand pre-registration: `/Users/lanceroylo/Desktop/neverranked-outreach/dryrun/schema-causal/DEMAND-PRE-REGISTRATION.md`
