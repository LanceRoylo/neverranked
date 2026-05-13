---
title: "Phase 1.5 scope: independent QA auditor"
status: scoped, builds after Phase 1 verification
target_build_window: 2026-05-14 (Thursday post-launch + post-cron-verification)
target_ship: 2026-05-16 (Saturday)
authors: Claude + Lance, 2026-05-11 ~02:30 HST
related: phase-1-system-health-scope.md, long-term Lance-agent foundation
estimated_effort: 14 hours across three focused sessions
estimated_monthly_cost: $1-10 depending on agency scale, dominated by LLM tokens
---

# Phase 1.5: Independent QA auditor

A separate agent that grades production output. Phase 1 watches the
system; Phase 1.5 watches the work the system produces.

## What problem this solves

Phase 1 catches operational failures: cron didn't fire, engine
returned empty rows, API key expired. Those are easy because the
symptom is the absence of data.

The harder failure mode is **plausible-looking-but-wrong output.**
Examples that operational monitoring cannot see:

- Gemma returns 500 chars of confident hallucinated text. Engine
  appears healthy. Citation Tape now contains poisoned data.
- Generated FAQ schema validates as JSON-LD but the answers
  contradict the page body. Google's Rich Result Test flags it
  weeks later, and the customer's SERP visibility drops.
- Content draft uses an em dash and the word "leverage" twice. Brand
  voice rules say no. Got auto-approved during a batch.
- NVI score jumps 30 points week-over-week. Real news, or bug?
  Without an auditor flagging the anomaly, we wouldn't know until a
  client asks.
- Homepage says "7 engines tracked." Production tracks 6 because we
  silently disabled Gemma a week ago after an outage. Marketing copy
  and reality have drifted.

Tonight's session is the proof of concept: we found three engine
bugs by accident during MCP launch prep. Phase 1.5 finds them on
purpose, daily, before customers do.

## The core design principle

**The QA agent uses a different LLM than the production agent.**

If the same model that generates content also grades it, the auditor
inherits the same blindspots and the QA layer is theatre. So:

- Production content generation uses Claude (Haiku 4.5 + Sonnet
  variants). QA grading uses OpenAI (GPT-4o mini + GPT-4o for
  high-stakes).
- Production citation queries call Claude. QA sanity checks call
  GPT-4o mini.
- Schema validation uses no LLM at all -- runs against Google's
  Rich Results Test API + schema.org validator (both free).

Independence is the entire point. The auditor's job is to disagree
when disagreement is warranted.

## What gets audited

Six audit categories, in priority order. Each section below specifies
the audit input, the grader, and the failure-mode it catches.

### 1. Schema integrity (rules-based, $0)

**Triggers on:** every `schema_injections` row that goes from `pending`
to `approved`, every Event schema refresh, every FAQ/HowTo/Article
generation.

**Input:** the JSON-LD payload + the URL it will be deployed to.

**Grader:** rules-based pipeline:
- JSON.parse() check (valid JSON)
- schema.org property-set check (no invalid keys for the type)
- Required-field check (FAQPage needs mainEntity, etc.)
- URL resolution check (fetch the target URL, confirm 200)
- HTML content vs schema overlap check (fetch the page body, do an
  80% text-match between schema text fields and visible page
  content; flag if schema makes claims absent from the page)
- Google Rich Results Test API call (free, returns pass/fail with
  warnings)

**Failure mode caught:** broken JSON, invalid schema, schema that
contradicts the visible page, schema that fails Google's validator.

### 2. Content draft brand voice (rules-first, LLM second)

**Triggers on:** every `content_drafts` row created.

**Input:** draft text + the client's brand voice fingerprint.

**Grader (pass 1 -- rules):**
- Banned-word check (leverage, unlock, seamless, effortless,
  cutting-edge, etc. per HM standards)
- Punctuation check (em dashes, semicolons in marketing copy)
- AI-tell check (formulaic openers: "Welcome to...", "Nestled in...",
  "Hidden gem", "Rare opportunity")
- Length-window check (too short or too long for the format)
- Emoji presence check (banned on professional content per HM)

**Grader (pass 2 -- LLM, only if pass 1 is clean):**
GPT-4o mini graded against the client's voice fingerprint. Prompt
template:

> Compare this draft against the brand voice fingerprint below. Does
> the draft sound like it was written by the same person who wrote
> the fingerprint examples? Respond with a JSON verdict:
> `{score: 0-100, on_voice: bool, reasoning: ""}`. Anything below 75
> is a fail.

**Failure mode caught:** AI-tells slipping past, voice drift from
template re-use, accidental competitor mentions, off-tone openings.

### 3. Citation response sanity (LLM-graded, sampled)

**Triggers on:** 10% sample of last-24h `citation_runs` rows across
all engines.

**Input:** keyword + engine + response_text + cited_urls.

**Grader:** GPT-4o mini with a fact-check prompt:

> Below is a response from <engine> to the query "<keyword>". Are
> the claims plausible? Do the cited URLs (if any) resolve to real,
> relevant pages? Is the response on-topic or did the engine
> hallucinate / drift? Respond `{plausible: bool, urls_resolve:
> bool, on_topic: bool, suspicious_claims: []}`.

**Plus** a URL-resolution check on every `cited_urls` entry.

**Failure mode caught:** Gemma producing hallucinated text that looks
real, engine drift, dead URLs being cited, off-topic responses.

### 4. NVI score drift (rules + LLM explainer)

**Triggers on:** every `nvi_reports` row generated.

**Input:** new NVI score + prior 4 weeks of scores for the same
client.

**Grader:**
- Rule: if delta > 15 points week-over-week OR > 25 points
  month-over-month, flag.
- If flagged, LLM (GPT-4o, not mini -- higher-stakes) explains the
  delta by reading the per-engine citation runs that contributed.
  Verdict: `{anomalous: bool, likely_cause: "", needs_human_review:
  bool}`.

**Failure mode caught:** silent bug in scoring algorithm, real
customer-impacting change that needs Lance's attention.

### 5. Cross-system consistency (weekly, $0 + small LLM)

**Triggers on:** weekly cron (Sundays).

**Input:** the current homepage HTML, the state-of-aeo page, the
current Citation Tape blog post, plus production D1 data.

**Grader:**
- Rules:
  - Page says "7 engines" --> count distinct engines in
    `citation_runs` (last 7d) --> match?
  - Page says "tracking N clients" --> count active client_slugs
    --> match?
  - Page says "first weekly report on Y" --> check earliest
    `citation_snapshots` row --> consistent?
- LLM (GPT-4o, weekly only so cost is fine): given the page text
  and the DB stats, find any factual claim on the page that the data
  doesn't support.

**Failure mode caught:** marketing copy drifts from reality, claims
become false after a quiet change.

### 6. Email pre-flight (rules-based, $0, blocking)

**Triggers on:** every outbound email before Resend send.

**Input:** subject + body + recipient + email_template_id.

**Grader:** rules-based pre-flight:
- Template-fail detection (`{{` or `}}` in body)
- Recipient validation (no `@example.com`, no `test@`, no admin
  internal addresses in production)
- Banned-word check (same brand voice rules)
- Suppression-list check (don't send to addresses that bounced or
  unsubscribed)

**Critical difference:** this audit is BLOCKING. If pre-flight fails,
the email does not send. An `admin_alert` is created with the failed
draft. Lance can review and either fix or override.

**Failure mode caught:** the cold sweat of `Hi {{first_name}}` going
to 200 prospects.

## Architecture

### New table: `qa_audits`

```sql
CREATE TABLE qa_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,         -- 'schema'|'content_voice'|'citation_sanity'|'nvi_drift'|'cross_system'|'email_preflight'
  artifact_type TEXT NOT NULL,    -- 'schema_injection'|'content_draft'|'citation_run'|...
  artifact_id INTEGER,            -- FK to the audited row (nullable for cross-system)
  verdict TEXT NOT NULL CHECK(verdict IN ('green','yellow','red')),
  grader_model TEXT,              -- 'rules-only'|'gpt-4o-mini'|'gpt-4o'|...
  grader_score INTEGER,           -- 0-100 if LLM-graded
  reasoning TEXT,
  blocked INTEGER DEFAULT 0,      -- 1 if this audit prevented the artifact from proceeding
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_qa_audits_category_created ON qa_audits(category, created_at DESC);
CREATE INDEX idx_qa_audits_artifact ON qa_audits(artifact_type, artifact_id);
```

### New cron task: `qa_audit_daily`

Runs at 8am Pacific (after morning citation runs). Iterates through
the six audit categories, runs sampled audits, writes to `qa_audits`.
Any red verdict creates an `admin_alert` with category + reasoning.

### New page: `/admin/qa`

Like `/admin/health` but for the audit log. Shows:
- Last 24h: count of green / yellow / red by category
- Top 10 red verdicts with reasoning
- Trend: red-rate per category over last 7 days
- "Re-audit" button to manually trigger one category

### New section on `/admin/health`

Add a "QA verdicts (last 24h)" section that pulls from `qa_audits`.
Three rows: green count, yellow count, red count. Click-through to
`/admin/qa`.

### Integration points (where the audits actually fire)

- **Schema audit:** wrap the `handleInjectApprove` and Event-refresh
  paths. Audit runs BEFORE the row flips to `approved`. Red = block.
- **Content voice audit:** wrap content draft INSERT. Audit runs
  asynchronously after insert. Red = move to `flagged` status (new),
  Lance reviews in queue.
- **Citation sanity:** runs daily via cron, samples last-24h rows.
  Audits are descriptive, don't block.
- **NVI drift:** wrap NVI report INSERT. Audit fires synchronously.
  Red = mark report as `needs_review` instead of `draft`.
- **Cross-system:** weekly cron, descriptive.
- **Email pre-flight:** wraps `sendEmailViaResend` helper at the
  lowest possible layer. Every outbound goes through it. Red = throw
  + write `admin_alert`. Caller code already has try/catch around
  email sends, so the throw cleanly aborts the send without breaking
  the parent flow.

## Cost projection

Detailed in the chat earlier; abridged here:

- Rules-based audits (4 of 6 categories): $0
- GPT-4o mini for 90% of LLM-graded audits at full agency scale:
  ~$1.20/month at 3.5M tokens
- GPT-4o for high-stakes (NVI + cross-system weekly): ~$1-2/month
- **Total at current scale (3 clients): under $1/month**
- **Total at full agency scale (50 clients): $5-10/month**

## Build sequence

### Session 1 (~5 hours): foundations + rules-based audits

1. `qa_audits` table migration + apply
2. New `dashboard/src/lib/qa-auditor.ts` with the framework: function
   signatures for each audit category, `recordAudit()` helper writing
   to `qa_audits`, `blockingAudit()` helper that throws on red verdicts
3. Schema integrity audit (rules-only, all sub-checks)
4. Email pre-flight audit (rules-only, blocking, hook into Resend
   send helper)
5. Cross-system consistency rules portion (no LLM, weekly cron)
6. Deploy. Verify schema audits are firing on next schema injection
   and email pre-flight blocks a test email containing `{{`.

**Output of Session 1:** four audit categories live, all $0/month,
already catching real failure modes.

### Session 2 (~5 hours): LLM-graded audits

1. Content draft brand voice audit (rules pass 1 + GPT-4o mini pass 2)
2. Citation response sanity audit (sampled, GPT-4o mini)
3. NVI drift audit (rules + GPT-4o explainer for flagged ones)
4. The `qa_audit_daily` cron task wiring (and `logCronRun` integration
   so this cron appears on the health page too)
5. Deploy. Sample-audit yesterday's citation runs as a backfill to
   prove the prompts work.

**Output of Session 2:** all six audit categories live, costs in the
dollar-or-two-per-month range, immediate signal on draft quality.

### Session 3 (~4 hours): UI + observability

1. `/admin/qa` page with the trend visualizations
2. "QA verdicts (last 24h)" section on `/admin/health`
3. Re-audit button + manual trigger endpoints
4. Email summary of QA verdicts in the weekly summary email (Phase 2
   integration point: when Phase 2 ships, the QA summary just becomes
   another section)
5. Deploy. Walk through one week of audit history with Lance, tune
   thresholds.

## Two-week commitment after ship

Audit thresholds will be wrong on day one. The plan:
- Days 1-3: every red verdict gets investigated by Lance, even
  trivial ones. Goal: validate the audit is grading on reasonable
  axes.
- Days 4-7: tune thresholds. Some audits will be too strict (every
  draft fails brand voice). Some will be too lax. Adjust prompts +
  rubrics based on real verdicts.
- Days 8-14: trust the audits enough to start blocking content
  in queues. Move from "advisory" to "gating" for high-stakes
  artifacts.

After two weeks, the system is graded enough to mostly run itself.
That's the moment Phase 2-3-4 stand on a foundation that knows when
it's wrong.

## Connection to the Lance-agent endgame

Each `qa_audits` row is a labeled data point. After 90 days, you
have thousands of "Claude wrote X, GPT graded it Y, Lance overrode
to Z" tuples. This is the training data for the Lance-agent. Without
Phase 1.5, the agent is guessing about your taste. With Phase 1.5,
the agent has a record.

This is why Phase 1.5 is the highest-leverage piece in the entire
roadmap. Phase 1 makes you informed. Phase 1.5 makes you teachable.

## Out of scope for Phase 1.5

- Automated remediation (Phase 4 self-healing handles that)
- Public-facing QA artifacts (post-Phase-1.5 marketing decision)
- Multi-grader consensus (graders agreeing among themselves)
- Audit-of-audits (the recursive trust question -- Phase ∞)

## What success looks like

Two weeks after ship, when Lance checks `/admin/qa` on Monday morning:
- Less than 5% of all audits in last 24h verdict red
- Every red verdict has a one-line reasoning that makes sense
- At least one real failure mode caught by the auditor that
  operational monitoring would have missed
- Lance's confidence in the system's outputs has increased to the
  point where he ships content drafts and schema injections without
  reading every one
- The decision-log seed for the Lance-agent is real and growing
