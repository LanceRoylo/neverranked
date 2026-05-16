#!/usr/bin/env bash
#
# check-pitch-deploys.sh — pitch ship-gate.
#
# Catches the two ways a pitch page silently fails to go live:
#   1. Authored but never committed  -> CI builds from the committed
#      tree, so an untracked pitch/<slug>/ never deploys (this is how
#      anthology-finn 404'd, 2026-05-15).
#   2. Committed but not deployed     -> live URL still 404s.
#
# Layers:
#   git layer  (default, no network) — every pitch/<slug>/ (except
#     _meta) must be fully git-tracked with no untracked/modified
#     files.
#   live layer (--live)              — every committed slug must
#     return HTTP 200 at https://neverranked.com/pitch/<slug>/.
#
# Exit:
#   default  — prints PASS/FAIL summary, always exits 0 (advisory).
#   --strict — exits non-zero if any check fails (use as a gate /
#              Step 0 of the pitch pattern).
#
# Usage:
#   scripts/check-pitch-deploys.sh                 # git layer, advisory
#   scripts/check-pitch-deploys.sh --live          # + live 200 check
#   scripts/check-pitch-deploys.sh --live --strict # gate (CI / pre-deploy)

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LIVE=0
STRICT=0
for arg in "$@"; do
  case "$arg" in
    --live)   LIVE=1 ;;
    --strict) STRICT=1 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

BASE_URL="https://neverranked.com/pitch"
fail=0
uncommitted=()
notlive=()

for d in pitch/*/; do
  slug="$(basename "$d")"
  [ "$slug" = "_meta" ] && continue

  # ---- git layer: untracked OR modified files under pitch/<slug>/ ----
  dirty="$(git status --porcelain -- "pitch/$slug/" | head -n1)"
  if [ -n "$dirty" ]; then
    uncommitted+=("$slug")
    fail=1
    continue   # not committed -> CI can't deploy it; live check moot
  fi

  # ---- live layer ----
  if [ "$LIVE" = "1" ]; then
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$BASE_URL/$slug/")"
    if [ "$code" != "200" ]; then
      notlive+=("$slug ($code)")
      fail=1
    fi
  fi
done

echo "── pitch ship-gate ──"
if [ "${#uncommitted[@]}" -gt 0 ]; then
  echo "✗ UNCOMMITTED pitch dirs (authored but will NOT deploy — CI builds the committed tree):"
  i=1; for s in "${uncommitted[@]}"; do echo "  $i. pitch/$s/  → git add + commit pitch/$s/ dist/pitch/$s/"; i=$((i+1)); done
fi
if [ "${#notlive[@]}" -gt 0 ]; then
  echo "✗ COMMITTED but NOT LIVE (deploy never ran or failed):"
  i=1; for s in "${notlive[@]}"; do echo "  $i. $s  → run scripts/build.sh && npx wrangler deploy"; i=$((i+1)); done
fi
if [ "$fail" = "0" ]; then
  if [ "$LIVE" = "1" ]; then echo "✓ all pitch slugs committed and live (HTTP 200)."; else echo "✓ all pitch slugs committed."; fi
fi

if [ "$STRICT" = "1" ]; then
  exit "$fail"
fi
exit 0
