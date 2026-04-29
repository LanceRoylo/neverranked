# NeverRanked Roadmap

Source of truth for what's shipped, what's deferred, and why. Maintained alongside the codebase so future-Lance (and any contractor) can pick up without rereading every commit.

Last updated: 2026-04-29

---

## Shipped phases

### Phase 1 — Schema quality grader + citation lift outcome tracking
Empirical research (730-citation study): partial / generic schema produces an 18-percentage-point citation penalty vs no schema at all. The grader scores JSON-LD per type with required + recommended field manifests and blocks deployment under 60. Citation lift tracking compares a client's citation share before vs after engagement start, with low-confidence flagging when sample &lt; 50.

Files: `dashboard/src/schema-grader.ts` (re-export), `packages/aeo-analyzer/src/schema-grader.ts`, `dashboard/src/citation-lift.ts`, migration `0042_schema_quality.sql`, `0043_engagement_baseline.sql`.

### Phase 2A — Web-grounded citation engines
Three engines moved from training-data-only to live web-grounded queries:
- Perplexity: `sonar` (always grounded)
- OpenAI: `gpt-4o-mini-search-preview` with `web_search_options: {}`
- Gemini: `gemini-2.5-flash` with `tools: [{ googleSearch: {} }]`

Anthropic stays training-data-only (no web tool exposed in their public API yet) and is labeled as such in the dashboard. Each `citation_runs` row carries a `grounding_mode` column ('web' or 'training') so we can filter the dashboard view honestly.

Files: `dashboard/src/citations.ts`, migration `0044_citation_grounding_mode.sql`.

### Phase 3 — Quarterly roadmap refresh from citation drift
Per CMU GEO research, AEO strategies need re-evaluation every 60-90 days as AI models retrain. The drift detector compares two consecutive 90-day windows and surfaces:
- New competitors (delta &ge; 2 citations OR &ge; 1.5x)
- Lost keywords (client cited then, not now)
- Emerging gaps (someone got cited recently in a window where neither side had presence before)

Self-throttling daily cron only fires the expensive drift detection on clients past their 90-day threshold. Refresh items dedupe by exact title match.

Files: `dashboard/src/citation-drift.ts`, `dashboard/src/roadmap-refresh.ts`, migration `0045_roadmap_refresh.sql`.

### Phase 4A — Authority signals (trust profiles + named-author audit)
CMU GEO research: brands with at least one tier-1 review profile linked from their site see ~3x AI citation lift. Named-author content sees ~2.3x. The scanner now detects:
- `<meta name="author">` and schema.org `Person` nodes
- Outbound links to G2, Trustpilot, Capterra, Yelp, BBB, Google Business, Glassdoor, Clutch

Per-client matrix at `/trust/<slug>`. Roadmap items fire after &ge;5 scans (no false-negative spam on brand-new sites). Diagnostic at `/admin/authority-verify/<domain_id>`.

Files: `packages/aeo-analyzer/src/extract.ts`, `packages/aeo-analyzer/src/signals.ts`, `dashboard/src/authority-signals.ts`, `dashboard/src/routes/trust.ts`, migration `0046_trust_profiles.sql`.

### Phase 5 — Reddit citation tracking + presence audit
Reddit threads are one of the heaviest non-corporate citation sources for Perplexity / ChatGPT / Gemini, especially for "best X for Y" comparison queries. Every weekly citation run now extracts reddit.com thread URLs from `cited_urls`, joins them to whether the client was named in the same response, and surfaces the absence-gap-sorted view at `/reddit/<slug>`.

Roadmap items fire when &ge;3 competitor citations exist in a subreddit and the client has zero presence (gated behind &ge;10 total reddit citations). Backfill at `/admin/reddit-backfill/<slug>`.

Files: `dashboard/src/reddit-citations.ts`, `dashboard/src/routes/reddit.ts`, migration `0047_reddit_signals.sql`.

### Phase 6A — Industry benchmarks
A client's AEO score is contextless without an industry baseline. Clients are tagged with an industry (manual admin field, no LLM auto-classification because false confidence is worse than no number). Nightly cron computes p25/p50/p75/p90 per industry across the latest scan + citation snapshot per tagged client. `/benchmark/<slug>` renders percentiles for AEO score, citation share, and industry-mean schema coverage.

**Sample-size discipline:** industries with n &lt; 5 are hidden entirely (rows are deleted to avoid stale data resurfacing). We do not quote a percentile against 2-3 peers. Recompute on demand at `/admin/benchmark-recompute`.

Files: `dashboard/src/industry-benchmarks.ts`, `dashboard/src/routes/benchmark.ts`, migration `0048_industry_benchmarks.sql`.

### Phase 6B — Public schema scorer
Single-purpose endpoint at `check.neverranked.com/api/schema-score` for the 18pp partial-schema citation-penalty story. POST a URL, get per-JSON-LD-block scores with bucketing (green / gold / red) and an overall score weighted as `0.6*min + 0.4*mean` (a single broken block tanks citations, so the min dominates). Returns a `citation_penalty_pp` estimate (0pp green, 9pp gold, 18pp red). Reuses the dashboard's grader via the shared `aeo-analyzer` package.

Files: `tools/schema-check/src/index.ts`, `packages/aeo-analyzer/src/schema-grader.ts`, `packages/aeo-analyzer/src/index.ts`.

---

## Explicitly killed (not deferred)

### Phase 2B — Microsoft Copilot tracking
Decided 2026-04-29 not to ship.

**Reasoning.** Copilot's discovery share is ~3% of AI-mediated business discovery, well behind ChatGPT (~60%), Perplexity (~15%), Google AI Overviews (~15%), and Gemini (~7%). Copilot is positioned as a productivity layer (summarize my Outlook, draft this Word doc) not a discovery tool. Its web grounding rides on Bing's index, which has ~6% US search share. The one place Copilot matters is internal M365 research grounded on a company's own SharePoint/OneDrive — and your client's marketing schema can't influence what an enterprise buyer's Copilot says about their own internal docs.

For the current client mix (blackoak, hawaii-theatre, montaic, neverranked) and most likely future ICPs, Copilot would be a feature we maintain for completeness, not impact. Listing it in marketing to look thorough is dishonest theater.

**When to revisit.** When we onboard a client whose ICP is heavily Microsoft-aligned (B2B selling into IT / finance / legal / .NET shops / Azure-native teams) AND that client shows real Copilot referral data, add it then. Until then we keep the engine list to the four that move the needle.

**Marketing posture.** Index.html now states the omission explicitly: "Not Copilot, not Brave, not You.com. We track the engines that move the needle and skip the ones that don't." That's distinctive (per Hello Momentum principles: most agencies will list every engine to look thorough; we list the ones that work).

---

## Deferred (not killed) — pending real client demand

### Phase 4B — Trust-profile depth
Right now we detect outbound links to trust platforms but don't scrape the profiles for review counts / star ratings / completeness. Also no Person schema completeness validation (we detect presence; we don't grade against the schema-grader's manifest). Defer until we have a client where review depth matters more than presence.

### Phase 5B — Reddit comment drafts + warm-up workflow
The Reddit dashboard surfaces threads to engage on but doesn't draft comments or manage account warm-up. Both are interesting but smell like agentic-comment-spam if implemented poorly. Defer until we can do it as a "co-pilot for a human practitioner" not "auto-poster."

### Public benchmark widget
Anonymized industry data on the marketing site ("SaaS median AEO score: 64") is a strong lead magnet but only after at least 3-4 industries have stable n &ge; 10. Today we have one taggable industry pool at most. Revisit when the data exists.

### Embedded scorer widget for partner sites
The public schema scorer at `check.neverranked.com/api/schema-score` could be embedded as a widget on agency-partner sites. Requires whitelabel + attribution flow. Wait until a partner asks.

---

## Operational notes

### Migration order
The dashboard D1 migrations run in numeric order via `wrangler d1 migrations apply neverranked-app --remote`. Last applied: `0048_industry_benchmarks.sql`. Always confirm `--local` succeeds first as an SQL syntax check before hitting `--remote`.

### Cron coverage
The 06:00 UTC daily cron in `dashboard/src/cron.ts:runDailyTasks` exercises:
- Onboarding + nurture drip emails
- Stale roadmap item check
- Snippet detection sweep
- Missing-roadmap sweep
- Schema drift sweep (self-throttled, &gt;7d since last check)
- Quarterly roadmap refresh sweep (self-throttled, &ge;90d since last refresh)
- Industry benchmark recompute (Phase 6A)
- Monthly + annual recap emails
- Card expiry warnings
- Free-check-tool benchmark recompute
- Dormancy check-in
- Safety sweeps for content pipeline

Reddit ingest + authority-signal ingest piggyback on the citation run + scan run respectively.

### Verify endpoints (admin-only, useful long-term)
- `GET /admin/authority-verify/<domain_id>` — runs a fresh scan + returns analyzer's authority extraction + ingest results
- `GET /admin/reddit-backfill/<slug>` — backfills last 90d of citation_runs into reddit_citations
- `GET /admin/benchmark-recompute` — runs industry benchmark rollup on demand

### Honest framing
Anywhere the dashboard surfaces a number (percentile, citation share, schema score, lift), the page also explains how it's computed. This is non-negotiable. The empty states do the same work as the populated states. If we can't compute a number honestly we hide it (n &lt; 5 industry pools) rather than ship a number with a disclaimer.
