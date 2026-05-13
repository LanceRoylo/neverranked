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
)

# Public folders — each is rsync'd into dist/ preserving structure
DIRS=(
  about
  agencies
  blog
  case-studies
  for-agencies
  kit
  pitch
  principles
  privacy
  profile
  schemas
  security
  standards
  state-of-aeo
  terms
  thanks
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

echo "Build complete. Deploy with: npx wrangler deploy"
