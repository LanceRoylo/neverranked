#!/usr/bin/env bash
#
# verify-engine-coverage.sh
#
# Answers one question honestly: of the 7 AI engines NeverRanked
# claims to measure, how many actually produced citation data in
# production over the last 7 days?
#
# Why this exists: src/citations.ts wires all 7 engine handlers
# into the daily cron's Promise.allSettled batch (verified in code
# 2026-05-21). But each handler is key-gated:
#
#     const runGemma = async () => {
#       if (!env.TOGETHER_API_KEY) return;   <-- silent skip
#       ...
#
# A missing key in the production Worker environment means that
# engine silently produces nothing. No error, no log, no row.
# So "we measure 7 engines daily" is true at the code level and
# true in production IF AND ONLY IF all 7 keys are live.
#
# This script checks the actual citation_runs data. If all 7
# engine names come back with recent rows, the claim is verified.
# If fewer, the claim must be softened to the real number until
# the missing keys are configured.
#
# Run from the dashboard/ directory:
#   bash scripts/verify-engine-coverage.sh
#
# Requires: wrangler authenticated against the neverranked-app D1.

set -euo pipefail

echo ""
echo "=== NeverRanked engine coverage verification ==="
echo "Querying citation_runs for the last 7 days, grouped by engine."
echo ""

QUERY="SELECT engine,
              COUNT(*) AS runs_7d,
              datetime(MAX(run_at), 'unixepoch') AS last_run_utc
       FROM citation_runs
       WHERE run_at > unixepoch() - 7*86400
       GROUP BY engine
       ORDER BY runs_7d DESC;"

echo "$QUERY"
echo ""
echo "--- result ---"
npx wrangler d1 execute neverranked-app --remote --command "$QUERY"

echo ""
echo "=== how to read this ==="
echo ""
echo "The 7 engines the product claims, and the engine string each"
echo "writes into citation_runs.engine:"
echo "  1. Perplexity            -> 'perplexity'"
echo "  2. ChatGPT search        -> 'openai'"
echo "  3. Gemini grounded       -> 'gemini'"
echo "  4. Claude                -> 'anthropic'"
echo "  5. Google AI Overviews   -> 'google_ai_overview' (or 'aio')"
echo "  6. Microsoft Copilot/Bing-> 'bing'"
echo "  7. Gemma                 -> 'gemma'"
echo ""
echo "If all 7 appear above with recent last_run_utc -> the"
echo "'7 engines daily' claim is verified. Leave the public copy"
echo "as-is."
echo ""
echo "If fewer than 7 appear -> the missing engine's API key is"
echo "probably not set in the production Worker environment. Check:"
echo "  npx wrangler secret list"
echo "Expected secrets: PERPLEXITY_API_KEY, OPENAI_API_KEY,"
echo "  GEMINI_API_KEY, ANTHROPIC_API_KEY, TOGETHER_API_KEY,"
echo "  and the DataForSEO credentials for Bing + Google AIO."
echo ""
echo "Until any missing key is configured, soften the public claim"
echo "to the verified number. The honest sentence is 'we measure N"
echo "engines daily' where N is what this query actually returns."
echo "The /methodology/ page already says coverage is reported"
echo "per-engine in every deliverable -- this script is how you"
echo "know the real N."
echo ""
