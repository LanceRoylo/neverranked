# Citation Tracking System -- Setup Guide

## What's built

The citation tracking system queries Perplexity and OpenAI weekly with your clients' target keywords, tracks which businesses get cited in AI responses, and builds citation share data over time. Fully automated after initial keyword setup.

## Architecture

- **D1 tables**: `citation_keywords`, `citation_runs`, `citation_snapshots`
- **Core engine**: `dashboard/src/citations.ts` (Perplexity + OpenAI API calls, entity extraction, snapshot aggregation)
- **Dashboard UI**: `/citations/:slug` (client view) + `/admin/citations/:slug` (keyword management)
- **Cron**: Runs every Monday at 6am UTC after domain scans, before digest emails
- **Digest emails**: Now include citation share data when available

## Step 1: Set API keys

Run these commands from the dashboard directory:

```bash
cd dashboard
npx wrangler secret put PERPLEXITY_API_KEY
# Paste your Perplexity API key when prompted

npx wrangler secret put OPENAI_API_KEY
# Paste your OpenAI API key when prompted
```

Get keys from:
- Perplexity: https://docs.perplexity.ai (sign up, generate API key)
- OpenAI: https://platform.openai.com/api-keys

## Step 2: Add keywords for a client

### Option A: Dashboard UI (recommended)
1. Log in to app.neverranked.com as admin
2. Go to /admin/citations/{client_slug}
3. Use "Auto-generate keywords with AI" -- enter the client's industry and location
4. Review generated keywords, remove any that are off-target
5. Add custom keywords as needed

### Option B: Manual via D1
```bash
npx wrangler d1 execute neverranked-app --remote --command \
  "INSERT INTO citation_keywords (client_slug, keyword, category, active, created_at) 
   VALUES ('montaic', 'best ski lodge in Montana', 'primary', 1, strftime('%s','now'))"
```

## Step 3: Run first scan (optional)

Don't want to wait until Monday? Use the "Run citation scan now" button on the admin citations page, or wait for the next Monday cron.

## How it works

1. **Perplexity**: Sends keyword as query, gets back response + citation URLs. Matches client domain against cited URLs.
2. **OpenAI**: Sends keyword, gets structured JSON of recommended businesses. Fuzzy-matches client business name against recommendations.
3. **3 runs per keyword per engine** for result stability.
4. **Weekly snapshot** aggregates citation share (% of queries where client was cited), top competitors, per-keyword breakdown, per-engine breakdown.
5. **Digest emails** now include citation share delta and top competitor list.

## Dashboard views

- `/citations/:slug` -- Client-facing. Citation share trend chart, keyword results (cited/not cited), top competitors, engine breakdown.
- `/admin/citations/:slug` -- Admin. Add/remove keywords, bulk add, AI-generate keywords, trigger manual scan.

## Cost estimate

| Clients | Keywords each | Weekly API cost |
|---------|--------------|-----------------|
| 1       | 25           | ~$0.10          |
| 10      | 25           | ~$1.00          |
| 50      | 25           | ~$5.00          |
| 100     | 25           | ~$10.00         |

Perplexity Sonar: ~$0.001/query. OpenAI gpt-4o-mini: ~$0.0004/query.

## Onboarding a new client (full automation flow)

1. Add client domain via admin dashboard (existing flow)
2. Set up injection config with business name/URL (existing flow)
3. Go to /admin/citations/{slug}, enter industry + location, click "Generate"
4. Review keywords, tweak as needed
5. Done. System handles everything from here:
   - Weekly citation scans (Monday 6am UTC)
   - Snapshot aggregation
   - Citation data in digest emails
   - Dashboard auto-updates
