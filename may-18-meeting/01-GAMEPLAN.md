---
title: "ASB + MVNP May 18 gameplan (updated)"
meeting_date: 2026-05-18
prepared: 2026-05-13
status: prep material, not for distribution
supersedes: asb-2026-05-18-rehearsal.md (use this alongside, not instead)
---

# May 18 gameplan

Built fresh against the current product state. Reads quickly on mobile.

## The four strategic questions (answer these to yourself before you walk in)

1. **What does NR do today, in one sentence?**
   We measure where AI engines cite your brand, ship the schema and content that closes the gaps, and run a quality grader on every piece of work before it touches your domain. No clicks required from you. Weekly digest reports what happened.

2. **Why now, for ASB specifically?**
   First Hawaiian and Bank of Hawaii get named by default when anyone asks ChatGPT about Hawaii community banks. ASB does not. The gap is structural, not strategic. It closes in 30 to 90 days with the work we ship.

3. **What does ASB hear vs what does MVNP hear?**
   ASB cares about brand presence, compliance posture, and what arrives in their inbox week to week.
   MVNP cares about agency margin, who owns the client, and whether Lance is a credible operating partner.
   Same product. Different vocabulary per audience. Read the room.

4. **What does "yes" look like?**
   Best case: ASB signs a 90-day pilot at the Amplify tier ($4,500/mo) via MVNP as the agency of record. MVNP keeps the retainer relationship, NR is wholesale ($800/mo Signal or $1,800/mo Amplify wholesale).
   Acceptable: ASB takes a 90-day Signal pilot ($2,000/mo retail or $800/mo wholesale through MVNP).
   Minimum: kickoff call scheduled within 14 days to scope the pilot more concretely.

## The opening (do not deviate)

Lead with the finding, not the methodology, not the company.

> "ASB is named in zero percent of AI engine citations across the Hawaii community banking query set. First Hawaiian Bank and Bank of Hawaii get named by default. This is not a marketing failure. It is a citation infrastructure gap. The brands AI engines cite are the brands present on the third-party surfaces those engines trust. ASB is underrepresented across all of them."

If the room nods, keep going. If anyone pushes back, the audit deck has the citation matrix.

## The proof point (use before they ask for one)

> "Six weeks ago Hawaii Theatre had a 45 out of 100 AEO score and zero AI citations on the queries that mattered for venue discovery. Ten days after we deployed five schema categories, Perplexity named them on 14 of 19 tracked queries. The leadership of Hawaii Theatre Center approved use of those numbers as a public case study. It's live at neverranked.com/case-studies/hawaii-theatre."

Same gap shape applies to ASB. Same fix shape. Same 30 to 90 day arc.

## The split-score talking point (use if Mark or James asks "where do we stand today")

Re-verified against `asbhawaii.com` on 2026-05-14, four days before this meeting:

> "ASB sits at 55 out of 100 on the composite AEO score. That's middling, not zero — you've shipped basic schemas, the site is technically clean, and you get some citation surface. But on the agent-readiness subscore specifically, you're at 0. Zero Action schemas deployed across the site. So the honest story is: 55 overall, 0 on the agent layer. That's the gap, and that's exactly the work we ship."

Why this framing matters: a banker will run `check.neverranked.com` against asbhawaii.com on their phone in the room. The score they get is 55, not 0. Get ahead of the conciliation moment — concede the 55 ("you have some posture, here's what's working") before pivoting to the 0 ("here's the specific bottleneck"). Concession-pivot lands harder than "you're at zero" and survives them testing it.

If Mark presses on what the 55 contains:
- **Working:** Organization schema, BankOrCreditUnion node, technical hygiene, some FAQPage coverage, citation surface on a few queries.
- **Not working:** AggregateRating, FinancialService schema completeness, agent-readiness Action types (0 of 4 vertical-relevant types), llms.txt, citation surface on the queries that matter for community-banking buyer journeys.

## What's NEW since the prior rehearsal (use as ammunition)

1. **Reddit-aware FAQ deployment is shipped and live.**
   We pull the questions Reddit users ask on threads AI engines cite for the client's category, generate voice-matched answers from the client's business profile, run a quality grader, and deploy a FAQPage schema on the client's own domain. Live on hawaiitheatre.com as of 2026-05-14 with **5 fact-only FAQs** approved for deployment (the auto-pipeline generated 7; Lance reviewed and dropped 2 that overclaimed). Reversible in 30 seconds via the `nr-disable` snippet flag if Hawaii Theatre leadership flags anything.

   Why this matters in the room: the previous pitch said "we draft Reddit reply briefs your team posts." That put work on the client. New product puts the work on us. The client owns the source, controls the answer, no Reddit account needed, no risk of a banned account, no human-on-Reddit dependency. This is on-brand for "we ship the work, not the dashboard."

2. **Every output passes a quality grader before it ships.**
   Schema injections, FAQ entries, digest emails, generated content drafts. All get graded by Claude Haiku against two axes (voice + faithfulness for content, voice + substance for digests). Fail-closed: anything the grader cannot decide on does NOT auto-ship. Surfaces to the operator for review instead.

   Why this matters for a bank: "what stops you from publishing nonsense to our site" now has a specific answer. The grader is the answer. Compliance teams can audit the grader logic.

3. **Email cadence is consolidated to one weekly digest per client.**
   Every event that used to fire its own email (citations gained, citations lost, score changes, snippet detected, regression alerts, phase complete, schema deployed) now logs to a `client_events` table and renders as sections in one Monday digest. Biweekly cadence available on request.

   Why this matters: a banker hearing "we'll integrate with your marketing program" worries about inbox bombardment. Single weekly touchpoint solves that explicitly. Biweekly available if they prefer.

4. **Auto-prompt expansion runs every Monday.**
   Every active client gets up to 12 new tracked prompts per week, run through four quality gates (format, tone, similarity, relevance) before any get added. No human review queue, no clicks.

   Why this matters: addresses the "every AI rank tracker is garbage because prompts are infinite" criticism (the local-SEO commentator video). We don't track rank, we track citation. And we grow the prompt set automatically.

## The fix shape (three parallel tracks, same as prior rehearsal)

1. **Schema infrastructure.** FinancialService, AggregateRating, FAQPage, Person (for the leadership team), BreadcrumbList. Same five-category playbook that moved Hawaii Theatre, sized for a bank. One-line snippet deploys it; no engineering work on asbhawaii.com.

2. **Reddit-aware FAQ deployment.** Net new since the prior pitch. We pull the questions Hawaii Reddit users ask about community banks, generate voice-matched answers from ASB's brand voice profile, deploy as FAQPage schema on asbhawaii.com.

3. **News wire + Wikipedia entity work.** Press release distribution and Wikipedia entity entry maintenance. Two of the highest-impact source-type actions. Wikipedia editorial is a known process.

## Updated objection responses

The 10 from the prior rehearsal still apply. These are the new ones to be ready for.

### Objection 11: "How do we know the AI-generated content is safe to put on our site?"
> "Every generated piece runs through a Claude Haiku grader before it can be auto-published. The grader checks two axes: voice (does this read as written by a human, free of AI-tell language) and faithfulness (does every specific claim in the content trace back to your business description). Fail-closed by design. Anything the grader cannot pass does not auto-publish. We've already used this to filter content that misrepresented Hawaii Theatre as a comedy club when their business description didn't claim that."

### Objection 12: "What's the inbox cost? We don't want our team buried in alerts."
> "One email per week per client. Monday morning. Every event that happened during the week renders as a section in that digest. Citations gained or lost, score changes, schema deployments, FAQ updates. Biweekly cadence available if that's still too much. The infrastructure is built for inbox respect."

### Objection 13: "We have a brand voice document. Will your generated content match it?"
> "Yes, and that's the input that does the most work. Your business description in our system is the source of truth that every piece of generated content grades against. The richer the description, the better the output. Onboarding includes a session where we transfer your brand voice document into the description so the model writes in your voice from day one, not a generic banking voice."

### Objection 14: "What about regulatory disclosures? Banking has rules about claims."
> "Two layers protect against that. First, schema markup is structured fact about what your business already is, not new performance or financial claims. Adding a FinancialService schema is the same compliance posture as adding a meta description. Second, the FAQ deployment grader explicitly rejects any answer that makes claims your business description doesn't support. If your description doesn't say 'lowest rates,' the grader will not let the model write 'lowest rates.' Your compliance team can review the description once and trust every piece of downstream output."

### Objection 15: "What if we want to start with one schema type to see how it goes?"
> "Modular by design. Start with FinancialService and AggregateRating. Those are the two highest-leverage schemas for a bank. Once those land and you see the weekly citation movement, we add the next three. Three to five weeks to the full set. No commitment past the schema you've already approved."

### Objection 16 (from MVNP): "What if a client wants to leave us mid-pilot?"
> "MVNP owns the contract. The schema deployment is on the client's site, served by a snippet you can disable in 30 seconds. The data and the FAQ schema are theirs to keep. There's no lock-in mechanism on the NR side because the work is structured to be reproducible by anyone with the same tools. Your job is the relationship; if the relationship ends, we end with it."

### Objection 17: "Why should we trust AI generation when AI itself is changing so fast?"
> "Because we measure against the engines as they are today, weekly, with results published publicly. The State of AEO report at neverranked.com/state-of-aeo refreshes every Friday with the actual citation counts from the prior week. The methodology is open. The Gemma engine is open-weight so any third party with the same model can replicate our numbers. The platform that adapts faster wins, and we ship infrastructure changes weekly, not annually."

### Objection 18: "Can you show me what one of our FAQs would look like before we sign anything?"
> "Yes. The audit deck Mark already has includes a sample FAQPage schema generated from publicly available ASB information. The Reddit FAQ deployment for ASB specifically is a 30-minute next-step. Send me a one-paragraph business description ASB is comfortable being grounded against, and the build runs Monday. You see the actual output before any contract is signed."

## The ask (sharpened from prior rehearsal)

You're not asking for the audit anymore. ASB already has the audit. The asks are now:

### Ask A (primary, for ASB):
> "The pilot is a 90-day deployment of the five-schema package and the Reddit FAQ infrastructure on asbhawaii.com. Amplify tier, $4,500/month, billed monthly, 90-day minimum, cancellable thereafter. We schedule the kickoff call in the next 14 days to confirm the schema set and the brand voice transfer. From kickoff to first measurable citation movement is about 30 days. The leave-behind is the full deployment plan section 07 of the audit, which Mark already has."

### Ask B (for MVNP):
> "Wholesale tier through MVNP is $1,800/month per Amplify slot. MVNP's retail margin is $2,700/month per slot plus 3 to 8 hours of billable implementation work per month at MVNP's hourly rate. First agency to commit to a Hawaii partnership gets geography exclusivity. ASB becomes the joint pilot. If it works, we bring 2 to 3 more MVNP clients in over 90 days. If it does not, the audit work for those clients is still yours."

### Ask C (fallback if both above are too much for one room):
> "30-minute follow-up call within 14 days to scope the pilot more concretely. Three time slots offered in the post-meeting email. Mark and I plus one MVNP partner can do it in 30 minutes."

## What to walk in with

1. Audit deck PDF (`audits/asb-hawaii-2026-05/audit.pdf`)
2. Evidence appendix PDF (`content/meeting-evidence/asb-2026-05-18.pdf`)
3. Composite packet PDF (`content/meeting-evidence/asb-2026-05-18-packet.pdf`)
4. Laptop with these tabs preloaded:
   - `neverranked.com/case-studies/hawaii-theatre` (the proof)
   - `check.neverranked.com` (the live tool)
   - `neverranked.com/state-of-aeo/` (the methodology)
   - `neverranked.com/pitch/asb-hawaii/` (the brief they already saw)
   - `app.neverranked.com/reddit-faq/hawaii-theatre/public` (the NEW product surface, live and deployed, public read-only view safe to share on screen)
5. Cell hotspot ready as wifi backup

## What NOT to do

(Same as prior rehearsal, plus two new items.)

- Don't promise a specific citation lift number before the deployment lands.
- Don't compare ASB unfavorably to FHB or BOH in a way that reads as criticism rather than diagnosis.
- Don't open the dashboard. It's the operator surface, not the buyer surface.
- Don't volunteer the grader logic depth unless asked. "We grade every output before it ships" is enough; deeper detail derails the pitch.
- **New:** Don't mention the Reddit reply brief feature. That product is deprecated. If MVNP brings it up because they read the prior pitch material, redirect: "We pivoted to FAQ deployment because it puts the work on us and leaves the client controlling their own domain. Better for compliance, better for the client."
- **New:** Don't promise auto-deploy of generated content on day one. The trust window for content auto-publish is real and we wait three approvals before auto-publishing. Lead with the grader story, let auto-publish come up only if they ask "what's the long-term cadence?"

## After the meeting

Within 2 hours of leaving, send a single follow-up email to Mark + the MVNP attendee with:

1. Audit deck PDF (attach)
2. Evidence appendix PDF (attach)
3. The Hawaii Theatre case study URL in the body
4. The live Reddit FAQ deployment URL: `app.neverranked.com/reddit-faq/hawaii-theatre/public` (public read-only view, no auth needed, screenshot-safe for them to share internally)
5. A specific ask matching whichever Ask above the room responded to
6. Two concrete date options for the next conversation. Not "what works for you," two slots.

If silence after 5 business days, soft follow-up referencing one specific thing from the meeting. No "checking in" energy.

## Confidence anchors (memorize these)

- ASB AI citation share across tracked Hawaii community banking queries: **0%**.
- First Hawaiian Bank: cited in all 8 of the tracked prompts.
- Hawaii Theatre AEO trajectory: **45 to 95 in ten days.** Perplexity citations: **14 of 19**.
- Hawaii Theatre Reddit FAQ deployment: **5 voice-matched FAQs live on hawaiitheatre.com** as of 2026-05-14, drawn from 9 cited Reddit threads, auto-generated by the pipeline, **Lance-reviewed for factual accuracy before going live** (7 generated, 5 approved, 2 dropped as overclaim). Reversible in 30 seconds via snippet flag if Hawaii Theatre flags anything.
- Engines tracked: **7** (ChatGPT, Perplexity, Claude, Gemini, Microsoft Copilot, Google AI Overviews, Gemma).
- Gemma is open-weight and **reproducible by anyone with the same model weights.** This is the audit-ability story.
- Reddit landscape: r/Hawaii "First Hawaiian Bank continues to shock me" thread ranks at **priority 0.94** in the prioritized dataset. ASB absent. Cleanest competitor-visible / client-absent gap in the Hawaii banking dataset.
- News wires appear in **8% of citations.** Press releases compound.
- Vertical comparison: **banking is the only Hawaii vertical of three** where targeted Reddit work has meaningful citation lift per hour spent. Hotels too saturated, law firms too thin.

## One last thing

You've done the work. The infrastructure is real, the case study is approved, the data is reproducible, the methodology is public, the pilot offer is fair on both sides. The product has gotten meaningfully better since the prior rehearsal: FAQ deployment is live, the grader catches bad output before it ships, emails are consolidated, every output is auto-approved against a quality bar.

Walk in calm, specific, patient. You've earned the right to be in the room. The only thing the room is deciding is whether they trust the operator across the table.
