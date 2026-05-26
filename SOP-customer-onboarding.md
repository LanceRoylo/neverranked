# SOP: Customer onboarding

**Audience:** Lance, future Atlas, any future operator handling a newly signed customer.
**Status:** living document. Update when an onboarding cycle surfaces a pattern this doc does not cover.
**Last updated:** 2026-05-25 (initial draft).

---

## Purpose

A customer just signed. They paid the $4,500 kickoff. The clock is now running and they expect the engagement to land the way the sales conversation promised. Onboarding is the workflow that takes a signed-customer state to "first-research-memo-shipped, customer-pleased" state.

The scoping call (covered in SOP-scoping-call.md) produces the locked 18-question set and the cohort. This SOP covers what happens after that: the technical setup, the customer expectations, and the first 21 days of operational discipline that determine whether the customer renews.

---

## The 21-day timeline

The kickoff promises a research memo three weeks after the scoping call. That timeline is non-negotiable. Customers picked NeverRanked partly because the engagement has a predictable shape; missing the 21-day mark erodes trust before the first deliverable lands.

| Day | What happens | Who owns it |
|---|---|---|
| 0 | Scoping call complete, question set drafted | Lance |
| 1-2 | Question set sent to customer for review | Lance |
| 3-4 | Customer reviews, requests edits or locks | Customer |
| 5 | Hash-locked, runner created, cohort registered | Lance |
| 6 | First measurement run fires | Cron / Lance |
| 6-19 | Daily measurement runs across 7 AI tools | Cron (automated) |
| 18-20 | Research memo drafted from accumulated data | Lance + Atlas |
| 21 | Research memo delivered to customer | Lance |

Customers who delay reviewing the question set push the entire timeline. The first email after scoping should be explicit about this: "Locking by day 4 keeps your first memo on the 21-day timeline. Locking later pushes the memo proportionally."

---

## Day 1-2: Question set delivery

Send the locked question set to the customer in the format from SOP-scoping-call.md (clean email, 8 head queries + 10 long-tail queries listed in order, with the two questions of "what's missing" and "what doesn't sound like your buyers"). Subject line: "Your locked question set for [category]".

Include the explicit lock-window expectation: "Locking by Friday keeps your first memo on the 3-week timeline. Reply with edits or 'lock it' when you've reviewed."

Common customer responses and how to handle:

- **"Lock it."** Proceed to day 5. Reply with confirmation + the start date.
- **"Can we add X?"** Reply with a clarifying question if needed, then swap a long-tail query for X. Total stays at 18. Send the revised set with the new lock-window expectation.
- **"This is too generic / too specific / wrong tone."** Treat as a redo of the buyer-shape interview. Schedule a 15-min call to drill into specifics. Then redraft and resend.
- **No response after 7 days.** Send a follow-up: "Locking the set today keeps your timeline on track. Confirm or send edits." Track responsiveness; some customers are slow on email and that is fine, but the 21-day timeline shifts accordingly.

---

## Day 5: Technical setup

Once the customer confirms the lock:

1. **Create the runner.** Copy the closest existing runner from `dryrun/run-*.mjs` and rename. Replace the HEAD and LONGTAIL arrays with the locked 18 questions.
2. **Run the runner once.** First run prints the query-set hash. Record this hash in the customer's record. Every future run must produce the same hash.
3. **Update `dryrun/forensic/cohorts.mjs`** with the customer's category (if new) or the customer's cohort additions (if existing category). Register the cohort with the agreed competitors.
4. **Run cohort-coverage after the first measurement** to surface additional competitors. Register the legitimate ones (not directories or noise per the KNOWN_NON_COHORT filter).
5. **Confirm production worker is scheduled** to run the new category daily. The cron schedule in `app.neverranked.com` (Cloudflare Worker) should fire the measurement at 06:00 HST.
6. **Email the customer.** Format:
   > Subject: Engagement started for [category]
   >
   > Your 18-question set is locked at hash [hash]. First measurement just fired. Three-week measurement window: [start date] to [end date]. Research memo will be delivered on [end date + 1].
   >
   > Between now and the memo, the daily measurement runs in the background. You will not hear from me unless something unexpected surfaces. The dashboard at app.neverranked.com/c/[slug] (when live) shows the running data; for now the data is collecting and will be summarized in the first memo.
   >
   > Lance

### Day 5 (continued): Initialize the brand-brain file

After the customer email goes out and the runner is firing, immediately initialize the customer's private brand-brain file. This is the institutional-knowledge document that captures everything Lance (and Atlas eventually) needs to know about this engagement to write a high-quality memo without having to re-derive context every month.

1. **Clone the template:** copy `templates/customer-brand-brain-template.md` to the customer's private location. Two recommended paths:
   - Local memory directory: `~/.claude/projects/-Users-lanceroylo-Desktop-neverranked/memory/customer-<slug>.md`
   - Dedicated private repo: `neverranked-customers/<slug>/brand-brain.md` (preferred once we have 3+ customers; the private repo gives backup and survives laptop loss)
2. **Fill in sections 1, 2, 3 immediately** from the scoping call notes and the kickoff email:
   - **Section 1 (Identity):** customer name, slug, category, signed date, MRR, engagement shape
   - **Section 2 (People):** every named human from the scoping call, what they care about most, communication preferences
   - **Section 3 (Engagement context):** hash, cohort, anything the customer asked us to track or NOT to do
3. **Paste scoping-call notes into section 4 verbatim** so the buyer-shape interview answers survive in raw form for future Atlas reference. Lance's paraphrased reading goes into section 8 (personalities).
4. **Sections 5, 6, 7 (recommendation trajectory, citation trajectory, open threads) stay empty until the kickoff memo lands.** They populate at memo time (Day 21).
5. **Section 8 (personalities and preferences) gets the texture notes from the scoping call.** This is the unwritten context that makes memos feel personal at scale. Lance's read on tone, formality, urgency, decision-making style. Atlas reads this before drafting any memo for this customer.
6. **Section 9 (cross-references) gets the file paths** for the scoping call notes, the runner manifest, and the customer's website pages we are measuring against.

The brand-brain file is private. Never shared with other customers, never excerpted in public artifacts, never committed to the public repo. If the customer is named in a public teardown's cohort, the public version stays anonymized per the non-customer rule; the brand-brain lives in the private surface only.

Timing: Day 5 initialization takes 30-45 minutes if the scoping call notes are dense. It is the part of onboarding most easily skipped under deadline pressure and most expensive to skip; Lance writes a worse memo on Day 21 if the brand-brain was not initialized cleanly.

---

## Day 6-19: The measurement window

The customer should not hear from you during this period unless something genuinely surfaces (drift event, AI tool outage that affects measurement, cohort expansion that materially shifts the framing).

Internal discipline during this window:

- **Daily ok_rate check.** Glance at the previous day's measurement run output. If ok_rate drops below 80%, investigate (per `run-diagnostic.mjs`). Common cause: API key out of balance.
- **Mid-window cohort expansion.** Run cohort-coverage every 5-7 days during the window. If a major cohort firm surfaces that materially changes the competitive context, add it to the cohort. Note in the memo.
- **Drift alerts.** If a major host (own-site or top competitor) gains or loses 5+ percentage points within a 24-hour window, surface it. Could indicate AI tool behavior change or a competitor moving fast.

Do NOT during this window:

- Draft the memo early based on partial data. The 3-week window is calibrated to produce stable patterns. Earlier readings are noise.
- Promise specific findings or numbers in advance.
- Send the customer interim updates unless something genuinely surfaces.

---

## Day 18-20: Memo drafting

The research memo for a kickoff is structurally different from the monthly delta memo (covered in SOP-monthly-memo.md). The kickoff memo:

- Establishes the baseline (this is the first time the customer sees their data)
- Names the cohort in full
- Maps every one of the 18 questions to AI tool coverage
- Identifies the closable competitive ground per question
- Sequences the prepped punch list by leverage

Target length: 10-15 pages (longer than the monthly delta memos because this is the foundational document).

Sections in order:

1. **Executive summary (1 page).** What the customer is currently mentioned for, what they are missing, where the closable ground sits. Customer's senior strategist should be able to act on the executive summary alone if pressed.
2. **The 18 questions and your coverage.** Question-by-question table showing AI tool coverage, position, sentiment.
3. **Your cohort (named in full).** All 15-40 competitors, mention counts, position bias, AI tool coverage. This is the named, unredacted competitive map.
4. **Source-type analysis.** Where AI pulls from when answering your category's questions. Lead-gen platforms, directories, publications, Wikipedia, social.
5. **Per-AI-tool report.** What each of the 7 AI tools cited about you. The cohort-wide Microsoft Copilot gap framing (if applicable to this category).
6. **The prepped punch list.** Sequenced by leverage. Each item names: the condition, the closable work, the realistic time-to-impact.
7. **Cross-category context (if applicable).** Where this category sits in the cross-category gradient. What that means for which surfaces matter most.
8. **The monthly cadence going forward.** What the customer can expect on the 25th of every month. Pointer to the dashboard.
9. **Honest scope of what this kickoff measurement does and does not prove.** Same discipline as the public teardowns.
10. **Methodology + reproducibility.** Hash, AI tool versions, run counts, code links.

---

## Day 21: Memo delivery

Send the memo by 09:00 HST. Format: PDF (primary, for executive forwarding) + markdown (secondary, for internal teams). Reply expected within 2-3 business days.

Format of the delivery email:
> Subject: Your kickoff research memo for [category]
>
> Attached: the 3-week kickoff research memo. The data covers [start] through [end] across [N] usable runs.
>
> The 1-paragraph honest read: [3-4 sentences pulled from the executive summary]
>
> Three things I'd flag specifically for your team:
> - [most important finding]
> - [second most important finding]
> - [the most closable opportunity]
>
> Next monthly delta memo: [date 30 days out].
>
> Want a 30-min walkthrough this week before your team starts executing? Reply with a few times that work.
>
> Lance

The walkthrough offer is important. About half of customers take it. The walkthrough is where the agency strategist (if the customer is an agency) or the in-house director (if direct) actually internalizes what the memo says. Those customers ship better work that the next monthly memo can report observably.

---

## Post-delivery follow-up

1. **24 hours after delivery:** check whether the customer opened the PDF (tracking pixel in the delivery email).
2. **7 days after delivery:** if no response, send a single soft follow-up. "Wanted to make sure the memo landed cleanly. Any questions or want to walk through it?"
3. **14 days after delivery:** if still no response, log the customer as "low-engagement" for internal tracking. Continue the monthly memo cadence (they paid for it) but reduce optional touchpoints.
4. **First monthly delta memo (30 days after kickoff memo):** standard cadence per SOP-monthly-memo.md begins.

---

## Quality bar (what makes onboarding good)

| Sign of good onboarding | Sign of weak onboarding |
|---|---|
| Customer reviews question set within 4 days of scoping | Customer reviews question set 14+ days later |
| Customer's question set has 1-2 edits from the draft (they engaged) | Customer responds with "looks good" (probably didn't read carefully) |
| Hash-locked runner produces 95%+ ok_rate across 3 weeks | Multiple runs land below 80% (API issues, cohort issues) |
| Cohort expanded once or twice during the window | Cohort not touched after initial registration (probably incomplete) |
| Memo lands exactly on day 21 | Memo lands day 24+ |
| Customer takes the walkthrough offer | Customer reads the memo, files it, no engagement |
| First monthly delta memo reports observable movement on at least one item the kickoff memo flagged | Customer's team shipped nothing actionable from the kickoff memo |

---

## Common pitfalls

1. **Question set drift.** Customer asks for edits that pull the set away from buyer-shaped questions toward SEO-keyword phrasing. Hold the line. The questions need to mirror how real buyers type into AI; SEO keyword tools are a different surface.
2. **Cohort creep.** Customer wants to add 20 more competitors. The cohort should be 3-7 real competitors plus whatever surfaces in cohort-coverage. More than 10 named-by-customer competitors signals the customer is uncertain about their actual competitive set; have the conversation rather than registering all of them.
3. **Mid-window methodology change.** Customer asks if we can add an AI tool, change the cohort, or modify the questions during the 3-week window. Answer: not in this window. The kickoff is hash-locked. Changes happen between kickoff and monthly cycle (and are noted in the memo).
4. **The "just send me the data" customer.** Customer asks to skip the memo and just receive the raw measurement output. The memo IS the product; the data is the substrate. Politely decline and offer to surface specific data points the customer is curious about within the memo structure.
5. **Missing the 21-day target.** If you slip, communicate proactively. "Memo will be 3 days late due to [reason]; revised delivery date [new date]." Customers tolerate one slip with clear comms; they do not tolerate silent slips.

---

## When to update this SOP

- A new customer onboarding surfaces a workflow gap this doc does not cover.
- The 21-day timeline proves wrong for a category (e.g. categories where 4 weeks gives materially better data than 3).
- Atlas matures enough to draft the kickoff memo's sections 2-6 with acceptable quality.
- A delivery method change (e.g. interactive web memo instead of PDF) becomes the standard.
