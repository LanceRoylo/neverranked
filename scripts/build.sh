#!/usr/bin/env bash
#
# build.sh — Sync the curated public files from the repo root into ./dist/
# so `wrangler deploy` ships the latest homepage, blog posts, etc.
#
# Runs in CI (.github/workflows/deploy.yml) and can be run locally before
# a manual `wrangler deploy`.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"

mkdir -p "$DIST"

# Pitch ship-gate (advisory, non-fatal): a pitch/<slug>/ that is
# untracked or dirty will NOT deploy from CI (CI builds the committed
# tree). Warn loudly in the deploy log instead of silently 404'ing.
# Never aborts the build — an unrelated homepage/blog deploy must not
# be blocked by a half-finished pitch draft.
if [ -x "$ROOT/scripts/check-pitch-deploys.sh" ]; then
  "$ROOT/scripts/check-pitch-deploys.sh" || true
fi

# Root files that make up the public site
FILES=(
  index.html
  citation-demo.mp4
  404.html
  og.jpg
  og-source.html
  favicon.ico
  favicon.png
  robots.txt
  sitemap.xml
  llms.txt
  _headers
  _redirects
)

# Public folders — each is rsync'd into dist/ preserving structure
DIRS=(
  .well-known
  about
  agencies
  atlas-preview
  blog
  case-studies
  claims
  example-engagement
  first-30-days
  for-agencies
  kit
  methodology
  pitch
  principles
  privacy
  profile
  retraction
  schemas
  security
  standards
  state-of-aeo
  takedowns
  teardowns
  terms
  thanks
  vs
  # teardowns/ added 2026-05-23 — bank-honolulu populated from the
  # first 7-engine measurement runs. Future teardowns ship under
  # /teardowns/<slug>/ following the same template pattern.
)

echo "Building dist/ from repo root…"

for f in "${FILES[@]}"; do
  if [ -f "$ROOT/$f" ]; then
    cp "$ROOT/$f" "$DIST/$f"
    echo "  file  $f"
  else
    echo "  skip  $f (not in repo root)"
  fi
done

# Clean up stale assets that have been replaced.
# og.png was swapped to og.jpg in May 2026; remove the stale PNG if present.
if [ -f "$DIST/og.png" ]; then
  rm -f "$DIST/og.png"
  echo "  remove dist/og.png (replaced by og.jpg)"
fi

# Regenerate /claims/ from the claims registry (single source of truth) so the
# public ledger can never silently drift from the measured data. Runs only when
# the measurement repo is present (local builds, not CI); the committed page is
# used as-is otherwise. Writes via a temp file so a failed run never truncates
# the live page. Non-blocking.
CLAIMS_GEN="$ROOT/../neverranked-outreach/dryrun/forensic/claims-ledger.mjs"
if [ -f "$CLAIMS_GEN" ]; then
  if node "$CLAIMS_GEN" > /tmp/nr-claims.html 2>/dev/null && [ -s /tmp/nr-claims.html ]; then
    cp /tmp/nr-claims.html "$ROOT/claims/index.html"
    echo "  regen claims/index.html from claims-registry.mjs"
  else
    echo "  ⚠ claims regen skipped/failed, using committed page"
  fi
fi

for d in "${DIRS[@]}"; do
  if [ -d "$ROOT/$d" ]; then
    # Exclude internal working folders from public deploy:
    #  _data        — citation tracking screenshots, raw results JSON
    #  _engagement* — engagement config (client metadata)
    #  _meta        — internal notes
    rsync -a --delete \
      --exclude='_data' \
      --exclude='_engagement*' \
      --exclude='_meta' \
      --exclude='.DS_Store' \
      "$ROOT/$d/" "$DIST/$d/"
    echo "  dir   $d/  (internal _data, _engagement, _meta excluded from deploy)"
  else
    echo "  skip  $d/ (not in repo root)"
  fi
done

# Teardown drift check — non-blocking. Runs only when the measurement repo
# and its local run data are present (i.e. local builds, not CI). Warns if a
# published teardown's numbers have drifted from current tooling, so a stale
# page is caught before you deploy. Never fails the build.
DRIFT="$ROOT/../neverranked-outreach/dryrun/forensic/teardown-drift.mjs"
if [ -f "$DRIFT" ]; then
  echo ""
  if node "$DRIFT" > /tmp/nr-teardown-drift.out 2>/dev/null; then
    echo "✓ teardown drift check: no material drift."
  else
    echo "⚠️  TEARDOWN DRIFT DETECTED before deploy:"
    grep "DRIFT  " /tmp/nr-teardown-drift.out || true
    echo "    Re-publish flagged pages from teardown-data.mjs, then update the drift registry."
  fi
fi

echo "Build complete. Deploy with: npx wrangler deploy"
