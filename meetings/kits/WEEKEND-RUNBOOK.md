# Weekend runbook — the manual work, sequenced

Everything that needs Lance's hands, in dependency order. Each
item names what it needs, what it unblocks, rough time, and the
detail doc. Built 2026-05-21 at the end of a long autonomous
build session so you don't have to reconstruct state.

## State in one paragraph

The public site is done and live: 8 substantive surfaces, all
aligned to the research-engagement positioning, no dead-thesis
residue, no non-customer named anywhere public. The code is
Stripe-ready (awaiting Price IDs), the dashboard generator and
grader are rewritten and unlocked in source (awaiting deploy),
the cold outreach generator is rewritten in source (pipeline
still paused). The measurement layer has forensic-depth tools
shipped (within-citation, drift, build-memo). The teardown and
second-category seed are scaffolded and await measurement runs.
The explainer video composition is wired and awaits a render.
Nothing below is urgent-tonight. It is the weekend list.

---

## Do these FIRST (they can change what comes after)

### 1. Verify the 7-engine production claim
- **Needs:** wrangler authenticated against neverranked-app D1.
- **Why first:** if fewer than 7 engines actually produced data
  in the last 7 days, the public "7 engines" claim needs
  softening, and you want to know that before any meeting.
- **How:** `cd dashboard && bash scripts/verify-engine-coverage.sh`
- **Time:** 5 minutes.
- **If it comes back clean (all 7):** nothing to do, claim holds.
- **If fewer:** the script tells you which API key is likely
  missing from the Worker secrets. Fix the secret, or soften the
  public copy to the real number until fixed.

### 2. Delete the smoke-test API keys
- **Needs:** access to your Perplexity and OpenAI consoles.
- **Why:** keys minted during the engine smoke test earlier in
  the rebuild are still live. Security hygiene.
- **Time:** 2 minutes.
- **How:** revoke the keys labeled smoke-test in each console.

---

## The teardown chain (start the measurement early — it has calendar latency)

### 3. Pick the teardown subject brand
- **Decision only.** The plan recommends Bank of Hawaii (not an
  active prospect, not an MVNP client, recognizable). Alternatives:
  Central Pacific Bank, Hawaii State FCU.
- **Detail:** `dryrun/teardowns/bank-honolulu/PLAN.md`.

### 4. Run the bank-honolulu measurement
- **Needs:** PERPLEXITY_API_KEY + OPENAI_API_KEY in env. Item 3
  decided (only matters for the anonymization at fill-time).
- **How:** `export` the two keys, then
  `node dryrun/run-bank-honolulu.mjs`. Run it three times across
  three different days for pattern-readiness.
- **Time:** 5 min setup + ~30 min API wall-time per run. ~$15
  total across 3 runs.
- **Calendar latency:** 3 runs across 3 days. Start now if you
  want the teardown ready for either meeting.

### 5. Request Profound's free AEO Report
- **Needs:** item 3 decided (the subject domain).
- **How:** tryprofound.com, find the free AEO Report signup,
  submit the subject domain.
- **Time:** 5 min + 24-48hr wait for their report.
- Save the result in `dryrun/teardowns/bank-honolulu/`.

### 6. Fill and publish the teardown
- **Needs:** items 4 and 5 complete.
- **How:** `node dryrun/forensic/aggregate.mjs --category
  bank_honolulu --json` and `within-citation.mjs` for the data;
  fill the `{{PLACEHOLDER}}` and `[FILL: ...]` markers in
  `neverranked/teardowns/bank-honolulu/index.html`; uncomment
  `teardowns` in `scripts/build.sh` DIRS; build and deploy; add
  to sitemap.xml; link from /vs/.
- **Time:** 2-4 hours of writing.

---

## The second-category seed (optional, parallel to the teardown)

### 7. Run dental-honolulu
- **Needs:** the same two API keys.
- **Why:** a second pattern-ready category makes the
  cross-category claim real (currently single-data-point).
- **How:** `node dryrun/run-dental-honolulu.mjs` ×3. ~$15.
- **Detail:** `dryrun/SECOND-CATEGORY-SEED.md`.
- **Not urgent.** Do it when you want the moat to have two
  legs instead of one.

---

## The Stripe + dashboard chain (independent of the teardown)

### 8. Decide the audit-delivery interim path
- **Decision only.** When a kickoff payment lands, the webhook
  currently drops an admin_inbox alert and you drive the
  engagement manually. The audit-delivery auto-functions are
  still locked. The runbook recommends keeping it manual for
  the first 5-10 customers. Confirm you're fine with that.
- **Detail:** `meetings/kits/STRIPE-SKU-MINT-RUNBOOK.md`, the
  "what happens to audit-delivery" section.

### 9. Mint the Stripe Price IDs
- **Needs:** Stripe dashboard access. Item 8 decided.
- **How:** create two Prices ($4,500 one-time kickoff,
  $1,500/mo retainer), paste the IDs into the PLANS table in
  `dashboard/src/routes/checkout.ts`, flip `comingSoon` to
  false on both.
- **Time:** 10 min in Stripe + 2 min code edit.
- **Detail:** `meetings/kits/STRIPE-SKU-MINT-RUNBOOK.md`.

### 10. Deploy the dashboard worker
- **Needs:** item 9 done (or accept checkout stays in
  scoping-page mode). Customer-impact check.
- **Why the check:** the deploy activates the rewritten
  generator + grader AND keeps the killed-flow routes (demo,
  audit-delivery, Reddit-FAQ) returning 410. If you have active
  paying customers on an audit cadence, email them first.
- **How:** `cd dashboard && npm run deploy`, then run the
  verify-curls.
- **Detail:** `meetings/kits/DASHBOARD-DEPLOY-RUNBOOK.md`.

---

## The meetings (kits are ready, no prep work needed)

### 11. Mark / ASB
- **Kit:** `meetings/kits/MARK-ASB.md` — open it in the parking
  lot. Opening, demo walkthrough, pricing line, Q&A, what-not-
  to-say all inside.
- **Demo:** default to the named demo bundle for Mark (direct
  buyer, not a competitor's agency).

### 12. James / MVNP
- **Kit:** `meetings/kits/JAMES-MVNP.md`.
- **Demo:** default to the anonymized demo bundle for James
  (agency, could contact the named businesses).
- **Frame:** coffee, not a pitch. Friend-of-friend intro.

---

## The video (any time, independent)

### 13. Render the explainer
- **Needs:** ELEVENLABS_API_KEY.
- **How:** `cd neverranked-video && export ELEVENLABS_API_KEY=...
  && npm run vo:current && npm run render:current`.
- **Detail:** `neverranked-video/README-CURRENT.md`.
- Then embed at the top of /retraction/ and attach to
  post-meeting follow-ups.

---

## Cold outreach relaunch (last, gated)

### 14. Relaunch the pipeline
- **Gated on:** dashboard deployed (item 10), and a decision
  that you actually want to be sending cold email again.
- MailReach warming was resumed 2026-05-21, so sender
  reputation is intact.
- The generator + grader are rewritten. Both the CommonJS path
  (scripts/generate.js) and the Worker path produce
  research-engagement content the grader accepts.
- Flipping the pause flag is the last step. Do it deliberately,
  not by default.

---

## Honest priority read

If you only do three things this weekend:

1. **Item 1** (verify 7 engines) — 5 minutes, de-risks every
   public claim.
2. **Item 4** (start the bank measurement) — it has calendar
   latency, so starting it is what unblocks the teardown.
3. **Whichever meeting is sooner** — the kit is ready, just
   read it start to finish once before you walk in.

Everything else can wait for next week without cost.
