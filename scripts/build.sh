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
  404.html
  og.png
  og-source.html
  favicon.ico
  favicon.png
  robots.txt
  sitemap.xml
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
  security
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
      "$ROOT/$d/" "$DIST/$d/"
    echo "  dir   $d/  (internal _data, _engagement, _meta excluded from deploy)"
  else
    echo "  skip  $d/ (not in repo root)"
  fi
done

echo "Build complete. Deploy with: npx wrangler deploy"
