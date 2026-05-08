# Reverse-Engineer Citations — Design Doc

**Status:** Phase 1 data model shipped (migration 0067). Phase 2 worker
implementation gated on first paying customer with weekly citation
tracking running for 4+ weeks.

## What this is

When a competitor of a tracked client got cited by an AI engine and
the client did not, surface WHY. The output is a customer-facing
teardown of the cited competitor URL with paste-ready instructions
for closing the gap.

## Why it matters

This is the most differentiated feature on the NeverRanked roadmap.
Generic AEO tools tell you "your citation share dropped." NeverRanked
tells you "Bank of Hawaii's Common Questions page has FAQPage schema
answering this exact prompt — here is the JSON-LD they are using and
the four questions they answer that you do not."

Competitors cannot replicate this without:
- Six-engine citation tracking infrastructure
- Per-customer diff jobs running weekly
- A schema-aware page-comparison engine
- The Clarity Principle voice on the customer-facing output

## How it works

### Inputs

1. `citation_runs` row — observation of a competitor cited for a
   prompt the client was NOT cited for.
2. The competitor's cited URL.
3. The client's site map (already present in `monitored_pages`).

### Pipeline

1. **Capture.** Trigger fires when a citation_runs row meets the
   criteria: client_cited = 0, competitor cited, prompt is in the
   client's tracked corpus. Insert row into `competitor_citations`
   with diff_status = 'pending'.

2. **Fetch.** Worker fetches the competitor's cited URL (respecting
   robots.txt). Extracts schema, FAQ entries, headings, and primary
   content block. Cached with 7-day TTL to avoid re-fetching.

3. **Match.** For each finding category, find the closest equivalent
   page on the client's site. Match strategies:
     - URL pattern match (/about → /about, /faq → /faq)
     - Heading similarity (title tags + H1 match)
     - Content topic match (TF-IDF over visible text)
   If no match exists, client_state = 'missing_page'.

4. **Diff.** For each finding category compute the gap:
     - schema_present — competitor has type X, client does not
     - faq_match — competitor has Q answered, client does not
     - content_depth — competitor's matching page is N words longer
     - heading_specificity — competitor's H1 contains query terms
     - authority_signal — competitor has byline, citations, or schema
       Person reference; client does not

5. **Recommend.** For each gap, generate a recommended_action in
   the Clarity Principle voice. Layer 1 (outcome) → Layer 2 (where
   to fix it on each platform) → Layer 3 (the JSON-LD or content
   block to deploy).

6. **Score.** Estimate lift in AEO score points based on the
   methodology weights. Surface in dashboard.

### Outputs

The customer dashboard shows a "Reverse Engineer" tab listing all
diff findings sorted by estimated_lift_points DESC. Each finding
expands to:
- The prompt and engine where the citation was lost
- The competitor URL that won the citation
- The specific gap (one sentence)
- The competitor's evidence (their JSON-LD or content block)
- The recommended action (paste-ready fix)
- Estimated lift if shipped

## Anti-patterns

What this feature is NOT:

- **Not a content generator.** We do not auto-write content for
  the client. We surface the gap and recommend the deployment.
  The customer (or NeverRanked Amplify tier) writes.
- **Not a competitor scrape archive.** We fetch only the cited URL
  and only when a citation is observed. We do not crawl
  competitor sites continuously.
- **Not a name-and-shame tool.** Findings reference competitors
  by URL category, not by name in customer-facing copy. "A
  competitor in your category has X" rather than "Bank Y has X."

## Privacy and ethics

- Robots.txt is honored on every fetch
- No private or paywalled content is ever included
- Customer's competitor list is the customer's own input
- We do not surface the same finding to multiple customers (each
  diff is per-client; if two of our customers compete, neither
  sees the other's site analyzed)
- All fetched content is cached for at most 30 days, then purged

## Phase 2 build scope (when triggered)

1. `dashboard/src/competitor-diff.ts` — the diff worker
2. `dashboard/src/routes/reverse-engineer.ts` — customer-facing UI
3. Cron entry that processes pending diffs nightly
4. Dashboard tab + roadmap linkage

Estimated effort when triggered: 2 days.

Trigger condition: First customer with weekly citation tracking
running for 4+ weeks AND citation_runs has logged at least 10
"competitor cited, client not cited" observations on prompts in
the customer's tracked corpus.
