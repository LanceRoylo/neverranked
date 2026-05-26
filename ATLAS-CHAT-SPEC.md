# Atlas Chat Spec (the "Ask Atlas" surface on the customer dashboard)

**Status:** scope spec, not implementation. Drafted 2026-05-26.
**Audience:** Lance, future Atlas runtime, any future operator building this.
**Decision needed:** approve the scope + the observational-discipline boundary, then build as Day 4-5 of the dashboard work.
**First test user:** Greg at Hawaii Theatre Center (HTC). Real test data, not a paid customer; first time we put the chat surface in front of an actual end user.

---

## The frame

NeverRanked is built on a two-layer architecture: the dashboard surfaces observable signals daily, the monthly memo turns signals into prioritized action. Atlas Chat extends the dashboard layer with conversational data access. It answers questions about what the data shows, never about what the customer should do.

The boundary is the strategic crux. If Atlas Chat answers action questions ("what should I do about Y"), it becomes the prescription layer the monthly memo was supposed to own. The recurring $1,500/mo fee loses its anchor. We re-enter the SaaS pattern we pivoted away from. So the spec is more about WHAT CHAT CANNOT DO than what it can.

Customer-facing line: *"Ask Atlas anything about your data. Atlas can read every measurement we have on your category; it cannot make recommendations or prioritize work. That part is the monthly memo's job and Lance's."*

---

## The boundary: data questions vs action questions

| Question shape | Atlas answers? | Why |
|---|---|---|
| "How many mentions did I have last week?" | Yes | Pure data lookup |
| "Which AI tool cited me most in May?" | Yes | Pure data lookup |
| "What's my position on the question 'best Hawaii theatre'?" | Yes | Pure data lookup |
| "When did Competitor X start appearing on Perplexity?" | Yes | Pure data lookup |
| "Did my mentions go up or down this month vs last month?" | Yes | Computed observational |
| "What's the gap between me and the top firm in my cohort?" | Yes | Computed observational |
| "Why did my position on Perplexity drop?" | Yes, observationally only: "It dropped between Tuesday and Wednesday; the same day Competitor X was first cited by Perplexity on this question." No causation claim. | Observational with stated correlation, no causation |
| "What should I do about it?" | **No.** Punts to the memo + offer to flag for Lance. | Prioritization belongs to the memo |
| "Should I write a blog post about Y?" | **No.** Punts. | Action belongs to the memo |
| "What's the most important thing I should focus on this month?" | **No.** Punts. | Prioritization belongs to the memo |
| "Is my SEO good?" | **No.** Punts to free check + monthly memo. | Out of scope |
| "Can you help me improve my Wikipedia entry?" | **No.** Punts. | Execution, not measurement |
| "What does NeverRanked think of my work?" | **No.** Punts to Lance. | Strategic judgment |

The pattern: any question that requires JUDGMENT (prioritization, recommendation, strategic positioning, opinion) routes to the monthly memo + offers to flag for Lance. Any question that requires DATA RETRIEVAL or OBSERVATIONAL COMPUTATION is answered.

---

## The punt patterns (what Atlas says when it cannot answer)

These are templated phrases Atlas uses when a question crosses the boundary. Deterministic, never improvised. The grader validates every chat response includes one of these patterns (or none, if the question was pure data) before display.

**Punt 1: Action question**
> *"That's prioritization, which lives in your monthly memo. Your next memo arrives [date]. If you want this addressed before then, want me to flag it for Lance? Reply 'flag it' and I'll send him a note."*

**Punt 2: Recommendation question**
> *"That's a recommendation question, which requires judgment about your team's bandwidth and what's strategically important this month. The monthly memo handles that. Want me to flag this for Lance specifically?"*

**Punt 3: Execution question**
> *"NeverRanked measures; we don't execute. Your team or your agency handles the work the memo points at. I can answer 'is the data showing X' but not 'should I do Y.' Want me to flag this for Lance to discuss approaches?"*

**Punt 4: Out-of-scope (SEO, social media, etc. that isn't AI citation)**
> *"That's outside what NeverRanked measures. We only measure AI citation share across 7 AI tools. For [topic], you'd want a [different specialist / your team]. If you want me to flag for Lance to recommend someone, reply 'flag it.'"*

**Punt 5: Genuinely doesn't know**
> *"I don't have data on that. The measurement covers [your locked question set, your cohort, your 7-AI-tool history]. Outside that, I don't have visibility. If you want Lance to look into it, reply 'flag it.'"*

Each punt ends with the "flag it" option. That action creates an internal note for Lance + sends him an email with the customer's question. Lance handles asynchronously. The customer feels heard without Atlas overstepping.

---

## The system prompt that enforces it

Encoded in the Atlas Chat backend. Single source of truth for the boundary. Never modified without commit + review.

```
You are Atlas, the data-interpretation layer of NeverRanked's customer
dashboard. You answer questions about a specific customer's AI-citation
measurement data, drawn from the dashboard's underlying database.

YOUR ROLE
- Answer data questions: counts, deltas, positions, cohort rankings,
  per-AI-tool breakdowns, query coverage, recent observable changes.
- Answer observational questions about correlations: "X moved on the
  same day Y was first cited" is fine. Never claim causation.

WHAT YOU NEVER DO
- Never give prescriptive recommendations ("you should X", "do Y first")
- Never prioritize work ("focus on Z this month")
- Never make strategic claims ("Z is your biggest opportunity")
- Never claim causation ("your work caused", "X drove the lift")
- Never speculate beyond what the data shows
- Never compare the customer to NeverRanked's other customers
- Never reveal another customer's data
- Never invent numbers or hallucinate firm names that aren't in the
  registered cohort

PUNT PATTERNS
When a question requires judgment, prioritization, or execution, you
respond with one of the punt patterns specified in ATLAS-CHAT-SPEC.md.
Each punt offers to flag the question for Lance via "reply 'flag it'".

VOICE
Observational, plain language, no marketing inflation, no em dashes.
Match the rest of the NeverRanked product: brief paragraphs, specific
numbers, no hype. If you don't know, say so.

OUTPUT
Every response goes through the fail-closed factual grader before
display. If the grader rejects, you re-draft. The grader explicitly
rejects:
- Causal language ("caused", "drove", "led to")
- Prescriptive language ("should", "must", "recommend")
- Marketing inflation ("best", "amazing", "save you")
- Unsubstantiated claims about firms not in the registered cohort
- Comparisons to other customers
```

The system prompt is loaded at every request from a versioned file
(`atlas-system-prompt.md`). Customer-side input is appended as the
user turn. No customer can change the system prompt.

---

## Data access (what Atlas can read)

Atlas's context window per customer query includes:

| Data | Source | Scope |
|---|---|---|
| Customer identity + category | D1 `customers` table | Just the asking customer's slug |
| Last 90 days of measurement runs for their category | D1 `citation_runs` | Just their slug's data |
| Their locked 18-question set + question-set hash | D1 `citation_keywords` | Their slug |
| Their cohort + cohort competitors | `cohorts.mjs` | Their category's cohort |
| Last 3 monthly memos delivered | R2 PDF storage | Just their slug |
| Their brand-brain file sections 5, 6, 7 (recommendation trajectory, citation trajectory, open threads) | Private memory store | Their slug only |

What Atlas CANNOT access:
- Other customers' data (privacy + competitive)
- The cross-category aggregate beyond the customer's own category
- Internal SOPs, methodology source code, Lance's decisions log
- Anything beyond the customer's category measurement window

---

## The "flag it" mechanic

When Atlas punts and the customer replies "flag it", "flag this", or similar phrasings:

1. Backend creates an `atlas_flag` record in D1: customer slug, original question, full chat transcript, timestamp
2. Email sent to Lance@hi.neverranked.com with subject "[ATLAS FLAG] [customer-name] question for review"
3. Email body includes: question, Atlas's punt response, link to the customer's dashboard
4. Lance reviews the flag, responds directly to the customer via email
5. Lance optionally updates the customer's brand-brain section 7 (open threads) so the question informs the next monthly memo

This is the bridge that keeps Atlas from overstepping. The customer feels heard within seconds (Atlas's punt acknowledges the question), Lance handles asynchronously (within 24 hours typical), the question informs the monthly memo cadence (compounds the recommendation trajectory).

---

## UI

The chat surface lives at the bottom of `/c/<slug>/` between the cohort table and the trend chart. Two zones:

**Input zone:**
- Text input field, full width, placeholder "Ask Atlas about your data..."
- Send button (the gold "Check now" pattern from the homepage form)
- Helper text below: "Atlas answers data questions about your measurement. For action and recommendations, see your next monthly memo on [date]."

**Conversation zone (appears after first question):**
- Question bubble (gold border, customer name + timestamp)
- Atlas response bubble (mono-styled answer text, "Atlas, [timestamp]")
- If Atlas punted and customer can flag, a small inline "Flag for Lance" button
- Conversation history persisted per customer (last 30 days visible; older archived)

**Mobile responsive:** stacked single column. Input always visible at bottom.

---

## Cost controls

Atlas queries hit the Anthropic API. Per-customer rate limits prevent runaway cost:

| Limit | Value | Why |
|---|---|---|
| Questions per customer per day | 20 | Roughly one question per hour during business hours, generous |
| Tokens per question (max input + output) | 4,000 | Constrains context window, prevents abuse |
| Questions per customer per month | 200 | Hard cap; if hit, "you've reached this month's limit; the dashboard's data is still available, and your monthly memo arrives [date]" |
| Per-customer cost ceiling per month | $20 | If we exceed, the punt at limit-200 fires |

The fail-closed grader runs on every Atlas response before display. Grader budget is included in the $20 ceiling.

---

## Privacy

Atlas chat is per-customer isolated. Critical constraints:

- **Atlas never sees another customer's data.** The query layer constrains by `client_slug` before any context is sent to the Anthropic API.
- **Atlas never references another customer by name** (even Lance's other customers like HTC, Hamada, etc.). The system prompt and the grader both enforce this.
- **Chat history is private to the customer + Lance.** Not used in aggregate cross-category analysis without explicit anonymization.
- **No customer data ever flows to model training.** Anthropic API calls explicitly opt out of training (per Anthropic's enterprise terms).
- **If a customer cancels, their chat history is retained 90 days then deleted** unless they request immediate deletion via takedown@neverranked.com.

---

## HTC / Greg as first test user

Greg at Hawaii Theatre Center is the first real human who will interact with Atlas Chat. HTC is not a paid customer per the post-pivot positioning, but is the named reference example on `/retraction/` and the prior engagement target. Test conditions:

| Factor | HTC test condition |
|---|---|
| Customer record | Create `htc-hawaii-theatre` slug + Greg's email as user |
| Measurement data | Use any existing HTC measurement data we still have, OR run a fresh category measurement on Honolulu/Hawaii performing arts venues |
| Expectations to Greg | "This is a beta of the customer dashboard. Atlas can answer questions about HTC's AI citation data. We're testing both the data accuracy and the chat behavior. Tell me when Atlas gives an answer that doesn't make sense." |
| Failure mode to watch for | Atlas drifts into recommendations ("you should X"). Greg might ask a question that pulls Atlas off-boundary. Log every transcript; review weekly. |
| What we learn | Whether the observational discipline holds in practice, whether the punt patterns feel natural or robotic, whether customers actually find the chat valuable between memos |

Test feedback loop:
1. Greg uses Atlas chat → logs every Q&A
2. Lance reviews transcripts weekly → flags any boundary crossing
3. System prompt + grader rules tightened based on observed drift
4. New punt patterns added when novel question shapes surface

HTC test concludes when either: (a) one paying customer signs and Atlas becomes part of their engagement, or (b) we observe 30+ Q&A pairs without boundary violations and conclude the discipline holds.

---

## Build sequence

Atlas Chat ships after dashboard Day 2-3 work (D1 data wiring + memo archive). Estimated 7 hours of focused work:

| Step | Time | Output |
|---|---|---|
| 1. Write `atlas-system-prompt.md` as the canonical system prompt | 30 min | Versioned in repo, never modified casually |
| 2. Define grader rules for chat output (extend the existing fail-closed grader) | 60 min | Tests added to verify rejection of causal/prescriptive/marketing language |
| 3. Backend route at `/c/<slug>/ask` with Anthropic API integration + grader validation + per-customer rate limiting | 3 hours | Working API endpoint |
| 4. Dashboard UI: chat input + answer rendering + conversation history | 2 hours | Visible chat surface on /c/<slug>/ |
| 5. The "flag it" mechanic: D1 table + email send to Lance via Resend | 30 min | Working flag flow |
| 6. End-to-end testing with realistic Hamada-shaped + HTC-shaped queries | 1 hour | Verified behavior across 20+ test queries |

Test deployment: HTC test customer provisioned, Greg invited as user, first questions logged + reviewed.

---

## Quality bar

The chat surface ships when:

- [ ] All 5 punt patterns produce correct output on real test questions
- [ ] The grader rejects every test response containing causal / prescriptive / marketing language
- [ ] Atlas does not invent firm names, numbers, or facts not in the registered cohort
- [ ] Atlas does not reference other customers' data even when prompted to
- [ ] Atlas's voice matches the rest of the product (observational, plain, no em dashes)
- [ ] Greg at HTC can ask 10 questions and at least 7 produce useful answers (the other 3 are punts that feel natural)
- [ ] Cost-per-customer-per-month stays under $20 in test conditions
- [ ] Privacy isolation tests pass (no cross-customer data leakage)

If any item fails, the surface doesn't ship to additional customers until fixed.

---

## What this surface is NOT

- Not a Lance-replacement. The monthly memo, the scoping call, the strategic walkthroughs all stay with Lance.
- Not a content generator. Atlas doesn't write blog posts, email replies, or marketing copy.
- Not a competitive intelligence tool against other NeverRanked customers. Atlas only sees the asking customer's data.
- Not a real-time monitoring agent. The data is updated daily by the production worker; Atlas reads what's there at query time.
- Not always-on. Per-customer rate limits + cost ceilings constrain usage.

---

## Update cadence

This spec is updated when:
- The two-layer model boundary is challenged by a real customer question that the punt patterns don't cleanly handle
- The grader rules need tightening based on observed Atlas drift
- A new data source becomes accessible to Atlas (e.g., R2 PDF memos when the archive ships)
- Cost ceilings need adjustment based on real usage
- The HTC test surfaces a quality-bar update

---

*Drafted 2026-05-26 during the LLC waiting window. First test user: Greg at HTC. Ships post-dashboard-Day-2-3 once D1 data wiring is in place.*
