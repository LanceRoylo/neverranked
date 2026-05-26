# Customer brand-brain: [Customer Name]

**PRIVATE.** This file captures structured institutional knowledge for one paying customer. It is read by Lance (during memo prep and customer calls) and by Atlas (when drafting monthly delta memos). It is NOT shipped to the public repo, NOT shared with other customers, NOT used in cross-customer aggregate work without explicit anonymization.

This template gets cloned and committed to a private location (Lance's local memory directory, OR a separate private repo `neverranked-customers/`, never the public neverranked repo) on the customer's onboarding Day 5 right after the technical setup completes. The file is updated after every customer touchpoint (call, memo, support email, scoping change) so the next memo prep starts from current institutional context, not from Lance's memory.

---

## 1. Identity

- **Customer name:** [legal name and DBA if different]
- **Client slug:** [URL-safe slug used in /c/<slug>/ and in cohorts.mjs registration]
- **Category:** [Hawaii wealth management / Hawaii law firms / etc.]
- **Signed date:** [YYYY-MM-DD]
- **Engagement shape:** [single category / multi-category list]
- **MRR:** [$1,500 / category-count × $1,500]
- **Kickoff memo delivered:** [YYYY-MM-DD]
- **Renewal anniversary:** [YYYY-MM-DD]

## 2. People

The named humans on this engagement. Include role, what they care about most, decision-making authority, and any preferences worth knowing (formats, tone, response cadence).

- **Primary contact:** [Name, role, email]. What they care about most: [...]. Communication preference: [PDF / markdown / inline / call].
- **Senior strategist or executor:** [Name, role]. What their team is shipping: [...].
- **Decision-makers not in the room:** [Name, role]. What they want to see: [...].
- **Anyone who blocks or accelerates:** [Name, role, what they look for].

If the customer is an agency-channel engagement: list both the agency contacts AND the end-client contacts; note the firewall (we communicate through the agency only).

## 3. Engagement context

What the customer is paying for and what we promised:

- **Locked question set hash:** [hash]
- **Locked question set summary:** [one sentence describing the 18-question shape]
- **Registered cohort:** [comma-separated list of competitor slugs from cohorts.mjs]
- **Cohort size at lock:** [N firms]
- **Specific things the customer asked us to track:** [from scoping call notes]
- **Specific things the customer asked us NOT to do:** [from scoping call notes]
- **Aspirational buyer types named in scoping:** [from the question-5 buyer-shape interview answers]

## 4. Buyer-shape notes (from the scoping call)

What the customer told us about how their buyers actually search. This is the raw material for understanding why the locked questions look the way they do. Update if customer surfaces new buyer types or new search behavior in any subsequent call.

- [Pasted verbatim or paraphrased from scoping call notes]
- [The five questions from SOP-scoping-call.md, with the customer's answers]
- [Any specific colloquial phrases or category-specific jargon worth remembering]

## 5. What we've recommended (the punch list trajectory)

Every recommendation we have made, in date order. Each entry: date, what we recommended, customer's response, what they shipped (if anything), observed citation impact (if any).

| Date | Recommended | Customer response | Shipped? | Observed citation impact |
|---|---|---|---|---|
| YYYY-MM-DD | [recommendation] | [their response] | [yes/no/partial] | [observable change or not yet observable] |

The pattern of "what we recommend vs what they ship vs what moves" tells us a lot about the engagement health. A customer who ships nothing the punch list points at is not getting value. A customer who ships but doesn't see movement may need a methodology adjustment. A customer who ships and sees movement is the case study we want to nurture.

## 6. Citation trajectory (monthly snapshots)

Each monthly memo updates this section. Captures the longitudinal arc of the engagement's measurement output, separate from the dashboard's daily data.

| Month | Questions mentioning customer (of 18) | Cohort rank | Notable movement |
|---|---|---|---|
| YYYY-MM | N of 18 | N of cohort | [one-line summary] |

If the customer's category changes (new question added, cohort expanded), note it inline so the next month's reader knows why the number shifted.

## 7. Open threads

Things in flight that need follow-up, in priority order. Lance reviews this section every Monday morning AND before any customer call.

- [ ] **[Date]:** [Open thread description, what's blocking, what the next move is, deadline if any]
- [ ] **[Date]:** [...]

When a thread closes, move it to section 5 (the punch list trajectory) with the outcome noted, then delete from this section.

## 8. Personalities and preferences

The unwritten context that makes the engagement feel competent. Examples:

- **[Person name]** prefers PDFs to inline markdown. Forwards memos to the board, so first paragraph needs to read clean for someone who has not been on prior calls.
- **[Person name]** is the implementer. Drafts content directly from the punch list; do not over-explain rationale, do over-explain priority.
- **[Person name]** sends emails at 11pm; do not assume they are working when they are. Async-first response cadence.
- **[Customer firm]** culture: [conservative / move-fast / risk-averse / etc.]. Memo tone should match: [understated / bold / detailed / brief].

These notes are the texture that makes engagements feel personal at scale. Atlas reads this section before drafting any memo for this customer.

## 9. Cross-references

Pointers to related files Lance may need during memo prep or a customer call:

- **Scoping call notes:** [path to scoping-<slug>.md draft]
- **Kickoff memo:** [path to kickoff-memo-<slug>.pdf]
- **Most recent monthly memo:** [path]
- **Customer's published case study (if any):** [URL or "not yet"]
- **Customer's website + key pages:** [URL, key pages we are measuring against]
- **Customer's competitors' websites:** [list]

## 10. Privacy and handling

- This file is **private to the engagement**. Never shared with other customers. Never excerpted in public artifacts.
- Quotations from customer calls are paraphrased unless the customer has explicitly given consent for verbatim use.
- If a customer cancels: archive this file (move to `archived/` subdirectory with cancellation date), do not delete; retention helps the postmortem.
- If a customer is named in a public teardown's cohort (because they happened to be in a Hawaii category we measured before they signed): the public teardown stays anonymized at the firm level per the non-customer rule. After they sign, their named cohort lives only in their private deliverables, not in the public teardown.
- Lance retains the brand-brain after engagement ends as institutional knowledge; the customer can request its deletion at any time by emailing `takedown@neverranked.com`.

---

## How to use this file

**Cadence:**
- Initialized on Day 5 of customer onboarding, immediately after technical setup completes
- Updated within 24 hours of any customer touchpoint (call, scoping change, support email)
- Updated as part of the monthly memo pre-prep (per SOP-monthly-memo.md section "Pre-memo prep")
- Reviewed every Monday morning during the working-hours session

**Who reads:**
- Lance: every Monday morning + before every customer call + during memo drafting
- Atlas (future): every monthly memo draft cycle, every time the customer's slug is queried, every drift alert that involves their cohort

**Who edits:**
- Lance edits manually after touchpoints
- Atlas (future) drafts updates after measurement runs, Lance approves before merge

**Naming convention:**
- File path (private): `~/.claude/projects/-Users-lanceroylo-Desktop-neverranked/memory/customer-<slug>.md` OR a dedicated private repo at `neverranked-customers/<slug>/brand-brain.md`
- Slug must match the cohorts.mjs registered slug exactly
- One file per customer regardless of how many categories they engage on; multi-category customers get a section per category in section 3

---

*Template version: 1.0 &middot; 2026-05-25 &middot; Update this template when the brand-brain shape evolves; existing customer files do not auto-migrate, Lance migrates them at the next monthly memo cycle.*
