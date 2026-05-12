#!/usr/bin/env bash
#
# scripts/check-kv-list-usage.sh
#
# Guard against the KV.list pagination bug. Fails CI / voice-check
# when raw env.LEADS.list({ prefix }) calls appear outside the
# approved helper modules.
#
# Why: Cloudflare KV's list() returns the alphabetically-first 1000
# keys per call. With epoch-prefixed keys this is the OLDEST 1000.
# Past 1000 total keys, an un-paginated call hides the newest events.
# This caused /admin/free-check and the daily 7am admin email to show
# 3-day-old data while real-time activity kept landing in KV.
#
# The fix is to use listAllKeys/countKeys from lib/kv-paginate.ts
# (dashboard worker) or the listAllKvKeys helper in
# tools/schema-check/src/index.ts (schema-check worker).
#
# This script greps the repo for the dangerous pattern and reports
# any new instances. Approved usage in the helper modules themselves
# is exempted via filename.
#
# Run manually:
#   bash scripts/check-kv-list-usage.sh
#
# Wire into pre-commit / CI:
#   - Already invoked by scripts/voice-check.sh
#   - Add to .github/workflows/* once CI is set up

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Search both workers' src trees. Exclude the helper modules
# themselves (they're the approved place to call .list raw) and
# build artifacts.
EXCLUDED_FILES=(
  "dashboard/src/lib/kv-paginate.ts"
  "tools/schema-check/src/index.ts:listAllKvKeys"
)

MATCHES=$(grep -rn -E "LEADS\.list\s*\(" \
  --include="*.ts" \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=dist \
  --exclude-dir=.claude \
  dashboard/src tools/schema-check/src 2>/dev/null || true)

# Filter out approved patterns:
#   - the kv-paginate.ts helper module itself
#   - the listAllKvKeys helper function inside schema-check's index.ts
#   - lines that explicitly pass a cursor (proper pagination via
#     do...while loop), which is the correct pattern
FILTERED=$(echo "$MATCHES" \
  | grep -v "kv-paginate.ts" \
  | grep -v "listAllKvKeys" \
  | grep -v "cursor" \
  || true)

if [ -z "$FILTERED" ]; then
  echo "OK: no raw LEADS.list({ prefix }) calls outside approved helpers"
  exit 0
fi

echo "FAIL: raw LEADS.list({ prefix }) call found outside the approved helper modules."
echo ""
echo "Offending lines:"
echo "$FILTERED"
echo ""
echo "Fix: replace with listAllKeys() or countKeys() from"
echo "  dashboard/src/lib/kv-paginate.ts (dashboard worker)"
echo "  or listAllKvKeys() in tools/schema-check/src/index.ts (schema-check worker)."
echo ""
echo "See lib/kv-paginate.ts for the bug this prevents."
exit 1
