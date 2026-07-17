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
  llms.txt
  _headers
  _redirects
)

# Public folders — each is rsync'd into dist/ preserving structure
#
# PRUNED at the 2026-07-01 go-live cleanup (now 301'd in _redirects, so the
# physical "Page retired" stubs must NOT ship or they'd compete with the
# redirect rules): agencies, blog, case-studies, kit, principles, profile,
# state-of-aeo. Their source dirs remain in the repo for history.
# schemas/ and standards/ stay: they serve intentional noindex retirement
# tombstones (thesis disavowal, commit b7552d9) and must keep resolving.
DIRS=(
  .well-known
  about
  atlas-preview
  claims
  example-engagement
  faq
  first-30-days
  first-look
  for-agencies
  # Vertical entry pages. for-hospitality is the flagship template the other
  # verticals are cloned from; it is linked from the homepage markets rail.
  # A vertical only ships once it has a published teardown behind it -- a
  # vertical page with no measured finding is just an assertion.
  for-hospitality
  for-real-estate
  for-hvac
  # Self-hosted variable fonts (Fraunces/Inter/JetBrains Mono) for the 2026-07
  # "Scorekeeper" design system. Every page's @font-face points at /fonts/*.woff2
  # with a ROOT-ABSOLUTE url so check-internal-links.mjs actually validates it
  # (that checker skips relative links, so a bare "fonts/x.woff2" would 404 in
  # production silently and drop the whole site to the Georgia fallback).
  fonts
  methodology
  pitch
  privacy
  retraction
  schemas
  security
  standards
  takedowns
  teardowns
  terms
  thanks
  vs
  # Per-vertical -aeo landing pages. Shipped + linked from the homepage
  # but were never added here, so the build skipped them and they stayed
  # frozen at their first deploy. Added 2026-06-26 to unfreeze them.
  austin-cpa-aeo
  hawaii-bank-aeo
  hawaii-cpa-aeo
  hawaii-law-aeo
  hawaii-wealth-aeo
  honolulu-dental-aeo
  # teardowns/ added 2026-05-23 — bank-honolulu populated from the
  # first 7-engine measurement runs. Future teardowns ship under
  # /teardowns/<slug>/ following the same template pattern.
  # These four are linked from the homepage "Where to dig in" section but
  # were never in DIRS, so they shipped as a soft-200 homepage fallback
  # (dead links on the primary funnel page). Added 2026-06-29 to unfreeze.
  # Keep this set in sync with .github/workflows/deploy.yml paths.
  directories
  results
  schema-library
  templates
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
    # --checksum: compare by file content, not size+mtime. A length-preserving
    # edit (e.g. a hex color swap #1c1c1e -> #211e18) is byte-identical in size,
    # and on a fresh git checkout all mtimes match, so the default quick-check
    # would silently SKIP content-changed files and ship a stale dist. Checksum
    # is slower but correct; the tree is small.
    #  og.html      — build-time TEMPLATE only. capture-og-pitch.mjs renders it
    #                 locally into og.png; pages reference the .png and nothing
    #                 references the .html. It was shipping anyway, carrying a
    #                 named prospect ("Ellen", "Sean Levy", "Hamada Financial
    #                 Group"...) on a live indexable URL with no robots tag,
    #                 because a 1:1 pitch page's noindex lives in ITS index.html
    #                 and never covered the sibling template. Found 2026-07-16
    #                 by check-noindex.mjs the first time it ran. Excluding beats
    #                 adding noindex: the page has no runtime purpose, and a URL
    #                 that does not exist cannot be indexed by a crawler that
    #                 ignores the tag.
    # --delete-excluded, not just --delete: rsync's --exclude also PROTECTS a
    # matching file already in the destination, so plain --delete leaves stale
    # copies of newly-excluded files sitting in dist/ forever. Without this the
    # og.html exclusion above silently does nothing to the eight already there.
    rsync -a --checksum --delete --delete-excluded \
      --exclude='_data' \
      --exclude='_engagement*' \
      --exclude='_meta' \
      --exclude='.DS_Store' \
      --exclude='og.html' \
      "$ROOT/$d/" "$DIST/$d/"
    echo "  dir   $d/  (internal _data, _engagement, _meta, og.html templates excluded from deploy)"
  else
    echo "  skip  $d/ (not in repo root)"
  fi
done

# ── Generate sitemap.xml from the deployed tree (single source of truth) ──
# Emits every deployed page that is NOT noindex. Held pre-launch pages,
# retired stubs, and private pitch/ pages are noindex; dark pages are absent
# from dist/. All are excluded automatically, so the sitemap cannot drift:
# flip a page to index + rebuild and it appears in the sitemap; nothing that
# should stay hidden ever does. Replaces the old hand-maintained sitemap.xml.
SITEMAP="$DIST/sitemap.xml"
BUILD_DATE="$(date +%F)"
{
  echo '<?xml version="1.0" encoding="UTF-8"?>'
  echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
  while IFS= read -r f; do
    if grep -qi 'content="noindex' "$f"; then continue; fi
    rel="${f#"$DIST"/}"
    urlpath="/${rel%index.html}"
    lastmod="$(git -C "$ROOT" log -1 --date=short --format=%cd -- "$rel" 2>/dev/null || true)"
    [ -z "$lastmod" ] && lastmod="$BUILD_DATE"
    echo "  <url><loc>https://neverranked.com${urlpath}</loc><lastmod>${lastmod}</lastmod></url>"
  done < <(find "$DIST" -name index.html | sort)
  echo '</urlset>'
} > "$SITEMAP"
echo "  gen   sitemap.xml ($(grep -c '<url>' "$SITEMAP" || echo 0) urls; noindex + private excluded)"

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

# ── Internal-link integrity (BLOCKING) ──────────────────────────────────
# Fail the build if any shipped page links to an internal path that does not
# resolve to a real file in dist/. This makes the "linked but frozen" /
# soft-200 homepage-fallback bug (see build_dirs_whitelist_gotcha) impossible
# to ship silently: a dead link now stops the build instead of looking alive.
echo ""
node "$ROOT/scripts/check-internal-links.mjs"

# ── Retracted/retired claim integrity (BLOCKING) ────────────────────────
# Fail the build if a shipped page carries a claim we publicly retracted or a
# product we retired.
#
# Added 2026-07-16 after a sweep found the retracted Hawaii Theatre figures
# ("45 to 95", "14 of 19") live on FIVE pages, including the first-look page
# a customer's counsel was reading, while /retraction/ asserted "The site no
# longer contradicts the retraction." A grader capable of catching this had
# existed for weeks, wired to the cold-email path and never to the website.
# The site had no gate at all.
#
# Costs nothing and calls no API: it is the deterministic half of
# ../neverranked-outreach/lib/output-grader.js applied to shipped HTML, so it
# runs in CI with no key. Strict liability only, never style.
echo ""
node "$ROOT/scripts/check-claims.mjs"

# ── Figure provenance on vertical pages (BLOCKING) ──────────────────────
# Every figure a /for-*/ page prints must appear in a teardown that page
# links to. teardown-drift.mjs above watches whether a teardown still matches
# current tooling; nothing watched whether the MARKETING pages still match
# their teardowns. Re-run teardown 11, let 17% become 19%, and the hospitality
# page silently goes false while every other check stays green.
#
# Also catches hand-transcription: added 2026-07-16 after /for-hospitality/
# was found printing a cohort split that existed only in an HTML comment in
# the teardown source, never in the published page. True, but unverifiable by
# a reader clicking through, which on this site is the same as unsourced.
echo ""
node "$ROOT/scripts/check-figures.mjs"

# ── Lanham guard on the competitive copy (BLOCKING) ─────────────────────
# The Corgi media policy EXCLUDES Lanham Act false advertising, so a claim
# ABOUT a competitor's numbers is the one assertion on this site with no
# insurance behind it. The "who checks the checker" argument is deliberately
# built from facts about NeverRanked alone, because "we never touch your
# site" is checkable and no vendor who ships the work can say it. This keeps
# it that way when a future quarter makes naming someone feel tempting.
echo ""
node "$ROOT/scripts/check-lanham.mjs"

# ── Private-page indexability (BLOCKING) ────────────────────────────────
# The public marketing pages became indexable on 2026-07-16 (they had been
# noindex since the containment era, which meant robots.txt welcomed AI
# crawlers while every page told them to forget what they read). That flip
# creates the opposite and worse risk: a PRIVATE page leaking into an index.
# /pitch/* name real prospects and their competitors; /first-look/* is a
# paying customer's unpublished diagnostic. One of those in Google is a
# relationship incident, not a bug. Asymmetric on purpose: a public page
# getting indexed is a marketing choice, a private one is a breach.
echo ""
node "$ROOT/scripts/check-noindex.mjs"

# ── Bright line #1: no cohort business named on an indexed page (BLOCKING) ──
# The containment doc lists this first: "Naming any non-customer competitor on
# a publicly-indexed page." It was on the honor system until 2026-07-17, and
# the honor system lost: /hawaii-bank-aeo/ named six real Hawaii banks —
# including an active pitch target — and the 2026-07-16 noindex flip made that
# page crawlable for the first time. Worse, it published a roster for a
# teardown that reports per-bank figures as "Bank A / Bank B", collapsing a
# 23-bank anonymity set to a named handful. Anonymized data plus a published
# roster is not anonymized.
echo ""
node "$ROOT/scripts/check-named.mjs"

echo "Build complete. Deploy with: npx wrangler deploy"
