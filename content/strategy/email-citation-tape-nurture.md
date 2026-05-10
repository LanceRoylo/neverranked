---
title: "Email nurture template, Citation Tape launch"
target_send: 2026-05-12 (Tuesday morning, paired with LinkedIn launch)
audience: past audit recipients + warm prospect list
status: draft, ready for review
---

# Citation Tape launch nurture email

Designed for past audit recipients (people who got an audit
report from NeverRanked but haven't converted) and the warm
prospect list. Not a cold send. Stays in the "what we've
been doing" register, not the "buy something" register.

## Subject line options (pick one)

A. **What AI engines actually cite, measured weekly**
   (38 chars, descriptive, clean)

B. **The audit you got is now standing infrastructure**
   (45 chars, callback to the prior touchpoint, my recommendation
   for past audit recipients specifically)

C. **A new way to see what AI engines say about you**
   (47 chars, benefit-shaped, generic enough for either audience)

D. **The Citation Tape, week one**
   (28 chars, short and intriguing, leans on curiosity)

## Preview text (50-90 chars, shows in inbox)

```
We named the methodology behind our weekly reports. It's live now.
```

## Body

```
Hey [first name],

Six months ago you got an AEO audit from us, and we walked you through what AI engines were citing for queries in your category. Not enough, right?

What we didn't say at the time: we'd been quietly building a standing measurement system that runs the same audit, weekly, across the brands we track. We named it last night.

It's called The Citation Tape, and the first weekly report is live at:

https://neverranked.com/state-of-aeo

What's there:

- The single most-cited third-party source across our tracked universe this week
- Distribution by source type (15 categories: Wikipedia, Reddit, Google Maps, news wires, AEO competitor publications, Google's grounding infrastructure)
- Top 15 third-party sources with engines, keywords, and clients per row
- What each AI engine cites differently
- Per-client baselines (the numbers we measure today become the baseline against which any future case study is measured)

Three things to know:

1. The methodology is the script. The source-type taxonomy is public. The schema is in the repo. Anyone running the same query gets the same numbers.

2. This week's data is partial. We caught a bug in our infrastructure while building the tape. The report ships with a banner above the headline disclosing the issue. We'd rather publish honest than wait.

3. Your category may not yet be in the tracked universe. If you'd like it to be, hit reply.

The launch post explains the full thinking:

https://neverranked.com/blog/the-citation-tape

If you'd rather just track future reports, the RSS feed is at:

https://neverranked.com/state-of-aeo/feed.xml

Thanks for being patient while we built this.

Lance

P.S. The audit you got from us is still relevant. The Citation Tape is the system that audit was a one-shot snapshot of. If you want a fresh audit against the new methodology, that's a separate conversation.
```

## What this email is doing

- **Subject line B (recommended)** lands a callback to the prior
  audit. The recipient remembers: "Oh right, that audit." Pulls
  them back into the relationship without a hard sell.
- **Opening line acknowledges the gap.** "Not enough, right?" is
  the kind of self-aware admission that wins back attention from
  someone who has stopped opening NR emails.
- **Mid-body bullets** describe the report concisely without
  marketing fluff.
- **Three things to know** is the meat. Item 2 is the unusual
  part: most marketing emails would hide a partial-data caveat.
  Disclosing it openly proves the trust-first claim.
- **Item 3 is the soft CTA.** "Hit reply" is the lowest-friction
  ask. Anyone with a real category question replies; everyone
  else just notes the offer and moves on.
- **P.S. is the conversion bait.** Past audit recipients who are
  already-warm get the explicit "want a fresh audit?" offer
  there, rather than in the body where it would feel pushy.

## Voice and format rules applied

- No banned words per global brand voice guidance
- No em dashes (matches LinkedIn + blog launch posts)
- No emojis (per Hello Momentum standards)
- Plain text body (no HTML email styling) so it reads as
  founder-from-a-laptop, not as marketing
- Three URL links, all canonical neverranked.com paths
- One named link target (the RSS feed) for the small fraction of
  recipients who actually use feed readers

## Send mechanics

- **Tool:** Resend, same as the magic-link auth emails (verified
  working tonight per the heartbeat).
- **From:** lance@neverranked.com (founder address, not
  reports@). Past audit recipients have likely received from this
  address before; consistent threading helps deliverability.
- **Reply-to:** lance@neverranked.com. Do not set a no-reply.
  Replies are the desired outcome.
- **Send time:** Tuesday 9am Pacific = 12pm Eastern. Lands in
  inboxes during the post-coffee window when prospects are
  triaging.
- **Audience filter:** WHERE plan IS NOT NULL OR audit_credit_amount
  IS NOT NULL. Excludes anyone who unsubscribed.
- **Unsubscribe footer:** standard one-click, reuse the existing
  email_log unsub mechanism so unsubs are tracked.

## Follow-up if anyone replies

Three predictable reply categories with canned responses:

1. **"What would my category cost?"** -> link to /pricing or
   propose a 15-min call. Don't quote a number cold; the price
   depends on keyword count.
2. **"I forgot you, can you send me my audit again?"** -> grep
   audits/*/ for the matching slug, attach the PDF.
3. **"Is this just a vanity dashboard?"** -> link to the source
   code, the source-type taxonomy, the schema, and the autonomy
   audit doc that documents the data integrity caveat. Show, don't
   tell.

## What NOT to do

- Don't send before the LinkedIn post is live. Recipients will
  cross-reference. The LinkedIn post is the public announcement
  context the email assumes.
- Don't include UTM parameters on the links. The audience knows
  it's from us; UTM clutter undermines the founder-laptop voice.
- Don't bold any text. Plain prose reads more honest than
  marketing-formatted prose.
- Don't reuse this template for cold sends. Different audience,
  different approach. Cold emails should NOT reference a prior
  audit because there wasn't one.

## Variant for warm prospects who never got an audit

If sending to the warm prospect list (rather than past audit
recipients), edit the opening:

```
Hey [first name],

Six months ago we talked about whether NeverRanked could help your AI visibility. Whatever we covered in that conversation, we've since built something that explains the work better than any pitch deck.

It's called The Citation Tape...
```

Same body from there. Drop the P.S. about the audit. Add a
different P.S.:

```
P.S. If our last conversation didn't go anywhere because the timing was off, this is the right week to revisit. We're tracking three Hawaii verticals and adding one new vertical per month. If yours is on the roadmap, the wait list is open.
```
