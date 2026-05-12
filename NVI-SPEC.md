# Neverranked Visibility Index (NVI) — Build Spec

**Status:** spec, pre-build
**Date:** 2026-05-03
**Owner:** Lance
**Internal test client:** Hello Again (Honolulu coffee)

---

## What this document is

A research-grounded build plan for the Neverranked Visibility Index, a productized monthly PDF report tracking how often a client's business appears in AI engine responses. Two tiers: Lite (Signal add-on, $300-400/mo) and Full (included in Amplify, $4,500/mo).

This spec audits what's already built in the dashboard codebase, identifies what's net-new, and produces a prioritized v1 build plan with a fastest-path-to-Hello-Again target.

---

## Table of Contents

1. [Existing infrastructure (what we already have)](#existing-infrastructure)
2. [How NVI fits with our existing grading systems](#how-nvi-fits)
3. [API research](#api-research)
4. [Data pipeline + model](#data-pipeline)
5. [Scoring logic (AI Presence Score)](#scoring-logic)
6. [PDF report generation](#pdf-generation)
7. [Cost estimates](#cost-estimates)
8. [Build plan v1 (Lite)](#build-plan)

---

## Existing infrastructure

Honest audit of what's already shipped in `dashboard/src/` so we don't rebuild it:

| Capability | Status | Location |
|---|---|---|
| OpenAI ChatGPT querying (web-grounded) | Live | `src/citations.ts:queryOpenAI` |
| Perplexity querying (Sonar, web-grounded) | Live | `src/citations.ts:queryPerplexity` |
| Gemini querying (web-grounded via googleSearch tool) | Live | `src/citations.ts:queryGemini` |
| Claude querying (training-only, labeled honestly) | Live | `src/citations.ts:queryClaude` |
| Citation tables (`citation_keywords`, `citation_runs`, `citation_snapshots`) | Live | `migrations/0013_citation_tracking.sql` |
| Grounding mode column (web vs training, per run) | Live | `migrations/0044_citation_grounding_mode.sql` |
| Sentiment scoring (Claude Haiku per cited response) | Live | `src/sentiment-scorer.ts`, `migrations/0052_citation_sentiment.sql` |
| Negative-mention monitor (defensive framing) | Live | `src/routes/citations.ts` |
| Citation lift attribution (90-day windowed comparison) | Live | `src/citation-lift.ts` |
| Citation drift detection (quarterly) | Live | `src/citation-drift.ts` |
| Reddit citation extraction | Live | `src/reddit-citations.ts` |
| Competitor schema (`is_competitor` flag on `domains`) | Live | `migrations/0001_initial.sql` |
| Weekly brief generator (Claude-drafted from citation data) | Live | `src/weekly-brief-generator.ts` |
| Email delivery (Resend) | Live | `src/email.ts` |
| Daily + weekly cron infrastructure | Live | `src/cron.ts` |
| Print-styled HTML reports (browser print to PDF) | Live | `src/routes/report.ts`, `src/routes/domain.ts` |

**Net-new build for NVI:**
- Google AI Overviews ingestion (no native API, requires DataForSEO/SerpAPI integration)
- AI Presence Score formula
- Per-client monthly snapshot with insight + action draft
- Branded PDF rendering (we have HTML print, not programmatic PDF)
- Competitor parallel-prompt querying for NVI Full
- Source attribution roll-up for NVI Full
- Monthly delivery cron + email template

The existing dashboard's "weekly brief" is the closest cousin to NVI. NVI is essentially: same citation data, scored and packaged differently, delivered as PDF instead of dashboard view, with competitive layer added in Full.

---

## How NVI fits

NVI is the third layer of a coherent grading story we already tell. Customers should not have to learn three separate score scales to understand their progress. Each of the three measures a different question along the same causal chain.

### The three layers (input → potential → outcome)

```
Schema-grader  ─────► AEO Readiness Score  ─────►  AI Presence Score (NVI)
(per-schema)         (per-domain, per scan)         (per-client, per month)
0-100, deploy=60     0-100, A-F band                0-100, A-F band
```

| Layer | What it measures | When it runs | Where it lives | Who sees it |
|---|---|---|---|---|
| **Schema-grader** | Quality of each individual JSON-LD block we deploy. *"Is this one schema well-formed and complete?"* | At deploy time + lazy re-grade on view | `packages/aeo-analyzer/src/schema-grader.ts` | Internal admin (`/admin/inject/<slug>`); blocks deployment below 60 |
| **AEO Readiness Score** | Whether the site overall is structured for AI engines to cite. *"Could we be cited if asked?"* | Weekly scan (Mondays 6am UTC) | `packages/aeo-analyzer/src/score.ts` | Customer (dashboard `/domain/<id>`); main marketing-facing score |
| **AI Presence Score (NVI)** | Whether AI engines actually do cite us. *"Are we being cited when asked?"* | Monthly cron + on-demand | `dashboard/src/nvi/score.ts` (new) | Customer (PDF report, monthly email) |

### The causal chain

This is the story we should tell in onboarding, in the dashboard, and in the NVI report itself:

> **Quality schemas (schema-grader) → strong AEO Readiness (scan score) → high AI Presence (NVI).**
>
> If your schemas score well individually but your AEO Readiness is low, you're missing schema *types* (you have good `Organization` schema but no `LocalBusiness`, `FAQ`, `BreadcrumbList`). The schema-grader doesn't know what's missing; the AEO Readiness scan does.
>
> If your AEO Readiness is high but your AI Presence is low, you're set up to be cited but the engines aren't picking you up yet. That's a content / authority / time problem, not a structure problem. The NVI report names which prompts are losing and what to do about each.
>
> If your AI Presence is high but your AEO Readiness has slipped, you've earned citations on past structure but the foundation is now weakening. NVI catches this before citations actually drop, because Readiness is a leading indicator of Presence.

### Grade band alignment (use the same A-F across all three)

To avoid the customer having to learn three scales, all three scores use the same letter grades and the same band thresholds:

| Score range | Grade | Schema-grader meaning | AEO Readiness meaning | AI Presence (NVI) meaning |
|---|---|---|---|---|
| 90-100 | **A** | Green zone, deploy-ready, near-complete | Cite-ready, AI engines confidently use you | AI engines reliably name you for relevant queries |
| 75-89 | **B** | Strong, minor recommended fields missing | Strong foundation, specific gaps remain | Strong presence with specific prompt gaps |
| 60-74 | **C** | Deploy threshold, gold zone, flagged for review | Visible but not first-choice source | Inconsistent. Visible in some engines, missing in others |
| 40-59 | **D** | Below deploy threshold, blocked | Real structural problems | Underrepresented. Most queries return competitors |
| 0-39 | **F** | Critical issues, do not deploy | AI engines cannot parse you well enough to cite | Largely invisible to AI engines for these prompts |

(NVI Lite uses 80 as the A threshold to align with `gradeBucket()` in `schema-grader.ts`. We can ship one consistent grade-band helper if useful — see "Shared grading utility" below.)

### Where the scores cross-reference each other

In the NVI PDF report:
- Header shows the AI Presence Score (NVI's own score, prominently)
- Methodology footer says "Your AEO Readiness Score from this month's scan was X/100. AEO Readiness predicts AI Presence with a typical 1-3 month lag while AI engines absorb structural changes."
- If Readiness > Presence by 20+ points: an extra callout in the report explains that recent structural improvements haven't been absorbed yet, this is expected, momentum is good
- If Presence > Readiness: a different callout flagging that the foundation needs reinforcement before the citations slip

In the dashboard:
- Add a small badge on the AEO Readiness Score showing "AI Presence: B (76)" once NVI is active for the client, with a click-through to the latest NVI report
- The "Score Projection" widget already shows what completing roadmap items would push AEO Readiness to. Extend it to also project the typical AI Presence lift that comes downstream (e.g., "Completing Phase 2 typically raises AI Presence by 8-15 points within 60-90 days based on baseline data once we have a real lift study")

### Shared grading utility

To keep the band logic from drifting across the three systems, refactor a single `gradeBand(score: number) -> {grade, label, color}` into a shared util `packages/aeo-analyzer/src/grade-bands.ts` and import from all three call sites. This is a 1-hour task and worth doing as part of NVI Phase 2 to avoid having three slightly different A/B/C/D/F definitions.

### Implications for the customer story

- **One vocabulary.** A B+ on schema-grader, a B on Readiness, and a B on NVI all mean the same band of quality. Customers learn it once.
- **Honest causal model.** When NVI score moves, we can point at whether the cause was upstream (schema-grader / Readiness improvements rolling forward) or external (a competitor's drop, an engine algorithm change, a new prompt category emerging). Customers stop assuming everything is our fault and stop assuming everything is to our credit.
- **Tier ladder maps to score depth.** Audit gives you the schema-grader breakdown and the first AEO Readiness scan. Signal adds weekly Readiness and ongoing schema deploys. Amplify adds NVI Full with monthly Presence tracking. Each tier earns access to a deeper layer of the same coherent measurement system.

---

## API research

### 1. OpenAI (ChatGPT)

**Status:** Production-ready. Already integrated.

- **Model:** `gpt-4o-mini-search-preview` with `web_search_options: {}` enables web-grounded responses with `annotations` containing source URLs and titles.
- **Cost:** ~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens. Average citation query: ~500 input + 1500 output tokens = **~$0.001 per query**.
- **Rate limits:** Tier-1 paid = 500 RPM. Plenty for our scale (10 prompts × N clients monthly).
- **Citations format:** Returned in `message.annotations[].url_citation` with `url`, `title`, `start_index`, `end_index` (where in the response the citation appears).
- **Caveats:** `gpt-4o-mini-search-preview` has been stable since mid-2025. OpenAI may rename or deprecate. Not something to architect around but worth a yearly check.

**Verdict:** No work needed. Already wired.

### 2. Perplexity

**Status:** Production-ready. Already integrated.

- **Model:** `sonar` (always grounded), `sonar-pro` for deeper reasoning (more expensive).
- **Cost:** sonar = $1/M input + $1/M output. ~500 in + 1500 out per query = **~$0.002 per query**. Sonar-pro = ~$0.005-0.010 per query.
- **Rate limits:** 50 RPM on default tier, scales with usage.
- **Citations format:** Returned in `citations[]` array with URL strings (no titles natively, fetch for titles separately if needed).
- **Caveats:** Perplexity changes their model lineup more often than OpenAI. Sonar-small was deprecated in Q4 2025. Stay on default `sonar` or `sonar-pro`.

**Verdict:** No work needed. Already wired.

### 3. Google AI Overviews

**Status:** Net-new build required. NO direct Google API.

This is the hardest piece. Google does not expose AI Overviews via API and AI Overview content is rendered conditionally based on query, geography, signed-in state, and dozens of opaque factors.

**Three viable options, ranked:**

#### a. DataForSEO SERP API (recommended)
- Largest provider with most reliable AI Overview field extraction.
- Pricing tiers:
  - **Live mode** (synchronous): $0.0006/SERP. ~1.5s response time.
  - **Standard mode** (queued, batch): $0.0003/SERP. ~30s-5min queue.
  - **Live AI Overview-only**: $0.001/SERP, only returns if AI Overview is present.
- **AI Overview data:** returned in `items[]` with type `"ai_overview"`, includes the rendered text plus `references[]` for cited sources.
- **Geography:** can specify location_code (e.g., 1023295 for Hawaii). Critical for local-business clients.
- **Pros:** Most mature, best documented, predictable pricing. Used by major SEO platforms (Semrush, Ahrefs partially under the hood).
- **Cons:** Vendor lock-in. AI Overview presence is non-deterministic, so we may pay for queries that don't return one (Google decides per-query whether to render an AI Overview).

#### b. SerpAPI
- Similar pricing (~$0.001/search), slightly less reliable AI Overview extraction (intermittent gaps in 2025).
- Better DX (cleaner SDK), worse uptime in our experience.
- Same geography support.

#### c. Bright Data SERP API
- $0.005/search. Premium tier.
- Most accurate but 5-10x more expensive. Not justified for our volume.

#### d. Self-scraping (DO NOT)
- Direct scraping of Google SERPs is against TOS, rate-limited aggressively, and breaks weekly. Not viable for a productized recurring report.

**Recommendation:** **DataForSEO SERP API in Live mode** for monthly snapshots. ~$0.018/client/month at 30 queries (10 prompts × 3 engines, but this is the Google-only line so 10 queries → $0.006). Cheap. Reliable. The gold standard right now.

**Caveat to flag in the report:** AI Overviews don't fire on every query. If Google decides not to render one for a given prompt, we report "Not surfaced this month" rather than "0 citations." That distinction matters for the customer's mental model.

### 4. Other engines (assessment)

| Engine | Worth tracking for NVI? | Why |
|---|---|---|
| **Gemini** | **Yes, included** | Already wired. ~$0.075/M input tokens (cheapest of the four). Real and growing share. |
| **Claude** | **No** for NVI. | API has no web tool. Training-data-only responses are months stale. We track it in dashboard with honest "training" label, but it has no place in a *monthly visibility report* claiming to measure current AI behavior. |
| **Grok** (xAI) | **Defer.** | API exists but discovery share is <2%. Quality of citations is questionable. Not worth complicating the report unless a client specifically asks. |
| **Microsoft Copilot** | **No.** | Already deliberately killed in our roadmap (see `ROADMAP.md` Phase 2B). Productivity layer, not a discovery engine. ~3% market share in business discovery. |

**Final engine list for NVI:**
- ChatGPT (OpenAI web-grounded)
- Perplexity (Sonar)
- Gemini (with googleSearch tool)
- Google AI Overviews (via DataForSEO)

Three "answer engine" engines plus the AI search surface that sits above traditional Google results. This is the right honest set for a monthly visibility report.

---

## Data pipeline

### Architecture overview

```
Monthly cron (1st of month, 6am UTC)
   |
   v
For each client with NVI subscription:
   |
   v
Run prompts × engines (10 × 4 for Lite, 25 × 4 for Full)
   |
   v
For NVI Full: run same prompts × competitors (25 × 4 × 3)
   |
   v
Score sentiment on each cited response (existing sentiment-scorer)
   |
   v
Compute AI Presence Score
   |
   v
Generate insight + action draft (Claude API)
   |
   v
Render PDF (Cloudflare Browser Rendering)
   |
   v
Email PDF to client via Resend
   |
   v
Archive PDF in R2, log to nvi_reports table
```

### Data model

Extends existing `citation_keywords` and `citation_runs`. New tables:

```sql
-- 0053_nvi_subscriptions.sql
-- One row per client per tier. Marks who gets NVI and which tier.
CREATE TABLE nvi_subscriptions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug     TEXT NOT NULL UNIQUE,
  tier            TEXT NOT NULL,             -- 'lite' | 'full'
  active          INTEGER NOT NULL DEFAULT 1,
  delivery_email  TEXT NOT NULL,             -- where the PDF goes
  delivery_day    INTEGER NOT NULL DEFAULT 1, -- day of month (1-28)
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  paused_at       INTEGER
);

-- 0053_nvi_reports.sql
-- One row per client per monthly run. Stores the score + insight,
-- with a pointer to the rendered PDF in R2.
CREATE TABLE nvi_reports (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug        TEXT NOT NULL,
  reporting_period   TEXT NOT NULL,            -- 'YYYY-MM'
  tier               TEXT NOT NULL,
  ai_presence_score  INTEGER NOT NULL,         -- 0-100
  prev_score         INTEGER,                  -- last month's score for delta
  prompts_evaluated  INTEGER NOT NULL,
  citations_found    INTEGER NOT NULL,
  insight            TEXT NOT NULL,            -- AI-drafted, human-approved
  action             TEXT NOT NULL,            -- AI-drafted, human-approved
  pdf_r2_key         TEXT,                     -- key in R2 bucket
  pdf_url            TEXT,                     -- signed URL for download (24h)
  status             TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'sent' | 'failed'
  generated_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  approved_at        INTEGER,
  sent_at            INTEGER,
  approver_user_id   INTEGER,
  UNIQUE(client_slug, reporting_period)
);

CREATE INDEX idx_nvi_reports_status ON nvi_reports(status, generated_at DESC);

-- 0053_nvi_competitors.sql
-- For NVI Full: 2-3 competitors tracked per client. The same prompts
-- get run against the competitor names so we can show parallel
-- citation rates.
CREATE TABLE nvi_competitors (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  client_slug     TEXT NOT NULL,
  competitor_name TEXT NOT NULL,
  competitor_url  TEXT,
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(client_slug, competitor_name)
);
```

Existing `citation_keywords` already stores per-client prompts. NVI subscriptions just point to the existing keyword set. No need for `nvi_prompts` — we reuse what's there.

Existing `citation_runs` stores per-engine results. We extend by adding a `report_id` foreign key (optional) so a citation_run can be associated with a specific monthly NVI report:

```sql
-- 0054_citation_runs_report_link.sql
ALTER TABLE citation_runs ADD COLUMN nvi_report_id INTEGER REFERENCES nvi_reports(id);
CREATE INDEX idx_citation_runs_report ON citation_runs(nvi_report_id);
```

### Scheduling

Add to existing daily cron (`runDailyTasks` in `src/cron.ts`):

```ts
const today = new Date().getUTCDate();
const subs = await env.DB.prepare(
  "SELECT * FROM nvi_subscriptions WHERE active=1 AND delivery_day = ?"
).bind(today).all();
for (const sub of subs.results) {
  ctx.waitUntil(runMonthlyNviReport(sub, env));
}
```

Each report run is async and isolated. Cloudflare Workflows are a candidate for the per-report execution since it involves multiple slow API calls (~30-100 queries) plus PDF render plus email send. Treat each NVI report as one workflow instance per client per month, similar to existing `ScanDomainWorkflow`.

### Query flow per report

For NVI Lite (10 prompts, 1 client, no competitors):

```
For each of 10 prompts:
  For each of 7 engines (ChatGPT, Perplexity, Claude, Gemini, Microsoft Copilot, Google AI Overview, Gemma):
    Run the query
    Store response in citation_runs with nvi_report_id
    Detect client mention -> set client_cited
    Score sentiment if cited (existing sentiment-scorer)
    Extract source attribution (URLs cited by the engine)

Total: 70 queries per report. Cost: ~$0.18. Time: ~5-8min.
```

For NVI Full (25 prompts, 1 client, 3 competitors):

```
Same as Lite but 25 prompts and competitor parallel runs.

Total: 25 × 4 + 25 × 4 × 3 = 400 queries per report. Cost: ~$1.50. Time: ~15min.
```

Both are well within Cloudflare Workflow time limits (15-min steps, multi-step retries).

### Insight + action drafting

After all citation_runs complete, we aggregate the data and call Claude with a structured prompt to generate the one-paragraph insight and the one-line action item. Same pattern as the existing `weekly-brief-generator.ts`.

The output is **always 'pending'**. Lance reviews in the admin queue, approves or edits, *then* the system renders the PDF and sends. This protects clients from any LLM hallucination making it into a customer-facing deliverable.

---

## Scoring logic

### AI Presence Score (0-100)

Weighted composite of four signals. Every component caps so no single dimension can dominate.

```
score = round(
  citation_rate_pts        // up to 40 pts
  + engine_spread_pts      // up to 25 pts
  + prominence_pts         // up to 20 pts
  + sentiment_pts          // up to 15 pts
)
```

#### 1. Citation rate (40 pts max)

% of tracked prompts where the client appears in at least one engine's response.

```
citation_rate = (prompts_cited / prompts_total) × 40
```

If 6 of 10 prompts return at least one citation: `(6/10) × 40 = 24 pts`.

This is the heaviest weight because it's the most fundamental question: *do AI engines name you when asked relevant questions in your category?*

#### 2. Engine spread (25 pts max)

Bonus for appearing across multiple engines. Concentration in one engine = fragile.

```
engine_spread = min(25, engines_with_at_least_one_citation × 6.25)
```

Cited in 1 engine: 6.25 pts. Cited in all 4: 25 pts.

#### 3. Prominence (20 pts max)

Where in the engine's response does the citation appear. AI engines that put you first carry more user-decision weight than ones that mention you last.

For each cited response we extract `position` (1 = first named, 2 = second, etc.) where detectable. Average across all cited responses, inverted.

```
avg_position = mean(positions_across_cited_responses)
prominence = max(0, 20 - (avg_position - 1) × 4)
```

Average position 1 = 20 pts. Position 2 = 16 pts. Position 5 = 4 pts. Position 6+ = 0.

For Google AI Overviews specifically, we use the cited reference's position in the `references[]` array as the proxy.

#### 4. Sentiment (15 pts max)

Sentiment scoring is already built (Claude Haiku per cited response, classifies positive/neutral/negative).

```
sentiment_pts =
  (positive_count / cited_count) × 15
  - (negative_count / cited_count) × 15  // negative subtracts
```

Range clamped to [0, 15]. All-positive = 15. All-negative = 0 (with the negative-mention monitor flagging the issue separately in the alerts section of the report).

### Why this formula

- **Citation rate dominates** because it answers the core question without ambiguity.
- **Engine spread matters** because relying on one AI for all your discovery is structurally weak.
- **Prominence rewards real visibility** over being mentioned in passing.
- **Sentiment is a modifier, not a headline** because we cannot directly move it (per yesterday's product call) and weighting it heavily would make the score punish things outside the customer's control.

### Score interpretation in the report

Uses the unified A-F bands documented in [How NVI fits](#how-nvi-fits). Same scale as schema-grader and AEO Readiness so customers learn one vocabulary.

| Score range | Grade | NVI meaning |
|---|---|---|
| 90-100 | A | AI engines reliably name you for relevant queries |
| 75-89 | B | Strong presence with specific prompt gaps |
| 60-74 | C | Inconsistent. Visible in some engines, missing in others |
| 40-59 | D | Underrepresented. Most queries return competitors instead |
| 0-39 | F | Largely invisible to AI engines for these prompts |

### Month-over-month delta

`prev_score - current_score` shown in the report header. We never lie about direction. If the score drops, the insight section explains why (most often: a competitor improved, or a previously cited prompt stopped surfacing the brand).

---

## PDF generation

### Recommendation: Cloudflare Browser Rendering API

Native to our stack, supports full HTML/CSS, Puppeteer-compatible API, costs ~$0.001 per render.

**Why not other options:**

| Option | Verdict | Reason |
|---|---|---|
| **Cloudflare Browser Rendering** | **YES** | Same runtime as our Workers. Renders HTML to PDF using a managed Chromium. Puppeteer API. ~$0.001/render. No server to maintain. |
| Self-hosted Puppeteer | No | Requires a Node server. Breaks the "Workers-only" stack constraint. Adds a deployment surface. |
| PDFKit (pure Node PDF) | No | Manual layout. No HTML/CSS rendering. Would re-implement design system in PDF primitives. Tedious to keep brand-consistent. |
| react-pdf | No | React-based, needs Node server. Doesn't render arbitrary HTML/CSS — it uses its own primitive component set. |
| WeasyPrint (Python) | No | Breaks JS-only constraint. |
| Third-party (DocRaptor, PDFShift, Anvil) | No | Vendor lock-in. ~$0.01-0.03/PDF (10-30x our preferred cost). Adds another contract to manage. |

### Implementation outline

```ts
// src/nvi/render-pdf.ts
import puppeteer from "@cloudflare/puppeteer";

export async function renderNviPdf(env: Env, reportId: number): Promise<ArrayBuffer> {
  // 1. Render the report HTML using a server-side template
  //    (mirrors the visual language of pitch/blue-note-hawaii)
  const html = await buildNviReportHtml(env, reportId);

  // 2. Spin up a Browser Rendering session
  const browser = await puppeteer.launch(env.BROWSER);
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });

  // 3. Generate PDF with print-friendly margins
  const pdf = await page.pdf({
    format: "Letter",
    printBackground: true,
    margin: { top: "0.5in", right: "0.5in", bottom: "0.5in", left: "0.5in" },
  });

  await browser.close();
  return pdf;
}
```

### Brand template

The HTML template follows Neverranked's existing design system from `pitch/blue-note-hawaii/index.html`:

- Background: `#0a0a0a` (closest practical to spec; pitch pages use `#121212` for slightly less crush)
- Gold accent: `#c9a84c` (matches `--gold-dim`) and `#e8c767` (`--gold` for headers)
- Off-white text: `#f0ece3` (matches `--text-soft`)
- Font stack: Playfair Display (serif headings), DM Mono (body), Barlow Condensed (labels)
- Print CSS: existing pitch pages already have a `@media print` block that converts dark theme to print-safe (light bg, dark text, gold accent retained)

Two render targets:
- **Screen-read PDF** (dark theme, the default email attachment)
- **Print-friendly PDF** (light theme via `@media print`, generated when the customer wants to physically print)

We render dark-theme by default since the customer reads on screen. Add a `?print=1` query param flag to flip to print theme on demand.

### Required Cloudflare config

```jsonc
// wrangler.jsonc additions
"browser": {
  "binding": "BROWSER"
}
```

And `npm install @cloudflare/puppeteer`.

---

## Cost estimates

### Per-client monthly API costs

#### NVI Lite (10 prompts × 4 engines = 40 queries/month, no competitors)

| Component | Cost |
|---|---|
| OpenAI ChatGPT | 10 × $0.001 = **$0.01** |
| Perplexity | 10 × $0.002 = **$0.02** |
| Gemini | 10 × $0.0003 = **$0.003** |
| Google AI Overviews (DataForSEO Live) | 10 × $0.001 = **$0.01** |
| Sentiment scoring (Claude Haiku, ~5 cited mentions/mo avg) | 5 × $0.001 = **$0.005** |
| Insight + action draft (Claude single call) | **$0.01** |
| PDF render (CF Browser Rendering) | 1 × $0.001 = **$0.001** |
| **Total per client per month (Lite)** | **~$0.06** |

#### NVI Full (25 prompts × 4 engines + 25 prompts × 4 engines × 3 competitors = 400 queries/month)

| Component | Cost |
|---|---|
| OpenAI ChatGPT | 100 × $0.001 = **$0.10** |
| Perplexity | 100 × $0.002 = **$0.20** |
| Gemini | 100 × $0.0003 = **$0.03** |
| Google AI Overviews (DataForSEO Live) | 100 × $0.001 = **$0.10** |
| Sentiment scoring (~50 cited mentions/mo across client + competitors) | 50 × $0.001 = **$0.05** |
| Insight + action draft + competitor analysis (Claude calls) | **$0.05** |
| PDF render | **$0.001** |
| **Total per client per month (Full)** | **~$0.53** |

### Scaling

| Clients | Lite total/mo | Full total/mo | Combined (5 Lite + 5 Full) |
|---|---|---|---|
| 1 | $0.06 | $0.53 | $0.30 |
| 5 | $0.30 | $2.65 | $1.48 |
| 10 | $0.60 | $5.30 | $2.95 |
| 25 | $1.50 | $13.25 | $7.38 |
| 50 | $3.00 | $26.50 | $14.75 |

### Margin analysis

| Tier | Customer price | API cost | Effective gross margin |
|---|---|---|---|
| NVI Lite | $300-400/mo (Signal add-on) | $0.06 | >99.9% |
| NVI Full | Bundled in Amplify ($4,500/mo) | $0.53 | n/a (bundled) |

API cost is essentially zero relative to price. Cost will not constrain pricing decisions. The real cost is Lance's time per report (review the AI-drafted insight + action, approve, send). At ~5 min per report, 50 clients = 4 hours/month of human review. That's the meaningful operational cost, not the APIs.

### One-time setup cost

- DataForSEO account: free signup, $1 minimum credit. ~$50 covers ~80,000 queries (multi-year supply at our scale).
- Cloudflare Browser Rendering: included in Workers Paid plan ($5/mo flat) up to 10K requests/day.
- All other engines already have credits in place.

---

## Build plan

### v1 = NVI Lite for Hello Again (fastest path to a working PDF in their inbox)

Phase ordering optimized for fastest demo to a real client. Each phase is self-contained and shippable.

#### Phase 0 — DataForSEO integration (~2 hr)
- Sign up, get API key, add to Worker secrets as `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD`
- Add `queryGoogleAIOverview(keyword, locationCode, env)` to `src/citations.ts` mirroring the existing `queryX` functions
- Returns `{text, citedRefs[], grounded: true}` shape compatible with existing pipeline
- Wire into the existing weekly citation cron so we start collecting Google AI Overview data immediately for all current clients (not just NVI subscribers — collecting now means historical data available when NVI launches)

#### Phase 1 — NVI data model (~1 hr)
- Migration `0053_nvi_subscriptions.sql` (subscriptions + reports + competitors tables)
- Migration `0054_citation_runs_report_link.sql` (FK from citation_runs to nvi_reports)
- Apply locally and remotely, smoke-test with a manual INSERT for Hello Again

#### Phase 2 — AI Presence Score module + shared grade-band utility (~3 hr)
- Refactor: extract `gradeBand(score) -> {grade, label, color, threshold_meaning}` into `packages/aeo-analyzer/src/grade-bands.ts`. Replace inline band logic in three call sites (schema-grader's `gradeBucket`, score.ts's `calculateGrade`, the dashboard's score-rendering helpers). One vocabulary, one source of truth.
- New file `src/nvi/score.ts`
- Single function `computeAiPresenceScore(env, clientSlug, period) -> {score, breakdown, prevScore, grade}`
- Reads from `citation_runs` filtered by `nvi_report_id` (or by date range for the period)
- Returns the four sub-scores plus the composite, plus the previous month's score for delta, plus the grade band via the shared utility
- Unit-testable: feed it a mock set of citation_runs and assert the math

#### Phase 3 — Monthly report runner (~3 hr)
- New file `src/nvi/runner.ts` exposing `runMonthlyNviReport(subscription, env)`
- Loops the prompts × engines, calls existing query helpers, stamps `nvi_report_id` on each citation_run
- Triggers sentiment scoring inline via `ctx.waitUntil(scoreAndUpdateRun(...))`
- After all queries complete, computes the score
- Calls Claude to draft the insight + action (new helper, mirrors `weekly-brief-generator.ts`)
- Inserts a `nvi_reports` row with status='pending'
- Cron wiring in `src/cron.ts`: on the 1st of each month, find subs with `delivery_day=1` and dispatch a workflow instance per sub

#### Phase 4 — PDF template (~3 hr)
- New file `src/nvi/template.ts` exposing `buildNviReportHtml(env, reportId) -> string`
- HTML template using the dashboard's existing design tokens (--bg, --gold, --text-soft, --serif, --mono, --label)
- Sections (in PDF order): cover, score + delta, engine breakdown, top prompts cited, top prompts NOT cited (the gap list), insight, action, methodology footer
- Inline all CSS for portability (no external font requests in the PDF since Browser Rendering handles fonts at render time)
- Render via `@cloudflare/puppeteer` integration (Phase 5 wires it)

#### Phase 5 — Cloudflare Browser Rendering integration (~2 hr)
- Add `browser` binding to `wrangler.jsonc`
- `npm install @cloudflare/puppeteer`
- New file `src/nvi/pdf.ts` exposing `renderNviPdf(env, reportId) -> ArrayBuffer`
- Upload rendered PDF to R2 bucket, store `pdf_r2_key` on the report row
- Generate signed URL with 24-hour expiry, store on the report row

#### Phase 6 — Admin review + approve flow (~2 hr)
- New route `/admin/nvi/inbox` listing all `pending` reports with the score, insight, action, and a preview link
- Per-report view at `/admin/nvi/:id` with the full PDF preview (iframe or download), the insight + action editable in textareas, and an Approve button
- On approve: status flips to `approved`, `approver_user_id` stamped
- Approve button kicks off the email send

#### Phase 7 — Email delivery (~1 hr)
- New email template in `src/email.ts` for the NVI delivery. Subject: "Your NVI report for [Month YYYY] — [Client Name]". Body: short narrative wrapping the insight + action, with the PDF as attachment AND a link to download (R2 signed URL) for accessibility.
- Use existing Resend integration. Attachment via `attachments` field in the Resend API payload.
- On send success: status flips to `sent`, `sent_at` stamped, `sent_to` logged.

#### Phase 8 — Hello Again test run (~1 hr)
- Manually create the `nvi_subscriptions` row for Hello Again
- Add 10 prompts to `citation_keywords` for them
- Manually trigger `runMonthlyNviReport` via a new admin endpoint `/admin/nvi/run/:slug`
- Watch the run, review the draft, approve, send to your own email first as a smoke test
- Iterate on PDF template based on what looks off
- Once clean, send to Hello Again's actual delivery email

**Total v1 build: ~18 hours of focused work**, spread across 2-3 sessions.

### Phase 4.5 — Cross-system score wiring (~2 hr, can ship after v1 is live)

After NVI Lite is sending real reports, wire the cross-references between the three scores so customers see the coherent story:

- **In the dashboard's domain detail page:** add a small "AI Presence" badge next to the existing AEO Readiness Score, pulling from `nvi_reports` for the latest period. Click-through to the latest PDF (R2 signed URL).
- **In the NVI PDF report's methodology footer:** include the latest AEO Readiness Score from `scan_results` and the explanatory line about the 1-3 month lag.
- **Add a "lag callout" to the report:** if `aeo_readiness_score - ai_presence_score > 20`, render a green callout explaining recent structural improvements haven't been absorbed by AI engines yet, this is expected, momentum is good.
- **Add a "foundation slip callout":** if `ai_presence_score - aeo_readiness_score > 10`, render a yellow callout flagging that the foundation needs reinforcement before citations slip.

### v2 — NVI Full (after Lite is shipped and validated)

Phase order:

1. Competitor parallel-prompt querying (~3 hr) — extend `runMonthlyNviReport` to also run prompts × competitors when subscription tier is 'full'
2. Source attribution roll-up (~2 hr) — aggregate which domains/pages are cited most across the report period, surface in PDF
3. Quarterly trend section (~2 hr) — pull last 3 months from `nvi_reports` and render a trend chart in the PDF
4. Priority fix list (~3 hr) — for the top 3 prompts where competitor is cited and client is not, generate a content/schema recommendation via Claude (uses our existing schema-grader knowledge)

**Total v2 build: ~10 hours.**

### What we deliberately DON'T build in v1

- No client login. The PDF in their inbox is the entire delivery surface.
- No live in-app dashboard for NVI data. The dashboard already shows citation data; the NVI report is the *packaged* monthly view.
- No CSV export. PDF only. We can add CSV later if a client asks.
- No multi-language support. English only at launch.
- No timezone handling beyond UTC. Reports are dated by UTC month.
- No real-time scoring. Report is monthly. If a customer wants live, they get the dashboard.

### Risks and mitigations

| Risk | Mitigation |
|---|---|
| Google AI Overviews are non-deterministic; some queries don't return one | Report it honestly as "Not surfaced this month" rather than counting as zero. Adjusts denominator for engine_spread. |
| LLM hallucination in insight or action | Human-in-the-loop approve flow. Status='pending' until Lance reviews. Never auto-send. |
| Negative sentiment surprises customer who didn't know about it | Use the defensive negative-mention framing we shipped yesterday. Frame as "an alert system catching issues you can address" not "your reputation score." |
| Prompts go stale (industry vocabulary shifts) | Quarterly review of each client's prompt set during the existing Quarterly Refresh cron. Same cadence as the dashboard's existing drift detection. |
| Browser Rendering changes pricing or limits | Could fall back to self-hosted Puppeteer in a Workers Container or external service. Migration is ~4 hours if needed. Not worth pre-architecting around. |
| Sample sizes too small for confident scoring (especially competitor comparison in Full) | Apply the same n>=10 sample-size discipline already used for sentiment. Below threshold, label as "Building baseline" and skip the percentage display. |

### Definition of Done for v1

- [ ] Hello Again receives a real PDF NVI Lite report by email on the 1st of the month (or manual trigger today, then auto-trigger May 1)
- [ ] Report renders in dark theme with brand colors and fonts correctly
- [ ] AI Presence Score is computed from real citation data for Hello Again
- [ ] Score, insight, and action all reflect actual findings (no Lorem Ipsum, no test data)
- [ ] Lance approved the insight + action before send
- [ ] Report archived in R2, retrievable via signed URL
- [ ] Subscription record exists with `delivery_day=1` so next month's run is automatic
- [ ] Internal `nvi_reports` table has the row with `status='sent'` and `sent_at` populated
- [ ] No email rendering issues across Gmail, Outlook, Apple Mail (test all three before declaring done)

---

## Appendix: file structure

```
dashboard/src/
  nvi/
    runner.ts          // monthly report runner
    score.ts           // AI Presence Score formula
    template.ts        // HTML template for the PDF
    pdf.ts             // CF Browser Rendering wrapper
    insight.ts         // Claude draft of insight + action
    email.ts           // Resend send with PDF attachment
  routes/
    admin-nvi.ts       // /admin/nvi/inbox + /admin/nvi/:id
  citations.ts         // EXTEND: add queryGoogleAIOverview()

dashboard/migrations/
  0053_nvi_subscriptions.sql
  0054_citation_runs_report_link.sql
```

R2 bucket layout:
```
nvi-reports/
  {client_slug}/
    {YYYY-MM}.pdf      // primary delivery file
```

---

## Appendix: open questions for Lance

These are decisions that should be made before Phase 0 starts:

1. **Delivery cadence anchor.** First day of the month UTC? First day of the month in client's local time? My lean: first weekday of the month so the report doesn't land on a weekend. Easy to mis-spec, hard to change once clients expect it.

2. **Branding on the PDF.** Pure Neverranked? Co-branded "Powered by Neverranked" with the client's logo on top? My lean: pure Neverranked, since the report's authority comes from us being the analyst. Client logo can appear smaller in the metadata block.

3. **What happens when a client churns mid-month?** Do they get the partial-month report at the next delivery? Do we kill the subscription immediately? My lean: send the final report covering through their cancellation date, then deactivate. Goodwill move that costs us ~$0.06.

4. **Prompt approval flow during onboarding.** Do we suggest 10 prompts, client approves, locks them for 90 days? Or do we let them edit any time? My lean: lock for 90 days so trend lines mean something. Quarterly review allows changes, same as dashboard roadmap items.

5. **Pricing on NVI Lite.** $300-400 is the spec range. Where do we land? My lean: $349 — high enough to feel premium, low enough that it's an obvious upsell from Signal at $2,000. Avoids $300 (feels cheap) and $400 (round numbers feel less considered).

These don't block the build but should be answered before the first real client is on the subscription.

---

**End of spec. Build can begin.**
